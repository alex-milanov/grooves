import { obj } from 'iblokz-data';
import { getInitialTheme } from '../util/theme';

export const initial = {
  sequencer: {
    tracks: 4,
    steps: 16,
    playing: false,
    grid: [] // [[]] (tracks x steps) on/off 1/0 grid
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
