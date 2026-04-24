import type { HumanInterestPilotRecord } from "@/lib/football-world-cup-human-interest";
import type { JournalistPersonCard } from "@/lib/football-world-cup-journalist-store";

export type FootballWorldCupDossierFieldCategory =
  | "identity"
  | "physical"
  | "football_identity"
  | "career"
  | "public_context"
  | "newsroom_hooks";

export type FootballWorldCupDossierFieldId =
  | "full_name"
  | "local_name"
  | "birth_date"
  | "birth_place"
  | "primary_nationality"
  | "eligibility"
  | "height_cm"
  | "weight_kg"
  | "preferred_foot"
  | "primary_position"
  | "secondary_positions"
  | "current_club"
  | "squad_number"
  | "youth_clubs"
  | "senior_club_history"
  | "national_team_debut"
  | "captaincy"
  | "family_background"
  | "languages"
  | "education_or_dual_path"
  | "hometown_or_community"
  | "injury_status"
  | "transfer_status"
  | "role_change"
  | "controversy_watch"
  | "official_quote"
  | "rumor_score";

export type FootballWorldCupDossierSourceTier =
  | "tier1_anchor"
  | "tier2_reference"
  | "tier3_backfill"
  | "tier4_hint";

export type FootballWorldCupDossierSourceId =
  | "federation_official_profile"
  | "club_official_biography"
  | "club_official_squad_page"
  | "competition_official_profile"
  | "official_interview_feature"
  | "major_press_profile"
  | "wikidata"
  | "wikipedia"
  | "dbpedia"
  | "national_football_teams"
  | "fbref"
  | "transfermarkt"
  | "soccerway"
  | "olympedia"
  | "grokpedia"
  | "namuwiki";

export type FootballWorldCupDossierTargetField = {
  id: FootballWorldCupDossierFieldId;
  label: string;
  category: FootballWorldCupDossierFieldCategory;
  description: string;
};

export type FootballWorldCupDossierSourceExample = {
  label: string;
  url: string | null;
};

export type FootballWorldCupDossierSourceSystem = {
  id: FootballWorldCupDossierSourceId;
  label: string;
  tier: FootballWorldCupDossierSourceTier;
  description: string;
  usage: string;
  verificationNote: string;
  fieldCoverage: FootballWorldCupDossierFieldId[];
  examples: FootballWorldCupDossierSourceExample[];
};

export type FootballWorldCupDossierPlaybook = {
  version: number;
  updatedAt: string;
  targetProgram: {
    id: "priority_players";
    label: string;
    targetPlayerCount: number;
    note: string;
  };
  instructions: string[];
  targetFields: FootballWorldCupDossierTargetField[];
  sourceSystems: FootballWorldCupDossierSourceSystem[];
  hintPolicy: {
    discoveryOnlySourceIds: FootballWorldCupDossierSourceId[];
    note: string;
  };
};

export type FootballWorldCupDossierFieldStatus = FootballWorldCupDossierTargetField & {
  isFilled: boolean;
  valuePreview: string | null;
};

export type FootballWorldCupDossierCategoryCoverage = {
  category: FootballWorldCupDossierFieldCategory;
  filledCount: number;
  totalCount: number;
};

export type FootballWorldCupDossierSourceRef = {
  label: string;
  url: string | null;
  inferredSourceId: FootballWorldCupDossierSourceId | null;
};

export type FootballWorldCupDossierRecommendedSource = {
  sourceId: FootballWorldCupDossierSourceId;
  label: string;
  tier: FootballWorldCupDossierSourceTier;
  description: string;
  usage: string;
  verificationNote: string;
  matchedFieldIds: FootballWorldCupDossierFieldId[];
  examples: FootballWorldCupDossierSourceExample[];
};

export type FootballWorldCupDossierCoverage = {
  fieldStatuses: FootballWorldCupDossierFieldStatus[];
  filledCount: number;
  totalCount: number;
  completenessPct: number;
  categoryCoverage: FootballWorldCupDossierCategoryCoverage[];
  currentSources: FootballWorldCupDossierSourceRef[];
  missingFields: FootballWorldCupDossierTargetField[];
  recommendedSources: FootballWorldCupDossierRecommendedSource[];
};

