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
import { isDrumsWorkspace, isLoopsWorkspace } from '../state/ui';
import { afterPaint } from '../util/transition';
import { frame } from '../util/time';

const DRUMS_WAVE_SEL = '.settings:not(.loop-slot-settings) .waveform';
const LOOP_WAVE_SEL = '.loop-slot-settings .waveform';

/** True if WaveSurfer is still mounted in a live container (survives workspace DOM swaps). */
const instanceInContainer = (instance, selector) => {
  if (!instance) return false;
  const container = document.querySelector(selector);
  if (!container?.isConnected) return false;
  const wrapper = typeof instance.getWrapper === 'function' ? instance.getWrapper() : null;
  return !!(wrapper?.isConnected && container.contains(wrapper));
};

let ws = null;
let loopWs = null;
let cursorSub = null;
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

const stopCursorClock = () => {
  cursorSub?.unsubscribe();
  cursorSub = null;
};

const stopCursorAnimations = () => {
  pendingTriggers = [];
  if (!loopPendingTriggers.length) stopCursorClock();
  if (ws) ws.setTime(0);
};

const stopLoopCursorAnimations = () => {
  loopPendingTriggers = [];
  if (!pendingTriggers.length) stopCursorClock();
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

/** Advance one wavesurfer cursor; returns remaining live triggers. */
const tickWaveCursor = (instance, triggers) => {
  if (!instance) return [];
  const heardNow = context.currentTime - getOutputLatency(context);
  const live = triggers.filter((t) => t.end > heardNow);
  const active = live.filter((t) => heardNow >= t.when).sort((a, b) => b.when - a.when)[0];
  if (active) {
    instance.setTime(Math.min(heardNow - active.when, active.end - active.when));
  } else {
    instance.setTime(0);
  }
  return live;
};

const onCursorFrame = () => {
  pendingTriggers = tickWaveCursor(ws, pendingTriggers);
  loopPendingTriggers = tickWaveCursor(loopWs, loopPendingTriggers);
  if (!pendingTriggers.length && !loopPendingTriggers.length) stopCursorClock();
};

const ensureCursorClock = () => {
  if (cursorSub) return;
  cursorSub = frame().subscribe(onCursorFrame);
};

const addTrigger = (when, duration, row) => {
  if (row !== activeRow || !ws) return;
  pendingTriggers.push({ when, end: when + duration });
  ensureCursorClock();
};

const addLoopTrigger = (when, duration, slot) => {
  if (slot !== activeLoopSlot || !loopWs) return;
  loopPendingTriggers.push({ when, end: when + duration });
  ensureCursorClock();
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
  const container = document.querySelector(DRUMS_WAVE_SEL);
  if (!container || !assignment) return;

  const key = samples.key(assignment.kit, assignment.sample);
  if (ws && loadedKey === key && instanceInContainer(ws, DRUMS_WAVE_SEL)) return;

  const buffer = samples.get(key);
  if (!buffer) return;

  destroyWaveform();
  loadedKey = key;
  ws = await createWaveform(container, buffer, () => previewCurrent());
};

const loadLoopBuffer = async (bufferKey) => {
  const container = document.querySelector(LOOP_WAVE_SEL);
  if (!container || !bufferKey) return;

  if (loopWs && loopLoadedKey === bufferKey && instanceInContainer(loopWs, LOOP_WAVE_SEL)) {
    return;
  }

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

  // Wait for workspace VDOM (RAF patch) — microtask runs before the new .waveform exists.
  afterPaint().then(() => {
    const s = latestState ?? state;
    if (!isDrumsWorkspace(s)) {
      destroyWaveform();
      return;
    }
    const selected = drumsUi(s).selectedRow;
    activeRow = selected;
    if (selected == null) {
      destroyWaveform();
      return;
    }

    const assignment = assignmentFor(s, selected);
    if (!assignment) {
      destroyWaveform();
      return;
    }

    const key = samples.key(assignment.kit, assignment.sample);
    if (ws && loadedKey === key && instanceInContainer(ws, DRUMS_WAVE_SEL)) {
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

  afterPaint().then(() => {
    const s = latestState ?? state;
    if (!isLoopsWorkspace(s)) {
      destroyLoopWaveform();
      return;
    }
    const selected = s.ui?.loops?.selectedSlot;
    activeLoopSlot = selected;
    if (selected == null) {
      destroyLoopWaveform();
      return;
    }

    const slot = getLoopSlot(s, selected);
    if (!slotHasContent(slot)) {
      destroyLoopWaveform();
      return;
    }

    const bufferKey = loopBufferKeyFor(s, selected);
    if (loopWs && loopLoadedKey === bufferKey && instanceInContainer(loopWs, LOOP_WAVE_SEL)) {
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
