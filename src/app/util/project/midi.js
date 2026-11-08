/**
 * Minimal Standard MIDI File (SMF Type 1) export for grooves drum patterns.
 * One note track: all drum rows on the part MIDI channel (default 10 → wire ch 9).
 * Loops / audio are not represented.
 */

import { getDrumsTrack } from '../../state/drums';
import { measuresList, stepsPerBar } from '../../state/sequencer-measures';
import { beatsPerBar } from '../transport-clock';

const PPQ = 480;
const NOTE_VEL = 100;
/** Hit length as a fraction of one step (keeps notes from overlapping oddly). */
const NOTE_STEP_FRAC = 0.5;

const writeStr = (view, offset, str) => {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  return offset + str.length;
};

/** MIDI variable-length quantity. */
const encodeVlq = (value) => {
  let n = value >>> 0;
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return bytes;
};

const appendBytes = (out, bytes) => {
  bytes.forEach((b) => out.push(b & 0xff));
};

const appendVlq = (out, value) => appendBytes(out, encodeVlq(value));

const buildTrackChunk = (events) => {
  // events: { tick, status, data: number[] } sorted by tick; delta-encoded
  let body = [];
  let lastTick = 0;
  events.forEach((ev) => {
    const delta = Math.max(0, ev.tick - lastTick);
    lastTick = ev.tick;
    appendVlq(body, delta);
    body.push(ev.status & 0xff);
    appendBytes(body, ev.data);
  });
  // End of track
  appendVlq(body, 0);
  body.push(0xff, 0x2f, 0x00);

  let chunk = new Uint8Array(8 + body.length);
  const view = new DataView(chunk.buffer);
  writeStr(view, 0, 'MTrk');
  view.setUint32(4, body.length);
  chunk.set(body, 8);
  return chunk;
};

/**
 * Collect absolute-tick note on/off pairs from the drums pattern.
 * @returns {{ tick: number, status: number, data: number[] }[]}
 */
export const collectDrumMidiEvents = (state) => {
  const track = getDrumsTrack(state);
  const rows = track?.rows ?? [];
  const measures = measuresList(state);
  const perBar = stepsPerBar(state);
  const beats = beatsPerBar(state.transport);
  const ticksPerStep = (PPQ * beats) / perBar;
  const noteTicks = Math.max(1, Math.round(ticksPerStep * NOTE_STEP_FRAC));

  // MIDI channel 1–16 in docs → 0–15 on the wire. Channel 10 → 9.
  const channelDoc = track?.midi?.channel ?? 10;
  const channel = Math.max(0, Math.min(15, (Number(channelDoc) || 10) - 1));

  let events = [];
  measures.forEach((measure, bar) => {
    rows.forEach((row, rowIndex) => {
      const note = row?.midi?.note;
      if (note == null) return;
      const steps = measure?.[rowIndex] ?? measure?.[String(rowIndex)] ?? {};
      Object.entries(steps).forEach(([stepKey, on]) => {
        if (!on) return;
        const step = Number(stepKey);
        if (!Number.isFinite(step)) return;
        const tick = Math.round((bar * perBar + step) * ticksPerStep);
        events = [
          ...events,
          {
            tick,
            status: 0x90 | channel,
            data: [note & 0x7f, NOTE_VEL],
          },
          {
            tick: tick + noteTicks,
            status: 0x80 | channel,
            data: [note & 0x7f, 0],
          },
        ];
      });
    });
  });

  return events.slice().sort((a, b) => a.tick - b.tick || a.status - b.status);
};

const tempoMetaEvents = (bpm, timeSignature) => {
  const usPerQuarter = Math.round(60_000_000 / (bpm || 120));
  const num = timeSignature?.[0] ?? 4;
  const den = timeSignature?.[1] ?? 4;
  // MIDI stores denominator as power of 2: 2→1, 4→2, 8→3, 16→4
  const denPow = Math.round(Math.log2(den));

  // Set tempo (FF 51 03 tttttt) + time signature (FF 58 04 nn dd cc bb)
  return [
    {
      tick: 0,
      status: 0xff,
      data: [
        0x51,
        0x03,
        (usPerQuarter >> 16) & 0xff,
        (usPerQuarter >> 8) & 0xff,
        usPerQuarter & 0xff,
      ],
    },
    {
      tick: 0,
      status: 0xff,
      data: [0x58, 0x04, num & 0xff, denPow & 0xff, 24, 8],
    },
  ];
};

/** Build a Type-1 SMF ArrayBuffer: conductor track + drums track. */
export const buildMidiFile = (state) => {
  const bpm = state.transport?.bpm ?? 120;
  const timeSignature = state.transport?.timeSignature ?? [4, 4];
  const noteEvents = collectDrumMidiEvents(state);

  const header = new Uint8Array(14);
  const hv = new DataView(header.buffer);
  writeStr(hv, 0, 'MThd');
  hv.setUint32(4, 6);
  hv.setUint16(8, 1); // Type 1
  hv.setUint16(10, 2); // 2 tracks
  hv.setUint16(12, PPQ);

  const conductor = buildTrackChunk(tempoMetaEvents(bpm, timeSignature));
  const drums = buildTrackChunk(noteEvents);

  let out = new Uint8Array(header.length + conductor.length + drums.length);
  out.set(header, 0);
  out.set(conductor, header.length);
  out.set(drums, header.length + conductor.length);
  return out.buffer;
};

export const midiBlob = (state) => new Blob([buildMidiFile(state)], { type: 'audio/midi' });