const TARGET_FIELDS: FootballWorldCupDossierTargetField[] = [
  {
    id: "full_name",
    label: "Full name",
    category: "identity",
    description: "Canonical newsroom name for the player.",
  },
  {
    id: "local_name",
    label: "Local name",
    category: "identity",
    description: "Local-language or alternate script display name when relevant.",
  },
  {
    id: "birth_date",
    label: "Birth date",
    category: "identity",
    description: "Exact birth date for profile and milestone copy.",
  },
  {
    id: "birth_place",
    label: "Birth place",
    category: "identity",
    description: "Birth city or region for origin framing.",
  },
  {
    id: "primary_nationality",
    label: "Nationality",
    category: "identity",
    description: "Primary national-team identity and nationality.",
  },
  {
    id: "eligibility",
    label: "Eligibility",
    category: "identity",
    description: "Dual-nationality or eligibility-switch context when relevant.",
  },
  {
    id: "height_cm",
    label: "Height",
    category: "physical",
    description: "Structured height for profile and matchup copy.",
  },
  {
    id: "weight_kg",
    label: "Weight",
    category: "physical",
    description: "Structured weight when publicly available.",
  },
  {
    id: "preferred_foot",
    label: "Preferred foot",
    category: "physical",
    description: "Dominant foot for tactical framing.",
  },
  {
    id: "primary_position",
    label: "Primary position",
    category: "football_identity",
    description: "Main position group in current role.",
  },
  {
    id: "secondary_positions",
    label: "Secondary positions",
    category: "football_identity",
    description: "Secondary positional flexibility or hybrid role.",
  },
  {
    id: "current_club",
    label: "Current club",
    category: "football_identity",
    description: "Current club at time of export.",
  },
  {
    id: "squad_number",
    label: "Squad number",
    category: "football_identity",
    description: "Current national-team squad number.",
  },
  {
    id: "youth_clubs",
    label: "Youth clubs",
    category: "career",
    description: "Academy and youth-path history.",
  },
  {
    id: "senior_club_history",
    label: "Senior club history",
    category: "career",
    description: "Senior club timeline with current stop.",
  },
  {
    id: "national_team_debut",
    label: "National-team debut",
    category: "career",
    description: "First senior national-team appearance or debut context.",
  },
  {
    id: "captaincy",
    label: "Captaincy",
    category: "career",
    description: "Captain or leadership role in the current cycle.",
  },
  {
    id: "family_background",
    label: "Family background",
    category: "public_context",
    description: "Source-backed family sports or upbringing context.",
  },
  {
    id: "languages",
    label: "Languages",
    category: "public_context",
    description: "Publicly sourced language ability when editorially useful.",
  },
  {
    id: "education_or_dual_path",
    label: "Education or dual path",
    category: "public_context",
    description: "School, university, or non-football path context.",
  },
  {
    id: "hometown_or_community",
    label: "Hometown or community tie",
    category: "public_context",
    description: "Town, neighborhood, or community-symbol framing.",
  },
  {
    id: "injury_status",
    label: "Injury status",
    category: "newsroom_hooks",
    description: "Current injury signal or return timeline.",
  },
  {
    id: "transfer_status",
    label: "Transfer status",
    category: "newsroom_hooks",
    description: "Active transfer or contract storyline.",
  },
  {
    id: "role_change",
    label: "Role change",
    category: "newsroom_hooks",
    description: "Coach-trust, position, or usage shift.",
  },
  {
    id: "controversy_watch",
    label: "Controversy watch",
    category: "newsroom_hooks",
    description: "Public controversy or disciplinary exposure.",
  },
  {
    id: "official_quote",
    label: "Official quote path",
    category: "newsroom_hooks",
    description: "Press conference, official interview, or direct quote lane.",
  },
  {
    id: "rumor_score",
    label: "Rumor score",
    category: "newsroom_hooks",
    description: "Current rumor heat or speculative press activity.",
  },
];

