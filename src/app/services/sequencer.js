import { distinctUntilChanged, filter, map, pairwise } from 'rxjs';
import { dispatch } from 'iblokz-state';
import { patch } from '../state';
import {
  context,
  play,
  resume,
  stepTime,
  cancelScheduledAfter,
  cancelAllScheduled,
  syncTrackGains,
} from '../util/audio';
import * as samples from '../util/samples';

let rafId = 0;
let startTime = 0;
let latestCycle = -1;
let lastPlayhead = -1;

const timeSignatureToSteps = (timeSignature, resolution) =>
  Number((resolution * (timeSignature[0] / timeSignature[1])).toFixed(0));

const stepCount = state =>
  timeSignatureToSteps(state.sequencer.timeSignature, state.sequencer.resolution);

const cycleDuration = state => {
  const steps = stepCount(state);
  return stepTime(state.sequencer.bpm) * steps;
};

const cycleTiming = state => {
  const steps = stepCount(state);
  const duration = cycleDuration(state);
  const dt = stepTime(state.sequencer.bpm);
  const now = context.currentTime;
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
  const { sequencer } = state;
  const tracks = state.tracks ?? sequencer.tracks;
  const steps = stepCount(state);
  const dt = stepTime(sequencer.bpm);
  const base = startTime + cycle * cycleDuration(state);
  const now = context.currentTime;

  for (let step = fromStep; step < steps; step++) {
    const when = base + step * dt;
    if (when <= now) continue;
    for (let track = 0; track < tracks; track++) {
      if (!sequencer.grid[track]?.[step]) continue;
      const assignment = sequencer.assignments?.[track];
      if (!assignment) continue;
      const buffer = samples.get(samples.key(assignment.kit, assignment.sample));
      if (buffer) play(buffer, when, track);
    }
  }
};

const rescheduleRemainder = state => {
  const { cycle, cutoffTime, rescheduleFrom, steps } = cycleTiming(state);
  cancelScheduledAfter(cutoffTime);
  latestCycle = cycle;
  if (rescheduleFrom < steps) {
    scheduleCycle(state, cycle, rescheduleFrom);
  }
};

const tick = state$ => {
  const state = state$.getValue();
  if (!state.sequencer.playing) return;

  const timing = cycleTiming(state);
  const { playhead, cycle, duration } = timing;

  if (playhead !== lastPlayhead) {
    lastPlayhead = playhead;
    dispatch(patch(['sequencer', 'playhead'], playhead));
  }

  if (latestCycle === -1) {
    scheduleCycle(state, 0);
    latestCycle = 0;
  } else if (cycle === latestCycle) {
    const progress = (context.currentTime - startTime - cycle * duration) / duration;
    if (progress > 0.7) {
      scheduleCycle(state, cycle + 1);
      latestCycle = cycle + 1;
    }
  }

  rafId = requestAnimationFrame(() => tick(state$));
};

const pauseGracefully = state => {
  cancelScheduledAfter(cycleTiming(state).cutoffTime);
  cancelAnimationFrame(rafId);
  rafId = 0;
  latestCycle = -1;
  lastPlayhead = -1;
  dispatch(patch(['sequencer', 'playhead'], null));
};

const reset = () => {
  cancelAllScheduled();
  cancelAnimationFrame(rafId);
  rafId = 0;
  latestCycle = -1;
  lastPlayhead = -1;
  dispatch(patch(['sequencer', 'playhead'], null));
};

const resetTransport = () => {
  cancelScheduledAfter(context.currentTime);
  startTime = context.currentTime + 0.05;
  latestCycle = -1;
  lastPlayhead = -1;
};

const transportChanged = (a, b) =>
  a.sequencer.bpm === b.sequencer.bpm
  && a.sequencer.timeSignature?.[0] === b.sequencer.timeSignature?.[0]
  && a.sequencer.timeSignature?.[1] === b.sequencer.timeSignature?.[1]
  && a.sequencer.resolution === b.sequencer.resolution;

export let stop = () => {};

export const start = ({ state$ }) => {
  const subs = [];
  const tracksFrom = state => state.tracks ?? state.sequencer.tracks;

  syncTrackGains(state$.getValue().sequencer.trackParams, tracksFrom(state$.getValue()));

  subs.push(state$.pipe(
    distinctUntilChanged((a, b) => a.sequencer.playing === b.sequencer.playing),
  ).subscribe(state => {
    if (state.sequencer.playing) {
      resume().then(() => {
        startTime = context.currentTime + 0.05;
        latestCycle = -1;
        tick(state$);
      });
    } else {
      pauseGracefully(state);
    }
  }));

  subs.push(state$.pipe(
    filter(s => s.sequencer.playing),
    distinctUntilChanged(transportChanged),
  ).subscribe(() => resetTransport()));

  subs.push(state$.pipe(
    filter(s => s.sequencer.playing),
    pairwise(),
    filter(([prev, next]) => prev.sequencer.grid !== next.sequencer.grid),
  ).subscribe(([prev, next]) => {
    const tracks = next.tracks ?? next.sequencer.tracks;
    const steps = stepCount(next);
    const changes = gridCellChanges(
      prev.sequencer.grid,
      next.sequencer.grid,
      tracks,
      steps,
    );
    const { playhead } = cycleTiming(next);
    if (changes.some(({ step }) => step > playhead)) {
      rescheduleRemainder(next);
    }
  }));

  subs.push(state$.pipe(
    map(s => ({
      trackParams: s.sequencer.trackParams,
      tracks: tracksFrom(s),
    })),
    distinctUntilChanged((a, b) =>
      JSON.stringify(a.trackParams) === JSON.stringify(b.trackParams)
      && a.tracks === b.tracks,
    ),
  ).subscribe(({ trackParams, tracks }) => {
    syncTrackGains(trackParams, tracks);
  }));

  stop = () => {
    reset();
    subs.forEach(sub => sub.unsubscribe());
  };
};

export default {
  start,
  stop,
};
