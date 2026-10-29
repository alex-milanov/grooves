import { distinctUntilChanged, map } from 'rxjs';
import { resume } from './audio';
import { sessionPause, sessionPlay, sessionStop } from '../state/transport';

/**
 * Bluetooth / OS media keys via Media Session (no HTMLAudioElement keep-alive).
 *
 * - Keep playbackState at `"paused"` after pause (not `"none"`) so the next
 *   headset press is `play`, not a no-op pause.
 * - Use idempotent sessionPlay/sessionPause — toggles caused “click twice”
 *   when play/pause handlers and state sync both flipped transport.
 */

const ACTIONS = ['play', 'pause', 'stop'];
const ACTION_DEBOUNCE_MS = 350;

let state$Ref = null;
/** After first play until stop — allows `"paused"` instead of `"none"`. */
let sessionArmed = false;
let lastActionAt = 0;

const supported = () =>
  typeof navigator !== 'undefined' && typeof navigator.mediaSession !== 'undefined';

const setHandler = (action, handler) => {
  if (!supported()) return;
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch (_) {
    /* unsupported action on this browser */
  }
};

const clearHandlers = () => {
  ACTIONS.forEach((action) => setHandler(action, null));
};

const acceptAction = () => {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastActionAt < ACTION_DEBOUNCE_MS) return false;
  lastActionAt = now;
  return true;
};

const setPlaybackState = (state) => {
  if (!supported()) return;
  try {
    navigator.mediaSession.playbackState = state;
  } catch (_) {
    /* ignore */
  }
};

const onMediaPlay = async () => {
  if (!acceptAction()) return;
  sessionArmed = true;
  await resume();
  sessionPlay();
  setPlaybackState('playing');
  queueMicrotask(() => {
    if (state$Ref?.getValue()?.transport?.playing) setPlaybackState('playing');
  });
};

const onMediaPause = () => {
  if (!acceptAction()) return;
  sessionPause();
  sessionArmed = true;
  setPlaybackState('paused');
  queueMicrotask(() => setPlaybackState('paused'));
};

const onMediaStop = () => {
  if (!acceptAction()) return;
  sessionArmed = false;
  setPlaybackState('none');
  sessionStop();
};

const bindHandlers = () => {
  setHandler('play', () => {
    onMediaPlay();
  });
  setHandler('pause', () => {
    onMediaPause();
  });
  setHandler('stop', () => {
    onMediaStop();
  });
};

const setMetadata = () => {
  if (!supported() || typeof MediaMetadata === 'undefined') return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Grooves',
      artist: 'Session',
      album: 'Grooves',
    });
  } catch (_) {
    /* ignore */
  }
};

const syncFromState = (state) => {
  const playing = !!state.transport?.playing;
  if (playing) {
    sessionArmed = true;
    setPlaybackState('playing');
    return;
  }
  if (sessionArmed) {
    setPlaybackState('paused');
  } else {
    setPlaybackState('none');
  }
};

let onStop = () => {};
export const stop = () => onStop();

export const start = ({ state$ }) => {
  stop();

  if (!supported()) {
    onStop = () => {};
    return;
  }

  state$Ref = state$;
  sessionArmed = !!state$.getValue()?.transport?.playing;
  lastActionAt = 0;
  const subs = [];

  setMetadata();
  bindHandlers();
  syncFromState(state$.getValue());

  subs.push(
    state$
      .pipe(
        map((s) => !!s.transport?.playing),
        distinctUntilChanged(),
      )
      .subscribe(() => {
        syncFromState(state$.getValue());
      }),
  );

  onStop = () => {
    clearHandlers();
    sessionArmed = false;
    if (supported()) {
      try {
        navigator.mediaSession.playbackState = 'none';
        navigator.mediaSession.metadata = null;
      } catch (_) {
        /* ignore */
      }
    }
    state$Ref = null;
    subs.forEach((sub) => sub.unsubscribe());
    onStop = () => {};
  };
};

export default {
  start,
  stop,
};