const SOURCE_SYSTEMS: FootballWorldCupDossierSourceSystem[] = [
  {
    id: "federation_official_profile",
    label: "Federation official profile",
    tier: "tier1_anchor",
    description:
      "National-team official player pages and current roster profiles.",
    usage:
      "Use this as the first anchor for identity, roster status, squad number, position, and official voice.",
    verificationNote:
      "Preferred first stop whenever the federation publishes per-player pages or rich roster cards.",
    fieldCoverage: [
      "full_name",
      "birth_date",
      "birth_place",
      "primary_nationality",
      "primary_position",
      "squad_number",
      "captaincy",
      "official_quote",
      "hometown_or_community",
      "languages",
    ],
    examples: [
      {
        label: "U.S. Soccer Christian Pulisic profile",
        url: "https://www.ussoccer.com/players/p/christian-pulisic/",
      },
    ],
  },
  {
    id: "club_official_biography",
    label: "Club official biography",
    tier: "tier1_anchor",
    description:
      "Club biography pages with player background, physicals, and career path.",
    usage:
      "Best official source for birth details, height, weight, preferred foot, youth path, and club timeline.",
    verificationNote:
      "Use whenever a club publishes a dedicated biography page rather than a short squad stub.",
    fieldCoverage: [
      "full_name",
      "birth_date",
      "birth_place",
      "height_cm",
      "weight_kg",
      "preferred_foot",
      "primary_position",
      "current_club",
      "youth_clubs",
      "senior_club_history",
      "languages",
      "hometown_or_community",
    ],
    examples: [
      {
        label: "AC Milan Christian Pulisic biography",
        url: "https://www.acmilan.com/en/teams/men-first-team/players/christian-pulisic/biography",
      },
    ],
  },
  {
    id: "club_official_squad_page",
    label: "Club official squad page",
    tier: "tier1_anchor",
    description:
      "Club player cards and squad pages with compact structured facts.",
    usage:
      "Good fallback when the club has no long biography page but does publish a structured player card.",
    verificationNote:
      "Use for roster identity, physicals, and squad data before moving to reference layers.",
    fieldCoverage: [
      "full_name",
      "birth_date",
      "height_cm",
      "preferred_foot",
      "primary_position",
      "current_club",
      "squad_number",
      "youth_clubs",
    ],
    examples: [
      {
        label: "FC Barcelona Lamine Yamal page",
        url: "https://www.fcbarcelona.com/en/football/first-team/jugadores/129404/lamine-yamal",
      },
    ],
  },
  {
    id: "competition_official_profile",
    label: "Competition or confederation profile",
    tier: "tier1_anchor",
    description:
      "FIFA, UEFA, Concacaf, AFC, CAF, and similar tournament or confederation player pages.",
    usage:
      "Useful for birth date, position, club, caps context, and official tournament narrative.",
    verificationNote:
      "Use for tournament framing and official narrative when federation pages are thin.",
    fieldCoverage: [
      "full_name",
      "birth_date",
      "primary_nationality",
      "primary_position",
      "current_club",
      "squad_number",
      "official_quote",
      "injury_status",
    ],
    examples: [
      {
        label: "UEFA Jude Bellingham profile",
        url: "https://www.uefa.com/uefachampionsleague/clubs/players/250128377/",
      },
      {
        label: "Concacaf Christian Pulisic profile",
        url: "https://www.concacaf.com/news/concacaf-profile-christian-pulisic-of-united-states/",
      },
    ],
  },
  {
    id: "official_interview_feature",
    label: "Official interview or feature",
    tier: "tier1_anchor",
    description:
      "Federation, club, FIFA, or confederation interviews and profile features.",
    usage:
      "Best source for family background, hometown, language, school, values, and official quotes.",
    verificationNote:
      "Use for public-personal context, but keep the quote or framing attached to the source.",
    fieldCoverage: [
      "family_background",
      "languages",
      "education_or_dual_path",
      "hometown_or_community",
      "official_quote",
      "role_change",
    ],
    examples: [
      {
        label: "FIFA Lionel Messi profile feature",
        url: "https://www.fifa.com/en/tournaments/mens/club-world-cup/usa-2025/articles/lionel-messi-inter-miami-profile",
      },
    ],
  },
  {
    id: "major_press_profile",
    label: "Major press profile",
    tier: "tier1_anchor",
    description:
      "Long-form or profile reporting from major public-interest outlets.",
    usage:
      "Use for sourced family background, migration story, education path, and current off-field context.",
    verificationNote:
      "Strong for narrative framing, but do not let it replace official identity anchors.",
    fieldCoverage: [
      "eligibility",
      "family_background",
      "languages",
      "education_or_dual_path",
      "hometown_or_community",
      "role_change",
      "controversy_watch",
      "rumor_score",
    ],
    examples: [],
  },
  {
    id: "wikidata",
    label: "Wikidata",
    tier: "tier2_reference",
    description:
      "Structured CC0 entity data with strong cross-links and external identifiers.",
    usage:
      "Use to normalize names, birth dates, birth places, nationality, height, and external IDs.",
    verificationNote:
      "Most important structured reference layer after official sources.",
    fieldCoverage: [
      "full_name",
      "local_name",
      "birth_date",
      "birth_place",
      "primary_nationality",
      "eligibility",
      "height_cm",
      "primary_position",
      "current_club",
    ],
    examples: [
      {
        label: "Wikidata data access",
        url: "https://www.wikidata.org/wiki/Help:Data_access",
      },
    ],
  },
  {
    id: "wikipedia",
    label: "Wikipedia",
    tier: "tier2_reference",
    description:
      "Widely available summary and infobox layer for biography and club history.",
    usage:
      "Use for structured backfill and then re-verify sensitive or high-impact facts against stronger sources.",
    verificationNote:
      "Allowed as a structured reference layer, but not the final authority for delicate claims.",
    fieldCoverage: [
      "full_name",
      "local_name",
      "birth_date",
      "birth_place",
      "primary_nationality",
      "height_cm",
      "weight_kg",
      "preferred_foot",
      "primary_position",
      "secondary_positions",
      "current_club",
      "youth_clubs",
      "senior_club_history",
      "family_background",
      "education_or_dual_path",
      "hometown_or_community",
    ],
    examples: [
      {
        label: "Christian Pulisic on Wikipedia",
        url: "https://en.wikipedia.org/wiki/Christian_Pulisic",
      },
    ],
  },
  {
    id: "dbpedia",
    label: "DBpedia",
    tier: "tier2_reference",
    description:
      "Linked-data projection of Wikipedia, useful for entity resolution and backup lookup.",
    usage:
      "Use as a fallback graph layer when Wikidata resolution is incomplete.",
    verificationNote:
      "Lower priority than Wikidata and mostly useful for resolution, not first-pass sourcing.",
    fieldCoverage: [
      "full_name",
      "birth_date",
      "birth_place",
      "primary_nationality",
      "primary_position",
      "current_club",
    ],
    examples: [
      {
        label: "DBpedia Lookup",
        url: "https://www.dbpedia.org/resources/lookup/",
      },
    ],
  },
  {
    id: "national_football_teams",
    label: "National Football Teams",
    tier: "tier3_backfill",
    description:
      "National-team player ledger with structured caps, goals, birth details, and position.",
    usage:
      "Use to verify national-team identity, position, birth info, and appearance context.",
    verificationNote:
      "Strong backfill for national-team ledger checks, not a replacement for official sources.",
    fieldCoverage: [
      "birth_date",
      "birth_place",
      "primary_nationality",
      "height_cm",
      "primary_position",
      "national_team_debut",
    ],
    examples: [
      {
        label: "Christian Pulisic at National Football Teams",
        url: "https://www.national-football-teams.com/player/63643/Christian_Pulisic.html",
      },
    ],
  },
  {
    id: "fbref",
    label: "FBref",
    tier: "tier3_backfill",
    description:
      "Stat-heavy player pages with physical, position, club, and national-team data.",
    usage:
      "Use for preferred foot, physical data, and stat-backed role context.",
    verificationNote:
      "Best as a stat-plus-bio backfill layer.",
    fieldCoverage: [
      "height_cm",
      "weight_kg",
      "preferred_foot",
      "primary_position",
      "secondary_positions",
      "current_club",
      "injury_status",
    ],
    examples: [
      {
        label: "Christian Pulisic at FBref",
        url: "https://fbref.com/en/players/1bf33a9a/Christian-Pulisic",
      },
    ],
  },
  {
    id: "transfermarkt",
    label: "Transfermarkt",
    tier: "tier3_backfill",
    description:
      "Broad player reference layer covering transfers, contracts, injuries, agents, and footedness.",
    usage:
      "Use for contract status, transfer heat, injury timeline, youth clubs, and footedness.",
    verificationNote:
      "Very useful breadth layer, but verify sensitive newsroom copy before promotion.",
    fieldCoverage: [
      "birth_date",
      "birth_place",
      "height_cm",
      "preferred_foot",
      "current_club",
      "youth_clubs",
      "senior_club_history",
      "injury_status",
      "transfer_status",
      "rumor_score",
    ],
    examples: [
      {
        label: "Christian Pulisic at Transfermarkt",
        url: "https://www.transfermarkt.com/christian-pulisic/profil/spieler/315779",
      },
    ],
  },
  {
    id: "soccerway",
    label: "Soccerway",
    tier: "tier3_backfill",
    description:
      "Structured player pages with transfer chronology, injuries, and season history.",
    usage:
      "Use for transfer chronology, club timeline, and competition-by-competition history.",
    verificationNote:
      "Strong support layer for chronology and appearance history.",
    fieldCoverage: [
      "birth_date",
      "birth_place",
      "height_cm",
      "primary_position",
      "senior_club_history",
      "injury_status",
      "transfer_status",
    ],
    examples: [
      {
        label: "Christian Pulisic at Soccerway",
        url: "https://us.soccerway.com/players/christian-pulisic/413835/",
      },
    ],
  },
  {
    id: "olympedia",
    label: "Olympedia",
    tier: "tier3_backfill",
    description:
      "Olympic athlete biographies with occasional high-value football background notes.",
    usage:
      "Use only when the player has Olympic coverage and the page adds biographical context.",
    verificationNote:
      "Niche but occasionally strong for a subset of players.",
    fieldCoverage: [
      "birth_date",
      "birth_place",
      "primary_nationality",
      "education_or_dual_path",
      "hometown_or_community",
    ],
    examples: [
      {
        label: "Olympedia",
        url: "https://www.olympedia.org/",
      },
    ],
  },
  {
    id: "grokpedia",
    label: "Grokpedia",
    tier: "tier4_hint",
    description:
      "Parallel encyclopedia surface for discovery-only biography hints.",
    usage:
      "Use only to queue follow-up reporting or to find leads for stronger public sourcing.",
    verificationNote:
      "Discovery only. Never final evidence in live newsroom copy.",
    fieldCoverage: [
      "family_background",
      "languages",
      "education_or_dual_path",
      "hometown_or_community",
      "role_change",
    ],
    examples: [],
  },
  {
    id: "namuwiki",
    label: "Namuwiki",
    tier: "tier4_hint",
    description:
      "Korean community-wiki layer for discovery-only background leads.",
    usage:
      "Useful for Korean-language discovery on youth, biography, and public-personal angles.",
    verificationNote:
      "Discovery only. Manual verification required before promotion.",
    fieldCoverage: [
      "local_name",
      "family_background",
      "languages",
      "education_or_dual_path",
      "hometown_or_community",
      "controversy_watch",
    ],
    examples: [],
  },
];

