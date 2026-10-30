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
import { totalSteps } from '../state/sequencer';
import { stepsPerBar, barCount, clearCuedBar } from '../state/sequencer-measures';
import { getActiveLoopCycle } from '../state/loops';

const SCHEDULE_INTERVAL_MS = 25;

let state$Ref = null;
let intervalId = 0;
let rafId = 0;
let latestCycle = -1;
let lastPlayhead = -1;
/** Armed cue: jump at this audio time (set when cue is clicked). */
let cueBoundaryAt = null;
let cueFromBar = null;
let cueTargetBar = null;
/** After a jump, don't let UI playhead slip onto the prior bar. */
let cueUiHoldStep = null;

const stepCount = (state) => totalSteps(state);

const cycleDuration = (state) => {
  const steps = stepCount(state);
  return stepTime(state.transport.bpm) * steps;
};

const audioCycleTiming = (state) => {
  const steps = stepCount(state);
  const duration = cycleDuration(state);
  const dt = stepTime(state.transport.bpm);
  const now = context.currentTime;
  const startTime = getTransportStartTime();
  const cycle = Math.floor((now - startTime) / duration);
  const progress = ((now - startTime) % duration) / duration;
  const playhead = Math.floor(progress * steps);
  const cycleBase = startTime + cycle * duration;
  const rescheduleFrom = Math.min(playhead + 1, steps);
  const cutoffTime = cycleBase + rescheduleFrom * dt;

  return {
    cycle,
    playhead,
    steps,
    rescheduleFrom,
    cutoffTime,
    dt,
    cycleBase,
    duration,
  };
};

const uiPlayhead = (state) => {
  const steps = stepCount(state);
  const duration = cycleDuration(state);
  const uiStart = getTransportStartTime() + getOutputLatency(context);
  const now = context.currentTime;
  if (now < uiStart) return -1;
  const progress = ((now - uiStart) % duration) / duration;
  return Math.floor(progress * steps);
};

const gridCellChanges = (prevGrid, nextGrid, rows, steps) => {
  const changed = [];
  for (let row = 0; row < rows; row++) {
    for (let step = 0; step < steps; step++) {
      const was = !!prevGrid?.[row]?.[step];
      const now = !!nextGrid?.[row]?.[step];
      if (was !== now) changed.push({ row, step });
    }
  }
  return changed;
};

const playStepAt = (state, step, when) => {
  const { sequencer } = state;
  const rowCount = sequencer.rows ?? sequencer.tracks ?? 0;
  for (let row = 0; row < rowCount; row++) {
    if (!sequencer.grid[row]?.[step]) continue;
    const assignment = sequencer.assignments?.[row];
    if (!assignment) continue;
    const buffer = samples.get(samples.key(assignment.kit, assignment.sample));
    if (!buffer) {
      console.warn('sequencer: missing buffer', assignment.kit, assignment.sample);
      continue;
    }
    play(buffer, when, row);
  }
};

/** End step index (exclusive) of the audio playhead's current bar. */
const currentBarEndStep = (state, playhead) => {
  const perBar = stepsPerBar(state);
  const playBar = Math.floor(Math.max(0, playhead) / perBar);
  return (playBar + 1) * perBar;
};

/**
 * Schedule hits for one cycle.
 * If a cue is pending, stop at the current bar line — never queue the natural next bar.
 */
const scheduleCycle = (state, cycle, fromStep = 0) => {
  if (!isTrackScheduling(state, DRUMS_TRACK_ID)) return;

  const steps = stepCount(state);
  const dt = stepTime(state.transport.bpm);
  const base = getTransportStartTime() + cycle * cycleDuration(state);
  const now = context.currentTime;
  let untilStep = steps;

  if (state.sequencer?.cuedBar != null) {
    const playhead = Math.max(0, Math.floor((now - base) / dt));
    untilStep = Math.min(steps, currentBarEndStep(state, Math.min(playhead, steps - 1)));
  }

  for (let step = fromStep; step < untilStep; step++) {
    const when = base + step * dt;
    if (when <= now) continue;
    playStepAt(state, step, when);
  }
};

const runScheduling = (state) => {
  if (!isTrackScheduling(state, DRUMS_TRACK_ID)) return;

  const timing = audioCycleTiming(state);
  const { cycle, duration } = timing;

  if (latestCycle === -1) {
    // Join the *current* cycle — after a running loop, transport start is in the
    // past, so cycle 0 is entirely gone and scheduling it would silence/drift.
    const c = Math.max(0, cycle);
    scheduleCycle(state, c);
    if (state.sequencer?.cuedBar == null) {
      scheduleCycle(state, c + 1);
      latestCycle = c + 1;
    } else {
      latestCycle = c;
    }
    return;
  }

  if (cycle > latestCycle) {
    scheduleCycle(state, cycle);
    if (state.sequencer?.cuedBar == null) {
      scheduleCycle(state, cycle + 1);
      latestCycle = cycle + 1;
    } else {
      latestCycle = cycle;
    }
    return;
  }

  if (cycle === latestCycle) {
    const progress = (context.currentTime - getTransportStartTime() - cycle * duration) / duration;
    // With a cue pending, don't lookahead into the next cycle/bar.
    if (state.sequencer?.cuedBar != null) return;
    if (progress > 0.7) {
      scheduleCycle(state, cycle + 1);
      latestCycle = cycle + 1;
    }
  }
};

