import { context } from './graph';

const RECORDER_BITRATE = 256000;

const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
];

/** Browser defaults for calls — bad for loop/music capture. */
const PROCESSED_AUDIO = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

/** Music-friendly: disable call DSP when the UA honors the flags. */
const RAW_AUDIO = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

export const listInputDevices = () =>
  navigator.mediaDevices
    ?.enumerateDevices()
    .then((devices) => devices.filter((d) => d.kind === 'audioinput')) ?? Promise.resolve([]);

const audioConstraints = (deviceId = 'default', { processMic = false } = {}) => {
  const processing = processMic ? PROCESSED_AUDIO : RAW_AUDIO;
  if (deviceId && deviceId !== 'default') {
    return { audio: { deviceId: { exact: deviceId }, ...processing } };
  }
  return { audio: { ...processing } };
};

/**
 * Open mic stream.
 * @param {string} [deviceId='default']
 * @param {{ processMic?: boolean }} [opts] — when false (default), request echo/noise/AGC off
 */
export const createInputStream = (deviceId = 'default', { processMic = false } = {}) => {
  if (!navigator.mediaDevices?.getUserMedia) {
    const where = typeof location !== 'undefined' ? location.origin : 'this origin';
    return Promise.reject(
      new Error(
        `Microphone needs a secure context (https:// or http://localhost). Current: ${where}`,
      ),
    );
  }
  return navigator.mediaDevices.getUserMedia(audioConstraints(deviceId, { processMic }));
};

const pickRecorderMimeType = () => {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  return RECORDER_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
};

const createMediaRecorder = (stream) => {
  const mimeType = pickRecorderMimeType();
  const attempts = [];
  if (mimeType) {
    attempts.push({ mimeType, audioBitsPerSecond: RECORDER_BITRATE });
    attempts.push({ mimeType });
  }
  attempts.push({ audioBitsPerSecond: RECORDER_BITRATE });
  attempts.push({});

  for (const options of attempts) {
    try {
      return new MediaRecorder(stream, options);
    } catch {
      // try next
    }
  }
  return new MediaRecorder(stream);
};

export const createRecorder = (stream) => {
  const recorder = createMediaRecorder(stream);
  const chunks = [];
  let settled = false;
  const blobType = recorder.mimeType || 'audio/webm';

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
        : new Blob(chunks, { type: chunks[0]?.type ?? blobType });
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
      settle(new Blob([], { type: blobType }));
    },
    get state() {
      return recorder.state;
    },
    stopped,
    stream,
  };
};

export const decodeBlob = (blob) => blob.arrayBuffer().then((buf) => context.decodeAudioData(buf));
