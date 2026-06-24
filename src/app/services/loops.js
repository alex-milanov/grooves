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
import { barSeconds } from '../util/transport-clock';
import { scheduleBeatClicks, stopBarClicks } from '../util/loop-click';
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
import { WORKSPACE_LOOPS } from '../util/workspaces';
import * as samples from '../util/samples';

/** @type {Map<number, AudioBufferSourceNode[]>} */
const slotSources = new Map();
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
  return (((atTime - startedAt) % duration) / duration) * 100;
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
      btn.classList.remove('count-in');
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

const startLayer = (buffer, slotIndex, when) => {
  const input = getLoopSlotInput(slotIndex);
  if (!input) return null;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(input);
  source.start(when);
  const list = slotSources.get(slotIndex) ?? [];
  list.push(source);
  slotSources.set(slotIndex, list);
  return source;
};

const stopSlotSources = (slotIndex) => {
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

const startSlotPlayback = (state, slotIndex, when = context.currentTime) => {
  const slot = getLoopSlot(state, slotIndex);
  if (!slot || !slotHasContent(slot)) return;

  stopSlotSources(slotIndex);

  const { duration, startedAt } = slot;
  const phase = startedAt != null && duration ? ((when - startedAt) % duration) / duration : 0;
  const layerStart = when - phase * duration;

  for (const key of slot.bufferKeys) {
    const buffer = samples.get(key);
    if (buffer) startLayer(buffer, slotIndex, layerStart);
  }
  ensureProgressLoop();
};

const finishRecording = async (state, slotIndex, blob, fixedDuration = null) => {
  const raw = await decodeBlob(blob);
  const bar = barSeconds(state.transport);
  const slot = getLoopSlot(state, slotIndex);
  const targetSeconds = fixedDuration ?? quantizeTargetSeconds(raw.duration, bar);
  const trimmed = trimPadBuffer(context, raw, targetSeconds);
  const layerIndex = slot?.process === 'overdub' ? (slot?.bufferKeys?.length ?? 0) : 0;
  const key = loopBufferKey(slotIndex, layerIndex);
  samples.set(key, trimmed);

  dispatch((s) => {
    const current = getLoopSlot(s, slotIndex);
    const keys = [...(current?.bufferKeys ?? [])];
    if (current?.process === 'overdub' || slot?.process === 'overdub') {
      keys.push(key);
    } else {
      keys.length = 0;
      keys.push(key);
    }
    return patchLoopSlot(s, slotIndex, {
      bufferKeys: keys,
      duration: trimmed.duration,
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
      resume().then(() => {
        const slot = getLoopSlot(state$Ref.getValue(), slotIndex);
        startSlotPlayback(state$Ref.getValue(), slotIndex, slot?.startedAt ?? context.currentTime);
      });
    }
    ensureProgressLoop();
    return;
  }

  cancelPendingRecord(slotIndex);
  stopSlotSources(slotIndex);
};

const syncLoopsToSession = (state) => {
  if (!anySlotHasContent(state)) return null;

  if (state.transport?.playing) {
    const needsStart = getLoopsTrack(state)?.loop?.slots?.some(
      (slot) => slotHasContent(slot) && slot.process === 'idle',
    );
    if (!needsStart) return null;
    const now = context.currentTime;
    return mapLoopSlots(state, (slot) =>
      slotHasContent(slot) && slot.process === 'idle'
        ? { ...slot, process: 'play', startedAt: now }
        : slot,
    );
  }

  const needsStop = getLoopsTrack(state)?.loop?.slots?.some((slot) =>
    ['play', 'record', 'overdub'].includes(slot.process),
  );
  if (!needsStop) return null;

  return mapLoopSlots(state, (slot) => {
    if (slot.process === 'empty') return slot;
    return {
      ...slot,
      process: slotHasContent(slot) ? 'idle' : 'empty',
      countInAt: null,
      countInSilent: false,
    };
  });
};

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
      .pipe(distinctUntilChanged((a, b) => a.transport?.playing === b.transport?.playing))
      .subscribe((state) => {
        if (!anySlotHasContent(state)) return;

        if (!state.transport?.playing) {
          stopAllSlots();
        }

        const next = syncLoopsToSession(state);
        if (next) dispatch(() => next);
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
