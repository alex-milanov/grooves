import { distinctUntilChanged, map } from 'rxjs';
import { applyRouting } from '../util/audio';

export let stop = () => {};

export const start = ({ state$ }) => {
  const subs = [];

  const sync = (state) => {
    applyRouting(state.routing, state.sequencer.trackParams, state.mixer, state.partMixer);
  };

  sync(state$.getValue());

  subs.push(
    state$
      .pipe(
        map((s) => ({
          routing: s.routing,
          trackParams: s.sequencer.trackParams,
          mixer: s.mixer,
          partMixer: s.partMixer,
        })),
        distinctUntilChanged(
          (a, b) =>
            JSON.stringify(a.routing) === JSON.stringify(b.routing) &&
            JSON.stringify(a.trackParams) === JSON.stringify(b.trackParams) &&
            JSON.stringify(a.mixer) === JSON.stringify(b.mixer) &&
            JSON.stringify(a.partMixer) === JSON.stringify(b.partMixer),
        ),
      )
      .subscribe(({ routing, trackParams, mixer, partMixer }) => {
        applyRouting(routing, trackParams, mixer, partMixer);
      }),
  );

  stop = () => {
    subs.forEach((sub) => sub.unsubscribe());
  };
};

export default {
  start,
  stop,
};