const clearCueArm = () => {
  cueBoundaryAt = null;
  cueFromBar = null;
  cueTargetBar = null;
};

/**
 * Jump to `bar` once. Single schedule pass — no pre-parked absolute hits
 * (those caused a duplicated downbeat). Clock lands on the cued downbeat so
 * UI doesn't flash the previous bar.
 */
const jumpToBarAt = (state, bar) => {
  const perBar = stepsPerBar(state);
  const dt = stepTime(state.transport.bpm);
  const targetStep = bar * perBar;
  const now = context.currentTime;
  const lookahead = 0.005;
  const downbeatAt = now + lookahead;

  // now maps just before downbeat; force UI hold on cued step immediately.
  setTransportStartTime(downbeatAt - targetStep * dt);
  cancelScheduledAfter(now);

  const cleared = {
    ...state,
    sequencer: { ...state.sequencer, cuedBar: null },
  };
  latestCycle = -1;
  // One schedule of the cued bar from its downbeat (and the rest of the cycle).
  scheduleCycle(cleared, 0, targetStep);
  latestCycle = 0;
  clearCueArm();
  cueUiHoldStep = targetStep;
  lastPlayhead = targetStep;

  dispatch((s) => ({
    ...s,
    transport: { ...s.transport, playhead: targetStep },
    sequencer: { ...s.sequencer, cuedBar: null, focusedBar: bar },
  }));
};

/**
 * Fire the armed cue once we reach (or pass) the bar line we armed against.
 * Do not recompute the boundary from the current playBar — that delays a full bar.
 */
const honorCue = (state) => {
  if (state.sequencer?.cuedBar == null || cueBoundaryAt == null || cueTargetBar == null) {
    if (state.sequencer?.cuedBar == null) clearCueArm();
    return;
  }

  const now = context.currentTime;
  if (now + 0.001 < cueBoundaryAt) return;

  jumpToBarAt(state, cueTargetBar);
};

/**
 * When user arms a cue: drop already-queued hits from the next step onward,
 * then reseat only this bar's remainder. (Cancelling only past the bar line
 * left the remainder in place and double-scheduled it → louder overlaps.)
 * The cued bar itself is scheduled once at jump time.
 */
const armCue = (state) => {
  const cued = state.sequencer?.cuedBar;
  if (cued == null) return;

  const timing = audioCycleTiming(state);
  const { playhead, dt, cycleBase, cycle, cutoffTime, rescheduleFrom, steps } = timing;
  if (playhead < 0) return;

  const perBar = stepsPerBar(state);
  const bars = barCount(state);
  const playBar = Math.floor(playhead / perBar) % Math.max(1, bars);
  const boundaryAt = cycleBase + (playBar + 1) * perBar * dt;

  // Next-in-line is a valid cue — same arm/jump path as any other bar.
  cueBoundaryAt = boundaryAt;
  cueFromBar = playBar;
  cueTargetBar = cued;

  cancelScheduledAfter(cutoffTime);
  latestCycle = cycle;
  if (rescheduleFrom < steps) {
    scheduleCycle(state, cycle, rescheduleFrom);
  }
};

