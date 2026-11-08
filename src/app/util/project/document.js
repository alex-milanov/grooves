import { DRUMS_TRACK_ID, getDrumsTrack } from '../../state/drums';
import {
  createEmptySlot,
  getLoopsTrack,
  LOOPS_TRACK_ID,
  loopBufferKey,
  slotHasContent,
} from '../../state/loops';
import { measuresList } from '../../state/sequencer-measures';
import { loopMediaPath, mediaPathList, sampleMediaPath } from './paths';

export const PROJECT_FORMAT = 'grooves-project';
export const PROJECT_VERSION = 1.5;

const clone = (value) => JSON.parse(JSON.stringify(value));

const channelDoc = (channel = {}) => ({
  volume: channel.volume ?? 1,
  muted: !!channel.muted,
  solo: !!channel.solo,
  pan: channel.pan ?? 0.5,
  sends: {
    reverb: channel.sends?.reverb ?? 0,
    delay: channel.sends?.delay ?? 0,
  },
});

const rowDoc = (row) => ({
  id: row.id,
  name: row.name,
  midi: row.midi ? { ...row.midi } : undefined,
  sample:
    row.sample?.kit && row.sample?.file ? { kit: row.sample.kit, file: row.sample.file } : null,
  volume: row.volume,
  muted: !!row.muted,
  inserts: {
    vcf: {
      cutoff: row.inserts?.vcf?.cutoff ?? 1,
      resonance: row.inserts?.vcf?.resonance ?? 0,
    },
  },
  sends: {
    reverb: row.sends?.reverb ?? 0,
    delay: row.sends?.delay ?? 0,
  },
});

/** Runtime measure keys are row indices; document uses stable row ids. */
const measuresToDoc = (state, rows) => {
  const idByIndex = rows.map((row, i) => row.id ?? `row-${i}`);
  return measuresList(state).map((measure) => {
    const out = {};
    Object.entries(measure ?? {}).forEach(([key, steps]) => {
      const index = Number(key);
      const rowId = Number.isFinite(index) ? idByIndex[index] : key;
      if (!rowId || !steps || typeof steps !== 'object') return;
      const on = {};
      Object.entries(steps).forEach(([step, value]) => {
        if (value) on[Number(step)] = true;
      });
      out[rowId] = on;
    });
    return out;
  });
};

const measuresFromDoc = (measures, rows) => {
  const indexById = new Map(rows.map((row, i) => [row.id, i]));
  const list = Array.isArray(measures) && measures.length ? measures : [{}];
  return list.map((measure) => {
    const out = {};
    Object.entries(measure ?? {}).forEach(([key, steps]) => {
      const index = indexById.has(key) ? indexById.get(key) : Number(key);
      if (!Number.isFinite(index) || !steps || typeof steps !== 'object') return;
      const on = {};
      Object.entries(steps).forEach(([step, value]) => {
        if (value) on[Number(step)] = true;
      });
      out[index] = on;
    });
    return out;
  });
};

const serializeDrumsTrack = (state, track) => {
  const rows = track.rows ?? [];
  return {
    id: track.id || DRUMS_TRACK_ID,
    type: 'sample-seq',
    name: track.name || 'Drums',
    ...(track.midi ? { midi: { ...track.midi } } : { midi: { channel: 10 } }),
    channel: channelDoc(track.channel),
    rows: rows.map(rowDoc),
    pattern: {
      steps: track.pattern?.steps ?? state.transport?.resolution ?? 16,
      measures: measuresToDoc(state, rows),
    },
  };
};

const slotProcessOnDisk = (slot) => (slotHasContent(slot) ? 'idle' : 'empty');

