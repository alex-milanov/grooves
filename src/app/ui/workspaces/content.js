import { div } from 'iblokz-snabbdom-helpers';
import library from '../sections/library';
import sequencer from '../sections/sequencer';
import trackSettings from '../sections/track-settings';
import mixer from '../sections/mixer';

export const drumsWorkspace = (state) =>
  div('.workspace-inner', [library(state), sequencer(state), trackSettings(state)]);

export const mixerWorkspace = (state) => mixer(state);
