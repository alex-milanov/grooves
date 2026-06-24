import { div } from 'iblokz-snabbdom-helpers';
import library from '../sections/library';
import sequencer from '../sections/sequencer';
import trackSettings from '../sections/track-settings';
import loopsLibrary from '../sections/loops-library';
import loopsMain from '../sections/loops-main';
import loopSlotSettings from '../sections/loop-slot-settings';
import mixer from '../sections/mixer';

export const drumsWorkspace = (state) =>
  div('.workspace-inner', [library(state), sequencer(state), trackSettings(state)]);

export const loopsWorkspace = (state) =>
  div('.workspace-inner.loops-workspace', [
    loopsLibrary(state),
    loopsMain(state),
    loopSlotSettings(state),
  ]);

export const mixerWorkspace = (state) => mixer(state);
