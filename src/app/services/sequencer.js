import { distinctUntilChanged, filter, pairwise } from 'rxjs';
import { dispatch } from 'iblokz-state';
import { patch } from '../state';
import {
  context,
  play,
  resume,
  cancelScheduledAfter,
  cancelAllScheduled,
  getOutputLatency,
  samples,
  setPartDrumsGain,
  fadePartDrumsIn,
} from './audio';
import {
  getTransportStartTime,
  nextTransportStart,
  resetTransportStartTime,
  setTransportStartTime,
} from './audio/clock';
import {
  stepTime,
  transportStartFromLoopPhase,
  barSeconds,
  nextLoopBarTime,
} from '../util/transport-clock';
import { CYCLE_EDGE } from '../util/loop-quantize';
import { DRUMS_TRACK_ID, isTrackScheduling } from '../state/transport';
import { totalSteps, clearCuedBar } from '../state/sequencer';
import { barCount, measuresList } from '../state/sequencer-measures';
import {
  drumsRowCount,
  getDrumsPattern,
  getDrumsTrack,
  rowSample,
} from '../state/drums';
import { getActiveLoopCycle } from '../state/loops';

const drumsUi = (state) => state.ui?.drums ?? {};

const patchDrumsUi = (state, patch) => ({
  ...state,
  ui: {
    ...state.ui,
    drums: { ...drumsUi(state), ...patch },
  },
});

const SCHEDULE_INTERVAL_MS = 25;

let state$Ref = null;
let intervalId = 0;
let rafId = 0;
let latestCycle = -1;
let lastPlayhead = -1;
let lastPlayBar = -1;
let cueBoundaryAt = null;
let cueTargetBar = null;
let cueUiHoldStep = null;
/** Measure played by audio cycle 0. */
let barAtCycle0 = 0;

const stepCount = (state) => totalSteps(state);
const cycleDuration = (state) => stepTime(state.transport.bpm) * stepCount(state);

const barForCycle = (state, cycle) => {
  const bars = Math.max(1, barCount(state));
  return (((barAtCycle0 % bars) + cycle) % bars + bars) % bars;
};

const audioCycleTiming = (state) => {
  const steps = stepCount(state);
  const duration = cycleDuration(state);
  const dt = stepTime(state.transport.bpm);
  const now = context.currentTime;
  const startTime = getTransportStartTime();
  const cycle = Math.floor((now - startTime) / duration);
  const playhead = Math.floor((((now - startTime) % duration) / duration) * steps);
  const cycleBase = startTime + cycle * duration;
  const rescheduleFrom = Math.min(playhead + 1, steps);
  return {
    cycle,
    playhead,
    playBar: barForCycle(state, Math.max(0, cycle)),
    steps,
    rescheduleFrom,
    cutoffTime: cycleBase + rescheduleFrom * dt,
    cycleBase,
    duration,
  };
};

const uiTiming = (state) => {
  const steps = stepCount(state);
  const duration = cycleDuration(state);
  const uiStart = getTransportStartTime() + getOutputLatency(context);
  const now = context.currentTime;
  if (now < uiStart) return { playhead: -1, playBar: barAtCycle0 };
  const cycle = Math.floor((now - uiStart) / duration);
  const playhead = Math.floor((((now - uiStart) % duration) / duration) * steps);
  return { playhead, playBar: barForCycle(state, Math.max(0, cycle)) };
};

const playStepAt = (state, bar, step, when) => {
  const rowCount = drumsRowCount(state);
  const measure = measuresList(state)[bar] ?? {};
  for (let row = 0; row < rowCount; row++) {
    if (!measure[row]?.[step]) continue;
    const assignment = rowSample(getDrumsTrack(state)?.rows?.[row]);
    if (!assignment) continue;
    const buffer = samples.get(samples.key(assignment.kit, assignment.sample));
    if (!buffer) {
      console.warn('sequencer: missing buffer', assignment.kit, assignment.sample);
      continue;
    }
    play(buffer, when, row);
  }
};

/** Schedule one bar-cycle of hits. */
const scheduleCycle = (state, cycle, fromStep = 0) => {
  if (!isTrackScheduling(state, DRUMS_TRACK_ID)) return;
  const steps = stepCount(state);
  const dt = stepTime(state.transport.bpm);
  const base = getTransportStartTime() + cycle * cycleDuration(state);
  const now = context.currentTime;
  const bar = barForCycle(state, cycle);
  for (let step = fromStep; step < steps; step++) {
    const when = base + step * dt;
    if (when <= now) continue;
    playStepAt(state, bar, step, when);
  }
};

