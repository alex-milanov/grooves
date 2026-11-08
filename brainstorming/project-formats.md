# Project & File Formats

**Date:** 2026-06-21; **updated 2026-11-08**  
**Status:** Native `grooves-project` (YAML ± ZIP) + **MIDI export** — done; **DAWproject** session-clips MVP — specced; MusicXML — later

## Goal

**Native format** is the source of truth for save/load. Interchange formats (DAWproject, MIDI, MusicXML) are explicit adapters, not alternate project stores.

---

## Format comparison

| Format | Container | Audio samples | Step/pattern data | Note/pitch data | Mixer / FX / sends | Plug-in state | Role for grooves |
|--------|-----------|---------------|-------------------|-----------------|-------------------|---------------|------------------|
| **grooves-project YAML** | `.yaml` | library refs only | ✅ | future | ✅ | N/A | Dev / git / kit-only sessions |
| **grooves-project ZIP** | `.grooves.zip` | ✅ under `media/` | ✅ (`project.yaml`) | future | ✅ | N/A | **Primary portable save** |
| **DAWproject** | `.dawproject` ZIP+XML | ✅ | as clips / lanes | ✅ | ✅ | VST (not us) | Export/import with Bitwig, etc. |
| **Standard MIDI** | `.mid` | ❌ | ⚠️ drum notes | ✅ | ❌ | ❌ | Pattern / hardware |
| **MusicXML** | XML / `.mxl` | ❌ | ⚠️ | ✅ notation | ❌ | ❌ | Later (pitched tracks) |

---

## Native: `grooves-project`

### Document (`project.yaml`)

- **`format: grooves-project`**
- **`version`** — currently `1.5` (see `config/current-shape.yaml`); bump on breaking schema changes
- Prefer **YAML** for the session document (human-editable, matches `config/*-shape.yaml`)
- Ephemeral **never** saved: playhead, AudioBuffers, routing graph nodes, `library.kits`, armed/playing flags, `startedAt`, viewport pointer state

Authoritative field list: [`config/current-shape.yaml`](../config/current-shape.yaml). Target (scenes): [`config/target-shape.yaml`](../config/target-shape.yaml).

```yaml
format: grooves-project
version: 1.5
name: my-beat
lang: en

transport:
  bpm: 120
  timeSignature: [4, 4]
  resolution: 16

tracks:
  - id: drums
    type: sample-seq
    # rows[].sample: { kit, file } — library identity
    # pattern.measures keyed by row id (not runtime index)
  - id: trk-loops
    type: loop
    loop: { inputId: default, clickEnabled: true, processMic: false }
    slots:
      - id: slot-0
        process: idle          # empty | idle (never play/record/overdub on disk)
        sample: { kit: basic_loops, file: loop-a.wav }  # optional provenance
        media:                 # zip-relative paths; omit in YAML-only if no embed
          - media/loops/slot-0/L0.wav
        sourceBpm: 120
        sourceBpms: [120]
        layers: 1
        duration: 2.0
        volume: 0.85
        muted: false
        inserts: { vcf: { cutoff: 0.64, resonance: 0 } }
        sends: { reverb: 0, delay: 0 }

mixer: { ... }
ui: { ... }   # optional layout
```

### ZIP package (`.grooves.zip`)

One archive = session document + audio the session needs to round-trip without relying on the app’s built-in kits (except as a convenience fallback).

```text
my-beat.grooves.zip
├── project.yaml
└── media/
    ├── samples/                      # drum (and future) one-shots in use
    │   └── {kit}/
    │       └── {file}.wav            # e.g. media/samples/basic_drum_kit/PD-KICK-03.wav
    └── loops/
        └── {slot-id}/
            ├── L0.wav                # layer 0 (primary)
            ├── L1.wav                # overdub layers …
            └── L{n}.wav
```

#### How samples vs loops are stored

| Kind | In `project.yaml` | In the ZIP |
|------|-------------------|------------|
| **Drum row** (library hit) | `rows[].sample: { kit, file }` | Copy of that WAV at `media/samples/{kit}/{file}` when the buffer is available at save time |
| **Loop from library** | `slots[].sample: { kit, file }` (provenance) **and** `slots[].media: [media/loops/{slot-id}/L0.wav, …]` | **Always** embed the slot’s live layers (post-quantize / overdubs), not the raw kit file — so trim and layers survive |
| **Loop recorded in-app** | `sample: null`, `media: […]` | Same `media/loops/{slot-id}/L{n}.wav` layers |
| **Unused kit files** | — | Not packed |

