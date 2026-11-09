/**
 * Tracks AudioContext suspension (autoplay policy) for the unlock modal.
 */

import { dispatch } from 'iblokz-state';
import { context, resume } from './audio';
import { setAudioBlocked } from '../state/audio';

const isBlocked = () => context.state === 'suspended' || context.state === 'interrupted';

const sync = () => {
  dispatch(setAudioBlocked(isBlocked()));
};

let onStop = () => {};

export const stop = () => onStop();

export const unlock = () =>
  resume().then(() => {
    sync();
  });

export const start = () => {
  stop();
  sync();
  const onStateChange = () => sync();
  context.addEventListener('statechange', onStateChange);
  onStop = () => {
    context.removeEventListener('statechange', onStateChange);
    onStop = () => {};
  };
};

export default { start, stop, unlock };
