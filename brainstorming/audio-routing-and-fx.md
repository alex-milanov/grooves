# Audio Routing, FX & Busses

**Date:** 2026-06-21  
**Status:** Implemented (2026-06-21)

## Goal

Per-track **insert** effects (starting with **VCF**, ref jam-station) plus **shared send busses** for **reverb** and **delay**, where each track controls how much signal goes to either bus. While building this, start modeling the **audio graph in state** and exploring a **visual routing view**.

---

## Current grooves signal path

Today (`src/app/util/audio.js`):

```
BufferSource ──► trackGain[i] ──► context.destination
```

- One `GainNode` per track index, wired straight to output.
- No inserts, no sends, no master bus, no FX.
- `trackParams` holds `{ volume, muted }` only.

---

## Target signal path (working draft)

```
                         ┌──► reverbBus ──► master ──► out
BufferSource ──► inserts ──► trackGain ──┤
                         │                └──► delayBus  ──► master
                         └── (dry path continues to trackGain input)
```

**Design choices:**

| Layer | Role | Grooves approach |
|-------|------|------------------|
| **Inserts** | Per-track, in series before fader | VCF first (from jam-station / iblokz-audio); maybe more later |
| **Sends** | Tap post-insert, pre- or post-fader TBD | `sendReverb`, `sendDelay` (0–1) per track |
| **Busses** | Shared FX returns | One reverb engine, one delay engine |
| **Master** | Sum dry + returns | Single master gain (future: limiter?) |

**Open:** send **pre-fader** vs **post-fader** — hardware grooveboxes vary; post-fader is common for “send level relative to mix”. Start post-fader unless inspiration says otherwise.

---

## References in the ecosystem

### jam-station + iblokz-audio

- Per-track **`effectsChain`** array in session state: `vcf`, `reverb`, `lfo`, `delay` as **serial inserts** on the instrument chain.
- Audio service **`syncEffectsChain` / `updateConnections`** rebuilds Web Audio nodes from state (`summaries/2025-12-26-01-effects-chain-state-changes.md`).
- Default effect configs in `actions/instrument/index.js` (cutoff, wet/dry, delay time, etc.).
- **Difference for grooves:** jam-station puts reverb **on the track chain**; grooves wants reverb/delay on **shared busses** with sends — closer to a mixer / DAW model and to DAWproject’s “Sends” concept.

### xAmplR

- Simpler chain: sample → VCF → reverb (per pad, not bussed).
- Good reference for **VCF UI** and wet/dry params on a sampler path.

### world-metronome

- Minimal graph (click → destination); no FX — not a routing reference.

### iblokz-audio (npm, jam-station dep)

- `vcf()`, `create('reverb', …)`, delay helpers — **reuse** rather than reimplement filters.
- Grooves currently uses raw Web Audio only; adding `iblokz-audio` (or porting minimal VCF/reverb/delay nodes) is a decision point.

---

## State model (draft)

Separate **transport/sequencer**, **mixer/routing**, and **track content** instead of folding everything into `sequencer.*`:

```javascript
// Illustrative — not final API
mixer: {
  master: { volume: 1 },
  buses: {
    reverb: { on: true, seconds: 3, decay: 2, wet: 1, dry: 0 },
    delay:  { on: true, time: 0.375, feedback: 0.4, wet: 1, dry: 0 },
  },
},
tracks: [
  {
    id: 't0',
    type: 'sample-seq',
    name: 'Kick',
    mixer: {
      volume: 0.85,
      muted: false,
      solo: false,
      pan: 0,           // future
      inserts: [ /* VCF */ ],
      sends: { reverb: 0.25, delay: 0.1 },
    },
    // type-specific payload ↓
    sample: { kit: 'basic_drum_kit', file: 'PD-KICK-03.wav' },
    pattern: { /* step grid */ },
  },
],
```

**Parallel “routing graph” for UI** — either derived from the above or stored explicitly:

