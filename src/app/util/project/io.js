/** Browser download + file picker helpers for project save/load. */

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', filename);
  a.setAttribute('rel', 'noopener');
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the browser has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const DEFAULT_ACCEPT = [
  '.yaml',
  '.yml',
  '.grooves.yml',
  '.grooves.yaml',
  '.zip',
  '.grooves.zip',
  'application/zip',
  'text/yaml',
  'application/x-yaml',
].join(',');

/**
 * Open a hidden file input and resolve with the chosen File (or null if cancelled).
 * Uses the file input `cancel` event — avoid window `focus` races that drop selections.
 * @param {{ accept?: string }} [opts]
 */
export const pickFile = ({ accept = DEFAULT_ACCEPT } = {}) =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', accept);
    input.setAttribute('style', 'display:none');

    let settled = false;
    const finish = (file) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener('change', () => {
      finish(input.files?.[0] ?? null);
    });
    // Chromium / Safari: fires when the dialog is dismissed without a file.
    input.addEventListener('cancel', () => {
      finish(null);
    });

    document.body.appendChild(input);
    input.click();
  });

export const slugFilename = (name, ext) => {
  const base =
    String(name || 'project')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project';
  return `${base}.${ext}`;
};
