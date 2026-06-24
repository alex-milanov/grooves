import { body, div } from 'iblokz-snabbdom-helpers';
import { themeClass } from '../util/theme';
import { isDrumsWorkspace, isLoopsWorkspace } from '../util/workspaces';
import header from './header';
import workspacesStrip from './workspaces-strip';
import { drumsWorkspace, loopsWorkspace, mixerWorkspace } from './workspaces/content';

export default (state) => {
  const cls = themeClass(state);

  const workspaceContent = isDrumsWorkspace(state)
    ? drumsWorkspace(state)
    : isLoopsWorkspace(state)
      ? loopsWorkspace(state)
      : mixerWorkspace(state);

  return body(
    '.app',
    {
      class: { [cls]: true },
    },
    [
      header(state),
      workspacesStrip(state),
      div('.workspace-wrapper', [div('.workspace', [workspaceContent])]),
    ],
  );
};
