import { div, header, h2, span, ul, li } from 'iblokz-snabbdom-helpers';

const samples = [
  '..',
  'kick_drum_1.wav',
  'snare_s.wav',
  'hihat_closed_1.wav',
  'hihat_open_1.wav',
  'crash_1.wav',
  'ride_bell_1.wav',
  'tom_1.wav',
  'tom_2.wav',
  'tom_3.wav',
];

export default state => div('.library', {
  class: { visible: state.sequencer.selectedTrack != null },
  props: {
    'aria-hidden': state.sequencer.selectedTrack == null ? 'true' : 'false',
  },
}, [
  header([
    // h2('Library'),
    span('.path', '> library / basic_drum_kit'),
  ]),
  ul('.list', samples.map(item => li('.item', span(item)))),
]);
