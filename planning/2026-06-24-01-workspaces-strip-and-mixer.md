# Workspaces — Strip, Drums Editor & Mixer

**Date:** 2026-06-24  
**Status:** Implemented (slice 1)  
**Brainstorming:** [`brainstorming/workspaces.md`](../brainstorming/workspaces.md), [`brainstorming/track-model.md`](../brainstorming/track-model.md)

---

## Scope (this slice)

**In:**

- **Workspaces strip** under header — flex row: **tracks (left)** | **spacer** | **system (right)**
- **Track 1 — Drums** strip tab → one **group track** (`sample-seq`): today’s sequencer editor (multi-row grid + track settings). Four rows = **sub-parts**, not four mixer strips.
- **Mixer** strip tab → **root-level tracks only** — one column per group track (+ buses + master). No row/slot sub-faders.
- **`ui.activeWorkspace`** — switch between `'drums'` and `'mixer'`
- **Header strip toggle** — show/hide strip; **closed by default on mobile** (`< 900px`)
- **Drums mixer column** — group-track vol, mute, solo (`partMixer` → future `tracks[0].mixer`)
- Per-**row** filter (VCF) and **sends** in **track settings** only — not in mixer UI
- **Bus columns** — reverb + delay with **FX knobs** bound to existing `mixer.buses.*`
- **Master column** — master volume (new `mixer.master.volume` if missing)
- **Solo logic** in audio/mixer service (at least for the single Drums part)

**Out (later slices):**

- Full `tracks[]` + `rows[]` state migration
- **Routing** workspace (omit tab or show disabled placeholder)
- **+ Add track**, second session track, loop/instrument types
- Inactive strip **live previews** / animations
- `localStorage` persistence for strip open/closed
- Pan, meters, bus mute/return faders
- Mixer columns for sub-parts (rows, loop slots)

---

## Group tracks (model)

See [`track-model.md`](../brainstorming/track-model.md) § Group tracks.

| Layer | Drums (slice 1) | Mixer | MIDI export |
|-------|-----------------|-------|-------------|
| **Group track** | One `sample-seq` “Drums” | One column | One MIDI track |
| **Sub-part** | Rows 0–3 (kick, snare, …) | Not shown | Note events folded into group track |

- Sub-parts may have **their own filter and send** in the editor (`trackParams[i]` today).
- **Mixer** edits **group** vol / mute / solo only.
- Future **loop** group tracks: slots = sub-parts; same export/mixer rules.

## Current vs target chrome

**Today** (`src/app/ui/index.js`):

```
header
.workspace
  .workspace-inner
    library | sequencer | track-settings   (always visible together)
```

**Target:**

```
header (+ workspaces strip toggle, rightmost)
.workspaces-strip (collapsible)
  .workspaces-strip-tracks  [ Drums ]
  .workspaces-strip-spacer
  .workspaces-strip-system  [ Mixer ]
.workspace
  .workspace-view  (one active child)
    'drums'  → .workspace-inner (library | sequencer | track-settings)
    'mixer'  → .mixer-console
```

Transport (play, BPM, sig, resolution) stays in **sequencer header** for this slice; moving transport to global chrome is a follow-up.

---

## State (minimal extension)

Avoid full `tracks[]` refactor in slice 1. Add **`ui`** and **`partMixer`** as the Drums **group track** mixer (alias for future `tracks[0].mixer`).

```javascript
ui: {
  activeWorkspace: 'drums',      // 'drums' | 'mixer'
  workspacesStripOpen: true,     // false on mobile at init — see util/workspaces.js
},

// Group-track mixer — Drums (future: tracks[0].mixer)
partMixer: {
  volume: 1,
  muted: false,
  solo: false,
},

mixer: {
  master: { volume: 1 },
  buses: {
    reverb: { seconds: 3, decay: 2 },
    delay: { time: 0.375, feedback: 0.35 },
  },
},

sequencer: {
  /* rows: grid, assignments, trackParams[i] — sub-part inserts/sends/VCF */
},
```

| Path | Purpose |
|------|---------|
| `ui.activeWorkspace` | Which main view is mounted |
| `ui.workspacesStripOpen` | Strip visibility (header toggle) |
| `partMixer.*` | **Group track** Drums — mixer column + future MIDI export level |
| `sequencer.trackParams[i].*` | **Sub-part** — VCF, per-row vol/mute/sends in track settings (not mixer) |
| `mixer.buses.*` | Bus FX params (bus columns) |
| `mixer.master.volume` | Master fader |

**Audio mapping (slice 1):**

- **`partMixer`** — group gain / mute / solo on the **combined** Drums dry path (`part-drums` → master).
- **Row `trackParams`** — per-sub-part VCF and **sends** (fader → buses); edited in track settings only.
- **Solo** — at group level; when track 2 exists, non-solo groups mute.

**Export (later adapters):** one MIDI track for Drums; row notes merged on `partMixer` / group `midi.channel`.

## UI components

### Files (new)

| File | Role |
|------|------|
| `src/app/util/workspaces.js` | `WORKSPACES`, `defaultStripOpen(state)`, `isDrumsWorkspace`, helpers |
| `src/app/ui/workspaces-strip.js` | Strip DOM: tracks group, spacer, Mixer tab |
| `src/app/ui/sections/mixer.js` | Mixer workspace — column layout |
| `src/app/ui/components/mixer-column.js` | Reusable track/bus/master column (optional split) |
| `src/styles/_workspaces-strip.scss` | Flex strip + active tab + collapse |
| `src/styles/_mixer.scss` | `.mixer-console`, columns, faders, M/S buttons |

