import { body, div } from 'iblokz-snabbdom-helpers';
import { themeClass } from '../util/theme';
import {
  isDrumsWorkspace,
  isLoopsWorkspace,
  isMixerWorkspace,
  isSettingsWorkspace,
  WORKSPACE_DRUMS,
  WORKSPACE_LOOPS,
  WORKSPACE_MIXER,
  WORKSPACE_SETTINGS,
} from '../state/ui';
import header from './header';
import workspacesStrip from './workspaces-strip';
import {
  drumsWorkspace,
  loopsWorkspace,
  mixerWorkspace,
  settingsWorkspace,
} from './workspaces/content';

export default (state) => {
  const cls = themeClass(state);

  const domain = isDrumsWorkspace(state)
    ? WORKSPACE_DRUMS
    : isLoopsWorkspace(state)
      ? WORKSPACE_LOOPS
      : isMixerWorkspace(state)
        ? WORKSPACE_MIXER
        : isSettingsWorkspace(state)
          ? WORKSPACE_SETTINGS
          : WORKSPACE_MIXER;

  const workspaceContent =
    domain === 'drums'
      ? drumsWorkspace(state)
      : domain === 'loops'
        ? loopsWorkspace(state)
        : domain === 'settings'
          ? settingsWorkspace(state)
          : mixerWorkspace(state);

  // Avoid `.workspace.settings` — shared `_settings.scss` collapses `.settings` panels.
  const domainClass = domain === 'settings' ? 'app-settings' : domain;

  return body(
    '.app',
    {
      class: { [cls]: true },
    },
    [
      header(state),
      workspacesStrip(state),
      div('.workspace-wrapper', [div(`.workspace.${domainClass}`, [workspaceContent])]),
    ],
  );
};
