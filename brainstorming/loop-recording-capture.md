# Loop recording capture quality

**Date:** 2026-11-01  
**Status:** Implemented (constraints + bitrate + UI toggle); PCM path deferred  
**Related:** [`loops.md`](loops.md), `services/audio/recording.js`, `state/loops.js` (`processMic`)

---

## Problem

On some Macs, loop takes sounded processed — pumping, watery/gated texture, mushy transients — like call-style noise cancel or heavy compression. Suspected stack:

1. **`getUserMedia` defaults** — with `{ audio: true }` (or only `deviceId`), browsers typically enable **echoCancellation**, **noiseSuppression**, and **autoGainControl**. Fine for meetings; hostile to music, especially when other slots play through speakers while recording.
2. **`MediaRecorder` at 128 kbps**, no mime preference — usually Opus-in-WebM, soft for percussion/loops.
3. **OS mic modes** (macOS Voice Isolation, headset ANC) — outside app control; can still rewrite the mic before the browser sees it.

## Project decisions

| Piece | Choice |
|-------|--------|
| Default mic mode | **Raw** — request echo / noise / AGC **off** |
| Opt-in processed mic | `loop.processMic` (default `false`); header filter toggle reconnects the stream |
| Encoder | Prefer `audio/webm;codecs=opus` (then webm / mp4); **256 kbps** with fallbacks if options throw |
| Still decode path | Same: blob → `decodeAudioData` → trim/quantize |

Headphones + OS mic mode **Standard / Wide Spectrum** remain recommended; constraints are best-effort (UAs may ignore flags).

## Later (not this slice)

**PCM capture** via `MediaStreamSource` → `AudioWorklet` into an `AudioBuffer`, skipping MediaRecorder entirely — better fidelity and clearer latency for a music app. Same finish/quantize pipeline afterward.

## Quick checks

- Artifacts gone with raw + headphones → browser DSP was the main culprit.
- Still mushy → try higher bitrate / PCM path; confirm OS Voice Isolation is off.
- Toggle **filter** (process mic) on if a quiet built-in mic needs AGC for speech-like takes.
