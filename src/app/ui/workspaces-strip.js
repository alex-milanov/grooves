import { div, button } from 'iblokz-snabbdom-helpers';
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

const stripPreview = (id, label, content, { active, onClick }) =>
  button(
    '.workspace-strip-preview',
    {
      class: { active },
      props: {
        type: 'button',
        title: active ? `${label} (current)` : `Show ${label}`,
        'aria-label': active ? `${label} (current)` : `Show ${label}`,
        'aria-pressed': String(active),
      },
      on: { click: onClick },
    },
    [div('.workspace-preview-inner', content)],
  );

export default (state) => {
  if (!stripVisible(state)) return null;

  const active = state.ui?.activeWorkspace ?? WORKSPACE_DRUMS;
  const drumsName =
    state.tracks?.find((t) => t.id === 'drums' || t.type === 'sample-seq')?.name ?? 'Drums';
  const loopsName = state.tracks?.find((t) => t.type === 'loop')?.name ?? 'Loops';

  return div('.workspaces-strip', [
    div('.workspaces-strip-tracks', [
      stripPreview(WORKSPACE_DRUMS, drumsName, drumsWorkspace(state, { preview: true }), {
        active: active === WORKSPACE_DRUMS,
        onClick: setWorkspace(WORKSPACE_DRUMS),
      }),
      stripPreview(WORKSPACE_LOOPS, loopsName, loopsWorkspace(state, { preview: true }), {
        active: active === WORKSPACE_LOOPS,
        onClick: setWorkspace(WORKSPACE_LOOPS),
      }),
    ]),
    div('.workspaces-strip-spacer'),
    div('.workspaces-strip-system', [
      stripPreview(WORKSPACE_MIXER, 'Mixer', mixerWorkspace(state), {
        active: active === WORKSPACE_MIXER,
        onClick: setWorkspace(WORKSPACE_MIXER),
      }),
    ]),
  ]);
};
