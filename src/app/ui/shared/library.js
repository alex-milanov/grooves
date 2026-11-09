import { aside, header, span, ul, li } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { entriesAt, isFolder, isSample, libraryFocus, navigate, pathKit } from '../../util/library';

/**
 * Shared library browser.
 *
 * @param {object} state
 * @param {object} opts
 * @param {boolean} opts.open — panel visibility
 * @param {string} [opts.section] — workspace default section (open path only; assign is any kit)
 * @param {{ kit?: string, sample?: string } | null} [opts.active] — highlight for current assignment
 * @param {(kit: string, sample: string) => boolean} [opts.isAssigned] — optional “in use” markers
 * @param {(kit: string, sample: string) => void} opts.onAssign — dblclick assign (any samples/loops audio)
 */
export default (state, { open, active = null, isAssigned, onAssign }) => {
  const library = state.library ?? {};
  const { kits, path, selectedSample } = library;
  const items = entriesAt(kits, path);
  const kit = pathKit(path);
  const activeKit = active?.kit ?? null;
  const activeSample = active?.sample ?? null;
  const focus = libraryFocus(library);

  return aside(
    '.library',
    {
      class: { visible: open },
      props: { 'aria-hidden': open ? 'false' : 'true' },
    },
    [
      header([span('.path', `> ${(path ?? ['library']).join(' / ')}`)]),
      ul(
        '.list',
        items.map((item) =>
          li(
            '.item',
            {
              class: {
                folder: isFolder(kits, path, item),
                parent: item === '..',
                selected:
                  item === focus ||
                  (isSample(kits, path, item) &&
                    focus == null &&
                    (selectedSample != null
                      ? item === selectedSample
                      : kit === activeKit && item === activeSample)),
                assigned:
                  typeof isAssigned === 'function' &&
                  isSample(kits, path, item) &&
                  isAssigned(kit, item),
              },
              on: {
                click: () => {
                  if (isFolder(kits, path, item) || item === '..') {
                    dispatch((s) => ({
                      ...s,
                      library: {
                        ...s.library,
                        path: navigate(kits, path, item),
                        focus: null,
                      },
                    }));
                  } else if (isSample(kits, path, item)) {
                    dispatch((s) => ({
                      ...s,
                      library: {
                        ...s.library,
                        selectedSample: item,
                        focus: item,
                      },
                    }));
                  }
                },
                dblclick: (ev) => {
                  ev.preventDefault();
                  // Selection is committed on the 2nd mousedown before dblclick;
                  // clear any highlight that slipped through `user-select: none`.
                  window.getSelection?.()?.removeAllRanges?.();
                  if (!isSample(kits, path, item) || !kit) return;
                  onAssign?.(kit, item);
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
