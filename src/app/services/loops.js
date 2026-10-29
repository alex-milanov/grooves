import { distinctUntilChanged, map, pairwise } from 'rxjs';
import { dispatch } from 'iblokz-state';
import {
  context,
  resume,
  ensureNodes,
  applyRouting,
  getLoopSlotInput,
  syncPartLoopsMixer,
  getRecordLatencyCompensation,
  scheduleBeatClicks,
  stopBarClicks,
  createInputStream,
  createRecorder,
  decodeBlob,
  listInputDevices,
  samples,
} from './audio';
import {
  quantizeTargetSeconds,
  trimPadBuffer,
  growingRecordProgress,
} from '../util/loop-quantize';
import { barSeconds, phaseAt } from '../util/transport-clock';
import { slotPlaySchedule } from '../util/loop-record-schedule';
import { slotPlaybackTiming } from '../util/loop-playback-timing';
import { applyTempoPulseToButton } from '../util/loop-pulse';
import {
  anySlotHasContent,
  getLoopsTrack,
  getLoopSlot,
  loopBufferKey,
  LOOPS_SLOT_COUNT,
  LOOPS_TRACK_ID,
  mapLoopSlots,
  patchLoopSlot,
  slotHasContent,
} from '../state/loops';
import {
  DEFAULT_LOOP_SOURCE_BPM,
  loopPlaybackDuration,
  loopPlaybackRate,
  slotPlaybackPatch,
  slotSourceBpm,
} from '../util/loop-tempo';
import { WORKSPACE_LOOPS } from '../util/workspaces';

/** @type {Map<number, AudioBufferSourceNode[]>} */
const slotSources = new Map();
/** @type {Map<number, number>} */
const playStartTimers = new Map();
/** @type {Map<number, { recorder: ReturnType<typeof createRecorder>, timeoutId: number, autoStopId?: number }>} */
const activeRecords = new Map();
/** @type {Set<number>} */
const discardRecordings = new Set();
let inputStream = null;
let inputDeviceId = null;
let state$Ref = null;
let progressRaf = 0;

const slotProcess = (state, index) => getLoopSlot(state, index)?.process ?? 'empty';

const calcProgress = (startedAt, duration, atTime = context.currentTime) => {
  if (!startedAt || !duration) return 0;
  return phaseAt(startedAt, duration, atTime) * 100;
};

const updatePlayRecProgress = () => {
  if (!state$Ref) return;
  const state = state$Ref.getValue();
  let anyActive = false;

  for (let i = 0; i < LOOPS_SLOT_COUNT; i++) {
    const slot = getLoopSlot(state, i);
    const btn = document.querySelector(`.loop-slot[data-slot="${i}"] .play-rec`);
    if (!btn || !slot) continue;

    const { process, startedAt, duration, countInAt } = slot;
    const now = context.currentTime;

    if (process === 'play' && duration > 0) {
      anyActive = true;
      const inFade = startedAt != null && slot.partialPlay && now < startedAt - 0.001;
      btn.classList.toggle('count-in', inFade);
      if (inFade && countInAt != null) {
        const countInDuration = startedAt - countInAt;
        const pct =
          countInDuration > 0
            ? Math.min(100, Math.max(0, ((now - countInAt) / countInDuration) * 100))
            : 0;
        btn.style.setProperty('--pgPercentage', String(pct));
      } else {
        btn.style.setProperty('--pgPercentage', String(calcProgress(startedAt, duration, now)));
      }
    } else if (process === 'record' && countInAt != null && now < startedAt) {
      anyActive = true;
      btn.classList.add('count-in');
      const countInDuration = startedAt - countInAt;
      const pct =
        countInDuration > 0
          ? Math.min(100, Math.max(0, ((now - countInAt) / countInDuration) * 100))
          : 0;
      btn.style.setProperty('--pgPercentage', String(pct));
    } else if (process === 'overdub' && duration > 0 && startedAt != null) {
      anyActive = true;
      btn.classList.remove('count-in');
      btn.style.setProperty('--pgPercentage', String(calcProgress(startedAt, duration, now)));
    } else if (process === 'record' && startedAt != null) {
      anyActive = true;
      btn.classList.remove('count-in');
      // Grow 1→2→3… bars instead of wrapping every bar.
      btn.style.setProperty(
        '--pgPercentage',
        String(growingRecordProgress(startedAt, barSeconds(state.transport), now)),
      );
    } else {
      btn.classList.remove('count-in');
      btn.style.setProperty('--pgPercentage', '0');
    }

    applyTempoPulseToButton(btn, state, slot, i);
  }

  progressRaf = anyActive ? requestAnimationFrame(updatePlayRecProgress) : 0;
};

