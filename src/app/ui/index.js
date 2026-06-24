import { body, div } from 'iblokz-snabbdom-helpers';
import { themeClass } from '../util/theme';
import { isDrumsWorkspace } from '../util/workspaces';
import header from './header';
import workspacesStrip from './workspaces-strip';
import { drumsWorkspace, mixerWorkspace } from './workspaces/content';

export default (state) => {
  const cls = themeClass(state);

  return body(
    '.app',
    {
      class: { [cls]: true },
    },
    [
      header(state),
      workspacesStrip(state),
      div('.workspace-wrapper', [
        div('.workspace', [
          isDrumsWorkspace(state) ? drumsWorkspace(state) : mixerWorkspace(state),
        ]),
      ]),
    ],
  );
};
