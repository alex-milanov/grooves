# Workspaces & Strip Switcher

**Date:** 2026-06-24  
**Status:** Brainstorming — **plan:** [`planning/2026-06-24-01-workspaces-strip-and-mixer.md`](../planning/2026-06-24-01-workspaces-strip-and-mixer.md)

## Decision

**Each session track gets its own workspace.** The strip under the header lists one tab per track (type-specific editor when active), plus global workspaces for **Routing** and **Mixer**, and a control to **add a track**.

**Important:** today’s **4-row step grid is one `sample-seq` track** (e.g. “Drums”), not four tracks. Each **row** is a different sound / **MIDI note** (kick, snare, hat, …). The workspace for that track shows the **full multi-row grid** — essentially today’s sequencer UI scoped to one part.

Related docs: [`track-model.md`](track-model.md) (typed `tracks[]`, `rows[]`, MIDI), [`audio-routing-and-fx.md`](audio-routing-and-fx.md) (mixer, buses, routing graph).

---

## Chrome layout

```
┌─────────────────────────────────────────────────────────────┐
│  Header (logo, lang, theme, save, [strip toggle])            │
├─────────────────────────────────────────────────────────────┤
│  Workspaces strip (flex — see § Flex layout)                 │
│  [ Track 1 ][ Track 2 ][ + ]  ·····spacer····  [Routing][Mixer] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Active workspace (full editor — library / settings may     │
│  flank or embed per track type)                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- **Strip** — fixed under header, above main workspace area; **collapsible** on small screens.
- **Strip toggle** — header control (see below) shows/hides the strip to reclaim vertical space on mobile.
- **Workspace** — one full editor at a time; content depends on `track.type` or global mode (`routing`, `mixer`).
- **Transport** (play, pause, stop, BPM) — **global session** in header; shared `startTime` for all tracks. Per-track arm/play/pause when multiple session tracks exist. See [`transport.md`](transport.md).

---

## Strip toggle (header)

**Decision:** a **workspace strip toggle** in the site header — **rightmost** control (after save), icon-only (e.g. layers / grid / chevron).

| Viewport | Default strip | Toggle |
|----------|---------------|--------|
| **Desktop** (≥ mobile breakpoint) | **Visible** | Optional; user can hide strip for more editor space |
| **Mobile** (`< 900px`) | **Hidden** | User opens strip when switching parts; closes to maximize workspace |

**Behavior:**

- Toggle flips `ui.workspacesStripOpen` (or `panels.workspacesStrip`).
- When **closed:** strip not in layout (not `visibility: hidden` only — free the height for the active workspace).
- When **open:** strip slides or expands under header (horizontal scroll for many tabs on phone).
- **Active workspace unchanged** when strip is closed — user keeps editing; only navigation chrome is hidden.
- Icon reflects state (e.g. chevron up / “show parts” when closed, down / “hide” when open).
- Persist preference in `localStorage` optional; default by viewport on first load.

**Why header, not strip:** strip is hidden when closed — toggle must live outside it. Rightmost matches save/theme cluster and stays reachable on mobile.

**Related:** theme family is already icon-only on mobile (`_responsive.scss`); strip toggle is another compact header control.

---

## Flex layout (strip & mixer)

**Decision:** use **flexbox** with **tracks on the left**, **functional screens on the right**, and an **expanding spacer** between them. Same pattern for the **workspaces strip** and the **mixer workspace**.

### Workspaces strip

```
┌──────────────────────────────────────────────────────────────────┐
│  .workspaces-strip-tracks          .spacer      .workspaces-system │
│  [ Drums ][ Loop A ][ + ]          (flex 1)     [ Routing ][ Mixer ] │
└──────────────────────────────────────────────────────────────────┘
```

| Region | Class (illustrative) | Contents | Flex |
|--------|----------------------|----------|------|
| **Tracks** (left) | `.workspaces-strip-tracks` | Session track tabs + **+** add track | `flex: 0 0 auto` |
| **Spacer** | `.workspaces-strip-spacer` | Empty element — fills leftover width | `flex: 1 1 auto` |
| **System** (right) | `.workspaces-strip-system` | Routing, Mixer (global / functional workspaces) | `flex: 0 0 auto` |

- Visual separation: **parts you perform in** (left) vs **session infrastructure** (right).
- Spacer collapses to a minimum gap on narrow viewports; track or system groups may **horizontal-scroll** independently if needed (mobile).
- Active tab styling unchanged; spacer is never interactive.

```scss
.workspaces-strip {
  display: flex;
  flex-flow: row nowrap;
  align-items: stretch;
  gap: 0.5em;
}
.workspaces-strip-tracks { display: flex; flex: 0 0 auto; gap: 0.35em; }
.workspaces-strip-spacer { flex: 1 1 auto; min-width: 0.5em; }
.workspaces-strip-system { display: flex; flex: 0 0 auto; gap: 0.35em; }
```

### Mixer workspace (same idea)

```
┌────────────────────────────────────────────────────────────────────────┐
│  .mixer-tracks                    .spacer           .mixer-buses-master   │
│  [Drums][Loop A][…]               (flex 1)        [Rev][Dly][Master]   │
└────────────────────────────────────────────────────────────────────────┘
```

| Region | Class (illustrative) | Contents | Flex |
|--------|----------------------|----------|------|
| **Tracks** (left) | `.mixer-tracks` | One column per session track (vol, mute, solo, sends) | `flex: 0 0 auto` |
| **Spacer** | `.mixer-spacer` | Empty — pushes buses to the right edge | `flex: 1 1 auto` |
| **Buses + master** (right) | `.mixer-buses-master` | Reverb col, Delay col, Master col | `flex: 0 0 auto` |

- Mirrors the strip mentally: **sources** left, **shared FX + master** right.
- Bus columns stay grouped on the right even with few tracks (spacer grows).
- Many track columns: left group scrolls or shrinks; buses + master stay pinned right (nested flex + `overflow-x: auto` on `.mixer-tracks` only).

```scss
.mixer-console {
  display: flex;
  flex-flow: row nowrap;
  align-items: stretch;
  min-height: 0;
}
.mixer-tracks { display: flex; flex: 0 1 auto; gap: 0.5em; overflow-x: auto; }
.mixer-spacer { flex: 1 1 auto; min-width: 0.5em; }
.mixer-buses-master { display: flex; flex: 0 0 auto; gap: 0.5em; }
```

**Routing workspace** does not use this pattern (graph layout, not columns) — flex left/right applies to **strip** and **mixer** only.

---

## Strip items

Grouped **left** (tracks) and **right** (system) — see § Flex layout.

| Item | Group | `activeWorkspace` | Editor when active |
|------|-------|-------------------|-------------------|
| Track *n* | tracks (left) | `track:<id>` | Type-specific (see below) |
| **+** | tracks (left) | — (opens type picker) | Add `sample-seq`, `loop`, `instrument`, … |
| **Routing** | system (right) | `routing` | Signal-flow diagram from `state.routing` |
| **Mixer** | system (right) | `mixer` | Column mixer (tracks left, buses + master right) |

### Per-track workspaces (by `track.type`)

| Type | Workspace content | Reference |
|------|-------------------|-----------|
| `sample-seq` | **Multi-row** step grid (one row per sound / MIDI note), sample assign per row, row settings (waveform, VCF, sends) | Today’s full grooves grid = one such track |
| `loop` | Up to 4 loop slots, overdub, sync to transport | [`loops.md`](loops.md) · js-loop-station |
| `instrument` | Piano roll / synth UI, clips | jam-station `type: 'piano'` |

Track **name** + small **type icon** on the strip tile (e.g. drum, loop, keys). Inside `sample-seq`, **row labels** show sample name; selected row drives settings panel (today’s `selectedTrack` → **selected row**).

---

## Inactive workspaces — live preview

When a workspace is **not** active, its strip tile still reflects current session state:

- Sequencer playhead / active steps animate on `sample-seq` tiles (all rows visible in mini preview).
- Loop tiles show recording/playing state.
- Mixer levels could show mini meters (later).

**Interaction:**

- Tile is **visible** and **updates** from the same `state$`.
- **No editing** — `pointer-events: none` on preview content, optional dim overlay on the tile.
- **Click tile** → becomes active workspace; full interaction.

**Implementation notes (later):**

- Prefer **lightweight tile renderers** (scaled-down components or canvas thumbnails), not full DOM clones of every workspace.
- Audio engine is **not** tied to active workspace — only UI focus changes.
- Preview cost grows with track count; cap or simplify tiles on low-end mobile if needed.

---

## Mixer workspace

**Decision:** mixer is a **column-based** console (DAW / hardware mixer layout). Uses the same **flex left / spacer / right** pattern as the workspaces strip (§ Flex layout).

See also [`audio-routing-and-fx.md`](audio-routing-and-fx.md) for signal path and `mixer.buses` state.

### Layout (flex row)

```
┌────────┐ ┌────────┐     ·················     ┌─────────┐ ┌─────────┐ ┌────────┐
│ Drums  │ │ Loop A │     .mixer-spacer         │ Reverb  │ │  Delay  │ │ Master │
│  vol   │ │  vol   │     (flex 1)              │ FX knobs│ │ FX knobs│ │  vol   │
│ M  S   │ │ M  S   │                           │         │ │         │ │   M    │
│ sends  │ │ sends  │                           │         │ │         │ │        │
└────────┘ └────────┘                           └─────────┘ └─────────┘ └────────┘
  .mixer-tracks (left)                              .mixer-buses-master (right)