const ensureProgressLoop = () => {
  if (!progressRaf) progressRaf = requestAnimationFrame(updatePlayRecProgress);
};

const stopProgressLoop = () => {
  cancelAnimationFrame(progressRaf);
  progressRaf = 0;
};

const syncInputDevices = () =>
  listInputDevices()
    .then((devices) =>
      dispatch((s) => ({
        ...s,
        ui: {
          ...s.ui,
          loops: { ...s.ui.loops, inputDevices: devices },
        },
      })),
    )
    .catch(() => {});

const connectInput = async (deviceId = 'default') => {
  try {
    await resume();
    if (inputStream && inputDeviceId === deviceId) return inputStream;
    inputStream?.getTracks().forEach((t) => t.stop());
    inputStream = await createInputStream(deviceId);
    inputDeviceId = deviceId;
    await syncInputDevices();
    return inputStream;
  } catch (err) {
    console.warn('loop input failed:', err);
    inputStream = null;
    inputDeviceId = null;
    throw err;
  }
};

const startLayer = (
  buffer,
  slotIndex,
  when,
  sourceBpm,
  transport,
  { phase = 0, fadeUntil = null } = {},
) => {
  const input = getLoopSlotInput(slotIndex);
  if (!input) return null;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.playbackRate.value = loopPlaybackRate(sourceBpm, transport);

  const offset = Math.min(
    Math.max(0, phase * buffer.duration),
    Math.max(0, buffer.duration - 0.001),
  );
  if (fadeUntil != null && fadeUntil > when + 0.001) {
    const fade = context.createGain();
    fade.gain.setValueAtTime(0, when);
    fade.gain.linearRampToValueAtTime(1, fadeUntil);
    source.connect(fade);
    fade.connect(input);
  } else {
    source.connect(input);
  }

  source.start(when, offset);
  const list = slotSources.get(slotIndex) ?? [];
  list.push(source);
  slotSources.set(slotIndex, list);
  return source;
};

const clearPlayStartTimer = (slotIndex) => {
  const id = playStartTimers.get(slotIndex);
  if (id != null) clearTimeout(id);
  playStartTimers.delete(slotIndex);
};

const stopSlotSources = (slotIndex) => {
  clearPlayStartTimer(slotIndex);
  const sources = slotSources.get(slotIndex) ?? [];
  for (const src of sources) {
    try {
      src.stop();
    } catch (_) {
      /* already stopped */
    }
  }
  slotSources.set(slotIndex, []);
};

const startSlotPlayback = (state, slotIndex, atTime = context.currentTime) => {
  const slot = getLoopSlot(state, slotIndex);
  if (!slot || !slotHasContent(slot)) return;

  stopSlotSources(slotIndex);

  const { fadeUntil, phase, when } = slotPlaybackTiming(slot, atTime);
  const transport = state.transport;

  slot.bufferKeys.forEach((key, layerIndex) => {
    const buffer = samples.get(key);
    if (buffer) {
      startLayer(buffer, slotIndex, when, slotSourceBpm(slot, layerIndex), transport, {
        phase,
        fadeUntil,
      });
    }
  });
  ensureProgressLoop();
};

