export type MapSidePanelRankedCount = {
  name: string;
  count: number;
};

export type MapSidePanelRegionCount = {
  name: string;
  count: number;
  sources: number;
};

export type MapSidePanelDegradedRegion = {
  name: string;
  degradedSources: number;
  sources: number;
  degradedShare: number;
};

export type MapSidePanelCountryTrendBar = {
  bucket: string;
  count: number;
};

export type MapSidePanelCountrySummaryDisplay = {
  published: number;
  fresh: number;
  late: number;
  firstSeen: number;
  activeSources: number;
  rssSources: number;
  sitemapSources: number;
  healthySources: number;
  degradedSources: number;
};
