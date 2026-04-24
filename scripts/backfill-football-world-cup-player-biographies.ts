import fs from "node:fs/promises";
import path from "node:path";
import { decode } from "html-entities";
import {
  buildFootballWorldCupDossierProgram,
  type FootballWorldCupDossierProgramPlayer,
  type FootballWorldCupTopMissingLiveBioPlayer,
} from "@/lib/football-world-cup-dossier-program";
import { readFootballWorldCupHumanInterestPilotCanonical } from "@/lib/football-world-cup-human-interest-store";
import {
  readFootballWorldCupJournalistSnapshot,
  resolveFootballWorldCupJournalistSnapshotPath,
  type FootballWorldCupJournalistSnapshot,
  type JournalistClubHistoryItem,
  type JournalistPersonCard,
} from "@/lib/football-world-cup-journalist-store";

const USER_AGENT =
  "world-press-monitor/1.0 (football world cup player biography backfill)";
const HTML_USER_AGENT =
  "Mozilla/5.0 (compatible; world-press-monitor/1.0; +https://worldpressradar.com)";
const DEFAULT_RETRY_MS = 2000;
const MAX_FETCH_ATTEMPTS = 4;
const FETCH_TIMEOUT_MS = 15000;
const CACHE_FLUSH_EVERY_MUTATIONS = 25;
const DOMAIN_THROTTLE_MS: Record<string, number> = {
  "www.footballdatabase.eu": 250,
  "footballdatabase.eu": 250,
  "fbref.com": 1200,
  "www.fbref.com": 1200,
};
const DOMAIN_FETCH_TIMEOUT_MS: Record<string, number> = {
  "www.footballdatabase.eu": 8000,
  "footballdatabase.eu": 8000,
  "fbref.com": 5000,
  "www.fbref.com": 5000,
};

type ScopeMode =
  | "top20-bio-gap"
  | "top50-bio-gap"
  | "target-bio-gap"
  | "top50-completeness"
  | "top200-completeness"
  | "target-completeness";

type SourceLadderKey =
  | "wikidata"
  | "wikipedia"
  | "officialWebsite"
  | "clubOfficialBiography"
  | "transfermarkt"
  | "fbref"
  | "nationalFootballTeams"
  | "soccerway"
  | "soccerbase"
  | "footballDatabase"
  | "lequipe";

type SourceLadderUrls = Partial<Record<SourceLadderKey, string>>;

type ExternalSourceFormatter = {
  key: SourceLadderKey;
  propertyId: string;
  label: string;
  formatterUrl: string;
};

type RawSnapshot = FootballWorldCupJournalistSnapshot;

type RawSnapshotTeam = RawSnapshot["teams"][number];

type Args = {
  apply: boolean;
  scope: ScopeMode;
  limit: number | null;
  rankFrom: number | null;
  rankTo: number | null;
  skipClubOfficial: boolean;
  skipFbref: boolean;
  skipSoccerway: boolean;
  skipFootballDatabase: boolean;
  onlyCachedFootballDatabase: boolean;
  onlyMissingFootballDatabase: boolean;
  onlyWithoutFootballDatabaseUrl: boolean;
  externalFactsOnly: boolean;
  identityOnly: boolean;
  person: string | null;
  outPath: string;
  cachePath: string;
};

type WikidataSearchResult = {
  id?: string;
  label?: string;
  description?: string;
};

type WikipediaSearchResult = {
  title?: string;
  snippet?: string;
};

type WikidataEntity = {
  id: string;
  labels: Record<string, string>;
  descriptions: Record<string, string>;
  sitelinks: Record<string, string>;
  claims: Record<string, unknown[]>;
};

type BiographySummary = {
  pageTitle: string;
  pageUrl: string;
  extract: string | null;
  wikibaseItem: string | null;
};

type InfoboxClubHistoryItem = {
  club: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
};

type ParsedFootballInfobox = {
  fullName: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  heightCm: number | null;
  weightKg: number | null;
  footedness: string | null;
  currentClub: string | null;
  clubNumber: number | null;
  positions: string[];
  youthClubs: string[];
  clubHistory: InfoboxClubHistoryItem[];
};

type WikidataResolvedFacts = {
  qid: string;
  entityUrl: string;
  wikipediaTitle: string | null;
  wikipediaUrl: string | null;
  fullName: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  currentClub: string | null;
  positions: string[];
  heightCm: number | null;
  weightKg: number | null;
  languages: string[];
  education: string[];
  officialWebsite: string | null;
  sourceLadder: SourceLadderUrls;
  externalIds: Record<string, string>;
  disambiguation: {
    resolutionMethod: string;
    resolutionScore: number;
    candidateCount: number;
    searchQueries: string[];
    matchedSignals: string[];
  };
};

type ResolvedWikidataCandidate = {
  entity: WikidataEntity;
  resolutionMethod: string;
  wikipediaTitle: string | null;
  originatingQuery: string | null;
};

type TransfermarktProfileFacts = {
  sourceUrl: string;
  heightCm: number | null;
  footedness: string | null;
  positions: string[];
  currentClub: string | null;
  clubNumber: number | null;
};

type FbrefProfileFacts = {
  sourceUrl: string;
  blocked: boolean;
  heightCm: number | null;
  weightKg: number | null;
  footedness: string | null;
  positions: string[];
  currentClub: string | null;
  statProfile: {
    standardTableFound: boolean;
    lastSeason: string | null;
    competitions: string[];
  };
};

type SoccerwayProfileFacts = {
  sourceUrl: string;
  finalUrl: string | null;
  profileTitle: string | null;
  currentClub: string | null;
  sourceAccessible: boolean;
  exposesStaticCareerData: boolean;
};

type FootballDatabaseProfileFacts = {
  sourceUrl: string;
  currentClub: string | null;
  heightCm: number | null;
  weightKg: number | null;
  footedness: string | null;
  positions: string[];
  internationalCaps: number | null;
  internationalGoals: number | null;
  firstCapOpponent: string | null;
  firstCapDate: string | null;
  clubHistory: InfoboxClubHistoryItem[];
  statProfile: {
    careerRows: number;
    latestSeason: string | null;
  };
};

type ClubOfficialProfileFacts = {
  sourceUrl: string;
  sourceLabel: string;
  sourceKind: "club_official_biography" | "club_official_squad_page";
  heightCm: number | null;
  weightKg: number | null;
};

type NationalFootballTeamsFacts = {
  sourceUrl: string;
  canonicalUrl: string | null;
  fullName: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  heightCm: number | null;
  nationalTeam: string | null;
  firstSeason: number | null;
  latestSeason: number | null;
  totalMatches: number | null;
  currentClub: string | null;
  positions: string[];
  clubHistory: InfoboxClubHistoryItem[];
};

type NationalFootballTeamsSearchResult = {
  sourceUrl: string;
  displayName: string;
  birthDate: string | null;
  birthPlace: string | null;
  heightCm: number | null;
  country: string | null;
  positions: string[];
};

type ClubOfficialProfilePattern = {
  clubMatcher: RegExp;
  sourceLabel: string;
  sourceKind: ClubOfficialProfileFacts["sourceKind"];
  buildUrls: (input: {
    card: JournalistPersonCard;
    slugs: string[];
  }) => string[];
  acceptBlockedStatus?: boolean;
};

type MergeResult = {
  sportsPersonId: string;
  displayName: string;
  teamCanonicalName: string;
  seedRank: number | null;
  applied: boolean;
  biographySourceUrl: string | null;
  wikidataEntityId: string | null;
  sourceLadderUrls: SourceLadderUrls;
  fieldsAdded: string[];
  warnings: string[];
};

const EXTERNAL_SOURCE_FORMATTERS: ExternalSourceFormatter[] = [
  {
    key: "transfermarkt",
    propertyId: "P2446",
    label: "Transfermarkt",
    formatterUrl: "https://www.transfermarkt.com/-/profil/spieler/$1",
  },
  {
    key: "fbref",
    propertyId: "P5750",
    label: "FBref",
    formatterUrl: "https://fbref.com/en/players/$1/",
  },
  {
    key: "nationalFootballTeams",
    propertyId: "P2574",
    label: "National Football Teams",
    formatterUrl: "https://www.national-football-teams.com/player/$1.html",
  },
  {
    key: "soccerway",
    propertyId: "P2369",
    label: "Soccerway",
    formatterUrl: "https://www.soccerway.com/players/-/$1/",
  },
  {
    key: "soccerbase",
    propertyId: "P2193",
    label: "Soccerbase",
    formatterUrl: "https://www.soccerbase.com/players/player.sd?player_id=$1",
  },
  {
    key: "footballDatabase",
    propertyId: "P3537",
    label: "FootballDatabase.eu",
    formatterUrl: "https://www.footballdatabase.eu/en/player/details/$1",
  },
  {
    key: "lequipe",
    propertyId: "P3665",
    label: "L'Equipe",
    formatterUrl: "https://www.lequipe.fr/Football/FootballFicheJoueur$1.html",
  },
];

const CLUB_OFFICIAL_PROFILE_PATTERNS: ClubOfficialProfilePattern[] = [
  {
    clubMatcher: /\bac milan\b/i,
    sourceLabel: "AC Milan official biography",
    sourceKind: "club_official_biography",
    buildUrls: ({ slugs }) =>
      slugs.flatMap((slug) => [
        `https://www.acmilan.com/en/teams/men-first-team/players/${slug}/biography`,
        `https://www.acmilan.com/en/teams/men-first-team/players/${slug}`,
      ]),
  },
  {
    clubMatcher: /\bchelsea\b/i,
    sourceLabel: "Chelsea official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map((slug) => `https://www.chelseafc.com/en/teams/profile/${slug}`),
  },
  {
    clubMatcher: /\barsenal\b/i,
    sourceLabel: "Arsenal official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map((slug) => `https://www.arsenal.com/men/players/${slug}`),
  },
  {
    clubMatcher: /\bliverpool\b/i,
    sourceLabel: "Liverpool official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map((slug) => `https://www.liverpoolfc.com/team/mens/player/${slug}`),
  },
  {
    clubMatcher: /\bmanchester united\b/i,
    sourceLabel: "Manchester United official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map(
        (slug) => `https://www.manutd.com/en/players-and-staff/detail/${slug}`,
      ),
  },
  {
    clubMatcher: /\bparis saint-germain\b|\bpsg\b/i,
    sourceLabel: "Paris Saint-Germain official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.flatMap((slug) => [
        `https://www.psg.fr/en/players/${slug}`,
        `https://en.psg.fr/teams/first-team/squad/${slug}`,
      ]),
  },
  {
    clubMatcher: /\btottenham hotspur\b/i,
    sourceLabel: "Tottenham Hotspur official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map(
        (slug) => `https://www.tottenhamhotspur.com/teams/men/players/${slug}/`,
      ),
  },
  {
    clubMatcher: /\breal madrid\b/i,
    sourceLabel: "Real Madrid official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map(
        (slug) =>
          `https://www.realmadrid.com/en-US/football/first-team/players/${slug}`,
      ),
  },
  {
    clubMatcher: /\bbarcelona\b|\bfc barcelona\b/i,
    sourceLabel: "FC Barcelona official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.flatMap((slug) => [
        `https://www.fcbarcelona.com/en/football/first-team/players/${slug}`,
        `https://www.fcbarcelona.com/en/football/first-team/jugadores/${slug}`,
      ]),
  },
  {
    clubMatcher: /\bbayern munich\b|\bfc bayern\b/i,
    sourceLabel: "FC Bayern official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.flatMap((slug) => [
        `https://fcbayern.com/en/teams/first-team/${slug}`,
        `https://fcbayern.com/en/teams/professionals/${slug}`,
      ]),
  },
  {
    clubMatcher: /\bjuventus\b/i,
    sourceLabel: "Juventus official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map(
        (slug) => `https://www.juventus.com/en/teams/first-team-men/squad/${slug}`,
      ),
  },
  {
    clubMatcher: /\binter milan\b|\binternazionale\b/i,
    sourceLabel: "Inter official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map((slug) => `https://www.inter.it/en/teams/first-team/${slug}`),
  },
  {
    clubMatcher: /\binter miami\b/i,
    sourceLabel: "Inter Miami official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.flatMap((slug) => [
        `https://www.intermiamicf.com/players/${slug}/`,
        `https://www.intermiamicf.com/club/roster/${slug}/`,
      ]),
  },
  {
    clubMatcher: /\bmanchester city\b/i,
    sourceLabel: "Manchester City official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map((slug) => `https://www.mancity.com/players/${slug}`),
    acceptBlockedStatus: true,
  },
  {
    clubMatcher: /\baston villa\b/i,
    sourceLabel: "Aston Villa official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map((slug) => `https://www.avfc.co.uk/players/mens/${slug}`),
  },
  {
    clubMatcher: /\bcrystal palace\b/i,
    sourceLabel: "Crystal Palace official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map((slug) => `https://www.cpfc.co.uk/teams/first-team/${slug}`),
  },
  {
    clubMatcher: /\bnewcastle united\b/i,
    sourceLabel: "Newcastle United official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map((slug) => `https://www.newcastleunited.com/en/teams/first-team/${slug}`),
  },
  {
    clubMatcher: /\bwolverhampton\b|\bwolves\b/i,
    sourceLabel: "Wolves official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map((slug) => `https://www.wolves.co.uk/teams/mens-first-team/${slug}/`),
  },
  {
    clubMatcher: /\bwest ham\b/i,
    sourceLabel: "West Ham United official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map((slug) => `https://www.whufc.com/player/${slug}`),
  },
  {
    clubMatcher: /\bborussia dortmund\b|\bdortmund\b/i,
    sourceLabel: "Borussia Dortmund official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.flatMap((slug) => [
        `https://www.bvb.de/de/en/teams/football/first-team/squad/${slug}.html`,
        `https://www.bvb.de/eng/Teams/First-Team/${slug}`,
      ]),
  },
  {
    clubMatcher: /\bbayer leverkusen\b|\bleverkusen\b/i,
    sourceLabel: "Bayer Leverkusen official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map((slug) => `https://www.bayer04.de/en-us/player/werkself/bayer-04-leverkusen/${slug}`),
  },
  {
    clubMatcher: /\bbenfica\b/i,
    sourceLabel: "Benfica official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map((slug) => `https://www.slbenfica.pt/en-us/futebol/plantel-principal/${slug}`),
  },
  {
    clubMatcher: /\bas monaco\b|\bmonaco\b/i,
    sourceLabel: "AS Monaco official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map((slug) => `https://www.asmonaco.com/en/joueurs/${slug}/`),
  },
  {
    clubMatcher: /\bajax\b/i,
    sourceLabel: "Ajax official profile",
    sourceKind: "club_official_squad_page",
    buildUrls: ({ slugs }) =>
      slugs.map((slug) => `https://english.ajax.nl/teams/ajax-1/${slug}/`),
  },
];

