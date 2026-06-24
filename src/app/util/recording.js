import { context } from './audio';

export const listInputDevices = () =>
  navigator.mediaDevices
    ?.enumerateDevices()
    .then((devices) => devices.filter((d) => d.kind === 'audioinput')) ?? Promise.resolve([]);

export const createInputStream = (deviceId = 'default') => {
  const constraints =
    deviceId && deviceId !== 'default'
      ? { audio: { deviceId: { exact: deviceId } } }
      : { audio: true };
  return navigator.mediaDevices.getUserMedia(constraints);
};

export const createRecorder = (stream) => {
  const recorder = new MediaRecorder(stream, { audioBitsPerSecond: 128000 });
  const chunks = [];

  recorder.addEventListener('dataavailable', (e) => {
    if (e.data?.size) chunks.push(e.data);
  });

  const stopped = new Promise((resolve) => {
    recorder.addEventListener('stop', () => {
      const blob =
        chunks.length === 1
          ? chunks[0]
          : new Blob(chunks, { type: chunks[0]?.type ?? 'audio/webm' });
      resolve(blob);
    });
  });

  return {
    start: (whenMs = 0) => {
      if (whenMs > 0) {
        setTimeout(() => recorder.start(), whenMs);
      } else {
        recorder.start();
      }
    },
    stop: () => {
      if (recorder.state !== 'inactive') recorder.stop();
    },
    stopped,
    stream,
  };
};

export const decodeBlob = (blob) => blob.arrayBuffer().then((buf) => context.decodeAudioData(buf));
