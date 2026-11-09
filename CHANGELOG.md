# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **MIDI controller input** (Settings → MIDI): Web MIDI + MPK mini IV scheme — drum pads, loop Bank B, session keys, CC knobs, sequencer record arm
- Native **grooves-project** save/load: YAML session document and `.grooves.zip` (`project.yaml` + `media/samples` + `media/loops`)
- **MIDI export** (Save → MIDI): Type-1 SMF of the drums pattern (tempo, meter, row MIDI notes)
- **DAWproject export** (Save → DAWproject): Bitwig-friendly `.dawproject` with Scene ClipSlots (drums Notes + loop Audio L0), empty Arrangement; loop VCF→Equalizer; reverb/delay effect Channels + post Sends
- **Multisample export** (Save → Multisample): Bitwig/PreSonus `.multisample` drum kit (one zone per row MIDI note + WAVs)
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