const finishRecording = async (
  state,
  slotIndex,
  blob,
  fixedDuration = null,
  leadPadSeconds = 0,
) => {
  const slotAtStart = getLoopSlot(state, slotIndex);
  try {
    const raw = await decodeBlob(blob);
    if (!raw?.length || !raw.sampleRate) {
      throw new Error('decoded recording is empty');
    }
    const transport = state.transport;
    const bar = barSeconds(transport);
    // Align to the transport grid using Web Audio's reported monitor latency only
    // (baseLatency + outputLatency). No silence chopping.
    const skipSeconds = getRecordLatencyCompensation();
    const leadPad = fixedDuration != null ? 0 : Math.max(0, leadPadSeconds);
    const measured = Math.max(0, (raw.duration || 0) - skipSeconds) + leadPad;
    const targetSeconds =
      Number.isFinite(fixedDuration) && fixedDuration > 0
        ? fixedDuration
        : quantizeTargetSeconds(measured, bar);
    const trimmed = trimPadBuffer(context, raw, targetSeconds, leadPad, skipSeconds);
    // Prefer arm snapshot; fall back to fixedDuration (overdub always passes loop length).
    const isOverdub =
      slotAtStart?.process === 'overdub' ||
      (Number.isFinite(fixedDuration) && fixedDuration > 0 && (slotAtStart?.bufferKeys?.length ?? 0) > 0);
    const layerIndex = isOverdub ? (slotAtStart?.bufferKeys?.length ?? 0) : 0;
    const key = loopBufferKey(slotIndex, layerIndex);
    samples.set(key, trimmed);
    const recordBpm = transport?.bpm ?? DEFAULT_LOOP_SOURCE_BPM;

    let skipPlaybackStart = false;
    dispatch((s) => {
      const current = getLoopSlot(s, slotIndex);
      // A newer arm (overdub/record) may have started while this take was decoding —
      // merge buffers but don't clobber that arm or cancel its MediaRecorder via pairwise.
      const liveArm =
        current?.process === 'record' || current?.process === 'overdub'
          ? current.process
          : null;
      skipPlaybackStart = liveArm != null && liveArm !== slotAtStart?.process;

      const keys = [...(current?.bufferKeys ?? [])];
      let sourceBpms = [...(current?.sourceBpms ?? [])];
      if (isOverdub) {
        if (!keys.includes(key)) {
          keys.push(key);
          sourceBpms.push(recordBpm);
        }
      } else {
        keys.length = 0;
        keys.push(key);
        sourceBpms = [recordBpm];
      }
      const primaryBuffer = samples.get(keys[0]);
      const duration = primaryBuffer
        ? loopPlaybackDuration(primaryBuffer.duration, slotSourceBpm({ sourceBpms }, 0), s.transport)
        : loopPlaybackDuration(trimmed.duration, recordBpm, s.transport);

      return patchLoopSlot(s, slotIndex, {
        bufferKeys: keys,
        sourceBpm: sourceBpms[0] ?? recordBpm,
        sourceBpms,
        duration,
        layers: keys.length,
        process: liveArm ?? 'play',
        startedAt: liveArm
          ? current.startedAt
          : (slotAtStart?.startedAt ?? context.currentTime),
        countInAt: liveArm ? current.countInAt : null,
        countInSilent: liveArm ? current.countInSilent : false,
        leadPadSeconds: 0,
      });
    });

    if (skipPlaybackStart) return;

    const next = state$Ref?.getValue();
    if (next) {
      // Use currentTime so phaseAt(startedAt, …) joins the live session cycle —
      // passing startedAt (in the past) forced phase 0 and started the buffer from the top.
      startSlotPlayback(next, slotIndex, context.currentTime);
    }
  } catch (err) {
    console.warn('loop finishRecording failed:', err);
    dispatch((s) =>
      patchLoopSlot(s, slotIndex, {
        process: slotHasContent(getLoopSlot(s, slotIndex) ?? slotAtStart) ? 'idle' : 'empty',
        countInAt: null,
        countInSilent: false,
      }),
    );
  }
};

const cancelPendingRecord = (slotIndex, { discard = true } = {}) => {
  const pending = activeRecords.get(slotIndex);
  if (!pending) return;
  if (discard) discardRecordings.add(slotIndex);
  clearTimeout(pending.timeoutId);
  if (pending.autoStopId) clearTimeout(pending.autoStopId);
  try {
    pending.recorder.stop();
  } catch (_) {
    /* noop */
  }
  activeRecords.delete(slotIndex);
};