export const FOOTBALL_WORLD_CUP_DOSSIER_PLAYBOOK: FootballWorldCupDossierPlaybook =
  {
    version: 1,
    updatedAt: "2026-04-22",
    targetProgram: {
      id: "priority_players",
      label: "Top-500 World Cup player dossier",
      targetPlayerCount: 500,
      note:
        "The newsroom target is to make at least 500 globally visible players feel fully briefed, not just roster-listed.",
    },
    instructions: [
      "Anchor identity and roster facts to federation, club, and competition official surfaces first.",
      "Use Wikidata and Wikipedia to normalize structure and external IDs after official anchors are attached.",
      "Use FBref, Transfermarkt, Soccerway, and National Football Teams as backfill and verification support, not as the first authority.",
      "Keep Grokpedia, Namuwiki, and other community-wiki layers discovery-only until the claim is upgraded with stronger public sourcing.",
      "For public-personal context, prefer official interviews, official features, or major-press profiles over encyclopedia summaries.",
    ],
    targetFields: TARGET_FIELDS,
    sourceSystems: SOURCE_SYSTEMS,
    hintPolicy: {
      discoveryOnlySourceIds: ["grokpedia", "namuwiki"],
      note:
        "Community or parallel-wiki layers remain research-only. They can open reporting paths but cannot ship as final evidence on their own.",
    },
  };

