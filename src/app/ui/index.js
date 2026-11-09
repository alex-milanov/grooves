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
import audioUnlock from './components/audio-unlock';
import saveName from './components/save-name';
import {
  drumsWorkspace,
  loopsWorkspace,
  mixerWorkspace,
  settingsWorkspace,
} from './workspaces/content';
import {
  saveProjectDawproject,
  saveProjectMidi,
  saveProjectMultisample,
  saveProjectYaml,
  saveProjectZip,
} from '../util/project/save-load';

const runSave = (formatId, state) => {
  if (formatId === 'yaml') {
    saveProjectYaml(state);
    return;
  }
  if (formatId === 'zip') {
    saveProjectZip(state).catch((err) => console.error('project zip save failed:', err));
    return;
  }
  if (formatId === 'midi') {
    try {
      saveProjectMidi(state);
    } catch (err) {
      console.error('MIDI export failed:', err);
    }
    return;
  }
  if (formatId === 'dawproject') {
    saveProjectDawproject(state).catch((err) => console.error('DAWproject export failed:', err));
    return;
  }
  if (formatId === 'multisample') {
    saveProjectMultisample(state).catch((err) => console.error('Multisample export failed:', err));
  }
};

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
      audioUnlock(state),
      saveName(state, runSave),
    ],
  );
};
