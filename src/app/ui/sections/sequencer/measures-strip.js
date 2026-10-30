import { div, button, i } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import {
  addBar,
  removeBar,
  selectMeasure,
  armDeleteBar,
  clearDeleteArmedBar,
  measuresList,
  MAX_BARS,
} from '../../../state/sequencer-measures';

const LONG_PRESS_MS = 450;

const list = (length) => new Array(length).fill(0);

let holdTimer = null;
let holdBar = null;
let holdFired = false;
let prevBars = null;

const scrollStripToEnd = (elm) => {
  if (!elm) return;
  requestAnimationFrame(() => {
    elm.scrollLeft = elm.scrollWidth;
  });
};

const clearHoldTimer = () => {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  holdBar = null;
};

const startHold = (bar) => {
  clearHoldTimer();
  holdFired = false;
  holdBar = bar;
  holdTimer = setTimeout(() => {
    holdTimer = null;
    if (holdBar === bar) {
      holdFired = true;
      dispatch(armDeleteBar(bar));
    }
  }, LONG_PRESS_MS);
};

const endHold = () => {
  clearHoldTimer();
};

const measureGrid = (state, barIndex, perBar, rows) => {
  const measure = measuresList(state)[barIndex] ?? {};
  return div(
    '.measure-grid',
    list(rows).map((_, row) =>
      div(
        '.measure-row',
        list(perBar).map((_, step) =>
          div('.measure-step', {
            class: { active: !!measure?.[row]?.[step] },
          }),
        ),
      ),
    ),
  );
};

/** Overview strip: one mini grid per bar + add. Hidden by parent when collapsed. */
export default (state, { bars, perBar, rows, activeBar, cuedBar, playing }) => {
  const deleteArmedBar =
    state.sequencer.deleteArmedBar == null
      ? null
      : Math.min(bars - 1, Math.max(0, state.sequencer.deleteArmedBar));

  const nodes = [];
  for (let bar = 0; bar < bars; bar++) {
    if (deleteArmedBar === bar && bars > 1) {
      nodes.push(
        button(
          '.measure-delete',
          {
            props: {
              type: 'button',
              title: `Delete bar ${bar + 1}`,
              'aria-label': `Delete bar ${bar + 1}`,
            },
            on: {
              click: (ev) => {
                ev.stopPropagation();
                dispatch(removeBar(bar));
              },
            },
          },
          [i('.fa.fa-minus')],
        ),
      );
    }

    nodes.push(
      button(
        '.measure',
        {
          class: {
            active: bar === activeBar,
            cued: cuedBar != null && bar === cuedBar && bar !== activeBar,
            'delete-armed': deleteArmedBar === bar,
          },
          props: {
            type: 'button',
            title: playing ? `Cue bar ${bar + 1} next` : `Go to bar ${bar + 1}`,
            'aria-label': playing ? `Cue bar ${bar + 1} next` : `Go to bar ${bar + 1}`,
            'aria-pressed': String(bar === activeBar || bar === cuedBar),
          },
          on: {
            mousedown: (ev) => {
              if (ev.button !== 0) return;
              startHold(bar);
            },
            mouseup: endHold,
            mouseleave: endHold,
            touchstart: (ev) => {
              if (ev.touches?.length > 1) return;
              startHold(bar);
            },
            touchend: endHold,
            touchcancel: endHold,
            click: (ev) => {
              if (holdFired) {
                holdFired = false;
                ev.preventDefault();
                ev.stopPropagation();
                return;
              }
              if (deleteArmedBar != null && deleteArmedBar !== bar) {
                dispatch(clearDeleteArmedBar);
              }
              dispatch(selectMeasure(bar, playing, activeBar));
            },
            contextmenu: (ev) => ev.preventDefault(),
          },
        },
        [measureGrid(state, bar, perBar, rows)],
      ),
    );
  }

  nodes.push(
    button(
      '.measure-add',
      {
        props: {
          type: 'button',
          title: bars >= MAX_BARS ? `Max ${MAX_BARS} bars` : 'Add bar (copy last)',
          'aria-label': 'Add bar',
          disabled: bars >= MAX_BARS,
        },
        on: {
          click: () => {
            dispatch(clearDeleteArmedBar);
            dispatch(addBar);
          },
        },
      },
      [i('.fa.fa-plus')],
    ),
  );

  const grew = prevBars != null && bars > prevBars;
  prevBars = bars;

  return div(
    '.measures-strip',
    {
      hook: {
        insert: (vnode) => {
          if (grew) scrollStripToEnd(vnode.elm);
        },
        update: (_old, vnode) => {
          if (grew) scrollStripToEnd(vnode.elm);
        },
      },
    },
    [
      div(
        '.measures-strip-bars',
        {
          on: {
            click: (ev) => {
              if (ev.target === ev.currentTarget) dispatch(clearDeleteArmedBar);
            },
          },
        },
        nodes,
      ),
    ],
  );
};
