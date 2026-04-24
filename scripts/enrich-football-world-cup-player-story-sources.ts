import fs from "node:fs/promises";
import path from "node:path";
import { buildFootballWorldCupDossierProgram } from "@/lib/football-world-cup-dossier-program";
import type { HumanInterestPilotRecord } from "@/lib/football-world-cup-human-interest";
import { readFootballWorldCupHumanInterestPilotCanonical } from "@/lib/football-world-cup-human-interest-store";
import {
  readFootballWorldCupJournalistSnapshot,
  resolveFootballWorldCupJournalistSnapshotPath,
  type FootballWorldCupJournalistSnapshot,
  type JournalistPersonCard,
} from "@/lib/football-world-cup-journalist-store";

type ScopeMode = "all" | "target-completeness";

type Args = {
  apply: boolean;
  scope: ScopeMode;
  outPath: string;
};

type StorySourceEntry = {
  lane:
    | "official_voice"
    | "feature_profile"
    | "public_context"
    | "broadcast"
    | "storyline";
  title: string;
  summary: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  sourceTier: string | null;
  sourceKind: string | null;
  observedAt: string | null;
};

type StorySourceLayer = {
  summary: {
    totalUsableSourceCount: number;
    officialVoiceCount: number;
    featureProfileCount: number;
    publicContextCount: number;
    storylineCount: number;
    broadcastCount: number;
    majorPressSourceCount: number;
    databaseProfileCount: number;
    reportedFallbackCount: number;
    officialAnchorCount: number;
    referenceOnlyCount: number;
    qualityScore: number;
    qualityGrade: "strong" | "usable" | "thin";
    qualitySignals: string[];
  };
  leadNarratives: string[];
  officialVoices: StorySourceEntry[];
  featureProfiles: StorySourceEntry[];
  publicContextSources: StorySourceEntry[];
  broadcastAppearances: StorySourceEntry[];
  storylineSources: StorySourceEntry[];
};

type StorySourceSeedRecord = {
  teamCanonicalName: string;
  personCanonicalName: string;
  entries: StorySourceEntry[];
};

const BIG_FIVE_LEAGUE_CLUBS: Record<string, string[]> = {
  "Premier League": [
    "arsenal",
    "aston villa",
    "bournemouth",
    "brentford",
    "brighton & hove albion",
    "burnley",
    "chelsea",
    "crystal palace",
    "everton",
    "fulham",
    "leeds united",
    "liverpool",
    "manchester city",
    "manchester united",
    "newcastle united",
    "nottingham forest",
    "sunderland",
    "tottenham hotspur",
    "tottenham hotspur fc",
    "west ham united",
    "wolverhampton wanderers",
    "wolves",
  ],
  "La Liga": [
    "alaves",
    "alavés",
    "athletic bilbao",
    "athletic club",
    "atletico madrid",
    "atlético madrid",
    "barcelona",
    "betis",
    "real betis",
    "celta de vigo",
    "elche",
    "espanyol",
    "getafe",
    "girona",
    "levante",
    "mallorca",
    "osasuna",
    "rayo vallecano",
    "real madrid",
    "real oviedo",
    "real sociedad",
    "real sociedad san sebastian",
    "sevilla",
    "valencia",
    "villarreal",
  ],
  Bundesliga: [
    "bayern munich",
    "fc bayern munich",
    "borussia dortmund",
    "bayer leverkusen",
    "rb leipzig",
    "eintracht frankfurt",
    "vfb stuttgart",
    "sc freiburg",
    "mainz 05",
    "werder bremen",
    "borussia mönchengladbach",
    "borussia monchengladbach",
    "fc augsburg",
    "tsg hoffenheim",
    "vfl wolfsburg",
    "hamburger sv",
    "hamburg",
    "fc st. pauli",
    "st. pauli",
    "union berlin",
    "1. fc köln",
    "koln",
    "köln",
    "heidenheim",
  ],
  "Serie A": [
    "ac milan",
    "inter milan",
    "internazionale",
    "juventus",
    "roma",
    "as roma",
    "napoli",
    "atalanta",
    "bologna",
    "fiorentina",
    "genoa",
    "como",
    "sassuolo",
    "torino",
    "parma",
    "cagliari",
    "cremonese",
    "lazio",
    "lecce",
    "pisa",
    "udinese",
    "verona",
  ],
  "Ligue 1": [
    "paris saint-germain",
    "psg",
    "monaco",
    "marseille",
    "olympique marseille",
    "lyon",
    "olympique lyonnais",
    "lille",
    "nice",
    "strasbourg",
    "racing strasbourg",
    "toulouse",
    "le havre",
    "lens",
    "rennes",
    "nantes",
    "brest",
    "lorient",
    "metz",
    "angers",
    "auxerre",
    "paris fc",
  ],
};

const BIG_FIVE_CLUB_TO_LEAGUE = new Map(
  Object.entries(BIG_FIVE_LEAGUE_CLUBS).flatMap(([league, clubs]) =>
    clubs.map((club) => [normalizeClubKey(club), league] as const),
  ),
);