function parseArgs(argv: string[]): Args {
  let apply = false;
  let scope: ScopeMode = "top20-bio-gap";
  let limit: number | null = null;
  let rankFrom: number | null = null;
  let rankTo: number | null = null;
  let skipClubOfficial = false;
  let skipFbref = true;
  let skipSoccerway = false;
  let skipFootballDatabase = false;
  let onlyCachedFootballDatabase = false;
  let onlyMissingFootballDatabase = false;
  let onlyWithoutFootballDatabaseUrl = false;
  let externalFactsOnly = false;
  let identityOnly = false;
  let person: string | null = null;
  let outPath = path.join(
    process.cwd(),
    "output",
    "football-world-cup-player-biography-backfill",
    "latest.json",
  );
  let cachePath = path.join(
    process.cwd(),
    "output",
    "football-world-cup-player-biography-backfill",
    "wikimedia-cache.json",
  );

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--skip-club-official") {
      skipClubOfficial = true;
      continue;
    }
    if (arg === "--skip-fbref") {
      skipFbref = true;
      continue;
    }
    if (arg === "--with-fbref") {
      skipFbref = false;
      continue;
    }
    if (arg === "--skip-soccerway") {
      skipSoccerway = true;
      continue;
    }
    if (arg === "--skip-football-database") {
      skipFootballDatabase = true;
      continue;
    }
    if (arg === "--only-cached-football-database") {
      onlyCachedFootballDatabase = true;
      continue;
    }
    if (arg === "--only-missing-football-database") {
      onlyMissingFootballDatabase = true;
      continue;
    }
    if (arg === "--only-without-football-database-url") {
      onlyWithoutFootballDatabaseUrl = true;
      continue;
    }
    if (arg === "--external-facts-only") {
      externalFactsOnly = true;
      continue;
    }
    if (arg === "--identity-only") {
      identityOnly = true;
      continue;
    }
    if (arg.startsWith("--scope=")) {
      const value = arg.slice("--scope=".length).trim() as ScopeMode;
      if (
        value === "top20-bio-gap" ||
        value === "top50-bio-gap" ||
        value === "target-bio-gap" ||
        value === "top50-completeness" ||
        value === "top200-completeness" ||
        value === "target-completeness"
      ) {
        scope = value;
      }
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length).trim());
      if (Number.isFinite(value) && value > 0) {
        limit = Math.floor(value);
      }
      continue;
    }
    if (arg.startsWith("--rank-from=")) {
      const value = Number(arg.slice("--rank-from=".length).trim());
      if (Number.isFinite(value) && value > 0) {
        rankFrom = Math.floor(value);
      }
      continue;
    }
    if (arg.startsWith("--rank-to=")) {
      const value = Number(arg.slice("--rank-to=".length).trim());
      if (Number.isFinite(value) && value > 0) {
        rankTo = Math.floor(value);
      }
      continue;
    }
    if (arg.startsWith("--person=")) {
      const value = arg.slice("--person=".length).trim();
      person = value || null;
      continue;
    }
    if (arg.startsWith("--out=")) {
      const value = arg.slice("--out=".length).trim();
      if (value) outPath = path.resolve(process.cwd(), value);
      continue;
    }
    if (arg.startsWith("--cache=")) {
      const value = arg.slice("--cache=".length).trim();
      if (value) cachePath = path.resolve(process.cwd(), value);
    }
  }

  return {
    apply,
    scope,
    limit,
    rankFrom,
    rankTo,
    skipClubOfficial,
    skipFbref,
    skipSoccerway,
    skipFootballDatabase,
    onlyCachedFootballDatabase,
    onlyMissingFootballDatabase,
    onlyWithoutFootballDatabaseUrl,
    externalFactsOnly,
    identityOnly,
    person,
    outPath,
    cachePath,
  };
}

function normalizeText(value: string | null | undefined): string | null {
  const next = (value || "").trim();
  return next || null;
}

function normalizeMatch(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((token) =>
      token.length <= 2
        ? token.toUpperCase()
        : token[0]!.toUpperCase() + token.slice(1).toLowerCase(),
    )
    .join(" ");
}

function isTemplatedBiography(value: string | null | undefined): boolean {
  const text = normalizeText(value)?.toLowerCase() || "";
  return (
    !text ||
    text.includes("currently listed in") ||
    text.includes("world cup 2026 squad") ||
    text.includes("anchored to official team material")
  );
}

function countToken(value: string, token: string): number {
  return (value.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || [])
    .length;
}

