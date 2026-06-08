import { header, nav, a, div, select, option, img } from 'iblokz-snabbdom-helpers';

import { dispatch } from 'iblokz-state';
import { scrollToSection } from '../util/scroll';
import { patch } from '../state';
import { THEME_FAMILIES, THEME_MODES } from '../util/theme';

const onHomeClick = ev => {
  ev.preventDefault();
  scrollToSection('#hero', '#hero');
};

const headerProgress = scrollY => Math.min(1, scrollY / 120);

const familyLabel = family =>
  family.charAt(0).toUpperCase() + family.slice(1);

export default state => {
  const { scroll, size } = state.viewport.screen;
  const scrollY = scroll?.y ?? 0;
  const progress = headerProgress(scrollY);
  const paddingTop = (
    scrollY > 28 || ['xs', 'sm'].includes(size)
      ? 8
      : 28 - scrollY
  ) + 'px';

  return header('.site-header.fixed-top', {
    class: { 'is-formed': progress > 0.05 },
    style: {
      paddingTop,
      '--header-progress': progress,
    },
  }, [
    nav('.site-nav', [
      a('.site-title[href="#hero"]', {
        on: { click: onHomeClick },
      }, [
        img('.site-logo', {
          props: { src: 'assets/logo.svg', alt: '' },
        }),
        'Grooves'
      ]),
      div('.site-controls', [
        select('.control.lang-select', {
          props: { disabled: true },
        }, [
          option({ props: { value: 'en', selected: true } }, 'EN'),
          option({ props: { value: 'bg' } }, 'BG'),
        ]),
        select('.control.theme-family-select', {
          props: { value: state.themeFamily },
          on: {
            change: ev => dispatch(
              patch('themeFamily', ev.target.value)
            ),
          },
        }, THEME_FAMILIES.map(family =>
          option({ props: { value: family, selected: family === state.themeFamily } }, familyLabel(family))
        )),
        select('.control.theme-mode-select', {
          props: { value: state.themeMode },
          on: {
            change: ev => dispatch(
              patch('themeMode', ev.target.value)
            ),
          },
        }, THEME_MODES.map(mode =>
          option({ props: { value: mode, selected: mode === state.themeMode } }, mode.charAt(0).toUpperCase() + mode.slice(1))
        )),
      ]),
    ]),
  ]);
};