function normalizeText(value: string | null | undefined): string | null {
  const next = (value || "").trim();
  return next || null;
}

function extractArrayText(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? normalizeText(item) : null))
    .filter((item): item is string => Boolean(item));
}

function inferSourceIdFromRef(
  label: string | null | undefined,
  url: string | null | undefined,
): FootballWorldCupDossierSourceId | null {
  const haystack = `${label || ""} ${url || ""}`.toLowerCase();
  if (!haystack) return null;
  if (haystack.includes("wikidata.org") || haystack.includes("wikidata")) return "wikidata";
  if (haystack.includes("wikipedia.org") || haystack.includes("wikipedia")) return "wikipedia";
  if (haystack.includes("dbpedia.org") || haystack.includes("dbpedia")) return "dbpedia";
  if (haystack.includes("national-football-teams.com") || haystack.includes("national football teams")) {
    return "national_football_teams";
  }
  if (haystack.includes("fbref.com") || haystack.includes("fbref")) return "fbref";
  if (haystack.includes("transfermarkt")) return "transfermarkt";
  if (haystack.includes("soccerway") || haystack.includes("scorebar.com")) return "soccerway";
  if (haystack.includes("olympedia")) return "olympedia";
  if (haystack.includes("grokpedia")) return "grokpedia";
  if (haystack.includes("namu.wiki") || haystack.includes("namuwiki")) return "namuwiki";
  if (
    haystack.includes("club official biography") ||
    haystack.includes("club official profile") ||
    haystack.includes("acmilan.com") ||
    haystack.includes("chelseafc.com") ||
    haystack.includes("arsenal.com") ||
    haystack.includes("liverpoolfc.com") ||
    haystack.includes("manutd.com") ||
    haystack.includes("psg.fr") ||
    haystack.includes("tottenhamhotspur.com") ||
    haystack.includes("realmadrid.com") ||
    haystack.includes("fcbarcelona.com") ||
    haystack.includes("fcbayern.com") ||
    haystack.includes("juventus.com") ||
    haystack.includes("inter.it") ||
    haystack.includes("intermiamicf.com") ||
    haystack.includes("mancity.com") ||
    haystack.includes("avfc.co.uk") ||
    haystack.includes("cpfc.co.uk")
  ) {
    return "club_official_biography";
  }
  if (
    haystack.includes("fifa.com") ||
    haystack.includes("uefa.com") ||
    haystack.includes("concacaf.com") ||
    haystack.includes("conmebol.com") ||
    haystack.includes("the-afc.com") ||
    haystack.includes("cafonline.com") ||
    haystack.includes("oceaniafootball.com")
  ) {
    return "competition_official_profile";
  }
  if (
    haystack.includes("official interview") ||
    haystack.includes("official feature") ||
    haystack.includes("players' tribune")
  ) {
    return "official_interview_feature";
  }
  if (
    haystack.includes("current roster") ||
    haystack.includes("national team") ||
    haystack.includes("federation") ||
    haystack.includes("ussoccer") ||
    haystack.includes("englandfootball") ||
    haystack.includes("onsoranje") ||
    haystack.includes("rbfa") ||
    haystack.includes("fpf.pt") ||
    haystack.includes("rfef") ||
    haystack.includes("dfb")
  ) {
    return "federation_official_profile";
  }
  return null;
}

const SOURCE_LADDER_REF_LABELS: Record<string, string> = {
  wikidata: "Wikidata",
  wikipedia: "Wikipedia profile",
  officialWebsite: "Official website",
  clubOfficialBiography: "Club official biography",
  transfermarkt: "Transfermarkt",
  fbref: "FBref",
  nationalFootballTeams: "National Football Teams",
  soccerway: "Soccerway / Scorebar",
  soccerbase: "Soccerbase",
  footballDatabase: "FootballDatabase.eu",
  lequipe: "L'Equipe",
};

function hasHumanInterestClaim(
  record: HumanInterestPilotRecord | null | undefined,
  claimTypes: string[],
): boolean {
  if (!record) return false;
  const items = [...record.featureAngles, ...record.publicPersonalContext];
  return items.some((item) => claimTypes.includes(item.claimType));
}

function storylineText(card: JournalistPersonCard): string {
  return card.storylineList
    .map((item) =>
      [item.title, item.summary, item.claimType, item.topicSnippet]
        .filter(Boolean)
        .join(" "),
    )
    .join(" ")
    .toLowerCase();
}

function hasStorylineKeyword(card: JournalistPersonCard, keywords: string[]): boolean {
  const text = storylineText(card);
  return keywords.some((keyword) => text.includes(keyword));
}

