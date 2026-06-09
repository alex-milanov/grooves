import { obj } from 'iblokz-data';
import { getInitialTheme } from '../util/theme';

export const initial = {
  sequencer: {
    tracks: 4,
    steps: 16,
    playing: false,
    selectedTrack: null,
    assignments: {
      0: { kit: 'basic_drum_kit', sample: 'PD-KICK-03.wav' },
      1: { kit: 'basic_drum_kit', sample: 'Rpeople_Snare3.wav' },
      2: { kit: 'basic_drum_kit', sample: 'HCR-01.wav' },
    },
    grid: [] // [[]] (tracks x steps) on/off 1/0 grid
  },
  library: {
    path: ['library'],
    kits: null,
    selectedSample: null,
  },
  count: 0,
  ...getInitialTheme(),
  viewport: {
    mouse: {
      x: 0,
      y: 0,
      down: false,
    },
    screen: {
      width: 0,
      height: 0,
      size: 'md',
      scroll: { x: 0, y: 0 },
    },
  },
};

export const patch = (path, value) => state => obj.patch(state, path, value);


export default {
  initial,
  patch,
};
