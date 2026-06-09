export const samplesFromMetadata = meta =>
  Object.values(meta.pads ?? {}).flatMap(row =>
    Object.values(row).map(pad => pad.name),
  );

export const entriesAt = (kits, path = ['library']) => {
  if (!kits) return [];
  if (path.length === 1) return Object.keys(kits);
  const kit = path[1];
  return kits[kit] ? ['..', ...kits[kit]] : ['..'];
};

export const isFolder = (kits, path, name) =>
  path.length === 1 && !!kits?.[name];

export const navigate = (kits, path, name) => {
  if (name === '..') return ['library'];
  if (path.length === 1 && kits?.[name]) return ['library', name];
  return path;
};
