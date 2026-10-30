import main from './main';
import slotSettings from './slot-settings';

/** Loops group track editor: slot strip + selected-slot settings panel. */
export default (state) => [main(state), slotSettings(state)];
