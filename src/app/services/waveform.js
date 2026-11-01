import WaveSurfer from 'wavesurfer.js';
import { distinctUntilChanged, map } from 'rxjs';
import {
  context,
  play,
  resume,
  sampleTriggered$,
  rowGain,
  getLoopSlotInput,
  getOutputLatency,
  samples,
} from './audio';
import { bufferToWav } from '../util/buffer-to-wav';
import { getLoopSlot, getSlotParams, slotHasContent } from '../state/loops';
import { getDrumsRows, rowParamsMap, rowSample } from '../state/drums';
import { slotPlaybackFromBuffer } from '../util/loop-tempo';
import { isLoopsWorkspace } from '../util/workspaces';

let ws = null;
let loopWs = null;
let animRaf = 0;
let loopAnimRaf = 0;
let latestState = null;
let loadedKey = null;
let loopLoadedKey = null;
let activeRow = null;
let activeLoopSlot = null;
/** @type {{ when: number, end: number }[]} */
let pendingTriggers = [];
/** @type {{ when: number, end: number }[]} */
let loopPendingTriggers = [];

const themeColors = () => {
  const root = document.querySelector('.app') || document.documentElement;
  const styles = getComputedStyle(root);
  return {
    waveColor: styles.getPropertyValue('--app-text-muted').trim() || '#888',
    progressColor: styles.getPropertyValue('--app-btn-primary-bg').trim() || '#4af',
    cursorColor: styles.getPropertyValue('--app-text').trim() || '#fff',
  };
};

const createWaveform = async (container, buffer, onClick) => {
  const colors = themeColors();
  const instance = WaveSurfer.create({
    container,
    height: 80,
    waveColor: colors.waveColor,
    progressColor: colors.progressColor,
    cursorColor: colors.cursorColor,
    cursorWidth: 2,
    barWidth: 2,
    barGap: 1,
    normalize: true,
    interact: true,
    dragToSeek: false,
  });
  instance.setVolume(0);
  if (onClick) instance.on('click', onClick);
  const blob = bufferToWav(buffer);
  await instance.loadBlob(blob);
  instance.setTime(0);
  return instance;
};

const stopCursorAnimations = () => {
  cancelAnimationFrame(animRaf);
  animRaf = 0;
  pendingTriggers = [];
  if (ws) ws.setTime(0);
};

const stopLoopCursorAnimations = () => {
  cancelAnimationFrame(loopAnimRaf);
  loopAnimRaf = 0;
  loopPendingTriggers = [];
  if (loopWs) loopWs.setTime(0);
};

const destroyWaveform = () => {
  stopCursorAnimations();
  if (ws) {
    ws.destroy();
    ws = null;
  }
  loadedKey = null;
};

const destroyLoopWaveform = () => {
  stopLoopCursorAnimations();
  if (loopWs) {
    loopWs.destroy();
    loopWs = null;
  }
  loopLoadedKey = null;
};

const cursorLoop = () => {
  if (!ws) {
    animRaf = 0;
    return;
  }

  const now = context.currentTime;
  const latency = getOutputLatency(context);
  const heardNow = now - latency;
  pendingTriggers = pendingTriggers.filter((t) => t.end > heardNow);

  const active = pendingTriggers
    .filter((t) => heardNow >= t.when)
    .sort((a, b) => b.when - a.when)[0];

  if (active) {
    ws.setTime(Math.min(heardNow - active.when, active.end - active.when));
  } else if (pendingTriggers.length) {
    ws.setTime(0);
  }

  if (pendingTriggers.some((t) => t.end > heardNow)) {
    animRaf = requestAnimationFrame(cursorLoop);
  } else {
    animRaf = 0;
    pendingTriggers = [];
  }
};

