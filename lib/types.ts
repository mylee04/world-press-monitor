export type Beat = 'politics' | 'business' | 'tech' | 'security' | 'climate' | 'world' | 'general';
export type SourceCategory =
  | 'global'
  | 'politics'
  | 'business'
  | 'tech'
  | 'world'
  | 'security';

export type OutletTier = 1 | 2 | 3;

export interface OutletFeed {
  id: string;
  name: string;
  tier: OutletTier;
  beat: Beat;
  categories: SourceCategory[];
  language?: string;
  sourceType?: 'global' | 'local' | 'portal';
  reviewDecision?: 'verified_core' | 'keep_secondary' | 'exploratory_off_by_default' | 'manual_review';
  defaultEnabled?: boolean;
  country: string;
  rssUrl?: string;
  sitemapUrl?: string;
}

export interface SourcePreset {
  key: string;
  label: string;
  description: string;
  outletIds: string[];
}

export interface BeatClassification {
  beat: Beat;
  confidence: number;
  source: 'keyword' | 'llm';
  reason?: string;
}

export interface NewsItem {
  id: string;
  outletId?: string;
  title: string;
  description?: string;
  link: string;
  source: string;
  language?: string;
  sourceType?: 'global' | 'local' | 'portal';
  clusterId?: string;
  clusterSize?: number;
  tier: OutletTier;
  publishedAt: string;
  beat: Beat;
  confidence: number;
  classificationSource: 'keyword' | 'llm';
  classificationReason?: string;
  locationName?: string;
  country?: string;
  lat?: number;
  lon?: number;
  worldLatam?: boolean;
  tags?: string[];
  publicationSource?: 'feed' | 'article_meta';
  summarySource?: 'feed' | 'article_meta';
}
