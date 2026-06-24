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
} from '../util/audio';
import {
  getTransportStartTime,
  setTransportStartTime,
  stepTime,
  transportStartFromLoopPhase,
} from '../util/transport-clock';
import { DRUMS_TRACK_ID, isTrackScheduling } from '../util/session-transport';
import { getActiveLoopCycle } from '../util/loops-state';
import * as samples from '../util/samples';

const SCHEDULE_INTERVAL_MS = 25;

let state$Ref = null;
let intervalId = 0;
let rafId = 0;
let latestCycle = -1;
let lastPlayhead = -1;

const timeSignatureToSteps = (timeSignature, resolution) =>
  Number((resolution * (timeSignature[0] / timeSignature[1])).toFixed(0));

const stepCount = (state) =>
  timeSignatureToSteps(state.transport.timeSignature, state.transport.resolution);

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

const gridCellChanges = (prevGrid, nextGrid, tracks, steps) => {
  const changed = [];
  for (let track = 0; track < tracks; track++) {
    for (let step = 0; step < steps; step++) {
      const was = !!prevGrid?.[track]?.[step];
      const now = !!nextGrid?.[track]?.[step];
      if (was !== now) changed.push({ track, step });
    }
  }
  return changed;
};

const scheduleCycle = (state, cycle, fromStep = 0) => {
  if (!isTrackScheduling(state, DRUMS_TRACK_ID)) return;

  const { sequencer } = state;
  const rowCount = sequencer.tracks;
  const steps = stepCount(state);
  const dt = stepTime(state.transport.bpm);
  const base = getTransportStartTime() + cycle * cycleDuration(state);
  const now = context.currentTime;

  for (let step = fromStep; step < steps; step++) {
    const when = base + step * dt;
    if (when <= now) continue;
    for (let track = 0; track < rowCount; track++) {
      if (!sequencer.grid[track]?.[step]) continue;
      const assignment = sequencer.assignments?.[track];
      if (!assignment) continue;
      const buffer = samples.get(samples.key(assignment.kit, assignment.sample));
      if (buffer) play(buffer, when, track);
    }
  }
};

const runScheduling = (state) => {
  if (!isTrackScheduling(state, DRUMS_TRACK_ID)) return;

  const timing = audioCycleTiming(state);
  const { cycle, duration } = timing;

  if (latestCycle === -1) {
    scheduleCycle(state, 0);
    latestCycle = 0;
    return;
  }

  if (cycle > latestCycle) {
    scheduleCycle(state, cycle);
    scheduleCycle(state, cycle + 1);
    latestCycle = cycle + 1;
    return;
  }

  if (cycle === latestCycle) {
    const progress = (context.currentTime - getTransportStartTime() - cycle * duration) / duration;
    if (progress > 0.7) {
      scheduleCycle(state, cycle + 1);
      latestCycle = cycle + 1;
    }
  }
};

const updatePlayhead = (state) => {
  const playhead = uiPlayhead(state);
  if (playhead >= 0 && playhead !== lastPlayhead) {
    lastPlayhead = playhead;
    dispatch(patch(['transport', 'playhead'], playhead));
  }
};

const transportTick = (state$, { updateUi = false } = {}) => {
  const state = state$.getValue();
  if (!isTrackScheduling(state, DRUMS_TRACK_ID)) return;

  runScheduling(state);
  if (updateUi) updatePlayhead(state);
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
  a.transport?.resolution === b.transport?.resolution;

const rescheduleRemainder = (state) => {
  const { cycle, cutoffTime, rescheduleFrom, steps } = audioCycleTiming(state);
  cancelScheduledAfter(cutoffTime);
  latestCycle = cycle;
  if (rescheduleFrom < steps) {
    scheduleCycle(state, cycle, rescheduleFrom);
  }
};

const pauseGracefully = (state) => {
  stopLoops();
  cancelScheduledAfter(audioCycleTiming(state).cutoffTime);
  latestCycle = -1;
  lastPlayhead = -1;
  dispatch(patch(['transport', 'playhead'], null));
};

const stopImmediately = () => {
  stopLoops();
  cancelAllScheduled();
  latestCycle = -1;
  lastPlayhead = -1;
  dispatch(patch(['transport', 'playhead'], null));
};

const reset = () => {
  stopLoops();
  cancelAllScheduled();
  latestCycle = -1;
  lastPlayhead = -1;
  dispatch(patch(['transport', 'playhead'], null));
};

const anchorTransportStart = (state) => {
  const now = context.currentTime;
  const cycleDur = cycleDuration(state);
  const loop = getActiveLoopCycle(state);
  setTransportStartTime(
    loop ? transportStartFromLoopPhase(loop.startedAt, loop.duration, cycleDur, now) : now + 0.05,
  );
};

const resetTransport = () => {
  cancelScheduledAfter(context.currentTime);
  if (state$Ref) anchorTransportStart(state$Ref.getValue());
  else setTransportStartTime(context.currentTime + 0.05);
  latestCycle = -1;
  lastPlayhead = -1;
};

const getDrumsTrack = (state) => state.tracks?.find((t) => t.id === DRUMS_TRACK_ID);

const drumsTransport = (state) => getDrumsTrack(state)?.transport ?? {};

const drumsTransportKey = (state) => {
  const tr = drumsTransport(state);
  return `${tr.playing}:${tr.stopPending}:${state.transport?.stopPending}`;
};

export let stop = () => {};

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
        distinctUntilChanged(transportChanged),
      )
      .subscribe(() => resetTransport()),
  );

  subs.push(
    state$
      .pipe(
        filter((s) => isTrackScheduling(s, DRUMS_TRACK_ID)),
        pairwise(),
        filter(([prev, next]) => prev.sequencer.grid !== next.sequencer.grid),
      )
      .subscribe(([prev, next]) => {
        const rowCount = next.sequencer.tracks;
        const steps = stepCount(next);
        const changes = gridCellChanges(prev.sequencer.grid, next.sequencer.grid, rowCount, steps);
        const { playhead } = audioCycleTiming(next);
        if (changes.some(({ step }) => step > playhead)) {
          rescheduleRemainder(next);
        }
      }),
  );

  stop = () => {
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
