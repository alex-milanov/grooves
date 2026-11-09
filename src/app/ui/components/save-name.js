import { div, h2, p, button, label, input, span } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { closeSaveDialog, patchSaveDialogName, setProjectName } from '../../state/project';
import { defaultProjectName } from '../../util/project/name';

/**
 * @param {object} state
 * @param {(formatId: string, stateWithName: object) => void} onConfirm
 */
export default (state, onConfirm) => {
  const dialog = state.ui?.saveDialog;
  if (!dialog) return null;

  const draft = dialog.name ?? '';
  const formatId = dialog.formatId;

  const cancel = () => dispatch(closeSaveDialog);

  const confirm = () => {
    const name = String(draft).trim() || defaultProjectName();
    dispatch((s) => setProjectName(name)(closeSaveDialog(s)));
    onConfirm?.(formatId, { ...state, name });
  };

  return div(
    '.app-modal.save-name-modal',
    {
      props: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'save-name-title',
      },
      on: {
        click: cancel,
        keydown: (ev) => {
          if (ev.key === 'Escape') {
            ev.preventDefault();
            cancel();
          }
        },
      },
    },
    [
      div(
        '.app-modal-card',
        {
          on: { click: (ev) => ev.stopPropagation() },
        },
        [
          h2('#save-name-title', 'Save as'),
          p('Name for the download file (extension is added automatically).'),
          label('.save-name-field', [
            span('.save-name-label', 'Name'),
            input({
              props: {
                type: 'text',
                value: draft,
                autofocus: true,
                'aria-label': 'Project name',
              },
              hook: {
                insert: (vnode) => {
                  const el = vnode.elm;
                  if (!el || typeof el.focus !== 'function') return;
                  el.focus();
                  el.select?.();
                },
              },
              on: {
                input: (ev) => dispatch(patchSaveDialogName(ev.target.value)),
                keydown: (ev) => {
                  if (ev.key === 'Enter') {
                    ev.preventDefault();
                    confirm();
                  }
                },
              },
            }),
          ]),
          div('.app-modal-actions', [
            button(
              '.app-modal-btn.secondary',
              { props: { type: 'button' }, on: { click: cancel } },
              'Cancel',
            ),
            button(
              '.app-modal-btn.primary',
              { props: { type: 'button' }, on: { click: confirm } },
              'Save',
            ),
          ]),
        ],
      ),
    ],
  );
};
