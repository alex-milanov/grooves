export const samplesFromMetadata = meta =>
  Object.values(meta.pads ?? {}).flatMap(row =>
    Object.values(row).map(pad => pad.name),
  );

export const filesFromMetadata = meta => {
  const files = {};
  Object.values(meta.pads ?? {}).forEach(row =>
    Object.values(row).forEach(pad => { files[pad.name] = pad.file; }),
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

export const isFolder = (kits, path, name) =>
  path.length === 1 && !!kits?.[name];

export const isSample = (kits, path, name) =>
  name !== '..' && !isFolder(kits, path, name);

export const entriesAt = (kits, path = ['library']) => {
  if (!kits) return [];
  if (path.length === 1) return Object.keys(kits);
  const kit = path[1];
  return kits[kit] ? ['..', ...kits[kit]] : ['..'];
};

export const navigate = (kits, path, name) => {
  if (name === '..') return ['library'];
  if (path.length === 1 && kits?.[name]) return ['library', name];
  return path;
};