```

- **Track columns** (left) — one per **session track**; group scrolls horizontally if needed.
- **Spacer** — empty flex child; grows so buses + master stay **right-aligned**.
- **Bus + master columns** (right) — reverb, delay, master; FX params in bus columns.

### Per-track column (base controls)

| Control | State (illustrative) | Notes |
|---------|----------------------|--------|
| **Volume** | `track.mixer.volume` | Vertical fader or knob; syncs with engine |
| **Mute** | `track.mixer.muted` | Already in MVP per-row; becomes **per session track** |
| **Solo** | `track.mixer.solo` | **New** — solo-in-place (other tracks ducked or muted while any solo active) |
| **Sends** | `track.mixer.sends.reverb`, `.delay` | Knobs at bottom of column (or small rotaries); route to bus columns |
| **Label** | `track.name` + type icon | Click name → jump to that track’s workspace (optional) |

**Not in mixer column (stay in track workspace):** VCF, sample assign, waveform, step grid, **per-sub-part sends** in row settings. Mixer is **group-track** level only — vol, mute, solo, sends for the whole part.

**Group tracks:** `sample-seq`, `loop`, etc. export as **one track**; sub-parts (rows, slots) are editor + audio-routing detail, not mixer columns. See [`track-model.md`](track-model.md) § Group tracks.

### Bus columns

Each fixed bus (`reverb`, `delay`) is its own column:

| Element | Source | Notes |
|---------|--------|--------|
| Bus name | `mixer.buses.reverb` / `.delay` | Header of column |
| **FX params** | `mixer.buses.*` | e.g. reverb: `seconds`, `decay`; delay: `time`, `feedback` — **knobs in this column** |
| Return level | bus return gain | Optional fader; may be fixed at unity initially |
| Bus mute | `mixer.buses.*.muted` | Optional |

Send amounts are adjusted on **track columns**; **tone/time of the effect** on **bus columns** — matches how hardware sends + FX units work.

### Master column

- Master **volume** (`mixer.master.volume`)
- Master **mute** (optional)
- Limiter (future)

### Solo logic (draft)

- Any `track.mixer.solo === true` → only solo’d tracks audible (others effectively muted).
- Multiple solos → those tracks together (additive solo).
- Solo + mute interaction: solo wins for solo’d tracks; standard mixer semantics.

### vs Routing workspace

| Mixer workspace | Routing workspace |
|-----------------|-------------------|
| Columns, levels, mutes, solos, sends, bus FX | Graph / wires, topology |
| Primary **mixing** surface | **Signal path** education + future reroute |
| Edits `track.mixer`, `mixer.buses` | Reads `state.routing` |

Per-track **track settings** may keep send knobs for quick access while mixing in a part editor; **Mixer** is the authoritative overview. Prefer single source of truth in state — both views bind to the same `track.mixer.sends`.

---

## Routing workspace

- Read-only **SVG / graph** first: track outs → inserts → fader → sends → buses → master.
- Driven by `state.routing` (already in state for Web Audio wiring).
- Interactive reroute (drag sends) is a later phase.

---

## Relationship to tracks, rows, and lanes

From [`track-model.md`](track-model.md):

| Term | Meaning |
|------|---------|
| **Session track** | One part in the song → one strip tab, one workspace, one mixer strip |
| **Row** | One line in a `sample-seq` grid → one sample, one **MIDI note** |
| **Lane** (DAWproject) | Future arrangement timeline — not the same as a grid row |

**Today’s MVP:** the whole app is effectively **one implicit `sample-seq` track** with 4 rows. The strip model adds **more session tracks** (loop, instrument, second drum kit, …), not one tab per row.

**Migration:** current `sequencer.*` → `tracks[0]` with `type: 'sample-seq'` and `rows[0..3]`; not four separate `tracks[]` entries.

---

## State (draft)

```javascript
ui: {
  activeWorkspace: 'track:trk-drums' | 'routing' | 'mixer',
  selectedRowId: 'row-kick',  // within active sample-seq track
  workspacesStripOpen: true,   // false by default on mobile; header toggle
}

