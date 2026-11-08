import JSZip from 'jszip';
import { context, samples } from '../../services/audio';
import { bufferToWav } from '../buffer-to-wav';
import { loopBufferKey } from '../../state/loops';
import { DRUMS_TRACK_ID } from '../../state/drums';
import { collectMediaEntries, serializeProject } from './document';
import { parseLoopMediaPath, parseSampleMediaPath, PROJECT_YAML } from './paths';
import { dumpProjectYaml, parseProjectYaml } from './yaml';

const blobToArrayBuffer = (blob) => blob.arrayBuffer();

/** Build a .grooves.zip Blob from live state (embeds available sample/loop buffers). */
export const packProjectZip = async (state) => {
  const doc = serializeProject(state, { includeMedia: true });
  const zip = new JSZip();
  zip.file(PROJECT_YAML, dumpProjectYaml(doc));

  const entries = collectMediaEntries(state);
  await Promise.all(
    entries.map(async ({ path, cacheKey }) => {
      const buffer = samples.get(cacheKey);
      if (!buffer) return;
      const wav = bufferToWav(buffer);
      zip.file(path, await blobToArrayBuffer(wav));
    }),
  );

  return zip.generateAsync({ type: 'blob' });
};

const findSlotIndex = (doc, slotId) => {
  const loops = (doc.tracks ?? []).find((t) => t.type === 'loop' || t.id === 'trk-loops');
  const slots = loops?.slots ?? [];
  const index = slots.findIndex((s) => s.id === slotId);
  if (index >= 0) return index;
  const asNum = Number(String(slotId).replace(/^slot-/, ''));
  return Number.isFinite(asNum) ? asNum : -1;
};

const cacheKeyForPath = (path, doc) => {
  const sample = parseSampleMediaPath(path);
  if (sample) return samples.key(sample.kit, sample.file);

  const loop = parseLoopMediaPath(path);
  if (loop) {
    const slotIndex = findSlotIndex(doc, loop.slotId);
    if (slotIndex < 0) return null;
    return loopBufferKey(slotIndex, loop.layer);
  }
  return null;
};

const readProjectYamlFromZip = async (zip) => {
  const file =
    zip.file(PROJECT_YAML) ||
    zip.file('project.yml') ||
    Object.values(zip.files).find((f) => !f.dir && /(^|\/)project\.ya?ml$/i.test(f.name));
  if (!file) throw new Error('Invalid project zip: missing project.yaml');
  return parseProjectYaml(await file.async('string'));
};

/** Decode media/* WAVs into the sample cache using keys derived from paths + doc. */
export const installZipMedia = async (zip, doc) => {
  const mediaFiles = Object.values(zip.files).filter(
    (f) => !f.dir && /^media\//i.test(f.name) && /\.wav$/i.test(f.name),
  );

  await Promise.all(
    mediaFiles.map(async (file) => {
      const key = cacheKeyForPath(file.name, doc);
      if (!key) {
        console.warn('project zip: skipping unrecognized media path', file.name);
        return;
      }
      const ab = await file.async('arraybuffer');
      const buffer = await context.decodeAudioData(ab.slice(0));
      samples.set(key, buffer);
    }),
  );
};

/**
 * After applying a YAML-only project, ensure loop slots with library provenance
 * have buffers (copy/quantize is the caller's job for full fidelity; here we
 * only alias the library buffer into the loop key when missing).
 */
export const hydrateLibraryLoopBuffers = (doc) => {
  const loops = (doc.tracks ?? []).find((t) => t.type === 'loop' || t.id === 'trk-loops');
  (loops?.slots ?? []).forEach((slot, slotIndex) => {
    const kit = slot.sample?.kit;
    const file = slot.sample?.file;
    if (!kit || !file) return;
    const dest = loopBufferKey(slotIndex, 0);
    if (samples.get(dest)) return;
    const src = samples.get(samples.key(kit, file));
    if (src) samples.set(dest, src);
  });
};

/** Ensure drum `{kit,file}` buffers exist (already true when kit was loaded or media installed). */
export const missingDrumSamples = (doc) => {
  const drums = (doc.tracks ?? []).find((t) => t.type === 'sample-seq' || t.id === DRUMS_TRACK_ID);
  const missing = [];
  (drums?.rows ?? []).forEach((row) => {
    const kit = row.sample?.kit;
    const file = row.sample?.file;
    if (!kit || !file) return;
    if (!samples.get(samples.key(kit, file))) missing.push({ kit, file });
  });
  return missing;
};

/**
 * Load a File (.yaml / .yml / .zip / .grooves.zip).
 * Installs media into the sample cache and returns the parsed document.
 */
export const loadProjectFile = async (file) => {
  const name = file?.name?.toLowerCase?.() ?? '';
  const isZip =
    name.endsWith('.zip') ||
    name.endsWith('.grooves.zip') ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed';

  if (isZip) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const doc = await readProjectYamlFromZip(zip);
    await installZipMedia(zip, doc);
    hydrateLibraryLoopBuffers(doc);
    return { doc, kind: 'zip' };
  }

  const text = await file.text();
  const doc = parseProjectYaml(text);
  hydrateLibraryLoopBuffers(doc);
  return { doc, kind: 'yaml' };
};
