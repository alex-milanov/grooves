# App structure refactor — state, util purity, audio engine

**Date:** 2026-10-21  
**Status:** In progress — Step 1 done; Steps 2–4 pending  
**Brainstorming:** [`brainstorming/app-structure.md`](../brainstorming/app-structure.md)  
**Depends on:** Loops MVP + workspaces in place (no feature dependency; structure-only)  
**Goal:** Encode folder roles in the tree with **move-first, behavior-preserving** steps. App stays deployable after each step.

---

## Scope

**In:**

1. Document locked folder rules (brainstorming — done with this slice’s companion doc)
2. Grow **`state/`** as document home (shape + pure reducers); keep name `state/` (not jam `actions/`)
3. Move live audio runtime out of **`util/`** into **`services/audio/`**
4. Split mutable transport clock from pure bar/beat math
5. Leave `util/` pure-only going forward

**Out:**

- Drums `sequencer.*` → `tracks[].rows` migration ([`track-model.md`](../brainstorming/track-model.md))
- Adopting `createState` / `adapt` action trees
- Splitting `services/loops.js` FSM beyond what’s needed for imports
- Product changes (latency UI, MIDI, pads)

---

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| Document folder name | **`state/`** — holds `initial` + `(…args) => state => next` |
| vs jam `actions/` | Same *slot*; different name. No rename pressure. |
| `util/` | Pure helpers only; no `dispatch`, no node/buffer registries |
| Live engine | **`services/audio/`** (graph, samples, recording, click, mutable `startTime`) |
| Orchestration | Existing services (`loops`, `sequencer`, `mixer`, …) call engine + `dispatch` |
| `createState` / adapt | **Not** in this slice |
| Import style | Prefer `dispatch(loops.slotTogglePlayRec(i))` where `slotTogglePlayRec` is a pure factory; thin façades OK if needed for ergonomics |

---

## Steps (quick wins, in order)

### Step 0 — Convention (docs)

- [x] [`brainstorming/app-structure.md`](../brainstorming/app-structure.md)
- [x] Link from brainstorming README + mark structure as current focus
- [x] Note in `ecosystem.md` (loops MVP done; structure in integration order; state/ vs jam actions/)

### Step 1 — Grow `state/` for loops (no engine move yet)

Move / extract **pure** code only:

| From | Toward |
|------|--------|
| `util/loops-state.js` | `state/loops.js` |
| Pure bodies in `util/loop-actions.js` | `state/loops.js` factories `(…) => state => next` |
| `util/loops-panels.js` (pure transforms) | `state/loops.js` |
| Relevant pure bits of `util/panels.js` | `state/sequencer.js` when touching drums panels (**deferred**) |

Wire UI/services to `dispatch(factory(…))`. Delete or shrink `util/loop-actions.js` to zero impure leftovers (any `samples.set` / `context` work moves to service *after* dispatch, or stays temporarily with a comment until Step 2).

**Done when:** loops domain transitions are findable under `state/`; `util/loop-actions.js` is gone or trivial; behavior unchanged.

- [x] `state/loops.js` — slots, panels, pure reducers; `LOOPS_TRACK_ID` owned here
- [x] UI/services import from `state/loops`; `dispatch(…)` at the edge
- [x] Library assign: impure prep in `ui/sections/loops-library.js`, pure `assignLoopSample`
- [x] Removed `util/loops-state.js`, `util/loops-panels.js`, `util/loop-actions.js`
- [x] Fixed `loopsTogglePlay` / `loopsStopAll` overwriting slot patches with stale `tracks`
- [x] Drums panels + `assignTrackSample` → `state/sequencer.js` (same library assign pattern as loops)

### Step 2 — `services/audio/` move-only

Move (update imports; no logic rewrite):

| From `util/` | To |
|--------------|-----|
| `audio.js` | `services/audio/graph.js` (or `index.js`) |
| `samples.js` | `services/audio/samples.js` |
| `recording.js` | `services/audio/recording.js` |
| `loop-click.js` | `services/audio/click.js` |

Re-export from `services/audio/index.js` if that eases churn.

**Done when:** no living graph / MediaRecorder / sample `Map` under `util/`; play/record still work.

### Step 3 — Clock split

| Concern | Home |
|---------|------|
| `barSeconds`, `phaseAt`, `beatsPerBar`, … | `util/transport-math.js` (or keep name `transport-clock.js` but **pure only**) |
| `startTime` get/set/reset, lookahead constant used to *set* anchor | `services/audio/clock.js` (or beside graph) |

`session-transport`: pure predicates + reducers → `state/transport.js`; functions that **mutate** startTime while dispatching → service/audio clock called from UI/service edge, not inside the reducer.

**Done when:** reducers never call `setTransportStartTime`; util clock math has no module-level mutable time.

### Step 4 — Hygiene

- Remove duplicate `stepTime` if still in both audio + clock
- Grep: `dispatch` only from `ui/`, `services/`, `index.js` — not from `util/`
- Grep: `util/` has no `AudioContext` node creation / `navigator.mediaDevices` / `document.querySelector` (scroll/theme exceptions: either leave tiny impure UI helpers under `ui/util` or document as allowed exceptions)

---

## Target tree (this slice)

```text
src/app/
  state/
    index.js
    loops.js          # (+ optional loops-ui)
    transport.js      # as Step 3 lands
  services/
    audio/
      index.js
      graph.js        # ex util/audio.js
      samples.js
      recording.js
      click.js
      clock.js        # mutable startTime (Step 3)
    loops.js
    sequencer.js
    …
  util/               # pure remainder
  ui/
```

---

## Test plan

After each step:

- [ ] Cold start → play drums grid
- [ ] Arm empty loop slot → count-in / bar wait → record → stop → loop plays in phase
- [ ] Overdub one layer
- [ ] Session stop / track stop; restart
- [ ] Mixer / mute / library assign sample to loop slot
- [ ] HMR: services stop/start without stuck record or silent graph (smoke)

No new automated suite required for move-only; manual smoke is the gate.

---

## Out / later

- Track-model drums migration  
- `createState` + adapt  
- Further split of `services/loops.js`  
- Ecosystem feature order (tap tempo, pads, …) unchanged  

---

## References

- Sister: world-metronome `util/audio` + `services/audio`; jam-station `actions/` + `services/audio`
- iblokz: `architecture/overview.md`, `architecture/services.md`
