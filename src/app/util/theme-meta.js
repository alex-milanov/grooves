export const THEME_REFERENCES = {
  pixel: {
    label: 'Pixel',
    summary: 'Retro pixel-art HUD',
    references: [{ name: 'iBlokz boilerplate', path: 'this project' }],
    traits: [
      'Public Pixel font',
      'Hard 4px offset shadows',
      'Gradient page and panels',
      'Text-shadow on headings',
    ],
  },
  terminal: {
    label: 'Terminal',
    summary: 'Monospace dev workspace — calm, flat, almost no decoration.',
    references: [{ name: 'alphapm', path: '~/Projects/dev/apps/alphapm' }],
    traits: [
      'Fira Code',
      'Radial gray page background',
      'Flat panels with 1px borders',
      'No text-shadow',
    ],
  },
  studio: {
    label: 'Studio',
    summary: 'Utility desktop app — flat surfaces with inset control depth.',
    references: [
      { name: 'media-browser', path: '~/Projects/dev/apps/media-browser' },
      { name: 'Similar Snabbdom apps', path: 'your media-browser-style projects' },
    ],
    traits: [
      'Fira Code',
      'Flat #fafafa / #303030 backgrounds',
      'Inset shadows on inputs and buttons',
      'Compact density',
    ],
  },
  crm: {
    label: 'CRM',
    summary: 'Product / forms UI',
    references: [
      { name: 'thriftify.me', path: '~/Projects/dev/apps/thriftify.me' },
      { name: 'i4web inventory', path: '~/Projects/dev/org/i4web/inventory' },
      { name: 'dashboard', path: '~/Projects/dev/apps/dashboard' },
    ],
    traits: [
      'Open Sans',
      'Flat page colors (CSS only, no textures)',
      '3px radius, inset + drop on panels/buttons',
      'Blue #2B95D6 accent',
    ],
  },
};

export const getThemeMeta = (family) => THEME_REFERENCES[family] || THEME_REFERENCES.pixel;