### Files (edit)

| File | Change |
|------|--------|
| `src/app/state/index.js` | `ui`, `partMixer`, `mixer.master` |
| `src/app/ui/index.js` | Strip + conditional workspace view |
| `src/app/ui/header.js` | Strip toggle button |
| `src/app/services/viewport.js` | Set initial `workspacesStripOpen` on resize (optional init in workspaces util) |
| `src/app/services/mixer.js` | Sync `partMixer`, `mixer.master`, solo |
| `src/styles/index.scss` | Import new SCSS |
| `src/styles/_responsive.scss` | Strip collapse; mixer horizontal scroll on mobile |

---

## Workspaces strip

### Flex structure

```scss
.workspaces-strip { display: flex; flex-flow: row nowrap; }
.workspaces-strip-tracks { flex: 0 0 auto; display: flex; }
.workspaces-strip-spacer { flex: 1 1 auto; min-width: 0.5em; }
.workspaces-strip-system { flex: 0 0 auto; display: flex; }
```

### Tabs (slice 1)

| Tab | `activeWorkspace` | Notes |
|-----|-------------------|--------|
| **Drums** | `'drums'` | Label from `partMixer.name` or constant; type icon optional |
| **Mixer** | `'mixer'` | Right group |

Routing tab **not shown** in slice 1.

### Strip toggle (header)

- Rightmost control after save; icon-only (e.g. `fa-th-large` / chevron).
- Toggles `ui.workspacesStripOpen`.
- When closed: strip `display: none` or not rendered; workspace area expands.
- Default: `workspacesStripOpen: window.innerWidth >= 900`.

### Active tab

- Class `.active` on strip item matching `ui.activeWorkspace`.
- Click tab → `dispatch(patch(['ui', 'activeWorkspace'], id))`.

---

## Drums workspace (`activeWorkspace === 'drums'`)

Mount existing children unchanged:

```javascript
div('.workspace-inner', [
  library(state),
  sequencer(state),
  trackSettings(state),
])
```

No structural change to sequencer grid — four rows remain one **part**. Rename user-facing copy from “Tracks 4” to **“Rows 4”** or keep count label but document as rows (optional polish).

`selectedTrack` in sequencer state continues to mean **selected row** (rename deferred).

---

## Mixer workspace (`activeWorkspace === 'mixer'`)

### Flex structure

```scss
.mixer-console { display: flex; flex-flow: row nowrap; align-items: stretch; }
.mixer-tracks { display: flex; flex: 0 1 auto; overflow-x: auto; }
.mixer-spacer { flex: 1 1 auto; }
.mixer-buses-master { display: flex; flex: 0 0 auto; }
```

### Columns (slice 1)

| Column | Controls | State |
|--------|----------|--------|
| **Drums** | Vol (fader or vertical range), Mute, Solo | `partMixer` |
| **Reverb** | Knobs: `seconds`, `decay` | `mixer.buses.reverb` |
| **Delay** | Knobs: `time`, `feedback` | `mixer.buses.delay` |
| **Master** | Volume | `mixer.master.volume` |

Reuse **knob** component for bus FX; faders can be `input[type=range]` vertical (CSS) to match mixer convention.

### Layout sketch

```
[ Drums  ]                    [ Reverb ] [ Delay ] [ Master ]
  vol                             sec      time      vol
  M S                             decay    fb
```

---

## Audio / mixer service

Extend `src/app/services/mixer.js` (and `audio.js` if needed):

1. **`partMixer.volume` / `muted`** — group gain on dry path (`part-drums` → master).
2. **`mixer.master.volume`** — master bus gain before destination.
3. **`mixer.buses.*`** — already synced; wire bus column knobs to existing bus param updates.
4. **Row sends** — `trackParams[i].sends` → fader → bus edges (track settings UI).
5. **Solo** — stub: when any part has `solo: true`, non-solo parts silent; with one part, implement plumbing only.

---

## Implementation order

1. **State** — `ui`, `partMixer`, `mixer.master`; defaults in `initial`.
2. **`util/workspaces.js`** — constants, mobile strip default.
3. **`workspaces-strip.js` + SCSS** — flex strip, Drums + Mixer tabs, wire `activeWorkspace`.
4. **`ui/index.js`** — mount strip; switch workspace view by `activeWorkspace`.
5. **Header** — strip toggle → `ui.workspacesStripOpen`.
6. **`mixer.js` section + SCSS** — column layout, Drums + bus + master columns (UI only).
7. **Bind controls** — `partMixer`, `mixer.buses`, `mixer.master` dispatch patches.
8. **`mixer` service** — sync part gain, master, bus params; solo hook.
9. **Responsive** — strip hidden default mobile; mixer column scroll.
10. **Manual verification** + `pnpm run check`.

---

## Verification

1. Strip shows **Drums** (left) and **Mixer** (right) with spacer between; active tab highlights.
2. **Drums** tab → library + sequencer + track settings work as today.
3. **Mixer** tab → replaces editor area; sequencer/library hidden.
4. Header toggle hides/shows strip; mobile defaults hidden.
5. Drums column **volume / mute / solo** affect the **group** dry output.
6. Row **VCF / sends** in track settings work per sub-part (Rev/Dly knobs).
7. Bus column knobs change reverb/delay tone.
8. Master volume affects output.
9. Transport keeps playing when switching workspaces.
10. `pnpm run check` passes.

---

## Follow-up slices (not this PR)

- `tracks[]` / `rows[]` state migration
- Routing tab + SVG workspace
- **+** add track, strip previews
- MIDI / DAWproject export adapters (group-track rules documented in track-model)