const runScheduling = (state) => {
  if (!isTrackScheduling(state, DRUMS_TRACK_ID)) return;
  const { cycle, duration } = audioCycleTiming(state);

  if (latestCycle === -1) {
    const c = Math.max(0, cycle);
    scheduleCycle(state, c);
    if (drumsUi(state).cuedBar == null) {
      scheduleCycle(state, c + 1);
      latestCycle = c + 1;
    } else {
      latestCycle = c;
    }
    return;
  }

  if (cycle > latestCycle) {
    scheduleCycle(state, cycle);
    if (drumsUi(state).cuedBar == null) {
      scheduleCycle(state, cycle + 1);
      latestCycle = cycle + 1;
    } else {
      latestCycle = cycle;
    }
    return;
  }

  if (cycle === latestCycle && drumsUi(state).cuedBar == null) {
    const progress =
      (context.currentTime - getTransportStartTime() - cycle * duration) / duration;
    if (progress > 0.7) {
      scheduleCycle(state, cycle + 1);
      latestCycle = cycle + 1;
    }
  }
};

const clearCueArm = () => {
  cueBoundaryAt = null;
  cueTargetBar = null;
};

const jumpToBarAt = (state, bar) => {
  const now = context.currentTime;
  barAtCycle0 = bar;
  setTransportStartTime(now + 0.005);
  cancelScheduledAfter(now);

  const cleared = patchDrumsUi(state, { cuedBar: null });
  latestCycle = -1;
  scheduleCycle(cleared, 0, 0);
  latestCycle = 0;
  clearCueArm();
  cueUiHoldStep = 0;
  lastPlayhead = 0;
  lastPlayBar = bar;

  dispatch((s) => ({
    ...patchDrumsUi(s, { cuedBar: null, currentBar: bar }),
    transport: { ...s.transport, playhead: 0 },
  }));
};

const honorCue = (state) => {
  if (drumsUi(state).cuedBar == null || cueBoundaryAt == null || cueTargetBar == null) {
    if (drumsUi(state).cuedBar == null) clearCueArm();
    return;
  }
  if (context.currentTime + 0.001 < cueBoundaryAt) return;
  jumpToBarAt(state, cueTargetBar);
};

const armCue = (state) => {
  if (drumsUi(state).cuedBar == null) return;
  const { playhead, cycle, cutoffTime, rescheduleFrom, steps, duration, cycleBase } =
    audioCycleTiming(state);
  if (playhead < 0) return;

  cueBoundaryAt = cycleBase + duration;
  cueTargetBar = drumsUi(state).cuedBar;
  cancelScheduledAfter(cutoffTime);
  latestCycle = cycle;
  if (rescheduleFrom < steps) scheduleCycle(state, cycle, rescheduleFrom);
};

const updatePlayhead = (state) => {
  let { playhead, playBar } = uiTiming(state);
  if (playhead < 0) return;

  if (cueUiHoldStep != null) {
    if (playhead < cueUiHoldStep) playhead = cueUiHoldStep;
    else cueUiHoldStep = null;
  }

  if (playhead === lastPlayhead && playBar === lastPlayBar) return;
  lastPlayhead = playhead;
  lastPlayBar = playBar;
  dispatch((s) => {
    // Advance currentBar with play unless a cue is holding the from-bar.
    const hold = drumsUi(s).cuedBar != null;
    const patch = hold ? {} : { currentBar: playBar };
    return {
      ...patchDrumsUi(s, patch),
      transport: { ...s.transport, playhead },
    };
  });
};

const transportTick = (state$, { updateUi = false } = {}) => {
  const state = state$.getValue();
  if (!isTrackScheduling(state, DRUMS_TRACK_ID)) return;
  honorCue(state);
  runScheduling(state$Ref?.getValue() ?? state);
  if (updateUi) updatePlayhead(state$Ref?.getValue() ?? state);
};

const stopRaf = () => {
  cancelAnimationFrame(rafId);
  rafId = 0;
};
const stopInterval = () => {
  clearInterval(intervalId);
  intervalId = 0;
};
const stopLoops = () => {
  stopRaf();
  stopInterval();
};

