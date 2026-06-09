import { fromEvent, filter, startWith } from "rxjs";

import { patch, zoom } from "../state";
import { dispatch } from 'iblokz-state';

export let stop = () => {};
export const start = ({state$}) => {
	let subs = [];
  subs.push();
  stop = () => subs.forEach(sub => sub.dispose());
};