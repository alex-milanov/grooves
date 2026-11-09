import { div, h2, p, button } from 'iblokz-snabbdom-helpers';
import { unlock } from '../../services/audio-gate';

/** Centered gate when AudioContext is suspended (browser autoplay policy). */
export default (state) => {
  if (!state.audio?.blocked) return null;

  const onUnlock = (ev) => {
    ev.preventDefault();
    unlock();
  };

  return div(
    '.app-modal.audio-unlock',
    {
      props: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'audio-unlock-title',
      },
      on: { click: onUnlock },
    },
    [
      div(
        '.app-modal-card.audio-unlock-card',
        {
          on: {
            click: (ev) => ev.stopPropagation(),
          },
        },
        [
          h2('#audio-unlock-title', 'Enable audio'),
          p('Browsers block sound until you interact. Click to start the audio engine.'),
          button(
            '.app-modal-btn.primary.audio-unlock-btn',
            {
              props: { type: 'button' },
              on: { click: onUnlock },
            },
            'Enable',
          ),
        ],
      ),
    ],
  );
};