const serializeLoopSlot = (slot, index, { includeMedia }) => {
  const params = slot.params ?? {};
  const id = slot.id || `slot-${index}`;
  const layerCount = Math.max(slot.bufferKeys?.length ?? 0, slot.layers ?? 0);
  const doc = {
    id,
    name: slot.name || `Slot ${index + 1}`,
    process: slotProcessOnDisk(slot),
    sample: slot.kit && slot.sample ? { kit: slot.kit, file: slot.sample } : null,
    sourceBpm: slot.sourceBpm ?? null,
    sourceBpms: Array.isArray(slot.sourceBpms) ? [...slot.sourceBpms] : [],
    layers: layerCount,
    duration: slot.duration ?? 0,
    volume: params.volume ?? 0.85,
    muted: !!params.muted,
    inserts: {
      vcf: {
        cutoff: params.vcf?.cutoff ?? 0.64,
        resonance: params.vcf?.resonance ?? 0,
      },
    },
    sends: {
      reverb: params.sends?.reverb ?? 0,
      delay: params.sends?.delay ?? 0,
    },
  };
  if (includeMedia && layerCount > 0) {
    doc.media = Array.from({ length: layerCount }, (_, layer) => loopMediaPath(id, layer));
  }
  return doc;
};

const serializeLoopsTrack = (track, { includeMedia }) => {
  const slots = track.loop?.slots ?? [];
  return {
    id: track.id || LOOPS_TRACK_ID,
    type: 'loop',
    name: track.name || 'Loops',
    channel: channelDoc(track.channel),
    loop: {
      inputId: track.loop?.inputId ?? 'default',
      clickEnabled: !!track.loop?.clickEnabled,
      processMic: !!track.loop?.processMic,
    },
    slots: slots.map((slot, i) => serializeLoopSlot(slot, i, { includeMedia })),
  };
};

const serializeUi = (ui = {}) => ({
  activeWorkspace: ui.activeWorkspace ?? 'drums',
  workspacesStripOpen: ui.workspacesStripOpen !== false,
  library: {
    path: Array.isArray(ui.library?.path) ? [...ui.library.path] : ['library', 'samples'],
  },
  drums: {
    selectedRow: null,
    currentBar: ui.drums?.currentBar ?? 0,
    measuresExpanded: !!ui.drums?.measuresExpanded,
    panels: { library: false, settings: false },
  },
  loops: {
    selectedSlot: null,
    panels: { library: false, settings: false },
  },
});

/**
 * Build a grooves-project document from live state.
 * @param {object} state
 * @param {{ includeMedia?: boolean }} [opts] — when true, write `media:` paths for loop layers
 */
export const serializeProject = (state, { includeMedia = false } = {}) => {
  const drums = getDrumsTrack(state);
  const loops = getLoopsTrack(state);
  const tracks = [
    ...(drums ? [serializeDrumsTrack(state, drums)] : []),
    ...(loops ? [serializeLoopsTrack(loops, { includeMedia })] : []),
  ];

  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: state.name || 'untitled',
    lang: state.lang || 'en',
    transport: {
      bpm: state.transport?.bpm ?? 120,
      timeSignature: [...(state.transport?.timeSignature ?? [4, 4])],
      resolution: state.transport?.resolution ?? 16,
    },
    tracks,
    mixer: clone(
      state.mixer ?? {
        master: { volume: 1 },
        buses: {
          reverb: { seconds: 3, decay: 2 },
          delay: { time: 0.375, feedback: 0.35 },
        },
      },
    ),
    settings: state.settings?.recording
      ? { recording: { inputGainDb: state.settings.recording.inputGainDb ?? 0 } }
      : undefined,
    ui: serializeUi(state.ui),
  };
};

/**
 * Paths + provenance for files to embed in a zip (from the live sample cache).
 * Caller reads AudioBuffers via samples.get.
 */
export const collectMediaEntries = (state) => {
  const entries = [];
  const seen = new Set();

  const add = (path, cacheKey) => {
    if (!path || !cacheKey || seen.has(path)) return;
    seen.add(path);
    entries.push({ path, cacheKey });
  };

  const drums = getDrumsTrack(state);
  (drums?.rows ?? []).forEach((row) => {
    const kit = row.sample?.kit;
    const file = row.sample?.file;
    if (kit && file) add(sampleMediaPath(kit, file), `${kit}/${file}`);
  });

  const loops = getLoopsTrack(state);
  (loops?.loop?.slots ?? []).forEach((slot, slotIndex) => {
    const slotId = slot.id || `slot-${slotIndex}`;
    (slot.bufferKeys ?? []).forEach((cacheKey, layer) => {
      add(loopMediaPath(slotId, layer), cacheKey);
    });
  });

  return entries;
};

