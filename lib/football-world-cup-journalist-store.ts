import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildPersonDisplayNameContext,
  replaceDisplayPersonNames,
  toDisplayPersonName,
} from '@/lib/person-display-name';
import {
  normalizeFootballClubDisplayName,
  normalizeKnownFootballClubNamesInText,
} from '@/lib/football-club-display';
import { readLatestInstagramProfilesByPersonIds } from '@/lib/sports-social-store';

type NullableString = string | null;

export type JournalistEvidence = {
  articleExternalId: NullableString;
  sourceLabel: NullableString;
  sourceUrl: NullableString;
  evidenceText: NullableString;
  observedAt: string;
};

export type JournalistClaim = {
  claimId: string;
  claimType: string;
  claimStatus: string;
  claimText: string;
  claimValue: Record<string, unknown> | null;
  confidence: number;
  madeAt: NullableString;
  effectiveAt: string;
  source: NullableString;
  sourceUrl: NullableString;
  sourceLabel: NullableString;
  metadata: Record<string, unknown> | null;
  evidence: JournalistEvidence[];
};

export type JournalistAppearanceSubject = {
  entityType: string;
  entityId: string;
  canonicalName: NullableString;
  displayName: NullableString;
  roleInAppearance: string;
  confidence: number;
};

export type JournalistAppearance = {
  appearanceId: string;
  teamCanonicalName: string;
  appearanceType: string;
  title: string;
  summary: NullableString;
  url: NullableString;
  outletName: NullableString;
  publisherName: NullableString;
  source: NullableString;
  sourceLabel: NullableString;
  officialHost: NullableString;
  appearanceDate: NullableString;
  metadata: Record<string, unknown> | null;
  subjects: JournalistAppearanceSubject[];
};

export type JournalistStorylineArticle = {
  articleExternalId: string;
  relevanceScore: number;
  isRepresentative: boolean;
  url: NullableString;
  title: NullableString;
  publicationDatetime: NullableString;
  source: NullableString;
  snippet: NullableString;
};

export type JournalistStorylineEntity = {
  entityType: string;
  entityId: string;
  canonicalName: NullableString;
  displayName: NullableString;
  roleInStory: string;
  weight: number;
};

export type JournalistStoryline = {
  storylineId: string;
  teamCanonicalName: string;
  storyType: string;
  title: string;
  summary: NullableString;
  status: string;
  firstSeenAt: NullableString;
  lastSeenAt: NullableString;
  heatScore: number;
  subjectSportsPersonId: NullableString;
  subjectCanonicalName: NullableString;
  subjectDisplayName: NullableString;
  sourceUrl: NullableString;
  sourceLabel: NullableString;
  claimType: NullableString;
  topicSnippet: NullableString;
  metadata: Record<string, unknown> | null;
  entities: JournalistStorylineEntity[];
  articles: JournalistStorylineArticle[];
};

export type JournalistPortrait = {
  sourceType: NullableString;
  sourceLabel: NullableString;
  sourceUrl: NullableString;
  sourcePageUrl: NullableString;
  publicPath: NullableString;
  width: number | null;
  height: number | null;
  license: NullableString;
  author: NullableString;
};

export type JournalistClubHistoryItem = {
  club: string;
  startDate: NullableString;
  endDate: NullableString;
  isCurrent: boolean;
  sourceLabel: NullableString;
  sourceUrl: NullableString;
};

export type JournalistInstagramProfile = {
  handle: string;
  profileUrl: NullableString;
  followersCount: number | null;
  followingCount: number | null;
  mediaCount: number | null;
  snapshotAt: NullableString;
};

