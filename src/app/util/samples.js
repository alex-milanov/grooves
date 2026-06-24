const cache = new Map();

export const get = (key) => cache.get(key);
export const set = (key, buffer) => cache.set(key, buffer);

export const key = (kit, sample) => `${kit}/${sample}`;
