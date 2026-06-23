import { distinctUntilChanged, map } from 'rxjs';
import { applyRouting } from '../util/audio';

export let stop = () => {};

export const start = ({ state$ }) => {
  const subs = [];

  const sync = (state) => {
    applyRouting(state.routing, state.sequencer.trackParams, state.mixer);
  };

  sync(state$.getValue());

  subs.push(
    state$
      .pipe(
        map((s) => ({
          routing: s.routing,
          trackParams: s.sequencer.trackParams,
          mixer: s.mixer,
        })),
        distinctUntilChanged(
          (a, b) =>
            JSON.stringify(a.routing) === JSON.stringify(b.routing) &&
            JSON.stringify(a.trackParams) === JSON.stringify(b.trackParams) &&
            JSON.stringify(a.mixer) === JSON.stringify(b.mixer),
        ),
      )
      .subscribe(({ routing, trackParams, mixer }) => {
        applyRouting(routing, trackParams, mixer);
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