export type JournalistPersonCard = {
  sportsPersonId: string;
  canonicalName: string;
  displayName: string;
  personType: string;
  primaryNationality: NullableString;
  birthDate: NullableString;
  currentClub: NullableString;
  portrait: JournalistPortrait | null;
  role: {
    roleType: string;
    roleLabel: string;
    positionGroup: NullableString;
    squadNumber: number | null;
    validFrom: NullableString;
    validTo: NullableString;
    roleMetadata: Record<string, unknown> | null;
  };
  profile: {
    profileType: string;
    shortBio: NullableString;
    longBio: NullableString;
    birthPlace: NullableString;
    hometown: NullableString;
    residenceCountry: NullableString;
    heightCm: number | null;
    weightKg: number | null;
    handedness: NullableString;
    footedness: NullableString;
    education: string[];
    youthClubs: string[];
    clubHistory: JournalistClubHistoryItem[];
    biographySourceLabel: NullableString;
    biographySourceUrl: NullableString;
    source: NullableString;
    sourceUrl: NullableString;
    sourceLabel: NullableString;
    sourceKind: NullableString;
    confidence: number;
    metadata: Record<string, unknown> | null;
    updatedAt: string;
  } | null;
  aliases: {
    accentless: string[];
    all: Array<{
      alias: string;
      aliasType: string;
      language: NullableString;
      script: NullableString;
      isPrimary: boolean;
      source: NullableString;
    }>;
  };
  socialProfiles: {
    instagram: JournalistInstagramProfile | null;
  };
  statusPanel: {
    summaryText: NullableString;
    updatedAt: NullableString;
    currentStatus: JournalistClaim | null;
    latestSelectionStatus: JournalistClaim | null;
    latestInjuryStatus: JournalistClaim | null;
    latestReturnStatus: JournalistClaim | null;
    latestSuspensionStatus: JournalistClaim | null;
    latestCaptaincyStatus: JournalistClaim | null;
    structured: {
      selectionStatus: NullableString;
      injuryStatus: NullableString;
      returnStatus: NullableString;
      suspensionStatus: NullableString;
      captaincyStatus: NullableString;
    };
  };
  officialAppearanceTimeline: JournalistAppearance[];
  storylineList: JournalistStoryline[];
};

export type JournalistTeamView = {
  team: {
    canonicalName: string;
    slug: string;
    scopeTier: 'priority' | 'secondary' | 'unknown';
    competitionCanonicalName: string;
    competitionEditionName: string;
    officialSource: {
      configured: boolean;
      enabled: boolean;
      parserType: NullableString;
      sourceUrl: NullableString;
      sourceLabel: NullableString;
      sourceKind: NullableString;
      notes: NullableString;
      appearanceSeeds: Array<{
        url: NullableString;
        label: NullableString;
        appearanceType: NullableString;
      }>;
    };
    summary: {
      playerCount: number;
      staffCount: number;
      playerProfileCount: number;
      staffProfileCount: number;
      currentStatusCount: number;
      officialAppearanceCount: number;
      storylineCount: number;
      latestSelectionSignalAt: NullableString;
      latestCurrentStatusAt: NullableString;
      latestOfficialAppearanceAt: NullableString;
      latestStorylineSeenAt: NullableString;
    };
    editorial: JournalistTeamEditorial;
  };
  playerCards: JournalistPersonCard[];
  staffCards: JournalistPersonCard[];
  officialAppearanceTimeline: JournalistAppearance[];
  storylineList: JournalistStoryline[];
};

export type JournalistTeamEditorial = {
  coverageStatus: 'ok' | 'needs_review' | 'blocker';
  qualityStatus: 'ok' | 'needs_review';
  scopeTier: 'priority' | 'secondary' | 'unknown';
  sourceTier: string;
  lastVerifiedAt: NullableString;
  manualOverrideActive: boolean;
  usesAuxiliarySource: boolean;
  issues: string[];
  qualityIssues: string[];
  freshness: {
    rosterSignalAgeDays: number | null;
    currentStatusAgeDays: number | null;
    officialAppearanceAgeDays: number | null;
    storylineAgeDays: number | null;
  };
  coverage: {
    generatedAt: NullableString;
    latestSelectionSignalAt: NullableString;
    latestCurrentStatusAt: NullableString;
    latestOfficialSignalAt: NullableString;
    needsReview: boolean;
    blocker: boolean;
  };
  quality: {
    generatedAt: NullableString;
    playerProfilePct: number | null;
    birthDateKnownPct: number | null;
    currentClubKnownPct: number | null;
    richLongBiosPct: number | null;
    commentaryClaimCount: number | null;
    templatedCommentaryCount: number | null;
    genericTitleCount: number | null;
    duplicateTitleCount: number | null;
  };
  diff: {
    generatedAt: NullableString;
    baselineAvailable: boolean;
    hasChanges: boolean;
    changeCount: number;
    changeKinds: string[];
    summaryLines: string[];
    changedPeopleCount: number;
  } | null;
};

