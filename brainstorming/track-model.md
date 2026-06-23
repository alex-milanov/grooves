# Track Model & Naming

**Date:** 2026-06-21  
**Status:** Brainstorming — structural rethink

## Problem

Grooves uses **“tracks”** for what are really **sample sequencer rows** — one sample, one step grid, one mixer strip. That made sense for the MVP drum machine, but it breaks down when adding:

- **Loop tracks** (js-loop-station — layered audio loops)
- **Instrument tracks** (jam-station `type: 'piano'` — piano roll, synth/sampler notes)
- **MIDI** I/O per track (channels, devices)
- **Project formats** that distinguish **arrangement track** vs **mixer channel** (DAWproject)

We need a model that scales without renaming everything twice.

---

## How sibling apps model it

### jam-station (`session.tracks[]`)

Each **track** has:

- `type`: `'seq'` | `'piano'` (extensible)
- `name`, MIDI `input` / `output` (device + channel)
- `inst` — instrument state (sampler or synth + **effectsChain**)
- `measures[]` — either **pattern** (seq) or **events** (piano)

One track = one logical part (Drums, Bassline) with its own editor and instrument.

### grooves (today)

- `sequencer.tracks` — **count** of rows (number)
- `sequencer.assignments[i]` — sample for row *i*
- `sequencer.grid[i][step]` — on/off
- `sequencer.trackParams[i]` — volume, mute

Row index *is* the track ID — no types, no names, no MIDI.

### DAWproject

- **Structure** tree: tracks, folders, channels
- **Arrangement**: lanes, clips (audio or notes)
- **Mixer**: channel strips, inserts, **sends**

Separates **timeline track**, **mixer channel**, and **clip content** — more granular than either app above.

---

## Naming options

| Term | Meaning | Pros | Cons |
|------|---------|------|------|
| **Track** | Top-level session lane (jam-station style) | Familiar; DAWproject has Track | Currently overloaded in grooves UI |
| **Row** | Sequencer grid horizontal strip | Matches current UI | Doesn’t fit loop/instrument lanes |
| **Lane** | Arrangement row (DAWproject Lanes) | Neutral; works for all types | Less familiar to users |
| **Channel** | Mixer/MIDI channel | MIDI-standard | Conflicts with “16 MIDI channels” |
| **Strip** | Mixer strip | Clear in routing view | Awkward for arrangement |
| **Part** | Groovebox “part” (hardware term) | Matches Akai/Roland vocabulary | Less common in web apps |

**Working recommendation:**

- **`track`** — session-level entity (keep user-facing word).
- **`track.type`** — discriminates behavior (see below).
- **`pattern` / `clips`** — type-specific content (not “the track” itself).
- **`mixer`** — volume, mute, pan, inserts, sends (may mirror track 1:1 at first).

Avoid using “track” in code for **both** row index and session entity — use **`trackId`** (string/uuid) soon, not bare index.

---

## Track types (draft)

```javascript
// type enum — names open for bikeshedding
'sample-seq'   // current grooves: sample + step grid (drum/rhythm)
'loop'         // js-loop-station: audio loop layer, overdub, sync to transport
'instrument'   // jam-station piano: notes, synth or sample-based pitched
// future:
'audio'        // long audio clip track (DAW-style)
'aux'          // reverb/delay return? or busses stay in mixer only
```

### `sample-seq` (today’s rows)

```javascript
{
  id: 'trk-kick',
  type: 'sample-seq',
  name: 'Kick',
  sample: { kit: 'basic_drum_kit', file: 'PD-KICK-03.wav' },
  pattern: {
    steps: 16,
    resolution: 16,
    grid: [1,0,0,0, ...],
  },
  midi: { channel: 10, note: 36 },  // optional: pad trigger / export map
  mixer: { volume, muted, inserts, sends },
}
```

### `loop` (future)

```javascript
{
  id: 'trk-loop-a',
  type: 'loop',
  name: 'Loop A',
  loop: {
    bufferRef: 'samples/loop-a.wav',
    start: 0,
    end: 4,       // bars or seconds
    overdub: false,
  },
  mixer: { ... },
}
```

### `instrument` (future)

```javascript
{
  id: 'trk-bass',
  type: 'instrument',
  name: 'Bass',
  source: 'synth' | 'sampler',
  inst: { /* jam-station instrument blob */ },
  clips: [
    { start: 0, duration: 4, notes: [{ pitch: 'C2', start, duration, vel }] },
  ],
  midi: { input: { device, channel }, output: { ... } },
  mixer: { ... },
}
```

---

## State shape migration (conceptual)

**Today:**

```
state.sequencer.{ tracks, grid, assignments, trackParams, bpm, ... }
```

**Direction:**

```
state.session.title
state.transport.{ bpm, timeSignature, resolution, playing, playhead }
state.tracks[]                    // typed track list
state.mixer.{ master, buses }     // shared reverb/delay — see audio-routing-and-fx.md
state.library.{ ... }             // unchanged
state.ui.{ selectedTrackId, panels, theme, ... }
```

Sequencer UI becomes **one editor** for `type === 'sample-seq'` tracks; piano-roll UI for `instrument`; loop UI for `loop`.

**Migration:** v0 → v1 converter maps `sequencer.assignments[i]` + `grid[i]` → `tracks[i].type = 'sample-seq'`.

---

## MIDI & project structure

| Concern | Where it lives |
|---------|----------------|
| Track → MIDI channel | `track.midi.channel` (drums on 10, etc.) |
| Step → note number | `track.midi.note` or per-step velocity map |
| External clock | `transport` + service (jam-station `midi.js`) |
| Export to `.mid` | Flatten `sample-seq` patterns + `instrument` clips |
| Import from `.mid` | Create/update tracks; **no sample bind** without map |

DAWproject import/export uses **Structure + Arrangement** — our `tracks[]` maps to Structure; patterns/clips map to Arrangement lanes.

---

## UI implications

- Sequencer grid: show **only `sample-seq` tracks** (or subset visible).
- Track add menu: “Sample sequence”, “Loop”, “Instrument” (disabled until implemented).
- Track settings panel: **type-aware** — waveform for sample-seq, ADSR for instrument, loop controls for loop.
- Routing diagram: one node per track + busses (all types share mixer).

---

## Relationship to “split samples as tracks”

What we did (one sample per row) is correct for **drum-machine / sample-seq** workflow — same as one lane per sound on hardware grooveboxes. The issue isn’t “one sample per track”, it’s that **not every track is a sample-seq**.

Analogies:

- **Roland TR-style:** sample-seq tracks only.
- **Novation Circuit / Akai Force:** tracks can be drum, synth, or loop — same button, different mode per track.

Grooves heading toward the second — **unified track list**, **type-specific editor**.

---

## Open questions

- [ ] Fixed track count (4/8/16) vs dynamic add/remove?
- [ ] UUID `track.id` now or when project save lands?
- [ ] Rename UI “Tracks” → “Parts” or keep “Tracks”?
- [ ] One pattern per sample-seq track vs multiple patterns/scenes (groovebox patterns)?
- [ ] Align field names with jam-station `session.tracks` for easier shared JSON?

---

## Suggested order

1. Introduce **`tracks[]` with `type: 'sample-seq'`** — refactor from index-based sequencer state without new types yet.
2. Add **`mixer` + sends** (ties to FX brain dump).
3. **`project.json` v1** using new shape.
4. Add **`loop`** type when loop playback exists.
5. Add **`instrument`** type with MIDI + MusicXML export path.
