// libs
import { init, dispatch } from 'iblokz-state';
import { patchStream } from 'iblokz-snabbdom-helpers';
import { toVNode } from 'snabbdom';
import { map, distinctUntilChanged, withLatestFrom } from 'rxjs';

// state
import { initial } from './state';
import { serializeTheme } from './util/theme';
import { frame } from './util/time';
// services
import viewport from './services/viewport';
import library from './services/library';
import loops from './services/loops';
import sequencer from './services/sequencer';
import waveform from './services/waveform';
import mixer from './services/mixer';
import mediaSession from './services/media-session';
import wakeLock from './services/wake-lock';
// ui
import ui from './ui';

let state$ = init(initial);

state$
  .pipe(distinctUntilChanged((a, b) => a.tracks === b.tracks && a.ui === b.ui))
  // .subscribe((s) => console.log('state', s));

// services
viewport.start({ state$ });
library.start({ state$ });
loops.start({ state$ });
sequencer.start({ state$ });
waveform.start({ state$ });
mixer.start({ state$ });
mediaSession.start({ state$ });
wakeLock.start({ state$ });

// theme change tracking
state$
  .pipe(
    map((s) => serializeTheme(s)),
    distinctUntilChanged(),
  )
  .subscribe((theme) => localStorage.setItem('boilerplate-theme', theme));

// raf × latest state -> ui (js-loop-station / world-metronome)
let vnode$ = frame().pipe(
  withLatestFrom(state$),
  map(([, state]) => ui(state)),
);
let patchSubscription = patchStream(vnode$, toVNode(document.body));

if (module.hot) {
  module.hot.dispose(function (data) {
    data.state = state$.getValue();
    viewport.stop();
    library.stop();
    loops.stop();
    sequencer.stop();
    waveform.stop();
    mixer.stop();
    mediaSession.stop();
    wakeLock.stop();
    patchSubscription.unsubscribe();
    state$.complete();
    vnode$.complete();
    // document.body.innerHTML = document.body.innerHTML;
  });
  module.hot.accept(function () {
    // Shape changes need a full reload; Parcel often forces one anyway.
    if (module.hot.data?.state) dispatch(() => module.hot.data.state);
  });
}
