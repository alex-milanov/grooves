import JSZip from 'jszip';
import { dispatch } from 'iblokz-state';
import { patch } from '../state';
import { samplesFromMetadata } from '../util/library';

const KIT_URL = 'assets/kits/basic-drum-kit.zip';
const KIT_NAME = 'basic_drum_kit';

export let stop = () => {};
export const start = ({ state$ }) => {
  fetch(KIT_URL)
    .then(res => res.arrayBuffer())
    .then(buf => JSZip.loadAsync(buf))
    .then(zip => zip.file('metadata.json')?.async('string'))
    .then(json => dispatch(patch('library', {
      path: ['library'],
      kits: {
        [KIT_NAME]: samplesFromMetadata(JSON.parse(json)),
      },
    })))
    .catch(err => console.warn('library load failed:', err));

  stop = () => {};
};

export default {
  start,
  stop,
};
