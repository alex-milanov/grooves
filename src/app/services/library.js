import JSZip from 'jszip';
import { dispatch } from 'iblokz-state';
import { context, samples } from './audio';
import { defaultAssignments, filesFromMetadata, samplesFromMetadata } from '../util/library';

const KIT_URL = 'assets/kits/basic-drum-kit.zip';
const KIT_NAME = 'basic_drum_kit';

const loadBuffers = (zip, meta) =>
  Promise.all(
    Object.entries(filesFromMetadata(meta)).map(([name, file]) =>
      zip
        .file(file)
        .async('arraybuffer')
        .then((buf) => context.decodeAudioData(buf))
        .then((buffer) => samples.set(samples.key(KIT_NAME, name), buffer)),
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
        library: {
          ...s.library,
          path: ['library'],
          kits: { [KIT_NAME]: samplesFromMetadata(meta) },
        },
        sequencer: {
          ...s.sequencer,
          assignments: defaultAssignments(meta, KIT_NAME),
        },
      }));
    })
    .catch((err) => console.warn('library load failed:', err));

  onStop = () => {};
};

export default {
  start,
  stop,
};
