# FX Chain, Send Busses & Knob Controls

**Date:** 2026-06-21  
**Status:** Implemented  
**Brainstorming:** [`brainstorming/audio-routing-and-fx.md`](../brainstorming/audio-routing-and-fx.md)

---

## Scope (this slice)

**In:**
- Per-track **VCF insert** — cutoff + resonance (jam-station / iblokz-audio semantics: 0–1 normalized)
- Per-track **send levels** — reverb + delay (0–1)
- Shared **reverb** and **delay** return busses with **fixed global defaults** (not editable in UI yet)
- **Master bus** summing dry + FX returns
- **`routing` in state** — explicit `nodes` + `edges` graph that drives Web Audio connect/disconnect (foundation for future reroute UI)
- Reusable **knob component** — pure CSS dial + pointer/wheel; **themed** like other controls (pixel / terminal / studio / crm × light/dark)
- Track settings panel: 4 knobs for the above

**Out (later):**
- Interactive routing UI (d3/SVG patch panel to reroute/disconnect)
- Bus parameter UI, full `tracks[]` state refactor, `project.json` export
- Replacing volume slider with a knob

---

## Current vs target audio graph

Today in `src/app/util/audio.js`:

```
BufferSource → trackGain[i] → context.destination
```

Target:

```
BufferSource → track-N-in → VCF → fader → master → dest
                              ├─[send]→ reverb bus → master
                              └─[send]→ delay bus  → master
```

- **Post-fader sends**
- **Connections are data, not hardcoded** — default topology stored in `state.routing`, applied by `applyRouting()`
- `play()` connects sources to **`track-N-in`**, not directly to fader

---

## Routing state model

```javascript
routing: {
  nodes: [
    { id: 'master', kind: 'master' },
    { id: 'dest', kind: 'destination' },
    { id: 'bus-reverb', kind: 'bus', bus: 'reverb' },
    { id: 'bus-delay', kind: 'bus', bus: 'delay' },
    { id: 'track-0-in', kind: 'track-in', track: 0 },
    { id: 'track-0-vcf', kind: 'insert', track: 0, effect: 'vcf' },
    { id: 'track-0-fader', kind: 'fader', track: 0 },
    // … per track
  ],
  edges: [
    { id: 'e-master-out', from: 'master', to: 'dest', gain: 1 },
    { id: 'e-bus-reverb-out', from: 'bus-reverb', to: 'master', gain: 1 },
    { id: 'e-bus-delay-out', from: 'bus-delay', to: 'master', gain: 1 },
    { id: 'e-t0-in-vcf', from: 'track-0-in', to: 'track-0-vcf', gain: 1 },
    { id: 'e-t0-vcf-fader', from: 'track-0-vcf', to: 'track-0-fader', gain: 1 },
    { id: 'e-t0-dry', from: 'track-0-fader', to: 'master', gain: 1 },
    { id: 'e-t0-rev', from: 'track-0-fader', to: 'bus-reverb',
      gainParam: ['sequencer', 'trackParams', 0, 'sends', 'reverb'] },
    { id: 'e-t0-dly', from: 'track-0-fader', to: 'bus-delay',
      gainParam: ['sequencer', 'trackParams', 0, 'sends', 'delay'] },
  ],
}
```

| Field | Purpose |
|-------|---------|
| `nodes[].id` | Stable string ID for edges and future routing UI |
| `nodes[].kind` | `track-in`, `insert`, `fader`, `bus`, `master`, `destination` |
| `edges[].gain` | Static edge gain |
| `edges[].gainParam` | State path for dynamic send level |
| `edges[].enabled` | `false` to disconnect without deleting (future UI) |

### Files

- `src/app/util/routing.js` — `buildDefaultRouting(tracks)`, `getTrackInputId`, `resolveEdgeGain`
- `src/app/util/audio.js` — `ensureNodes`, `applyRouting`, `syncTrackMixer`, `getTrackInput`
- `src/app/services/mixer.js` — subscribes to `routing` + `trackParams`

---

## State changes

```javascript
routing: buildDefaultRouting(4),

mixer: {
  buses: {
    reverb: { seconds: 3, decay: 2 },
    delay:  { time: 0.375, feedback: 0.35 },
  },
},

sequencer: {
  trackParams: {
    // per track: volume, muted, vcf: { cutoff, resonance }, sends: { reverb, delay }
  },
}
```

- `src/app/util/track-params.js` — `getTrackParams`, `DEFAULT_TRACK_PARAMS`, `trackGain`
- Defaults: cutoff `0.64`, resonance `0`, sends `0`

---

## Audio engine

### Dependencies

- `iblokz-audio` — VCF + reverb bus (`context` re-exported from iblokz-audio)
- Native `DelayNode` + feedback — delay bus

### Node kinds

| Kind | Audio object |
|------|--------------|
| `track-in` | passthrough `GainNode` — `BufferSource` attach point |
| `insert` | iblokz-audio VCF |
| `fader` | per-track `GainNode` |
| `bus` | shared reverb or delay |
| `master` | sum `GainNode` |
| `destination` | `context.destination` |

Each edge gets an intermediate `GainNode` for static/dynamic gain control.

### Services

- **`mixer.js`** — sync routing + trackParams → audio graph
- **`sequencer.js`** — transport only; remove `syncTrackGains` subscription

---

## Knob component

### Files

- `src/app/ui/components/knob.js`
- `src/styles/_knob.scss` (layout)
- `src/styles/theme/_components.scss` — `@mixin knob` / `.knob` using `--app-*` tokens

### API

```javascript
knob({
  label: 'Cutoff',
  value: 0.64,
  min: 0, max: 1, step: 0.01,
  disabled: false,
  onChange: v => dispatch(...),
})
```

### Interaction

- Value → rotation (−135° to +135°)
- Pointer drag (vertical), mouse wheel
- `aria-valuenow` / min / max
- Hidden range input for a11y

### Theming (required)

- No hardcoded jam-station grays
- Dial: `--app-input-bg`, `--app-panel-border`, `--app-btn-shadow`
- Indicator: `--app-btn-primary-bg`
- Label: `label-muted` mixin
- All 8 theme variants must work without extra JS

References: jam-station `vco/index.js` + `_instrument.sass` (interaction); CodePen `ogbYZjB` (shape, colors via tokens).

---

## Track settings UI

`src/app/ui/sections/track-settings.js` — FX grid below waveform:

```
[ Cutoff ] [ Resonance ]
[ Rev Send ] [ Dly Send ]
```

Patch paths:
- `['sequencer', 'trackParams', N, 'vcf', 'cutoff'|'resonance']`
- `['sequencer', 'trackParams', N, 'sends', 'reverb'|'delay']`

Panel: widen to ~`20em`, `.fx-grid` 2×2.

---

## Implementation order

1. `pnpm add iblokz-audio` + context consolidation
2. `routing.js` + state `routing` / `mixer`
3. `audio.js` graph + `applyRouting()` + `play()` via `track-N-in`
4. `track-params.js`
5. `mixer.js` service + `index.js` HMR
6. Knob component + themed SCSS
7. Track settings FX grid
8. Panel / responsive polish
9. Manual verification

---

## Verification

1. Cutoff/resonance audible on preview
2. Reverb/delay send audible on sequencer + preview
3. Mute silences dry + sends
4. Theme switch updates knob appearance
5. Independent per-track FX
6. `pnpm run check` passes
