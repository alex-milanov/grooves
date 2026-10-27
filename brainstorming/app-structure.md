# App structure — folders, state, engine

**Date:** 2026-10-21  
**Status:** Brainstorming — decisions locked for next refactor slice  
**Planning:** [`planning/2026-10-21-01-app-structure-refactor.md`](../planning/2026-10-21-01-app-structure-refactor.md)  
**Related:** [`vision.md`](vision.md), [`ecosystem.md`](ecosystem.md), [`track-model.md`](track-model.md)  
**iblokz:** `org/iblokz/brainstorming/architecture/` (services vs element-bound; `actions / state$` loop)

---

## Why this note

Grooves grew loops, shared transport, and a live audio graph while keeping a flat `util/` catch-all and almost no named document API. The reactive loop is still right; **grouping lagged**. This doc locks folder roles and how we differ from jam-station / world-metronome without copying either wholesale.

---

## The loop (unchanged)

```text
dispatch(reducer) → state$ → ui(state) → events → dispatch
         ↑______________ services (Audio / DOM / timers) ______________|
```

UI stays mostly `f(state)`. Services subscribe and call `dispatch` / engine APIs. Matches iblokz and vision § Core principles.

---

## Folder roles (locked)

| Folder | Owns | Does not own |
|--------|------|----------------|
| **`state/`** | Document **shape** (`initial`) + pure transitions `(…args) => state => next` | AudioContext, Maps of nodes/buffers, DOM, timers |
| **`services/`** | `start`/`stop` (or hook/unhook), Rx subscriptions, scheduling, **live audio engine** | Pure document transforms |
| **`util/`** | Pure helpers only (math, quantize, routing *data*, theme serialize, …) | Document ownership, living graph, `dispatch` |
| **`ui/`** | Snabbdom views; call into `state/*` reducers via `dispatch` | Side effects beyond event handlers |

### Naming: `state/` not `actions/`

jam-station puts `initial` + reducers under **`actions/`** (one slot: document API). iblokz brainstorming writes that slot as **`actions / state$`**.

Grooves keeps the folder name **`state/`** for the same slot:

- Already means “the document” in this repo (`state/index.js`).
- Avoids jam’s overloaded word while keeping the same *role*.
- `createState` / `adapt` later (optional) can still consume modules from `state/` — adapt does not require the folder to be named `actions`.

So: **one folder for shape + transitions**; we call it `state/`.

---

## vs sister apps

| | world-metronome | jam-station | Grooves (target) |
|--|-----------------|-------------|------------------|
| Document API | `actions/` + `createState` | `actions/*` trees + `attach` | **`state/`** slices + `dispatch` (no adapt required yet) |
| Engine | `util/audio` toolkit + `services/audio` schedule | **`services/audio`** owns live engine; `iblokz-audio` primitives | **`services/audio/`** owns graph/samples/recording/click |
| `util/` | Thin; audio facade is intentionally effectful | Mostly non-graph helpers | **Pure only** |
| Clock | Math in util; schedule locals in service | `services/clock` + `util/math` | Pure bar/beat math in `util/`; mutable `startTime` with engine/service |

**Takeaways:**

- World-metronome = best small reference for **toolkit vs schedule** split.
- jam-station = best reference for **named document API** and **engine-as-service**.
- Grooves = modern stack + product focus; adopt their *roles*, not their folder dialect or full action trees.

---

## Current smells (as of 2026-10-21)

1. **`util/` is impure** — holds living graph (`audio.js`), buffer cache (`samples.js`), capture (`recording.js`), click (`loop-click.js`), dispatch wrappers (`loop-actions.js`, parts of `session-transport.js`), mutable clock + math in one file (`transport-clock.js`).
2. **Thin / uneven document API** — loops have informal actions in util; sequencer/mixer/header mostly inline `dispatch`; some exports auto-dispatch, some are raw transformers.
3. **Engine split** — orchestration in `services/loops|sequencer|mixer`, runtime registry in `util/audio.js` (jam would put that under `services/audio`).
4. **Track model dual-home** (separate track) — loops on `tracks[]`, drums still largely `sequencer.*` / `partMixer`. See [`track-model.md`](track-model.md). Not part of the structure quick wins.

---

## Purity litmus

| Question | If no → |
|----------|---------|
| Unit-testable with no `AudioContext` / `document`? | Not `util/` (and not a `state/` reducer) |
| Only returns new state? | Belongs in `state/` |
| Holds nodes, buffers, MediaRecorder, or subscribes to `state$`? | `services/` (engine or orchestrator) |

---

## Target tree (sketch)

```text
src/app/
  state/
    index.js           # compose initial; re-exports
    loops.js           # slot/track factories + pure transitions (from loops-state, loop-actions bodies, panels)
    transport.js       # session/track play-stop reducers (pure); clock mutation stays out
    sequencer.js       # grid / assignment / panel reducers (grow over time)
    …
  services/
    audio/             # graph, samples cache, recording, click, mutable startTime
    loops.js           # FSM / when to record-play — calls engine + dispatch(state.loops.*)
    sequencer.js
    mixer.js
    …
  util/                # pure: loop-tempo, loop-quantize, routing data, theme-*, lang, …
  ui/
  index.js
```

Exact file names can flex in planning; roles should not.

---

## Out of scope here

- Full `tracks[].rows` migration for drums  
- jam `createState` / `adapt` action trees (optional later)  
- MIDI / pads / Freesound  
- Manual record-latency UI  

Those stay vision/ecosystem/track-model concerns.

---

## Open questions

- Prefer `services/audio/index.js` multi-file vs single `services/audio.js` + helpers for v1 move?
- Should `session-transport` reducers live under `state/transport.js` while play/stop *effects* (set startTime) stay in a thin service or audio clock module?
- Re-export path: UI imports `@/state/loops` vs keep a tiny `dispatch`-wrapping façade for ergonomics?