**Load rules**

1. Parse `project.yaml`.
2. Decode every file under `media/` into the sample cache:
   - `media/samples/{kit}/{file}` → cache key `{kit}/{file}` (same as library kits)
   - `media/loops/{slot-id}/L{n}.wav` → runtime loop buffer key for that slot/layer
3. Apply document to state. Drum rows keep `{ kit, file }` refs. Loop slots restore `bufferKeys` from `media` (and keep `sample` provenance when present).
4. If a drum `{ kit, file }` has no embedded media but the app library already loaded that kit, playback still works.

**YAML-only (`.yaml`) save** — document without `media/` files. Library refs work when kits are present in the app. Slots that only exist as recordings (no reloadable library sample) **need the ZIP** to round-trip audio.

### File names

| Download | Extension | Notes |
|----------|-----------|--------|
| Session document | `.yaml` | `project.yaml` inside zip uses the same schema |
| Portable project | `.grooves.zip` | Accept `.zip` on load if `project.yaml` is at archive root |

---

## MIDI export (implemented)

**Header → Save → MIDI** downloads a **Standard MIDI File (Type 1)**:

| Chunk | Content |
|-------|---------|
| Conductor track | Tempo + time signature meta |
| Drums track | All `sample-seq` row hits as notes on the part channel (default **10**) |

- Timing: step index → ticks via `beatsPerBar / stepsPerBar` at PPQ 480 (same bar math as the sequencer, including **7/8**).
- Note number: `rows[].midi.note` (kick 36, snare 38, …).
- **Not included:** loop audio, mixer, FX, samples.
- Code: `util/project/midi.js` → `saveProjectMidi`.

---

## DAWproject MVP — session clips only (Bitwig-openable)

Treat as **export target** (later import). Do **not** use `.dawproject` as the native store.  
Full planning: [`planning/2026-11-08-02-dawproject-session-export.md`](../planning/2026-11-08-02-dawproject-session-export.md).

### Design choice: Scenes, not Arrangement

Grooves is a **session / clip-launcher** app today (pattern + loop slots). The MVP export mirrors that:

- Put musical content in **`Scenes` → `ClipSlot` → `Clip`**
- **Do not** build an Arrangement timeline (omit Arrangement, or leave empty Lanes)
- Goal: open in **Bitwig**, see clips on the **clip launcher**, correct BPM/meter

### What ships in the MVP ZIP

```text
name.dawproject
├── project.xml
├── metadata.xml
└── media/loops/{slot-id}/L{n}.wav   # filled loop slots only
```

| Grooves | DAWproject MVP |
|---------|----------------|
| Transport BPM / meter | `Transport` |
| Drums group | Structure notes `Track` + **one Scene ClipSlot** with a **Notes** clip (pattern → `Note` events; same timing as MIDI export) |
| Loop slot with audio | Structure audio `Track` + Scene ClipSlot **Audio** clip + embedded WAV |
| Empty slots | Omit |
| Vol / pan / mute / solo | Channel attrs (subset) |
| Arrangement / song view | **Not exported** |
| VCF / sends / VST | **Not exported** |

### Implementation order (when building)

1. Smoke: ZIP + `project.xml` Transport/Structure/empty Scene → opens in Bitwig  
2. Drums Notes ClipSlot (reuse note list from `midi.js`)  
3. Loop Audio ClipSlots + `media/`  
4. Channel levels  

Header Save → DAWproject stays disabled until that lands. Keep builder in `util/project/dawproject.js`.

---

## MusicXML

Later — pitched / piano-roll tracks. Lower priority than MIDI + DAWproject session export.

---

## Compatibility philosophy

1. **Native YAML ± ZIP is source of truth** — full grooves state, versioning, types.
2. **MIDI** — drum pattern / hardware (implemented).
3. **DAWproject** — session-clip interchange for Bitwig et al. (specced; export next).
4. **MusicXML** — later.

---

## Versioning & migration

- Every native file: `format: grooves-project`, `version: N` (semver-ish major.minor as number/string in YAML).
- Breaking shape changes → bump version + migrate on load when practical.
- Kits keep their own `metadata.json`; project refs kits by name/path.

---

## Implementation order

1. ✅ Spec: YAML document + `media/samples` + `media/loops` layout
2. ✅ Serialize / apply `project.yaml` ↔ app state
3. ✅ ZIP pack/unpack + header Save (YAML / ZIP) + Load
4. ✅ MIDI export (drums pattern)
5. Next: DAWproject session-clips export (Bitwig)
6. Later: MusicXML
