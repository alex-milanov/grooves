# Session & Track Transport

**Date:** 2026-06-24  
**Status:** Brainstorming  
**Related:** [`track-model.md`](track-model.md), [`workspaces.md`](workspaces.md), [`vision.md`](vision.md) § AudioContext clock, world-metronome scheduling

---

## Idea

Grooves should have **two layers of transport**:

| Layer | Scope | User-facing home (target) |
|-------|--------|---------------------------|
| **Session transport** | Whole song / project | Header — play, stop, global BPM, time signature, resolution |
| **Track transport** | One session track (Drums, Loop A, Bass, …) | Track workspace chrome or strip tile context |

**Session play** starts **all tracks** that are armed / not solo-muted, from a **shared `startTime`** on the audio clock.  
**Session stop** stops **all tracks** immediately (or with a defined stop policy).  
Each track can also be **controlled individually** — play, pause, stop, arm, sync offset — without breaking the shared clock model when the session is running.

Today’s MVP has one `sample-seq` session track (`tracks[0]` / Drums). Header drives **session** transport; sequencer header drives **track** transport. Both bind to `state.transport` + `state.tracks[].transport` via [`session-transport.js`](../src/app/util/session-transport.js).

---

## Session transport (global)

### Role

- **One timing authority** for the project: `AudioContext.currentTime` + session **`startTime`** anchor (world-metronome pattern).
- **Global tempo & meter** — BPM, time signature, grid resolution apply to all tracks unless a track opts into local tempo (out of scope for v1).
- **Global playhead** (optional UI) — derived position in bars/beats for arrangement views; not a parallel tick counter in state.

### Controls (header)

| Control | Effect |
|---------|--------|
| **Play** | Session `playing: true`; set / preserve `startTime`; start scheduling on every **running** track |
| **Pause** | Session `playing: false`; graceful cutoff per track scheduler (finish current step / phrase TBD) |
| **Stop** | Session `playing: false`; **hard stop** all tracks; clear playheads; optional rewind to bar 0 |
| **BPM** | `transport.bpm` — all schedulers read this |
| **Sig / resolution** | `transport.timeSignature`, `transport.resolution` — pattern length for step-based tracks |

### State (target)

```javascript
transport: {
  playing: false,
  startTime: null,        // AudioContext time at session play (anchor)
  cycleOffset: 0,           // world-metronome: progress within cycle at anchor (mid-play tempo change)
  bpm: 120,
  timeSignature: [4, 4],
  resolution: 16,
  playhead: null,           // derived UI — bar/beat or step index (session-wide display)
}
```

**Scheduling service** owns the anchor math (`calculateCycle`, `calculateProgress`, lookahead). State stores **anchors and flags**, not per-frame ticks.

### Start time is shared

When session play fires:

1. `resume()` AudioContext if needed.
2. `startTime = context.currentTime + smallLeadIn` (e.g. 50 ms).
3. Every **active** track scheduler uses **the same `startTime`** (and same `transport.bpm` / meter) to compute `when` for `source.start(when)`.

Tracks do **not** each pick their own session anchor unless explicitly in **freerun** mode (future).

---

## Track transport (per session track)

### Role

Each **group track** (`sample-seq`, `loop`, `instrument`, …) has its own:

- **Scheduler** — knows how to turn that track’s content into timed audio/MIDI events (step grid, loop buffers, piano roll).
- **Transport slice** — play state, arm, mute, solo interaction, optional **track playhead** (may differ from session playhead when track is paused alone — see below).

### Controls (per track)

| Control | Typical effect |
|---------|----------------|
| **Play** (track) | Start **only this track** against current session `startTime` if session is already playing; or start session + track if session was stopped |
| **Pause** (track) | Stop scheduling **this track**; others continue |
| **Stop** (track) | Hard stop this track; cancel its scheduled sources. If **session is running** and **no tracks remain playing**, **stop the session** too (see below) |
| **Arm** | Include in session play (hardware “arm track”); unarmed tracks ignore session play |
| **Mute / solo** | Mixer + transport gate (solo mutes non-solo tracks on session play) |

Exact UX (buttons on workspace vs mixer vs strip) TBD — behavior is what matters here.

### State (per track, illustrative)

```javascript
tracks: [{
  id: 'trk-drums',
  type: 'sample-seq',
  transport: {
    armed: true,
    playing: true,     // is this track’s scheduler active?
    playhead: null,    // track-local UI (e.g. current step)
    // optional: cycleOffset if track started late into session
  },
  rows: [ /* … */ ],
  mixer: { /* … */ },
}]
```

**`track.transport.playing`** is not independent tempo — it means “this track’s scheduler is running against session clock”.

---

## How session + track interact

### Session play (all)

```
User hits session Play
  → transport.playing = true
  → startTime = now + leadIn
  → for each track where armed && !soloBlocked:
       track.transport.playing = true
       trackScheduler.scheduleFrom(startTime, transport.*)
```

### Session stop (all)

```
User hits session Stop
  → transport.playing = false
  → for each track:
       track.transport.playing = false
       cancel track’s scheduled sources
  → transport.playhead = null, track playheads = null
```