const loopCursorLoop = () => {
  if (!loopWs) {
    loopAnimRaf = 0;
    return;
  }

  const now = context.currentTime;
  const latency = getOutputLatency(context);
  const heardNow = now - latency;
  loopPendingTriggers = loopPendingTriggers.filter((t) => t.end > heardNow);

  const active = loopPendingTriggers
    .filter((t) => heardNow >= t.when)
    .sort((a, b) => b.when - a.when)[0];

  if (active) {
    loopWs.setTime(Math.min(heardNow - active.when, active.end - active.when));
  } else if (loopPendingTriggers.length) {
    loopWs.setTime(0);
  }

  if (loopPendingTriggers.some((t) => t.end > heardNow)) {
    loopAnimRaf = requestAnimationFrame(loopCursorLoop);
  } else {
    loopAnimRaf = 0;
    loopPendingTriggers = [];
  }
};

const ensureCursorLoop = () => {
  if (!animRaf) animRaf = requestAnimationFrame(cursorLoop);
};

const ensureLoopCursorLoop = () => {
  if (!loopAnimRaf) loopAnimRaf = requestAnimationFrame(loopCursorLoop);
};

const addTrigger = (when, duration, row) => {
  if (row !== activeRow || !ws) return;
  pendingTriggers.push({ when, end: when + duration });
  ensureCursorLoop();
};

const addLoopTrigger = (when, duration, slot) => {
  if (slot !== activeLoopSlot || !loopWs) return;
  loopPendingTriggers.push({ when, end: when + duration });
  ensureLoopCursorLoop();
};

const assignmentFor = (state, row) => {
  if (row == null) return null;
  return rowSample(getDrumsRows(state)[row]);
};

const drumsUi = (state) => state.ui?.drums ?? {};

const loopBufferKeyFor = (state, slotIndex) => {
  const slot = getLoopSlot(state, slotIndex);
  return slot?.bufferKeys?.[0] ?? null;
};

const loadAssignment = async (assignment) => {
  const container = document.querySelector('.settings:not(.loop-slot-settings) .waveform');
  if (!container || !assignment) return;

  const key = samples.key(assignment.kit, assignment.sample);
  if (ws && loadedKey === key) return;

  const buffer = samples.get(key);
  if (!buffer) return;

  destroyWaveform();
  loadedKey = key;
  ws = await createWaveform(container, buffer, () => previewCurrent());
};

const loadLoopBuffer = async (bufferKey) => {
  const container = document.querySelector('.loop-slot-settings .waveform');
  if (!container || !bufferKey) return;

  if (loopWs && loopLoadedKey === bufferKey) return;

  const buffer = samples.get(bufferKey);
  if (!buffer) return;

  destroyLoopWaveform();
  loopLoadedKey = bufferKey;
  loopWs = await createWaveform(container, buffer, () => previewLoopSlot());
};

const applyTheme = () => {
  const colors = themeColors();
  if (ws) {
    ws.setOptions({
      waveColor: colors.waveColor,
      progressColor: colors.progressColor,
      cursorColor: colors.cursorColor,
    });
  }
  if (loopWs) {
    loopWs.setOptions({
      waveColor: colors.waveColor,
      progressColor: colors.progressColor,
      cursorColor: colors.cursorColor,
    });
  }
};

const syncWaveform = (state) => {
  latestState = state;
  const row = drumsUi(state).selectedRow;
  activeRow = row;

  queueMicrotask(() => {
    if (isLoopsWorkspace(state)) {
      destroyWaveform();
      return;
    }
    if (row == null) {
      destroyWaveform();
      return;
    }

    const assignment = assignmentFor(state, row);
    if (!assignment) {
      destroyWaveform();
      return;
    }

    const key = samples.key(assignment.kit, assignment.sample);
    if (ws && loadedKey === key) {
      applyTheme();
      return;
    }

    loadAssignment(assignment);
  });
};

const syncLoopWaveform = (state) => {
  latestState = state;
  const slotIndex = state.ui?.loops?.selectedSlot;
  activeLoopSlot = slotIndex;

  queueMicrotask(() => {
    if (!isLoopsWorkspace(state)) {
      destroyLoopWaveform();
      return;
    }
    if (slotIndex == null) {
      destroyLoopWaveform();
      return;
    }

    const slot = getLoopSlot(state, slotIndex);
    if (!slotHasContent(slot)) {
      destroyLoopWaveform();
      return;
    }

    const bufferKey = loopBufferKeyFor(state, slotIndex);
    if (loopWs && loopLoadedKey === bufferKey) {
      applyTheme();
      return;
    }

    loadLoopBuffer(bufferKey);
  });
};