export type FootballWorldCupJournalistEditorialSummary = {
  generatedAt: NullableString;
  coverage: {
    blockerCount: number;
    needsReviewCount: number;
    okCount: number;
    blockerTeams: string[];
    needsReviewTeams: string[];
  };
  quality: {
    configuredScopeTeams: number;
    coverageOkTeams: number;
    auditedTeams: number;
    excludedCoverageTeams: number;
    excludedCoverageTeamNames: string[];
    teamsWithProfileGaps: number;
    teamsWithBirthDateGaps: number;
    teamsWithClubGaps: number;
    teamsWithTemplatedCommentary: number;
    teamsWithGenericStorylines: number;
    teamsWithDuplicateStorylines: number;
  };
  diff: {
    generatedAt: NullableString;
    baselineAvailable: boolean;
    changedTeamCount: number;
    changedTeams: string[];
    coverageStatusChangedTeams: string[];
    issueChangedTeams: string[];
    rosterChangedTeams: string[];
    statusChangedTeams: string[];
    officialAppearanceChangedTeams: string[];
    storylineChangedTeams: string[];
  };
};

export type FootballWorldCupJournalistSnapshot = {
  version: number;
  exportedAt: string;
  source: {
    teamListPath: string;
    sourceManifestPath: string;
    secondarySourceManifestPath: NullableString;
    competitionCanonicalName: string;
    competitionEditionName: string;
  };
  summary: {
    teamCount: number;
    personCount: number;
    playerCount: number;
    staffCount: number;
    officialAppearanceCount: number;
    storylineCount: number;
    latestOfficialAppearanceAt: NullableString;
    latestCurrentStatusAt: NullableString;
    latestStorylineSeenAt: NullableString;
  };
  editorialSummary: FootballWorldCupJournalistEditorialSummary;
  teams: JournalistTeamView[];
};

type CoverageAuditTeam = {
  teamCanonicalName: string;
  status: 'ok' | 'needs_review' | 'blocker';
  claims: {
    latestSelectionSignalAt: NullableString;
    latestCurrentStatusAt: NullableString;
  };
  officialAppearances: {
    latestOfficialSignalAt: NullableString;
  };
  staleSignals: {
    officialAppearanceAgeDays: number | null;
    rosterSignalAgeDays: number | null;
  };
  issues: string[];
};

type CoverageAuditPayload = {
  generatedAt: string;
  summary: {
    blockerCount: number;
    needsReviewCount: number;
    okCount: number;
    blockerTeams: string[];
    needsReviewTeams: string[];
  };
  teams: CoverageAuditTeam[];
};

type QualityAuditTeam = {
  teamCanonicalName: string;
  issues: string[];
  profile: {
    playerProfilePct: number;
    birthDateKnownPct: number;
    currentClubKnownPct: number;
    richLongBiosPct: number;
  };
  claims: {
    commentaryClaimCount: number;
    templatedCommentaryCount: number;
  };
  storylines: {
    genericTitleCount: number;
    duplicateTitleCount: number;
  };
};

type QualityAuditPayload = {
  generatedAt: string;
  summary: {
    configuredScopeTeams: number;
    coverageOkTeams: number;
    auditedTeams: number;
    excludedCoverageTeams: number;
    excludedCoverageTeamNames: string[];
    teamsWithProfileGaps: number;
    teamsWithBirthDateGaps: number;
    teamsWithClubGaps: number;
    teamsWithTemplatedCommentary: number;
    teamsWithGenericStorylines: number;
    teamsWithDuplicateStorylines: number;
  };
  teams: QualityAuditTeam[];
};

type EditorialDiffTeam = {
  teamCanonicalName: string;
  hasChanges: boolean;
  changeCount: number;
  changeKinds: string[];
  summaryLines: string[];
  statuses: {
    changedPeople: Array<{
      sportsPersonId: string;
    }>;
  };
};

type EditorialDiffPayload = {
  generatedAt: string;
  baselineAvailable: boolean;
  summary: {
    changedTeamCount: number;
    changedTeams: string[];
    coverageStatusChangedTeams: string[];
    issueChangedTeams: string[];
    rosterChangedTeams: string[];
    statusChangedTeams: string[];
    officialAppearanceChangedTeams: string[];
    storylineChangedTeams: string[];
  };
  teams: EditorialDiffTeam[];
};

