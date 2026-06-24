import { div, button, span } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { patch } from '../state';
import {
  WORKSPACE_DRUMS,
  WORKSPACE_LOOPS,
  WORKSPACE_MIXER,
  stripVisible,
} from '../util/workspaces';
import { drumsWorkspace, loopsWorkspace, mixerWorkspace } from './workspaces/content';

const setWorkspace = (id) => (ev) => {
  ev.preventDefault();
  dispatch(patch(['ui', 'activeWorkspace'], id));
};

const stripSlot = (label) =>
  div('.workspace-strip-slot', { attrs: { 'aria-hidden': 'true' } }, [
    span('.workspace-strip-slot-label', label),
  ]);

const stripPreview = (id, label, content, onClick) =>
  button(
    '.workspace-strip-preview',
    {
      props: {
        type: 'button',
        title: `Show ${label}`,
        'aria-label': `Show ${label}`,
      },
      on: { click: onClick },
    },
    [div('.workspace-preview-inner', content)],
  );

export default (state) => {
  if (!stripVisible(state)) return null;

  const active = state.ui?.activeWorkspace ?? WORKSPACE_DRUMS;
  const drumsName = state.partMixer?.name ?? 'Drums';
  const loopsName = state.tracks?.find((t) => t.type === 'loop')?.name ?? 'Loops';

  return div('.workspaces-strip', [
    div('.workspaces-strip-tracks', [
      active === WORKSPACE_DRUMS
        ? stripSlot(drumsName)
        : stripPreview(
            WORKSPACE_DRUMS,
            drumsName,
            drumsWorkspace(state),
            setWorkspace(WORKSPACE_DRUMS),
          ),
      active === WORKSPACE_LOOPS
        ? stripSlot(loopsName)
        : stripPreview(
            WORKSPACE_LOOPS,
            loopsName,
            loopsWorkspace(state),
            setWorkspace(WORKSPACE_LOOPS),
          ),
    ]),
    div('.workspaces-strip-spacer'),
    div('.workspaces-strip-system', [
      active === WORKSPACE_MIXER
        ? stripSlot('Mixer')
        : stripPreview(
            WORKSPACE_MIXER,
            'Mixer',
            mixerWorkspace(state),
            setWorkspace(WORKSPACE_MIXER),
          ),
    ]),
  ]);
};
