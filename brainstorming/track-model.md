# Track Model & Naming

**Date:** 2026-06-21  
**Status:** Brainstorming — structural rethink

## Problem

Grooves overloads **“tracks”** in two ways at once:

1. **`sequencer.tracks`** is a **row count** — but those rows are **not** session tracks.
2. The **4-row grid is one drum part** — each row is a **different sound / MIDI note** (kick, snare, hat, …) on the same pattern, like a drum rack or TR-style row matrix.

That made sense for an MVP single drum-machine screen, but it breaks down when adding:

- **More session tracks** (a second drum kit, loops, instruments) — each needs its own workspace
- **Loop tracks** (js-loop-station — layered audio loops)
- **Instrument tracks** (jam-station `type: 'piano'` — piano roll, synth/sampler notes)
- **MIDI** I/O per **session track** (channel per part, note per row)
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

MVP UI looks like four “tracks”, but structurally it is **one implicit drum track**:

- `sequencer.tracks` — **row count** inside that part (e.g. 4 sounds)
- `sequencer.assignments[i]` — sample for row *i*
- `sequencer.grid[i][step]` — on/off for row *i*
- `sequencer.trackParams[i]` — volume, mute, FX per row

Row index is used as ID everywhere — no session `tracks[]`, no types, no per-row MIDI note field yet. Each row **should** map to a **MIDI note** (e.g. kick → 36, snare → 38) on the part’s channel (drums → 10).

### DAWproject

- **Structure** tree: tracks, folders, channels
- **Arrangement**: lanes, clips (audio or notes)
- **Mixer**: channel strips, inserts, **sends**

Separates **timeline track**, **mixer channel**, and **clip content** — more granular than either app above.

---

## Naming options

| Term | Meaning | Pros | Cons |
|------|---------|------|------|
| **Track** | Session-level part (jam-station style) | Familiar; one workspace tab, one mixer strip | Was confused with grid rows |
| **Row** | One line in the step grid **inside** a `sample-seq` track | Matches current UI; one sample, one MIDI note | Doesn’t fit loop/instrument editors |
| **Lane** | Arrangement row (DAWproject Lanes) — clips on a timeline | Neutral; future multi-clip tracks | Not the same as a grid row |
| **Channel** | Mixer/MIDI channel | MIDI-standard | Conflicts with “16 MIDI channels” |
| **Strip** | Mixer strip | Clear in routing view | Awkward for arrangement |
| **Part** | Groovebox “part” (hardware term) | Matches Akai/Roland vocabulary | Less common in web apps |

**Working recommendation:**

- **`track`** — session-level entity (keep user-facing word).
- **`track.type`** — discriminates behavior (see below).
- **`row`** (within `sample-seq`) — one sound in the grid; **`midi.note`** per row.
- **`pattern` / `clips`** — type-specific content at track level (not “the track” itself).
- **`mixer`** — per-track strip + optional per-row gain inside drum parts (see open questions).

Avoid using “track” in code for **grid row index** — use **`trackId`** for session entities and **`rowId`** / row index inside a `sample-seq` track.

---

## Group tracks (composite)

**Decision:** sequencer, loop, instrument, etc. are **group tracks** (also **composite** or **root tracks**) — one identity for the **strip**, **mixer**, and **export**, with **sub-parts** inside for editing detail.

| Layer | Role | Mixer | Export (MIDI / DAW) |
|-------|------|-------|---------------------|
| **Group track** | Session part (Drums, Loop A, Bass) | **One column** — vol, mute, solo, sends | **One track** / one structure channel |
| **Sub-part** | Internal editor unit | **Not in mixer** (for now) | Events folded into parent track |

### Sub-parts by type

| Group track type | Sub-parts | Sub-part can have |
|----------------|-----------|-------------------|
| `sample-seq` | **Rows** (kick, snare, …) | Sample, step grid, **per-row filter (VCF)**, per-row send levels |
| `loop` | **Slots** (e.g. 4 loops) | Buffer, overdub; per-slot filter/send (future) |
| `instrument` | **Clips** / regions | Notes, sound; per-clip or inst chain (future) |

Sub-part **filter and send** settings are edited in the **track workspace** (e.g. track settings for the selected row). They affect **audio routing** for that sub-part but do **not** get a separate mixer column.

### Mixer

- **Root level only** — one column per **group track**, plus bus columns and master.
- No per-row / per-slot sub-faders in the mixer workspace (slice 1 and foreseeable near term).
- `track.mixer` — volume, mute, solo, sends for the whole group.

### Export

- **MIDI:** one exported MIDI track per **group track** (e.g. all drum rows → note events on **one** channel/track; row `midi.note` distinguishes kick vs snare).
- **DAWproject:** one **structure** track per group; sub-parts may map to **lanes** or note clips inside that track, not separate mixer channels in our export subset.
- **Native JSON/ZIP:** full fidelity — `rows[]`, per-row inserts/sends preserved.

