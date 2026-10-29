# App structure — folders, state, engine

**Date:** 2026-10-21; **updated 2026-10-29** (iblokz folder constraints)  
**Status:** Brainstorming — decisions locked for next refactor slice  
**Planning:** [`planning/2026-10-21-01-app-structure-refactor.md`](../planning/2026-10-21-01-app-structure-refactor.md)  
**Related:** [`vision.md`](vision.md), [`ecosystem.md`](ecosystem.md), [`track-model.md`](track-model.md)  
**iblokz (stack-wide):** [`org/iblokz/brainstorming/architecture/folder-constraints.md`](../../../org/iblokz/brainstorming/architecture/folder-constraints.md) — loop, dual action edge, silos, UI axes, util/lib  
Also: `architecture/overview.md`, `services.md`, `ui-pages.md`

---

## Why this note

Grooves grew loops, shared transport, and a live audio graph while keeping a flat `util/` catch-all and almost no named document API. The reactive loop is still right; **grouping lagged**. This doc locks folder roles for Grooves and points at stack-wide constraints; it does not replace the iblokz note.

---

## The loop (unchanged)

```text
actions → state$ → ui(state) → (events) → actions
```

An **action** is a document transition (`(…args) => state => next`, or promise/observable of that). Grooves’ call edge today:

```text
dispatch(reducer) → state$ → ui(state) → events → dispatch
         ↑______________ services (Audio / DOM / timers) ______________|
```

Same one-way flow as jam’s `actions.ns.fn(…)` — `iblokz-state` supports both; packaging only. This iteration: **direct `dispatch` + import from `state/<slice>`** (no `adapt` tree required). Optional actions tree later still consumes the same slice modules.

UI stays mostly `f(state)`. Services subscribe and call `dispatch` / engine APIs.

---

## Folder roles (locked for Grooves)

| Folder | Owns | Does not own |
|--------|------|----------------|
| **`state/`** | Document **shape** (`initial`) + pure transitions; **domain helpers, enums, defaults** for that slice | AudioContext, Maps of nodes/buffers, DOM, timers |
| **`services/`** | `start`/`stop`, Rx subscriptions, scheduling; **engine silo** (`services/audio/`); orchestration silos may keep **local** util | Pure document transforms that belong in `state/` |
| **`util/`** (→ util/lib role) | Shared pure helpers + grouped API abstractions | Document reducers, full UI modules, living graph / `dispatch` |
| **`ui/`** | Structure (header, workspaces strip, workspace shell) + content (`sections/`) + shared `components/` | Side effects beyond event handlers; no root `pages/` (no CMS router) |

### Naming: `state/` not `actions/`

Same **document slot** as jam `actions/`. Grooves keeps **`state/`**. Domain helpers for a namespace live **in that slice** and are imported by the matching UI content module (e.g. `state/loops` ↔ `ui/sections/loops-*`).

Thin helpers stay in the slice or UI module that needs them unless they qualify for util/lib (shared pure / API toolkit).

### Service as silo (Grooves-relevant)

Service layer = **side effects** + **reusability**. Not domain-specific unless the silo **manages domain** (e.g. a CRUD `resource`). **`viewport`** and **audio engine** are both valid, first-class services here — infra/engine, not product ontology.

- **`services/viewport`** — resize / breakpoints / strip defaults; reusable chrome effects; does not own loops/drums domain.  
- **`services/audio/`** — shared-engine candidate (graph, samples, recording, click, mutable clock); reusable across music apps; may hold **local** util until extracted; reacts to document, does not *define* track ontology.  
- **`services/loops`**, **`sequencer`**, … — closer to app/domain orchestration over the engine + `dispatch(state.*)` — keep thinner; don’t swallow the graph if audio should stay a non-domain engine silo.  
- Local mutable state closed under `start`/`stop`, not document truth.

### UI axes (Grooves)

| Axis | Here |
|------|------|
| Structure | `ui/index`, `header*`, `workspaces-strip`, `workspaces/content` |
| Content | `ui/sections/*` (feature panels) |
| Shared leaves | `ui/components/{knob,dropdown}` |
| `pages/` | **Not used** — studio shell, not CMS/router |

---