function normalizeText(value: string | null | undefined): string | null {
  const next = (value || "").trim();
  return next || null;
}

function normalizeClubKey(value: string | null | undefined): string {
  return (value || "")
    .toLocaleLowerCase("en-US")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bf\.c\.?\b/g, "fc")
    .replace(/[^a-z0-9&. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function currentClubForLeagueLookup(value: string | null | undefined): string | null {
  const currentClub = normalizeText(value);
  if (!currentClub) return null;
  return normalizeText(
    currentClub
      .replace(/\s*\(on loan from .+?\)\s*/i, "")
      .replace(/\s*on loan from .+$/i, "")
      .replace(/\s*,\s*(England|France|Spain|Italy|Germany)$/i, ""),
  );
}

function resolveBigFiveLeague(card: JournalistPersonCard): string | null {
  const currentClub = currentClubForLeagueLookup(card.currentClub);
  if (!currentClub) return null;
  return BIG_FIVE_CLUB_TO_LEAGUE.get(normalizeClubKey(currentClub)) || null;
}

function isSelectedForCurrentRoster(card: JournalistPersonCard): boolean {
  const status =
    card.statusPanel?.latestSelectionStatus?.claimValue?.status ||
    card.statusPanel?.currentStatus?.claimValue?.selectionStatus;
  return status === "selected";
}

function buildLookupKey(teamCanonicalName: string, personCanonicalName: string): string {
  return `${teamCanonicalName}::${personCanonicalName}`
    .toLocaleLowerCase("en-US")
    .trim();
}

function parseArgs(argv: string[]): Args {
  let apply = false;
  let scope: ScopeMode = "target-completeness";
  let outPath = path.join(
    process.cwd(),
    "output",
    "football-world-cup-story-source-layer",
    "latest.json",
  );

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg.startsWith("--scope=")) {
      const value = arg.slice("--scope=".length);
      if (value === "all" || value === "target-completeness") {
        scope = value;
      }
      continue;
    }
    if (arg.startsWith("--out=")) {
      outPath = path.resolve(process.cwd(), arg.slice("--out=".length));
    }
  }

  return { apply, scope, outPath };
}

function buildHumanInterestLookupKey(
  teamCanonicalName: string,
  personCanonicalName: string,
): string {
  return buildLookupKey(teamCanonicalName, personCanonicalName);
}

function buildHumanInterestLookup(
  records: HumanInterestPilotRecord[],
): Map<string, HumanInterestPilotRecord> {
  return new Map(
    records.map((record) => [
      buildHumanInterestLookupKey(
        record.teamCanonicalName,
        record.personCanonicalName,
      ),
      record,
    ]),
  );
}

function resolveHumanInterestRecord(
  teamCanonicalName: string,
  card: JournalistPersonCard,
  lookup: Map<string, HumanInterestPilotRecord>,
): HumanInterestPilotRecord | null {
  return (
    lookup.get(buildHumanInterestLookupKey(teamCanonicalName, card.canonicalName)) ||
    lookup.get(buildHumanInterestLookupKey(teamCanonicalName, card.displayName)) ||
    null
  );
}

function isBroadcastLike(entry: {
  title?: string | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  sourceKind?: string | null;
  summary?: string | null;
}): boolean {
  const haystack = [
    entry.title,
    entry.sourceLabel,
    entry.sourceUrl,
    entry.sourceKind,
    entry.summary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en-US");
  return /\btv\b|television|video|watch|youtube|podcast|interview|press conference|broadcast|espn|tnt|sky sports|fox sports|bein|canal\+|dazn|stream/i.test(
    haystack,
  );
}

function isOfficialVoiceLike(entry: StorySourceEntry): boolean {
  if (entry.sourceTier !== "official" && entry.sourceTier !== "reported") {
    return false;
  }
  const haystack = [
    entry.title,
    entry.summary,
    entry.sourceLabel,
    entry.sourceKind,
    entry.sourceUrl,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en-US");
  return /interview|press conference|reaction|speaks|says|quote|video|citytv|mutv|tv|conference/.test(
    haystack,
  );
}

function dedupeEntries(entries: StorySourceEntry[]): StorySourceEntry[] {
  const seen = new Set<string>();
  const next: StorySourceEntry[] = [];
  for (const entry of entries) {
    const title = normalizeText(entry.title);
    const sourceUrl = normalizeText(entry.sourceUrl);
    if (!title) continue;
    const key = [
      entry.lane,
      sourceUrl?.toLocaleLowerCase("en-US") ||
        title.toLocaleLowerCase("en-US"),
    ].join("::");
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({
      ...entry,
      title,
      summary: normalizeText(entry.summary),
      sourceLabel: normalizeText(entry.sourceLabel),
      sourceUrl,
      sourceTier: normalizeText(entry.sourceTier),
      sourceKind: normalizeText(entry.sourceKind),
      observedAt: normalizeText(entry.observedAt),
    });
  }
  return next;
}

function sourceLabelFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (hostname.includes("realmadrid.com")) return "Real Madrid";
    if (hostname.includes("liverpoolfc.com")) return "Liverpool FC";
    if (hostname.includes("tottenhamhotspur.com")) return "Tottenham Hotspur";
    if (hostname.includes("chelseafc.com")) return "Chelsea FC";
    if (hostname.includes("acmilan.com")) return "AC Milan";
    if (hostname.includes("fcbarcelona.com")) return "FC Barcelona";
    if (hostname.includes("mancity.com")) return "Manchester City";
    if (hostname.includes("manutd.com")) return "Manchester United";
    if (hostname.includes("psg.fr")) return "Paris Saint-Germain";
    if (hostname.includes("avfc.co.uk")) return "Aston Villa";
    if (hostname.includes("wolves.co.uk")) return "Wolverhampton Wanderers";
    if (hostname.includes("slbenfica.pt")) return "SL Benfica";
    if (hostname.includes("atleticodemadrid.com")) return "Atlético de Madrid";
    if (hostname.includes("fifa.com")) return "FIFA";
    return hostname;
  } catch {
    return null;
  }
}

