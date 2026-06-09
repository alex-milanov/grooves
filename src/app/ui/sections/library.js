import { div, header, span, ul, li } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { patch } from '../../state';
import { entriesAt, isFolder, isSample, navigate } from '../../util/library';

export default state => {
  const { kits, path, selectedSample } = state.library;
  const { selectedTrack } = state.sequencer;
  const items = entriesAt(kits, path);
  const kit = path[1];

  return div('.library', {
    class: { visible: selectedTrack != null },
    props: {
      'aria-hidden': selectedTrack == null ? 'true' : 'false',
    },
  }, [
    header([
      span('.path', `> ${path.join(' / ')}`),
    ]),
    ul('.list', items.map(item => li('.item', {
      class: {
        folder: isFolder(kits, path, item),
        parent: item === '..',
        selected: isSample(kits, path, item)
          && kit === state.sequencer.assignments?.[selectedTrack]?.kit
          && item === selectedSample,
        assigned: isSample(kits, path, item)
          && Object.values(state.sequencer.assignments ?? {}).some(
            a => a?.kit === kit && a?.sample === item,
          ),
      },
      on: {
        click: () => {
          if (isFolder(kits, path, item) || item === '..') {
            dispatch(patch(['library', 'path'], navigate(kits, path, item)));
          }
        },
        dblclick: ev => {
          ev.preventDefault();
          if (selectedTrack == null || !isSample(kits, path, item) || !kit) return;
          dispatch(s => ({
            ...s,
            sequencer: {
              ...s.sequencer,
              assignments: {
                ...s.sequencer.assignments,
                [selectedTrack]: { kit, sample: item },
              },
            },
            library: {
              ...s.library,
              selectedSample: item,
            },
          }));
        },
      },
    }, span(item)))),
  ]);
};