const SNAPSHOT_RELATIVE_PATHS = [
  path.join('data', 'football-world-cup-journalist.latest.json'),
  path.join('output', 'football-world-cup-journalist', 'latest.json'),
];
const COVERAGE_AUDIT_RELATIVE_PATH = path.join('audits', 'football_world_cup_coverage_latest.json');
const QUALITY_AUDIT_RELATIVE_PATH = path.join('audits', 'football_world_cup_journalist_quality_latest.json');
const EDITORIAL_DIFF_RELATIVE_PATH = path.join('audits', 'football_world_cup_editorial_diff_latest.json');

function normalizeClaim(claim: JournalistClaim, displayNameContext: ReturnType<typeof buildPersonDisplayNameContext>): JournalistClaim {
  return {
    ...claim,
    claimText: replaceDisplayPersonNames(claim.claimText, displayNameContext) || claim.claimText,
    evidence: claim.evidence.map((evidence) => ({
      ...evidence,
      evidenceText: replaceDisplayPersonNames(evidence.evidenceText, displayNameContext),
    })),
  };
}

function normalizeAppearance(
  appearance: JournalistAppearance,
  displayNameContext: ReturnType<typeof buildPersonDisplayNameContext>
): JournalistAppearance {
  return {
    ...appearance,
    title: replaceDisplayPersonNames(appearance.title, displayNameContext) || appearance.title,
    summary: replaceDisplayPersonNames(appearance.summary, displayNameContext),
    subjects: appearance.subjects.map((subject) => ({
      ...subject,
      canonicalName: replaceDisplayPersonNames(subject.canonicalName, displayNameContext),
      displayName: subject.entityType === 'person'
        ? displayNameContext.byPersonId.get(subject.entityId)
            || toDisplayPersonName(
              replaceDisplayPersonNames(subject.canonicalName, displayNameContext) || subject.canonicalName || ''
            )
        : replaceDisplayPersonNames(subject.canonicalName, displayNameContext),
    })),
  };
}

function normalizeStoryline(
  storyline: JournalistStoryline,
  displayNameContext: ReturnType<typeof buildPersonDisplayNameContext>
): JournalistStoryline {
  return {
    ...storyline,
    title: replaceDisplayPersonNames(storyline.title, displayNameContext) || storyline.title,
    summary: replaceDisplayPersonNames(storyline.summary, displayNameContext),
    subjectCanonicalName: replaceDisplayPersonNames(storyline.subjectCanonicalName, displayNameContext),
    subjectDisplayName: storyline.subjectSportsPersonId
      ? displayNameContext.byPersonId.get(storyline.subjectSportsPersonId)
          || toDisplayPersonName(
            replaceDisplayPersonNames(storyline.subjectCanonicalName, displayNameContext) || storyline.subjectCanonicalName || ''
          )
      : replaceDisplayPersonNames(storyline.subjectCanonicalName, displayNameContext),
    topicSnippet: replaceDisplayPersonNames(storyline.topicSnippet, displayNameContext),
    entities: storyline.entities.map((entity) => ({
      ...entity,
      canonicalName: replaceDisplayPersonNames(entity.canonicalName, displayNameContext),
      displayName: entity.entityType === 'person'
        ? displayNameContext.byPersonId.get(entity.entityId)
            || toDisplayPersonName(
              replaceDisplayPersonNames(entity.canonicalName, displayNameContext) || entity.canonicalName || ''
            )
        : replaceDisplayPersonNames(entity.canonicalName, displayNameContext),
    })),
    articles: storyline.articles.map((article) => ({
      ...article,
      title: replaceDisplayPersonNames(article.title, displayNameContext),
      snippet: replaceDisplayPersonNames(article.snippet, displayNameContext),
    })),
  };
}