## vs sister apps

| | world-metronome | jam-station | Grooves (target) |
|--|-----------------|-------------|------------------|
| Document API | `actions/` + `createState` | `actions/*` trees + `attach` | **`state/`** slices + `dispatch` (same loop; no adapt required yet) |
| Engine | `util/audio` toolkit + `services/audio` schedule | **`services/audio`** owns live engine; `iblokz-audio` primitives | **`services/audio/`** owns graph/samples/recording/click |
| `util/` | Thin; audio facade is intentionally effectful | Mostly non-graph helpers | **Shared pure / API abs only**; living engine out |
| Clock | Math in util; schedule locals in service | `services/clock` + `util/math` | Pure bar/beat math in `util/`; mutable `startTime` with engine/service |

**Also useful:** psy-rogue (service silos + shared `util/audio|three`); canvas/notes (modern `state/` + workspace/layout); cash-buddy (`pages/` — not our shell). Stack survey: iblokz [folder-constraints.md](../../../org/iblokz/brainstorming/architecture/folder-constraints.md).

**Takeaways:**

- World-metronome = best small reference for **toolkit vs schedule** split.  
- jam-station = named document API + **engine-as-service**.  
- Grooves = modern stack; adopt *roles*, not jam’s folder dialect or full action trees.

---

## Current smells (as of 2026-10-21; still mostly true 2026-10-29)

1. **`util/` still mixed** — `session-transport.js` (`dispatch` + clock effects), mutable clock + math in `transport-clock.js`; domain helpers (workspace ids, track ids) not yet in slices. Living audio **moved** to `services/audio/` (Step 2).  
2. **Domain helpers still in util** — e.g. workspace ids, session-transport predicates / track ids → `state/ui`, `state/transport` (Step 3–4).  
3. **~~Engine in util~~** — graph/samples/recording/click now under `services/audio/`; orchestration stays in `loops|sequencer|mixer`.  
4. **Track model dual-home** — loops on `tracks[]`, drums largely `sequencer.*` / `partMixer`. See [`track-model.md`](track-model.md). Not part of the structure quick wins.

---

## Purity / placement litmus

| Question | If no → |
|----------|---------|
| Domain enum / selector / reducer? | `state/<slice>` (not util) |
| Unit-testable with no living `AudioContext` registry / `document`? | Else not root util (API toolkit helpers OK if pure-ish and shared) |
| Only returns new state? | `state/` |
| Holds nodes, buffers, MediaRecorder, or subscribes to `state$`? | `services/` (engine or orchestrator) |
| Shared across silos / state / ui? | util/lib; else colocate |

---

## Target tree (sketch)

```text
src/app/
  state/
    index.js           # compose initial; re-exports
    loops.js           # factories + pure transitions + domain helpers/enums
    transport.js       # session/track play-stop reducers (pure); clock mutation stays out
    sequencer.js       # grid / assignment / panel reducers (grow over time)
    …                  # ui/workspaces constants if document-shaped
  services/
    audio/             # silo: graph, samples, recording, click, mutable startTime (+ local util)
    loops.js           # FSM — calls engine + dispatch(state.loops.*)
    sequencer.js
    mixer.js
    …
  util/                # shared pure / grouped: loop-tempo, routing data, theme-*, lang, …
  ui/
    components/        # shared leaves
    sections/          # content modules
    workspaces/        # structure
    header*.js …
  index.js
```

Exact file names can flex in planning; roles should not.

---

## Out of scope here

- Full `tracks[].rows` migration for drums  
- jam `createState` / `adapt` action trees (optional later; same loop)  
- MIDI / pads / Freesound  
- Manual record-latency UI  

Those stay vision/ecosystem/track-model concerns.

---

## Open questions

- Prefer `services/audio/index.js` multi-file vs single `services/audio.js` + helpers for v1 move?  
- Should `session-transport` reducers live under `state/transport.js` while play/stop *effects* (set startTime) stay in a thin service or audio clock module?  
- Workspace ids / strip helpers → `state/ui` (or `state/workspaces`) vs remain util until shared?  
- Re-export path: UI imports `@/state/loops` vs keep a tiny `dispatch`-wrapping façade for ergonomics?
