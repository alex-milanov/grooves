import { defaultPanels, isMobile } from '../util/panels';
import { ensureLibrarySection, libraryForAssignment, LOOPS_SECTION } from '../util/library';
import { DEFAULT_LOOP_SOURCE_BPM, loopPlaybackDuration } from '../util/loop-tempo';
import { emptySlotRecordSchedule, slotPlaySchedule } from '../util/loop-record-schedule';
import { nextSlotCycleTime } from '../util/transport-clock';

export const LOOPS_TRACK_ID = 'trk-loops';
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
  sourceBpm: null,
  sourceBpms: [],
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
  channel: { volume: 1, muted: false, solo: false, pan: 0.5, sends: { reverb: 0, delay: 0 } },
  loop: {
    inputId: 'default',
    /** When false (default): request echoCancellation / noiseSuppression / AGC off. */
    processMic: false,
    clickEnabled: true,
    slots: Array.from({ length: LOOPS_SLOT_COUNT }, (_, i) => createEmptySlot(i)),
  },
});

export const loopsChannel = (track) => track?.channel ?? {};

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

/** First slot in `play` with a running cycle — reference for transport sync. */
export const getActiveLoopCycle = (state) => {
  const slots = getLoopsTrack(state)?.loop?.slots ?? [];
  for (const slot of slots) {
    if (slot.process === 'play' && slot.startedAt != null && slot.duration > 0) {
      return { startedAt: slot.startedAt, duration: slot.duration };
    }
  }
  return null;
};

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
    t.id === LOOPS_TRACK_ID
      ? { ...t, channel: { ...loopsChannel(t), ...patch } }
      : t,
  ),
});

export const loopsSlotIndices = () => Array.from({ length: LOOPS_SLOT_COUNT }, (_, i) => i);

// —— UI selection / panels (pure) ——

export const panelsForSlotSelection = (state, slotIndex) => {
  const panels = state.ui?.loops?.panels ?? defaultPanels();
  if (slotHasContent(getLoopSlot(state, slotIndex))) {
    return { library: panels.library, settings: true };
  }
  return { library: true, settings: false };
};

/** Jump library to this slot's assigned kit/sample (sticky if unassigned). */
const librarySelectionForSlot = (state, slotIndex) => {
  const slot = getLoopSlot(state, slotIndex);
  return libraryForAssignment(
    state.library,
    LOOPS_SECTION,
    slot?.kit ? { kit: slot.kit, sample: slot.sample } : null,
  );
};

export const selectLoopSlot = (slotIndex) => (state) => ({
  ...state,
  ui: {
    ...state.ui,
    loops: {
      ...state.ui.loops,
      selectedSlot: slotIndex,
      panels: panelsForSlotSelection(state, slotIndex),
    },
  },
  library: librarySelectionForSlot(state, slotIndex),
});

export const deselectLoopSlot = (state) => ({
  ...state,
  ui: {
    ...state.ui,
    loops: {
      ...state.ui.loops,
      selectedSlot: null,
      panels: defaultPanels(),
    },
  },
});

export const openLoopLibraryPanel = (slotIndex) => (state) => {
  const wasSelected = state.ui?.loops?.selectedSlot === slotIndex;
  const panels = state.ui?.loops?.panels ?? defaultPanels();

  if (!wasSelected) {
    const hasContent = slotHasContent(getLoopSlot(state, slotIndex));
    return {
      ...state,
      ui: {
        ...state.ui,
        loops: {
          ...state.ui.loops,
          selectedSlot: slotIndex,
          panels: {
            library: true,
            settings: hasContent,
          },
        },
      },
      library: ensureLibrarySection(librarySelectionForSlot(state, slotIndex), LOOPS_SECTION),
    };
  }

  const nextLibrary = panels.library
    ? state.library
    : ensureLibrarySection(librarySelectionForSlot(state, slotIndex), LOOPS_SECTION);

  return {
    ...state,
    ui: {
      ...state.ui,
      loops: {
        ...state.ui.loops,
        panels: { ...panels, library: !panels.library },
      },
    },
    library: nextLibrary,
  };
};

export const panelsAfterLoopAssign = (state) => {
  const mobile = isMobile(state);
  return {
    library: mobile ? false : (state.ui?.loops?.panels?.library ?? false),
    settings: true,
  };
};

// —— Reducers: (…args) => state => next ——

export const setLoopsInput = (inputId) => (state) => patchLoopsTrack(state, { inputId });

export const toggleLoopsProcessMic = (state) => {
  const track = getLoopsTrack(state);
  if (!track) return state;
  return patchLoopsTrack(state, { processMic: !track.loop?.processMic });
};

export const toggleLoopsClick = (state) => {
  const track = getLoopsTrack(state);
  if (!track) return state;
  return patchLoopsTrack(state, { clickEnabled: !track.loop?.clickEnabled });
};

