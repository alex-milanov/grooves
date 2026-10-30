import { div, button } from 'iblokz-snabbdom-helpers';
import { dispatch } from 'iblokz-state';
import { patch } from '../../../state';

const list = (length) => new Array(length).fill(0);

const shorten = (name, max = 14) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

const stepCell = (state, row, globalStep, playhead) =>
  div('.step', {
    class: {
      active: state.sequencer.grid[row]?.[globalStep],
      playhead: playhead === globalStep,
    },
    props: {
      title: `${row},${globalStep}`,
    },
    on: {
      click: () =>
        dispatch(
          patch(
            ['sequencer', 'grid', row, globalStep],
            !state.sequencer.grid[row]?.[globalStep],
          ),
        ),
    },
  });

/** One bar of steps for the cued/view measure — never the full multi-bar row. */
export default (state, { rows, visibleSteps, playhead, onRowClick, onRowDblClick }) =>
  div(
    '.rows',
    list(rows).map((_, row) => {
      const sample = state.sequencer.assignments?.[row]?.sample;
      const rowLabel = sample ? shorten(sample) : `Row ${row}`;
      const panels = state.sequencer.panels ?? {};
      const isSelected = state.sequencer.selectedRow === row;

      return div(
        '.row',
        [].concat(
          button(
            {
              class: {
                active: isSelected,
                assigned: !!state.sequencer.assignments?.[row],
                'panel-library': isSelected && panels.library,
                'panel-settings': isSelected && panels.settings,
              },
              props: {
                title: isSelected
                  ? 'Click: deselect · Double-click: toggle library'
                  : 'Click: select (library or settings) · Double-click: library',
              },
              on: {
                click: (ev) => onRowClick(row, ev),
                dblclick: (ev) => onRowDblClick(row, ev),
              },
            },
            rowLabel,
          ),
          visibleSteps.map((globalStep) => stepCell(state, row, globalStep, playhead)),
        ),
      );
    }),
  );
