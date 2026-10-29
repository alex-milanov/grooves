import JSZip from 'jszip';
import { dispatch } from 'iblokz-state';
import { context, samples } from './audio';
import { filesFromMetadata, samplesFromMetadata } from '../util/library';

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

let onStop = () => {};
export const stop = () => onStop();

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

  onStop = () => {};
};

export default {
  start,
  stop,
};