const beginRecording = async (state, slotIndex) => {
  const slot = getLoopSlot(state, slotIndex);
  if (!slot) return;

  const track = getLoopsTrack(state);
  const deviceId = track?.loop?.inputId ?? 'default';
  // startedAt is the musical cycle origin. If it's in the past (early punch-in),
  // start capturing now and pad the gap; if in the future, wait for that downbeat.
  const cycleOrigin = slot.startedAt;

  if (track?.loop?.clickEnabled && !slot.countInSilent && slot.countInAt != null) {
    const clickEnd =
      cycleOrigin != null && cycleOrigin > context.currentTime + 0.001
        ? cycleOrigin
        : context.currentTime;
    scheduleBeatClicks(state.transport, slot.countInAt, clickEnd);
  }

  try {
    // Prefer the already-open mic; don't await getUserMedia before arming the timer
    // (that delay was eating the visual count-in / missing the punch-in on a live grid).
    const stream = inputStream ?? (await connectInput(deviceId));
    if (!stream) throw new Error('no input stream');

    const live = getLoopSlot(state$Ref?.getValue() ?? state, slotIndex);
    if (!live || (live.process !== 'record' && live.process !== 'overdub')) return;

    const origin = live.startedAt ?? cycleOrigin;
    const recorder = createRecorder(stream);
    const startAt =
      origin != null && origin > context.currentTime + 0.001 ? origin : context.currentTime;
    const delayMs = Math.max(0, (startAt - context.currentTime) * 1000);
    const isOverdub = live.process === 'overdub';
    const overdubSeconds =
      isOverdub && Number.isFinite(live.duration) && live.duration > 0 ? live.duration : 0;
    let leadPadSeconds = 0;
    let autoStopId = 0;
    const timeoutId = setTimeout(() => {
      const active = activeRecords.get(slotIndex);
      if (!active || active.recorder !== recorder) return;
      const actualStart = context.currentTime;
      leadPadSeconds =
        origin != null && actualStart > origin + 0.001 ? actualStart - origin : 0;
      try {
        recorder.start();
      } catch (err) {
        console.warn('MediaRecorder.start failed:', err);
        return;
      }
      // Schedule stop only after start — same-delay autoStop was settling an empty blob.
      if (overdubSeconds > 0) {
        autoStopId = setTimeout(() => {
          const cur = activeRecords.get(slotIndex);
          if (cur?.recorder === recorder) cur.recorder.stop();
        }, overdubSeconds * 1000);
        const cur = activeRecords.get(slotIndex);
        if (cur) cur.autoStopId = autoStopId;
      }
    }, delayMs);

    activeRecords.set(slotIndex, { recorder, timeoutId, autoStopId: 0 });
    ensureProgressLoop();

    recorder.stopped.then((blob) => {
      stopBarClicks();
      const pending = activeRecords.get(slotIndex);
      if (pending?.autoStopId) clearTimeout(pending.autoStopId);
      const discard = discardRecordings.has(slotIndex);
      discardRecordings.delete(slotIndex);
      activeRecords.delete(slotIndex);
      if (discard || !blob?.size) return;
      const fixed = overdubSeconds > 0 ? overdubSeconds : null;
      finishRecording(state, slotIndex, blob, fixed, leadPadSeconds).catch(console.warn);
    });
  } catch (err) {
    console.warn('loop record failed:', err);
    stopBarClicks();
    dispatch((s) =>
      patchLoopSlot(s, slotIndex, { process: slotHasContent(slot) ? 'idle' : 'empty' }),
    );
  }
};

const beginPlay = (state, slotIndex) => {
  const slot = getLoopSlot(state, slotIndex);
  if (!slot || !slotHasContent(slot)) return;

  const armPlayback = () => {
    resume().then(() => {
      const s = state$Ref?.getValue();
      const sl = getLoopSlot(s, slotIndex);
      if (sl?.process !== 'play' || !slotHasContent(sl)) return;
      startSlotPlayback(s, slotIndex, context.currentTime);
    });
  };

  const { when } = slotPlaybackTiming(slot, context.currentTime);
  const delayMs = Math.max(0, (when - context.currentTime) * 1000);
  if (delayMs > 1) {
    clearPlayStartTimer(slotIndex);
    playStartTimers.set(slotIndex, setTimeout(armPlayback, delayMs));
  } else {
    armPlayback();
  }
  ensureProgressLoop();
};

