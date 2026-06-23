# Grooves — Vision

**Date:** 2026-06-21  
**Status:** Brainstorming

## One-liner

A browser-based groovebox prototype on the latest iBlokz stack — starting from a simple drum sequencer and growing by integrating the best patterns from the existing app ecosystem, one step at a time.

## Context

Over the years several web-based music apps were built around the same ideas: Web Audio, step sequencing, sampling, looping, live performance. They share libraries (`iblokz-state`, `iblokz-snabbdom-helpers`, `iblokz-data`, audio utilities) and conventions, with the iBlokz boilerplate as the current UI/theme baseline.

**Grooves** is not a rewrite of any single app. It is a **fresh prototype** that:

1. Starts minimal (step sequencer + sample assignment).
2. Uses the **modern stack** (ES modules, Parcel 2, RxJS 7, Biome — not legacy gulp/jQuery-era code).
3. **Cherry-picks** proven patterns from sibling projects rather than porting them wholesale.
4. Ships incrementally — each integration should be usable on its own.

## What exists today

- **Step sequencer** — tracks, BPM, time signature, resolution, on/off grid, playhead
- **Sample library** — zip kit load (`metadata.json` + WAVs), browse/assign to tracks
- **Track settings panel** — volume, mute, WaveSurfer preview, cursor synced to sequencer hits
- **Scheduling** — anchor-and-derive transport from **world-metronome** (`AudioContext.currentTime`, cycle scheduling, mid-play grid edits)
- **Theming** — boilerplate-style families (pixel, terminal, studio, crm) × light/dark
- **Live demo** — [alex-milanov.github.io/grooves](https://alex-milanov.github.io/grooves/)

## Product direction (working)

Grooves sits in the **groovebox / performance** space — closer to jam-station’s sequencer + sample bank than to a full DAW, but with room to grow:

| Near term | Medium term | Long term (maybe) |
|-----------|-------------|-----------------|
| Solid drum-machine UX | More sample sources & kit management | Loop layers / overdub (js-loop-station) |
| Per-track sample controls | Pad-style live triggering (xAmplR) | MIDI in/out |
| Reliable timing & preview | Tap tempo, transport polish | Piano roll / melodic tracks (jam-station) |
| Themed, responsive UI | Effects per track (filter, reverb) | Session/song structure |

Exact scope stays open — the table is a brainstorm, not a commitment.

## Core principles

1. **AudioContext is the clock** — timing authority from world-metronome; no parallel tick counters in state.
2. **Services + reactive state** — `iblokz-state` + RxJS subscriptions; UI stays thin (Snabbdom).
3. **Samples as first-class** — library browsing, assignment, waveform feedback (xAmplR + jam-station media library patterns).
4. **Step-by-step** — land one vertical slice (e.g. library → assign → hear → see waveform) before adding the next feature.
5. **Reuse libraries, not copy-paste apps** — extract ideas and small utilities; rewrite to match current module style.
6. **Same license lineage** — AGPL-3.0, aligned with jam-station.

## What Grooves is *not* (for now)

- Not a full jam-station replacement (no synth engine, piano roll, OSC, MIDI stack yet).
- Not xAmplR’s 16-pad MPC layout (unless we deliberately add a performance view later).
- Not a cloud DAW (js-loops era) — local/browser-first, static deploy friendly.
- Not a metronome app — we borrow **scheduling math**, not rhythm traditions UI.

## Open questions

- ~~**Identity:** drum machine only, or “groovebox” with melodic/loop tracks eventually?~~ → see [`track-model.md`](track-model.md) — multi-type tracks, step-by-step
- **Library:** stay zip-kit local only, or add Freesound/API browse (xAmplR)?
- **Performance surface:** sequencer grid only, or optional pad bank for live hits?
- **Mobile:** touch-first sequencer (jam-station roadmap) — how early?
- **Relationship to jam-station:** does Grooves eventually merge back, or stay a focused sibling?
- **FX architecture:** iblokz-audio dependency vs minimal Web Audio nodes? → see [`audio-routing-and-fx.md`](audio-routing-and-fx.md)
- **Interchange priority:** native JSON/ZIP first, then MIDI export or DAWproject? → see [`project-formats.md`](project-formats.md)

## Next brainstorming topics

- [`ecosystem.md`](ecosystem.md) — per-app feature map and port status
- [`audio-routing-and-fx.md`](audio-routing-and-fx.md) — busses, VCF, routing UI
- [`project-formats.md`](project-formats.md) — save/load and DAW interchange
- [`track-model.md`](track-model.md) — sample-seq vs loop vs instrument
- Panel layout & responsive behavior (library left, settings right — extend?)
- Transport UX (play/stop, tap tempo, count-in)
