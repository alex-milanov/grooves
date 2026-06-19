import { body, div } from 'iblokz-snabbdom-helpers';
import { themeClass } from '../util/theme';
import header from './header';
import library from './sections/library';
import sequencer from './sections/sequencer';
import trackSettings from './sections/track-settings';

export default state => {
  const cls = themeClass(state);
  return body('.app', {
    class: { [cls]: true },
  }, [
    header(state),
    div('.workspace', [
      library(state),
      sequencer(state),
      trackSettings(state),
    ]),
  ]);
};
