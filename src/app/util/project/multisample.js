/**
 * Bitwig/PreSonus `.multisample` export for the drums kit.
 * One single-note zone per assigned row (`low`/`high`/`root` = `row.midi.note`).
 * Spec: https://github.com/bitwig/multisample
 */

import JSZip from 'jszip';
import { samples } from '../../services/audio';
import { getDrumsRows, getDrumsTrack, rowSample } from '../../state/drums';
import { bufferToWav } from '../buffer-to-wav';

const APP_NAME = 'Grooves';
const APP_VERSION = '1.0.0';

/** ZIP STORE (uncompressed) — required by the multisample container notes. */
const STORE = { compression: 'STORE' };

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const safeFileBase = (name) =>
  String(name || 'sample')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'sample';

const linearToDb = (gain) => {
  const g = Number(gain);
  if (!Number.isFinite(g) || g <= 0) return -60;
  return Math.max(-60, Math.min(12, 20 * Math.log10(g)));
};

/**
 * Rows that have a resolvable AudioBuffer + MIDI note.
 * @returns {{ rowIndex: number, note: number, name: string, file: string, buffer: AudioBuffer, gainDb: number }[]}
 */
export const collectDrumMultisampleZones = (state) => {
  const rows = getDrumsRows(state);
  const usedNames = new Set();

  return rows
    .map((row, rowIndex) => {
      const assignment = rowSample(row);
      const note = row?.midi?.note;
      if (!assignment || note == null) return null;
      const buffer = samples.get(samples.key(assignment.kit, assignment.sample));
      if (!buffer) {
        console.warn('multisample: missing buffer', assignment.kit, assignment.sample);
        return null;
      }

      let base = safeFileBase(row.name || assignment.sample);
      let file = `${base}.wav`;
      let n = 2;
      while (usedNames.has(file.toLowerCase())) {
        file = `${base}_${n}.wav`;
        n += 1;
      }
      usedNames.add(file.toLowerCase());

      return {
        rowIndex,
        note: note & 0x7f,
        name: row.name || assignment.sample,
        file,
        buffer,
        gainDb: row.muted ? -60 : linearToDb(row.volume ?? 0.85),
      };
    })
    .filter(Boolean);
};

export const buildMultisampleXml = (state, zones) => {
  const kitName = getDrumsTrack(state)?.name || 'Drums';
  const projectName = state.name ? `${state.name} — ${kitName}` : kitName;

  const sampleBlocks = zones.map((z) => {
    const stop = z.buffer.length;
    // Drum one-shots: single key, no pitch tracking (track=0).
    return [
      `<sample file="${esc(z.file)}" gain="${z.gainDb.toFixed(3)}" sample-start="0" sample-stop="${stop}" group="-1">`,
      `  <key root="${z.note}" low="${z.note}" high="${z.note}" track="0" tune="0" low-fade="0" high-fade="0"/>`,
      `  <velocity low="0" high="127" low-fade="0" high-fade="0"/>`,
      `  <select low="0" high="127" low-fade="0" high-fade="0"/>`,
      `  <loop mode="off" start="0" stop="${stop}" fade="0"/>`,
      `</sample>`,
    ].join('\n');
  });

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<multisample name="${esc(projectName)}">`,
    `  <generator>${esc(APP_NAME)} ${esc(APP_VERSION)}</generator>`,
    `  <category>Drum</category>`,
    `  <creator>${esc(APP_NAME)}</creator>`,
    `  <description>Drum kit from ${esc(kitName)} (one zone per row MIDI note).</description>`,
    `  <keywords>`,
    `    <keyword>Drum</keyword>`,
    `    <keyword>Grooves</keyword>`,
    `  </keywords>`,
    ...sampleBlocks.map((block) =>
      block
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n'),
    ),
    `</multisample>`,
    ``,
  ].join('\n');
};

/** Pack a `.multisample` ZIP (STORED) — `multisample.xml` + WAVs. */
export const packMultisample = async (state) => {
  const zones = collectDrumMultisampleZones(state);
  if (!zones.length) {
    throw new Error('No drum row samples available for .multisample export');
  }

  const zip = new JSZip();
  zip.file('multisample.xml', buildMultisampleXml(state, zones), STORE);

  await Promise.all(
    zones.map(async (z) => {
      const wav = bufferToWav(z.buffer);
      zip.file(z.file, await wav.arrayBuffer(), STORE);
    }),
  );

  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
};
