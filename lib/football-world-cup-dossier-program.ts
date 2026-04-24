import {
  buildFootballWorldCupDossierCoverage,
  FOOTBALL_WORLD_CUP_DOSSIER_PLAYBOOK,
  type FootballWorldCupDossierCoverage,
  type FootballWorldCupDossierFieldId,
  type FootballWorldCupDossierPlaybook,
  type FootballWorldCupDossierSourceId,
} from "@/lib/football-world-cup-dossier";
import type { HumanInterestPilotRecord } from "@/lib/football-world-cup-human-interest";
import type {
  FootballWorldCupJournalistSnapshot,
  JournalistPersonCard,
} from "@/lib/football-world-cup-journalist-store";

export type FootballWorldCupDossierSeedTier =
  | "top20"
  | "top50"
  | "top100"
  | "target";

export type FootballWorldCupDossierProgramPlayer = {
  sportsPersonId: string;
  canonicalName: string;
  displayName: string;
  teamCanonicalName: string;
  teamSlug: string;
  currentClub: string | null;
  positionGroup: string | null;
  seedRank: number;
  seedTier: FootballWorldCupDossierSeedTier;
  seedScore: number;
  actionPriorityScore: number;
  completenessPct: number;
  missingFieldCount: number;
  missingFieldIds: FootballWorldCupDossierFieldId[];
  sourceCount: number;
  recommendedSourceIds: FootballWorldCupDossierSourceId[];
  hasLiveBiography: boolean;
  missingLiveBiography: boolean;
  biographySourceLabel: string | null;
  biographySourceUrl: string | null;
  storySourceCount: number;
  officialVoiceCount: number;
  narrativeSourceCount: number;
  broadcastAppearanceCount: number;
  priorityHint: HumanInterestPilotRecord["priorityTier"] | null;
  editorialPriorityReason: string | null;
};

export type FootballWorldCupTopMissingLiveBioPlayer = {
  sportsPersonId: string;
  canonicalName: string;
  displayName: string;
  teamCanonicalName: string;
  teamSlug: string;
  currentClub: string | null;
  seedRank: number | null;
  seedScore: number;
  actionPriorityScore: number;
  completenessPct: number;
  missingFieldIds: FootballWorldCupDossierFieldId[];
  priorityHint: HumanInterestPilotRecord["priorityTier"];
  editorialPriorityReason: string;
  recommendedSourceIds: FootballWorldCupDossierSourceId[];
};

export type FootballWorldCupDossierProgram = {
  version: number;
  generatedAt: string;
  targetPlayerCount: number;
  privacyGuardrails: string[];
  sourceLadder: Array<{
    sourceId: FootballWorldCupDossierSourceId;
    label: string;
    tier: string;
  }>;
  summary: {
    playerPoolCount: number;
    targetCohortCount: number;
    targetCohortWithLiveBiographyCount: number;
    targetCohortMissingLiveBiographyCount: number;
    targetCohortAverageCompletenessPct: number;
    top20MissingLiveBiographyCount: number;
  };
  targetPlayers: FootballWorldCupDossierProgramPlayer[];
  top20MissingLiveBio: FootballWorldCupTopMissingLiveBioPlayer[];
};

function normalizeText(value: string | null | undefined): string | null {
  const next = (value || "").trim();
  return next || null;
}

function readStorySourceSummary(card: JournalistPersonCard): {
  totalUsableSourceCount: number;
  officialVoiceCount: number;
  featureProfileCount: number;
  publicContextCount: number;
  storylineCount: number;
  broadcastCount: number;
} {
  const metadata =
    typeof card.profile?.metadata === "object" && card.profile?.metadata
      ? (card.profile.metadata as Record<string, unknown>)
      : {};
  const summary =
    typeof metadata.storySourceSummary === "object" && metadata.storySourceSummary
      ? (metadata.storySourceSummary as Record<string, unknown>)
      : {};
  const readNumber = (key: string) =>
    typeof summary[key] === "number" && Number.isFinite(summary[key])
      ? Number(summary[key])
      : 0;
  return {
    totalUsableSourceCount: readNumber("totalUsableSourceCount"),
    officialVoiceCount: readNumber("officialVoiceCount"),
    featureProfileCount: readNumber("featureProfileCount"),
    publicContextCount: readNumber("publicContextCount"),
    storylineCount: readNumber("storylineCount"),
    broadcastCount: readNumber("broadcastCount"),
  };
}

