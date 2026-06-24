import { LOOPS_TRACK_ID } from './session-transport';

export const LOOPS_SLOT_COUNT = 4;

export const DEFAULT_SLOT_PARAMS = {
  volume: 0.85,
  muted: false,
  vcf: { cutoff: 0.64, resonance: 0 },
  sends: { reverb: 0, delay: 0 },
};

export const createEmptySlot = (index) => ({
  id: `slot-${index}`,
  process: 'empty',
  startedAt: null,
  layers: 0,
  duration: 0,
  bufferKeys: [],
  params: {
    ...DEFAULT_SLOT_PARAMS,
    vcf: { ...DEFAULT_SLOT_PARAMS.vcf },
    sends: { ...DEFAULT_SLOT_PARAMS.sends },
  },
});

export const createLoopsTrack = () => ({
  id: LOOPS_TRACK_ID,
  type: 'loop',
  name: 'Loops',
  transport: { armed: true, playing: false, stopPending: false },
  mixer: { volume: 1, muted: false, solo: false },
  loop: {
    inputId: 'default',
    clickEnabled: true,
    slots: Array.from({ length: LOOPS_SLOT_COUNT }, (_, i) => createEmptySlot(i)),
  },
});

export const getLoopsTrack = (state) => state.tracks?.find((t) => t.id === LOOPS_TRACK_ID);

export const getLoopSlot = (state, slotIndex) => getLoopsTrack(state)?.loop?.slots?.[slotIndex];

export const loopBufferKey = (slotIndex, layerIndex) =>
  `loop/${LOOPS_TRACK_ID}/slot-${slotIndex}/L${layerIndex}`;

export const getSlotParams = (slot) => ({
  ...DEFAULT_SLOT_PARAMS,
  ...slot?.params,
  vcf: { ...DEFAULT_SLOT_PARAMS.vcf, ...slot?.params?.vcf },
  sends: { ...DEFAULT_SLOT_PARAMS.sends, ...slot?.params?.sends },
});

export const slotHasContent = (slot) => (slot?.bufferKeys?.length ?? 0) > 0;

export const anySlotHasContent = (state) =>
  getLoopsTrack(state)?.loop?.slots?.some(slotHasContent) ?? false;

export const mapLoopSlots = (state, fn) => {
  const track = getLoopsTrack(state);
  if (!track) return state;
  const slots = track.loop.slots.map((slot, i) => fn(slot, i));
  return {
    ...state,
    tracks: state.tracks.map((t) =>
      t.id === LOOPS_TRACK_ID ? { ...t, loop: { ...t.loop, slots } } : t,
    ),
  };
};

export const patchLoopSlot = (state, slotIndex, patch) =>
  mapLoopSlots(state, (slot, i) => (i === slotIndex ? { ...slot, ...patch } : slot));

export const patchLoopsTrack = (state, patch) => ({
  ...state,
  tracks: state.tracks.map((t) =>
    t.id === LOOPS_TRACK_ID ? { ...t, loop: { ...t.loop, ...patch } } : t,
  ),
});

export const patchLoopsMixer = (state, patch) => ({
  ...state,
  tracks: state.tracks.map((t) =>
    t.id === LOOPS_TRACK_ID ? { ...t, mixer: { ...t.mixer, ...patch } } : t,
  ),
});
