# Brainstorming & Design

Exploratory docs for **Grooves** — vision, ecosystem references, and integration ideas.  
Implementation specs graduate to `planning/`; completed work is recorded in `summaries/` (when those folders exist).

## Folder structure

### Root
- [`vision.md`](vision.md) — what Grooves is, core principles, step-by-step approach
- [`ecosystem.md`](ecosystem.md) — sibling apps, what to borrow from each, integration status
- [`audio-routing-and-fx.md`](audio-routing-and-fx.md) — VCF inserts, reverb/delay busses, routing state & visualization
- [`project-formats.md`](project-formats.md) — JSON, ZIP, DAWproject, MIDI, MusicXML interchange
- [`track-model.md`](track-model.md) — track types, naming, session structure, MIDI mapping
- [`transport.md`](transport.md) — session vs per-track transport, shared startTime, scheduling
- [`loops.md`](loops.md) — loop track MVP (4 slots, record, quantize, virtual click)
- [`workspaces.md`](workspaces.md) — strip switcher, one workspace per track, mixer & routing screens
- [`app-structure.md`](app-structure.md) — folder roles (`state/` / `services/` / `util/`), vs jam & world-metronome

### Future (as topics grow)
- `design/` — UI/UX specs, panel layouts, interaction patterns
- `architecture/` — deeper service / element-bound notes (iblokz); start from [`app-structure.md`](app-structure.md)
- `integrations/` — per-feature port notes (scheduling, library, MIDI, etc.)

## Current focus

**Active:** app structure refactor — grow `state/`, purify `util/`, move live audio to `services/audio/` ([`planning/2026-10-21-01-app-structure-refactor.md`](../planning/2026-10-21-01-app-structure-refactor.md), [`app-structure.md`](app-structure.md)).

**Implemented (recent):** loop track MVP, workspaces strip + mixer. **Still open:** `tracks[]` / drums row migration ([`track-model.md`](track-model.md)), project formats.

## Quick links

- 🎯 **Vision:** [`vision.md`](vision.md)
- 🗂️ **App structure:** [`app-structure.md`](app-structure.md)
- 🔗 **Ecosystem map:** [`ecosystem.md`](ecosystem.md)
- 🎛️ **FX & routing:** [`audio-routing-and-fx.md`](audio-routing-and-fx.md)
- 💾 **Project formats:** [`project-formats.md`](project-formats.md)
- 🎚️ **Track model:** [`track-model.md`](track-model.md)
- ⏯️ **Transport:** [`transport.md`](transport.md)
- 🔁 **Loops:** [`loops.md`](loops.md)
- 🖥️ **Workspaces:** [`workspaces.md`](workspaces.md)
- 📦 **What exists today:** [README](../README)