export const previewCurrent = () => {
  const state = latestState;
  if (!state) return;

  const row = drumsUi(state).selectedRow;
  const assignment = assignmentFor(state, row);
  if (!assignment) return;

  const buffer = samples.get(samples.key(assignment.kit, assignment.sample));
  if (!buffer) {
    console.warn('preview: missing buffer', assignment.kit, assignment.sample);
    return;
  }

  resume().then(() => {
    const params = rowParamsMap(state);
    if (rowGain(params, row) === 0) return;
    const when = context.currentTime;
    play(buffer, when, row, { preview: true });
    addTrigger(when, buffer.duration, row);
  });
};

export const previewLoopSlot = () => {
  const state = latestState;
  if (!state) return;

  const slotIndex = state.ui?.loops?.selectedSlot;
  const slot = slotIndex != null ? getLoopSlot(state, slotIndex) : null;
  const bufferKey = slot?.bufferKeys?.[0];
  const buffer = bufferKey ? samples.get(bufferKey) : null;
  if (!buffer || slotIndex == null) return;

  resume().then(() => {
    const params = getSlotParams(slot);
    if (params.muted || params.volume === 0) return;
    const out = getLoopSlotInput(slotIndex);
    if (!out) return;
    const when = context.currentTime;
    const { rate, duration } = slotPlaybackFromBuffer(buffer, slot, state.transport);
    const src = context.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    src.connect(out);
    src.start(when);
    addLoopTrigger(when, duration, slotIndex);
  });
};

let onStop = () => {};
export const stop = () => onStop();

export const start = ({ state$ }) => {
  const subs = [];

  subs.push(
    state$
      .pipe(
        map((state) => ({
          workspace: state.ui?.activeWorkspace,
          row: drumsUi(state).selectedRow,
          assignment: assignmentFor(state, drumsUi(state).selectedRow),
          theme: `${state.themeFamily}-${state.themeMode}`,
        })),
        distinctUntilChanged(
          (a, b) =>
            a.workspace === b.workspace &&
            a.row === b.row &&
            a.assignment?.kit === b.assignment?.kit &&
            a.assignment?.sample === b.assignment?.sample &&
            a.theme === b.theme,
        ),
      )
      .subscribe(() => syncWaveform(state$.getValue())),
  );

  subs.push(
    state$
      .pipe(
        map((state) => ({
          workspace: state.ui?.activeWorkspace,
          slot: state.ui?.loops?.selectedSlot,
          bufferKey: loopBufferKeyFor(state, state.ui?.loops?.selectedSlot),
          theme: `${state.themeFamily}-${state.themeMode}`,
        })),
        distinctUntilChanged(
          (a, b) =>
            a.workspace === b.workspace &&
            a.slot === b.slot &&
            a.bufferKey === b.bufferKey &&
            a.theme === b.theme,
        ),
      )
      .subscribe(() => syncLoopWaveform(state$.getValue())),
  );

  subs.push(
    state$
      .pipe(
        map((s) => `${s.themeFamily}-${s.themeMode}`),
        distinctUntilChanged(),
      )
      .subscribe(() => applyTheme()),
  );

  subs.push(
    sampleTriggered$.subscribe(({ when, duration, row }) => {
      addTrigger(when, duration, row);
    }),
  );

  subs.push(
    state$
      .pipe(
        map((s) => s.transport?.playing),
        distinctUntilChanged(),
      )
      .subscribe((playing) => {
        if (!playing) stopCursorAnimations();
      }),
  );

  syncWaveform(state$.getValue());
  syncLoopWaveform(state$.getValue());

  onStop = () => {
    destroyWaveform();
    destroyLoopWaveform();
    subs.forEach((sub) => sub.unsubscribe());
  };
};

export default {
  start,
  stop,
  previewCurrent,
  previewLoopSlot,
};