function buildClubProfileEntries(card: JournalistPersonCard): StorySourceEntry[] {
  const personLabel = normalizeText(card.displayName) || card.canonicalName;
  const metadata =
    typeof card.profile?.metadata === "object" && card.profile?.metadata
      ? (card.profile.metadata as Record<string, unknown>)
      : {};
  const sourceLadder =
    typeof metadata.sourceLadder === "object" && metadata.sourceLadder
      ? (metadata.sourceLadder as Record<string, unknown>)
      : {};
  const clubProfileUrl =
    typeof sourceLadder.clubOfficialBiography === "string"
      ? normalizeText(sourceLadder.clubOfficialBiography)
      : null;
  if (!clubProfileUrl) return [];
  return [
    {
      lane: "feature_profile",
      title: `${personLabel} official club profile`,
      summary:
        "Official club biography/profile page for background, career path, and squad-context reporting.",
      sourceLabel: sourceLabelFromUrl(clubProfileUrl) || "Club official profile",
      sourceUrl: clubProfileUrl,
      sourceTier: "official",
      sourceKind: "club_official_biography",
      observedAt: null,
    },
  ];
}

function buildPromotedResearchEntries(
  card: JournalistPersonCard,
  record: HumanInterestPilotRecord | null,
): StorySourceEntry[] {
  const personLabel = normalizeText(card.displayName) || card.canonicalName;
  const notes = record?.researchNotes || [];
  const promoted: StorySourceEntry[] = [];

  for (const note of notes) {
    if (note.noteType !== "manual_follow_up") continue;
    const sourceUrl = normalizeText(note.evidenceUrl);
    const sourceLabel = normalizeText(note.sourceLabel);
    if (!sourceUrl || !sourceLabel) continue;
    if (
      sourceLabel === "Wikipedia" ||
      sourceLabel === "National Football Teams" ||
      sourceLabel === "Transfermarkt"
    ) {
      continue;
    }
    const lowerLabel = sourceLabel.toLocaleLowerCase("en-US");
    promoted.push({
      lane:
        /video|tv|youtube|interview/.test(lowerLabel) || /\/videos?\//.test(sourceUrl)
          ? "broadcast"
          : "feature_profile",
      title: `${personLabel}: ${sourceLabel}`,
      summary: normalizeText(note.text),
      sourceLabel,
      sourceUrl,
      sourceTier:
        /official|club|fifa|uefa|federation|realmadrid|benfica|milan|psg|city|united|liverpool|barcelona|wolves|villa|atl.tico/i.test(
          sourceLabel,
        ) || /^https?:\/\/([^/]+\.)?(realmadrid|liverpoolfc|tottenhamhotspur|chelseafc|acmilan|fcbarcelona|mancity|manutd|psg|avfc|wolves|slbenfica|atleticodemadrid|fifa)\./i.test(
          sourceUrl,
        )
          ? "official"
          : "major_press",
      sourceKind: lowerLabel.includes("interview")
        ? "manual_follow_up_interview"
        : "manual_follow_up_feature",
      observedAt: null,
    });
  }

  return promoted;
}

