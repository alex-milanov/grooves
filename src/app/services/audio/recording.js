import { context } from './graph';

export const listInputDevices = () =>
  navigator.mediaDevices
    ?.enumerateDevices()
    .then((devices) => devices.filter((d) => d.kind === 'audioinput')) ?? Promise.resolve([]);

export const createInputStream = (deviceId = 'default') => {
  if (!navigator.mediaDevices?.getUserMedia) {
    const where = typeof location !== 'undefined' ? location.origin : 'this origin';
    return Promise.reject(
      new Error(
        `Microphone needs a secure context (https:// or http://localhost). Current: ${where}`,
      ),
    );
  }
  const constraints =
    deviceId && deviceId !== 'default'
      ? { audio: { deviceId: { exact: deviceId } } }
      : { audio: true };
  return navigator.mediaDevices.getUserMedia(constraints);
};

export const createRecorder = (stream) => {
  const recorder = new MediaRecorder(stream, { audioBitsPerSecond: 128000 });
  const chunks = [];
  let settled = false;

  recorder.addEventListener('dataavailable', (e) => {
    if (e.data?.size) chunks.push(e.data);
  });

  let resolveStopped;
  const stopped = new Promise((resolve) => {
    resolveStopped = resolve;
  });

  const settle = (blob) => {
    if (settled) return;
    settled = true;
    resolveStopped(blob);
  };

  recorder.addEventListener('stop', () => {
    const blob =
      chunks.length === 1
        ? chunks[0]
        : new Blob(chunks, { type: chunks[0]?.type ?? 'audio/webm' });
    settle(blob);
  });

  return {
    start: (whenMs = 0) => {
      if (settled || recorder.state !== 'inactive') return;
      if (whenMs > 0) {
        setTimeout(() => {
          if (!settled && recorder.state === 'inactive') recorder.start();
        }, whenMs);
      } else {
        recorder.start();
      }
    },
    stop: () => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
        return;
      }
      // Stop before start (e.g. cancel during count-in) — don't leave `stopped` hanging.
      settle(new Blob([], { type: 'audio/webm' }));
    },
    get state() {
      return recorder.state;
    },
    stopped,
    stream,
  };
};

export const decodeBlob = (blob) => blob.arrayBuffer().then((buf) => context.decodeAudioData(buf));
