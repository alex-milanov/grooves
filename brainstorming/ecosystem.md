# iBlokz App Ecosystem → Grooves

**Date:** 2026-06-21  
**Status:** Brainstorming — integration map

Reference apps and what Grooves might take from each. Status: **done** · **partial** · **planned** · **reference only**.

---

## Stack & foundation

| Source | What it provides | Grooves status |
|--------|------------------|----------------|
| **[boilerplate](../../boilerplate)** | Snabbdom UI shell, multi-theme CSS system, Biome/Parcel setup, component patterns | **partial** — themes, linting, header; not full landing/examples |
| **iblokz-state** | Central store, `dispatch` / `patch` | **done** |
| **iblokz-snabbdom-helpers** | VDOM helpers, `patchStream` | **done** |
| **iblokz-data** | `obj.patch` for immutable updates | **done** |

---

## Music apps

### world-metronome
**Path:** `~/Projects/dev/music/world-metronome`  
**Role:** Timing & scheduling reference

| Idea | Notes | Status |
|------|-------|--------|
| Anchor-and-derive transport (`startTime`, cycle math) | `sequencer.js` uses `cycleTiming`, `scheduleCycle`, RAF lookahead | **done** |
| `projection()` / schedule-ahead pattern | Simpler variant inlined in sequencer service | **partial** |
| Re-anchor on BPM change while playing | jam-station scheduling doc covers edge cases | **planned** |
| Tap tempo | UI + state hook | **planned** |
| Rhythm traditions / compound meters | Probably out of scope for drum machine MVP | **reference only** |

**Docs to reuse:** `world-metronome/summaries/2025-02-14-02-latency-research-and-ui-sync.md`, `jam-station/planning/2026-06-13-01-scheduling-world-metronome-port.md`

---

### jam-station
**Path:** `~/Projects/dev/music/jam-station`  
**Role:** Groovebox / DAW-like — sequencer, media library, samples, MIDI, sessions

| Idea | Notes | Status |
|------|-------|--------|
| Step sequencer grid UX | Grooves has its own grid; compare interaction (select track, toggle steps) | **partial** |
| Media library / kit browsing | Zip + `metadata.json` pattern; folder navigation | **partial** |
| Sample bank / track assignment | `assignments` in state, default kit on load | **done** |
| Per-track volume, mute | Track settings panel | **done** |
| Waveform preview | WaveSurfer + sync cursor (grooves-specific) | **done** |
| Service registry (`start`/`stop`, hot reload) | viewport, library, sequencer, waveform services | **partial** |
| Piano roll / melodic sequencing | Large scope | **reference only** |
| MIDI in/out, pad mapping | Chrome-only; service-based | **planned** |
| Synth engine (iblokz-audio) | Different product layer | **reference only** |
| Tap tempo, session/song structure | Performance features | **planned** |
| Mobile / touch layout | jam-station roadmap priority | **planned** |

**Docs to reuse:** `jam-station/planning/2025-12-15-02-jam-station-roadmap.md`, `summaries/` for media library & scheduling work

---

### xAmplR
**Path:** `~/Projects/dev/music/xAmplR`  
**Role:** Sampler & pad controller — samples, waveform edit, Freesound

| Idea | Notes | Status |
|------|-------|--------|
| Sample load & decode pipeline | Buffer cache, keyed samples | **partial** |
| Waveform display & crop/edit | WaveSurfer preview only; no crop yet | **partial** |
| 16-pad MPC layout / live trigger | Alternative performance UI | **planned** |
| Freesound / Audio Commons search | API integration, attribution | **planned** |
| Mic record → sample | xAmplR core feature | **planned** |
| Per-sample effects (VCF, reverb) | Could become per-track FX | **planned** |
| MIDI pad triggering | | **planned** |

**Docs to reuse:** `xAmplR/summaries/` (project structure, jam-station comparison)

---

### js-loop-station
**Path:** `~/Projects/dev/music/js-loop-station`  
**Role:** Looper — layered loops, overdub

| Idea | Notes | Status |
|------|-------|--------|
| Loop record / overdub / multi-track loops | Different paradigm from step grid | **reference only** |
| Sync loops to master clock | Would build on grooves transport | **planned** (if loops added) |

---

### js-loops (JSLoops)
**Path:** `~/Projects/dev/music/jsloops`  
**Role:** Early full-stack DAW prototype (legacy stack)

| Idea | Notes | Status |
|------|-------|--------|
| Cloud/session vision | Historical direction | **reference only** |
| Canvas-based UI | Superseded by Snabbdom apps | **reference only** |

---

### Others (may reference later)

| App | Why it might matter |
|-----|---------------------|
| **fm-synth** | Simple synth / Web Audio patterns |
| **lissajous** | Visual/audio experiments |
| **webaudiofont-proto** | Font-based instruments |
| **musevis** | Older mobile/cordova experiments |

---

## Suggested integration order

Incremental path aligned with “simple sequencer first”:

1. **Transport polish** — pause/resume re-anchor, tap tempo (world-metronome + jam-station)
2. **Library depth** — multi-kit, better browse UX (jam-station media library)
3. **Sample interaction** — trim/start point, basic FX (xAmplR)
4. **Live layer** — optional pad bank or keyboard trigger (xAmplR + jam-station MIDI)
5. **Loop lanes** — if product goes beyond drum machine (js-loop-station)
6. **Melodic / session** — only if groovebox scope expands (jam-station)

Each step should leave the app deployable and demo-able.

---

## Cross-project conventions to keep aligned

- **pnpm** + Parcel 2 + Biome check
- **AGPL-3.0** licensing
- **GitHub Pages** deploy (`--public-url /grooves/`)
- **Service `start({ state$ })` / `stop()`** lifecycle
- **Theme families** from boilerplate (pixel default for grooves)
- **planning/** + **summaries/** docs when moving from brainstorm → implement → record
