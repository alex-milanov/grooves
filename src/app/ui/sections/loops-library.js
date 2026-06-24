import { div, header, span, ul, li } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { patch } from '../../state';
import { entriesAt, isFolder, isSample, navigate } from '../../util/library';
import { assignLoopSample } from '../../util/loop-actions';

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
                  assignLoopSample(selectedSlot, kit, item);
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
