import { dispatch } from 'iblokz-state';
import { loadProject } from '../../state/project';
import { getLoopsTrack, slotHasContent } from '../../state/loops';
import { serializeProject } from './document';
import { downloadBlob, pickFile, slugFilename } from './io';
import { packDawproject } from './dawproject';
import { midiBlob } from './midi';
import { packMultisample } from './multisample';
import { projectBasename } from './name';
import { dumpProjectYaml } from './yaml';
import { loadProjectFile, missingDrumSamples, packProjectZip } from './zip';

const slotsNeedingZip = (state) => {
  const slots = getLoopsTrack(state)?.loop?.slots ?? [];
  return slots.filter((slot) => slotHasContent(slot) && !(slot.kit && slot.sample));
};

/** Download session document only (`.yaml`). Recorded loops without library provenance need ZIP. */
export const saveProjectYaml = (state) => {
  const stranded = slotsNeedingZip(state);
  if (stranded.length) {
    console.warn(
      'YAML save omits audio for recorded loop slots without a library sample; use ZIP for a portable project.',
      stranded.map((s) => s.id),
    );
  }
  const doc = serializeProject(state, { includeMedia: false });
  const text = dumpProjectYaml(doc);
  downloadBlob(
    new Blob([text], { type: 'text/yaml;charset=utf-8' }),
    slugFilename(projectBasename(state), 'yaml'),
  );
};

/** Download portable archive (`.grooves.zip`) with project.yaml + media/. */
export const saveProjectZip = async (state) => {
  const blob = await packProjectZip(state);
  downloadBlob(blob, slugFilename(projectBasename(state), 'grooves.zip'));
};

/** Download drum pattern as Standard MIDI (`.mid`) — one Type-1 drums track. */
export const saveProjectMidi = (state) => {
  downloadBlob(midiBlob(state), slugFilename(projectBasename(state), 'mid'));
};

/** Download session as DAWproject (`.dawproject`) — Scenes/ClipSlots for Bitwig. */
export const saveProjectDawproject = async (state) => {
  const blob = await packDawproject(state);
  downloadBlob(blob, slugFilename(projectBasename(state), 'dawproject'));
};

/** Download drums kit as Bitwig/PreSonus `.multisample` (zones = row MIDI notes). */
export const saveProjectMultisample = async (state) => {
  const blob = await packMultisample(state);
  downloadBlob(blob, slugFilename(`${projectBasename(state)}-drums`, 'multisample'));
};

/** File picker → install media → apply project document. */
export const openProject = async () => {
  const file = await pickFile();
  if (!file) {
    console.info('Project load cancelled');
    return null;
  }
  try {
    const { doc, kind } = await loadProjectFile(file);
    const missing = missingDrumSamples(doc);
    if (missing.length) {
      console.warn('Project load: drum samples not in cache or zip', missing);
    }
    dispatch(loadProject(doc));
    console.info(`Project loaded (${kind}):`, doc.name || file.name);
    return { doc, kind };
  } catch (err) {
    console.error('Project load failed:', file.name, err);
    throw err;
  }
};
