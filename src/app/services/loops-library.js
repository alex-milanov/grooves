import JSZip from 'jszip';
import { dispatch } from 'iblokz-state';
import { context } from '../util/audio';
import { filesFromMetadata, samplesFromMetadata } from '../util/library';
import * as samples from '../util/samples';

const KIT_URL = 'assets/loops/basic-loops.zip';
export const LOOPS_KIT_NAME = 'basic_loops';

const loadBuffers = (zip, meta) =>
  Promise.all(
    Object.entries(filesFromMetadata(meta)).map(([name, file]) =>
      zip
        .file(file)
        .async('arraybuffer')
        .then((buf) => context.decodeAudioData(buf))
        .then((buffer) => samples.set(samples.key(LOOPS_KIT_NAME, name), buffer)),
    ),
  );

export let stop = () => {};

export const start = ({ state$ }) => {
  fetch(KIT_URL)
    .then((res) => res.arrayBuffer())
    .then((buf) => JSZip.loadAsync(buf))
    .then(async (zip) => {
      const meta = JSON.parse(await zip.file('metadata.json').async('string'));
      await loadBuffers(zip, meta);
      dispatch((s) => ({
        ...s,
        loopsLibrary: {
          ...s.loopsLibrary,
          path: ['loops'],
          kits: { [LOOPS_KIT_NAME]: samplesFromMetadata(meta) },
        },
      }));
    })
    .catch((err) => console.warn('loops library load failed:', err));

  stop = () => {};
};

export default {
  start,
  stop,
};
