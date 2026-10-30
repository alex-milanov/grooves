import JSZip from 'jszip';
import { dispatch } from 'iblokz-state';
import { context, samples } from './audio';
import {
  defaultAssignments,
  filesFromMetadata,
  samplesFromMetadata,
  SAMPLES_SECTION,
  LOOPS_SECTION,
} from '../util/library';

const DRUMS_KIT_URL = 'assets/kits/basic-drum-kit.zip';
const DRUMS_KIT_NAME = 'basic_drum_kit';
const LOOPS_KIT_URL = 'assets/loops/basic-loops.zip';
const LOOPS_KIT_NAME = 'basic_loops';

const loadKitBuffers = (zip, meta, kitName) =>
  Promise.all(
    Object.entries(filesFromMetadata(meta)).map(([name, file]) =>
      zip
        .file(file)
        .async('arraybuffer')
        .then((buf) => context.decodeAudioData(buf))
        .then((buffer) => samples.set(samples.key(kitName, name), buffer)),
    ),
  );

const loadZipKit = async (url, kitName) => {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const meta = JSON.parse(await zip.file('metadata.json').async('string'));
  await loadKitBuffers(zip, meta, kitName);
  return { kitName, meta, list: samplesFromMetadata(meta) };
};

let onStop = () => {};
export const stop = () => onStop();

export const start = ({ state$ }) => {
  Promise.all([
    loadZipKit(DRUMS_KIT_URL, DRUMS_KIT_NAME).catch((err) => {
      console.warn('drums kit load failed:', err);
      return null;
    }),
    loadZipKit(LOOPS_KIT_URL, LOOPS_KIT_NAME).catch((err) => {
      console.warn('loops kit load failed:', err);
      return null;
    }),
  ]).then(([drums, loops]) => {
    dispatch((s) => {
      const samplesTree = { ...(s.library?.kits?.[SAMPLES_SECTION] ?? {}) };
      const loopsTree = { ...(s.library?.kits?.[LOOPS_SECTION] ?? {}) };
      let next = s;

      if (drums) {
        samplesTree[drums.kitName] = drums.list;
        next = {
          ...next,
          sequencer: {
            ...next.sequencer,
            assignments: defaultAssignments(drums.meta, drums.kitName),
          },
        };
      }
      if (loops) {
        loopsTree[loops.kitName] = loops.list;
      }

      return {
        ...next,
        library: {
          ...next.library,
          path: next.library?.path?.length ? next.library.path : ['library', SAMPLES_SECTION],
          kits: {
            [SAMPLES_SECTION]: samplesTree,
            [LOOPS_SECTION]: loopsTree,
          },
        },
      };
    });
  });

  onStop = () => {};
};

export default {
  start,
  stop,
};
