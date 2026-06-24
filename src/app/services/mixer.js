import { distinctUntilChanged, map } from 'rxjs';
import { getLoopsTrack } from '../util/loops-state';
import { applyRouting } from '../util/audio';

export let stop = () => {};

export const start = ({ state$ }) => {
  const subs = [];

  const sync = (state) => {
    applyRouting(state.routing, state.sequencer.trackParams, state.mixer, state.partMixer, {
      loopsTrack: getLoopsTrack(state),
    });
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
          loopsTrack: getLoopsTrack(s),
        })),
        distinctUntilChanged(
          (a, b) =>
            JSON.stringify(a.routing) === JSON.stringify(b.routing) &&
            JSON.stringify(a.trackParams) === JSON.stringify(b.trackParams) &&
            JSON.stringify(a.mixer) === JSON.stringify(b.mixer) &&
            JSON.stringify(a.partMixer) === JSON.stringify(b.partMixer) &&
            JSON.stringify(a.loopsTrack) === JSON.stringify(b.loopsTrack),
        ),
      )
      .subscribe(({ routing, trackParams, mixer, partMixer, loopsTrack }) => {
        applyRouting(routing, trackParams, mixer, partMixer, { loopsTrack });
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