Internal audio graph may still use **per-sub-part nodes** (today: `track-0`…`track-3` routing); export and mixer UI collapse to the **group** boundary.

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

### `sample-seq` (drum / rhythm part)

One **track** = one workspace = **multi-row step grid** (today’s whole sequencer screen, for that part only).

```javascript
{
  id: 'trk-drums',
  type: 'sample-seq',
  name: 'Drums',
  midi: { channel: 10 },           // one channel for the part
  pattern: {
    steps: 16,
    resolution: 16,
  },
  rows: [
    {
      id: 'row-kick',
      name: 'Kick',
      midi: { note: 36 },
      sample: { kit: 'basic_drum_kit', file: 'PD-KICK-03.wav' },
      grid: [1, 0, 0, 0, /* … */],
      inserts: { vcf: { cutoff, resonance } },  // sub-part filter
      sends: { reverb, delay },                 // sub-part send levels (editor)
    },
    {
      id: 'row-snare',
      name: 'Snare',
      midi: { note: 38 },
      sample: { kit: 'basic_drum_kit', file: 'SNARE-01.wav' },
      grid: [0, 0, 1, 0, /* … */],
      inserts: { /* … */ },
      sends: { /* … */ },
    },
    // … more rows (sounds / MIDI notes)
  ],
  mixer: { volume, muted, solo, sends },  // group track — mixer column + export level
}
```

Each **row** = one sample + one grid line + one **MIDI note** inside the **group**; export and mixer treat the parent as **one track**.

**`loop` (future)** — same pattern: e.g. 4 slots as sub-parts, `track.mixer` at group level, one MIDI/structure track on export.

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

**Direction:** see [`transport.md`](transport.md) for session vs per-track transport, shared `startTime`, and scheduler split.

```
state.session.title
state.transport.{ bpm, timeSignature, resolution, playing, startTime, playhead }
state.tracks[]                    // typed track list
state.mixer.{ master, buses }     // shared reverb/delay — see audio-routing-and-fx.md
state.library.{ ... }             // unchanged
state.ui.{ selectedTrackId, panels, theme, ... }
```

Sequencer UI becomes **one editor** for `type === 'sample-seq'` tracks; piano-roll UI for `instrument`; loop UI for `loop`.

**Migration:** v0 → v1 maps the **entire current sequencer** (all rows) → **one** `sample-seq` track with `rows[]`. Row *i* ← `assignments[i]` + `grid[i]` + `trackParams[i]` + default `midi.note` map. Additional session tracks (loop, instrument) are new strip tabs, not new rows in that grid.

---

## MIDI & project structure

| Concern | Where it lives |
|---------|----------------|
| Part → MIDI channel | `track.midi.channel` (e.g. drums on 10) |
| Row → note number | `track.rows[n].midi.note` |
| Step hit → note on | row grid on + row’s `midi.note` on track channel |
| External clock | `transport` + service (jam-station `midi.js`) |
| Export to `.mid` | **One MIDI track per group track** — all row notes on same track/channel |
| Import from `.mid` | Match notes to rows within a group or spawn rows; **no sample bind** without map |

DAWproject import/export: **one structure track per group**; sub-parts as lanes/clips inside it, not separate exported mixer strips.

---

## UI implications

- **One workspace per session track** — strip tab selects type-specific editor; see [`workspaces.md`](workspaces.md).
- **`sample-seq` workspace** — **multi-row grid** (today’s 4-row UI is one such track, not four tracks).
- Row select — pick row for sample assign + **sub-part** settings (waveform, VCF, sends); not a mixer strip.
- Track add menu: “Sample sequence”, “Loop”, “Instrument” (disabled until implemented).
- Routing diagram: one node per **group track** + busses; sub-parts optional inside drum groups (later).
- Mixer: **one column per group track** only — see [`workspaces.md`](workspaces.md); no row/slot granularity.

---

## Relationship to “one sample per row”

**One sample per grid row** is correct — each row is a different **MIDI note** / sound in the same drum part. That is not “one sample per session track”.

- **Session track** = one part in the song (Drums, Bass loop, Synth) → one workspace tab.
- **Row** = one lane in that part’s editor (kick row, snare row, …).

The MVP collapses the whole session into **one implicit `sample-seq` track** with N rows. The strip model adds **more session tracks** alongside it, not more rows split into separate tabs.

Analogies:

- **Roland TR / drum rack:** many rows, **one kit part** — maps to one `sample-seq` track workspace.
- **Novation Circuit / Akai Force:** several **parts** (drum / synth / loop) — maps to multiple strip tabs.

Grooves: **unified session track list** (strip) + **type-specific editor** (workspace) + **rows inside** drum-type tracks.

---

## Open questions

- [ ] Fixed row count (4/8/16) vs dynamic add/remove rows inside a part?
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