function hasStorylineClaim(
  card: JournalistPersonCard,
  claimTypes: string[],
): boolean {
  return card.storylineList.some((item) => {
    const claimType = normalizeText(item.claimType)?.toLocaleLowerCase("en-US");
    const storyType = normalizeText(item.storyType)?.toLocaleLowerCase("en-US");
    return Boolean(
      (claimType && claimTypes.includes(claimType)) ||
        (claimTypes.includes("quote") && storyType?.startsWith("official_")),
    );
  });
}

function countKeywordMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((total, pattern) => total + (pattern.test(text) ? 1 : 0), 0);
}

function buildNewsroomHookAssessment(card: JournalistPersonCard): {
  injuryStatus: string;
  transferStatus: string;
  roleChangeStatus: string;
  controversyStatus: string;
  rumorScore: string;
} {
  const text = storylineText(card);
  const currentClub = normalizeText(card.currentClub)?.toLocaleLowerCase("en-US") || "";
  const sourceLabels = collectBasicSourceLabels(card).toLocaleLowerCase("en-US");

  const injuryKeywordCount = countKeywordMatches(text, [
    /\binjur/i,
    /\bfitness\b/i,
    /\breturn(?:ed|s|ing)?\b/i,
    /\bsidelined\b/i,
    /\bknock\b/i,
    /\bsuspension\b/i,
  ]);
  const transferKeywordCount = countKeywordMatches(`${text} ${currentClub}`, [
    /\btransfer\b/i,
    /\bloan\b/i,
    /\bon loan\b/i,
    /\bcontract\b/i,
    /\bmarket\b/i,
    /\blinked\b/i,
    /\binterest from\b/i,
    /\bmove to\b/i,
  ]);
  const roleKeywordCount = countKeywordMatches(text, [
    /\bstarter\b/i,
    /\bbench\b/i,
    /\brole\b/i,
    /\bposition\b/i,
    /\busage\b/i,
    /\bminutes\b/i,
    /\brotation\b/i,
  ]);
  const controversyKeywordCount = countKeywordMatches(text, [
    /\bcontrovers/i,
    /\bdisciplin/i,
    /\binvestigat/i,
    /\bban\b/i,
    /\bincident\b/i,
    /\barrest\b/i,
    /\bdispute\b/i,
    /\bscandal\b/i,
    /\bsuspension\b/i,
  ]);

  const injuryStatus =
    normalizeText(card.statusPanel.structured.injuryStatus) ||
    (card.statusPanel.latestInjuryStatus ? "Injury signal attached" : null) ||
    (card.statusPanel.latestReturnStatus ? "Return timeline signal attached" : null) ||
    (card.statusPanel.latestSuspensionStatus
      ? "Suspension availability signal attached"
      : null) ||
    (injuryKeywordCount ? "Injury or availability watch signal detected" : null) ||
    "No current injury signal in attached ingest sources";

  const transferStatus = transferKeywordCount
    ? "Transfer or contract watch signal detected"
    : sourceLabels.includes("transfermarkt")
      ? "Transfer watch assessed: 0/100 active heat in attached sources"
      : "No current transfer signal in attached ingest sources";

  const roleChangeStatus = roleKeywordCount
    ? "Role or usage watch signal detected"
    : "No current role-change signal in attached ingest sources";

  const controversyStatus =
    controversyKeywordCount || card.statusPanel.latestSuspensionStatus
      ? "Controversy or disciplinary watch signal detected"
      : "Controversy watch assessed: 0/100 active heat in attached sources";

  const rumorScore = Math.min(
    100,
    transferKeywordCount * 18 +
      controversyKeywordCount * 12 +
      injuryKeywordCount * 8 +
      roleKeywordCount * 6,
  );

  return {
    injuryStatus,
    transferStatus,
    roleChangeStatus,
    controversyStatus,
    rumorScore: `Rumor heat ${rumorScore}/100 from attached ingest signals`,
  };
}

function collectBasicSourceLabels(card: JournalistPersonCard): string {
  const metadata = (card.profile?.metadata || {}) as Record<string, unknown>;
  const sourceLadder =
    metadata.sourceLadder && typeof metadata.sourceLadder === "object"
      ? Object.keys(metadata.sourceLadder as Record<string, unknown>).join(" ")
      : "";
  return [
    card.profile?.sourceLabel,
    card.profile?.biographySourceLabel,
    sourceLadder,
    ...card.storylineList.map((item) => item.sourceLabel),
  ]
    .filter(Boolean)
    .join(" ");
}

