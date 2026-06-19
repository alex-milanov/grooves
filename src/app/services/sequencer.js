import { distinctUntilChanged, filter } from 'rxjs';
import { dispatch } from 'iblokz-state';
import { patch } from '../state';
import { context, play, resume, stepTime } from '../util/audio';
import * as samples from '../util/samples';

let rafId = 0;
let startTime = 0;
let latestCycle = -1;
let lastPlayhead = -1;

const timeSignatureToSteps = (timeSignature, resolution) => 
  Number((resolution * (timeSignature[0] / timeSignature[1])).toFixed(0));

const cycleDuration = state => {
  const { sequencer } = state;
  const steps = timeSignatureToSteps(sequencer.timeSignature, sequencer.resolution);
  return stepTime(sequencer.bpm) * steps;
};

const scheduleCycle = (state, cycle) => {
  const { sequencer } = state;
  const tracks = state.tracks ?? sequencer.tracks;
  const steps = state.steps ?? sequencer.steps;
  const dt = stepTime(sequencer.bpm);
  const base = startTime + cycle * cycleDuration(state);

  for (let step = 0; step < steps; step++) {
    const when = base + step * dt;
    for (let track = 0; track < tracks; track++) {
      if (!sequencer.grid[track]?.[step]) continue;
      const assignment = sequencer.assignments?.[track];
      if (!assignment) continue;
      const buffer = samples.get(samples.key(assignment.kit, assignment.sample));
      if (buffer) play(buffer, when);
    }
  }
};

const tick = state$ => {
  const state = state$.getValue();
  if (!state.sequencer.playing) return;

  const now = context.currentTime;
  const duration = cycleDuration(state);
  const cycle = Math.floor((now - startTime) / duration);
  const progress = ((now - startTime) % duration) / duration;
  const playhead = Math.floor(progress * (state.steps ?? state.sequencer.steps));

  if (playhead !== lastPlayhead) {
    lastPlayhead = playhead;
    dispatch(patch(['sequencer', 'playhead'], playhead));
  }

  if (latestCycle === -1) {
    scheduleCycle(state, 0);
    latestCycle = 0;
  } else if (cycle === latestCycle && progress > 0.7) {
    scheduleCycle(state, cycle + 1);
    latestCycle = cycle + 1;
  }

  rafId = requestAnimationFrame(() => tick(state$));
};

const reset = () => {
  cancelAnimationFrame(rafId);
  rafId = 0;
  latestCycle = -1;
  lastPlayhead = -1;
  dispatch(patch(['sequencer', 'playhead'], null));
};

export let stop = () => {};
export const start = ({ state$ }) => {
  let subs = [];

  // 
  subs.push(state$.pipe(
    distinctUntilChanged((a, b) => a.sequencer.playing === b.sequencer.playing),
  ).subscribe(state =>
    (state.sequencer.playing)
      ? resume().then(() => {
        startTime = context.currentTime + 0.05;
        latestCycle = -1;
        tick(state$)
      })
      : reset()
  ));

  subs.push(state$.pipe(
    filter(s => s.sequencer.playing),
    distinctUntilChanged((a, b) =>
      a.sequencer.bpm === b.sequencer.bpm
      && (a.steps ?? a.sequencer.steps) === (b.steps ?? b.sequencer.steps),
    ),
  ).subscribe(() => {
    startTime = context.currentTime + 0.05;
    latestCycle = -1;
    lastPlayhead = -1;
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