const applyRow = (rowDoc, index) => ({
  id: rowDoc.id || `row-${index}`,
  name: rowDoc.name || `Row ${index + 1}`,
  midi: rowDoc.midi ? { ...rowDoc.midi } : { note: 36 + index },
  sample:
    rowDoc.sample?.kit && rowDoc.sample?.file
      ? { kit: rowDoc.sample.kit, file: rowDoc.sample.file }
      : null,
  volume: rowDoc.volume ?? 0.85,
  muted: !!rowDoc.muted,
  inserts: {
    vcf: {
      cutoff: rowDoc.inserts?.vcf?.cutoff ?? 1,
      resonance: rowDoc.inserts?.vcf?.resonance ?? 0,
    },
  },
  sends: {
    reverb: rowDoc.sends?.reverb ?? 0,
    delay: rowDoc.sends?.delay ?? 0,
  },
});

const applyDrumsTrack = (trackDoc, prev) => {
  const rows = (trackDoc.rows ?? []).map(applyRow);
  return {
    id: trackDoc.id || DRUMS_TRACK_ID,
    type: 'sample-seq',
    name: trackDoc.name || 'Drums',
    midi: trackDoc.midi ? { ...trackDoc.midi } : { channel: 10 },
    transport: {
      armed: prev?.transport?.armed !== false,
      playing: false,
      stopPending: false,
    },
    channel: channelDoc(trackDoc.channel),
    rows,
    pattern: {
      steps: trackDoc.pattern?.steps ?? 16,
      measures: measuresFromDoc(trackDoc.pattern?.measures, rows),
    },
  };
};

const applyLoopSlot = (slotDoc, index) => {
  const media = mediaPathList(slotDoc.media);
  const layerCount = Math.max(media.length, Number(slotDoc.layers) || 0, slotDoc.sample ? 1 : 0);
  const hasContent = layerCount > 0 || !!slotDoc.sample;
  const bufferKeys = hasContent
    ? Array.from({ length: Math.max(layerCount, 1) }, (_, layer) => loopBufferKey(index, layer))
    : [];

  return {
    ...createEmptySlot(index),
    id: slotDoc.id || `slot-${index}`,
    name: slotDoc.name || `Slot ${index + 1}`,
    process: hasContent ? 'idle' : 'empty',
    kit: slotDoc.sample?.kit,
    sample: slotDoc.sample?.file,
    bufferKeys,
    sourceBpm: slotDoc.sourceBpm ?? null,
    sourceBpms: Array.isArray(slotDoc.sourceBpms)
      ? [...slotDoc.sourceBpms]
      : slotDoc.sourceBpm != null
        ? [slotDoc.sourceBpm]
        : [],
    layers: bufferKeys.length,
    duration: slotDoc.duration ?? 0,
    params: {
      volume: slotDoc.volume ?? 0.85,
      muted: !!slotDoc.muted,
      vcf: {
        cutoff: slotDoc.inserts?.vcf?.cutoff ?? 0.64,
        resonance: slotDoc.inserts?.vcf?.resonance ?? 0,
      },
      sends: {
        reverb: slotDoc.sends?.reverb ?? 0,
        delay: slotDoc.sends?.delay ?? 0,
      },
    },
  };
};

const applyLoopsTrack = (trackDoc, prev) => {
  const slotDocs = trackDoc.slots ?? [];
  const prevCount = prev?.loop?.slots?.length ?? 4;
  const count = Math.max(slotDocs.length, prevCount, 4);
  const slots = Array.from({ length: count }, (_, i) =>
    slotDocs[i] ? applyLoopSlot(slotDocs[i], i) : createEmptySlot(i),
  );

  return {
    id: trackDoc.id || LOOPS_TRACK_ID,
    type: 'loop',
    name: trackDoc.name || 'Loops',
    transport: {
      armed: true,
      playing: false,
      stopPending: false,
    },
    channel: channelDoc(trackDoc.channel),
    loop: {
      inputId: trackDoc.loop?.inputId ?? 'default',
      clickEnabled: !!trackDoc.loop?.clickEnabled,
      processMic: !!trackDoc.loop?.processMic,
      slots,
    },
  };
};

