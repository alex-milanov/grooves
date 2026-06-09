import JSZip from 'jszip';
import { dispatch } from 'iblokz-state';
import { defaultAssignments, samplesFromMetadata } from '../util/library';

const KIT_URL = 'assets/kits/basic-drum-kit.zip';
const KIT_NAME = 'basic_drum_kit';

export let stop = () => {};
export const start = ({ state$ }) => {
  fetch(KIT_URL)
    .then(res => res.arrayBuffer())
    .then(buf => JSZip.loadAsync(buf))
    .then(zip => zip.file('metadata.json')?.async('string'))
    .then(json => {
      const meta = JSON.parse(json);
      dispatch(s => ({
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
    .catch(err => console.warn('library load failed:', err));

  stop = () => {};
};

export default {
  start,
  stop,
};