function buildHumanInterestLookupKey(
  teamCanonicalName: string,
  personCanonicalName: string,
): string {
  return `${teamCanonicalName}::${personCanonicalName}`
    .toLocaleLowerCase("en-US")
    .trim();
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
  const direct =
    lookup.get(buildHumanInterestLookupKey(teamCanonicalName, card.canonicalName)) ||
    lookup.get(buildHumanInterestLookupKey(teamCanonicalName, card.displayName));
  return direct || null;
}

function countStorylinesByTheme(
  card: JournalistPersonCard,
  theme: "reported" | "rumor" | "controversy",
): number {
  return card.storylineList.filter((item) => {
    const haystack = [
      item.storyType,
      item.claimType,
      item.title,
      item.summary,
      item.topicSnippet,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("en-US");
    if (
      /controvers|disciplin|investigat|ban|incident|arrest|dispute|scandal/.test(
        haystack,
      )
    ) {
      return theme === "controversy";
    }
    if (
      /rumou?r|linked|transfer|interest from|move to|contract talks|market/.test(
        haystack,
      )
    ) {
      return theme === "rumor";
    }
    return theme === "reported";
  }).length;
}

function computeClubPrestigeBoost(currentClub: string | null | undefined): number {
  const normalized = normalizeText(currentClub)?.toLocaleLowerCase("en-US");
  if (!normalized) return 0;
  if (
    /(real madrid|barcelona|bayern|paris saint-germain|psg|manchester city|manchester united|liverpool|arsenal|chelsea|tottenham|juventus|inter milan|internazionale|ac milan|borussia dortmund|atletico madrid)/.test(
      normalized,
    )
  ) {
    return 26;
  }
  if (
    /(newcastle|aston villa|napoli|roma|monaco|marseille|lyon|feyenoord|ajax|psv|benfica|porto|sporting|celtic|rangers|slavia|eintracht frankfurt|bayer leverkusen|rb leipzig|real sociedad|athletic club|sevilla|valencia|west ham|wolverhampton|brighton|gent|genk|los angeles fc|stoke city|mainz|crvena zvezda|midtjylland|swansea city|ulsan|jeonbuk|atl.tico madrid|atlético madrid)/.test(
      normalized,
    )
  ) {
    return 14;
  }
  return 0;
}

function computeCareerPrestigeBoost(card: JournalistPersonCard): number {
  const currentClubBoost = computeClubPrestigeBoost(card.currentClub);
  const historyBoost = Math.max(
    0,
    ...(card.profile?.clubHistory || []).map((item) =>
      computeClubPrestigeBoost(item.club),
    ),
  );
  return Math.max(currentClubBoost, historyBoost);
}

function computeFollowerBoost(card: JournalistPersonCard): number {
  const followers = card.socialProfiles.instagram?.followersCount || 0;
  const handleBoost = card.socialProfiles.instagram?.handle ? 4 : 0;
  if (!Number.isFinite(followers) || followers <= 0) return handleBoost;
  const logBoost = Math.min(36, Math.round(Math.log10(followers + 10) * 6));
  const tierBoost =
    followers >= 100_000_000
      ? 18
      : followers >= 25_000_000
        ? 14
        : followers >= 10_000_000
          ? 11
          : followers >= 5_000_000
            ? 8
            : followers >= 1_000_000
              ? 6
              : followers >= 250_000
                ? 4
                : 0;
  return handleBoost + logBoost + tierBoost;
}

function computeHumanInterestBoost(record: HumanInterestPilotRecord | null): number {
  if (!record) return 0;
  const featureAngles = (record.featureAngles || []).filter(
    (item) => item.reviewStatus !== "blocked",
  );
  const contextItems = (record.publicPersonalContext || []).filter(
    (item) => item.reviewStatus !== "blocked",
  );
  const priorityBoost =
    record.priorityTier === "top20" ? 60 : record.priorityTier === "top50" ? 38 : 16;
  const featureBoost = featureAngles.reduce((total, item) => {
    const featureWeight = Math.round((item.featureScore || 0) * 10);
    const sourceWeight = Math.round((item.sourceStrength || 0) * 5);
    const verificationBoost =
      item.verificationStatus === "verified"
        ? 6
        : item.verificationStatus === "well_sourced"
          ? 4
          : item.verificationStatus === "reported"
            ? 2
            : 0;
    return total + 4 + featureWeight + sourceWeight + verificationBoost;
  }, 0);
  const contextBoost = contextItems.reduce(
    (total, item) => total + (item.reviewStatus === "approved" ? 6 : 3),
    0,
  );
  return priorityBoost + featureBoost + contextBoost;
}

function computeSeedScore(
  card: JournalistPersonCard,
  record: HumanInterestPilotRecord | null,
): number {
  const officialBoost = Math.min(28, card.officialAppearanceTimeline.length * 5);
  const reportedBoost = Math.min(26, countStorylinesByTheme(card, "reported") * 4);
  const riskBoost = Math.min(
    14,
    countStorylinesByTheme(card, "rumor") * 2 +
      countStorylinesByTheme(card, "controversy") * 3,
  );
  const captaincyBoost = card.statusPanel.structured.captaincyStatus ? 10 : 0;
  const prestigeBoost = computeCareerPrestigeBoost(card);
  const followerBoost = computeFollowerBoost(card);
  const biographyBoost = card.profile?.biographySourceUrl ? 6 : 0;

  return (
    computeHumanInterestBoost(record) +
    officialBoost +
    reportedBoost +
    riskBoost +
    captaincyBoost +
    prestigeBoost +
    followerBoost +
    biographyBoost
  );
}

function seedTierFromRank(rank: number): FootballWorldCupDossierSeedTier {
  if (rank <= 20) return "top20";
  if (rank <= 50) return "top50";
  if (rank <= 100) return "top100";
  return "target";
}

const SOURCE_LADDER_ORDER: FootballWorldCupDossierSourceId[] = [
  "federation_official_profile",
  "club_official_biography",
  "club_official_squad_page",
  "competition_official_profile",
  "official_interview_feature",
  "major_press_profile",
  "wikidata",
  "wikipedia",
  "dbpedia",
  "national_football_teams",
  "fbref",
  "transfermarkt",
  "soccerway",
  "olympedia",
  "grokpedia",
  "namuwiki",
];

function buildSourceLadder(playbook: FootballWorldCupDossierPlaybook) {
  const sourceMap = new Map(
    playbook.sourceSystems.map((source) => [source.id, source]),
  );
  return SOURCE_LADDER_ORDER.map((sourceId) => sourceMap.get(sourceId))
    .filter((source) => Boolean(source))
    .map((source) => ({
      sourceId: source!.id,
      label: source!.label,
      tier: source!.tier,
    }));
}

function buildActionPriorityScore(
  seedScore: number,
  coverage: FootballWorldCupDossierCoverage,
  missingLiveBiography: boolean,
  priorityHint: HumanInterestPilotRecord["priorityTier"] | null,
): number {
  const completenessGap = Math.max(0, 100 - coverage.completenessPct);
  const topPriorityBoost =
    priorityHint === "top20" ? 22 : priorityHint === "top50" ? 10 : 0;
  return (
    seedScore +
    topPriorityBoost +
    Math.round(completenessGap * 0.55) +
    coverage.missingFields.length * 2 +
    (missingLiveBiography ? 32 : 0)
  );
}

export function buildFootballWorldCupDossierProgram(
  snapshot: FootballWorldCupJournalistSnapshot,
  humanInterestRecords: HumanInterestPilotRecord[],
  playbook: FootballWorldCupDossierPlaybook = FOOTBALL_WORLD_CUP_DOSSIER_PLAYBOOK,
): FootballWorldCupDossierProgram {
  const targetPlayerCount = playbook.targetProgram.targetPlayerCount;
  const humanInterestLookup = buildHumanInterestLookup(humanInterestRecords);
  const playerPool = snapshot.teams.flatMap((team) =>
    team.playerCards.map((card) => {
      const record = resolveHumanInterestRecord(
        team.team.canonicalName,
        card,
        humanInterestLookup,
      );
      const coverage = buildFootballWorldCupDossierCoverage(card, record, playbook);
      const seedScore = computeSeedScore(card, record);
      const missingLiveBiography = !card.profile?.biographySourceUrl;
      const actionPriorityScore = buildActionPriorityScore(
        seedScore,
        coverage,
        missingLiveBiography,
        record?.priorityTier || null,
      );
      return {
        teamCanonicalName: team.team.canonicalName,
        teamSlug: team.team.slug,
        card,
        record,
        coverage,
        seedScore,
        actionPriorityScore,
        missingLiveBiography,
      };
    }),
  );

  const sortedBySeed = [...playerPool].sort((left, right) => {
    if (right.seedScore !== left.seedScore) return right.seedScore - left.seedScore;
    if (right.actionPriorityScore !== left.actionPriorityScore) {
      return right.actionPriorityScore - left.actionPriorityScore;
    }
    return left.card.canonicalName.localeCompare(
      right.card.canonicalName,
      "en-US",
    );
  });

  const targetPlayers = sortedBySeed.slice(0, targetPlayerCount).map((item, index) => {
    const rank = index + 1;
    const storySourceSummary = readStorySourceSummary(item.card);
    return {
      sportsPersonId: item.card.sportsPersonId,
      canonicalName: item.card.canonicalName,
      displayName: item.card.displayName,
      teamCanonicalName: item.teamCanonicalName,
      teamSlug: item.teamSlug,
      currentClub: normalizeText(item.card.currentClub),
      positionGroup: normalizeText(item.card.role.positionGroup),
      seedRank: rank,
      seedTier: seedTierFromRank(rank),
      seedScore: item.seedScore,
      actionPriorityScore: item.actionPriorityScore,
      completenessPct: item.coverage.completenessPct,
      missingFieldCount: item.coverage.missingFields.length,
      missingFieldIds: item.coverage.missingFields.map((field) => field.id),
      sourceCount: item.coverage.currentSources.length,
      recommendedSourceIds: item.coverage.recommendedSources.map(
        (source) => source.sourceId,
      ),
      hasLiveBiography: Boolean(item.card.profile?.biographySourceUrl),
      missingLiveBiography: item.missingLiveBiography,
      biographySourceLabel: normalizeText(item.card.profile?.biographySourceLabel),
      biographySourceUrl: normalizeText(item.card.profile?.biographySourceUrl),
      storySourceCount: storySourceSummary.totalUsableSourceCount,
      officialVoiceCount: storySourceSummary.officialVoiceCount,
      narrativeSourceCount:
        storySourceSummary.featureProfileCount +
        storySourceSummary.publicContextCount +
        storySourceSummary.storylineCount,
      broadcastAppearanceCount: storySourceSummary.broadcastCount,
      priorityHint: item.record?.priorityTier || null,
      editorialPriorityReason: item.record?.editorialPriorityReason || null,
    } satisfies FootballWorldCupDossierProgramPlayer;
  });

  const seedRankById = new Map(
    targetPlayers.map((item) => [item.sportsPersonId, item.seedRank]),
  );

  const top20MissingLiveBio = playerPool
    .filter(
      (item) => item.record?.priorityTier === "top20" && item.missingLiveBiography,
    )
    .sort((left, right) => {
      if (right.actionPriorityScore !== left.actionPriorityScore) {
        return right.actionPriorityScore - left.actionPriorityScore;
      }
      return right.seedScore - left.seedScore;
    })
    .map((item) => ({
      sportsPersonId: item.card.sportsPersonId,
      canonicalName: item.card.canonicalName,
      displayName: item.card.displayName,
      teamCanonicalName: item.teamCanonicalName,
      teamSlug: item.teamSlug,
      currentClub: normalizeText(item.card.currentClub),
      seedRank: seedRankById.get(item.card.sportsPersonId) || null,
      seedScore: item.seedScore,
      actionPriorityScore: item.actionPriorityScore,
      completenessPct: item.coverage.completenessPct,
      missingFieldIds: item.coverage.missingFields.map((field) => field.id),
      priorityHint: "top20" as const,
      editorialPriorityReason: item.record?.editorialPriorityReason || "",
      recommendedSourceIds: item.coverage.recommendedSources.map(
        (source) => source.sourceId,
      ),
    }))
    .slice(0, 20);

  const targetCohortWithLiveBiographyCount = targetPlayers.filter(
    (item) => item.hasLiveBiography,
  ).length;
  const targetCohortAverageCompletenessPct = targetPlayers.length
    ? Math.round(
        targetPlayers.reduce((total, item) => total + item.completenessPct, 0) /
          targetPlayers.length,
      )
    : 0;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    targetPlayerCount,
    privacyGuardrails: [
      "Collect only publicly available biography and professional information.",
      "Do not collect home addresses, phone numbers, passport details, personal contact information, or private family data.",
      "Community-wiki layers remain discovery-only until verified with stronger public sources.",
    ],
    sourceLadder: buildSourceLadder(playbook),
    summary: {
      playerPoolCount: playerPool.length,
      targetCohortCount: targetPlayers.length,
      targetCohortWithLiveBiographyCount,
      targetCohortMissingLiveBiographyCount:
        targetPlayers.length - targetCohortWithLiveBiographyCount,
      targetCohortAverageCompletenessPct,
      top20MissingLiveBiographyCount: top20MissingLiveBio.length,
    },
    targetPlayers,
    top20MissingLiveBio,
  };
}
