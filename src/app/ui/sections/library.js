import { div, header, span, ul, li } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { patch } from '../../state';
import { entriesAt, isFolder, navigate } from '../../util/library';

export default state => {
  const { kits, path } = state.library;
  const items = entriesAt(kits, path);

  return div('.library', {
    class: { visible: state.sequencer.selectedTrack != null },
    props: {
      'aria-hidden': state.sequencer.selectedTrack == null ? 'true' : 'false',
    },
  }, [
    header([
      span('.path', `> ${path.join(' / ')}`),
    ]),
    ul('.list', items.map(item => li('.item', {
      class: {
        folder: isFolder(kits, path, item),
        parent: item === '..',
      },
      on: {
        click: () => dispatch(patch(
          ['library', 'path'],
          navigate(kits, path, item),
        )),
      },
    }, span(item)))),
  ]);
};
