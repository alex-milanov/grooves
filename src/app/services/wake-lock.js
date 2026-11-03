import { distinctUntilChanged, map } from 'rxjs';
import { anySessionActivity } from '../state/transport';

/**
 * Keep the screen awake while anything is audibly active (mobile idle dim / lock):
 * global session play, per-workspace track play, or loop slot play/record/overdub.
 * Uses the Screen Wake Lock API; no-ops where unsupported.
 */

let wakeLock = null;
let wanted = false;

const supported = () =>
  typeof navigator !== 'undefined' && navigator.wakeLock?.request != null;

const release = async () => {
  const lock = wakeLock;
  wakeLock = null;
  if (!lock) return;
  try {
    await lock.release();
  } catch (_) {
    /* already released */
  }
};

const request = async () => {
  if (!supported() || !wanted || document.visibilityState !== 'visible') return;
  if (wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch (_) {
    wakeLock = null;
  }
};

const sync = (playing) => {
  wanted = !!playing;
  if (wanted) request();
  else release();
};

const onVisibilityChange = () => {
  // Lock is released when the tab hides; re-acquire on return if still playing.
  if (document.visibilityState === 'visible' && wanted) request();
};

let onStop = () => {};
export const stop = () => onStop();

export const start = ({ state$ }) => {
  stop();

  if (!supported()) {
    onStop = () => {};
    return;
  }

  const subs = [];

  document.addEventListener('visibilitychange', onVisibilityChange);

  sync(anySessionActivity(state$.getValue()));

  subs.push(
    state$
      .pipe(
        map((s) => anySessionActivity(s)),
        distinctUntilChanged(),
      )
      .subscribe(sync),
  );

  onStop = () => {
    wanted = false;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    release();
    subs.forEach((sub) => sub.unsubscribe());
    onStop = () => {};
  };
};

export default {
  start,
  stop,
};
