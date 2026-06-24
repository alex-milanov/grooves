# Loop Tracks — MVP Brainstorm

**Date:** 2026-06-24  
**Status:** Brainstorming  
**Reference:** [js-loop-station](file:///Users/alexem/Projects/dev/music/js-loop-station) (`~/Projects/dev/music/js-loop-station`)  
**Related:** [`track-model.md`](track-model.md), [`transport.md`](transport.md), [`workspaces.md`](workspaces.md), [`ecosystem.md`](ecosystem.md)

---

## Goal

Add a **`loop` group track** as the second session workspace — **4 loop slots** (lanes / parts) in one loop layer, like js-loop-station’s 4 channels but **locked to Grooves session transport** (shared `startTime`, global BPM).

**In scope (MVP brainstorm):**

- One **`loop`-type session track** (e.g. “Loops”) with **4 slots**
- Workspace UI modeled on **sequencer layout**: chrome header + main lanes + library panel + per-slot settings
- **Pre-recorded loops** from library (`src/assets/loops/`) + **live overdub** recording
- **Separate `loops` service** + **`recording` util** (shared later with sample-record on drums)
- **Musical quantize** to global `transport.bpm` / meter (upgrade from js-loop-station’s sample-count quantize)
- **Virtual click** on first slot record when drums aren’t playing (establish bar grid; BPM detect later)

**Out (later):**

- Per-loop independent BPM playback (stretch) — field exists, behavior deferred
- BPM detection from audio
- Full `synced` vs `independent` record modes (js-loop-station toggle was a stub)
- Mixer column for loop track (follows existing group-track mixer plan)

---

## Terminology

| Term | Meaning |
|------|---------|
| **Session track** | Strip tab + workspace — one `loop` group track |
| **Slot / lane / part** | One of **4** loop buffers inside that track (js-loop-station “channel”) |
| **Layer** | One overdub pass on a slot — multiple looping `BufferSource`s stacked |
| **Slot duration** | Quantized length in seconds — **≥ 1 bar** at global BPM; **per slot** (no shared master length) |

Same pattern as drums: **4 slots ≠ 4 session tracks**. One mixer column, one workspace, one export track.

---

## Reference: js-loop-station

| js-loop-station | Grooves MVP |
|-----------------|-------------|
| 4 independent channels | 4 **slots** inside one `loop` session track |
| No BPM / metronome | **Global `transport.bpm`** + bar quantize |
| `startedAt` on button press | Align to **session `startTime`** + next bar boundary when synced |
| `process`: empty/record/play/overdub/idle | Same state machine **per slot** |
| `baseLength` + sample quantize | **Per-slot** bar quantize from `transport` (min 1 bar) |
| `recordMode: synced` (unused) | Real **sync-to-session**; record starts on **bar boundary** |
| Per-channel mic input | **One shared input** on loop track (default device) |
| Global stop/play/clear all | Track header + session transport |
| No click during record | **Virtual click** when needed (see below) |

Key files to mine: `actions/index.js`, `services/audio.js`, `util/recorder.js`, `ui/channel.js`.

---

## Workspace UI (target)

Mirror **Drums** workspace flex: **library | loop lanes | slot settings**.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Loop header (like sequencer header)                                      │
│  [ Loops ]  [▶][■] Clear all   Input: [mic ▼]   …spacer…   [library][⚙] │
├──────────┬───────────────────────────────────────────────┬───────────────┤
│ Library  │  Slot 0    Slot 1    Slot 2    Slot 3         │ Slot settings │
│ (loops   │  (round    (round    (round    (round          │ (selected     │
│  kit)    │   play/    play/     play/     play/           │  slot: gain,  │
│          │   rec UI)  rec UI)   rec UI)   rec UI)         │  monitor, …)  │
└──────────┴───────────────────────────────────────────────┴───────────────┘
```

### Header (left)

| Control | Behavior |
|---------|----------|
| **Title** | Track name (“Loops”) |
| **Input source** | Mic device / line-in / “from library” per slot or shared default |
| **Start all / Stop all** | All slots → play or idle (js-loop-station playAll/stopAll) |
| **Clear all** | Empty all slots (confirm deferred) |

Per-slot **play/rec/overdub** stays on each lane button (js-loop-station pattern), not only in header.

### Header (right)

| Control | Behavior |
|---------|----------|
| **Library toggle** | Opens **loops library** — browse `assets/loops/` (zip kit like drum kits) |
| **Settings toggle** | Per-**slot** settings panel (same panel pattern as `track-settings` for drums row) |

### Slot lane (center)

Each slot (~js-loop-station channel strip):

- Large **round play/rec** button with **phase ring** (playhead from `startedAt` + buffer duration)
- **Stop** (slot idle, keep buffer)
- **Clear** (slot empty)
- Optional compact **gain** (settings panel can hold vol + FX later)
- Visual state: empty / recording / playing / overdubbing

### Slot settings (right panel)

Reuse **track-settings** patterns for the **selected slot**:

- Volume, mute
- Input monitor
- Waveform of loaded/recorded buffer
- FX knobs (VCF, sends) — same `trackParams` shape as drum **rows**, but keyed by **slot index**
- **Local BPM** field (stored, not applied in MVP playback — see BPM section)

---

## Library — loops assets

**Today:** `src/assets/loops/basic-loops.zip` (user-added).

**Pattern:** same as drum kits — zip with `metadata.json` + WAVs; `library` service loads kits by path; loops workspace uses `library.path` scoped to loops root.

| Action | Result |
|--------|--------|
| Pick loop from library | Decode → assign to **selected slot** (or drag target slot) |
| No live input | Slot can play from file without recording |

---

## State model (draft)

```javascript
// Session track entry (extends tracks[])
{
  id: 'trk-loops',
  type: 'loop',
  name: 'Loops',
  transport: { armed: true, playing: false, stopPending: false },
  mixer: { volume: 1, muted: false, solo: false },
  loop: {
    inputId: 'default',
    clickArmed: false,
    slots: [
      {
        id: 'slot-0',
        process: 'empty',
        startedAt: null,
        layers: 0,
        duration: 0,
        bufferKeys: [],
        params: { volume: 1, muted: false, vcf: {}, sends: {} },
      },
      // … slots 1–3
    ],
  },
},

ui: {
  loops: {
    selectedSlot: null,
    panels: { library: false, settings: false },
  },
},
```

**Drums** keep `sequencer.*`; **loops** keep `tracks[n].loop.*` — no second top-level `sequencer`.

---

## Services & utils

```
transport (session clock, existing sequencer service)
    │
    ├── sampleSeqScheduler   ← drums (existing)
    │
    └── loopsService         ← NEW: slot state machine side effects
            │
            ├── util/recording.js   ← NEW: MediaRecorder, decode, permission
            ├── util/audio.js       ← play(), routing inputs
            └── util/loop-quantize.js ← bar snap from transport.bpm
```

| Module | Responsibility |
|--------|----------------|
| **`services/loops.js`** | Subscribe to slot `process` + session transport; start/stop `BufferSource`s; layer stack; schedule `start(when)` aligned to session |
| **`util/recording.js`** | `getUserMedia`, `MediaRecorder`, blob → `decodeAudioData` — **no** scheduling logic (reused for “record sample to row” later) |
| **`util/loop-quantize.js`** | `barSeconds`, nearest-bar count (50% rule), `trimPadBuffer` |
| **`services/library.js`** | Extend or parallel loader for `assets/loops/*.zip` |

**Reuse from transport / sequencer:**

- `transport.startTime`, `transport.playing`, `transport.bpm`
- `session-transport.js` — track play/stop for loop session track
- Visibility-aware scheduling pattern only where needed (loops are mostly `BufferSource.loop`; step scheduler not used)

**Do not** fold loops into `sequencer.js` service.

---

## BPM & quantize

**Plan:** [`planning/2026-06-24-02-loops-mvp.md`](../planning/2026-06-24-02-loops-mvp.md) § Quantize.

### MVP rule: global BPM defines bar size

- **Playback:** each slot loops at its own **`duration`** (whole bars at `transport.bpm`).
- **No `baseLength`** — slots are independent lengths (each ≥ 1 bar).
- **On record stop** (empty slot):
  1. `barSeconds = (60 / bpm) * beatsPerBar`.
  2. If raw &lt; 1 bar → **pad to 1 bar**.
  3. Else round to nearest bar count: overrun **&lt; 50%** of a bar → **trim**; **≥ 50%** → **pad**.
- **Overdub:** trim/pad to **existing `slot.duration`** (one cycle); stack as new layer.

### Separate BPM (future)

Store `slot.bpm` for detect/stretch later. MVP: quantize only.

---

## Virtual click track (first record)

**Problem:** User records first loop **without drums** — no audible pulse; hard to sync to global BPM.

**MVP proposal:**

1. On **empty slot** → record when drums not scheduling → arm **virtual click** on bar grid.
2. **Auto-start session** if stopped; **record starts on next bar** (optional 1-bar count-in).
3. On record end, **disable click**; quantize buffer per 50% rule (min 1 bar).
4. If drums playing → **skip click**; same bar-aligned record start.

**Later:** BPM detection from first recording replaces manual global BPM assumption; click still useful for count-in.

---

## Transport interaction

| Event | Loops behavior |
|-------|----------------|
| **Session play** | All slots in `play` resume / start at shared phase (retrigger layers at computed phase) |
| **Session stop** | All slots → idle; stop sources |
| **Track play** (Loops) | Same as session if only loop track; slots in `play` follow |
| **Track stop** | Slots idle; if last track, session stops (existing rule) |
| **Record while session running** | Quantize `startedAt` to next bar; layers stay in phase with `transport.startTime` |

Loop slots **do not** use step playhead — they use **buffer phase** (0–1 within `duration`).

---

## Audio graph

Each slot → **loop track bus** (group fader) → existing routing (`part-loops` node, future) → master.

Per-slot:

```
[ Mic / file decode ] → slot gain → (optional VCF) → loop track bus
[ Layer BufferSources, loop=true ] → slot gain → …
```

Overdub: **new layer** = additional `BufferSource` on same slot bus (js-loop-station stack).

---

## Workspaces strip

Second tab: **Loops** (right of Drums in `.workspaces-strip-tracks`).

- Inactive strip preview shows 4 mini slot states (future animation).
- Active workspace mounts `loop` editor instead of `workspace-inner` drums layout.

---

## Implementation order (suggested)

1. **State** — `trk-loops` track + `loop.slots[4]` skeleton; `ui.loops` panels.
2. **`util/recording.js`** — mic + MediaRecorder + decode (unit-testable).
3. **`util/loop-quantize.js`** — bar length from `transport`.
4. **Loops library** — load `basic-loops.zip`; assign to slot.
5. **`loops` UI** — header + 4 slot strips (no record yet).
6. **`loops` service** — file playback + `play`/`stop`/`clear` state machine.
7. **Live record** — record → quantize → layer.
8. **Virtual click** — first-record path.
9. **Session sync** — align `startedAt` to transport; startAll/stopAll.
10. **Slot settings panel** — reuse track-settings patterns.
11. **Strip tab + workspace switch** — `activeWorkspace: 'loops'`.

---

## Decisions → planning

Locked for MVP in [`planning/2026-06-24-02-loops-mvp.md`](../planning/2026-06-24-02-loops-mvp.md):

- [x] **Input** — one shared source, default device
- [x] **Record without session** — auto-start session on first record
- [x] **Length** — no `baseLength`; min 1 bar; 50% trim/pad rule per slot
- [x] **Overdub** — layer stack (js-loop-station)

**Still open:**

- [ ] **Clear all** — confirm dialog? (deferred — simple clear for MVP)
- [ ] **Click sound** — sample vs synthetic tick
- [ ] **Mixer** — loop group column (follow-up slice)

---

## Cross-links to update when implementing

- [`track-model.md`](track-model.md) — `loop` type slots
- [`workspaces.md`](workspaces.md) — second strip tab
- [`transport.md`](transport.md) — loop track scheduler
- [`project-formats.md`](project-formats.md) — audio clips per slot, one export lane
- [`ecosystem.md`](ecosystem.md) — js-loop-station port status
