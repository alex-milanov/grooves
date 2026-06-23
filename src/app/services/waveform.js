import WaveSurfer from 'wavesurfer.js';
import { distinctUntilChanged, map } from 'rxjs';
import {
  context,
  play,
  resume,
  sampleTriggered$,
  trackGain,
  getOutputLatency,
} from '../util/audio';
import { bufferToWav } from '../util/buffer-to-wav';
import * as samples from '../util/samples';

let ws = null;
let animRaf = 0;
let latestState = null;
let loadedKey = null;
let activeTrack = null;
/** @type {{ when: number, end: number }[]} */
let pendingTriggers = [];

const themeColors = () => {
  const root = document.querySelector('.app') || document.documentElement;
  const styles = getComputedStyle(root);
  return {
    waveColor: styles.getPropertyValue('--app-text-muted').trim() || '#888',
    progressColor: styles.getPropertyValue('--app-btn-primary-bg').trim() || '#4af',
    cursorColor: styles.getPropertyValue('--app-text').trim() || '#fff',
  };
};

const stopCursorAnimations = () => {
  cancelAnimationFrame(animRaf);
  animRaf = 0;
  pendingTriggers = [];
  if (ws) ws.setTime(0);
};

const destroyWaveform = () => {
  stopCursorAnimations();
  if (ws) {
    ws.destroy();
    ws = null;
  }
  loadedKey = null;
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

const ensureCursorLoop = () => {
  if (!animRaf) {
    animRaf = requestAnimationFrame(cursorLoop);
  }
};

const addTrigger = (when, duration, track) => {
  if (track !== activeTrack || !ws) return;
  pendingTriggers.push({ when, end: when + duration });
  ensureCursorLoop();
};

const assignmentFor = (state, track) => {
  if (track == null) return null;
  return state.sequencer.assignments?.[track] ?? null;
};

const loadAssignment = async (assignment) => {
  const container = document.querySelector('.track-settings .waveform');
  if (!container || !assignment) return;

  const key = samples.key(assignment.kit, assignment.sample);
  if (ws && loadedKey === key) return;

  const buffer = samples.get(key);
  if (!buffer) return;

  destroyWaveform();
  loadedKey = key;

  const colors = themeColors();
  ws = WaveSurfer.create({
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

  ws.setVolume(0);

  ws.on('click', () => previewCurrent());

  const blob = bufferToWav(buffer);
  await ws.loadBlob(blob);
  ws.setTime(0);
};

const applyTheme = () => {
  if (!ws) return;
  const colors = themeColors();
  ws.setOptions({
    waveColor: colors.waveColor,
    progressColor: colors.progressColor,
    cursorColor: colors.cursorColor,
  });
};

const syncWaveform = (state) => {
  latestState = state;
  const track = state.sequencer.selectedTrack;
  activeTrack = track;

  queueMicrotask(() => {
    if (track == null) {
      destroyWaveform();
      return;
    }

    const assignment = assignmentFor(state, track);
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

export const previewCurrent = () => {
  const state = latestState;
  if (!state) return;

  const track = state.sequencer.selectedTrack;
  const assignment = assignmentFor(state, track);
  if (!assignment) return;

  const buffer = samples.get(samples.key(assignment.kit, assignment.sample));
  if (!buffer) return;

  resume().then(() => {
    if (trackGain(state.sequencer.trackParams, track) === 0) return;
    const when = context.currentTime;
    play(buffer, when, track, { preview: true });
    addTrigger(when, buffer.duration, track);
  });
};

export let stop = () => {};

export const start = ({ state$ }) => {
  const subs = [];

  subs.push(
    state$
      .pipe(
        map((state) => ({
          track: state.sequencer.selectedTrack,
          assignment: assignmentFor(state, state.sequencer.selectedTrack),
          theme: `${state.themeFamily}-${state.themeMode}`,
        })),
        distinctUntilChanged(
          (a, b) =>
            a.track === b.track &&
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
        map((s) => `${s.themeFamily}-${s.themeMode}`),
        distinctUntilChanged(),
      )
      .subscribe(() => applyTheme()),
  );

  subs.push(
    sampleTriggered$.subscribe(({ when, duration, track }) => {
      addTrigger(when, duration, track);
    }),
  );

  subs.push(
    state$
      .pipe(
        map((s) => s.sequencer.playing),
        distinctUntilChanged(),
      )
      .subscribe((playing) => {
        if (!playing) stopCursorAnimations();
      }),
  );

  syncWaveform(state$.getValue());

  stop = () => {
    destroyWaveform();
    subs.forEach((sub) => sub.unsubscribe());
  };
};

export default {
  start,
  stop,
  previewCurrent,
};
