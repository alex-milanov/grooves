# MIDI controller input — initial impl (MPK mini IV + seq record)

**Date:** 2026-11-08  
**Status:** Implemented (MVP)  
**Related:** MIDI **file** export (done) — `util/project/midi.js`; Settings MIDI tab placeholder — `ui/sections/settings.js`  
**Brainstorming:** [`track-model.md`](../brainstorming/track-model.md), [`transport.md`](../brainstorming/transport.md), [`ecosystem.md`](../brainstorming/ecosystem.md)  
**Siblings:** jam-station (`util/midi`, `services/midi`, `actions/midi-map`), js-loop-station (`services/midi` pad → loops), xAmplR (pad schemes + ch 10)

---

## Goal

Web MIDI **input** so a connected controller (default: **Akai MPK mini IV**) can:

1. **Live-trigger** drum rows (one-shots) by `rows[].midi.note`
2. **Drive loop slots** (play/rec, stop, clear) like js-loop-station
3. **Session transport** (play/pause/stop) like media-session
4. **Record into the step sequencer** while armed — jam-station pattern, adapted to grooves’ measure grid
5. **CC** → BPM, master, loop gains (factory MPK knobs)

Ship behind the existing **Settings → MIDI** tab (device, scheme legend). No MIDI clock, learn, or live MIDI out in this slice.

---

## Non-goals (this slice)

- MIDI **clock** in/out (`transport.md` open item)
- MIDI **output** / hardware note scheduling from the grid
- MIDI **learn** UI
- Full jam-station `midiMap.channels` / on-screen keyboard / pitch bend
- Full DAW-port script surface (encoder, undo, loop, overdub, …) — MVP only maps Play/Rec CCs
- Import `.mid` / round-trip with SMF export
- Melodic / piano-roll record
- Persisting custom maps in grooves-project (hardcoded scheme + optional local tweaks later)

---

## Sibling references

| App | Take |
|-----|------|
| **jam-station** | `util/midi.js` access + `parseMidiMsg`; service hook; **seq record** while `playing && recording`; CC → scaled value; MPK Mini IV **auto-connect** (`MPK Mini IV MIDI Port`) |
| **js-loop-station** | Hardcoded note → `[action, …args]`; device + channel filter; dbl-tap → clear; compact device/channel UI |
| **xAmplR** | Pad scheme JSON; default **channel 10** for pads; scheme dropdown |

**Dispatch style:** grooves services use `start({ state$ })` / `stop()` and `dispatch(reducer)` (see `services/media-session.js`) — **not** jam-station’s nested `actions.*` tree.

---

## Default controller — Akai MPK mini IV

### Auto-connect

Prefer **port 1** only (performance: keys, pads, knobs). Ignore DAW / Plugin / Software Control / Din ports.

```js
const preferInput = (inputs) =>
  inputs.find((d) => /MPK Mini IV MIDI Port/i.test(d.name))
  ?? inputs.find((d) => /MPK Mini IV/i.test(d.name)
    && !/DAW|Plugin|Software|Din/i.test(d.name))
  ?? null;
```

On `devices$`, if `inputId` is unset / `'-1'` and a preferred device appears, select it (still allow **Any** in UI). Same idea as jam-station `findAutoConnectMpkIndex`.

### Factory layout (User preset, Notes mode)

| Surface | Channel | Messages |
|---------|---------|----------|
| Pads Bank A | **10** | notes **36–43** |
| Pads Bank B | **10** | notes **44–51** |
| Knobs Bank A | **1** | CC **70–77** |
| Keys | **1** | chromatic notes |

Physical pad grid (bottom-left = Pad 1):

```text
[5]=40  [6]=41  [7]=42  [8]=43
[1]=36  [2]=37  [3]=38  [4]=39
```

**Do not** use a single global MIDI channel filter — MK4 pads and knobs differ. Bindings are keyed by `(channel, note|cc)`.

### Scheme `mpk-mini-iv` (default)

**Bank A — drums (ch 10)**  
Resolve note → drum row by `rows[].midi.note` first (defaults `[36, 38, 42, 45]`). Explicit grid fill so unused factory pads still do something:

| Note | Action |
|------|--------|
| 36 | `drums.preview` / record → row 0 |
| 38 | row 1 |
| 42 | row 2 |
| 37 | row 3 fallback (until/unless row note is 45) |
| 39–41, 43 | `drums.select` row (optional UX) |

If note **45** arrives (Bank B or reprogrammed pad) and a row claims it → drums win over loop binding.

**Bank B — loops (ch 10)** — js-loop-station shape:

| Notes | Action |
|-------|--------|
| 44–47 | `loops.playRec` slots 0–3 |
| 48–51 | `loops.stop` slots 0–3 |
| dbl-tap 48–51 | `loops.clear` slots 0–3 |

**Keys (ch 1)** — session transport on MIDI port (no DAW script):

| Note | Action |
|------|--------|
| 48 (C3) | `session.togglePlay` |
| 50 (D3) | `session.stop` |

**Knobs (ch 1, CC 70–77):**

| CC | Action |
|----|--------|
| 70–73 | loop slot gain 0–3 |
| 74 | mixer master |
| 75 | transport BPM (60–200) |
| 76 | selected drum row gain |
| 77 | selected drum row VCF cutoff |

Ship as `services/midi/maps/mpk-mini-iv.js` (xAmplR scheme file pattern).

---

## Architecture

```text
requestMIDIAccess
  → util/midi.init() → devices$ + msg$
  → services/midi.start({ state$ })
       parseMidiMsg → filter(device)
       → (channel, note|cc) lookup scheme / row.midi.note
       → dispatch(…) | play(buffer, …)
```

| Module | Role |
|--------|------|
| `util/midi.js` | **New** — port jam-station/xAmplR `parseMidiMsg` + `init()` (ESM, RxJS 7). **Not** SMF export (`util/project/midi.js`). |
| `state/midi.js` | `inputId`, `scheme`, device stubs, `recording` flag helpers; connect/setDevice/setScheme reducers |
| `services/midi.js` | `start` / `stop`; subscriptions; command runner |
| `services/midi/maps/mpk-mini-iv.js` | Default scheme |
| `ui/sections/settings.js` | Replace MIDI placeholder: device, scheme, short legend, record hint |
| Sequencer header / drums UI | **Record arm** toggle (see § Sequencer record) |

Wire in `index.js` next to `mediaSession`; HMR `stop()` like other services.

### State sketch

```js
// top-level or settings.midi — prefer top-level `midi` for devices$ churn
midi: {
  supported: null,       // null | true | false
  accessError: null,
  inputId: '-1',         // '-1' = any; auto-prefer MPK MIDI Port when present
  scheme: 'mpk-mini-iv',
  devices: { inputs: [], outputs: [] }, // { id, name } stubs only
}

// drums track / ui — record arm
tracks[drums].transport.recording: false
// or ui.drums.recording — pick one; prefer track.transport.recording
```

Serializable device list only (no live `MIDIInput` objects in state).

---

## Sequencer record (from jam-station)

### What jam-station does

In `jam-station/src/js/services/midi.js`, on noteOn when:

- input allowed in `midiMap.data.in`
- track input device/channel match
- `studio.playing && studio.recording && studio.startTime != null`

it computes transport **progress** → `stepIndex` → current **bar**, then:

```js
actions.sequencer.update(bar, msg.note.number - 60, step, msg.velocity);
```

Row index = `note - 60` (keyboard-relative). Velocity written into the pattern cell. Studio has a **Record** toggle (`actions/studio` → `recording: !recording`).

### Grooves adaptation

| jam-station | grooves |
|-------------|---------|
| `note - 60` → row | **`rows[].midi.note` match** → row (same as live preview / SMF export) |
| float velocity in cell | v1: **force step on** (boolean grid); stash velocity later if needed |
| `studio.recording` | `tracks[drums].transport.recording` (or `ui.drums.recording`) + header button |
| `studio.playing` | session or drums track scheduling (`anySessionActivity` / `isTrackScheduling`) |
| `startTime` | `transport.startTime` |
| `sequencer.update` | new **`setMeasureStep(bar, row, step, on = true)`** (force-on; do **not** toggle off on re-hit) |

### Timing

Reuse sequencer timing already used for the playhead:

- `getDrumsUiTiming(state)` → `{ playhead, playBar }`, or equivalent audio-time helper from `services/sequencer.js` / `transport.startTime` + `stepTime` / `stepsPerBar`
- Quantize hit to **nearest step** (or floor — lock one rule; prefer **floor** of progress within bar to match “step already entered”, jam-station `stepIndex` style)
- Only write when recording **and** transport/drums are actually running with a valid `startTime`

### Live feedback while recording

On the same noteOn that writes a step:

1. **Preview** the row sample immediately (`play(buffer, now, row)` / existing preview path) — pad feel
2. Optionally flash the grid cell (UI already re-renders from state)

When recording is **off**, same pad note only **previews** (no grid write).

### Record arm UX

- Toggle on drums workspace header (next to play/stop) — jam-station header `recording` class pattern
- Arming does **not** auto-start transport; user hits session/drums play (or a mapped MIDI transport key)
- Stopping session clears or **keeps** armed — prefer **keep armed** so the next play continues punching in
- Visual: red/active record button when `recording === true`

