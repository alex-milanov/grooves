const previews = {
  pixel: {
    fontFamily: "'Public Pixel', monospace",
    swatch: {
      dark: 'linear-gradient(to right, #514b5e 0 25%, #27252d 25% 50%, #dcf7e1 50% 75%, #34294b 75% 100%)',
      light:
        'linear-gradient(to right, #9a8fb5 0 25%, #e8e4f0 25% 50%, #514b5e 50% 75%, #2a2438 75% 100%)',
    },
  },
  terminal: {
    fontFamily: "'Fira Code', monospace",
    swatch: {
      dark: 'linear-gradient(to right, #2a2a2a 0 33%, #666666 33% 66%, #cccccc 66% 100%)',
      light: 'linear-gradient(to right, #e5e5e5 0 33%, #888888 33% 66%, #444444 66% 100%)',
    },
  },
  studio: {
    fontFamily: "'Fira Code', monospace",
    swatch: {
      dark: 'linear-gradient(to right, #303030 0 33%, #408bbd 33% 66%, #aaaaaa 66% 100%)',
      light: 'linear-gradient(to right, #fafafa 0 33%, #408bbd 33% 66%, #333333 66% 100%)',
    },
  },
  crm: {
    fontFamily: "'Open Sans', sans-serif",
    swatch: {
      dark: 'linear-gradient(to right, #1e1e1e 0 33%, #2b95d6 33% 66%, #dddddd 66% 100%)',
      light: 'linear-gradient(to right, #fafafa 0 33%, #2b95d6 33% 66%, #333333 66% 100%)',
    },
  },
};

export const themePreview = (family, mode = 'dark') => {
  const p = previews[family] ?? previews.pixel;
  return {
    fontFamily: p.fontFamily,
    swatch: p.swatch[mode] ?? p.swatch.dark,
  };
};
