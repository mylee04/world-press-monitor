export type NewsSection =
  | 'politics'
  | 'conflicts'
  | 'business'
  | 'tech'
  | 'sports'
  | 'health'
  | 'entertainment'
  | 'lifestyle'
  | 'arts'
  | 'science'
  | 'climate'
  | 'world'
  | 'others';
export type SourceCategory =
  | 'global'
  | 'politics'
  | 'conflicts'
  | 'business'
  | 'tech'
  | 'sports'
  | 'health'
  | 'entertainment'
  | 'lifestyle'
  | 'arts'
  | 'science'
  | 'world';

export type OutletTier = 1 | 2 | 3;

export interface OutletFeed {
  id: string;
  name: string;
  tier: OutletTier;
  section: NewsSection;
  categories: SourceCategory[];
  language?: string;
  sourceType?: 'global' | 'local' | 'portal';
  reviewDecision?: 'verified_core' | 'keep_secondary' | 'exploratory_off_by_default' | 'manual_review';
  defaultEnabled?: boolean;
  country: string;
  rssUrl?: string;
  sitemapUrl?: string;
  hasExplicitSitemapUrl?: boolean;
}

export interface SourcePreset {
  key: string;
  label: string;
  description: string;
  outletIds: string[];
}

export interface SectionClassification {
  section: NewsSection;
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
  section: NewsSection;
  confidence: number;
  classificationSource: 'keyword' | 'llm';
  classificationReason?: string;
  publishedAtIsFallback?: boolean;
  locationName?: string;
  country?: string;
  lat?: number;
  lon?: number;
  worldLatam?: boolean;
  tags?: string[];
  sourceCategories?: string[];
  publicationSource?: 'feed' | 'article_meta';
  summarySource?: 'feed' | 'article_meta';
}