const rafLoop = () => {
  if (!state$Ref) return;
  transportTick(state$Ref, { updateUi: true });
  if (isTrackScheduling(state$Ref.getValue(), DRUMS_TRACK_ID) && !document.hidden) {
    rafId = requestAnimationFrame(rafLoop);
  } else {
    rafId = 0;
  }
};

const startRaf = () => {
  if (rafId || document.hidden || !isTrackScheduling(state$Ref?.getValue(), DRUMS_TRACK_ID)) {
    return;
  }
  rafId = requestAnimationFrame(rafLoop);
};

const startInterval = () => {
  if (intervalId || !state$Ref) return;
  intervalId = setInterval(() => {
    if (state$Ref) transportTick(state$Ref, { updateUi: false });
  }, SCHEDULE_INTERVAL_MS);
};

const onVisibilityChange = () => {
  if (!isTrackScheduling(state$Ref?.getValue(), DRUMS_TRACK_ID)) return;
  if (document.hidden) {
    stopRaf();
    return;
  }
  resume().then(() => {
    transportTick(state$Ref, { updateUi: true });
    startRaf();
  });
};

const clearDrumsStopPending = () =>
  dispatch((s) => ({
    ...s,
    tracks: (s.tracks ?? []).map((t) =>
      t.id === DRUMS_TRACK_ID ? { ...t, transport: { ...t.transport, stopPending: false } } : t,
    ),
  }));

const transportChanged = (a, b) =>
  a.transport?.bpm === b.transport?.bpm &&
  a.transport?.timeSignature?.[0] === b.transport?.timeSignature?.[0] &&
  a.transport?.timeSignature?.[1] === b.transport?.timeSignature?.[1] &&
  a.transport?.resolution === b.transport?.resolution &&
  measuresList(a).length === measuresList(b).length;

const rescheduleRemainder = (state) => {
  const { cycle, cutoffTime, rescheduleFrom, steps } = audioCycleTiming(state);
  cancelScheduledAfter(cutoffTime);
  if (rescheduleFrom < steps) scheduleCycle(state, cycle, rescheduleFrom);
  if (drumsUi(state).cuedBar == null) {
    scheduleCycle(state, cycle + 1, 0);
    latestCycle = cycle + 1;
  } else {
    latestCycle = cycle;
  }
};

const pauseGracefully = (state) => {
  stopLoops();
  cancelScheduledAfter(audioCycleTiming(state).cutoffTime);
  // Leave currentBar as-is; drop pending cue (boundary is cleared).
  const holdBar = drumsUi(state).currentBar ?? 0;
  latestCycle = -1;
  lastPlayhead = -1;
  lastPlayBar = -1;
  clearCueArm();
  cueUiHoldStep = null;
  setPartDrumsGain(1);
  barAtCycle0 = holdBar;
  dispatch((s) => ({
    ...patchDrumsUi(s, { cuedBar: null }),
    transport: { ...s.transport, playhead: null },
  }));
};

const stopImmediately = () => {
  stopLoops();
  cancelAllScheduled();
  resetTransportStartTime();
  latestCycle = -1;
  lastPlayhead = -1;
  lastPlayBar = -1;
  clearCueArm();
  cueUiHoldStep = null;
  barAtCycle0 = 0;
  setPartDrumsGain(1);
  dispatch((s) => ({
    ...patchDrumsUi(s, {
      currentBar: 0,
      cuedBar: null,
      deleteArmedBar: null,
    }),
    transport: { ...s.transport, playhead: null },
  }));
};

const reset = stopImmediately;

const anchorTransportStart = (state) => {
  const now = context.currentTime;
  const cycleDur = cycleDuration(state);
  const loop = getActiveLoopCycle(state);
  barAtCycle0 = drumsUi(state).currentBar ?? 0;

  if (loop) {
    setTransportStartTime(
      transportStartFromLoopPhase(loop.startedAt, loop.duration, cycleDur, now),
    );
    const bar = barSeconds(state.transport);
    const nextBar = nextLoopBarTime(state.transport, loop.startedAt, loop.duration, now);
    const remaining = Math.max(0, nextBar - now);
    const intoBar = bar > 0 ? Math.max(0, bar - remaining) : 0;
    const nearEnd = bar > 0 && remaining <= bar * CYCLE_EDGE;
    const nearStart = bar > 0 && intoBar <= bar * CYCLE_EDGE;
    if (!nearEnd && !nearStart && remaining > 0.001) fadePartDrumsIn(now, nextBar, 1);
    else setPartDrumsGain(1);
    return;
  }
  setPartDrumsGain(1);
  const existing = getTransportStartTime();
  if (existing > now + 0.001) return;
  setTransportStartTime(nextTransportStart(now));
};