function resolveFieldStatus(
  field: FootballWorldCupDossierTargetField,
  card: JournalistPersonCard,
  record: HumanInterestPilotRecord | null | undefined,
): FootballWorldCupDossierFieldStatus {
  const aliases = card.aliases.all.map((item) => item.alias).filter(Boolean);
  const secondaryPositions = extractArrayText(
    card.role.roleMetadata && "secondaryPositions" in card.role.roleMetadata
      ? (card.role.roleMetadata as Record<string, unknown>).secondaryPositions
      : null,
  );
  const localNameAlias = aliases.find((alias) => alias !== card.canonicalName) || null;
  const hasOfficialQuote =
    card.officialAppearanceTimeline.length > 0 ||
    hasStorylineClaim(card, ["quote"]);
  const profileMetadata = (card.profile?.metadata || {}) as Record<string, unknown>;
  const biographyFacts =
    typeof profileMetadata.biographyFacts === "object" && profileMetadata.biographyFacts
      ? (profileMetadata.biographyFacts as Record<string, unknown>)
      : {};
  const nationalFootballTeams =
    typeof biographyFacts.nationalFootballTeams === "object" &&
    biographyFacts.nationalFootballTeams
      ? (biographyFacts.nationalFootballTeams as Record<string, unknown>)
      : {};
  const nationalTeamFirstSeason =
    typeof nationalFootballTeams.firstSeason === "number"
      ? nationalFootballTeams.firstSeason
      : null;
  const nationalTeamLabel =
    typeof nationalFootballTeams.nationalTeam === "string"
      ? nationalFootballTeams.nationalTeam
      : null;
  const newsroomHookAssessment = buildNewsroomHookAssessment(card);
  const fieldValueMap: Record<FootballWorldCupDossierFieldId, string | null> = {
    full_name: normalizeText(card.displayName || card.canonicalName),
    local_name: localNameAlias,
    birth_date: normalizeText(card.birthDate),
    birth_place: normalizeText(card.profile?.birthPlace),
    primary_nationality: normalizeText(card.primaryNationality),
    eligibility: hasHumanInterestClaim(record, ["migration_identity"])
      ? "Source-backed eligibility context on file"
      : null,
    height_cm:
      typeof card.profile?.heightCm === "number" ? `${card.profile.heightCm} cm` : null,
    weight_kg:
      typeof card.profile?.weightKg === "number" ? `${card.profile.weightKg} kg` : null,
    preferred_foot: normalizeText(card.profile?.footedness),
    primary_position: normalizeText(card.role.positionGroup),
    secondary_positions: secondaryPositions.length ? secondaryPositions.join(", ") : null,
    current_club: normalizeText(card.currentClub),
    squad_number:
      typeof card.role.squadNumber === "number" ? String(card.role.squadNumber) : null,
    youth_clubs:
      card.profile?.youthClubs.length ? card.profile.youthClubs.join(" · ") : null,
    senior_club_history:
      card.profile?.clubHistory.length ? `${card.profile.clubHistory.length} clubs logged` : null,
    national_team_debut:
      nationalTeamFirstSeason != null
        ? `${nationalTeamLabel || "National team"} ledger starts ${nationalTeamFirstSeason}`
        : hasStorylineKeyword(card, ["debut", "first cap", "senior debut"])
          ? "Debut context detected"
          : null,
    captaincy:
      normalizeText(card.statusPanel.structured.captaincyStatus) ||
      (card.statusPanel.latestCaptaincyStatus ? "Captaincy signal attached" : null),
    family_background: hasHumanInterestClaim(record, [
      "family_influence",
      "public_family_context",
    ])
      ? "Source-backed family context on file"
      : null,
    languages: hasHumanInterestClaim(record, ["migration_identity"])
      ? "Language or multilingual identity context on file"
      : null,
    education_or_dual_path:
      card.profile?.education.length
        ? card.profile.education.join(" · ")
        : hasHumanInterestClaim(record, ["education_or_dual_path"])
          ? "Source-backed education or dual-path note on file"
          : null,
    hometown_or_community:
      normalizeText(card.profile?.hometown) ||
      (hasHumanInterestClaim(record, ["community_symbol"])
        ? "Community-symbol context on file"
        : null),
    injury_status:
      normalizeText(card.statusPanel.structured.injuryStatus) ||
      (card.statusPanel.latestInjuryStatus ? "Injury signal attached" : null) ||
      newsroomHookAssessment.injuryStatus,
    transfer_status: newsroomHookAssessment.transferStatus,
    role_change: newsroomHookAssessment.roleChangeStatus,
    controversy_watch: newsroomHookAssessment.controversyStatus,
    official_quote: hasOfficialQuote ? "Official quote path attached" : null,
    rumor_score: newsroomHookAssessment.rumorScore,
  };
  const valuePreview = fieldValueMap[field.id] || null;
  return {
    ...field,
    isFilled: Boolean(valuePreview),
    valuePreview,
  };
}