function buildTopTierReferenceEntries(
  card: JournalistPersonCard,
  seedRank: number | null,
  isBigFivePriority: boolean,
): StorySourceEntry[] {
  if ((!seedRank || seedRank > 500) && !isBigFivePriority) return [];
  const metadata =
    typeof card.profile?.metadata === "object" && card.profile?.metadata
      ? (card.profile.metadata as Record<string, unknown>)
      : {};
  const sourceLadder =
    typeof metadata.sourceLadder === "object" && metadata.sourceLadder
      ? (metadata.sourceLadder as Record<string, unknown>)
      : {};
  const personLabel = normalizeText(card.displayName) || card.canonicalName;
  const entries: StorySourceEntry[] = [];
  const wikidataUrl =
    typeof sourceLadder.wikidata === "string"
      ? normalizeText(sourceLadder.wikidata)
      : normalizeText(metadata.wikidataEntityUrl as string | null);
  if (wikidataUrl) {
    entries.push({
      lane: "public_context",
      title: `${personLabel} Wikidata entity`,
      summary:
        "Structured identity source for entity resolution, external identifiers, birth data, and cross-source profile matching.",
      sourceLabel: "Wikidata",
      sourceUrl: wikidataUrl,
      sourceTier: "reference",
      sourceKind: "structured_identity_profile",
      observedAt: null,
    });
  }

  const nationalFootballTeamsUrl =
    typeof sourceLadder.nationalFootballTeams === "string"
      ? normalizeText(sourceLadder.nationalFootballTeams)
      : null;
  if (nationalFootballTeamsUrl) {
    entries.push({
      lane: "public_context",
      title: `${personLabel} national-team profile`,
      summary:
        "National-team appearance and career ledger for timeline, selection, and milestone context.",
      sourceLabel: "National Football Teams",
      sourceUrl: nationalFootballTeamsUrl,
      sourceTier: "reference",
      sourceKind: "national_team_profile",
      observedAt: null,
    });
  }

  const wikipediaUrl =
    typeof sourceLadder.wikipedia === "string"
      ? normalizeText(sourceLadder.wikipedia)
      : normalizeText(card.profile?.biographySourceUrl);
  if (wikipediaUrl && !entries.some((entry) => entry.sourceUrl === wikipediaUrl)) {
    entries.push({
      lane: "feature_profile",
      title: `${personLabel} public biography profile`,
      summary:
        "Public biography page used as a discovery index for early-life, club-path, and background reporting.",
      sourceLabel: "Wikipedia",
      sourceUrl: wikipediaUrl,
      sourceTier: "wiki_hint",
      sourceKind: "public_biography_index",
      observedAt: null,
    });
  }

  return entries;
}

function buildDatabaseProfileEntries(
  card: JournalistPersonCard,
  seedRank: number | null,
  isBigFivePriority: boolean,
): StorySourceEntry[] {
  if ((!seedRank || seedRank > 500) && !isBigFivePriority) return [];
  const metadata =
    typeof card.profile?.metadata === "object" && card.profile?.metadata
      ? (card.profile.metadata as Record<string, unknown>)
      : {};
  const sourceLadder =
    typeof metadata.sourceLadder === "object" && metadata.sourceLadder
      ? (metadata.sourceLadder as Record<string, unknown>)
      : {};
  const personLabel = normalizeText(card.displayName) || card.canonicalName;
  const entries: StorySourceEntry[] = [];
  const officialWebsiteUrl =
    typeof sourceLadder.officialWebsite === "string"
      ? normalizeText(sourceLadder.officialWebsite)
      : null;
  if (officialWebsiteUrl) {
    entries.push({
      lane: "feature_profile",
      title: `${personLabel} official website/profile`,
      summary:
        "Official player or club-linked profile source for first-party biography and public identity context.",
      sourceLabel: sourceLabelFromUrl(officialWebsiteUrl) || "Official website",
      sourceUrl: officialWebsiteUrl,
      sourceTier: "official",
      sourceKind: "official_website_profile",
      observedAt: null,
    });
  }

  const profileSources = [
    {
      key: "fbref",
      label: "FBref",
      kind: "stat_profile",
      summary:
        "Stat profile source for position, physical data, club/national-team context, and performance splits.",
    },
    {
      key: "transfermarkt",
      label: "Transfermarkt",
      kind: "market_contract_profile",
      summary:
        "Career and market profile source for club history, contract, agent, position, and transfer context.",
    },
    {
      key: "soccerway",
      label: "Soccerway",
      kind: "competition_history_profile",
      summary:
        "Competition-history source for club chronology, match logs, transfers, and career timeline checks.",
    },
    {
      key: "footballDatabase",
      label: "FootballDatabase",
      kind: "career_database_profile",
      summary:
        "Career database source for squad, position, nationality, club chronology, and historical profile checks.",
    },
    {
      key: "lequipe",
      label: "L'Équipe",
      kind: "sports_database_profile",
      summary:
        "Sports database profile source for French-language biographical, club, and career-context checks.",
    },
  ] as const;

  for (const source of profileSources) {
    const ladderValue = sourceLadder[source.key];
    const sourceUrl =
      typeof ladderValue === "string" ? normalizeText(ladderValue) : null;
    if (!sourceUrl) continue;
    entries.push({
      lane: "public_context",
      title: `${personLabel} ${source.label} profile`,
      summary: source.summary,
      sourceLabel: source.label,
      sourceUrl,
      sourceTier: "commercial_db",
      sourceKind: source.kind,
      observedAt: null,
    });
  }

  return entries;
}

