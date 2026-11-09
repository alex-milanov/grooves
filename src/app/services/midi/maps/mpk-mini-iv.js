/** Factory User / Notes layout for Akai MPK mini IV (performance MIDI Port). */

export const id = 'mpk-mini-iv';
export const label = 'MPK mini IV';

export const legend = [
  'Bank A bottom (36–39): drum rows 0–3 · top (40–43): prev/next row·slot / library / settings',
  'Encoder (ch 1): CC14 browse library · click CC13 enter/.. or assign sample',
  'Bank B pads (ch 10): loops play/rec · stop · dbl-tap stop = clear',
  'Transport buttons (DAW Port): Play/Pause · Record arm',
  'Keys C3 / D3 (ch 1): session play / stop (MIDI Port fallback)',
  'Encoders CC 27–31 (ch 1): selected row/slot volume · cutoff · res · reverb · delay',
  'Knobs CC 70–77 (ch 1, MIDI Port): loop gains, master, BPM, row gain/cutoff',
];

/**
 * Bank A physical grid (bottom-left = pad 1):
 *   [40]=prev  [41]=next  [42]=library  [43]=settings
 *   [36]=row0  [37]=row1  [38]=row2     [39]=row3
 */
export const BANK_A_NOTE_MIN = 36;
export const BANK_A_NOTE_MAX = 43;

/** `${channel}:${note}` → command (Bank A handled before row.midi.note). */
export const notes = {
  // Bank A bottom — drum triggers
  '10:36': { type: 'drums.preview', row: 0 },
  '10:37': { type: 'drums.preview', row: 1 },
  '10:38': { type: 'drums.preview', row: 2 },
  '10:39': { type: 'drums.preview', row: 3 },
  // Bank A top — workspace UI (active drums/loops selection)
  '10:40': { type: 'ui.prev' },
  '10:41': { type: 'ui.next' },
  '10:42': { type: 'ui.toggleLibrary' },
  '10:43': { type: 'ui.toggleSettings' },
  // Bank B — loops
  '10:44': { type: 'loops.playRec', slot: 0 },
  '10:45': { type: 'loops.playRec', slot: 1 },
  '10:46': { type: 'loops.playRec', slot: 2 },
  '10:47': { type: 'loops.playRec', slot: 3 },
  '10:48': { type: 'loops.stop', slot: 0 },
  '10:49': { type: 'loops.stop', slot: 1 },
  '10:50': { type: 'loops.stop', slot: 2 },
  '10:51': { type: 'loops.stop', slot: 3 },
  // Keys — session transport
  '1:48': { type: 'session.togglePlay' },
  '1:50': { type: 'session.stop' },
};

export const dblNotes = {
  '10:48': { type: 'loops.clear', slot: 0 },
  '10:49': { type: 'loops.clear', slot: 1 },
  '10:50': { type: 'loops.clear', slot: 2 },
  '10:51': { type: 'loops.clear', slot: 3 },
};

/** `${channel}:${cc}` → continuous control (performance MIDI Port knobs). */
export const controllers = {
  // Big encoder — prefer Rel mode for browse; click assigns / opens folder
  '1:14': { type: 'library.browse', relative: true },
  '1:13': { type: 'library.select', button: true },
  // Selection mix/FX (current drum row or loop slot)
  '1:27': { type: 'selection.volume' },
  '1:28': { type: 'selection.cutoff' },
  '1:29': { type: 'selection.resonance' },
  '1:30': { type: 'selection.reverb' },
  '1:31': { type: 'selection.delay' },
  '1:70': { type: 'loops.gain', slot: 0 },
  '1:71': { type: 'loops.gain', slot: 1 },
  '1:72': { type: 'loops.gain', slot: 2 },
  '1:73': { type: 'loops.gain', slot: 3 },
  '1:74': { type: 'mixer.master' },
  '1:75': { type: 'transport.bpm', min: 60, max: 200 },
  '1:76': { type: 'drums.rowGain' },
  '1:77': { type: 'drums.vcfCutoff' },
};

/**
 * Hardware transport on DAW / Software Control Port (Ardour / Akai script CCs).
 * Same CC numbers as knobs on MIDI Port — port name selects the map.
 * `button: true` → fire only on press (value > 0), ignore release.
 */
export const dawControllers = {
  '1:14': { type: 'library.browse', relative: true },
  '1:13': { type: 'library.select', button: true },
  '1:76': { type: 'session.togglePlay', button: true },
  '1:77': { type: 'drums.toggleRecord', button: true },
};

export default {
  id,
  label,
  legend,
  notes,
  dblNotes,
  controllers,
  dawControllers,
  BANK_A_NOTE_MIN,
  BANK_A_NOTE_MAX,
};
