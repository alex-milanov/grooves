// libs
import { init, dispatch } from 'iblokz-state';
import { patchStream } from 'iblokz-snabbdom-helpers';
import { toVNode } from 'snabbdom';
import { map, distinctUntilChanged } from 'rxjs';

// state
import { initial } from './state';
import { serializeTheme } from './util/theme';
import { migrateState } from './util/migrate-state';
// services
import viewport from './services/viewport';
import library from './services/library';
import loops from './services/loops';
import sequencer from './services/sequencer';
import waveform from './services/waveform';
import mixer from './services/mixer';
import mediaSession from './services/media-session';
// ui
import ui from './ui';

let state$ = init(initial);
dispatch(migrateState);

state$.pipe(distinctUntilChanged((s) => s.sequencer)).subscribe((s) => console.log('state', s));

// services
viewport.start({ state$ });
library.start({ state$ });
loops.start({ state$ });
sequencer.start({ state$ });
waveform.start({ state$ });
mixer.start({ state$ });
mediaSession.start({ state$ });

// theme change tracking
state$
  .pipe(
    map((s) => serializeTheme(s)),
    distinctUntilChanged(),
  )
  .subscribe((theme) => localStorage.setItem('boilerplate-theme', theme));

// state -> ui
let vnode$ = state$.pipe(map(ui));
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
    patchSubscription.unsubscribe();
    state$.complete();
    vnode$.complete();
    // document.body.innerHTML = document.body.innerHTML;
  });
  module.hot.accept(function () {
    dispatch(() => migrateState(module.hot.data.state));
  });
}