const updatePlayhead = (state) => {
  let playhead = uiPlayhead(state);
  if (playhead < 0) return;

  // Keep UI on the cued bar until the latency-compensated playhead catches up.
  if (cueUiHoldStep != null) {
    if (playhead < cueUiHoldStep) playhead = cueUiHoldStep;
    else cueUiHoldStep = null;
  }

  if (playhead !== lastPlayhead) {
    lastPlayhead = playhead;
    dispatch(patch(['transport', 'playhead'], playhead));
  }
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
  (a.sequencer?.bars ?? 1) === (b.sequencer?.bars ?? 1);

const rescheduleRemainder = (state) => {
  const { cycle, cutoffTime, rescheduleFrom, steps } = audioCycleTiming(state);
  cancelScheduledAfter(cutoffTime);
  if (rescheduleFrom < steps) {
    scheduleCycle(state, cycle, rescheduleFrom);
  }
  // Keep lookahead in sync — otherwise a grid edit only patched this cycle and
  // the already-queued next cycle kept the old pattern (new hits waited ~1 cycle).
  if (state.sequencer?.cuedBar == null) {
    scheduleCycle(state, cycle + 1, 0);
    latestCycle = cycle + 1;
  } else {
    latestCycle = cycle;
  }
};

const pauseGracefully = (state) => {
  stopLoops();
  cancelScheduledAfter(audioCycleTiming(state).cutoffTime);
  latestCycle = -1;
  lastPlayhead = -1;
  clearCueArm();
  cueUiHoldStep = null;
  setPartDrumsGain(1);
  dispatch((s) => ({
    ...clearCuedBar(s),
    transport: { ...s.transport, playhead: null },
  }));
};

const stopImmediately = () => {
  stopLoops();
  cancelAllScheduled();
  resetTransportStartTime();
  latestCycle = -1;
  lastPlayhead = -1;
  clearCueArm();
  cueUiHoldStep = null;
  setPartDrumsGain(1);
  dispatch((s) => ({
    ...clearCuedBar(s),
    transport: { ...s.transport, playhead: null },
  }));
};

const reset = () => {
  stopLoops();
  cancelAllScheduled();
  resetTransportStartTime();
  latestCycle = -1;
  lastPlayhead = -1;
  clearCueArm();
  cueUiHoldStep = null;
  setPartDrumsGain(1);
  dispatch((s) => ({
    ...clearCuedBar(s),
    transport: { ...s.transport, playhead: null },
  }));
};

/**
 * Join a running loop's cycle: share its timeline and, when mid-bar, fade the
 * drums bus in until the next loop bar (same idea as loop `partialPlay`).
 */
const anchorTransportStart = (state) => {
  const now = context.currentTime;
  const cycleDur = cycleDuration(state);
  const loop = getActiveLoopCycle(state);
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

    if (!nearEnd && !nearStart && remaining > 0.001) {
      fadePartDrumsIn(now, nextBar, 1);
    } else {
      setPartDrumsGain(1);
    }
    return;
  }
  setPartDrumsGain(1);
  // Keep a session-level future anchor so drums and loops share one downbeat.
  const existing = getTransportStartTime();
  if (existing > now + 0.001) return;
  setTransportStartTime(nextTransportStart(now));
};

/**
 * Bars/BPM/signature changed while playing — keep the current step continuous
 * instead of snapping to a fresh transport start (that audible stutter).
 */
const remountCyclePreservingPlayhead = (prev, next) => {
  const now = context.currentTime;
  const oldStart = getTransportStartTime();
  const oldDuration = cycleDuration(prev);
  const oldDt = stepTime(prev.transport.bpm);
  const oldSteps = Math.max(1, stepCount(prev));

  let elapsed = 0;
  if (oldStart && oldDuration > 0) {
    elapsed = (((now - oldStart) % oldDuration) + oldDuration) % oldDuration;
  }
  const oldStepFloat = elapsed / oldDt;
  const oldStep = Math.min(oldSteps - 1, Math.max(0, Math.floor(oldStepFloat)));
  const frac = oldStepFloat - oldStep;

  const newSteps = Math.max(1, stepCount(next));
  const newDt = stepTime(next.transport.bpm);
  const mappedStep = Math.min(oldStep, newSteps - 1);
  const newElapsed = (mappedStep + frac) * newDt;

  cancelScheduledAfter(now);
  setTransportStartTime(now - newElapsed);
  latestCycle = -1;
  lastPlayhead = mappedStep;
  clearCueArm();
  cueUiHoldStep = null;

  // Drop any pending cue — bar indices / cycle length may no longer match.
  if (next.sequencer?.cuedBar != null) {
    dispatch(clearCuedBar);
  }

  transportTick(state$Ref, { updateUi: true });
};

const getDrumsTrack = (state) => state.tracks?.find((t) => t.id === DRUMS_TRACK_ID);

const drumsTransport = (state) => getDrumsTrack(state)?.transport ?? {};

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
          if (sessionStop) {
            dispatch(patch(['transport', 'stopPending'], false));
          }
          if (drums.stopPending) {
            clearDrumsStopPending();
          }
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
      .subscribe(([prev, next]) => {
        remountCyclePreservingPlayhead(prev, next);
      }),
  );

  // As soon as a cue is armed, drop natural-next schedules.
  // pairwise avoids treating the initial null cue as a "cancel → reschedule".
  subs.push(
    state$
      .pipe(
        filter((s) => isTrackScheduling(s, DRUMS_TRACK_ID)),
        pairwise(),
        filter(([prev, next]) => prev.sequencer?.cuedBar !== next.sequencer?.cuedBar),
      )
      .subscribe(([prev, next]) => {
        if (next.sequencer?.cuedBar == null) {
          clearCueArm();
          // User cancelled (or jump cleared) — restore lookahead without doubles.
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
        filter(([prev, next]) => prev.sequencer.grid !== next.sequencer.grid),
      )
      .subscribe(([prev, next]) => {
        const rowCount = next.sequencer.rows ?? next.sequencer.tracks ?? 0;
        const steps = stepCount(next);
        const changes = gridCellChanges(prev.sequencer.grid, next.sequencer.grid, rowCount, steps);
        if (!changes.length) return;
        // Behind-playhead edits still matter for the next cycle (same pattern loop).
        rescheduleRemainder(next);
      }),
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

export default {
  start,
  stop,
};
