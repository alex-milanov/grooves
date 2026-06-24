# Project & File Formats

**Date:** 2026-06-21  
**Status:** Brainstorming — format exploration

## Goal

Define how grooves **saves**, **loads**, and **exchanges** projects — with awareness of JSON, ZIP, **DAWproject**, **MusicXML**, and **MIDI**. Full compatibility with every format is unrealistic; aim for a **clear native format** plus ** sensible import/export subsets**.

---

## Format comparison

| Format | Container | Audio samples | Step/pattern data | Note/pitch data | Mixer / FX / sends | Plug-in state | Best use for grooves |
|--------|-----------|---------------|-------------------|-----------------|-------------------|---------------|----------------------|
| **Grooves JSON** | single file | refs or embedded | ✅ native grid | future | ✅ if in schema | N/A (built-in FX only) | **Primary save** — direct state export |
| **Grooves ZIP** | ZIP archive | ✅ WAV + metadata | project.json inside | future | ✅ | N/A | **Shareable project** — like kits + session |
| **DAWproject** (`.dawproject`) | **ZIP** + XML | ✅ (paths in archive) | as **clips** / lanes | ✅ notes in clips | ✅ channels, sends, inserts | VST state (not us) | Interchange with Bitwig, Studio One, etc. |
| **Standard MIDI** (`.mid`) | binary | ❌ | ⚠️ as drum notes | ✅ | ❌ | ❌ | Pattern export, hardware sync |
| **MusicXML** | XML (often .mxl ZIP) | ❌ | ⚠️ indirect | ✅ notation | ❌ | ❌ | Score exchange when piano-roll exists |

**Your intuition is correct:**

- **MIDI** and **MusicXML** carry **note/event** data, not sample files (except SMF sample dumps, rare/legacy).
- **JSON** maps naturally to **iblokz-state** snapshot (jam-station style).
- **ZIP** bundles **JSON + media** (xAmplR sample export, grooves kit load, DAWproject archive).
- **DAWproject** is indeed a **ZIP container** with `project.xml`, `metadata.xml`, and media folders ([bitwig/dawproject](https://github.com/bitwig/dawproject)).

---

## Native formats (proposed)

### 1. `project.json` — grooves state export

Direct serialization of (a subset of) app state:

```javascript
{
  "format": "grooves-project",
  "version": 1,
  "transport": { "bpm": 120, "timeSignature": [4, 4], "resolution": 16 },
  "tracks": [ /* typed track array — see track-model.md */ ],
  "mixer": { "buses": { /* reverb, delay */ }, "master": {} },
  "library": { "kits": [ /* refs */ ] }
}
```

- **Pros:** trivial load/save, git-diffable, matches jam-station mental model.
- **Cons:** samples as external refs unless embedded separately.
- **Refs:** jam-station session in state/localStorage patterns; grooves `state/index.js`.

### 2. `.grooves.zip` (name TBD) — project + samples

Structure inspired by **xAmplR export** + **basic-drum-kit.zip**:

```
my-beat.grooves.zip
├── project.json          # session + mixer + patterns
├── metadata.json         # optional: author, title, grooves version
├── samples/              # WAV files referenced by project.json
│   ├── kick.wav
│   └── snare.wav
└── kits/                 # optional: embedded kit zips
    └── custom-kit.zip
```

- **Pros:** one file to share; mirrors kit loading already in `library.js`.
- **Cons:** need stable sample IDs/paths on import.

**xAmplR reference:** `exportSamples()` — `metadata.json` + `samples/{row}-{col}-{name}.wav` in ZIP (`src/js/ui/header/index.js`).

**Grooves kit reference:** `metadata.json` + WAVs inside zip (`library.js`).

---

## DAWproject — what “compatible” could mean

DAWproject supports (among other things): structure (tracks/folders), **audio clips**, **notes**, **automation**, **mixer channels**, **insert & send effects**, built-in device params — in XML inside a ZIP.

**Realistic grooves mapping:**

| Grooves concept | DAWproject concept | Export | Import |
|-----------------|-------------------|--------|--------|
| Sample-seq **group** track | One structure track; rows → note clips or lanes inside it | Phase 2+ | Partial |
| Step pattern (sub-parts) | Note clips on **lanes within** the group track | **Feasible** — drum grid → MIDI notes, one exported track | Reconstruct grid from notes |
| Sample file | Audio file in archive + clip reference | ✅ | ✅ if we map clips → steps |
| Reverb/delay sends | Channel sends | ✅ if mixer modeled | ✅ read send levels |
| VCF insert | Built-in EQ/filter device? | Subset | Subset |
| Tempo / time sig | Transport | ✅ | ✅ |

**Strategy:** treat DAWproject as **export target** for “grooves → elsewhere” before full import. Step grid → **note clips** on a drum lane is the natural bridge (same as MIDI export mentally).

**Not in scope early:** VST plug-in states, clip launcher scenes, video.

---

## MIDI — practical role

- **Export:** **one MIDI track per group track** — e.g. Drums: all rows → note events on a single track (typically channel 10); each row’s `midi.note` identifies the hit. Loop/instrument groups export as one track each with their own event model.
- **Import:** note events → step grid or clips **within** a group (quantize to resolution); **no sample assignment** — user maps notes to samples manually or via map file.
- **Clock:** future sync with external gear (jam-station MIDI clock patterns).

MIDI is **event interchange**, not a grooves project format. Sub-part filters/sends are **not** represented in MIDI export.

---

## MusicXML — practical role

- Relevant when **piano-roll / instrument tracks** exist (jam-station `type: 'piano'`).
- Export pitched notes from instrument tracks; no samples, no step grid for drums (unless written as unpitched percussion notation).
- Lower priority than MIDI for grooves’ drum-first path.

---

## Compatibility philosophy

1. **Native JSON/ZIP is source of truth** — full state, versioning, grooves-specific types.
2. **DAWproject** — structured interchange when users move to/from DAWs; implement **export subset** first.
3. **MIDI** — patterns and clock; quick wins for hardware.
4. **MusicXML** — later, tied to instrument tracks.

Avoid pretending JSON *is* DAWproject — keep converters as explicit **import/export adapters** (`util/export/dawproject.js`, etc.).

---

## Versioning & migration

- Every native file: `"format": "grooves-project"`, `"version": N`.
- Track **schema changes** in `summaries/` when breaking (like jam-station state migrations in actions).
- Kits already have `metadata.json` — align kit version with project version where they meet.

---

## Open questions

- [ ] File extension: `.grooves`, `.grooves.zip`, or `.json` + optional zip?
- [ ] Embed **default kit** in project zip or require kit refs only?
- [ ] DAWproject: target **Bitwig**-flavored export first, or minimal spec-compliant subset?
- [ ] Auto-save to **localStorage** before file export (jam-station roadmap item)?
- [ ] Single **project.json** schema shared with future jam-station merge, or grooves-specific?

---

## Suggested exploration order

1. Define **`project.json` schema v1** from current state (sequencer + assignments + trackParams).
2. **Export/import JSON** in dev menu (no zip yet).
3. Add **ZIP** wrapper with sample WAVs (reuse JSZip like library load).
4. Spike **MIDI export** of step grid (one pattern).
5. Read DAWproject XSD; prototype **note clip** export for one track.
6. MusicXML when instrument tracks land.