function normalizePersonCard(
  card: JournalistPersonCard,
  displayNameContext: ReturnType<typeof buildPersonDisplayNameContext>
): JournalistPersonCard {
  const normalizedCurrentClub = normalizeFootballClubDisplayName(card.currentClub);
  return {
    ...card,
    canonicalName: toDisplayPersonName(card.canonicalName),
    displayName: displayNameContext.byPersonId.get(card.sportsPersonId) || toDisplayPersonName(card.canonicalName),
    currentClub: normalizedCurrentClub,
    profile: card.profile ? {
      ...card.profile,
      shortBio: normalizeKnownFootballClubNamesInText(replaceDisplayPersonNames(card.profile.shortBio, displayNameContext)),
      longBio: normalizeKnownFootballClubNamesInText(replaceDisplayPersonNames(card.profile.longBio, displayNameContext)),
      birthPlace: replaceDisplayPersonNames(card.profile.birthPlace, displayNameContext),
      hometown: replaceDisplayPersonNames(card.profile.hometown, displayNameContext),
      residenceCountry: replaceDisplayPersonNames(card.profile.residenceCountry, displayNameContext),
      education: card.profile.education.map((item) => replaceDisplayPersonNames(item, displayNameContext) || item),
      youthClubs: card.profile.youthClubs.map((item) => replaceDisplayPersonNames(item, displayNameContext) || item),
      clubHistory: card.profile.clubHistory.map((item) => ({
        ...item,
        club: normalizeFootballClubDisplayName(replaceDisplayPersonNames(item.club, displayNameContext)) || item.club,
      })),
    } : null,
    socialProfiles: {
      instagram: card.socialProfiles?.instagram || null,
    },
    statusPanel: {
      ...card.statusPanel,
      summaryText: replaceDisplayPersonNames(card.statusPanel.summaryText, displayNameContext),
      currentStatus: card.statusPanel.currentStatus ? normalizeClaim(card.statusPanel.currentStatus, displayNameContext) : null,
      latestSelectionStatus: card.statusPanel.latestSelectionStatus ? normalizeClaim(card.statusPanel.latestSelectionStatus, displayNameContext) : null,
      latestInjuryStatus: card.statusPanel.latestInjuryStatus ? normalizeClaim(card.statusPanel.latestInjuryStatus, displayNameContext) : null,
      latestReturnStatus: card.statusPanel.latestReturnStatus ? normalizeClaim(card.statusPanel.latestReturnStatus, displayNameContext) : null,
      latestSuspensionStatus: card.statusPanel.latestSuspensionStatus ? normalizeClaim(card.statusPanel.latestSuspensionStatus, displayNameContext) : null,
      latestCaptaincyStatus: card.statusPanel.latestCaptaincyStatus ? normalizeClaim(card.statusPanel.latestCaptaincyStatus, displayNameContext) : null,
    },
    officialAppearanceTimeline: card.officialAppearanceTimeline.map((appearance) => normalizeAppearance(appearance, displayNameContext)),
    storylineList: card.storylineList.map((storyline) => normalizeStoryline(storyline, displayNameContext)),
  };
}

function applyInstagramOverlay(
  snapshot: FootballWorldCupJournalistSnapshot,
  rows: Awaited<ReturnType<typeof readLatestInstagramProfilesByPersonIds>>
): FootballWorldCupJournalistSnapshot {
  if (!rows.length) return snapshot;

  const profileByPersonId = new Map(
    rows.map((row) => [
      String(row.personId),
      {
        handle: row.handle,
        profileUrl: row.profileUrl,
        followersCount: row.followersCount,
        followingCount: row.followingCount,
        mediaCount: row.mediaCount,
        snapshotAt: row.snapshotAt,
      } satisfies JournalistInstagramProfile,
    ])
  );

  const applyCard = (card: JournalistPersonCard): JournalistPersonCard => ({
    ...card,
    socialProfiles: {
      instagram: profileByPersonId.get(card.sportsPersonId) || card.socialProfiles?.instagram || null,
    },
  });

  return {
    ...snapshot,
    teams: snapshot.teams.map((team) => ({
      ...team,
      playerCards: team.playerCards.map(applyCard),
      staffCards: team.staffCards.map(applyCard),
    })),
  };
}

function normalizeFootballWorldCupJournalistSnapshot(
  snapshot: FootballWorldCupJournalistSnapshot
): FootballWorldCupJournalistSnapshot {
  const seeds = snapshot.teams.flatMap((team) =>
    [...team.playerCards, ...team.staffCards].map((card) => ({
      personId: card.sportsPersonId,
      canonicalName: card.canonicalName,
    }))
  );
  const displayNameContext = buildPersonDisplayNameContext(seeds);

  return {
    ...snapshot,
    editorialSummary: buildEditorialSummary(null, null, null),
    teams: snapshot.teams.map((team) => ({
      ...team,
      team: {
        ...team.team,
        scopeTier: team.team.scopeTier || 'unknown',
        editorial: buildEmptyEditorial({ team: team.team } as Pick<JournalistTeamView, 'team'>),
      },
      playerCards: team.playerCards.map((card) => normalizePersonCard(card, displayNameContext)),
      staffCards: team.staffCards.map((card) => normalizePersonCard(card, displayNameContext)),
      officialAppearanceTimeline: team.officialAppearanceTimeline.map((appearance) => normalizeAppearance(appearance, displayNameContext)),
      storylineList: team.storylineList.map((storyline) => normalizeStoryline(storyline, displayNameContext)),
    })),
  };
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.filter(Boolean))];
}