const handleProcessChange = (state, slotIndex, process) => {
  if (process === 'record' || process === 'overdub') {
    resume().then(() => beginRecording(state, slotIndex));
    return;
  }

  if (process === 'play') {
    if (activeRecords.has(slotIndex)) {
      const pending = activeRecords.get(slotIndex);
      clearTimeout(pending.timeoutId);
      if (pending.autoStopId) clearTimeout(pending.autoStopId);
      discardRecordings.delete(slotIndex);
      pending.recorder.stop();
    }
    if (slotHasContent(getLoopSlot(state, slotIndex))) {
      beginPlay(state, slotIndex);
    }
    return;
  }

  cancelPendingRecord(slotIndex);
  stopSlotSources(slotIndex);
  stopBarClicks();
};

const syncLoopsToTrackTransport = (state) => {
  if (!anySlotHasContent(state)) return null;
  const loopsTrack = getLoopsTrack(state);
  const trackPlaying = !!loopsTrack?.transport?.playing;

  if (trackPlaying) {
    const needsStart = loopsTrack?.loop?.slots?.some(
      (slot) => slotHasContent(slot) && slot.process === 'idle',
    );
    if (!needsStart) return null;
    return mapLoopSlots(state, (slot, i) =>
      slotHasContent(slot) && slot.process === 'idle'
        ? { ...slot, process: 'play', ...slotPlaySchedule(state, i) }
        : slot,
    );
  }

  const needsStop = loopsTrack?.loop?.slots?.some((slot) =>
    ['play', 'record', 'overdub'].includes(slot.process),
  );
  if (!needsStop) return null;

  return mapLoopSlots(state, (slot) => {
    if (slot.process === 'empty') return slot;
    return {
      ...slot,
      process: slotHasContent(slot) ? 'idle' : 'empty',
      startedAt: null,
      countInAt: null,
      countInSilent: false,
      partialPlay: false,
      leadPadSeconds: 0,
    };
  });
};

const loopsTransportKey = (state) => {
  const tr = getLoopsTrack(state)?.transport ?? {};
  return `${tr.playing}:${tr.stopPending}`;
};

const clearLoopsTrackStopPending = () =>
  dispatch((s) => ({
    ...s,
    tracks: (s.tracks ?? []).map((t) =>
      t.id === LOOPS_TRACK_ID ? { ...t, transport: { ...t.transport, stopPending: false } } : t,
    ),
  }));

const stopAllSlots = () => {
  for (let i = 0; i < LOOPS_SLOT_COUNT; i++) {
    cancelPendingRecord(i);
    stopSlotSources(i);
  }
  stopBarClicks();
  stopProgressLoop();
};

let onStop = () => {};
export const stop = () => onStop();