function readOfficialSelectionAnchor(
  card: JournalistPersonCard,
  seedRank: number | null,
  isBigFivePriority: boolean,
): StorySourceEntry[] {
  if ((!seedRank || seedRank > 500) && !isBigFivePriority) return [];
  const personLabel = normalizeText(card.displayName) || card.canonicalName;
  const latestSelectionStatus = card.statusPanel?.latestSelectionStatus as
    | Record<string, unknown>
    | undefined;
  const currentStatus = card.statusPanel?.currentStatus as
    | Record<string, unknown>
    | undefined;
  const candidate = latestSelectionStatus || currentStatus;
  const sourceUrl =
    typeof candidate?.sourceUrl === "string"
      ? normalizeText(candidate.sourceUrl)
      : null;
  const sourceLabel =
    typeof candidate?.sourceLabel === "string"
      ? normalizeText(candidate.sourceLabel)
      : null;
  const source =
    typeof candidate?.source === "string" ? normalizeText(candidate.source) : null;
  if (!sourceUrl || !sourceLabel) return [];
  if (
    source !== "official_team_source" &&
    !/official|federation|association|soccer|football|afa|fifa|uefa|concacaf/i.test(
      sourceLabel,
    )
  ) {
    return [];
  }

  return [
    {
      lane: "official_voice",
      title: `${personLabel} official selection source`,
      summary:
        "Official team or federation roster source anchoring selection status, role, and follow-up reporting context. This is an official source anchor, not a direct spoken quote.",
      sourceLabel,
      sourceUrl,
      sourceTier: "official",
      sourceKind: "official_selection_anchor",
      observedAt:
        (typeof candidate?.effectiveAt === "string"
          ? normalizeText(candidate.effectiveAt)
          : null) ||
        (typeof candidate?.madeAt === "string" ? normalizeText(candidate.madeAt) : null),
    },
  ];
}

function isOfficialAnchor(entry: StorySourceEntry): boolean {
  return entry.sourceKind === "official_selection_anchor";
}

function isReportedFallback(entry: StorySourceEntry): boolean {
  return /pending_official_replacement|reported_quote/.test(entry.sourceKind || "");
}

function isReferenceOnly(entry: StorySourceEntry): boolean {
  return entry.sourceTier === "reference" || entry.sourceTier === "wiki_hint";
}

function computeStorySourceQuality(layer: {
  officialVoices: StorySourceEntry[];
  featureProfiles: StorySourceEntry[];
  publicContextSources: StorySourceEntry[];
  broadcastAppearances: StorySourceEntry[];
  storylineSources: StorySourceEntry[];
}): Pick<
  StorySourceLayer["summary"],
  | "reportedFallbackCount"
  | "officialAnchorCount"
  | "referenceOnlyCount"
  | "databaseProfileCount"
  | "qualityScore"
  | "qualityGrade"
  | "qualitySignals"
> {
  const allEntries = dedupeEntries([
    ...layer.officialVoices,
    ...layer.featureProfiles,
    ...layer.publicContextSources,
    ...layer.storylineSources,
  ]);
  const directOfficialVoiceCount = layer.officialVoices.filter(
    (entry) => entry.sourceTier === "official" && !isOfficialAnchor(entry),
  ).length;
  const officialAnchorCount = layer.officialVoices.filter(isOfficialAnchor).length;
  const officialFeatureCount = layer.featureProfiles.filter(
    (entry) => entry.sourceTier === "official",
  ).length;
  const majorPressSourceCount = [...layer.featureProfiles, ...layer.publicContextSources].filter(
    (entry) => entry.sourceTier === "major_press",
  ).length;
  const databaseProfileCount = [...layer.featureProfiles, ...layer.publicContextSources].filter(
    (entry) => entry.sourceTier === "commercial_db",
  ).length;
  const reportedFallbackCount = allEntries.filter(isReportedFallback).length;
  const referenceOnlyCount = allEntries.filter(isReferenceOnly).length;
  const hasOnlyReferenceSources =
    allEntries.length > 0 && allEntries.every((entry) => isReferenceOnly(entry));

  const qualityScore = Math.max(
    0,
    Math.min(
      100,
      directOfficialVoiceCount * 30 +
        officialAnchorCount * 16 +
        officialFeatureCount * 18 +
        majorPressSourceCount * 16 +
        databaseProfileCount * 4 +
        layer.storylineSources.length * 8 +
        layer.broadcastAppearances.length * 8 +
        layer.publicContextSources.filter((entry) => entry.sourceTier === "reported").length * 5 -
        reportedFallbackCount * 8 -
        (hasOnlyReferenceSources ? 18 : 0),
    ),
  );
  const qualityGrade =
    qualityScore >= 55 ? "strong" : qualityScore >= 24 ? "usable" : "thin";
  const qualitySignals = [
    directOfficialVoiceCount > 0 ? "direct official voice" : null,
    officialAnchorCount > 0 ? "official roster/source anchor" : null,
    officialFeatureCount > 0 ? "official profile/article" : null,
    majorPressSourceCount > 0 ? "major press profile/context" : null,
    databaseProfileCount > 0 ? "database/stat profile coverage" : null,
    layer.storylineSources.length > 0 ? "live storyline evidence" : null,
    layer.broadcastAppearances.length > 0 ? "broadcast/video/interview trail" : null,
    reportedFallbackCount > 0 ? "reported quote pending official replacement" : null,
    hasOnlyReferenceSources ? "reference-only dossier" : null,
  ].filter(Boolean) as string[];

  return {
    reportedFallbackCount,
    officialAnchorCount,
    referenceOnlyCount,
    databaseProfileCount,
    qualityScore,
    qualityGrade,
    qualitySignals,
  };
}