function getSnapshotRootDirectories(): string[] {
  return uniquePaths([
    process.cwd(),
    (process.env.WPR_PRIMARY_WORKTREE || '').trim(),
    (process.env.WPM_PRIMARY_WORKTREE || '').trim(),
  ]);
}

function getSnapshotPaths(): string[] {
  return uniquePaths(
    getSnapshotRootDirectories().flatMap((rootDir) =>
      SNAPSHOT_RELATIVE_PATHS.map((relativePath) => path.join(rootDir, relativePath))
    )
  );
}

function getArtifactPaths(relativePath: string): string[] {
  return getSnapshotRootDirectories().map((rootDir) => path.join(rootDir, relativePath));
}

async function readArtifactJson<T>(relativePath: string): Promise<T | null> {
  for (const filePath of getArtifactPaths(relativePath)) {
    try {
      const raw = await readFile(filePath, 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      continue;
    }
  }
  return null;
}

function diffDaysFromNow(value: NullableString): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return null;
  return Math.floor((Date.now() - ts) / 86_400_000);
}

function maxIso(values: Array<NullableString | undefined>): NullableString {
  const kept = values.filter((value): value is string => Boolean(value));
  if (!kept.length) return null;
  return kept.sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null;
}

function deriveSourceTier(team: Pick<JournalistTeamView, 'team'>, coverage: CoverageAuditTeam | null): string {
  if (!team.team.officialSource.configured) return 'unconfigured';
  if (coverage?.issues.includes('manual_override_active')) return 'manual_override';
  if (coverage?.issues.includes('using_auxiliary_source')) return 'auxiliary_source';
  if (team.team.officialSource.sourceKind?.trim()) return team.team.officialSource.sourceKind.trim();
  if (!team.team.officialSource.enabled) return 'fallback_path';
  if (team.team.officialSource.parserType?.includes('ocr')) return 'official_parser_ocr';
  if (team.team.officialSource.parserType?.includes('render')) return 'official_parser_rendered';
  if (team.team.officialSource.parserType?.includes('mirror')) return 'official_parser_mirror';
  return 'official_parser';
}

function buildEmptyEditorial(team: Pick<JournalistTeamView, 'team'>): JournalistTeamEditorial {
  return {
    coverageStatus: 'needs_review',
    qualityStatus: 'ok',
    scopeTier: team.team.scopeTier || 'unknown',
    sourceTier: deriveSourceTier(team, null),
    lastVerifiedAt: maxIso([
      team.team.summary.latestSelectionSignalAt,
      team.team.summary.latestCurrentStatusAt,
      team.team.summary.latestOfficialAppearanceAt,
    ]),
    manualOverrideActive: false,
    usesAuxiliarySource: false,
    issues: [],
    qualityIssues: [],
    freshness: {
      rosterSignalAgeDays: diffDaysFromNow(maxIso([
        team.team.summary.latestSelectionSignalAt,
        team.team.summary.latestCurrentStatusAt,
      ])),
      currentStatusAgeDays: diffDaysFromNow(team.team.summary.latestCurrentStatusAt),
      officialAppearanceAgeDays: diffDaysFromNow(team.team.summary.latestOfficialAppearanceAt),
      storylineAgeDays: diffDaysFromNow(team.team.summary.latestStorylineSeenAt),
    },
    coverage: {
      generatedAt: null,
      latestSelectionSignalAt: team.team.summary.latestSelectionSignalAt,
      latestCurrentStatusAt: team.team.summary.latestCurrentStatusAt,
      latestOfficialSignalAt: team.team.summary.latestOfficialAppearanceAt,
      needsReview: true,
      blocker: false,
    },
    quality: {
      generatedAt: null,
      playerProfilePct: null,
      birthDateKnownPct: null,
      currentClubKnownPct: null,
      richLongBiosPct: null,
      commentaryClaimCount: null,
      templatedCommentaryCount: null,
      genericTitleCount: null,
      duplicateTitleCount: null,
    },
    diff: null,
  };
}

