import { body, div } from 'iblokz-snabbdom-helpers';
import { themeClass } from '../util/theme';
import { isDrumsWorkspace, isLoopsWorkspace } from '../util/workspaces';
import header from './header';
import workspacesStrip from './workspaces-strip';
import { drumsWorkspace, loopsWorkspace, mixerWorkspace } from './workspaces/content';

export default (state) => {
  const cls = themeClass(state);

  const domain = isDrumsWorkspace(state)
    ? 'drums'
    : isLoopsWorkspace(state)
      ? 'loops'
      : 'mixer';

  const workspaceContent =
    domain === 'drums'
      ? drumsWorkspace(state)
      : domain === 'loops'
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
      div('.workspace-wrapper', [div(`.workspace.${domain}`, [workspaceContent])]),
    ],
  );
};