export const start = ({ state$ }) => {
  const subs = [];
  state$Ref = state$;

  ensureNodes(state$.getValue().routing, state$.getValue().mixer);
  applyRouting(
    state$.getValue().routing,
    state$.getValue().sequencer?.trackParams,
    state$.getValue().mixer,
    state$.getValue().partMixer,
    { reconnect: true, loopsTrack: getLoopsTrack(state$.getValue()) },
  );

  const deviceId = () => getLoopsTrack(state$Ref?.getValue())?.loop?.inputId ?? 'default';
  connectInput(deviceId()).catch(() => {});

  if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
    navigator.mediaDevices.addEventListener('devicechange', syncInputDevices);
  }

  subs.push(
    state$
      .pipe(
        map((s) => s.ui?.activeWorkspace),
        distinctUntilChanged(),
      )
      .subscribe((workspace) => {
        if (workspace === WORKSPACE_LOOPS) {
          connectInput(deviceId()).catch(() => {});
        }
      }),
  );

  subs.push(
    state$
      .pipe(
        distinctUntilChanged(
          (a, b) => getLoopsTrack(a)?.loop?.inputId === getLoopsTrack(b)?.loop?.inputId,
        ),
      )
      .subscribe(() => {
        connectInput(deviceId()).catch(() => {});
      }),
  );

  subs.push(
    state$
      .pipe(distinctUntilChanged((a, b) => a.tracks === b.tracks && a.routing === b.routing))
      .subscribe((state) => {
        const loopsTrack = getLoopsTrack(state);
        syncPartLoopsMixer(loopsTrack?.mixer);
        applyRouting(state.routing, state.sequencer?.trackParams, state.mixer, state.partMixer, {
          loopsTrack,
        });
      }),
  );

  for (let i = 0; i < LOOPS_SLOT_COUNT; i++) {
    const slotIndex = i;
    subs.push(
      state$
        .pipe(
          map((s) => slotProcess(s, slotIndex)),
          pairwise(),
        )
        .subscribe(([prev, next]) => {
          if (prev === next) return;
          handleProcessChange(state$Ref.getValue(), slotIndex, next);
        }),
    );
  }

  subs.push(
    state$
      .pipe(map(loopsTransportKey), distinctUntilChanged(), pairwise())
      .subscribe(([prevKey, key]) => {
        if (!anySlotHasContent(state$Ref.getValue())) return;

        const loopsTr = getLoopsTrack(state$Ref.getValue())?.transport ?? {};

        if (loopsTr.stopPending) {
          stopAllSlots();
          clearLoopsTrackStopPending();
          const next = syncLoopsToTrackTransport(state$Ref.getValue());
          if (next) dispatch(() => next);
          return;
        }

        const wasPlaying = prevKey.startsWith('true:');
        const isPlaying = key.startsWith('true:');
        if (wasPlaying && !isPlaying) {
          stopAllSlots();
          const next = syncLoopsToTrackTransport(state$Ref.getValue());
          if (next) dispatch(() => next);
          return;
        }

        // Only when transport *becomes* playing — not on every state$ tick while playing
        // (that was re-arming slots after per-slot stop).
        if (!wasPlaying && isPlaying) {
          const next = syncLoopsToTrackTransport(state$Ref.getValue());
          if (next) dispatch(() => next);
        }
      }),
  );

  subs.push(
    state$
      .pipe(distinctUntilChanged((a, b) => a.transport?.bpm === b.transport?.bpm))
      .subscribe((state) => {
        const loopsTrack = getLoopsTrack(state);
        const slots = loopsTrack?.loop?.slots ?? [];
        let changed = false;
        const nextSlots = slots.map((slot) => {
          if (!slotHasContent(slot)) return slot;
          const buffer = samples.get(slot.bufferKeys[0]);
          if (!buffer) return slot;
          const patch = slotPlaybackPatch(slot, state.transport, buffer);
          if (!patch) return slot;
          changed = true;
          return { ...slot, ...patch };
        });
        if (changed) {
          dispatch((s) => ({
            ...s,
            tracks: s.tracks.map((t) =>
              t.id === LOOPS_TRACK_ID ? { ...t, loop: { ...t.loop, slots: nextSlots } } : t,
            ),
          }));
        }
        const s = changed
          ? {
              ...state,
              tracks: state.tracks.map((t) =>
                t.id === LOOPS_TRACK_ID ? { ...t, loop: { ...t.loop, slots: nextSlots } } : t,
              ),
            }
          : state;
        for (let i = 0; i < LOOPS_SLOT_COUNT; i++) {
          const slot = getLoopSlot(s, i);
          if (slot?.process === 'play' && slotHasContent(slot)) {
            startSlotPlayback(s, i, context.currentTime);
          }
        }
      }),
  );

  onStop = () => {
    stopAllSlots();
    inputStream?.getTracks().forEach((t) => t.stop());
    inputStream = null;
    inputDeviceId = null;
    state$Ref = null;
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.removeEventListener('devicechange', syncInputDevices);
    }
    subs.forEach((sub) => sub.unsubscribe());
  };
};

export default {
  start,
  stop,
};