tracks: [
  {
    id: 'trk-drums',
    type: 'sample-seq',
    name: 'Drums',
    midi: { channel: 10 },
    rows: [
      { id: 'row-kick', midi: { note: 36 }, sample: { /* … */ }, grid: [/* … */] },
      { id: 'row-snare', midi: { note: 38 }, /* … */ },
    ],
    mixer: { volume, muted, solo, sends: { reverb, delay } },
  },
  { id: 'trk-loop-a', type: 'loop', name: 'Loop A', /* loops[4] */ },
]

transport: { bpm, timeSignature, resolution, playing, /* global */ }
mixer: {
  master: { volume: 1, muted: false },
  buses: {
    reverb: { seconds: 3, decay: 2, /* return, muted */ },
    delay: { time: 0.375, feedback: 0.35 },
  },
}
routing: { nodes, edges }
```

`activeWorkspace` selects which editor component mounts in the main area. Strip order follows `tracks[]` order, then global items.

---

## Library & side panels

**Open question:** sample library stays a **side panel** reachable from `sample-seq` workspaces only, or a strip item?

- **Leaning:** contextual panel inside / beside the active track workspace (as today), not a strip tab.
- Loop/instrument workspaces bring their own browsers when needed.

---

## Open questions

- [x] Transport controls — **session** in header (play/stop/BPM); **per-track** in workspace when multi-track ([`transport.md`](transport.md)).
- [ ] Strip scroll when many tracks — horizontal scroll vs collapse?
- [ ] Rename strip tiles — inline on tab or only in workspace?
- [ ] Default project — one `sample-seq` track with 4 rows (current kit) vs empty?
- [ ] Strip toggle icon — layers, grid, or chevron?
- [x] Mobile strip — **hidden by default**; header toggle to show (see § Strip toggle).
- [ ] UUID `track.id` — required before workspaces land (no index-based URLs)?

---

## Suggested implementation order

1. **`tracks[]` refactor** — one `sample-seq` track with `rows[]` from current sequencer state.
2. **Strip UI** — flex layout (tracks | spacer | system), `activeWorkspace`, header toggle.
3. **Workspace shell** — today’s grid becomes the `sample-seq` track editor (unchanged visually at first).
4. **Rename** UI “selected track” → **selected row** where it means grid row.
5. **Mixer workspace** — flex columns: tracks (left) | spacer | buses + master (right); vol, mute, solo, sends, bus FX.
6. **Routing workspace** — read-only diagram.
7. **Inactive tile previews** — animation + overlay.
8. **Second session track** (`loop` type) — [`planning/2026-06-24-02-loops-mvp.md`](../planning/2026-06-24-02-loops-mvp.md).

---

## Hardware analogy

- **TR / drum rack:** many **rows**, one **drum part** → one `sample-seq` workspace.
- **Circuit / Force:** several **parts** on the strip → multiple session tracks; select a part to edit.

The strip switches **parts**; the workspace shows that part’s editor (multi-row grid for drums, loop slots for loop, etc.).
