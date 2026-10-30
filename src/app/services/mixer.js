import { distinctUntilChanged, map } from 'rxjs';
import { getLoopsTrack } from '../state/loops';
import { applyRouting } from './audio';

let onStop = () => {};
export const stop = () => onStop();

export const start = ({ state$ }) => {
  const subs = [];

  const sync = (state) => {
    applyRouting(state.routing, state.sequencer.rowParams, state.mixer, state.partMixer, {
      loopsTrack: getLoopsTrack(state),
    });
  };

  sync(state$.getValue());

  subs.push(
    state$
      .pipe(
        map((s) => ({
          routing: s.routing,
          rowParams: s.sequencer.rowParams,
          mixer: s.mixer,
          partMixer: s.partMixer,
          loopsTrack: getLoopsTrack(s),
        })),
        distinctUntilChanged(
          (a, b) =>
            JSON.stringify(a.routing) === JSON.stringify(b.routing) &&
            JSON.stringify(a.rowParams) === JSON.stringify(b.rowParams) &&
            JSON.stringify(a.mixer) === JSON.stringify(b.mixer) &&
            JSON.stringify(a.partMixer) === JSON.stringify(b.partMixer) &&
            JSON.stringify(a.loopsTrack) === JSON.stringify(b.loopsTrack),
        ),
      )
      .subscribe(({ routing, rowParams, mixer, partMixer, loopsTrack }) => {
        applyRouting(routing, rowParams, mixer, partMixer, { loopsTrack });
      }),
  );

  onStop = () => {
    subs.forEach((sub) => sub.unsubscribe());
  };
};

export default {
  start,
  stop,
};
