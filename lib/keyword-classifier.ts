import type { Beat, BeatClassification } from '@/lib/types';

type KeywordMap = Record<string, Beat>;

const HIGH_PRIORITY: KeywordMap = {
  election: 'politics',
  elections: 'politics',
  vote: 'politics',
  voting: 'politics',
  parliament: 'politics',
  senate: 'politics',
  congress: 'politics',
  governor: 'politics',
  mayor: 'politics',
  minister: 'politics',
  president: 'politics',
  ministry: 'politics',
  policy: 'politics',
  sanctions: 'politics',
  ceasefire: 'politics',
  tariff: 'business',
  inflation: 'business',
  cpi: 'business',
  recession: 'business',
  gdp: 'business',
  rates: 'business',
  jobs: 'business',
  employment: 'business',
  layoffs: 'business',
  earnings: 'business',
  stocks: 'business',
  market: 'business',
  markets: 'business',
  oil: 'business',
  gas: 'business',
  bitcoin: 'business',
  ai: 'tech',
  llm: 'tech',
  chip: 'tech',
  chips: 'tech',
  startup: 'tech',
  startups: 'tech',
  software: 'tech',
  cloud: 'tech',
  semiconductors: 'tech',
  datacenter: 'tech',
  datacenters: 'tech',
  cybersecurity: 'security',
  ransomware: 'security',
  malware: 'security',
  war: 'security',
  strike: 'security',
  climate: 'climate',
  wildfire: 'climate',
  flood: 'climate',
  hurricane: 'climate',
  eleccion: 'politics',
  elecciones: 'politics',
  congreso: 'politics',
  senado: 'politics',
  presidente: 'politics',
  gobierno: 'politics',
  ministerio: 'politics',
  economia: 'business',
  inflación: 'business',
  inflacion: 'business',
  mercado: 'business',
  mercados: 'business',
  finanzas: 'business',
  negocio: 'business',
  negocios: 'business',
  bolsa: 'business',
  tecnología: 'tech',
  tecnologia: 'tech',
  ciberseguridad: 'security'
};

const MEDIUM_PRIORITY: KeywordMap = {
  regulation: 'politics',
  campaign: 'politics',
  diplomacy: 'politics',
  treaty: 'politics',
  budget: 'business',
  investment: 'business',
  revenue: 'business',
  merger: 'business',
  acquisition: 'business',
  'open source': 'tech',
  smartphone: 'tech',
  telecom: 'tech',
  breach: 'security',
  military: 'security',
  emissions: 'climate',
  drought: 'climate',
  presupuesto: 'business',
  inversión: 'business',
  inversion: 'business',
  campaña: 'politics',
  regulacion: 'politics',
  regulación: 'politics',
  nube: 'tech',
  militar: 'security'
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
