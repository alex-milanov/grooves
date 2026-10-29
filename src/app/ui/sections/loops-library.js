import { div, header, span, ul, li } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { patch } from '../../state';
import {
  assignLoopSample,
  DEFAULT_LOOP_SOURCE_BPM,
  loopBufferKey,
  loopPlaybackDuration,
} from '../../state/loops';
import { context, samples } from '../../services/audio';
import { entriesAt, isFolder, isSample, navigate } from '../../util/library';
import { quantizeTargetSeconds, trimPadBuffer } from '../../util/loop-quantize';
import { barSeconds } from '../../util/transport-clock';

/** Load/quantize buffer (impure), then apply pure assignLoopSample. */
const assignSampleToSlot = (slotIndex, kit, sample) => {
  dispatch((s) => {
    const buffer = samples.get(samples.key(kit, sample));
    if (!buffer) {
      console.warn('loop sample not loaded:', kit, sample);
      return s;
    }
    const targetSeconds = quantizeTargetSeconds(buffer.duration, barSeconds(s.transport));
    const trimmed = trimPadBuffer(context, buffer, targetSeconds);
    const key = loopBufferKey(slotIndex, 0);
    samples.set(key, trimmed);
    const duration = loopPlaybackDuration(trimmed.duration, DEFAULT_LOOP_SOURCE_BPM, s.transport);
    return assignLoopSample(slotIndex, {
      bufferKey: key,
      sourceBpm: DEFAULT_LOOP_SOURCE_BPM,
      duration,
      kit,
      sample,
    })(s);
  });
};

export default (state) => {
  const { kits, path, selectedSample } = state.loopsLibrary ?? {};
  const selectedSlot = state.ui?.loops?.selectedSlot;
  const panels = state.ui?.loops?.panels ?? {};
  const items = entriesAt(kits, path);
  const kit = path?.[1];
  const libraryOpen = selectedSlot != null && !!panels.library;

  return div(
    '.library.loops-library',
    {
      class: { visible: libraryOpen },
      props: { 'aria-hidden': libraryOpen ? 'false' : 'true' },
    },
    [
      header([span('.path', `> ${(path ?? ['loops']).join(' / ')}`)]),
      ul(
        '.list',
        items.map((item) =>
          li(
            '.item',
            {
              class: {
                folder: isFolder(kits, path, item),
                parent: item === '..',
                selected: isSample(kits, path, item) && item === selectedSample,
              },
              on: {
                click: () => {
                  if (isFolder(kits, path, item) || item === '..') {
                    dispatch(patch(['loopsLibrary', 'path'], navigate(kits, path, item)));
                  }
                },
                dblclick: (ev) => {
                  ev.preventDefault();
                  if (selectedSlot == null || !isSample(kits, path, item) || !kit) return;
                  assignSampleToSlot(selectedSlot, kit, item);
                },
              },
            },
            span(item),
          ),
        ),
      ),
    ],
  );
};
