import { obj } from 'iblokz-data';
import { getInitialTheme } from '../util/theme';
import { buildDefaultRouting } from '../util/routing';
import { WORKSPACE_DRUMS } from './ui';
import { MOBILE_BREAKPOINT } from './viewport';
import { createDrumsTrack } from './drums';
import { createLoopsTrack, LOOPS_SLOT_COUNT } from './loops';
import { initialSettings } from './settings';

const ROW_COUNT = 4;

const bootWidth = typeof window !== 'undefined' ? window.innerWidth : MOBILE_BREAKPOINT;

export const initial = {
  ui: {
    activeWorkspace: WORKSPACE_DRUMS,
    workspacesStripOpen: bootWidth >= MOBILE_BREAKPOINT,
    library: {
      path: ['library', 'samples'],
    },
    drums: {
      selectedRow: null,
      currentBar: 0,
      cuedBar: null,
      deleteArmedBar: null,
      measuresExpanded: false,
      panels: { library: false, settings: false },
    },
    loops: {
      selectedSlot: null,
      panels: { library: false, settings: false },
      inputDevices: [],
    },
  },
  settings: initialSettings(),
  transport: {
    playing: false,
    stopPending: false,
    /** AudioContext time of session/drums grid anchor (0 = unset). */
    startTime: 0,
    bpm: 120,
    timeSignature: [4, 4],
    resolution: 16,
  },
  tracks: [createDrumsTrack(ROW_COUNT), createLoopsTrack()],
  routing: buildDefaultRouting(ROW_COUNT, LOOPS_SLOT_COUNT),
  mixer: {
    master: { volume: 1 },
    buses: {
      reverb: { seconds: 3, decay: 2 },
      delay: { time: 0.375, feedback: 0.35 },
    },
  },
  // Runtime library tree only — browse path lives in ui.library
  library: {
    path: ['library', 'samples'],
    kits: null,
    selectedSample: null,
  },
  count: 0,
  lang: 'en',
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
    /** Below MOBILE_BREAKPOINT — maintained by viewport service. */
    mobile: bootWidth < MOBILE_BREAKPOINT,
    /** True while library/settings panel max-width is transitioning — viewport skips scale. */
    animating: false,
    /** Mirrors document fullscreen (Escape / OS exit included). */
    fullscreen: false,
  },
};

export const patch = (path, value) => (state) => obj.patch(state, path, value);

export default {
  initial,
  patch,
};
