export const SAMPLES_SECTION = 'samples';
export const LOOPS_SECTION = 'loops';

export const samplesFromMetadata = (meta) =>
  Object.values(meta.pads ?? {}).flatMap((row) => Object.values(row).map((pad) => pad.name));

export const filesFromMetadata = (meta) => {
  const files = {};
  Object.values(meta.pads ?? {}).forEach((row) =>
    Object.values(row).forEach((pad) => {
      files[pad.name] = pad.file;
    }),
  );
  return files;
};

export const defaultAssignments = (meta, kitName) => {
  const row = meta.pads?.['0'];
  if (!row) return {};
  return [0, 1, 2].reduce((assignments, track) => {
    const sample = row[String(track)]?.name;
    if (sample) assignments[track] = { kit: kitName, sample };
    return assignments;
  }, {});
};

/** Node at path under kits tree (path[0] is the library root label). */
export const nodeAt = (kits, path = ['library']) => {
  if (!kits) return null;
  let node = kits;
  for (let i = 1; i < path.length; i++) {
    if (node == null || typeof node !== 'object' || Array.isArray(node)) return null;
    node = node[path[i]];
  }
  return node;
};

/**
 * Browsable folder: section maps (`samples` / `loops`) or kit sample lists (arrays).
 * Inside a kit array, entries are samples — not folders.
 */
export const isFolder = (kits, path, name) => {
  if (name === '..') return false;
  const parent = nodeAt(kits, path);
  if (parent == null || typeof parent !== 'object' || Array.isArray(parent)) return false;
  const child = parent[name];
  return child != null && typeof child === 'object';
};

/** Sample names live only as entries of a kit array. */
export const isSample = (kits, path, name) => {
  if (name === '..') return false;
  const parent = nodeAt(kits, path);
  return Array.isArray(parent) && parent.includes(name);
};

export const entriesAt = (kits, path = ['library']) => {
  if (!kits) return [];
  const node = nodeAt(kits, path);
  if (node == null) return path.length > 1 ? ['..'] : [];
  if (Array.isArray(node)) return ['..', ...node];
  if (typeof node === 'object') {
    const keys = Object.keys(node);
    return path.length > 1 ? ['..', ...keys] : keys;
  }
  return [];
};

export const navigate = (kits, path, name) => {
  if (name === '..') return path.length > 1 ? path.slice(0, -1) : path;
  if (isFolder(kits, path, name)) return [...path, name];
  return path;
};

/** Current section folder under library (`samples` | `loops`), if any. */
export const pathSection = (path) =>
  path?.[1] === SAMPLES_SECTION || path?.[1] === LOOPS_SECTION ? path[1] : null;

/** Kit name when browsing inside a kit folder. */
export const pathKit = (path) => (path?.length >= 3 ? path[2] : null);

/**
 * Ensure path is under `section`. If already there, leave it (sticky browsing).
 * Otherwise open that section root.
 */
export const ensureLibrarySection = (library, section) => {
  const path = library?.path ?? ['library'];
  if (pathSection(path) === section) return library;
  return {
    ...library,
    path: ['library', section],
  };
};

/**
 * Point the library at an assignment's kit + sample when present.
 * No assignment → stay sticky under `section`, clear selectedSample.
 */
export const libraryForAssignment = (library, section, assignment = null) => {
  const kit = assignment?.kit;
  const sample = assignment?.sample ?? null;
  if (kit) {
    return {
      ...library,
      path: ['library', section, kit],
      selectedSample: sample,
    };
  }
  return {
    ...ensureLibrarySection(library, section),
    selectedSample: null,
  };
};