```javascript
routing: {
  nodes: [
    { id: 't0-out', trackId: 't0', kind: 'track-out' },
    { id: 'bus-reverb', kind: 'bus', bus: 'reverb' },
    { id: 'master', kind: 'master' },
  ],
  edges: [
    { from: 't0-out', to: 'master', gain: 1 },
    { from: 't0-out', to: 'bus-reverb', gain: 0.25 },
  ],
}
```

Prefer **derive graph from tracks + mixer** when possible; only persist edits if we add custom routing later.

---

## Audio engine responsibilities

| Piece | Owner | Notes |
|-------|-------|-------|
| Node registry (track → inserts → gain → sends) | `util/audio.js` or new `services/mixer.js` | Mirror jam-station reconnect pattern |
| Sync on state change | RxJS subscription | Like `syncTrackGains` today |
| Scheduled voices | `sequencer.js` + `play()` | Connect sources to **track input**, not raw gain |
| Bus processors | Lazy singletons | Reverb/delay nodes live once, fed by send gains |

**Migration path:**

1. Introduce master bus (everything through master gain).
2. Add shared reverb + delay busses + per-track send gains.
3. Add VCF insert per track (iblokz-audio or minimal port).
4. Refactor state from `sequencer.trackParams` → track-centric `mixer` block.
5. Routing visualization (read-only at first).

---

## Visual routing — library options

Goal: show **nodes** (tracks, busses, master) and **edges** (audio + send levels), optionally live levels later.

| Option | Pros | Cons |
|--------|------|------|
| **Plain SVG + Snabbdom** | No dep, matches stack, full control | Layout math by hand |
| **d3-force** | Good for small node graphs, draggable | d3 learning curve; bundle size |
| **d3-sankey** | Nice for send/return flow | Less natural for feedback loops (delay) |
| **Cytoscape.js** | Built for graphs, layouts, interaction | Heavier; another paradigm |
| **dagre + dagre-d3** | Clean top-to-bottom signal flow | Mostly static; less “groovebox” feel |

**Recommendation for step 1:** small **SVG patch** via Snabbdom — tracks as rows, busses on the right, sends as lines. Prove the **state → diagram** mapping before picking d3.

**UI placement ideas:**

- **Workspaces strip** under header — per-track tabs + Routing + Mixer; see [`workspaces.md`](workspaces.md).
- Collapsible **Mixer / Routing** as dedicated workspaces (not side panels beside library).
- Mini routing strip in track settings (shows only selected track’s path) — optional.
- Full-screen “wire view” = **Routing** workspace.

---

## UI / UX notes (groovebox inspiration)

- **Mixer workspace** — column console with **flex**: track columns left, spacer, bus + master columns right; see [`workspaces.md`](workspaces.md) § Flex layout & Mixer workspace.
- Per-part editor (track settings): VCF cutoff/resonance; optional duplicate send knobs for convenience.
- Bus **effect parameters** (reverb time/decay, delay time/feedback) live in **bus columns** on the mixer, not only in a global settings panel.
- Visual feedback: highlight bus column when any send > 0; optional meters on faders (later).
- **Solo** per session track — new control; implement in audio graph when mixer workspace lands.

---

## Open questions

- [ ] Add **iblokz-audio** dependency vs minimal inline BiquadFilter + Convolver/DelayNode?
- [ ] **Convolver reverb** (impulse) vs algorithmic (jam-station style)?
- [ ] Max insert count per track (1 VCF only for MVP)?
- [ ] Should busses be **fixed** (reverb + delay only) or extensible list?
- [ ] Routing view: **read-only diagram** first, or interactive (drag sends)?

---

## Suggested first slice

1. Master bus + reverb send bus (one shared reverb, send per track).
2. State: `mixer.buses.reverb`, `tracks[n].mixer.sends.reverb`.
3. Wire `play()` through track chain into master.
4. Simple SVG routing diagram for 4 tracks + reverb + master.
5. Delay bus + VCF insert in slice 2.