export const assertProjectDoc = (doc) => {
  if (!doc || typeof doc !== 'object') {
    throw new Error('Invalid project: not an object');
  }
  if (doc.format !== PROJECT_FORMAT) {
    throw new Error(`Invalid project format: expected ${PROJECT_FORMAT}`);
  }
  if (doc.version == null) {
    throw new Error('Invalid project: missing version');
  }
  return doc;
};

/**
 * Merge a parsed project document into live state (pure).
 * Media buffers must be installed into the sample cache beforehand when loading a zip.
 */
export const applyProjectDocument = (doc) => (state) => {
  assertProjectDoc(doc);

  const prevDrums = getDrumsTrack(state);
  const prevLoops = getLoopsTrack(state);
  const drumsDoc = (doc.tracks ?? []).find(
    (t) => t.type === 'sample-seq' || t.id === DRUMS_TRACK_ID,
  );
  const loopsDoc = (doc.tracks ?? []).find((t) => t.type === 'loop' || t.id === LOOPS_TRACK_ID);

  const coreTracks = [
    ...(drumsDoc ? [applyDrumsTrack(drumsDoc, prevDrums)] : prevDrums ? [prevDrums] : []),
    ...(loopsDoc ? [applyLoopsTrack(loopsDoc, prevLoops)] : prevLoops ? [prevLoops] : []),
  ];

  // Preserve any other track types already in state
  const nextTracks = [
    ...coreTracks,
    ...(state.tracks ?? []).filter((track) => {
      if (track.id === DRUMS_TRACK_ID || track.id === LOOPS_TRACK_ID) return false;
      if (track.type === 'sample-seq' || track.type === 'loop') return false;
      return !coreTracks.some((t) => t.id === track.id);
    }),
  ];

  const uiDoc = doc.ui ?? {};
  const settingsDoc = doc.settings;
  return {
    ...state,
    name: doc.name || state.name || 'untitled',
    lang: doc.lang || state.lang || 'en',
    transport: {
      ...state.transport,
      playing: false,
      stopPending: false,
      startTime: 0,
      bpm: doc.transport?.bpm ?? state.transport?.bpm ?? 120,
      timeSignature: [
        ...(doc.transport?.timeSignature ?? state.transport?.timeSignature ?? [4, 4]),
      ],
      resolution: doc.transport?.resolution ?? state.transport?.resolution ?? 16,
    },
    tracks: nextTracks,
    mixer: doc.mixer ? clone(doc.mixer) : state.mixer,
    settings: settingsDoc
      ? {
          ...state.settings,
          ...settingsDoc,
          recording: {
            ...state.settings?.recording,
            ...settingsDoc.recording,
          },
        }
      : state.settings,
    ui: {
      ...state.ui,
      activeWorkspace: uiDoc.activeWorkspace ?? state.ui?.activeWorkspace ?? 'drums',
      workspacesStripOpen: uiDoc.workspacesStripOpen ?? state.ui?.workspacesStripOpen ?? true,
      library: {
        ...state.ui?.library,
        path: Array.isArray(uiDoc.library?.path)
          ? [...uiDoc.library.path]
          : (state.ui?.library?.path ?? ['library', 'samples']),
      },
      drums: {
        ...state.ui?.drums,
        selectedRow: null,
        currentBar: uiDoc.drums?.currentBar ?? 0,
        cuedBar: null,
        deleteArmedBar: null,
        measuresExpanded: !!uiDoc.drums?.measuresExpanded,
        panels: { library: false, settings: false },
      },
      loops: {
        ...state.ui?.loops,
        selectedSlot: null,
        panels: { library: false, settings: false },
      },
    },
  };
};
