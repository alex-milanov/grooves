import { distinctUntilChanged, map, pairwise } from 'rxjs';
import { dispatch } from 'iblokz-state';
import {
  context,
  resume,
  ensureNodes,
  applyRouting,
  getLoopSlotInput,
  syncPartLoopsMixer,
} from '../util/audio';
import { quantizeTargetSeconds, trimPadBuffer } from '../util/loop-quantize';
import { barSeconds, phaseAt } from '../util/transport-clock';
import { scheduleBeatClicks, stopBarClicks } from '../util/loop-click';
import { slotPlaySchedule } from '../util/loop-record-schedule';
import { slotPlaybackTiming } from '../util/loop-playback-timing';
import { applyTempoPulseToButton } from '../util/loop-pulse';
import { createInputStream, createRecorder, decodeBlob, listInputDevices } from '../util/recording';
import {
  anySlotHasContent,
  getLoopsTrack,
  getLoopSlot,
  loopBufferKey,
  LOOPS_SLOT_COUNT,
  mapLoopSlots,
  patchLoopSlot,
  slotHasContent,
} from '../util/loops-state';
import {
  DEFAULT_LOOP_SOURCE_BPM,
  loopPlaybackDuration,
  loopPlaybackRate,
  slotPlaybackPatch,
  slotSourceBpm,
} from '../util/loop-tempo';
import { LOOPS_TRACK_ID } from '../util/session-transport';
import { WORKSPACE_LOOPS } from '../util/workspaces';
import * as samples from '../util/samples';

/** @type {Map<number, AudioBufferSourceNode[]>} */
const slotSources = new Map();
/** @type {Map<number, number>} */
const playStartTimers = new Map();
/** @type {Map<number, { recorder: ReturnType<typeof createRecorder>, timeoutId: number }>} */
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
      const inFade =
        startedAt != null &&
        slot.partialPlay &&
        now < startedAt - 0.001;
      btn.classList.toggle('count-in', inFade);
      btn.style.setProperty('--pgPercentage', String(calcProgress(startedAt, duration)));
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
      const elapsed = Math.max(0, now - startedAt);
      btn.style.setProperty('--pgPercentage', String(Math.min(100, (elapsed / duration) * 100)));
    } else if (process === 'record') {
      anyActive = true;
      btn.classList.remove('count-in');
      btn.style.setProperty('--pgPercentage', '0');
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

const startLayer = (buffer, slotIndex, when, sourceBpm, transport, { phase = 0, fadeUntil = null } = {}) => {
  const input = getLoopSlotInput(slotIndex);
  if (!input) return null;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.playbackRate.value = loopPlaybackRate(sourceBpm, transport);

  const offset = Math.min(Math.max(0, phase * buffer.duration), Math.max(0, buffer.duration - 0.001));
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

const finishRecording = async (state, slotIndex, blob, fixedDuration = null) => {
  const raw = await decodeBlob(blob);
  const transport = state.transport;
  const bar = barSeconds(transport);
  const slot = getLoopSlot(state, slotIndex);
  const targetSeconds = fixedDuration ?? quantizeTargetSeconds(raw.duration, bar);
  const trimmed = trimPadBuffer(context, raw, targetSeconds);
  const layerIndex = slot?.process === 'overdub' ? (slot?.bufferKeys?.length ?? 0) : 0;
  const key = loopBufferKey(slotIndex, layerIndex);
  samples.set(key, trimmed);
  const recordBpm = transport?.bpm ?? DEFAULT_LOOP_SOURCE_BPM;
  const isOverdub = slot?.process === 'overdub';

  dispatch((s) => {
    const current = getLoopSlot(s, slotIndex);
    const keys = [...(current?.bufferKeys ?? [])];
    let sourceBpms = [...(current?.sourceBpms ?? [])];
    if (isOverdub) {
      keys.push(key);
      sourceBpms.push(recordBpm);
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
      process: 'play',
      startedAt: slot?.startedAt ?? context.currentTime,
      countInAt: null,
      countInSilent: false,
    });
  });

  const next = state$Ref?.getValue();
  if (next) {
    const updated = getLoopSlot(next, slotIndex);
    startSlotPlayback(next, slotIndex, updated?.startedAt ?? context.currentTime);
  }
};

const cancelPendingRecord = (slotIndex, { discard = true } = {}) => {
  const pending = activeRecords.get(slotIndex);
  if (!pending) return;
  if (discard) discardRecordings.add(slotIndex);
  clearTimeout(pending.timeoutId);
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
  const recordAt = slot.startedAt ?? context.currentTime;
  const delayMs = Math.max(0, (recordAt - context.currentTime) * 1000);

  if (track?.loop?.clickEnabled && !slot.countInSilent && slot.countInAt != null) {
    scheduleBeatClicks(state.transport, slot.countInAt, recordAt);
  }

  try {
    const stream = inputStream ?? (await connectInput(deviceId));
    const recorder = createRecorder(stream);
    const timeoutId = setTimeout(() => recorder.start(), delayMs);

    activeRecords.set(slotIndex, { recorder, timeoutId });
    ensureProgressLoop();

    const isOverdub = slot.process === 'overdub';

    recorder.stopped.then((blob) => {
      stopBarClicks();
      const discard = discardRecordings.has(slotIndex);
      discardRecordings.delete(slotIndex);
      activeRecords.delete(slotIndex);
      if (discard || !blob?.size) return;
      const fixed = isOverdub ? slot.duration : null;
      finishRecording(state, slotIndex, blob, fixed).catch(console.warn);
    });

    if (isOverdub) {
      const autoStopMs = delayMs + slot.duration * 1000;
      setTimeout(() => {
        const active = activeRecords.get(slotIndex);
        if (active?.recorder) active.recorder.stop();
      }, autoStopMs);
    }
  } catch (err) {
    console.warn('loop record failed:', err);
    stopBarClicks();
    dispatch(patchLoopSlot(state, slotIndex, { process: slotHasContent(slot) ? 'idle' : 'empty' }));
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
    playStartTimers.set(
      slotIndex,
      setTimeout(armPlayback, delayMs),
    );
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
      discardRecordings.delete(slotIndex);
      activeRecords.get(slotIndex).recorder.stop();
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

export let stop = () => {};

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
      .pipe(
        map(loopsTransportKey),
        pairwise(),
      )
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

        if (isPlaying) {
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
          ? { ...state, tracks: state.tracks.map((t) => (t.id === LOOPS_TRACK_ID ? { ...t, loop: { ...t.loop, slots: nextSlots } } : t)) }
          : state;
        for (let i = 0; i < LOOPS_SLOT_COUNT; i++) {
          const slot = getLoopSlot(s, i);
          if (slot?.process === 'play' && slotHasContent(slot)) {
            startSlotPlayback(s, i, context.currentTime);
          }
        }
      }),
  );

  stop = () => {
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
