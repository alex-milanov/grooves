import { distinctUntilChanged, map } from 'rxjs';
import { getDrumsTrack, rowParamsMap } from '../state/drums';
import { getLoopsTrack, loopsChannel } from '../state/loops';
import { applyRouting } from './audio';

let onStop = () => {};
export const stop = () => onStop();

export const start = ({ state$ }) => {
  const subs = [];

  const sync = (state) => {
    applyRouting(state.routing, rowParamsMap(state), state.mixer, getDrumsTrack(state)?.channel, {
      loopsTrack: getLoopsTrack(state),
    });
  };

  sync(state$.getValue());

  subs.push(
    state$
      .pipe(
        map((s) => ({
          routing: s.routing,
          rowParams: rowParamsMap(s),
          mixer: s.mixer,
          drumsChannel: getDrumsTrack(s)?.channel,
          loopsTrack: getLoopsTrack(s),
        })),
        distinctUntilChanged(
          (a, b) =>
            JSON.stringify(a.routing) === JSON.stringify(b.routing) &&
            JSON.stringify(a.rowParams) === JSON.stringify(b.rowParams) &&
            JSON.stringify(a.mixer) === JSON.stringify(b.mixer) &&
            JSON.stringify(a.drumsChannel) === JSON.stringify(b.drumsChannel) &&
            JSON.stringify(a.loopsTrack) === JSON.stringify(b.loopsTrack),
        ),
      )
      .subscribe(({ routing, rowParams, mixer, drumsChannel, loopsTrack }) => {
        applyRouting(routing, rowParams, mixer, drumsChannel, { loopsTrack });
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