async function readStorySourceSeedLookup(): Promise<Map<string, StorySourceEntry[]>> {
  const seedPath = path.join(
    process.cwd(),
    "data",
    "football-world-cup-narrative-source-seeds.json",
  );
  try {
    const raw = JSON.parse(await fs.readFile(seedPath, "utf8")) as {
      records?: StorySourceSeedRecord[];
    };
    return new Map(
      (raw.records || []).map((record) => [
        buildLookupKey(record.teamCanonicalName, record.personCanonicalName),
        dedupeEntries(record.entries || []),
      ]),
    );
  } catch {
    return new Map();
  }
}

function topLeadNarratives(layer: Omit<StorySourceLayer, "summary" | "leadNarratives">): string[] {
  return dedupeEntries([
    ...layer.featureProfiles,
    ...layer.publicContextSources,
    ...layer.officialVoices,
    ...layer.storylineSources,
  ])
    .map((entry) => entry.title)
    .slice(0, 8);
}

function buildStorySourceLayer(
  card: JournalistPersonCard,
  record: HumanInterestPilotRecord | null,
  seededEntries: StorySourceEntry[],
  seedRank: number | null,
  isBigFivePriority: boolean,
): StorySourceLayer {
  const clubProfileEntries = buildClubProfileEntries(card);
  const promotedResearchEntries = buildPromotedResearchEntries(card, record);
  const topTierReferenceEntries = buildTopTierReferenceEntries(
    card,
    seedRank,
    isBigFivePriority,
  );
  const databaseProfileEntries = buildDatabaseProfileEntries(
    card,
    seedRank,
    isBigFivePriority,
  );
  const seededOfficialVoiceEntries = seededEntries
    .filter((entry) => entry.lane === "broadcast" && isOfficialVoiceLike(entry))
    .map((entry) => ({
      ...entry,
      lane: "official_voice" as const,
    }));

  const directOfficialVoices = dedupeEntries([
    ...card.officialAppearanceTimeline.map((appearance) => ({
      lane: "official_voice" as const,
      title: appearance.title,
      summary: appearance.summary,
      sourceLabel: appearance.sourceLabel || appearance.outletName || appearance.publisherName,
      sourceUrl: appearance.url,
      sourceTier: "official",
      sourceKind: appearance.appearanceType,
      observedAt: appearance.appearanceDate,
    })),
    ...(record?.liveHooks || [])
      .filter((item) =>
        item.hookType === "coach_quote" || item.hookType === "official_interview",
      )
      .map((item) => ({
        lane: "official_voice" as const,
        title: item.headline,
        summary: item.summary,
        sourceLabel: item.sourceLabel,
        sourceUrl: item.sourceUrl,
        sourceTier: item.sourceTier,
        sourceKind: item.hookType,
        observedAt: item.observedAt,
      })),
    ...seededEntries.filter((entry) => entry.lane === "official_voice"),
    ...promotedResearchEntries.filter((entry) => entry.lane === "official_voice"),
    ...seededOfficialVoiceEntries,
  ]);
  const hasOfficialVoiceOrAnchor = directOfficialVoices.some(
    (entry) => entry.sourceTier === "official",
  );
  const officialVoices = dedupeEntries([
    ...directOfficialVoices,
    ...(!hasOfficialVoiceOrAnchor
      ? readOfficialSelectionAnchor(card, seedRank, isBigFivePriority)
      : []),
  ]);

  const featureProfiles = dedupeEntries(
    [
      ...(record?.featureAngles || [])
        .filter((item) => item.reviewStatus !== "blocked")
        .map((item) => ({
          lane: "feature_profile" as const,
          title: item.headline,
          summary: item.summary || item.claimText,
          sourceLabel: item.sourceLabel,
          sourceUrl: item.sourceUrl,
          sourceTier: item.sourceTier,
          sourceKind: item.claimType,
          observedAt: null,
        })),
      ...clubProfileEntries,
      ...databaseProfileEntries.filter((entry) => entry.lane === "feature_profile"),
      ...promotedResearchEntries.filter((entry) => entry.lane === "feature_profile"),
      ...seededEntries.filter((entry) => entry.lane === "feature_profile"),
      ...topTierReferenceEntries.filter((entry) => entry.lane === "feature_profile"),
    ],
  );

  const publicContextSources = dedupeEntries(
    [
      ...(record?.publicPersonalContext || [])
        .filter((item) => item.reviewStatus !== "blocked")
        .map((item) => ({
          lane: "public_context" as const,
          title: item.headline,
          summary: item.summary,
          sourceLabel: item.sourceLabel,
          sourceUrl: item.sourceUrl,
          sourceTier: item.sourceTier,
          sourceKind: item.claimType,
          observedAt: null,
      })),
      ...promotedResearchEntries.filter((entry) => entry.lane === "public_context"),
      ...databaseProfileEntries.filter((entry) => entry.lane === "public_context"),
      ...seededEntries.filter((entry) => entry.lane === "public_context"),
      ...topTierReferenceEntries.filter((entry) => entry.lane === "public_context"),
    ],
  );

  const storylineSources = dedupeEntries([
    ...card.storylineList.map((storyline) => ({
      lane: "storyline" as const,
      title: storyline.title,
      summary: storyline.summary || storyline.topicSnippet,
      sourceLabel: storyline.sourceLabel,
      sourceUrl: storyline.sourceUrl || storyline.articles.find((item) => item.url)?.url || null,
      sourceTier: "reported",
      sourceKind: storyline.storyType,
      observedAt: storyline.lastSeenAt || storyline.firstSeenAt,
    })),
    ...card.storylineList.flatMap((storyline) =>
      storyline.articles
        .filter((article) => article.isRepresentative || article.relevanceScore >= 0.6)
        .slice(0, 2)
        .map((article) => ({
          lane: "storyline" as const,
          title: article.title || storyline.title,
          summary: article.snippet || storyline.summary,
          sourceLabel: article.source,
          sourceUrl: article.url,
          sourceTier: "reported",
          sourceKind: storyline.storyType,
          observedAt: article.publicationDatetime,
        })),
    ),
  ]);

  const broadcastAppearances = dedupeEntries(
    [
      ...officialVoices,
      ...featureProfiles,
      ...storylineSources,
      ...promotedResearchEntries.filter((entry) => entry.lane === "broadcast"),
      ...seededEntries.filter((entry) => entry.lane === "broadcast"),
    ].filter((entry) => isBroadcastLike(entry))
      .map((entry) => ({
        ...entry,
        lane: "broadcast" as const,
      })),
  );

  const layerWithoutSummary = {
    officialVoices,
    featureProfiles,
    publicContextSources,
    broadcastAppearances,
    storylineSources,
  };

  const majorPressSourceCount = [...featureProfiles, ...publicContextSources].filter(
    (entry) => entry.sourceTier === "major_press",
  ).length;
  const databaseProfileCount = [...featureProfiles, ...publicContextSources].filter(
    (entry) => entry.sourceTier === "commercial_db",
  ).length;
  const sourceQuality = computeStorySourceQuality(layerWithoutSummary);

  return {
    summary: {
      totalUsableSourceCount:
        officialVoices.length +
        featureProfiles.length +
        publicContextSources.length +
        storylineSources.length,
      officialVoiceCount: officialVoices.length,
      featureProfileCount: featureProfiles.length,
      publicContextCount: publicContextSources.length,
      storylineCount: storylineSources.length,
      broadcastCount: broadcastAppearances.length,
      majorPressSourceCount,
      ...sourceQuality,
    },
    leadNarratives: topLeadNarratives(layerWithoutSummary),
    ...layerWithoutSummary,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const snapshotPath = resolveFootballWorldCupJournalistSnapshotPath();
  const rawSnapshot = JSON.parse(
    await fs.readFile(snapshotPath, "utf8"),
  ) as FootballWorldCupJournalistSnapshot;
  const snapshot = await readFootballWorldCupJournalistSnapshot();
  const humanInterestPayload =
    await readFootballWorldCupHumanInterestPilotCanonical();

  if (!snapshot || !snapshot.teams.length) {
    throw new Error("World Cup journalist snapshot unavailable.");
  }

  const program =
    args.scope === "target-completeness"
      ? buildFootballWorldCupDossierProgram(
          snapshot,
          humanInterestPayload?.records || [],
        )
      : null;
  const bigFiveSelectedIds = new Set<string>();
  for (const team of rawSnapshot.teams) {
    for (const card of team.playerCards) {
      if (isSelectedForCurrentRoster(card) && resolveBigFiveLeague(card)) {
        bigFiveSelectedIds.add(card.sportsPersonId);
      }
    }
  }

  const targetIds = program
    ? new Set(program.targetPlayers.map((item) => item.sportsPersonId))
    : null;
  for (const sportsPersonId of bigFiveSelectedIds) {
    targetIds?.add(sportsPersonId);
  }
  const seedRankById = program
    ? new Map(
        program.targetPlayers.map((item) => [
          item.sportsPersonId,
          item.seedRank,
        ]),
      )
    : new Map<string, number>();

  const humanInterestLookup = buildHumanInterestLookup(
    humanInterestPayload?.records || [],
  );
  const storySourceSeedLookup = await readStorySourceSeedLookup();

  const nowIso = new Date().toISOString();
  let targetCount = 0;
  let updatedCount = 0;
  let withStorySources = 0;
  let withOfficialVoices = 0;
  let withBroadcast = 0;
  let bigFiveTargetCount = 0;
  let bigFiveWithStorySources = 0;
  let bigFiveWithAtLeastFourSources = 0;
  const qualityGradeCounts: Record<string, number> = {};
  const thinPlayers: Array<{
    seedRank: number | null;
    teamCanonicalName: string;
    personCanonicalName: string;
    qualityScore: number;
    qualitySignals: string[];
  }> = [];
  const reportedFallbackPlayers: Array<{
    seedRank: number | null;
    teamCanonicalName: string;
    personCanonicalName: string;
    sources: Array<Pick<StorySourceEntry, "title" | "sourceLabel" | "sourceUrl" | "sourceKind">>;
  }> = [];

  for (const team of rawSnapshot.teams) {
    for (const card of team.playerCards) {
      if (targetIds && !targetIds.has(card.sportsPersonId)) continue;
      targetCount += 1;
      const bigFiveLeague = resolveBigFiveLeague(card);
      const isBigFivePriority = Boolean(
        isSelectedForCurrentRoster(card) && bigFiveLeague,
      );
      if (isBigFivePriority) bigFiveTargetCount += 1;

      if (!card.profile) continue;
      const metadata =
        (card.profile.metadata as Record<string, unknown> | null) || {};
      const record = resolveHumanInterestRecord(
        team.team.canonicalName,
        card,
        humanInterestLookup,
      );
      const seededEntries =
        storySourceSeedLookup.get(
          buildLookupKey(team.team.canonicalName, card.canonicalName),
        ) ||
        storySourceSeedLookup.get(
          buildLookupKey(team.team.canonicalName, card.displayName),
        ) ||
        [];
      const layer = buildStorySourceLayer(
        card,
        record,
        seededEntries,
        seedRankById.get(card.sportsPersonId) || null,
        isBigFivePriority,
      );
      const existingLayer = metadata.storySourceLayer || null;
      const nextLayerJson = JSON.stringify(layer);

      if (layer.summary.totalUsableSourceCount > 0) withStorySources += 1;
      if (layer.summary.officialVoiceCount > 0) withOfficialVoices += 1;
      if (layer.summary.broadcastCount > 0) withBroadcast += 1;
      if (isBigFivePriority && layer.summary.totalUsableSourceCount > 0) {
        bigFiveWithStorySources += 1;
      }
      if (isBigFivePriority && layer.summary.totalUsableSourceCount >= 4) {
        bigFiveWithAtLeastFourSources += 1;
      }
      qualityGradeCounts[layer.summary.qualityGrade] =
        (qualityGradeCounts[layer.summary.qualityGrade] || 0) + 1;
      if (layer.summary.qualityGrade === "thin") {
        thinPlayers.push({
          seedRank: seedRankById.get(card.sportsPersonId) || null,
          teamCanonicalName: team.team.canonicalName,
          personCanonicalName: card.canonicalName,
          qualityScore: layer.summary.qualityScore,
          qualitySignals: layer.summary.qualitySignals,
        });
      }
      if (layer.summary.reportedFallbackCount > 0) {
        reportedFallbackPlayers.push({
          seedRank: seedRankById.get(card.sportsPersonId) || null,
          teamCanonicalName: team.team.canonicalName,
          personCanonicalName: card.canonicalName,
          sources: layer.officialVoices
            .filter(isReportedFallback)
            .map((entry) => ({
              title: entry.title,
              sourceLabel: entry.sourceLabel,
              sourceUrl: entry.sourceUrl,
              sourceKind: entry.sourceKind,
            })),
        });
      }

      if (JSON.stringify(existingLayer) !== nextLayerJson) {
        card.profile.metadata = {
          ...metadata,
          storySourceLayer: layer,
          storySourceSummary: layer.summary,
          storySourceUpdatedAt: nowIso,
        };
        card.profile.updatedAt = nowIso;
        updatedCount += 1;
      }
    }
  }

  if (args.apply) {
    await fs.writeFile(
      snapshotPath,
      `${JSON.stringify(rawSnapshot, null, 2)}\n`,
      "utf8",
    );
  }

  const report = {
    generatedAt: nowIso,
    apply: args.apply,
    scope: args.scope,
    targetCount,
    updatedCount,
    withStorySources,
    withOfficialVoices,
    withBroadcast,
    bigFiveTargetCount,
    bigFiveWithStorySources,
    bigFiveWithAtLeastFourSources,
    qualityGradeCounts,
    thinPlayers,
    reportedFallbackPlayers,
    snapshotPath,
  };

  await fs.mkdir(path.dirname(args.outPath), { recursive: true });
  await fs.writeFile(args.outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
