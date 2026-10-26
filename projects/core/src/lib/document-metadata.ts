export const PAGE_MODES = ['UseNone', 'UseThumbs', 'FullScreen'] as const;
export type PageMode = (typeof PAGE_MODES)[number];

export const PAGE_LAYOUTS = [
  'SinglePage',
  'OneColumn',
  'TwoColumnLeft',
  'TwoColumnRight',
  'TwoPageLeft',
  'TwoPageRight',
] as const;
export type PageLayout = (typeof PAGE_LAYOUTS)[number];
