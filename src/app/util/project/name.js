/** Project display / download basename helpers. */

/** Jam-station style stamp: `YYYY-MM-DD-HH-mm`. */
export const defaultProjectName = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join('-');
};

/** Prefer saved name; otherwise a fresh timestamp (never bare `untitled`). */
export const projectBasename = (state) => {
  const named = state?.name != null ? String(state.name).trim() : '';
  return named || defaultProjectName();
};