const remountCyclePreservingPlayhead = (prev, next) => {
  const now = context.currentTime;
  const oldStart = getTransportStartTime();
  const oldDuration = cycleDuration(prev);
  const oldDt = stepTime(prev.transport.bpm);
  const oldSteps = Math.max(1, stepCount(prev));
  const oldCycle = oldDuration > 0 ? Math.floor((now - oldStart) / oldDuration) : 0;
  const playBar = barForCycle(prev, Math.max(0, oldCycle));

  let elapsed = 0;
  if (oldStart && oldDuration > 0) {
    elapsed = (((now - oldStart) % oldDuration) + oldDuration) % oldDuration;
  }
  const oldStepFloat = elapsed / oldDt;
  const mappedStep = Math.min(
    Math.max(0, Math.floor(oldStepFloat)),
    Math.max(1, stepCount(next)) - 1,
  );
  const frac = oldStepFloat - Math.floor(oldStepFloat);
  const newElapsed = (mappedStep + frac) * stepTime(next.transport.bpm);

  barAtCycle0 = Math.min(playBar, Math.max(1, barCount(next)) - 1);
  cancelScheduledAfter(now);
  setTransportStartTime(now - newElapsed);
  latestCycle = -1;
  lastPlayhead = mappedStep;
  lastPlayBar = barAtCycle0;
  clearCueArm();
  cueUiHoldStep = null;
  if (drumsUi(next).cuedBar != null) dispatch(clearCuedBar);
  transportTick(state$Ref, { updateUi: true });
};

const drumsTransport = (state) =>
  state.tracks?.find((t) => t.id === DRUMS_TRACK_ID)?.transport ?? {};

const drumsTransportKey = (state) => {
  const tr = drumsTransport(state);
  return `${tr.playing}:${tr.stopPending}:${state.transport?.stopPending}`;
};

let onStop = () => {};
export const stop = () => onStop();

export const start = ({ state$ }) => {
  let subs = [];
  state$Ref = state$;

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  subs.push(
    state$
      .pipe(distinctUntilChanged((a, b) => drumsTransportKey(a) === drumsTransportKey(b)))
      .subscribe((state) => {
        const drums = drumsTransport(state);
        const sessionStop = state.transport?.stopPending;

        if (sessionStop || drums.stopPending) {
          stopImmediately();
          if (sessionStop) dispatch(patch(['transport', 'stopPending'], false));
          if (drums.stopPending) clearDrumsStopPending();
          return;
        }

        if (drums.playing) {
          resume().then(() => {
            anchorTransportStart(state$Ref.getValue());
            latestCycle = -1;
            transportTick(state$, { updateUi: true });
            startInterval();
            startRaf();
          });
        } else {
          pauseGracefully(state);
        }
      }),
  );

  subs.push(
    state$
      .pipe(
        filter((s) => isTrackScheduling(s, DRUMS_TRACK_ID)),
        pairwise(),
        filter(([prev, next]) => !transportChanged(prev, next)),
      )
      .subscribe(([prev, next]) => remountCyclePreservingPlayhead(prev, next)),
  );

  subs.push(
    state$
      .pipe(
        filter((s) => isTrackScheduling(s, DRUMS_TRACK_ID)),
        pairwise(),
        filter(([prev, next]) => drumsUi(prev).cuedBar !== drumsUi(next).cuedBar),
      )
      .subscribe(([, next]) => {
        if (drumsUi(next).cuedBar == null) {
          clearCueArm();
          rescheduleRemainder(next);
          return;
        }
        armCue(next);
      }),
  );

  subs.push(
    state$
      .pipe(
        filter((s) => isTrackScheduling(s, DRUMS_TRACK_ID)),
        pairwise(),
        filter(
          ([prev, next]) => getDrumsPattern(prev)?.measures !== getDrumsPattern(next)?.measures,
        ),
      )
      .subscribe(([, next]) => rescheduleRemainder(next)),
  );

  onStop = () => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
    state$Ref = null;
    reset();
    subs.forEach((sub) => sub.unsubscribe());
    subs = [];
  };
};

export default { start, stop };
