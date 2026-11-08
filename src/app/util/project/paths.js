/** Zip-relative media paths for grooves-project archives. */

export const PROJECT_YAML = 'project.yaml';

export const sampleMediaPath = (kit, file) => `media/samples/${kit}/${file}`;

export const loopMediaPath = (slotId, layerIndex = 0) => `media/loops/${slotId}/L${layerIndex}.wav`;

/** @returns {{ kind: 'sample', kit: string, file: string } | null} */
export const parseSampleMediaPath = (path) => {
  const m = String(path ?? '').match(/^media\/samples\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { kind: 'sample', kit: m[1], file: m[2] };
};

/**
 * @returns {{ kind: 'loop', slotId: string, layer: number } | null}
 * Accepts `media/loops/{slotId}/L{n}.wav` or legacy `media/loops/{slotId}.wav` (layer 0).
 */
export const parseLoopMediaPath = (path) => {
  const layered = String(path ?? '').match(/^media\/loops\/([^/]+)\/L(\d+)\.wav$/i);
  if (layered) {
    return { kind: 'loop', slotId: layered[1], layer: Number(layered[2]) };
  }
  const legacy = String(path ?? '').match(/^media\/loops\/([^/]+)\.wav$/i);
  if (legacy) {
    return { kind: 'loop', slotId: legacy[1], layer: 0 };
  }
  return null;
};

/** Normalize `media` field to a string path list. */
export const mediaPathList = (media) => {
  if (!media) return [];
  if (typeof media === 'string') return [media];
  if (Array.isArray(media)) return media.filter((p) => typeof p === 'string' && p.length);
  return [];
};
