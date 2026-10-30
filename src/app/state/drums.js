import { DRUMS_TRACK_ID } from './transport';
import { DEFAULT_ROW_PARAMS } from '../util/row-params';

export { DRUMS_TRACK_ID };

const DEFAULT_MIDI_NOTES = [36, 38, 42, 45];

export const createDrumRow = (index, sample = null) => ({
  id: `row-${index}`,
  name: sample?.file ? sample.file.replace(/\.[^.]+$/, '') : `Row ${index + 1}`,
  midi: { note: DEFAULT_MIDI_NOTES[index] ?? 36 + index },
  sample, // { kit, file } | null
  volume: DEFAULT_ROW_PARAMS.volume,
  muted: DEFAULT_ROW_PARAMS.muted,
  inserts: { vcf: { ...DEFAULT_ROW_PARAMS.vcf } },
  sends: { ...DEFAULT_ROW_PARAMS.sends },
});

export const createDrumsTrack = (rowCount = 4) => ({
  id: DRUMS_TRACK_ID,
  type: 'sample-seq',
  name: 'Drums',
  transport: {
    armed: true,
    playing: false,
    stopPending: false,
  },
  channel: {
    volume: 1,
    muted: false,
    solo: false,
    pan: 0.5,
    sends: { reverb: 0, delay: 0 },
  },
  rows: [
    createDrumRow(0, { kit: 'basic_drum_kit', file: 'PD-KICK-03.wav' }),
    createDrumRow(1, { kit: 'basic_drum_kit', file: 'Rpeople_Snare3.wav' }),
    createDrumRow(2, { kit: 'basic_drum_kit', file: 'HCR-01.wav' }),
    createDrumRow(3, null),
  ].slice(0, rowCount),
  pattern: {
    steps: 16,
    measures: [{}],
  },
});

export const getDrumsTrack = (state) =>
  state.tracks?.find((t) => t.id === DRUMS_TRACK_ID);

export const mapDrumsTrack = (state, fn) => {
  const track = getDrumsTrack(state);
  if (!track) return state;
  const next = fn(track);
  if (next === track) return state;
  return {
    ...state,
    tracks: state.tracks.map((t) => (t.id === DRUMS_TRACK_ID ? next : t)),
  };
};

export const getDrumsRows = (state) => getDrumsTrack(state)?.rows ?? [];

export const getDrumsPattern = (state) =>
  getDrumsTrack(state)?.pattern ?? { steps: 16, measures: [{}] };

export const drumsRowCount = (state) => getDrumsRows(state).length;

export const getDrumRow = (state, index) => getDrumsRows(state)[index] ?? null;

/** Library/buffer key shape: { kit, sample } from row.sample { kit, file }. */
export const rowSample = (row) => {
  const kit = row?.sample?.kit;
  const file = row?.sample?.file;
  return kit && file ? { kit, sample: file } : null;
};

export const hasRowSample = (row) => !!rowSample(row);

/** Shape expected by getRowParams / routing / waveform. */
export const rowParamsMap = (state) => {
  const rows = getDrumsRows(state);
  return rows.reduce((map, row, i) => {
    map[i] = {
      volume: row.volume ?? DEFAULT_ROW_PARAMS.volume,
      muted: row.muted ?? DEFAULT_ROW_PARAMS.muted,
      vcf: { ...DEFAULT_ROW_PARAMS.vcf, ...row.inserts?.vcf },
      sends: { ...DEFAULT_ROW_PARAMS.sends, ...row.sends },
    };
    return map;
  }, {});
};

export const patchDrumsChannel = (patch) => (state) =>
  mapDrumsTrack(state, (t) => ({
    ...t,
    channel: { ...t.channel, ...patch },
  }));

export const patchDrumRow = (rowIndex, patch) => (state) =>
  mapDrumsTrack(state, (t) => ({
    ...t,
    rows: t.rows.map((row, i) => (i === rowIndex ? { ...row, ...patch } : row)),
  }));

export const patchDrumRowNested = (rowIndex, path, value) => (state) =>
  mapDrumsTrack(state, (t) => ({
    ...t,
    rows: t.rows.map((row, i) => {
      if (i !== rowIndex) return row;
      if (path[0] === 'vcf' || path[0] === 'inserts') {
        const vcfPath = path[0] === 'inserts' ? path.slice(1) : path;
        // path like ['vcf', 'cutoff'] or ['inserts', 'vcf', 'cutoff']
        if (vcfPath[0] === 'vcf') {
          return {
            ...row,
            inserts: {
              ...row.inserts,
              vcf: { ...row.inserts?.vcf, [vcfPath[1]]: value },
            },
          };
        }
      }
      if (path[0] === 'sends') {
        return { ...row, sends: { ...row.sends, [path[1]]: value } };
      }
      if (path.length === 1) return { ...row, [path[0]]: value };
      return row;
    }),
  }));

export const assignDrumRowSample = (rowIndex, kit, file) => (state) =>
  mapDrumsTrack(state, (t) => ({
    ...t,
    rows: t.rows.map((row, i) =>
      i === rowIndex
        ? {
            ...row,
            sample: { kit, file },
            name: file.replace(/\.[^.]+$/, ''),
          }
        : row,
    ),
  }));

export const setDrumsRowCount = (count) => (state) =>
  mapDrumsTrack(state, (t) => {
    const n = Math.max(1, count);
    let rows = [...t.rows];
    while (rows.length < n) rows.push(createDrumRow(rows.length));
    if (rows.length > n) rows = rows.slice(0, n);
    return { ...t, rows };
  });