function collectCurrentSourceRefs(
  card: JournalistPersonCard,
  record: HumanInterestPilotRecord | null | undefined,
): FootballWorldCupDossierSourceRef[] {
  const refs: Array<{ label: string | null; url: string | null }> = [];
  refs.push({
    label: normalizeText(card.profile?.sourceLabel || card.profile?.source),
    url: normalizeText(card.profile?.sourceUrl),
  });
  refs.push({
    label: normalizeText(card.profile?.biographySourceLabel),
    url: normalizeText(card.profile?.biographySourceUrl),
  });

  const metadata = (card.profile?.metadata || {}) as Record<string, unknown>;
  refs.push({
    label:
      typeof metadata.currentClubSource === "string"
        ? metadata.currentClubSource.replace(/_/g, " ")
        : null,
    url:
      typeof metadata.currentClubSourceUrl === "string"
        ? metadata.currentClubSourceUrl
        : null,
  });

  const sourceLadder =
    metadata.sourceLadder && typeof metadata.sourceLadder === "object"
      ? (metadata.sourceLadder as Record<string, unknown>)
      : {};
  for (const [key, value] of Object.entries(sourceLadder)) {
    if (typeof value !== "string") continue;
    refs.push({
      label: SOURCE_LADDER_REF_LABELS[key] || key.replace(/([A-Z])/g, " $1"),
      url: normalizeText(value),
    });
  }

  for (const appearance of card.officialAppearanceTimeline) {
    refs.push({
      label: normalizeText(appearance.sourceLabel || appearance.title),
      url: normalizeText(appearance.url),
    });
  }

  for (const storyline of card.storylineList) {
    refs.push({
      label: normalizeText(storyline.sourceLabel || storyline.title),
      url: normalizeText(storyline.sourceUrl),
    });
    for (const article of storyline.articles) {
      refs.push({
        label: normalizeText(article.source || article.title),
        url: normalizeText(article.url),
      });
    }
  }

  if (record) {
    for (const item of [...record.liveHooks, ...record.featureAngles, ...record.publicPersonalContext]) {
      refs.push({
        label: normalizeText("sourceLabel" in item ? item.sourceLabel : null),
        url: normalizeText("sourceUrl" in item ? item.sourceUrl : null),
      });
    }
    for (const note of record.researchNotes) {
      refs.push({
        label: normalizeText(note.sourceLabel),
        url: normalizeText(note.evidenceUrl),
      });
    }
  }

  const deduped = new Map<string, FootballWorldCupDossierSourceRef>();
  for (const ref of refs) {
    if (!ref.label && !ref.url) continue;
    const label = ref.label || ref.url || "Unknown source";
    const url = ref.url || null;
    const key = `${label}::${url || ""}`.toLowerCase();
    if (deduped.has(key)) continue;
    deduped.set(key, {
      label,
      url,
      inferredSourceId: inferSourceIdFromRef(label, url),
    });
  }
  return [...deduped.values()];
}

const SOURCE_TIER_WEIGHT: Record<FootballWorldCupDossierSourceTier, number> = {
  tier1_anchor: 4,
  tier2_reference: 3,
  tier3_backfill: 2,
  tier4_hint: 1,
};

export function buildFootballWorldCupDossierCoverage(
  card: JournalistPersonCard,
  record: HumanInterestPilotRecord | null | undefined,
  playbook: FootballWorldCupDossierPlaybook = FOOTBALL_WORLD_CUP_DOSSIER_PLAYBOOK,
): FootballWorldCupDossierCoverage {
  const fieldStatuses = playbook.targetFields.map((field) =>
    resolveFieldStatus(field, card, record),
  );
  const missingFields = fieldStatuses
    .filter((field) => !field.isFilled)
    .map(({ isFilled: _isFilled, valuePreview: _valuePreview, ...field }) => field);
  const filledCount = fieldStatuses.filter((field) => field.isFilled).length;
  const totalCount = fieldStatuses.length;
  const completenessPct = totalCount
    ? Math.round((filledCount / totalCount) * 100)
    : 0;

  const categoryCoverage = [
    "identity",
    "physical",
    "football_identity",
    "career",
    "public_context",
    "newsroom_hooks",
  ].map((category) => {
    const items = fieldStatuses.filter((field) => field.category === category);
    return {
      category: category as FootballWorldCupDossierFieldCategory,
      filledCount: items.filter((field) => field.isFilled).length,
      totalCount: items.length,
    };
  });

  const sourceMap = new Map(
    playbook.sourceSystems.map((source) => [source.id, source]),
  );
  const matchedSourceCoverage = new Map<
    FootballWorldCupDossierSourceId,
    Set<FootballWorldCupDossierFieldId>
  >();

  for (const field of missingFields) {
    for (const source of playbook.sourceSystems) {
      if (!source.fieldCoverage.includes(field.id)) continue;
      const next = matchedSourceCoverage.get(source.id) || new Set();
      next.add(field.id);
      matchedSourceCoverage.set(source.id, next);
    }
  }

  const recommendedSources = [...matchedSourceCoverage.entries()]
    .map(([sourceId, fieldIds]) => {
      const source = sourceMap.get(sourceId);
      if (!source) return null;
      return {
        sourceId,
        label: source.label,
        tier: source.tier,
        description: source.description,
        usage: source.usage,
        verificationNote: source.verificationNote,
        matchedFieldIds: [...fieldIds],
        examples: source.examples,
      } satisfies FootballWorldCupDossierRecommendedSource;
    })
    .filter((item): item is FootballWorldCupDossierRecommendedSource => Boolean(item))
    .sort((left, right) => {
      const weightDiff = SOURCE_TIER_WEIGHT[right.tier] - SOURCE_TIER_WEIGHT[left.tier];
      if (weightDiff !== 0) return weightDiff;
      if (right.matchedFieldIds.length !== left.matchedFieldIds.length) {
        return right.matchedFieldIds.length - left.matchedFieldIds.length;
      }
      return left.label.localeCompare(right.label);
    })
    .slice(0, 6);

  return {
    fieldStatuses,
    filledCount,
    totalCount,
    completenessPct,
    categoryCoverage,
    currentSources: collectCurrentSourceRefs(card, record),
    missingFields,
    recommendedSources,
  };
}
