# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Per-track VCF (cutoff, resonance) and reverb/delay send busses via `iblokz-audio`
- Explicit `routing` state (`nodes` + `edges`) driving Web Audio connections
- `mixer` service syncing routing and track params to the audio graph
- Themed knob component in track settings (Cutoff, Res, Rev, Dly) — pure CSS dial from [CodePen](https://codepen.io/alex-milanov/pen/ogbYZjB)
- `getOutputLatency()` — UI playhead and waveform cursor offset by `baseLatency + outputLatency` (world-metronome approach)
- `brainstorming/` and `planning/` docs (vision, ecosystem, FX chain plan)

### Changed
- Audio graph: `track-in → VCF → fader → master` with post-fader sends to shared reverb/delay busses
- Track settings panel widened for FX knob grid
- `iblokz-audio` as dependency; shared `AudioContext` re-exported from `util/audio.js`
