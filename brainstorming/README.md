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

### Future (as topics grow)
- `design/` — UI/UX specs, panel layouts, interaction patterns
- `architecture/` — service boundaries, audio graph, state shape
- `integrations/` — per-feature port notes (scheduling, library, MIDI, etc.)

## Current focus

**Active:** loop track MVP ([`planning/2026-06-24-02-loops-mvp.md`](../planning/2026-06-24-02-loops-mvp.md)), workspaces strip + mixer, `tracks[]` migration, project formats.

**Next implementation slice:** workspaces UI shell — strip, `activeWorkspace`, mixer columns (part mixer + buses + master).

## Quick links

- 🎯 **Vision:** [`vision.md`](vision.md)
- 🔗 **Ecosystem map:** [`ecosystem.md`](ecosystem.md)
- 🎛️ **FX & routing:** [`audio-routing-and-fx.md`](audio-routing-and-fx.md)
- 💾 **Project formats:** [`project-formats.md`](project-formats.md)
- 🎚️ **Track model:** [`track-model.md`](track-model.md)
- ⏯️ **Transport:** [`transport.md`](transport.md)
- 🔁 **Loops:** [`loops.md`](loops.md)
- 🖥️ **Workspaces:** [`workspaces.md`](workspaces.md)
- 📦 **What exists today:** [README](../README)