function buildEditorialSummary(
  coverage: CoverageAuditPayload | null,
  quality: QualityAuditPayload | null,
  diff: EditorialDiffPayload | null
): FootballWorldCupJournalistEditorialSummary {
  return {
    generatedAt: maxIso([coverage?.generatedAt, quality?.generatedAt, diff?.generatedAt]),
    coverage: {
      blockerCount: coverage?.summary.blockerCount || 0,
      needsReviewCount: coverage?.summary.needsReviewCount || 0,
      okCount: coverage?.summary.okCount || 0,
      blockerTeams: coverage?.summary.blockerTeams || [],
      needsReviewTeams: coverage?.summary.needsReviewTeams || [],
    },
    quality: {
      configuredScopeTeams: quality?.summary.configuredScopeTeams || 0,
      coverageOkTeams: quality?.summary.coverageOkTeams || 0,
      auditedTeams: quality?.summary.auditedTeams || 0,
      excludedCoverageTeams: quality?.summary.excludedCoverageTeams || 0,
      excludedCoverageTeamNames: quality?.summary.excludedCoverageTeamNames || [],
      teamsWithProfileGaps: quality?.summary.teamsWithProfileGaps || 0,
      teamsWithBirthDateGaps: quality?.summary.teamsWithBirthDateGaps || 0,
      teamsWithClubGaps: quality?.summary.teamsWithClubGaps || 0,
      teamsWithTemplatedCommentary: quality?.summary.teamsWithTemplatedCommentary || 0,
      teamsWithGenericStorylines: quality?.summary.teamsWithGenericStorylines || 0,
      teamsWithDuplicateStorylines: quality?.summary.teamsWithDuplicateStorylines || 0,
    },
    diff: {
      generatedAt: diff?.generatedAt || null,
      baselineAvailable: diff?.baselineAvailable || false,
      changedTeamCount: diff?.summary.changedTeamCount || 0,
      changedTeams: diff?.summary.changedTeams || [],
      coverageStatusChangedTeams: diff?.summary.coverageStatusChangedTeams || [],
      issueChangedTeams: diff?.summary.issueChangedTeams || [],
      rosterChangedTeams: diff?.summary.rosterChangedTeams || [],
      statusChangedTeams: diff?.summary.statusChangedTeams || [],
      officialAppearanceChangedTeams: diff?.summary.officialAppearanceChangedTeams || [],
      storylineChangedTeams: diff?.summary.storylineChangedTeams || [],
    },
  };
}