### New/extended reducers

```js
// state/sequencer-measures.js
export const setMeasureStep = (bar, row, step, on = true) => (state) => { /* force on/off */ };

// state/transport or drums
export const toggleDrumsRecording = (state) => { /* flip track.transport.recording */ };
```

MIDI service:

```js
if (msg.state === 'noteOn' && drumsRecording(state) && hasRunningGrid(state)) {
  const row = findRowByMidiNote(state, msg.note.number);
  if (row >= 0) {
    const { playBar, playhead } = gridPosition(state); // bar + step
    if (playhead != null)
      dispatch(setMeasureStep(playBar, row, playhead, true));
    previewDrumRow(state, row, msg.velocity);
  }
}
```

---

## Command runner (non-record)

| `type` | Dispatch / side effect |
|--------|------------------------|
| `session.togglePlay` / `play` / `pause` / `stop` | `sessionTogglePlay` / `sessionPlay` / … |
| `loops.playRec` / `stop` / `clear` | `slotTogglePlayRec` / `slotStop` / `slotClear` |
| `drums.preview` | one-shot play for row |
| `drums.select` | `selectRow(row)` |
| `transport.bpm` | `patch(['transport','bpm'], scaled)` |
| `mixer.master` | master volume patch |
| `loops.gain` | `patchSlotParam(slot, ['volume'], …)` |
| `drums.rowGain` / `drums.vcfCutoff` | selected row params |

Throttle CCs (~10 ms, jam-station). Debounce transport (~350 ms, media-session) if pads chatter.

**Workspace awareness (optional v1):** always honor loop + drum maps regardless of active workspace — simpler; refine later if conflicts appear.

---

## Settings → MIDI pane

Replace placeholder with:

1. Supported / error message if `requestMIDIAccess` missing or denied (+ Retry)
2. **Input** select — Any + listed inputs (highlight auto MPK)
3. **Scheme** — `mpk-mini-iv` (only option at first)
4. Short legend — Bank A drums · Bank B loops · keys C3/D3 transport · knobs 70–77
5. Note: use **User** preset / Notes mode on the MPK; ignore DAW port for this app

No map editor in this slice.

---

## Implementation order

1. **`util/midi.js`** — parse + init; smoke in console  
2. **`state/midi.js`** + wire `devices$` → stubs; Settings device select  
3. **`services/midi.js`** — filter + scheme; **drums preview** via `row.midi.note`  
4. **Loop pad map** (Bank B) + dbl-clear  
5. **Transport keys** + **CC** BPM/master/gains  
6. **`setMeasureStep` + record arm UI** + MIDI write path (jam-station port)  
7. Auto-connect MPK MIDI Port; scheme file cleanup; Settings legend  
8. HMR stop + basic manual test checklist  

Each step should leave the app runnable.

---

## Acceptance

1. Plug in MPK mini IV → Settings shows **MPK Mini IV MIDI Port** selected (or Any still receives).  
2. Bank A pads trigger the matching drum rows (notes 36/38/42/…).  
3. Bank B pads playRec / stop loop slots 0–3; double-tap stop pads clears.  
4. Key C3 toggles session play; D3 stops.  
5. Knobs move loop gains / master / BPM.  
6. Arm **Record**, play drums/session, hit pads → steps appear on the current bar/playhead row; audible preview on hit.  
7. Record off → pads preview only, grid unchanged.  
8. No crash when Web MIDI unsupported; Settings explains it.  
9. Existing **Save → MIDI** export still works (unchanged module).

---

## Defer / later

| Item | Notes |
|------|-------|
| MIDI clock out/in | `transport.md`; jam-station `midi.js` clock pulses |
| MIDI learn | After defaults proven |
| Velocity on steps | Pattern cell becomes `{ on, vel }` or parallel layer |
| Overdub vs replace record | v1 force-on only |
| DAW Port extras | Play/Rec CCs done; undo/loop/overdub/encoder later |
| Per-track `midi.input` in document | `track-model.md` — after global input works |
| Knob bank B (CC 78–85) | Extra gains/FX |
| xAmplR-style live pad grid UI | Optional performance surface |

---

## File checklist

```text
src/app/util/midi.js                         # NEW (I/O)
src/app/state/midi.js                        # NEW
src/app/services/midi.js                     # NEW
src/app/services/midi/maps/mpk-mini-iv.js    # NEW
src/app/state/sequencer-measures.js          # setMeasureStep
src/app/state/drums.js or transport.js       # recording flag + toggle
src/app/ui/sections/settings.js              # MIDI pane
src/app/ui/sections/sequencer/…              # Record arm control
src/app/index.js                             # midi.start / stop
```