function stripRefs(value: string): string {
  return value
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref\b[^>]*\/>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

function stripWikiMarkup(value: string): string {
  let next = stripRefs(value);
  next = next.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1");
  next = next.replace(/\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/g, "$2");
  next = next.replace(/\[https?:\/\/[^\s\]]+\]/g, "");
  next = next.replace(/'''?/g, "");
  next = next.replace(/<[^>]+>/g, "");
  let previous = "";
  while (previous !== next) {
    previous = next;
    next = next.replace(/\{\{[^{}]*\}\}/g, "");
  }
  next = next.replace(/&nbsp;/gi, " ");
  next = next.replace(/\s+/g, " ").trim();
  return next;
}

function parseDateTemplate(value: string | null | undefined): string | null {
  const text = value || "";
  const birthMatch = text.match(
    /\{\{\s*birth date(?: and age)?\|(\d{4})\|(\d{1,2})\|(\d{1,2})/i,
  );
  if (birthMatch) {
    const [, year, month, day] = birthMatch;
    return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  }
  const clean = stripWikiMarkup(text);
  const ts = Date.parse(clean);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString().slice(0, 10);
}

function parseHeightCm(value: string | null | undefined): number | null {
  const text = stripWikiMarkup(value || "");
  const compactMeters = text.match(/(\d)\s*m\s*(\d{2})\b/i);
  if (compactMeters) {
    return normalizeHeightCm(Number(compactMeters[1]) * 100 + Number(compactMeters[2]));
  }
  const meters = text.match(/(\d+(?:\.\d+)?)\s*m\b/i);
  if (meters) return normalizeHeightCm(Math.round(Number(meters[1]) * 100));
  const centimeters = text.match(/(\d+(?:\.\d+)?)\s*cm\b/i);
  if (centimeters) return normalizeHeightCm(Math.round(Number(centimeters[1])));
  const imperial = text.match(/(\d+)\s*ft\s*(\d+)?\s*in/i);
  if (imperial) {
    const feet = Number(imperial[1] || 0);
    const inches = Number(imperial[2] || 0);
    return normalizeHeightCm(Math.round((feet * 12 + inches) * 2.54));
  }
  return null;
}

function parseWeightKg(value: string | null | undefined): number | null {
  const text = stripWikiMarkup(value || "");
  const kg = text.match(/(\d+(?:\.\d+)?)\s*kg\b/i);
  if (kg) return normalizeWeightKg(Math.round(Number(kg[1])));
  const lbs = text.match(/(\d+(?:\.\d+)?)\s*lb/i);
  if (lbs) return normalizeWeightKg(Math.round(Number(lbs[1]) * 0.45359237));
  return null;
}

function normalizeHeightCm(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 140 || rounded > 230) return null;
  return rounded;
}

function normalizeWeightKg(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 45 || rounded > 140) return null;
  return rounded;
}

function parseNumber(value: string | null | undefined): number | null {
  const text = stripWikiMarkup(value || "");
  const match = text.match(/-?\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanListValue(value: string | null | undefined): string | null {
  const clean = stripWikiMarkup(value || "")
    .replace(/\s*\((?:loan|captain|vice-captain|on loan)\)\s*/gi, (match) => match.trim())
    .replace(/\s+/g, " ")
    .trim();
  return clean || null;
}

function parsePositions(value: string | null | undefined): string[] {
  const clean = stripWikiMarkup(value || "");
  if (!clean) return [];
  return [...new Set(
    clean
      .split(/\s*\/\s*|\s*,\s*|\s+and\s+/i)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => titleCase(item)),
  )];
}

function parseTransfermarktPositions(value: string | null | undefined): string[] {
  const clean = normalizeText(value);
  if (!clean) return [];
  const parts = clean
    .split(/\s*-\s*|\s*\/\s*|\s*,\s*/g)
    .map((item) => titleCase(item.trim()))
    .filter(Boolean);
  return [...new Set(parts)];
}

function parseFootedness(value: string | null | undefined): string | null {
  const clean = cleanListValue(value);
  if (!clean) return null;
  const normalized = clean.toLowerCase();
  if (normalized.includes("left")) return "Left";
  if (normalized.includes("right")) return "Right";
  if (normalized.includes("both")) return "Both";
  return titleCase(clean);
}

function stripHtml(value: string): string {
  return decode(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function normalizeForSlug(value: string): string {
  const transliterated = value
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/ł/g, "l")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ñ/g, "n");
  return transliterated
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function buildPlayerSlugVariants(card: JournalistPersonCard): string[] {
  const values = [
    card.displayName,
    card.canonicalName,
    ...card.aliases.all.map((alias) => alias.alias),
  ]
    .map((value) => normalizeText(value))
    .filter((value): value is string => Boolean(value));

  const variants = new Set<string>();
  for (const value of values) {
    const cleaned = value
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b(jr|sr|ii|iii|iv)\.?$/i, "")
      .trim();
    const slug = normalizeForSlug(cleaned);
    if (slug) variants.add(slug);

    const parts = slug.split("-").filter(Boolean);
    if (parts.length > 2) {
      variants.add(`${parts[0]}-${parts[parts.length - 1]}`);
    }
  }

  const specialCases: Record<string, string[]> = {
    "son heungmin": ["son-heung-min", "heung-min-son"],
    "vinicius jr.": ["vinicius-junior", "vini-jr", "vinicius-jr"],
    "vinicius jr": ["vinicius-junior", "vini-jr", "vinicius-jr"],
    "kylian mbappé": ["kylian-mbappe"],
    "ousmane dembélé": ["ousmane-dembele"],
    "aurélien tchouaméni": ["aurelien-tchouameni"],
    "nicolás gonzález": ["nicolas-gonzalez"],
    "joão pedro": ["joao-pedro"],
    "joão neves": ["joao-neves"],
    "diogo dalot": ["diogo-dalot"],
    "gabriel magalhães": ["gabriel-magalhaes"],
    "darwin núñez": ["darwin-nunez"],
  };
  const key = (card.displayName || card.canonicalName || "").toLocaleLowerCase(
    "en-US",
  );
  for (const slug of specialCases[key] || []) variants.add(slug);

  return [...variants].filter(Boolean);
}

function buildPersonNameVariants(card: JournalistPersonCard): string[] {
  const variants = new Set<string>();
  const values = [
    card.displayName,
    card.canonicalName,
    ...card.aliases.all.map((alias) => alias.alias),
  ];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    const cleaned = normalized.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    variants.add(cleaned);
    variants.add(
      cleaned
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  return [...variants];
}

function normalizePersonName(value: string | null | undefined): string {
  const clean = normalizeText(value) || "";
  const reordered = clean.includes(",")
    ? clean
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .reverse()
        .join(" ")
    : clean;
  return normalizeMatch(reordered);
}

function htmlLikelyMatchesPlayer(html: string, card: JournalistPersonCard): boolean {
  const text = stripHtml(html).toLocaleLowerCase("en-US");
  const names = [
    card.displayName,
    card.canonicalName,
    ...card.aliases.all.map((alias) => alias.alias),
  ]
    .map((value) => normalizeText(value)?.toLocaleLowerCase("en-US"))
    .filter((value): value is string => Boolean(value));

  for (const name of names) {
    if (text.includes(name)) return true;
    const tokens = name
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9]/g, ""))
      .filter((token) => token.length >= 3);
    if (tokens.length >= 2 && tokens.every((token) => text.includes(token))) {
      return true;
    }
  }
  return false;
}

function normalizeHtmlField(value: string | null | undefined): string | null {
  const clean = stripHtml(value || "").replace(/\s+/g, " ").trim();
  return clean || null;
}

function extractTransfermarktDataHeaderValue(
  html: string,
  label: string,
): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(
      `<li[^>]*class=["'][^"']*data-header__label[^"']*["'][^>]*>\\s*${escaped}:\\s*<span[^>]*class=["'][^"']*data-header__content[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>`,
      "i",
    ),
  );
  return normalizeHtmlField(match?.[1]);
}

function extractTransfermarktInfoTableValue(
  html: string,
  label: string,
): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(
      `<span[^>]*class=["'][^"']*info-table__content[^"']*info-table__content--regular[^"']*["'][^>]*>\\s*${escaped}:?\\s*<\\/span>\\s*<span[^>]*class=["'][^"']*info-table__content[^"']*info-table__content--bold[^"']*["'][^>]*>([\\s\\S]*?)(?=<\\/span>\\s*<span[^>]*class=["'][^"']*info-table__content[^"']*info-table__content--regular|<\\/span>\\s*<\\/div>|<\\/span>\\s*<span|$)`,
      "i",
    ),
  );
  return normalizeHtmlField(match?.[1]);
}

function parseTransfermarktProfileFacts(
  sourceUrl: string,
  html: string,
): TransfermarktProfileFacts {
  const height = extractTransfermarktDataHeaderValue(html, "Height");
  const headerPosition = extractTransfermarktDataHeaderValue(html, "Position");
  const tablePosition = extractTransfermarktInfoTableValue(html, "Position");
  const foot = extractTransfermarktInfoTableValue(html, "Foot");
  const currentClub = extractTransfermarktInfoTableValue(html, "Current club");

  return {
    sourceUrl,
    heightCm: parseHeightCm(height),
    footedness: parseFootedness(foot),
    positions: parseTransfermarktPositions(tablePosition || headerPosition),
    currentClub,
    clubNumber: null,
  };
}

function looksLikeBlockedHtml(html: string): boolean {
  const head = html.slice(0, 8000);
  return /just a moment|verify you are human|checking your browser|cf-chl|__cf_chl|challenge-platform/i.test(
    head,
  );
}

function extractHtmlMetaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const propertyMatch = html.match(
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
  );
  if (propertyMatch?.[1]) return decode(propertyMatch[1]).trim();
  const contentFirstMatch = html.match(
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  );
  return contentFirstMatch?.[1] ? decode(contentFirstMatch[1]).trim() : null;
}

function parseFbrefProfileFacts(sourceUrl: string, html: string): FbrefProfileFacts {
  const blocked = looksLikeBlockedHtml(html);
  const text = stripHtml(html);
  const positionRaw =
    text.match(/Position:\s*([^▪]+?)(?:\s+Footed:|\s+Club:|\s+National Team:|$)/i)
      ?.[1] || null;
  const footedness =
    parseFootedness(text.match(/Footed:\s*([A-Za-z]+)/i)?.[1]) ||
    parseFootedness(text.match(/Shoots:\s*([A-Za-z]+)/i)?.[1]);
  const currentClub =
    normalizeText(text.match(/Club:\s*([^▪]+?)(?:\s+Wages:|\s+National Team:|$)/i)?.[1]) ||
    null;
  const lastSeason =
    [...html.matchAll(/data-stat=["']year_id["'][^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
      .map((match) => normalizeHtmlField(match[1]))
      .filter((value): value is string => Boolean(value))
      .reverse()
      .find((value) => /\d{4}/.test(value)) || null;
  const competitions = [
    ...new Set(
      [...html.matchAll(/data-stat=["']comp_level["'][^>]*>([\s\S]*?)<\/td>/gi)]
        .map((match) => normalizeHtmlField(match[1]))
        .filter((value): value is string => Boolean(value))
        .slice(0, 20),
    ),
  ];

  return {
    sourceUrl,
    blocked,
    heightCm: parseHeightCm(text.match(/\b\d{2,3}\s*cm\b/i)?.[0]),
    weightKg: parseWeightKg(
      text.match(/\b\d{2,3}\s*kg\b/i)?.[0] ||
        text.match(/\b\d{2,3}\s*lb\b/i)?.[0],
    ),
    footedness,
    positions: parseTransfermarktPositions(positionRaw),
    currentClub,
    statProfile: {
      standardTableFound: /id=["']stats_standard/i.test(html),
      lastSeason,
      competitions,
    },
  };
}

async function fetchFbrefFacts(
  sourceUrl: string | null | undefined,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<FbrefProfileFacts | null> {
  const url = normalizeText(sourceUrl);
  if (!url) return null;
  try {
    const html = await fetchText(url, cache, cachePath);
    return parseFbrefProfileFacts(url, html);
  } catch {
    return null;
  }
}

function buildSoccerwayProfileUrl(sourceUrl: string | null | undefined): string | null {
  const url = normalizeText(sourceUrl);
  if (!url) return null;
  const idMatch = url.match(/\/(?:players|player)\/(?:-|[^/]+)\/([0-9]+)\//i);
  if (idMatch?.[1]) return `https://www.soccerway.com/players/-/${idMatch[1]}/`;
  if (url.includes("scorebar.com")) return null;
  return url;
}

function normalizeSourceLadderUrls(sourceLadder: SourceLadderUrls): SourceLadderUrls {
  const soccerwayUrl = buildSoccerwayProfileUrl(sourceLadder.soccerway);
  return {
    ...sourceLadder,
    ...(soccerwayUrl ? { soccerway: soccerwayUrl } : {}),
  };
}

function parseSoccerwayProfileFacts(
  sourceUrl: string,
  finalUrl: string | null,
  html: string,
): SoccerwayProfileFacts {
  const title = normalizeHtmlField(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const description =
    extractHtmlMetaContent(html, "description") ||
    extractHtmlMetaContent(html, "og:description");
  const currentClub =
    normalizeText(description?.match(/\(([^()]+)\)\s+on\s+Soccerway/i)?.[1]) ||
    null;
  return {
    sourceUrl,
    finalUrl,
    profileTitle: title,
    currentClub,
    sourceAccessible: !looksLikeBlockedHtml(html),
    exposesStaticCareerData: /<td[^>]+class=["'][^"']*season[^"']*["']/i.test(html),
  };
}

async function fetchSoccerwayFacts(
  sourceUrl: string | null | undefined,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<SoccerwayProfileFacts | null> {
  const url = buildSoccerwayProfileUrl(sourceUrl);
  if (!url) return null;
  try {
    const html = await fetchText(url, cache, cachePath);
    const finalUrl =
      extractHtmlMetaContent(html, "og:url") ||
      html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ||
      url;
    return parseSoccerwayProfileFacts(url, finalUrl, html);
  } catch {
    return null;
  }
}

function parseDmyDate(value: string | null | undefined): string | null {
  const match = normalizeText(value)?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function extractFootballDatabaseField(html: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(
      `<span[^>]*class=["']title["'][^>]*>\\s*${escaped}\\s*:?\\s*(?:&nbsp;?\\s*)*<\\/span>\\s*([\\s\\S]*?)(?=<\\/div>)`,
      "i",
    ),
  );
  return normalizeHtmlField(match?.[1]);
}

function parseFootballDatabasePositions(html: string): string[] {
  const table = html.match(/<table[^>]*class=["']positions["'][^>]*>([\s\S]*?)<\/table>/i)
    ?.[1];
  if (!table) return [];
  return [
    ...new Set(
      [...table.matchAll(/<tr[^>]*class=["'](?:mainposition|otherpositions)["'][^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)]
        .map((match) => normalizeHtmlField(match[1]))
        .filter((value): value is string => Boolean(value))
        .map((value) => titleCase(value)),
    ),
  ];
}

function parseFootballDatabaseClubHistory(
  html: string,
  currentClub: string | null,
): InfoboxClubHistoryItem[] {
  const rows = html.match(/<tr[^>]*class=["'][^"']*\bline\b[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi) || [];
  const byClub = new Map<
    string,
    { club: string; startDate: string | null; endDate: string | null; seasons: string[] }
  >();

  for (const row of rows) {
    const season = normalizeHtmlField(
      row.match(/<td[^>]*class=["'][^"']*\bseason\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1],
    );
    const clubCell = row.match(/<td[^>]*class=["'][^"']*\bclub\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)
      ?.[1];
    if (!clubCell) continue;
    const club =
      normalizeHtmlField(clubCell.match(/<abbr[^>]*title=["']([^"']+)["'][^>]*>/i)?.[1]) ||
      normalizeHtmlField(clubCell.match(/<a[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
    if (!club || /\b(united states|england|france|brazil|argentina|spain|germany|italy)\b/i.test(club)) {
      continue;
    }
    const dateMatches = [...row.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map((match) => match[1]!);
    if (!dateMatches.length) continue;
    const key = normalizeMatch(club);
    const existing = byClub.get(key) || {
      club,
      startDate: null,
      endDate: null,
      seasons: [],
    };
    if (dateMatches[0]) {
      existing.startDate =
        !existing.startDate || dateMatches[0] < existing.startDate
          ? dateMatches[0]
          : existing.startDate;
    }
    if (dateMatches[1]) {
      existing.endDate =
        !existing.endDate || dateMatches[1] > existing.endDate
          ? dateMatches[1]
          : existing.endDate;
    }
    if (season && !existing.seasons.includes(season)) existing.seasons.push(season);
    byClub.set(key, existing);
  }

  return [...byClub.values()]
    .map((item) => ({
      club: item.club,
      startDate: item.startDate || item.seasons.sort()[0] || null,
      endDate:
        normalizeMatch(item.club) === normalizeMatch(currentClub)
          ? null
          : item.endDate || item.seasons.sort().at(-1) || null,
      isCurrent: normalizeMatch(item.club) === normalizeMatch(currentClub),
    }))
    .sort((left, right) => (left.startDate || "").localeCompare(right.startDate || ""));
}

function parseFootballDatabaseFacts(
  sourceUrl: string,
  html: string,
): FootballDatabaseProfileFacts {
  const currentClub =
    normalizeHtmlField(
      html.match(/<div[^>]*class=["']clublogo["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)
        ?.[1],
    ) || null;
  const capsText = extractFootballDatabaseField(html, "Number of international caps");
  const capsMatch = capsText?.match(/(\d+)(?:\s*\((\d+)\s+goals?\))?/i) || null;
  const firstCap = extractFootballDatabaseField(html, "First cap");

  return {
    sourceUrl,
    currentClub,
    heightCm: parseHeightCm(extractFootballDatabaseField(html, "Height")),
    weightKg: parseWeightKg(extractFootballDatabaseField(html, "Weight")),
    footedness: parseFootedness(extractFootballDatabaseField(html, "Best foot")),
    positions: parseFootballDatabasePositions(html),
    internationalCaps: capsMatch ? Number(capsMatch[1]) : null,
    internationalGoals: capsMatch?.[2] ? Number(capsMatch[2]) : null,
    firstCapOpponent:
      normalizeText(firstCap?.replace(/\d{2}\/\d{2}\/\d{4}/, "")) || null,
    firstCapDate: parseDmyDate(firstCap),
    clubHistory: parseFootballDatabaseClubHistory(html, currentClub),
    statProfile: {
      careerRows: (html.match(/<tr[^>]*class=["'][^"']*\bline\b[^"']*["'][^>]*>/gi) || [])
        .length,
      latestSeason:
        [...html.matchAll(/<td[^>]*class=["'][^"']*\bseason\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi)]
          .map((match) => normalizeHtmlField(match[1]))
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) || null,
    },
  };
}

function hasMeaningfulFootballDatabaseFacts(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const facts = value as Record<string, unknown>;
  return Boolean(
    normalizeText(facts.currentClub as string | null) ||
      (typeof facts.heightCm === "number" && Number.isFinite(facts.heightCm)) ||
      (typeof facts.weightKg === "number" && Number.isFinite(facts.weightKg)) ||
      normalizeText(facts.footedness as string | null) ||
      (Array.isArray(facts.positions) && facts.positions.length > 0) ||
      (typeof facts.internationalCaps === "number" &&
        Number.isFinite(facts.internationalCaps)) ||
      normalizeText(facts.firstCapDate as string | null) ||
      (Array.isArray(facts.clubHistory) && facts.clubHistory.length > 0),
  );
}

async function fetchFootballDatabaseFacts(
  sourceUrl: string | null | undefined,
  cache: Map<string, unknown>,
  cachePath: string,
  options: { onlyCached?: boolean } = {},
): Promise<FootballDatabaseProfileFacts | null> {
  const url = normalizeText(sourceUrl);
  if (!url) return null;
  if (options.onlyCached && !cache.has(url)) return null;
  try {
    const html = await fetchText(url, cache, cachePath);
    if (looksLikeBlockedHtml(html)) return null;
    const facts = parseFootballDatabaseFacts(url, html);
    return hasMeaningfulFootballDatabaseFacts(facts) ? facts : null;
  } catch {
    return null;
  }
}

function mapPositionGroup(positions: string[]): string | null {
  const primary = (positions[0] || "").toLowerCase();
  if (!primary) return null;
  if (/(keeper|goalkeeper)/.test(primary)) return "Goalkeeper";
  if (/(back|defender|sweeper|wing-back)/.test(primary)) return "Defender";
  if (/(midfielder|midfield)/.test(primary)) return "Midfielder";
  if (/(forward|striker|winger|attacker|attack)/.test(primary)) return "Forward";
  return titleCase(positions[0]!);
}

function parseYearRange(value: string | null | undefined): {
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
} {
  const clean = stripWikiMarkup(value || "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "")
    .trim();
  if (!clean) {
    return { startDate: null, endDate: null, isCurrent: false };
  }
  const season = clean.match(/^(\d{4})(?:-(\d{2,4})?)?$/);
  if (season) {
    const start = season[1] || null;
    const rawEnd = season[2] || null;
    if (!rawEnd) return { startDate: start, endDate: null, isCurrent: true };
    const endDate =
      rawEnd.length === 2 && start
        ? `${start.slice(0, 2)}${rawEnd}`
        : rawEnd;
    return { startDate: start, endDate, isCurrent: false };
  }
  const present = clean.match(/^(\d{4})-(?:present)?$/i);
  if (present) {
    return { startDate: present[1] || null, endDate: null, isCurrent: true };
  }
  const explicit = clean.match(/^(\d{4})-(\d{4})$/);
  if (explicit) {
    return {
      startDate: explicit[1] || null,
      endDate: explicit[2] || null,
      isCurrent: false,
    };
  }
  return { startDate: null, endDate: null, isCurrent: false };
}

function extractInfoboxFieldMap(wikitext: string): Map<string, string> {
  const lines = wikitext.split("\n");
  let startIndex = lines.findIndex((line) =>
    /\{\{\s*Infobox football biography/i.test(line),
  );
  if (startIndex < 0) {
    startIndex = lines.findIndex((line) =>
      /\{\{\s*Infobox footballer/i.test(line),
    );
  }
  if (startIndex < 0) return new Map();

  const fieldMap = new Map<string, string>();
  let depth = 0;
  let started = false;
  let currentKey: string | null = null;
  let buffer: string[] = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] || "";
    if (!started) {
      started = true;
      depth += countToken(line, "{{") - countToken(line, "}}");
      continue;
    }

    const fieldMatch = line.match(/^\|\s*([^=]+?)\s*=\s*(.*)$/);
    if (fieldMatch) {
      if (currentKey) {
        fieldMap.set(currentKey, buffer.join("\n").trim());
      }
      currentKey = fieldMatch[1]!.trim().toLowerCase();
      buffer = [fieldMatch[2] || ""];
    } else if (currentKey) {
      buffer.push(line);
    }

    depth += countToken(line, "{{") - countToken(line, "}}");
    if (depth <= 0) {
      if (currentKey) {
        fieldMap.set(currentKey, buffer.join("\n").trim());
      }
      break;
    }
  }

  return fieldMap;
}

function parseInfobox(wikitext: string): ParsedFootballInfobox {
  const fieldMap = extractInfoboxFieldMap(wikitext);
  const youthEntries: Array<{ index: number; club: string }> = [];
  const clubEntries: Array<
    InfoboxClubHistoryItem & {
      index: number;
    }
  > = [];

  for (const [key, value] of fieldMap.entries()) {
    const youthMatch = key.match(/^youthclubs(\d+)$/);
    if (youthMatch) {
      const club = cleanListValue(value);
      if (club) {
        youthEntries.push({ index: Number(youthMatch[1]), club });
      }
      continue;
    }

    const clubMatch = key.match(/^clubs(\d+)$/);
    if (clubMatch) {
      const index = Number(clubMatch[1]);
      const club = cleanListValue(value);
      if (!club) continue;
      const years = parseYearRange(fieldMap.get(`years${index}`));
      clubEntries.push({
        index,
        club,
        startDate: years.startDate,
        endDate: years.endDate,
        isCurrent: years.isCurrent,
      });
    }
  }

  const positions = parsePositions(fieldMap.get("position"));
  return {
    fullName:
      cleanListValue(fieldMap.get("full_name")) ||
      cleanListValue(fieldMap.get("fullname")) ||
      null,
    birthDate: parseDateTemplate(fieldMap.get("birth_date")),
    birthPlace: cleanListValue(fieldMap.get("birth_place")),
    heightCm: parseHeightCm(fieldMap.get("height")),
    weightKg: parseWeightKg(fieldMap.get("weight")),
    footedness:
      parseFootedness(fieldMap.get("foot")) ||
      parseFootedness(fieldMap.get("footedness")),
    currentClub: cleanListValue(fieldMap.get("currentclub")),
    clubNumber: parseNumber(fieldMap.get("clubnumber")),
    positions,
    youthClubs: youthEntries
      .sort((left, right) => left.index - right.index)
      .map((item) => item.club),
    clubHistory: clubEntries
      .sort((left, right) => left.index - right.index)
      .map(({ index: _index, ...item }) => item),
  };
}

async function readJsonCache(cachePath: string): Promise<Map<string, unknown>> {
  try {
    const raw = await fs.readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

async function writeJsonCache(
  cachePath: string,
  cache: Map<string, unknown>,
): Promise<void> {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(
    cachePath,
    `${JSON.stringify(Object.fromEntries(cache), null, 2)}\n`,
    "utf8",
  );
}

let cacheMutationsSinceFlush = 0;

async function noteCacheMutation(
  cachePath: string,
  cache: Map<string, unknown>,
): Promise<void> {
  cacheMutationsSinceFlush += 1;
  if (cacheMutationsSinceFlush < CACHE_FLUSH_EVERY_MUTATIONS) return;
  await writeJsonCache(cachePath, cache);
  cacheMutationsSinceFlush = 0;
}

async function flushJsonCacheIfDirty(
  cachePath: string,
  cache: Map<string, unknown>,
): Promise<void> {
  if (cacheMutationsSinceFlush <= 0) return;
  await writeJsonCache(cachePath, cache);
  cacheMutationsSinceFlush = 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const lastDomainRequestAt = new Map<string, number>();

async function throttleRequestForUrl(url: string): Promise<void> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return;
  }
  const minIntervalMs = DOMAIN_THROTTLE_MS[hostname];
  if (!minIntervalMs) return;
  const lastAt = lastDomainRequestAt.get(hostname) || 0;
  const waitMs = lastAt + minIntervalMs - Date.now();
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastDomainRequestAt.set(hostname, Date.now());
}

function resolveFetchTimeoutMs(url: string, fallback: number): number {
  try {
    const hostname = new URL(url).hostname;
    return DOMAIN_FETCH_TIMEOUT_MS[hostname] || fallback;
  } catch {
    return fallback;
  }
}

async function fetchJson<T>(
  url: string,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<T> {
  if (cache.has(url)) return cache.get(url) as T;
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    const response = await fetchWithTimeout(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json",
      },
    }, resolveFetchTimeoutMs(url, FETCH_TIMEOUT_MS));
    if (response.ok) {
      const payload = (await response.json()) as T;
      cache.set(url, payload);
      await noteCacheMutation(cachePath, cache);
      return payload;
    }
    if (response.status === 429 && attempt < MAX_FETCH_ATTEMPTS) {
      const retryAfter = Number(response.headers.get("retry-after") || "");
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : DEFAULT_RETRY_MS * attempt;
      await sleep(delayMs);
      continue;
    }
    throw new Error(`Request failed ${response.status} for ${url}`);
  }
  throw new Error(`Request failed after retries for ${url}`);
}

async function fetchText(
  url: string,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<string> {
  if (cache.has(url)) return String(cache.get(url));
  await throttleRequestForUrl(url);
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    const response = await fetchWithTimeout(url, {
      headers: {
        "user-agent": HTML_USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    }, resolveFetchTimeoutMs(url, FETCH_TIMEOUT_MS));
    if (response.ok) {
      const payload = await response.text();
      cache.set(url, payload);
      await noteCacheMutation(cachePath, cache);
      return payload;
    }
    if (response.status === 429 && attempt < MAX_FETCH_ATTEMPTS) {
      const retryAfter = Number(response.headers.get("retry-after") || "");
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : DEFAULT_RETRY_MS * attempt;
      await sleep(delayMs);
      continue;
    }
    throw new Error(`Request failed ${response.status} for ${url}`);
  }
  throw new Error(`Request failed after retries for ${url}`);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function probeHtmlUrl(
  url: string,
): Promise<{ ok: boolean; status: number; finalUrl: string | null }> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        redirect: "follow",
        headers: {
          "user-agent": HTML_USER_AGENT,
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      },
      8000,
    );
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url || url,
    };
  } catch {
    return { ok: false, status: 0, finalUrl: null };
  }
}

async function searchWikidataEntities(
  query: string,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<WikidataSearchResult[]> {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("type", "item");
  url.searchParams.set("limit", "5");
  url.searchParams.set("search", query);
  const payload = await fetchJson<{ search?: WikidataSearchResult[] }>(
    url.toString(),
    cache,
    cachePath,
  );
  return payload.search || [];
}

function readEntityClaimArray(
  entity: WikidataEntity,
  propertyId: string,
): unknown[] {
  return entity.claims[propertyId] || [];
}

function extractClaimSnakValue(claim: unknown): unknown {
  const dataValue = (claim as {
    mainsnak?: { datavalue?: { value?: unknown } };
  })?.mainsnak?.datavalue?.value;
  return dataValue ?? null;
}

async function fetchWikidataEntity(
  qid: string,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<WikidataEntity> {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  const payload = await fetchJson<{
    entities?: Record<
      string,
      {
        id?: string;
        labels?: Record<string, { value?: string }>;
        descriptions?: Record<string, { value?: string }>;
        sitelinks?: Record<string, { title?: string }>;
        claims?: Record<string, unknown[]>;
      }
    >;
  }>(url, cache, cachePath);
  const raw = payload.entities?.[qid];
  if (!raw) throw new Error(`Wikidata entity ${qid} not found`);
  return {
    id: raw.id || qid,
    labels: Object.fromEntries(
      Object.entries(raw.labels || {}).map(([key, value]) => [key, value.value || ""]),
    ),
    descriptions: Object.fromEntries(
      Object.entries(raw.descriptions || {}).map(([key, value]) => [
        key,
        value.value || "",
      ]),
    ),
    sitelinks: Object.fromEntries(
      Object.entries(raw.sitelinks || {}).map(([key, value]) => [
        key,
        value.title || "",
      ]),
    ),
    claims: raw.claims || {},
  };
}

function extractTimeClaim(entity: WikidataEntity, propertyId: string): string | null {
  const claim = readEntityClaimArray(entity, propertyId)[0];
  const value = extractClaimSnakValue(claim) as { time?: string } | null;
  if (!value?.time) return null;
  const match = value.time.match(/[+-](\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function extractQuantityClaim(
  entity: WikidataEntity,
  propertyId: string,
): number | null {
  const claim = readEntityClaimArray(entity, propertyId)[0];
  const value = extractClaimSnakValue(claim) as { amount?: string } | null;
  if (!value?.amount) return null;
  const numeric = Number(value.amount);
  return Number.isFinite(numeric) ? numeric : null;
}

function extractStringClaim(entity: WikidataEntity, propertyId: string): string | null {
  const claim = readEntityClaimArray(entity, propertyId)[0];
  const value = extractClaimSnakValue(claim);
  return typeof value === "string" ? value : null;
}

function extractExternalIdClaim(
  entity: WikidataEntity,
  propertyId: string,
): string | null {
  return extractStringClaim(entity, propertyId);
}

function buildFormatterUrl(formatterUrl: string, value: string): string {
  return formatterUrl.replace("$1", encodeURIComponent(value));
}

function buildExternalSourceUrls(entity: WikidataEntity): {
  sourceLadder: SourceLadderUrls;
  externalIds: Record<string, string>;
} {
  const sourceLadder: SourceLadderUrls = {};
  const externalIds: Record<string, string> = {};

  for (const formatter of EXTERNAL_SOURCE_FORMATTERS) {
    const externalId = extractExternalIdClaim(entity, formatter.propertyId);
    if (!externalId) continue;
    externalIds[formatter.key] = externalId;
    sourceLadder[formatter.key] = buildFormatterUrl(
      formatter.formatterUrl,
      externalId,
    );
  }

  return { sourceLadder, externalIds };
}

function extractItemIds(entity: WikidataEntity, propertyId: string): string[] {
  return readEntityClaimArray(entity, propertyId)
    .map((claim) => extractClaimSnakValue(claim) as { id?: string } | null)
    .map((value) => value?.id || null)
    .filter((value): value is string => Boolean(value));
}

function extractBestCurrentClubClaim(entity: WikidataEntity): string | null {
  const claims = readEntityClaimArray(entity, "P54");
  let bestId: string | null = null;
  let bestScore = -1;

  for (const claim of claims) {
    const target = extractClaimSnakValue(claim) as { id?: string } | null;
    const id = target?.id || null;
    if (!id) continue;
    const qualifiers = (claim as { qualifiers?: Record<string, Array<{ datavalue?: { value?: unknown } }>> })
      ?.qualifiers;
    const endQualifier = qualifiers?.P582?.[0]?.datavalue?.value as
      | { time?: string }
      | undefined;
    const startQualifier = qualifiers?.P580?.[0]?.datavalue?.value as
      | { time?: string }
      | undefined;

    let score = 0;
    if (!endQualifier?.time) score += 100;
    if (startQualifier?.time) {
      const yearMatch = startQualifier.time.match(/[+-](\d{4})-/);
      if (yearMatch) score += Number(yearMatch[1]);
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }

  return bestId;
}

async function resolveItemLabels(
  ids: string[],
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<string[]> {
  const labels: string[] = [];
  for (const id of ids) {
    try {
      const entity = await fetchWikidataEntity(id, cache, cachePath);
      const label =
        entity.labels.en ||
        entity.labels.es ||
        entity.labels.fr ||
        entity.labels.de ||
        entity.labels.it ||
        Object.values(entity.labels)[0] ||
        null;
      if (label) labels.push(label);
    } catch {
      continue;
    }
  }
  return [...new Set(labels.filter(Boolean))];
}

function extractBirthYear(value: string | null | undefined): string | null {
  const clean = normalizeText(value);
  if (!clean) return null;
  const match = clean.match(/^(\d{4})/);
  return match?.[1] || null;
}

function namesLikelyVariant(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const leftName = normalizePersonName(left);
  const rightName = normalizePersonName(right);
  if (!leftName || !rightName) return false;
  if (leftName === rightName) return true;

  const leftTokens = leftName.split(/\s+/).filter(Boolean);
  const rightTokens = rightName.split(/\s+/).filter(Boolean);
  if (!leftTokens.length || !rightTokens.length) return false;

  const leftSurname = leftTokens[leftTokens.length - 1] || "";
  const rightSurname = rightTokens[rightTokens.length - 1] || "";
  const leftFirst = leftTokens[0] || "";
  const rightFirst = rightTokens[0] || "";

  if (leftSurname !== rightSurname) return false;
  if (leftFirst === rightFirst) return true;
  if (
    leftFirst.length >= 3 &&
    rightFirst.length >= 3 &&
    (leftFirst.startsWith(rightFirst) || rightFirst.startsWith(leftFirst))
  ) {
    return true;
  }
  return false;
}

function buildEntitySearchQueries(card: JournalistPersonCard): string[] {
  const names = buildPersonNameVariants(card).slice(0, 3);
  const queries = new Set<string>();
  const birthYear = isPlausiblePlayerBirthDate(card.birthDate)
    ? extractBirthYear(card.birthDate)
    : null;
  const nationality = normalizeText(card.primaryNationality);
  const currentClub = normalizeText(card.currentClub);
  const positionGroup = normalizeText(card.role.positionGroup);
  const roleKeyword =
    positionGroup?.toLocaleLowerCase("en-US") === "goalkeeper"
      ? "goalkeeper"
      : "soccer";

  for (const name of names) {
    queries.add(name);
    queries.add(`${name} footballer`);
    queries.add(`${name} ${roleKeyword}`);
    if (birthYear) queries.add(`${name} ${roleKeyword} ${birthYear}`);
    if (nationality) queries.add(`${name} ${nationality} ${roleKeyword}`);
    if (nationality && birthYear) {
      queries.add(`${name} ${nationality} ${roleKeyword} ${birthYear}`);
    }
    if (currentClub) queries.add(`${name} ${currentClub}`);
  }

  return [...queries]
    .map((value) => normalizeText(value))
    .filter((value): value is string => Boolean(value))
    .slice(0, 10);
}

function buildWikipediaTitleCandidates(card: JournalistPersonCard): string[] {
  const birthYear = isPlausiblePlayerBirthDate(card.birthDate)
    ? extractBirthYear(card.birthDate)
    : null;
  if (!birthYear) return [];

  const candidates = new Set<string>();
  for (const name of buildPersonNameVariants(card).slice(0, 3)) {
    candidates.add(`${name} (footballer, born ${birthYear})`);
    candidates.add(`${name} (soccer, born ${birthYear})`);
  }

  return [...candidates];
}

async function searchWikipediaTitles(
  query: string,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<WikipediaSearchResult[]> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("format", "json");
  url.searchParams.set("srlimit", "5");
  url.searchParams.set("srsearch", query);
  const payload = await fetchJson<{
    query?: { search?: WikipediaSearchResult[] };
  }>(url.toString(), cache, cachePath);
  return payload.query?.search || [];
}

function candidateMethodPriority(method: string): number {
  if (method === "wikipedia_title_candidate") return 3;
  if (method === "wikipedia_search") return 2;
  return 1;
}

function appendResolvedCandidate(
  next: Map<string, ResolvedWikidataCandidate>,
  candidate: ResolvedWikidataCandidate,
): void {
  const existing = next.get(candidate.entity.id);
  if (!existing) {
    next.set(candidate.entity.id, candidate);
    return;
  }
  if (
    candidateMethodPriority(candidate.resolutionMethod) >
    candidateMethodPriority(existing.resolutionMethod)
  ) {
    next.set(candidate.entity.id, candidate);
  }
}

async function buildResolvedCandidateFromWikipediaTitle(
  title: string,
  resolutionMethod: string,
  originatingQuery: string | null,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<ResolvedWikidataCandidate | null> {
  const summary = await fetchWikipediaSummary(title, cache, cachePath);
  const qid = normalizeText(summary?.wikibaseItem);
  if (!qid) return null;
  const entity = await fetchWikidataEntity(qid, cache, cachePath);
  return {
    entity,
    resolutionMethod,
    wikipediaTitle: normalizeText(summary?.pageTitle) || normalizeText(title),
    originatingQuery,
  };
}

async function collectResolvedCandidatesFromWikidataSearch(
  card: JournalistPersonCard,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<{
  candidates: ResolvedWikidataCandidate[];
  queriesUsed: string[];
}> {
  const queriesUsed: string[] = [];
  const next = new Map<string, ResolvedWikidataCandidate>();

  for (const query of buildEntitySearchQueries(card).slice(0, 4)) {
    queriesUsed.push(query);
    const results = await searchWikidataEntities(query, cache, cachePath);
    for (const result of results.slice(0, 3)) {
      if (!result.id) continue;
      const entity = await fetchWikidataEntity(result.id, cache, cachePath);
      appendResolvedCandidate(next, {
        entity,
        resolutionMethod: "wikidata_search",
        wikipediaTitle: normalizeText(entity.sitelinks.enwiki),
        originatingQuery: query,
      });
    }
  }

  return {
    candidates: [...next.values()],
    queriesUsed,
  };
}

async function collectResolvedCandidatesFromWikipediaSearch(
  card: JournalistPersonCard,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<{
  candidates: ResolvedWikidataCandidate[];
  queriesUsed: string[];
}> {
  const queriesUsed: string[] = [];
  const next = new Map<string, ResolvedWikidataCandidate>();

  for (const query of buildEntitySearchQueries(card).slice(0, 6)) {
    queriesUsed.push(query);
    const results = await searchWikipediaTitles(query, cache, cachePath);
    for (const result of results.slice(0, 3)) {
      const title = normalizeText(result.title);
      if (!title) continue;
      const resolved = await buildResolvedCandidateFromWikipediaTitle(
        title,
        "wikipedia_search",
        query,
        cache,
        cachePath,
      );
      if (resolved) appendResolvedCandidate(next, resolved);
    }
  }

  for (const title of buildWikipediaTitleCandidates(card)) {
    const resolved = await buildResolvedCandidateFromWikipediaTitle(
      title,
      "wikipedia_title_candidate",
      title,
      cache,
      cachePath,
    );
    if (resolved) appendResolvedCandidate(next, resolved);
  }

  return {
    candidates: [...next.values()],
    queriesUsed,
  };
}

async function scoreResolvedWikidataCandidate(
  card: JournalistPersonCard,
  candidate: ResolvedWikidataCandidate,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<{ score: number; matchedSignals: string[] }> {
  const matchedSignals: string[] = [];
  let score = 0;

  const targetNames = buildPersonNameVariants(card)
    .map((value) => normalizeText(value))
    .filter((value): value is string => Boolean(value));
  const targetBirthDate = isPlausiblePlayerBirthDate(card.birthDate)
    ? normalizeText(card.birthDate)
    : null;
  const targetBirthYear = extractBirthYear(targetBirthDate);
  const targetNationality =
    normalizeMatch(card.primaryNationality) || normalizeMatch(card.primaryNationality);
  const teamNationality = normalizeMatch(card.primaryNationality || "");
  const targetCurrentClub = normalizeMatch(card.currentClub);
  const targetPositionGroup = normalizeText(card.role.positionGroup);

  const label =
    normalizeText(candidate.entity.labels.en) ||
    normalizeText(Object.values(candidate.entity.labels)[0]) ||
    null;
  const wikipediaTitle =
    normalizeText(candidate.wikipediaTitle) ||
    normalizeText(candidate.entity.sitelinks.enwiki);
  const description =
    normalizeText(candidate.entity.descriptions.en) ||
    normalizeText(Object.values(candidate.entity.descriptions)[0]) ||
    null;

  for (const targetName of targetNames) {
    if (normalizePersonName(label) === normalizePersonName(targetName)) {
      score += 140;
      matchedSignals.push("exact_label");
      break;
    }
    if (normalizePersonName(wikipediaTitle) === normalizePersonName(targetName)) {
      score += 120;
      matchedSignals.push("exact_wikipedia_title");
      break;
    }
    if (
      namesLikelyVariant(label, targetName) ||
      namesLikelyVariant(wikipediaTitle, targetName)
    ) {
      score += 72;
      matchedSignals.push("name_variant_match");
      break;
    }
    const normalizedTargetName = normalizePersonName(targetName);
    const normalizedLabel = normalizePersonName(label);
    const normalizedWikipediaTitle = normalizePersonName(wikipediaTitle);
    if (
      normalizedTargetName &&
      ((normalizedLabel && normalizedLabel.includes(normalizedTargetName)) ||
        (normalizedWikipediaTitle &&
          normalizedWikipediaTitle.includes(normalizedTargetName)))
    ) {
      score += 38;
      matchedSignals.push("partial_name_match");
      break;
    }
  }

  if (description && /\bfootball|soccer|goalkeeper|midfielder|defender|forward\b/i.test(description)) {
    score += 28;
    matchedSignals.push("football_description");
  } else {
    score -= 36;
  }

  const candidateBirthDate = extractTimeClaim(candidate.entity, "P569");
  if (targetBirthDate && candidateBirthDate) {
    if (candidateBirthDate === targetBirthDate) {
      score += 180;
      matchedSignals.push("exact_birth_date");
    } else if (targetBirthYear && candidateBirthDate.startsWith(targetBirthYear)) {
      score += 70;
      matchedSignals.push("birth_year_match");
    } else {
      score -= 170;
      matchedSignals.push("birth_date_mismatch");
    }
  } else if (targetBirthYear && candidateBirthDate) {
    if (candidateBirthDate.startsWith(targetBirthYear)) {
      score += 64;
      matchedSignals.push("birth_year_match");
    } else {
      score -= 140;
      matchedSignals.push("birth_year_mismatch");
    }
  }

  if (targetBirthYear && wikipediaTitle) {
    const titleBirthYear = extractBirthYear(
      wikipediaTitle.match(/born[ _](\d{4})/i)?.[1] || null,
    );
    if (titleBirthYear && titleBirthYear === targetBirthYear) {
      score += 32;
      matchedSignals.push("wikipedia_title_birth_year");
    } else if (titleBirthYear && titleBirthYear !== targetBirthYear) {
      score -= 96;
      matchedSignals.push("wikipedia_title_birth_year_mismatch");
    }
  }

  const citizenshipIds = extractItemIds(candidate.entity, "P27");
  const citizenshipLabels = await resolveItemLabels(citizenshipIds, cache, cachePath);
  if (targetNationality || teamNationality) {
    const matchesNationality = citizenshipLabels.some((value) => {
      const normalized = normalizeMatch(value);
      return normalized === targetNationality || normalized === teamNationality;
    });
    if (matchesNationality) {
      score += 42;
      matchedSignals.push("nationality_match");
    } else if (citizenshipLabels.length) {
      score -= 18;
      matchedSignals.push("nationality_mismatch");
    }
  }

  const positionLabels = await resolveItemLabels(
    extractItemIds(candidate.entity, "P413"),
    cache,
    cachePath,
  );
  const candidatePositionGroup = normalizeText(mapPositionGroup(positionLabels));
  if (targetPositionGroup && candidatePositionGroup) {
    if (normalizeMatch(targetPositionGroup) === normalizeMatch(candidatePositionGroup)) {
      score += 22;
      matchedSignals.push("position_group_match");
    } else {
      score -= 18;
      matchedSignals.push("position_group_mismatch");
    }
  }

  const currentClubId = extractBestCurrentClubClaim(candidate.entity);
  if (currentClubId && targetCurrentClub) {
    const clubLabels = await resolveItemLabels([currentClubId], cache, cachePath);
    if (
      clubLabels.some((club) => normalizeMatch(club) === targetCurrentClub)
    ) {
      score += 16;
      matchedSignals.push("current_club_match");
    }
  }

  if (candidate.resolutionMethod === "wikipedia_title_candidate") {
    score += 28;
    matchedSignals.push("wikipedia_born_title_candidate");
  } else if (candidate.resolutionMethod === "wikipedia_search") {
    score += 12;
    matchedSignals.push("wikipedia_search_candidate");
  }

  return { score, matchedSignals };
}

async function buildResolvedFactsFromEntity(
  entity: WikidataEntity,
  resolutionMethod: string,
  resolutionScore: number,
  matchedSignals: string[],
  searchQueries: string[],
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<WikidataResolvedFacts> {
  const birthPlaceIds = extractItemIds(entity, "P19");
  const currentClubId = extractBestCurrentClubClaim(entity);
  const positionIds = extractItemIds(entity, "P413");
  const languageIds = extractItemIds(entity, "P1412");
  const educationIds = extractItemIds(entity, "P69");
  const birthPlaceLabels = await resolveItemLabels(birthPlaceIds, cache, cachePath);
  const currentClubLabels = currentClubId
    ? await resolveItemLabels([currentClubId], cache, cachePath)
    : [];
  const positionLabels = await resolveItemLabels(positionIds, cache, cachePath);
  const languageLabels = await resolveItemLabels(languageIds, cache, cachePath);
  const educationLabels = await resolveItemLabels(educationIds, cache, cachePath);

  const fullName =
    extractStringClaim(entity, "P1477") ||
    entity.labels.es ||
    entity.labels.fr ||
    entity.labels.en ||
    null;
  const heightMeters = extractQuantityClaim(entity, "P2048");
  const weightKg = extractQuantityClaim(entity, "P2067");
  const wikipediaTitle = normalizeText(entity.sitelinks.enwiki);
  const externalSources = buildExternalSourceUrls(entity);
  const officialWebsite = extractStringClaim(entity, "P856");
  const sourceLadder: SourceLadderUrls = {
    wikidata: `https://www.wikidata.org/wiki/${entity.id}`,
    ...(wikipediaTitle
      ? {
          wikipedia: `https://en.wikipedia.org/wiki/${encodeURIComponent(
            wikipediaTitle.replace(/ /g, "_"),
          )}`,
        }
      : {}),
    ...(officialWebsite ? { officialWebsite } : {}),
    ...externalSources.sourceLadder,
  };

  return {
    qid: entity.id,
    entityUrl: `https://www.wikidata.org/wiki/${entity.id}`,
    wikipediaTitle,
    wikipediaUrl: wikipediaTitle
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(
          wikipediaTitle.replace(/ /g, "_"),
        )}`
      : null,
    fullName,
    birthDate: extractTimeClaim(entity, "P569"),
    birthPlace: birthPlaceLabels[0] || null,
    currentClub: currentClubLabels[0] || null,
    positions: positionLabels,
    heightCm:
      typeof heightMeters === "number" && Number.isFinite(heightMeters)
        ? Math.round(heightMeters * 100)
        : null,
    weightKg:
      typeof weightKg === "number" && Number.isFinite(weightKg)
        ? Math.round(weightKg)
        : null,
    languages: languageLabels,
    education: educationLabels,
    officialWebsite,
    sourceLadder,
    externalIds: externalSources.externalIds,
    disambiguation: {
      resolutionMethod,
      resolutionScore,
      candidateCount: 1,
      searchQueries,
      matchedSignals,
    },
  };
}

async function fetchWikipediaSummary(
  title: string,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<BiographySummary | null> {
  const encodedTitle = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`;
  try {
    const payload = await fetchJson<{
      title?: string;
      content_urls?: { desktop?: { page?: string } };
      extract?: string;
      wikibase_item?: string;
    }>(url, cache, cachePath);
    return {
      pageTitle: payload.title || title,
      pageUrl:
        payload.content_urls?.desktop?.page ||
        `https://en.wikipedia.org/wiki/${encodedTitle}`,
      extract: normalizeText(payload.extract),
      wikibaseItem: normalizeText(payload.wikibase_item),
    };
  } catch {
    return null;
  }
}

async function fetchWikipediaWikitext(
  title: string,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<string | null> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "revisions");
  url.searchParams.set("rvslots", "main");
  url.searchParams.set("rvprop", "content");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("format", "json");
  url.searchParams.set("titles", title);
  try {
    const payload = await fetchJson<{
      query?: {
        pages?: Array<{
          revisions?: Array<{
            slots?: { main?: { content?: string } };
          }>;
        }>;
      };
    }>(url.toString(), cache, cachePath);
    const content =
      payload.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content || null;
    return normalizeText(content);
  } catch {
    return null;
  }
}

async function fetchTransfermarktFacts(
  sourceUrl: string | null | undefined,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<TransfermarktProfileFacts | null> {
  const url = normalizeText(sourceUrl);
  if (!url) return null;
  try {
    const html = await fetchText(url, cache, cachePath);
    if (/just a moment|cloudflare|captcha/i.test(html.slice(0, 2000))) {
      return null;
    }
    return parseTransfermarktProfileFacts(url, html);
  } catch {
    return null;
  }
}

function parseClubOfficialProfileFacts(
  sourceUrl: string,
  sourceLabel: string,
  sourceKind: ClubOfficialProfileFacts["sourceKind"],
  html: string,
): ClubOfficialProfileFacts {
  const text = stripHtml(html);
  const heightWindow =
    text.match(/(?:height|altura|taille|größe|groesse)\D{0,60}(\d(?:[.,]\d+)?\s*m|\d{2,3}\s*cm)/i)?.[0] ||
    "";
  const weightWindow =
    text.match(/(?:weight|peso|poids|gewicht)\D{0,60}(\d{2,3}\s*kg)/i)?.[0] ||
    "";
  return {
    sourceUrl,
    sourceLabel,
    sourceKind,
    heightCm: parseHeightCm(heightWindow),
    weightKg: parseWeightKg(weightWindow),
  };
}

async function fetchClubOfficialProfileFactsFromUrl(
  sourceUrl: string | null | undefined,
  card: JournalistPersonCard,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<ClubOfficialProfileFacts | null> {
  const url = normalizeText(sourceUrl);
  if (!url) return null;
  try {
    const probe = await probeHtmlUrl(url);
    if (!probe.ok && !(probe.status === 401 || probe.status === 403)) return null;
    const finalUrl = probe.finalUrl || url;
    if (probe.status === 401 || probe.status === 403) {
      return {
        sourceUrl: finalUrl,
        sourceLabel: "Club official profile",
        sourceKind: "club_official_squad_page",
        heightCm: null,
        weightKg: null,
      };
    }
    const html = await fetchText(finalUrl, cache, cachePath);
    if (!htmlLikelyMatchesPlayer(html, card)) return null;
    return parseClubOfficialProfileFacts(
      finalUrl,
      "Club official profile",
      "club_official_squad_page",
      html,
    );
  } catch {
    return null;
  }
}

async function resolveClubOfficialProfileFacts(
  card: JournalistPersonCard,
  preferredUrl: string | null | undefined,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<ClubOfficialProfileFacts | null> {
  const directFacts = await fetchClubOfficialProfileFactsFromUrl(
    preferredUrl,
    card,
    cache,
    cachePath,
  );
  if (directFacts) return directFacts;

  const currentClub = normalizeText(card.currentClub);
  if (!currentClub) return null;
  const pattern = CLUB_OFFICIAL_PROFILE_PATTERNS.find((item) =>
    item.clubMatcher.test(currentClub),
  );
  if (!pattern) return null;

  const slugs = buildPlayerSlugVariants(card);
  if (!slugs.length) return null;

  const urls = [...new Set(pattern.buildUrls({ card, slugs }))];
  for (const url of urls) {
    const probe = await probeHtmlUrl(url);
    const statusIsBlockedButLikelyValid =
      pattern.acceptBlockedStatus &&
      (probe.status === 401 || probe.status === 403) &&
      !probe.finalUrl?.includes("/404");
    if (!probe.ok && !statusIsBlockedButLikelyValid) continue;
    const finalUrl = probe.finalUrl || url;
    if (statusIsBlockedButLikelyValid) {
      return {
        sourceUrl: finalUrl,
        sourceLabel: pattern.sourceLabel,
        sourceKind: pattern.sourceKind,
        heightCm: null,
        weightKg: null,
      };
    }
    try {
      const html = await fetchText(finalUrl, cache, cachePath);
      if (!htmlLikelyMatchesPlayer(html, card)) continue;
      return parseClubOfficialProfileFacts(
        finalUrl,
        pattern.sourceLabel,
        pattern.sourceKind,
        html,
      );
    } catch {
      return {
        sourceUrl: finalUrl,
        sourceLabel: pattern.sourceLabel,
        sourceKind: pattern.sourceKind,
        heightCm: null,
        weightKg: null,
      };
    }
  }
  return null;
}

function parseNationalFootballTeamsClubHistory(html: string): {
  currentClub: string | null;
  clubHistory: InfoboxClubHistoryItem[];
} {
  const clubsIndex = html.indexOf('id="clubs"');
  const matchesIndex = html.indexOf('id="matches"', Math.max(clubsIndex, 0));
  const section =
    clubsIndex >= 0
      ? html.slice(clubsIndex, matchesIndex > clubsIndex ? matchesIndex : undefined)
      : html;
  const rowMatches = section.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  const byClub = new Map<
    string,
    { club: string; startYear: number | null; endYear: number | null }
  >();
  let currentClub: string | null = null;

  for (const row of rowMatches) {
    const season = normalizeHtmlField(
      row.match(/<td[^>]*class=["'][^"']*season[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1],
    );
    const club =
      normalizeHtmlField(
        row.match(/<div[^>]*class=["']team["'][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1],
      ) || null;
    if (!season || !club) continue;
    const startYearMatch = season.match(/(\d{4})/);
    const endYearMatch = season.match(/\/(\d{2})$/);
    const startYear = startYearMatch?.[1] ? Number(startYearMatch[1]) : null;
    const endYear =
      startYear != null && endYearMatch?.[1]
        ? Number(String(startYear).slice(0, 2) + endYearMatch[1])
        : startYear;
    if (startYear == null) continue;
    if (!currentClub) currentClub = club;
    const key = normalizeMatch(club);
    const existing = byClub.get(key) || {
      club,
      startYear: null,
      endYear: null,
    };
    existing.startYear =
      existing.startYear == null ? startYear : Math.min(existing.startYear, startYear);
    existing.endYear =
      existing.endYear == null ? endYear : Math.max(existing.endYear, endYear || startYear);
    byClub.set(key, existing);
  }

  return {
    currentClub,
    clubHistory: [...byClub.values()]
      .map((item) => ({
        club: item.club,
        startDate: item.startYear ? String(item.startYear) : null,
        endDate:
          normalizeMatch(item.club) === normalizeMatch(currentClub)
            ? null
            : item.endYear
              ? String(item.endYear)
              : null,
        isCurrent: normalizeMatch(item.club) === normalizeMatch(currentClub),
      }))
      .sort((left, right) => (left.startDate || "").localeCompare(right.startDate || "")),
  };
}

function parseNationalFootballTeamsFacts(
  sourceUrl: string,
  html: string,
): NationalFootballTeamsFacts {
  const canonicalUrl =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ||
    null;
  const positions = [
    ...new Set(
      [...html.matchAll(/<span[^>]*itemprop=["']positionName["'][^>]*>([\s\S]*?)<\/span>/gi)]
        .map((match) => normalizeHtmlField(match[1]))
        .filter((value): value is string => Boolean(value))
        .map((value) => titleCase(value)),
    ),
  ];
  const { currentClub, clubHistory } = parseNationalFootballTeamsClubHistory(html);
  const countriesIndex = html.indexOf('id="countries"');
  const clubsIndex = html.indexOf('id="clubs"', Math.max(countriesIndex, 0));
  const section =
    countriesIndex >= 0
      ? html.slice(countriesIndex, clubsIndex > countriesIndex ? clubsIndex : undefined)
      : html;
  const rowMatches = section.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  let nationalTeam: string | null = null;
  let firstSeason: number | null = null;
  let latestSeason: number | null = null;
  let totalMatches = 0;

  for (const row of rowMatches) {
    const season = Number(
      row.match(/<td[^>]*class=["'][^"']*season[^"']*["'][^>]*data-order=["'](\d{4})["']/i)?.[1],
    );
    if (!Number.isFinite(season)) continue;
    const matchCounts = [
      ...row.matchAll(/<td[^>]*class=["'][^"']*stats matches[^"']*["'][^>]*data-order=["'](\d+)["']/gi),
    ].map((match) => Number(match[1] || 0));
    const matches = matchCounts.reduce((total, count) => total + count, 0);
    if (!matches) continue;
    totalMatches += matches;
    firstSeason = firstSeason == null ? season : Math.min(firstSeason, season);
    latestSeason = latestSeason == null ? season : Math.max(latestSeason, season);
    if (!nationalTeam) {
      nationalTeam =
        normalizeHtmlField(
          row.match(/<div[^>]*class=["']team["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1],
        ) || null;
    }
  }

  return {
    sourceUrl,
    canonicalUrl,
    fullName:
      normalizeHtmlField(html.match(/<h6>([\s\S]*?)<\/h6>/i)?.[1]) ||
      normalizeHtmlField(
        html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["'][^"']*?,\s*[^,]+,\s*([^"']+)["']/i)?.[1],
      ) ||
      null,
    birthDate:
      normalizeHtmlField(
        html.match(/<span[^>]*itemprop=["']birthDate["'][^>]*>([\s\S]*?)<\/span>/i)?.[1],
      ) || null,
    birthPlace:
      normalizeHtmlField(
        html.match(/<span[^>]*itemprop=["']birthPlace["'][^>]*>([\s\S]*?)<\/span>/i)?.[1],
      ) || null,
    heightCm: parseHeightCm(
      html.match(/<span[^>]*itemprop=["']height["'][^>]*>([\s\S]*?)<\/span>/i)?.[1],
    ),
    nationalTeam,
    firstSeason,
    latestSeason,
    totalMatches: totalMatches || null,
    currentClub,
    positions,
    clubHistory,
  };
}

function parseNationalFootballTeamsSearchResults(
  html: string,
): NationalFootballTeamsSearchResult[] {
  const section =
    html.match(/<div id="search-result-players">([\s\S]*?)<\/table>/i)?.[1] || html;
  const rows = section.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  const results: NationalFootballTeamsSearchResult[] = [];

  for (const row of rows) {
    const href = row.match(/<td[^>]*class=["']name["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const titles = [
      ...row.matchAll(/<abbr[^>]*title=["']([^"']+)["'][^>]*>/gi),
    ].map((match) => normalizeHtmlField(match[1])).filter((value): value is string => Boolean(value));
    results.push({
      sourceUrl: new URL(href, "https://www.national-football-teams.com").toString(),
      displayName:
        normalizeHtmlField(
          row.match(/<td[^>]*class=["']name["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1],
        ) || "",
      birthDate:
        normalizeHtmlField(
          row.match(/<td[^>]*class=["']dob["'][^>]*>([\s\S]*?)<\/td>/i)?.[1],
        ) || null,
      birthPlace:
        normalizeHtmlField(
          row.match(/<td[^>]*class=["']pob["'][^>]*>([\s\S]*?)<\/td>/i)?.[1],
        ) || null,
      heightCm: parseHeightCm(
        row.match(/<td[^>]*class=["']height["'][^>]*>([\s\S]*?)<\/td>/i)?.[1],
      ),
      country:
        normalizeHtmlField(
          row.match(/<div[^>]*class=["']team["'][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1],
        ) || null,
      positions: titles.map((value) => titleCase(value)),
    });
  }

  return results;
}

function scoreNationalFootballTeamsSearchResult(
  result: NationalFootballTeamsSearchResult,
  card: JournalistPersonCard,
): number {
  const targetNames = buildPersonNameVariants(card).map((value) =>
    normalizePersonName(value),
  );
  const resultName = normalizePersonName(result.displayName);
  let score = 0;

  if (targetNames.includes(resultName)) score += 120;
  if (targetNames.some((value) => value.includes(resultName) || resultName.includes(value))) {
    score += 40;
  }
  if (normalizeText(card.birthDate) && normalizeText(card.birthDate) === result.birthDate) {
    score += 50;
  }
  if (
    normalizeMatch(card.primaryNationality) &&
    normalizeMatch(card.primaryNationality) === normalizeMatch(result.country)
  ) {
    score += 24;
  }
  if (
    normalizeText(card.role.positionGroup) &&
    mapPositionGroup(result.positions) === normalizeText(card.role.positionGroup)
  ) {
    score += 16;
  }
  return score;
}

async function resolveNationalFootballTeamsProfileUrl(
  card: JournalistPersonCard,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<string | null> {
  const queries = buildPersonNameVariants(card);
  let bestUrl: string | null = null;
  let bestScore = -1;

  for (const query of queries) {
    const url = `https://www.national-football-teams.com/search.html?primarySearchType=0&ajax=false&term=${encodeURIComponent(
      query,
    )}`;
    let html: string;
    try {
      html = await fetchText(url, cache, cachePath);
    } catch {
      continue;
    }
    const results = parseNationalFootballTeamsSearchResults(html);
    for (const result of results) {
      const score = scoreNationalFootballTeamsSearchResult(result, card);
      if (score > bestScore) {
        bestScore = score;
        bestUrl = result.sourceUrl;
      }
    }
    if (bestScore >= 120) break;
  }

  return bestScore >= 60 ? bestUrl : null;
}

async function fetchNationalFootballTeamsFacts(
  sourceUrl: string | null | undefined,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<NationalFootballTeamsFacts | null> {
  const url = normalizeText(sourceUrl);
  if (!url) return null;
  try {
    const html = await fetchText(url, cache, cachePath);
    return parseNationalFootballTeamsFacts(url, html);
  } catch {
    return null;
  }
}

async function resolveWikidataFacts(
  card: JournalistPersonCard,
  cache: Map<string, unknown>,
  cachePath: string,
): Promise<WikidataResolvedFacts | null> {
  const initial = await collectResolvedCandidatesFromWikidataSearch(
    card,
    cache,
    cachePath,
  );
  let candidates = initial.candidates;
  const searchQueries = [...initial.queriesUsed];

  let bestCandidate: ResolvedWikidataCandidate | null = null;
  let bestScore = -Infinity;
  let bestSignals: string[] = [];

  for (const candidate of candidates) {
    const scored = await scoreResolvedWikidataCandidate(
      card,
      candidate,
      cache,
      cachePath,
    );
    if (scored.score > bestScore) {
      bestCandidate = candidate;
      bestScore = scored.score;
      bestSignals = scored.matchedSignals;
    }
  }

  const needsWikipediaAssist =
    !bestCandidate ||
    bestScore < 170 ||
    bestSignals.includes("birth_date_mismatch") ||
    bestSignals.includes("birth_year_mismatch") ||
    bestSignals.includes("wikipedia_title_birth_year_mismatch");

  if (needsWikipediaAssist) {
    const wikipediaAssist = await collectResolvedCandidatesFromWikipediaSearch(
      card,
      cache,
      cachePath,
    );
    searchQueries.push(...wikipediaAssist.queriesUsed);
    const merged = new Map<string, ResolvedWikidataCandidate>();
    for (const candidate of [...candidates, ...wikipediaAssist.candidates]) {
      appendResolvedCandidate(merged, candidate);
    }
    candidates = [...merged.values()];

    for (const candidate of candidates) {
      const scored = await scoreResolvedWikidataCandidate(
        card,
        candidate,
        cache,
        cachePath,
      );
      if (scored.score > bestScore) {
        bestCandidate = candidate;
        bestScore = scored.score;
        bestSignals = scored.matchedSignals;
      }
    }
  }

  if (!bestCandidate) return null;

  const facts = await buildResolvedFactsFromEntity(
    bestCandidate.entity,
    bestCandidate.resolutionMethod,
    bestScore,
    bestSignals,
    [...new Set(searchQueries)],
    cache,
    cachePath,
  );
  return {
    ...facts,
    disambiguation: {
      ...facts.disambiguation,
      candidateCount: candidates.length,
    },
  };
}

function buildExistingProfileWikidataFacts(
  card: JournalistPersonCard,
  profile: JournalistPersonCard["profile"],
  metadata: Record<string, unknown>,
  biographyFacts: Record<string, unknown>,
): WikidataResolvedFacts {
  const sourceLadder = normalizeSourceLadderUrls(
    typeof metadata.sourceLadder === "object" && metadata.sourceLadder
      ? (metadata.sourceLadder as SourceLadderUrls)
      : {},
  );
  const externalIds =
    typeof biographyFacts.externalIds === "object" && biographyFacts.externalIds
      ? (biographyFacts.externalIds as Record<string, string>)
      : {};
  const positions =
    Array.isArray(biographyFacts.positions) &&
    biographyFacts.positions.every((value) => typeof value === "string")
      ? (biographyFacts.positions as string[])
      : [];
  const languages =
    Array.isArray(biographyFacts.languages) &&
    biographyFacts.languages.every((value) => typeof value === "string")
      ? (biographyFacts.languages as string[])
      : [];

  return {
    qid: normalizeText(metadata.wikidataEntityId as string | null) || "existing-profile",
    entityUrl:
      normalizeText(metadata.wikidataEntityUrl as string | null) ||
      normalizeText(sourceLadder.wikidata) ||
      "https://www.wikidata.org/",
    wikipediaTitle: normalizeText(metadata.wikipediaTitle as string | null),
    wikipediaUrl: normalizeText(metadata.wikipediaUrl as string | null),
    fullName:
      normalizeText(biographyFacts.fullName as string | null) ||
      normalizeText(card.canonicalName) ||
      null,
    birthDate: normalizeText(card.birthDate),
    birthPlace: normalizeText(profile?.birthPlace),
    currentClub: normalizeText(card.currentClub),
    positions,
    heightCm: normalizeHeightCm(profile?.heightCm),
    weightKg: normalizeWeightKg(profile?.weightKg),
    languages,
    education: Array.isArray(profile?.education) ? profile.education : [],
    officialWebsite: normalizeText(metadata.officialWebsite as string | null),
    sourceLadder,
    externalIds,
    disambiguation: {
      resolutionMethod: "existing_profile_fallback",
      resolutionScore: 0,
      candidateCount: 0,
      searchQueries: [],
      matchedSignals: [],
    },
  };
}

function mergeStringArray(existing: string[], incoming: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of [...existing, ...incoming]) {
    const normalized = normalizeMatch(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(item.trim());
  }
  return next;
}

function mergeClubHistory(
  existing: JournalistClubHistoryItem[],
  incoming: InfoboxClubHistoryItem[],
  sourceLabel: string,
  sourceUrl: string,
): JournalistClubHistoryItem[] {
  const next = new Map<string, JournalistClubHistoryItem>();
  for (const item of existing) {
    const key = `${normalizeMatch(item.club)}::${item.startDate || ""}::${
      item.endDate || ""
    }`;
    next.set(key, item);
  }
  for (const item of incoming) {
    const key = `${normalizeMatch(item.club)}::${item.startDate || ""}::${
      item.endDate || ""
    }`;
    if (next.has(key)) continue;
    next.set(key, {
      club: item.club,
      startDate: item.startDate,
      endDate: item.endDate,
      isCurrent: item.isCurrent,
      sourceLabel,
      sourceUrl,
    });
  }
  return [...next.values()];
}

function sanitizeClubHistoryItems(
  items: JournalistClubHistoryItem[] | null | undefined,
): JournalistClubHistoryItem[] {
  if (!items?.length) return [];
  return items.filter((item) => {
    const club = normalizeText(item.club);
    if (!club) return false;
    if (
      normalizeText(item.sourceLabel) === "FootballDatabase.eu profile" &&
      !normalizeText(item.startDate) &&
      !normalizeText(item.endDate)
    ) {
      return false;
    }
    return true;
  });
}

function extractBiographyBirthYearFromUrl(
  value: string | null | undefined,
): string | null {
  const clean = normalizeText(value);
  if (!clean) return null;
  const match = clean.match(/born[_%20-](\d{4})/i);
  return match?.[1] || null;
}

function isPlausiblePlayerBirthDate(value: string | null | undefined): boolean {
  const year = Number(extractBirthYear(value));
  return Number.isFinite(year) && year >= 1970 && year <= 2015;
}

function looksLikeGarbageYouthClub(value: string | null | undefined): boolean {
  const clean = normalizeText(value);
  if (!clean) return true;
  return /[|={}]|currentclub|clubs?\d+/i.test(clean);
}

function filterStaleBiographyDerivedClubHistory(
  items: JournalistClubHistoryItem[] | null | undefined,
  staleSourceUrl: string | null,
): JournalistClubHistoryItem[] {
  return sanitizeClubHistoryItems(items).filter((item) => {
    const sourceLabel = normalizeText(item.sourceLabel);
    const sourceUrl = normalizeText(item.sourceUrl);
    if (
      sourceLabel === "Wikipedia infobox" &&
      staleSourceUrl &&
      sourceUrl === staleSourceUrl
    ) {
      return false;
    }
    return true;
  });
}

function maybeAddAlias(
  aliases: JournalistPersonCard["aliases"],
  alias: string | null,
  source: string,
): JournalistPersonCard["aliases"] {
  const nextAlias = normalizeText(alias);
  if (!nextAlias) return aliases;
  const canonical = normalizeMatch(nextAlias);
  const hasAlias = aliases.all.some(
    (item) => normalizeMatch(item.alias) === canonical,
  );
  if (hasAlias) return aliases;
  return {
    accentless: aliases.accentless,
    all: [
      ...aliases.all,
      {
        alias: nextAlias,
        aliasType: "localized_name",
        language: null,
        script: null,
        isPrimary: false,
        source,
      },
    ],
  };
}

function buildShortBio(summary: BiographySummary | null): string | null {
  const extract = normalizeText(summary?.extract);
  if (!extract) return null;
  const sentence = extract.match(/^(.+?[.!?])(?:\s|$)/)?.[1] || extract;
  return sentence.trim();
}

function buildLongBio(summary: BiographySummary | null): string | null {
  const extract = normalizeText(summary?.extract);
  if (!extract) return null;
  return extract;
}

function selectTargets(
  program: ReturnType<typeof buildFootballWorldCupDossierProgram>,
  scope: ScopeMode,
): Array<
  | FootballWorldCupTopMissingLiveBioPlayer
  | FootballWorldCupDossierProgramPlayer
> {
  if (scope === "top20-bio-gap") return program.top20MissingLiveBio;
  if (scope === "top50-bio-gap") {
    return program.targetPlayers.filter(
      (item) => item.seedRank <= 50 && item.missingLiveBiography,
    );
  }
  if (scope === "target-bio-gap") {
    return program.targetPlayers.filter((item) => item.missingLiveBiography);
  }
  if (scope === "top50-completeness") {
    return program.targetPlayers.filter((item) => item.seedRank <= 50);
  }
  if (scope === "top200-completeness") {
    return program.targetPlayers.filter((item) => item.seedRank <= 200);
  }
  return program.targetPlayers;
}

function isTop20Record(
  value:
    | FootballWorldCupTopMissingLiveBioPlayer
    | FootballWorldCupDossierProgramPlayer,
): value is FootballWorldCupTopMissingLiveBioPlayer {
  return !("hasLiveBiography" in value);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cache = await readJsonCache(args.cachePath);
  const snapshotPath = resolveFootballWorldCupJournalistSnapshotPath();
  const rawSnapshot = JSON.parse(
    await fs.readFile(snapshotPath, "utf8"),
  ) as RawSnapshot;
  const normalizedSnapshot = await readFootballWorldCupJournalistSnapshot();
  const humanInterestPayload =
    await readFootballWorldCupHumanInterestPilotCanonical();

  if (!normalizedSnapshot) {
    throw new Error("World Cup journalist snapshot unavailable.");
  }

  const dossierProgram = buildFootballWorldCupDossierProgram(
    normalizedSnapshot,
    humanInterestPayload?.records || [],
  );

  let targets = selectTargets(dossierProgram, args.scope);
  if (args.rankFrom || args.rankTo) {
    targets = targets.filter((item) => {
      const seedRank = item.seedRank || Number.MAX_SAFE_INTEGER;
      if (args.rankFrom && seedRank < args.rankFrom) return false;
      if (args.rankTo && seedRank > args.rankTo) return false;
      return true;
    });
  }
  if (args.person) {
    const personMatch = normalizeMatch(args.person);
    targets = targets.filter((item) => {
      const displayName = "displayName" in item ? item.displayName : "";
      return (
        normalizeMatch(item.canonicalName) === personMatch ||
        normalizeMatch(displayName) === personMatch ||
        item.sportsPersonId === args.person
      );
    });
  }
  if (args.limit) targets = targets.slice(0, args.limit);

  const rawCards = new Map<
    string,
    { team: RawSnapshotTeam; card: JournalistPersonCard }
  >();
  for (const team of rawSnapshot.teams) {
    for (const card of team.playerCards) {
      rawCards.set(card.sportsPersonId, { team, card });
    }
  }

  if (args.onlyMissingFootballDatabase) {
    targets = targets.filter((item) => {
      const raw = rawCards.get(item.sportsPersonId);
      if (!raw) return false;
      const footballDatabaseFacts =
        raw.card.profile?.metadata &&
        typeof raw.card.profile.metadata === "object" &&
        typeof (raw.card.profile.metadata as Record<string, unknown>).biographyFacts === "object"
          ? (
              ((raw.card.profile.metadata as Record<string, unknown>).biographyFacts as Record<
                string,
                unknown
              >).footballDatabase || null
            )
          : null;
      return !hasMeaningfulFootballDatabaseFacts(footballDatabaseFacts);
    });
  }

  if (args.onlyWithoutFootballDatabaseUrl) {
    targets = targets.filter((item) => {
      const raw = rawCards.get(item.sportsPersonId);
      if (!raw) return false;
      const sourceLadder =
        raw.card.profile?.metadata &&
        typeof raw.card.profile.metadata === "object" &&
        typeof (raw.card.profile.metadata as Record<string, unknown>).sourceLadder ===
          "object"
          ? normalizeSourceLadderUrls(
              ((raw.card.profile.metadata as Record<string, unknown>).sourceLadder ||
                {}) as SourceLadderUrls,
            )
          : {};
      return !normalizeText(sourceLadder.footballDatabase);
    });
  }

  const results: MergeResult[] = [];
  const nowIso = new Date().toISOString();

  for (const target of targets) {
    const raw = rawCards.get(target.sportsPersonId);
    const displayName = target.displayName || target.canonicalName;
    const warnings: string[] = [];
    if (!raw) {
      results.push({
        sportsPersonId: target.sportsPersonId,
        displayName,
        teamCanonicalName: target.teamCanonicalName,
        seedRank: target.seedRank,
        applied: false,
        biographySourceUrl: null,
        wikidataEntityId: null,
        sourceLadderUrls: {},
        fieldsAdded: [],
        warnings: ["raw_card_missing"],
      });
      continue;
    }

    try {
      const profile = raw.card.profile || {
        profileType: "world_cup_2026_public_summary",
        shortBio: null,
        longBio: null,
        birthPlace: null,
        hometown: null,
        residenceCountry: null,
        heightCm: null,
        weightKg: null,
        handedness: null,
        footedness: null,
        education: [],
        youthClubs: [],
        clubHistory: [],
        biographySourceLabel: null,
        biographySourceUrl: null,
        source: null,
        sourceUrl: null,
        sourceLabel: null,
        sourceKind: null,
        confidence: 0.7,
        metadata: {},
        updatedAt: nowIso,
      };

      const existingMetadata =
        (profile.metadata as Record<string, unknown> | null) || {};
      const existingBiographyFacts =
        typeof existingMetadata.biographyFacts === "object" &&
        existingMetadata.biographyFacts
          ? (existingMetadata.biographyFacts as Record<string, unknown>)
          : {};

      const existingProfileFacts = buildExistingProfileWikidataFacts(
        raw.card,
        profile,
        existingMetadata,
        existingBiographyFacts,
      );
      const hasExistingIdentity = Boolean(
        normalizeText(profile.biographySourceUrl) ||
          normalizeText(existingMetadata.wikidataEntityId as string | null),
      );
      const shouldReuseExistingIdentity =
        args.identityOnly && hasExistingIdentity;
      const resolvedWikidataFacts =
        args.externalFactsOnly || shouldReuseExistingIdentity
        ? existingProfileFacts
        : await resolveWikidataFacts(raw.card, cache, args.cachePath);
      const wikidataFacts = resolvedWikidataFacts || existingProfileFacts;
      const usedWikidataFallback = !resolvedWikidataFacts;

      const summary =
        !args.externalFactsOnly &&
        !shouldReuseExistingIdentity &&
        wikidataFacts.wikipediaTitle
        ? await fetchWikipediaSummary(
            wikidataFacts.wikipediaTitle,
            cache,
            args.cachePath,
          )
        : null;
      const wikitext =
        !args.externalFactsOnly &&
        !shouldReuseExistingIdentity &&
        wikidataFacts.wikipediaTitle
        ? await fetchWikipediaWikitext(
            wikidataFacts.wikipediaTitle,
            cache,
            args.cachePath,
          )
        : null;
      const infobox = wikitext ? parseInfobox(wikitext) : null;
      const previousWikidataEntityId = normalizeText(
        existingMetadata.wikidataEntityId as string | null,
      );
      const resolvedBirthYear = extractBirthYear(wikidataFacts.birthDate);
      const existingBiographyBirthYear = extractBiographyBirthYearFromUrl(
        profile.biographySourceUrl,
      );
      const identitySourceChanged = Boolean(
        !args.externalFactsOnly &&
          normalizeText(wikidataFacts.qid) &&
          wikidataFacts.qid !== "existing-profile" &&
          ((previousWikidataEntityId &&
            previousWikidataEntityId !== wikidataFacts.qid) ||
            (existingBiographyBirthYear &&
              resolvedBirthYear &&
              existingBiographyBirthYear !== resolvedBirthYear)),
      );
      const sourceLabel =
        (identitySourceChanged ? null : normalizeText(profile.biographySourceLabel)) ||
        (summary ? "Wikipedia profile" : "Wikidata profile");
      const sourceUrl =
        (identitySourceChanged ? null : normalizeText(profile.biographySourceUrl)) ||
        summary?.pageUrl ||
        wikidataFacts.wikipediaUrl ||
        wikidataFacts.entityUrl;
      const existingSourceLadder =
        typeof existingMetadata.sourceLadder === "object" &&
        existingMetadata.sourceLadder
          ? normalizeSourceLadderUrls(existingMetadata.sourceLadder as SourceLadderUrls)
          : {};
      const wikidataSourceLadder = normalizeSourceLadderUrls(
        wikidataFacts.sourceLadder,
      );
      const preferredNationalFootballTeamsUrl =
        existingSourceLadder.nationalFootballTeams ||
        wikidataSourceLadder.nationalFootballTeams ||
        (!args.identityOnly
          ? (await resolveNationalFootballTeamsProfileUrl(
              raw.card,
              cache,
              args.cachePath,
            )) ||
            null
          : null) ||
        null;
      const preferredClubOfficialUrl =
        existingSourceLadder.clubOfficialBiography ||
        wikidataSourceLadder.clubOfficialBiography ||
        null;
      const transfermarktFacts = args.identityOnly
        ? null
        : await fetchTransfermarktFacts(
            wikidataSourceLadder.transfermarkt,
            cache,
            args.cachePath,
          );
      const fbrefFacts = args.identityOnly || args.skipFbref
        ? null
        : await fetchFbrefFacts(
            wikidataSourceLadder.fbref,
            cache,
            args.cachePath,
          );
      const soccerwayFacts = args.identityOnly || args.skipSoccerway
        ? null
        : await fetchSoccerwayFacts(
            wikidataSourceLadder.soccerway,
            cache,
            args.cachePath,
          );
      const footballDatabaseFacts = args.identityOnly || args.skipFootballDatabase
        ? null
        : await fetchFootballDatabaseFacts(
            wikidataSourceLadder.footballDatabase,
            cache,
            args.cachePath,
            { onlyCached: args.onlyCachedFootballDatabase },
          );
      const nationalFootballTeamsFacts = args.identityOnly
        ? null
        : await fetchNationalFootballTeamsFacts(
            preferredNationalFootballTeamsUrl,
            cache,
            args.cachePath,
          );
      const clubOfficialFacts = args.identityOnly || args.skipClubOfficial
        ? null
        : await resolveClubOfficialProfileFacts(
            raw.card,
            preferredClubOfficialUrl,
            cache,
            args.cachePath,
          );

      const fieldsAdded: string[] = [];
      const existingNationalFootballTeamsFacts =
        typeof existingBiographyFacts.nationalFootballTeams === "object" &&
        existingBiographyFacts.nationalFootballTeams
          ? (existingBiographyFacts.nationalFootballTeams as Record<string, unknown>)
          : null;
      const nextNationalFootballTeamsFacts = nationalFootballTeamsFacts
        ? {
            sourceUrl:
              nationalFootballTeamsFacts.canonicalUrl ||
              nationalFootballTeamsFacts.sourceUrl,
            fullName: nationalFootballTeamsFacts.fullName,
            birthDate: nationalFootballTeamsFacts.birthDate,
            birthPlace: nationalFootballTeamsFacts.birthPlace,
            heightCm: nationalFootballTeamsFacts.heightCm,
            nationalTeam: nationalFootballTeamsFacts.nationalTeam,
            firstSeason: nationalFootballTeamsFacts.firstSeason,
            latestSeason: nationalFootballTeamsFacts.latestSeason,
            totalMatches: nationalFootballTeamsFacts.totalMatches,
            currentClub: nationalFootballTeamsFacts.currentClub,
            positions: nationalFootballTeamsFacts.positions,
            clubHistory: nationalFootballTeamsFacts.clubHistory,
          }
        : existingBiographyFacts.nationalFootballTeams || null;
      const nextFbrefFacts = fbrefFacts
        ? {
            sourceUrl: fbrefFacts.sourceUrl,
            blocked: fbrefFacts.blocked,
            heightCm: fbrefFacts.heightCm,
            weightKg: fbrefFacts.weightKg,
            footedness: fbrefFacts.footedness,
            positions: fbrefFacts.positions,
            currentClub: fbrefFacts.currentClub,
            statProfile: fbrefFacts.statProfile,
          }
        : existingBiographyFacts.fbref || null;
      const nextSoccerwayFacts = soccerwayFacts
        ? {
            sourceUrl: soccerwayFacts.sourceUrl,
            finalUrl: soccerwayFacts.finalUrl,
            profileTitle: soccerwayFacts.profileTitle,
            currentClub: soccerwayFacts.currentClub,
            sourceAccessible: soccerwayFacts.sourceAccessible,
            exposesStaticCareerData: soccerwayFacts.exposesStaticCareerData,
          }
        : existingBiographyFacts.soccerway || null;
      const nextFootballDatabaseFacts = footballDatabaseFacts
        ? {
            sourceUrl: footballDatabaseFacts.sourceUrl,
            currentClub: footballDatabaseFacts.currentClub,
            heightCm: footballDatabaseFacts.heightCm,
            weightKg: footballDatabaseFacts.weightKg,
            footedness: footballDatabaseFacts.footedness,
            positions: footballDatabaseFacts.positions,
            internationalCaps: footballDatabaseFacts.internationalCaps,
            internationalGoals: footballDatabaseFacts.internationalGoals,
            firstCapOpponent: footballDatabaseFacts.firstCapOpponent,
            firstCapDate: footballDatabaseFacts.firstCapDate,
            clubHistory: footballDatabaseFacts.clubHistory,
            statProfile: footballDatabaseFacts.statProfile,
          }
        : hasMeaningfulFootballDatabaseFacts(existingBiographyFacts.footballDatabase)
          ? existingBiographyFacts.footballDatabase || null
          : null;
      if (
        fbrefFacts &&
        JSON.stringify(existingBiographyFacts.fbref || {}) !==
          JSON.stringify(nextFbrefFacts)
      ) {
        fieldsAdded.push("profile.fbrefFacts");
      }
      if (
        soccerwayFacts &&
        JSON.stringify(existingBiographyFacts.soccerway || {}) !==
          JSON.stringify(nextSoccerwayFacts)
      ) {
        fieldsAdded.push("profile.soccerwayProfile");
      }
      if (
        footballDatabaseFacts &&
        JSON.stringify(existingBiographyFacts.footballDatabase || {}) !==
          JSON.stringify(nextFootballDatabaseFacts)
      ) {
        fieldsAdded.push("profile.footballDatabaseFacts");
      }
      if (
        nationalFootballTeamsFacts &&
        JSON.stringify(existingNationalFootballTeamsFacts || {}) !==
          JSON.stringify(nextNationalFootballTeamsFacts)
      ) {
        fieldsAdded.push("profile.nationalTeamLedger");
      }
      const mergedSourceLadder: SourceLadderUrls = {
        ...existingSourceLadder,
        ...wikidataSourceLadder,
        ...(preferredNationalFootballTeamsUrl
          ? { nationalFootballTeams: preferredNationalFootballTeamsUrl }
          : {}),
        ...(clubOfficialFacts
          ? { clubOfficialBiography: clubOfficialFacts.sourceUrl }
          : {}),
      };
      const sourceLadderAdded = Object.keys(mergedSourceLadder).filter(
        (key) =>
          mergedSourceLadder[key as SourceLadderKey] &&
          mergedSourceLadder[key as SourceLadderKey] !==
            existingSourceLadder[key as SourceLadderKey],
      );
      if (sourceLadderAdded.length) {
        fieldsAdded.push(
          ...sourceLadderAdded.map((key) => `profile.sourceLadder.${key}`),
        );
      }

      const mergedAliases = maybeAddAlias(
        maybeAddAlias(
          raw.card.aliases,
          infobox?.fullName || wikidataFacts.fullName,
          sourceLabel,
        ),
        wikidataFacts.wikipediaTitle,
        sourceLabel,
      );

      if (mergedAliases !== raw.card.aliases) {
        raw.card.aliases = mergedAliases;
        fieldsAdded.push("aliases.local_name");
      }

      const bestBirthDateCandidate = normalizeText(
        infobox?.birthDate ||
          nationalFootballTeamsFacts?.birthDate ||
          wikidataFacts.birthDate,
      );
      if (
        bestBirthDateCandidate &&
        (!normalizeText(raw.card.birthDate) ||
          !isPlausiblePlayerBirthDate(raw.card.birthDate) ||
          (identitySourceChanged &&
            normalizeText(raw.card.birthDate) !== bestBirthDateCandidate))
      ) {
        raw.card.birthDate = bestBirthDateCandidate;
        fieldsAdded.push("birthDate");
      }

      let currentClubWasRefreshed = false;
      const bestCurrentClubCandidate = normalizeText(
        infobox?.currentClub ||
          footballDatabaseFacts?.currentClub ||
          soccerwayFacts?.currentClub ||
          fbrefFacts?.currentClub ||
          transfermarktFacts?.currentClub ||
          nationalFootballTeamsFacts?.currentClub ||
          wikidataFacts.currentClub,
      );
      const existingCurrentClub = normalizeText(raw.card.currentClub);
      const existingCurrentClubSource = normalizeText(
        existingMetadata.currentClubSource as string | null,
      );
      const currentClubMatchesCandidate =
        existingCurrentClub &&
        bestCurrentClubCandidate &&
        (normalizeMatch(existingCurrentClub).includes(
          normalizeMatch(bestCurrentClubCandidate),
        ) ||
          normalizeMatch(bestCurrentClubCandidate).includes(
            normalizeMatch(existingCurrentClub),
          ));
      const shouldRefreshCurrentClub =
        Boolean(bestCurrentClubCandidate) &&
        (!existingCurrentClub ||
          ((!existingCurrentClubSource ||
            existingCurrentClubSource === "wikipedia_infobox" ||
            existingCurrentClubSource === "wikidata") &&
            !currentClubMatchesCandidate));
      if (shouldRefreshCurrentClub && bestCurrentClubCandidate) {
        raw.card.currentClub = bestCurrentClubCandidate;
        currentClubWasRefreshed = true;
        fieldsAdded.push("currentClub");
      }

      const positions = transfermarktFacts?.positions.length
        ? transfermarktFacts.positions
        : footballDatabaseFacts?.positions.length
          ? footballDatabaseFacts.positions
          : fbrefFacts?.positions.length
            ? fbrefFacts.positions
            : nationalFootballTeamsFacts?.positions.length
              ? nationalFootballTeamsFacts.positions
            : infobox?.positions.length
              ? infobox.positions
              : wikidataFacts.positions;
      const primaryPositionGroup = mapPositionGroup(positions);
      if (!normalizeText(raw.card.role.positionGroup) && primaryPositionGroup) {
        raw.card.role.positionGroup = primaryPositionGroup;
        fieldsAdded.push("role.positionGroup");
      }
      if (positions.length > 1) {
        const secondaryPositions = positions.slice(1);
        const roleMetadata = { ...(raw.card.role.roleMetadata || {}) };
        if (
          !Array.isArray(
            (roleMetadata as Record<string, unknown>).secondaryPositions,
          )
        ) {
          (roleMetadata as Record<string, unknown>).secondaryPositions =
            secondaryPositions;
          raw.card.role.roleMetadata = roleMetadata;
          fieldsAdded.push("role.secondaryPositions");
        }
      }

      if (
        raw.card.role.squadNumber == null &&
        typeof infobox?.clubNumber === "number" &&
        Number.isFinite(infobox.clubNumber)
      ) {
        raw.card.role.squadNumber = infobox.clubNumber;
        fieldsAdded.push("role.squadNumber");
      }

      const nextEducation = mergeStringArray(
        profile.education || [],
        wikidataFacts.education,
      );
      if (nextEducation.length !== (profile.education || []).length) {
        profile.education = nextEducation;
        fieldsAdded.push("profile.education");
      }

      const nextYouthClubs = mergeStringArray(
        identitySourceChanged
          ? (profile.youthClubs || []).filter(
              (item) => !looksLikeGarbageYouthClub(item),
            )
          : profile.youthClubs || [],
        (infobox?.youthClubs || []).filter(
          (item) => !looksLikeGarbageYouthClub(item),
        ),
      );
      if (nextYouthClubs.length !== (profile.youthClubs || []).length) {
        profile.youthClubs = nextYouthClubs;
        fieldsAdded.push("profile.youthClubs");
      }

      const incomingInfoboxClubHistory = infobox?.clubHistory || [];
      let nextClubHistory = mergeClubHistory(
        identitySourceChanged
          ? filterStaleBiographyDerivedClubHistory(
              profile.clubHistory || [],
              normalizeText(profile.biographySourceUrl),
            )
          : sanitizeClubHistoryItems(profile.clubHistory || []),
        incomingInfoboxClubHistory,
        sourceLabel,
        sourceUrl,
      );
      if (footballDatabaseFacts?.clubHistory.length) {
        nextClubHistory = mergeClubHistory(
          nextClubHistory,
          footballDatabaseFacts.clubHistory,
          "FootballDatabase.eu profile",
          footballDatabaseFacts.sourceUrl,
        );
      }
      if (nationalFootballTeamsFacts?.clubHistory.length) {
        nextClubHistory = mergeClubHistory(
          nextClubHistory,
          nationalFootballTeamsFacts.clubHistory,
          "National Football Teams profile",
          nationalFootballTeamsFacts.canonicalUrl ||
            nationalFootballTeamsFacts.sourceUrl,
        );
      }
      if (nextClubHistory.length !== (profile.clubHistory || []).length) {
        profile.clubHistory = nextClubHistory;
        fieldsAdded.push("profile.clubHistory");
      }

      const birthPlace = normalizeText(
        profile.birthPlace ||
          infobox?.birthPlace ||
          nationalFootballTeamsFacts?.birthPlace ||
          wikidataFacts.birthPlace,
      );
      if (birthPlace && birthPlace !== profile.birthPlace) {
        profile.birthPlace = birthPlace;
        fieldsAdded.push("profile.birthPlace");
      }

      const hometown =
        normalizeText(profile.hometown) ||
        normalizeText(
          infobox?.birthPlace ||
            nationalFootballTeamsFacts?.birthPlace ||
            wikidataFacts.birthPlace,
        )?.split(",")[0] ||
        null;
      if (hometown && hometown !== profile.hometown) {
        profile.hometown = hometown;
        fieldsAdded.push("profile.hometown");
      }

      const existingHeightCm = normalizeHeightCm(profile.heightCm);
      const heightCm =
        existingHeightCm ||
        clubOfficialFacts?.heightCm ||
        footballDatabaseFacts?.heightCm ||
        transfermarktFacts?.heightCm ||
        fbrefFacts?.heightCm ||
        nationalFootballTeamsFacts?.heightCm ||
        infobox?.heightCm ||
        wikidataFacts.heightCm;
      if (
        typeof heightCm === "number" &&
        Number.isFinite(heightCm) &&
        heightCm !== profile.heightCm
      ) {
        profile.heightCm = heightCm;
        fieldsAdded.push("profile.heightCm");
      }

      const existingWeightKg = normalizeWeightKg(profile.weightKg);
      const weightKg =
        existingWeightKg ||
        clubOfficialFacts?.weightKg ||
        footballDatabaseFacts?.weightKg ||
        fbrefFacts?.weightKg ||
        infobox?.weightKg ||
        wikidataFacts.weightKg;
      if (
        typeof weightKg === "number" &&
        Number.isFinite(weightKg) &&
        weightKg !== profile.weightKg
      ) {
        profile.weightKg = weightKg;
        fieldsAdded.push("profile.weightKg");
      }

      const footedness = normalizeText(
        profile.footedness ||
          transfermarktFacts?.footedness ||
          footballDatabaseFacts?.footedness ||
          fbrefFacts?.footedness ||
          infobox?.footedness,
      );
      if (footedness && footedness !== profile.footedness) {
        profile.footedness = footedness;
        fieldsAdded.push("profile.footedness");
      }

      const shortBio = buildShortBio(summary);
      if (
        shortBio &&
        (isTemplatedBiography(profile.shortBio) || identitySourceChanged)
      ) {
        profile.shortBio = shortBio;
        fieldsAdded.push("profile.shortBio");
      }

      const longBio = buildLongBio(summary);
      if (
        longBio &&
        (isTemplatedBiography(profile.longBio) || identitySourceChanged)
      ) {
        profile.longBio = longBio;
        fieldsAdded.push("profile.longBio");
      }

      if (!profile.biographySourceUrl || identitySourceChanged) {
        profile.biographySourceLabel = sourceLabel;
        profile.biographySourceUrl = sourceUrl;
        fieldsAdded.push("profile.biographySource");
      }

      const biographyFacts = {
        ...existingBiographyFacts,
        sourceLabel,
        sourceUrl,
        fullName:
          infobox?.fullName ||
          nationalFootballTeamsFacts?.fullName ||
          wikidataFacts.fullName ||
          null,
        youthClubs: profile.youthClubs,
        clubHistory: profile.clubHistory,
        footedness: profile.footedness,
        positions,
        education: profile.education,
        languages: wikidataFacts.languages,
        externalIds: wikidataFacts.externalIds,
        fbref: nextFbrefFacts,
        soccerway: nextSoccerwayFacts,
        footballDatabase: nextFootballDatabaseFacts,
        nationalFootballTeams: nextNationalFootballTeamsFacts,
        clubOfficialProfile: clubOfficialFacts
          ? {
              sourceLabel: clubOfficialFacts.sourceLabel,
              sourceUrl: clubOfficialFacts.sourceUrl,
              sourceKind: clubOfficialFacts.sourceKind,
              heightCm: clubOfficialFacts.heightCm,
              weightKg: clubOfficialFacts.weightKg,
            }
          : null,
        sourceLadder: mergedSourceLadder,
      };

      profile.metadata = {
        ...existingMetadata,
        biographyEnrichedAt: nowIso,
        biographyBackfillVersion: 1,
        identityDisambiguation: wikidataFacts.disambiguation,
        wikidataEntityId: wikidataFacts.qid,
        wikidataEntityUrl: wikidataFacts.entityUrl,
        wikipediaTitle: summary?.pageTitle || wikidataFacts.wikipediaTitle,
        wikipediaUrl: summary?.pageUrl || wikidataFacts.wikipediaUrl,
        officialWebsite: wikidataFacts.officialWebsite,
        clubOfficialProfile: clubOfficialFacts
          ? {
              sourceLabel: clubOfficialFacts.sourceLabel,
              sourceUrl: clubOfficialFacts.sourceUrl,
              sourceKind: clubOfficialFacts.sourceKind,
              verifiedAt: nowIso,
            }
          : existingMetadata.clubOfficialProfile,
        currentClub: raw.card.currentClub || existingMetadata.currentClub,
        currentClubSource:
          !currentClubWasRefreshed &&
          normalizeText(raw.card.currentClub) &&
          normalizeText(existingMetadata.currentClubSource as string | null)
            ? existingMetadata.currentClubSource
            : normalizeText(infobox?.currentClub)
              ? "wikipedia_infobox"
              : normalizeText(footballDatabaseFacts?.currentClub)
                ? "football_database"
                : normalizeText(soccerwayFacts?.currentClub)
                  ? "soccerway"
              : normalizeText(fbrefFacts?.currentClub)
                ? "fbref"
                : normalizeText(transfermarktFacts?.currentClub)
                  ? "transfermarkt"
                  : normalizeText(nationalFootballTeamsFacts?.currentClub)
                    ? "national_football_teams"
                      : normalizeText(wikidataFacts.currentClub)
                        ? "wikidata"
                        : existingMetadata.currentClubSource,
        currentClubSourceUrl:
          !currentClubWasRefreshed &&
          normalizeText(raw.card.currentClub) &&
          normalizeText(existingMetadata.currentClubSourceUrl as string | null)
            ? existingMetadata.currentClubSourceUrl
            : footballDatabaseFacts?.sourceUrl ||
              soccerwayFacts?.finalUrl ||
              fbrefFacts?.sourceUrl ||
              transfermarktFacts?.sourceUrl ||
              nationalFootballTeamsFacts?.canonicalUrl ||
              nationalFootballTeamsFacts?.sourceUrl ||
              sourceUrl,
        biographyFacts,
        sourceLadder: mergedSourceLadder,
      };
      if (
        identitySourceChanged ||
        JSON.stringify(existingMetadata.identityDisambiguation || null) !==
          JSON.stringify(wikidataFacts.disambiguation)
      ) {
        fieldsAdded.push("profile.identityDisambiguation");
      }
      profile.updatedAt = nowIso;
      raw.card.profile = profile;

      if (!args.externalFactsOnly && !summary?.extract) {
        warnings.push("wikipedia_summary_missing");
      }
      if (!args.externalFactsOnly && !wikitext) {
        warnings.push("wikipedia_wikitext_missing");
      }
      if (!args.externalFactsOnly && usedWikidataFallback) {
        warnings.push("wikidata_resolution_failed_fallback");
      }
      if (!nextClubHistory.length) warnings.push("club_history_not_found");
      if (!profile.footedness) warnings.push("footedness_not_found");
      if (!args.identityOnly && !args.skipClubOfficial && !clubOfficialFacts) {
        warnings.push("club_official_profile_not_found");
      }
      if (
        !args.identityOnly &&
        !args.externalFactsOnly &&
        !transfermarktFacts &&
        wikidataSourceLadder.transfermarkt
      ) {
        warnings.push("transfermarkt_fetch_failed");
      }
      if (args.identityOnly) {
        warnings.push("identity_only_mode");
      } else if (args.skipFbref) {
        warnings.push("fbref_skipped");
      } else if (fbrefFacts?.blocked) {
        warnings.push("fbref_fetch_blocked");
      } else if (!fbrefFacts && wikidataSourceLadder.fbref) {
        warnings.push("fbref_fetch_failed");
      }
      if (args.identityOnly) {
        // no-op
      } else if (args.skipSoccerway) {
        warnings.push("soccerway_skipped");
      } else if (!soccerwayFacts && wikidataSourceLadder.soccerway) {
        warnings.push("soccerway_fetch_failed");
      } else if (soccerwayFacts && !soccerwayFacts.exposesStaticCareerData) {
        warnings.push("soccerway_static_profile_limited");
      }
      if (args.identityOnly) {
        // no-op
      } else if (args.skipFootballDatabase) {
        warnings.push("football_database_skipped");
      } else if (args.onlyCachedFootballDatabase && !footballDatabaseFacts) {
        warnings.push("football_database_cache_missing");
      } else if (!footballDatabaseFacts && wikidataSourceLadder.footballDatabase) {
        warnings.push("football_database_fetch_failed");
      }

      results.push({
        sportsPersonId: raw.card.sportsPersonId,
        displayName,
        teamCanonicalName: raw.team.team.canonicalName,
        seedRank: target.seedRank,
        applied: fieldsAdded.length > 0,
        biographySourceUrl: raw.card.profile?.biographySourceUrl || null,
        wikidataEntityId: wikidataFacts.qid,
        sourceLadderUrls: mergedSourceLadder,
        fieldsAdded,
        warnings,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      results.push({
        sportsPersonId: target.sportsPersonId,
        displayName,
        teamCanonicalName: target.teamCanonicalName,
        seedRank: target.seedRank,
        applied: false,
        biographySourceUrl: raw.card.profile?.biographySourceUrl || null,
        wikidataEntityId: null,
        sourceLadderUrls: {},
        fieldsAdded: [],
        warnings: [message],
      });
      continue;
    }
  }

  if (args.apply) {
    await fs.writeFile(
      snapshotPath,
      `${JSON.stringify(rawSnapshot, null, 2)}\n`,
      "utf8",
    );
  }

  await flushJsonCacheIfDirty(args.cachePath, cache);

  const refreshedSnapshot = args.apply
    ? await readFootballWorldCupJournalistSnapshot()
    : normalizedSnapshot;
  const refreshedProgram = refreshedSnapshot
    ? buildFootballWorldCupDossierProgram(
        refreshedSnapshot,
        humanInterestPayload?.records || [],
      )
    : dossierProgram;

  const report = {
    generatedAt: nowIso,
    apply: args.apply,
    scope: args.scope,
    targetCount: targets.length,
    appliedCount: results.filter((item) => item.applied).length,
    snapshotPath,
    summaryBefore: dossierProgram.summary,
    summaryAfter: refreshedProgram.summary,
    results,
  };

  await fs.mkdir(path.dirname(args.outPath), { recursive: true });
  await fs.writeFile(args.outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
