# App structure refactor — state slices, infra silos, util/lib

**Date:** 2026-10-21; **revised 2026-10-29** (iblokz folder-constraints session)  
**Status:** In progress — Steps 1–3 done; Step 4 pending  
**Brainstorming:** [`brainstorming/app-structure.md`](../brainstorming/app-structure.md)  
**Stack-wide:** [`org/iblokz/brainstorming/architecture/folder-constraints.md`](../../../org/iblokz/brainstorming/architecture/folder-constraints.md)  
**Depends on:** Loops MVP + workspaces in place (no feature dependency; structure-only)  
**Goal:** Encode folder roles with **move-first, behavior-preserving** steps. App stays deployable after each step.

---

## Scope

**In:**

1. Locked folder / layer rules (docs — refreshed 2026-10-29)
2. Grow **`state/`** as document home (shape + reducers + **domain helpers/enums** per slice)
3. Establish **`services/audio/`** as a non-domain **infra/engine silo** (side effects, reusable)
4. Keep **`services/viewport`** as the other infra example (already in place — no redesign)
5. Split mutable transport clock from pure bar/beat math; pure transport document API → `state/transport`
6. Leave root **`util/`** for shared pure / API abstractions only; colocate thin helpers otherwise

**Out:**

- Drums `sequencer.*` → `tracks[].rows` ([`track-model.md`](../brainstorming/track-model.md))
- Adopting `createState` / `adapt` action trees (same one-way loop; optional later)
- Expanding `services/loops` FSM beyond import/wiring needs
- UI tree rename (`layout/` / `pages/`) — studio shell is fine; no CMS `pages/`
- Extracting audio to a shared package (silo first; package later if reuse demands)
- Product changes (latency UI, MIDI, pads)

---

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| One-way loop | `actions → state$ → ui → actions` — unchanged |
| Action edge | `dispatch(reducer(…))` **or** `actions.ns.fn(…)` are the **same arrow**; Grooves uses **direct dispatch** + import from `state/<slice>` this iteration |
| Document folder | **`state/`** (same slot as jam `actions/`) |
| Slice contents | Reducers **and** domain helpers / enums / defaults; matching UI content imports from that slice |
| Thin helpers | Colocate in `state/` or `ui/` unless shared → util/lib |
| Service layer | **Side effects + reusability**; not domain-specific unless the silo **manages domain** |
| Infra silos | **`viewport`** and **`audio` engine** are both valid services — not product ontology |
| Domain orchestration | `services/loops`, `sequencer`, `mixer`, … stay thinner; call engine + `dispatch(state.*)` |
| Live audio | **`services/audio/`** owns living graph / samples Map / recording / click / mutable `startTime`; may keep **local** util until shared |
| Root `util/` | Shared pure math/data + grouped API abstractions; **no** `dispatch`, living registries, or full UI modules |
| `createState` / adapt | **Not** in this slice |
| Import style | Prefer `dispatch(loops.slotTogglePlayRec(i))`; thin façades OK |

---

## Steps (in order)

### Step 0 — Convention (docs)

- [x] [`brainstorming/app-structure.md`](../brainstorming/app-structure.md) (initial + 2026-10-29 refresh)
- [x] iblokz [`folder-constraints.md`](../../../org/iblokz/brainstorming/architecture/folder-constraints.md) + overview / services / ui-pages links
- [x] Link from brainstorming README + `ecosystem.md`
- [x] This plan revised for silos, dual edge, helper placement (2026-10-29)

### Step 1 — Grow `state/` for loops / sequencer panels ✅

Move / extract **pure** domain code only (done):

| From | Toward |
|------|--------|
| `util/loops-state.js`, loop-actions bodies, loops-panels | `state/loops.js` |
| Drums panels + `assignTrackSample` | `state/sequencer.js` |

- [x] `state/loops.js` — slots, panels, pure reducers; `LOOPS_TRACK_ID` owned here  
- [x] UI/services import from `state/loops`; `dispatch(…)` at the edge  
- [x] Library assign: impure prep in UI, pure `assignLoopSample`  
- [x] Removed `util/loops-state.js`, `util/loops-panels.js`, `util/loop-actions.js`  
- [x] Fixed `loopsTogglePlay` / `loopsStopAll` stale `tracks` overwrite  
- [x] Drums panels + assign → `state/sequencer.js`

### Step 2 — `services/audio/` infra silo (move-only) ✅

**Intent:** Audio is a **reusable side-effect engine**, not loops/drums domain. Same class of service as **viewport**. Move living runtime out of root `util/`; no logic rewrite.

