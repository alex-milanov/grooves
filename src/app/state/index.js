import { obj } from 'iblokz-data';
import { getInitialTheme } from '../util/theme';
import { buildDefaultRouting } from '../util/routing';
import { WORKSPACE_DRUMS, defaultWorkspacesStripOpen } from '../util/workspaces';
import { DRUMS_TRACK_ID } from '../util/session-transport';

const TRACK_COUNT = 4;

export const initial = {
  ui: {
    activeWorkspace: WORKSPACE_DRUMS,
    workspacesStripOpen: typeof window !== 'undefined' ? defaultWorkspacesStripOpen() : true,
  },
  transport: {
    playing: false,
    playhead: null,
    stopPending: false,
    bpm: 120,
    timeSignature: [4, 4],
    resolution: 16,
  },
  tracks: [
    {
      id: DRUMS_TRACK_ID,
      type: 'sample-seq',
      name: 'Drums',
      transport: {
        armed: true,
        playing: false,
        stopPending: false,
      },
    },
  ],
  partMixer: {
    name: 'Drums',
    volume: 1,
    muted: false,
    solo: false,
  },
  routing: buildDefaultRouting(TRACK_COUNT),
  mixer: {
    master: { volume: 1 },
    buses: {
      reverb: { seconds: 3, decay: 2 },
      delay: { time: 0.375, feedback: 0.35 },
    },
  },
  sequencer: {
    tracks: TRACK_COUNT,
    steps: 16,
    selectedTrack: null,
    panels: {
      library: false,
      settings: false,
    },
    assignments: {
      0: { kit: 'basic_drum_kit', sample: 'PD-KICK-03.wav' },
      1: { kit: 'basic_drum_kit', sample: 'Rpeople_Snare3.wav' },
      2: { kit: 'basic_drum_kit', sample: 'HCR-01.wav' },
    },
    trackParams: {},
    grid: [],
  },
  library: {
    path: ['library'],
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
  },
};

export const patch = (path, value) => (state) => obj.patch(state, path, value);

export default {
  initial,
  patch,
};
