/** Web MIDI access + message parse (controller I/O — not SMF export). */

import { Subject, from, EMPTY, Observable, fromEventPattern, merge } from 'rxjs';
import { mergeMap, map, startWith } from 'rxjs';

const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const numberToNote = (number) => ({
  key: keys[number % 12],
  octave: parseInt((number - (number % 12)) / 12, 10) - 1,
  number,
});

export const noteToNumber = (note) =>
  keys.indexOf(note.replace(/[0-9]+/, '')) + (parseInt(note.replace(/[A-Z#b]+/, ''), 10) + 1) * 12;

/** Parse a MIDIMessageEvent into a structured message (channel is 1–16). */
export const parseMidiMsg = (event) => {
  const status = event.data[0] & 0xf0;
  const binary = event.data[0].toString(2);
  const channel = event.data[0] - status + 1;
  let msg = {};

  switch (binary.slice(0, 4)) {
    case '1000':
      msg = {
        state: 'noteOff',
        note: numberToNote(event.data[1]),
      };
      break;
    case '1001':
      msg =
        event.data[2] !== 0
          ? {
              state: 'noteOn',
              note: numberToNote(event.data[1]),
              velocity: parseFloat((event.data[2] / 127).toFixed(2)),
            }
          : {
              state: 'noteOff',
              note: numberToNote(event.data[1]),
            };
      break;
    case '1110':
      msg = {
        state: 'pitchBend',
        pitchValue: event.data[2] === 64 ? 0 : parseFloat((event.data[2] / 63.5 - 1).toFixed(2)),
      };
      break;
    case '1011':
      msg = {
        state: 'controller',
        controller: event.data[1],
        value: parseFloat((event.data[2] / 127).toFixed(2)),
      };
      break;
    case '1100':
      msg = {
        state: 'bankSelect',
        bank: event.data[1],
      };
      break;
    default:
      msg = { state: false };
      break;
  }

  return Object.assign({}, msg, {
    binary,
    status,
    channel,
    data: event.data,
  });
};

const parseAccess = (access) => {
  const inputs = [];
  const outputs = [];
  access.inputs.forEach((input) => inputs.push(input));
  access.outputs.forEach((output) => outputs.push(output));
  return { access, inputs, outputs };
};

/**
 * Request MIDI access and stream device lists + raw midimessage events.
 * @returns {{ devices$: Subject, msg$: Subject, supported: boolean }}
 */
export const init = () => {
  const devices$ = new Subject();
  const msg$ = new Subject();

  if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
    return { devices$, msg$, supported: false };
  }

  from(navigator.requestMIDIAccess())
    .pipe(
      mergeMap((access) =>
        new Observable((observer) => {
          access.onstatechange = (connection) => observer.next(connection.currentTarget);
          return () => {
            access.onstatechange = null;
          };
        }).pipe(startWith(access)),
      ),
      map(parseAccess),
    )
    .subscribe({
      next: (device) => devices$.next(device),
      error: (err) => {
        console.error('Failed to request MIDI access:', err);
        devices$.error(err);
      },
    });

  devices$
    .pipe(
      mergeMap(({ access, inputs }) =>
        inputs.reduce(
          (msgStream, input) =>
            merge(
              msgStream,
              fromEventPattern(
                (h) => {
                  input.onmidimessage = h;
                },
                () => {
                  input.onmidimessage = null;
                },
              ).pipe(map((ev) => ({ access, input, msg: ev }))),
            ),
          EMPTY,
        ),
      ),
    )
    .subscribe((raw) => msg$.next(raw));

  return { devices$, msg$, supported: true };
};

export default { init, numberToNote, noteToNumber, parseMidiMsg };