| From `util/` | To |
|--------------|-----|
| `audio.js` | `services/audio/graph.js` |
| `samples.js` | `services/audio/samples.js` |
| `recording.js` | `services/audio/recording.js` |
| `loop-click.js` | `services/audio/click.js` |

- [x] Moved four modules; `services/audio/index.js` re-exports for churn  
- [x] Updated services, UI, and util consumers (`transport-clock`, session-transport, loop-*)  
- [x] Left pure shared math in root util; orchestration services unchanged  
- [x] **`services/viewport`:** left as-is  

**Done when:** no living graph / MediaRecorder / sample `Map` under root `util/`; play/record/overdub still work; other services import from `services/audio`.

### Step 3 — Clock + transport document API ✅

| Concern | Home |
|---------|------|
| `barSeconds`, `phaseAt`, `beatsPerBar`, … | Root `util/transport-clock.js` (no mutable `startTime`) |
| `startTime` get/set/reset, lookahead used to *set* anchor | `services/audio/clock.js` (engine silo) |
| Pure predicates / session·track play-stop **reducers** | `state/transport.js` |
| Effects that mutate clock **while** dispatching | Edge wrappers in `state/transport.js` (`sessionPlay`, …) — clock then pure reducer |

- [x] `services/audio/clock.js` + re-export from `services/audio/index.js`
- [x] Purified `util/transport-clock.js` (imports clock; no module-level mutable time)
- [x] `state/transport.js` — predicates, pure `*Reducer`s, edge `session*` / `track*`
- [x] Removed `util/session-transport.js`; UI/services import from `state/transport`
- [x] Sequencer / loop helpers import clock from `services/audio/clock`

**Done when:** reducers never call `setTransportStartTime`; util clock math has no module-level mutable time; session/track transport actions are findable under `state/transport`.

### Step 4 — Hygiene + remaining domain placement

- Remove duplicate `stepTime` if still in both graph + clock.  
- Grep: `dispatch` only from `ui/`, `services/`, `index.js` — not from root `util/`.  
- Grep: root `util/` has no node creation / `navigator.mediaDevices` / living Maps (scroll/theme: colocate under `ui/` or document as allowed chrome helpers).  
- Move leftover **domain** helpers/enums still in util when cheap:  
  - workspace ids / strip predicates → `state/ui` (or `state/workspaces`) if document-shaped; UI structure modules import from there  
  - track-params defaults tied to sequencer → `state/sequencer` if clearly document  
- Leave true shared pure modules in util (`loop-tempo`, routing data, theme serialize, lang, library path nav if shared).  
- Optional light grouping (`util/loop/*`) only if root util is still noisy after moves — not required for “done.”

**Done when:** litmus in [`app-structure.md`](../brainstorming/app-structure.md) holds for grepped smells; smoke still green.

---

## Target tree (this slice)

```text
src/app/
  state/
    index.js
    loops.js
    sequencer.js
    transport.js       # Step 3
    ui.js | workspaces # optional Step 4 — workspace ids / strip
  services/
    viewport.js        # infra (existing)
    audio/             # infra engine silo
      index.js
      graph.js
      samples.js
      recording.js
      click.js
      clock.js         # Step 3
    loops.js           # domain orchestration (thin)
    sequencer.js
    mixer.js
    …
  util/                # shared pure / API abs only
  ui/
    components/        # shared leaves
    sections/          # content
    workspaces/ …      # structure
  index.js
```

---

## Test plan

After each step:

- [ ] Cold start → play drums grid  
- [ ] Arm empty loop slot → count-in / bar wait → record → stop → loop plays in phase  
- [ ] Overdub one layer  
- [ ] Session stop / track stop; restart  
- [ ] Mixer / mute / library assign sample to loop slot  
- [ ] Resize / workspace strip (viewport still sane)  
- [ ] HMR: services stop/start without stuck record or silent graph (smoke)

No new automated suite required for move-only; manual smoke is the gate.

---

## Out / later

- Track-model drums migration  
- `createState` + adapt (optional; same loop)  
- Further split of `services/loops.js`  
- Shared `iblokz-audio` / cross-app package extract  
- Ecosystem feature order (tap tempo, pads, …) unchanged  

---

## References

- Sister: world-metronome toolkit vs schedule; jam-station `services/audio`; psy-rogue infra silos; canvas/notes modern `state/`  
- iblokz: `architecture/folder-constraints.md`, `overview.md`, `services.md`
