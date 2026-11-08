# DAWproject MVP export — session clips only (Bitwig-openable)

**Date:** 2026-11-08  
**Status:** Spec / planned (not implemented)  
**Spec also in:** [`brainstorming/project-formats.md`](../brainstorming/project-formats.md)  
**Related:** MIDI export (implemented) — `util/project/midi.js`

## Goal

Export a `.dawproject` that **opens in Bitwig** (and ideally Studio One) carrying the current grooves **session**: drum pattern as notes + loop slot audio as clips. **No Arrangement timeline** — use **Scenes / ClipSlots** only (clip launcher), matching grooves’ session-grid mental model (`tracks[]` × future `scenes[]`).

## Non-goals (MVP)

- Arrangement / linear timeline
- Import / round-trip
- VST/CLAP device state
- Sends, VCF, bus FX as DAW devices
- MusicXML

## Container

```text
name.dawproject          # ZIP
├── project.xml          # required
├── metadata.xml         # application name/version, optional title
└── media/
    └── loops/
        └── {slot-id}/L{n}.wav
```

(Drum hits are **notes**, not embedded one-shots, unless we later add a sampler device.)

## `project.xml` shape (session-only)

```text
Project
├── Application (name=Grooves, version=…)
├── Transport (Tempo, TimeSignature)
├── Structure
│   ├── Track contentType="notes"  name="Drums"   + Channel
│   ├── Track contentType="audio"  name="Loop 1"  + Channel   # one per filled slot
│   ├── … more loop tracks …
│   └── Track role=master
├── Arrangement            # omit OR empty Lanes — do not put the session there
└── Scenes
    └── Scene
        └── ClipSlot track=… → Clip → Notes | Audio
```

**Bitwig check:** file must open; scene clip(s) visible on the clip launcher; transport BPM/meter correct.

### Drums → Notes clip in a ClipSlot

- One Structure track `contentType="notes"` (group track).
- One Scene (e.g. “A”) with a ClipSlot on that track.
- Clip duration = pattern length in **beats** (`bars × beatsPerBar`).
- Inside Clip: `<Notes>` with `<Note time=… duration=… channel=0 key=midi.note vel=…/>`.
- Timing: same math as MIDI export (`util/project/midi.js`) — step → beats via `beatsPerBar / stepsPerBar`.
- Channel in Structure may still document GM drum lane; note `key` = `rows[].midi.note`.

### Loops → Audio clips in ClipSlots

- One Structure **audio** track per **filled** slot (or one track + multiple scene slots later).
- Embed quantized layer WAV(s) under `media/loops/…` (reuse zip media packing).
- ClipSlot Clip → `<Audio>` + `<File path="…"/>` + warps if needed so duration matches slot `duration` / transport BPM.
- Overdub layers: either bounce/sum for MVP, or one clip per layer on lanes — prefer **sum or L0-only** for first Bitwig pass.

### Mixer subset

- Channel Volume / Pan / Mute / Solo from `tracks[].channel` (and optional per-slot params on loop tracks).
- No sends/devices in MVP.

## Mapping table

| Grooves | DAWproject MVP |
|---------|----------------|
| `transport.bpm` / `timeSignature` | `Transport` |
| Drums group track | Structure `Track` notes + Scene `ClipSlot` Notes clip |
| `rows[].midi.note` + pattern measures | `Note` events inside that clip |
| Loop slot with audio | Structure audio `Track` + Scene `ClipSlot` Audio clip + file |
| Empty loop slots | Omit tracks |
| Arrangement / song timeline | **Not exported** |
| VCF / sends / buses | Not exported |

## Implementation sketch

| Module | Role |
|--------|------|
| `util/project/midi.js` | ✅ Shared step→beat/tick helpers & note list (extend or share) |
| `util/project/dawproject.js` | Build `project.xml` + `metadata.xml`, pack ZIP |
| `util/project/save-load.js` | `saveProjectDawproject(state)` |
| Header Save | Enable DAWproject when ready |

**Order:** (1) Transport + Structure + empty Scene smoke in Bitwig → (2) drums Notes ClipSlot → (3) loop Audio ClipSlots + media → (4) channel levels.

## Acceptance

1. Save → open in Bitwig without error.
2. BPM and time signature match.
3. Drum scene clip plays the pattern (correct relative hits).
4. At least one loop scene clip plays embedded audio when the slot had content.
5. No arrangement clips required for the above.
