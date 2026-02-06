import type { Beat, BeatClassification } from '@/lib/types';

type KeywordMap = Record<string, Beat>;

const HIGH_PRIORITY: KeywordMap = {
  election: 'politics',
  parliament: 'politics',
  senate: 'politics',
  president: 'politics',
  ministry: 'politics',
  tariff: 'business',
  inflation: 'business',
  recession: 'business',
  gdp: 'business',
  rates: 'business',
  ai: 'tech',
  chip: 'tech',
  startup: 'tech',
  software: 'tech',
  cybersecurity: 'security',
  ransomware: 'security',
  malware: 'security',
  war: 'security',
  strike: 'security',
  sanctions: 'security',
  climate: 'climate',
  wildfire: 'climate',
  flood: 'climate',
  hurricane: 'climate'
};

const MEDIUM_PRIORITY: KeywordMap = {
  regulation: 'politics',
  campaign: 'politics',
  budget: 'business',
  market: 'business',
  investment: 'business',
  cloud: 'tech',
  'open source': 'tech',
  breach: 'security',
  military: 'security',
  emissions: 'climate',
  drought: 'climate'
};

const SHORT_KEYWORDS = new Set(['ai', 'war', 'gdp']);
const regexCache = new Map<string, RegExp>();

function getKeywordRegex(keyword: string): RegExp {
  let regex = regexCache.get(keyword);
  if (!regex) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = SHORT_KEYWORDS.has(keyword) ? new RegExp(`\\b${escaped}\\b`, 'i') : new RegExp(escaped, 'i');
    regexCache.set(keyword, regex);
  }
  return regex;
}

function matchMap(title: string, map: KeywordMap): { beat: Beat; keyword: string } | null {
  for (const [keyword, beat] of Object.entries(map)) {
    if (getKeywordRegex(keyword).test(title)) {
      return { beat, keyword };
    }
  }
  return null;
}

export function classifyBeatByKeyword(title: string, fallbackBeat: Beat = 'general'): BeatClassification {
  const high = matchMap(title, HIGH_PRIORITY);
  if (high) {
    return {
      beat: high.beat,
      confidence: 0.84,
      source: 'keyword',
      reason: `Matched high-priority keyword: ${high.keyword}`
    };
  }

  const medium = matchMap(title, MEDIUM_PRIORITY);
  if (medium) {
    return {
      beat: medium.beat,
      confidence: 0.72,
      source: 'keyword',
      reason: `Matched medium-priority keyword: ${medium.keyword}`
    };
  }

  return { beat: fallbackBeat, confidence: 0.51, source: 'keyword', reason: 'Fell back to outlet default beat' };
}