function applyEditorialOverlay(
  snapshot: FootballWorldCupJournalistSnapshot,
  coverage: CoverageAuditPayload | null,
  quality: QualityAuditPayload | null,
  diff: EditorialDiffPayload | null
): FootballWorldCupJournalistSnapshot {
  const coverageByTeam = new Map((coverage?.teams || []).map((team) => [team.teamCanonicalName, team]));
  const qualityByTeam = new Map((quality?.teams || []).map((team) => [team.teamCanonicalName, team]));
  const diffByTeam = new Map((diff?.teams || []).map((team) => [team.teamCanonicalName, team]));

  return {
    ...snapshot,
    editorialSummary: buildEditorialSummary(coverage, quality, diff),
    teams: snapshot.teams.map((team) => {
      const coverageTeam = coverageByTeam.get(team.team.canonicalName) || null;
      const qualityTeam = qualityByTeam.get(team.team.canonicalName) || null;
      const diffTeam = diffByTeam.get(team.team.canonicalName) || null;
      const baseEditorial = buildEmptyEditorial(team);
      const lastVerifiedAt = maxIso([
        coverageTeam?.claims.latestSelectionSignalAt,
        coverageTeam?.claims.latestCurrentStatusAt,
        coverageTeam?.officialAppearances.latestOfficialSignalAt,
        baseEditorial.lastVerifiedAt,
      ]);

      return {
        ...team,
        team: {
          ...team.team,
          editorial: {
            ...baseEditorial,
            coverageStatus: coverageTeam?.status || baseEditorial.coverageStatus,
            qualityStatus: qualityTeam?.issues.length ? 'needs_review' : 'ok',
            scopeTier: team.team.scopeTier || baseEditorial.scopeTier,
            sourceTier: deriveSourceTier(team, coverageTeam),
            lastVerifiedAt,
            manualOverrideActive: Boolean(coverageTeam?.issues.includes('manual_override_active')),
            usesAuxiliarySource: Boolean(coverageTeam?.issues.includes('using_auxiliary_source')),
            issues: coverageTeam?.issues || [],
            qualityIssues: qualityTeam?.issues || [],
            freshness: {
              rosterSignalAgeDays: coverageTeam?.staleSignals.rosterSignalAgeDays ?? baseEditorial.freshness.rosterSignalAgeDays,
              currentStatusAgeDays: diffDaysFromNow(maxIso([
                coverageTeam?.claims.latestCurrentStatusAt,
                team.team.summary.latestCurrentStatusAt,
              ])),
              officialAppearanceAgeDays: coverageTeam?.staleSignals.officialAppearanceAgeDays ?? baseEditorial.freshness.officialAppearanceAgeDays,
              storylineAgeDays: diffDaysFromNow(team.team.summary.latestStorylineSeenAt),
            },
            coverage: {
              generatedAt: coverage?.generatedAt || null,
              latestSelectionSignalAt: coverageTeam?.claims.latestSelectionSignalAt || team.team.summary.latestSelectionSignalAt,
              latestCurrentStatusAt: coverageTeam?.claims.latestCurrentStatusAt || team.team.summary.latestCurrentStatusAt,
              latestOfficialSignalAt: coverageTeam?.officialAppearances.latestOfficialSignalAt || team.team.summary.latestOfficialAppearanceAt,
              needsReview: coverageTeam?.status === 'needs_review',
              blocker: coverageTeam?.status === 'blocker',
            },
            quality: {
              generatedAt: quality?.generatedAt || null,
              playerProfilePct: qualityTeam?.profile.playerProfilePct ?? null,
              birthDateKnownPct: qualityTeam?.profile.birthDateKnownPct ?? null,
              currentClubKnownPct: qualityTeam?.profile.currentClubKnownPct ?? null,
              richLongBiosPct: qualityTeam?.profile.richLongBiosPct ?? null,
              commentaryClaimCount: qualityTeam?.claims.commentaryClaimCount ?? null,
              templatedCommentaryCount: qualityTeam?.claims.templatedCommentaryCount ?? null,
              genericTitleCount: qualityTeam?.storylines.genericTitleCount ?? null,
              duplicateTitleCount: qualityTeam?.storylines.duplicateTitleCount ?? null,
            },
            diff: diffTeam ? {
              generatedAt: diff?.generatedAt || null,
              baselineAvailable: Boolean(diff?.baselineAvailable),
              hasChanges: diffTeam.hasChanges,
              changeCount: diffTeam.changeCount,
              changeKinds: diffTeam.changeKinds,
              summaryLines: diffTeam.summaryLines,
              changedPeopleCount: diffTeam.statuses.changedPeople.length,
            } : null,
          },
        },
      };
    }),
  };
}

export async function readFootballWorldCupJournalistSnapshot(): Promise<FootballWorldCupJournalistSnapshot | null> {
  for (const filePath of getSnapshotPaths()) {
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as FootballWorldCupJournalistSnapshot;
      if (parsed && Array.isArray(parsed.teams)) {
        const normalized = normalizeFootballWorldCupJournalistSnapshot(parsed);
        const [coverage, quality, diff] = await Promise.all([
          readArtifactJson<CoverageAuditPayload>(COVERAGE_AUDIT_RELATIVE_PATH),
          readArtifactJson<QualityAuditPayload>(QUALITY_AUDIT_RELATIVE_PATH),
          readArtifactJson<EditorialDiffPayload>(EDITORIAL_DIFF_RELATIVE_PATH),
        ]);
        const withEditorial = applyEditorialOverlay(normalized, coverage, quality, diff);
        const personIds = withEditorial.teams.flatMap((team) =>
          [...team.playerCards, ...team.staffCards]
            .map((card) => Number(card.sportsPersonId))
            .filter((value) => Number.isFinite(value) && value > 0)
        );

        try {
          const instagramRows = await readLatestInstagramProfilesByPersonIds(personIds);
          return applyInstagramOverlay(withEditorial, instagramRows);
        } catch {
          return withEditorial;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

export function resolveFootballWorldCupJournalistSnapshotPath(): string {
  return path.join(process.cwd(), SNAPSHOT_RELATIVE_PATHS[0] || SNAPSHOT_RELATIVE_PATHS[1]!);
}
