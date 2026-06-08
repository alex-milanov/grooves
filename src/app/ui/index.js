import { body } from 'iblokz-snabbdom-helpers';
import { themeClass } from '../util/theme';
import header from './header';
import hero from './sections/hero';
import examples from './sections/examples';
import sequencer from './sections/sequencer';

export default state => {
  const cls = themeClass(state);
  return body('.app', {
    class: { [cls]: true },
  }, [
    header(state),
    sequencer(state),
  ]);
};