export const slotTogglePlayRec = (slotIndex) => (state) => {
  const slot = getLoopSlot(state, slotIndex);
  if (!slot) return state;

  const process = slot.process;
  const track = getLoopsTrack(state);
  const clickOn = !!track?.loop?.clickEnabled;

  if (process === 'record' || process === 'overdub') {
    return patchLoopSlot(state, slotIndex, { process: 'play' });
  }

  if (process === 'empty') {
    const schedule = emptySlotRecordSchedule(state, clickOn);
    return patchLoopSlot(state, slotIndex, {
      process: 'record',
      ...schedule,
    });
  }

  if (process === 'play') {
    const recordAt = nextSlotCycleTime(slot.startedAt, slot.duration);
    return patchLoopSlot(state, slotIndex, {
      process: 'overdub',
      startedAt: recordAt,
    });
  }

  if (process === 'idle' && slotHasContent(slot)) {
    const schedule = slotPlaySchedule(state, slotIndex);
    return patchLoopSlot(state, slotIndex, {
      process: 'play',
      ...schedule,
    });
  }

  return state;
};

export const slotStop = (slotIndex) => (state) => {
  const slot = getLoopSlot(state, slotIndex);
  if (!slot || slot.process === 'empty') return state;
  return patchLoopSlot(state, slotIndex, {
    process: slotHasContent(slot) ? 'idle' : 'empty',
    startedAt: null,
    countInAt: null,
    countInSilent: false,
    partialPlay: false,
    leadPadSeconds: 0,
  });
};

export const slotClear = (slotIndex) => (state) =>
  patchLoopSlot(state, slotIndex, {
    ...createEmptySlot(slotIndex),
    id: `slot-${slotIndex}`,
  });

export const loopsTogglePlay = (state) => {
  const loopsTrack = getLoopsTrack(state);
  if (!loopsTrack) return state;
  if (loopsTrack.transport?.playing) {
    const withSlots = mapLoopSlots(state, (slot) =>
      ['play', 'record', 'overdub'].includes(slot.process)
        ? {
            ...slot,
            process: slotHasContent(slot) ? 'idle' : 'empty',
            startedAt: null,
            countInAt: null,
            countInSilent: false,
            partialPlay: false,
            leadPadSeconds: 0,
          }
        : slot,
    );
    return {
      ...withSlots,
      tracks: withSlots.tracks.map((t) =>
        t.id === LOOPS_TRACK_ID
          ? { ...t, transport: { ...t.transport, playing: false, stopPending: false } }
          : t,
      ),
    };
  }
  const schedule = slotPlaySchedule(state);
  const withSlots = mapLoopSlots(state, (slot) =>
    slotHasContent(slot) ? { ...slot, process: 'play', ...schedule } : slot,
  );
  return {
    ...withSlots,
    tracks: withSlots.tracks.map((t) =>
      t.id === LOOPS_TRACK_ID
        ? { ...t, transport: { ...t.transport, playing: true, stopPending: false } }
        : t,
    ),
  };
};

export const loopsStopAll = (state) => {
  const withSlots = mapLoopSlots(state, (slot) =>
    slot.process === 'empty'
      ? slot
      : {
          ...slot,
          process: 'idle',
          startedAt: null,
          countInAt: null,
          countInSilent: false,
          partialPlay: false,
          leadPadSeconds: 0,
        },
  );
  return {
    ...withSlots,
    tracks: withSlots.tracks.map((t) =>
      t.id === LOOPS_TRACK_ID
        ? { ...t, transport: { ...t.transport, playing: false, stopPending: true } }
        : t,
    ),
  };
};

export const loopsClearAll = (state) =>
  mapLoopSlots(state, (_, i) => ({
    ...createEmptySlot(i),
    id: `slot-${i}`,
  }));

/**
 * Apply a prepared library sample to a slot.
 * Buffer load / quantize / samples.set happen at the call site (UI) before dispatch.
 * Keeps playing slots in `play` (hot-swap) instead of forcing idle/stop.
 */
export const assignLoopSample =
  (slotIndex, { bufferKey, sourceBpm, duration, kit, sample }) =>
  (state) => {
    const slot = getLoopSlot(state, slotIndex);
    const keepPlaying = slot?.process === 'play' || slot?.process === 'overdub';
    return {
      ...patchLoopSlot(state, slotIndex, {
        bufferKeys: [bufferKey],
        sourceBpm,
        sourceBpms: [sourceBpm],
        duration,
        layers: 1,
        process: keepPlaying ? 'play' : 'idle',
        ...(keepPlaying
          ? slotPlaySchedule(state, slotIndex)
          : {
              startedAt: null,
              countInAt: null,
              countInSilent: false,
              partialPlay: false,
              leadPadSeconds: 0,
            }),
        kit,
        sample,
      }),
      ui: {
        ...state.ui,
        loops: {
          ...state.ui.loops,
          selectedSlot: slotIndex,
          panels: panelsAfterLoopAssign(state),
        },
      },
      library: {
        ...state.library,
        selectedSample: sample,
      },
    };
  };

export const patchSlotParam = (slotIndex, path, value) => (state) => {
  const slot = getLoopSlot(state, slotIndex);
  if (!slot) return state;
  const params = { ...slot.params };
  if (path.length === 1) {
    params[path[0]] = value;
  } else if (path[0] === 'vcf' || path[0] === 'sends') {
    params[path[0]] = { ...params[path[0]], [path[1]]: value };
  }
  return patchLoopSlot(state, slotIndex, { params });
};

/** Default source BPM when assigning a library loop (re-exported for call-site prep). */
export { DEFAULT_LOOP_SOURCE_BPM, loopPlaybackDuration };