### Track play alone (session already playing)

```
Session already running with startTime T
User hits Play on Loop A only (was paused)
  → track.transport.playing = true
  → Loop A scheduler joins mid-session:
       schedule from context.currentTime using same transport.bpm
       (no new session startTime)
```

### Track pause alone

```
Session still playing
User pauses Drums only
  → track.transport.playing = false for Drums
  → cancel Drums scheduled events after cutoff
  → other tracks unchanged
```

### Track stop alone

```
Session still playing
User stops Loop A
  → track.transport.playing = false for Loop A
  → cancel Loop A scheduled sources (hard stop)
  → if no other track has transport.playing === true:
       transport.playing = false   // session stops — nothing left to run
       transport.playhead = null
       stop session lookahead / interval loops
  → else: session unchanged, other tracks keep going
```

Same rule applies when the **last** playing track is **paused** (if pause is “stop scheduling” rather than hold position) — any action that leaves **zero active track schedulers** while `transport.playing` is true should **cascade to session stop**. Avoid a “zombie session” that is playing with no audible/scheduling tracks.

**Helper (conceptual):** after any per-track transport change, `syncSessionFromTracks()` — if `transport.playing && !tracks.some(t => t.transport.playing)` then session stop.

### Track play when session is stopped

**Option A (recommended):** track Play **starts the session** (sets `startTime`, `transport.playing = true`) and starts that track; other armed tracks also start.

**Option B:** track Play only auditions that track on a **local preview clock** — session stays stopped. More complex; defer.

---

## Scheduling architecture

```
┌─────────────────────────────────────────────────────────┐
│  transportService (session)                              │
│  - anchor: startTime, cycleOffset, bpm, meter           │
│  - session play / pause / stop                         │
│  - visibility-aware lookahead (setInterval + rAF)       │
└──────────────────────────┬──────────────────────────────┘
                           │ shared clock + transport.*
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
  sampleSeqScheduler  loopScheduler   instrumentScheduler
  (per track id)      (per track id)  (per track id)
         │                 │                 │
         └─────────────────┴─────────────────┘
                           ▼
                    routing graph → master
```

- **One session transport service** — not one `requestAnimationFrame` loop per track.
- **Per-track schedulers** subscribe to `transport` + their `track` slice; each calls `play(buffer, when, trackInput)` with absolute times.
- **Re-anchor** on BPM/meter change while playing (world-metronome / jam-station port) updates `startTime` + `cycleOffset` once; all schedulers pick it up.

---

## Today’s MVP mapping

| Target | Today (`sequencer.*` + header) |
|--------|--------------------------------|
| `transport.bpm` | `sequencer.bpm` |
| `transport.playing` | `sequencer.playing` |
| `transport.startTime` | module-local `startTime` in `sequencer.js` service |
| `transport.playhead` | `sequencer.playhead` |
| Per-track transport | N/A — one implicit `sample-seq` track |
| Header play/stop/BPM | Wired (2026-06-24) |

**Migration:** lift `bpm`, `playing`, `playhead`, `timeSignature`, `resolution` from `sequencer` → `transport`; keep row grid under `tracks[0].rows`. Per-track `transport` appears when track 2 exists.

---

## UI placement

| Control | Where |
|---------|--------|
| Session play / pause / stop / BPM | **Header** (global) — done for play/stop/BPM |
| Sig / resolution | Header or session strip (TBD) |
| Track arm / play / pause | Workspace header for that track type, or mixer column (arm only) |
| Loop record / overdub | Loop workspace (uses track transport + session clock) |

See [`workspaces.md`](workspaces.md) — transport is **global**; active workspace does not own the only play button.

---

## Open questions

- [ ] **Pause vs stop** — session pause graceful across all tracks vs per-track cutoff rules?
- [x] **Last track stops** — stopping (or pausing-out) the final playing track while session runs → **session stops** automatically.
- [ ] **Playhead** — one session playhead in header, or per-track playhead only in editors?
- [ ] **Unarmed tracks** — silent on session play, or still show idle animation in strip?
- [ ] **Late join** — when track starts mid-session, schedule from `now` or snap to bar?
- [ ] **Loop tracks** — sync to bar boundary on session play (js-loop-station pattern)?
- [ ] **MIDI clock out** — session transport drives external clock (jam-station `midi.js`)?

---

## Implementation order (suggested)

1. **State split** — `transport` block; `sequencer` → `tracks[0]` content only.
2. **transportService** — extract anchor + visibility scheduling from `sequencer.js`.
3. **sampleSeqScheduler** — per `trackId`; session service orchestrates.
4. **Track transport UI** — arm/play on second track type (e.g. loop).
5. **Re-anchor** — BPM/meter change while playing (world-metronome math).

---

## References

- **world-metronome** — `startTime`, `cycleOffset`, `projection()`, UI latency offset
- **jam-station** — `studio.playing`, per-track schedulers, scheduling port doc
- **Hardware grooveboxes** — global tempo + per-part mute/arm; parts share clock
