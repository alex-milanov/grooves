# Grooves-project save / load (YAML ± ZIP)

**Date:** 2026-11-08  
**Status:** Implemented (MVP)  
**Spec:** [`brainstorming/project-formats.md`](../brainstorming/project-formats.md), [`config/current-shape.yaml`](../config/current-shape.yaml)

## Scope

**In**

- Serialize / apply `grooves-project` v1.5 document (YAML)
- Portable `.grooves.zip`: `project.yaml` + `media/samples/{kit}/{file}` + `media/loops/{slot-id}/L{n}.wav`
- Header: Save YAML, Save ZIP; Load (`.yaml` / `.yml` / `.grooves.zip` / `.zip`)
- Strip ephemeral fields; normalize loop `process` to `empty` | `idle` on disk
- Pattern measures keyed by **row id** in the file; runtime keeps index keys

**Out**

- DAWproject / MIDI / MusicXML export
- localStorage autosave
- Embedding unused kit files
- Scenes (`target-shape` v2)

## Modules

| Path | Role |
|------|------|
| `util/project/document.js` | state ↔ project doc (pure) |
| `util/project/zip.js` | pack/unpack media + yaml |
| `util/project/io.js` | download blob, file picker |
| `state/project.js` | `applyProject(doc)` reducer |
| `ui/header.js` | Save / Load wiring |

## Zip media (short)

- **Drums:** keep `{ kit, file }` in YAML; copy used buffers to `media/samples/{kit}/{file}`
- **Loops:** always write live layers to `media/loops/{slot-id}/L{n}.wav`; list paths in `slots[].media`
