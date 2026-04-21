import { NextRequest, NextResponse } from 'next/server';
import { buildPublicSnapshotCacheHeaders } from '@/lib/dashboard-cache-control';
import {
  type FootballWorldCupJournalistEditorialSummary,
  type JournalistPersonCard,
  readFootballWorldCupJournalistSnapshot,
  type JournalistTeamView,
} from '@/lib/football-world-cup-journalist-store';

export const runtime = 'nodejs';

function selectTeams(teams: JournalistTeamView[], teamParam: string | null): JournalistTeamView[] {
  if (!teamParam) return teams;
  const normalized = teamParam.trim().toLowerCase();
  return teams.filter((team) =>
    team.team.slug.toLowerCase() === normalized
    || team.team.canonicalName.toLowerCase() === normalized
  );
}

function matchesPerson(card: JournalistPersonCard, personParam: string): boolean {
  const normalized = personParam.trim().toLowerCase();
  if (!normalized) return true;
  if (card.sportsPersonId === personParam.trim()) return true;
  if (card.displayName.trim().toLowerCase() === normalized) return true;
  if (card.canonicalName.trim().toLowerCase() === normalized) return true;
  if (card.aliases.accentless.some((alias) => alias.trim().toLowerCase() === normalized)) return true;
  return card.aliases.all.some((alias) => alias.alias.trim().toLowerCase() === normalized);
}

function filterTeamByPerson(team: JournalistTeamView, personParam: string | null): JournalistTeamView | null {
  if (!personParam) return team;
  const playerCards = team.playerCards.filter((card) => matchesPerson(card, personParam));
  const staffCards = team.staffCards.filter((card) => matchesPerson(card, personParam));
  const matchedCards = [...playerCards, ...staffCards];
  if (!matchedCards.length) return null;

  const matchedIds = new Set(matchedCards.map((card) => card.sportsPersonId));
  const officialAppearanceTimeline = team.officialAppearanceTimeline.filter((appearance) =>
    appearance.subjects.some((subject) => subject.entityType === 'person' && matchedIds.has(subject.entityId))
  );
  const storylineList = team.storylineList.filter((storyline) =>
    (storyline.subjectSportsPersonId && matchedIds.has(storyline.subjectSportsPersonId))
    || storyline.entities.some((entity) => entity.entityType === 'person' && matchedIds.has(entity.entityId))
  );

  return {
    ...team,
    team: {
      ...team.team,
      summary: {
        ...team.team.summary,
        playerCount: playerCards.length,
        staffCount: staffCards.length,
        playerProfileCount: playerCards.filter((card) => Boolean(card.profile)).length,
        staffProfileCount: staffCards.filter((card) => Boolean(card.profile)).length,
        currentStatusCount: matchedCards.filter((card) => Boolean(card.statusPanel.currentStatus)).length,
        officialAppearanceCount: officialAppearanceTimeline.length,
        storylineCount: storylineList.length,
      },
    },
    playerCards,
    staffCards,
    officialAppearanceTimeline,
    storylineList,
  };
}

function buildFilteredEditorialSummary(
  teams: JournalistTeamView[],
  fallback: FootballWorldCupJournalistEditorialSummary
): FootballWorldCupJournalistEditorialSummary {
  return {
    generatedAt: fallback.generatedAt,
    coverage: {
      blockerCount: teams.filter((team) => team.team.editorial.coverageStatus === 'blocker').length,
      needsReviewCount: teams.filter((team) => team.team.editorial.coverageStatus === 'needs_review').length,
      okCount: teams.filter((team) => team.team.editorial.coverageStatus === 'ok').length,
      blockerTeams: teams
        .filter((team) => team.team.editorial.coverageStatus === 'blocker')
        .map((team) => team.team.canonicalName),
      needsReviewTeams: teams
        .filter((team) => team.team.editorial.coverageStatus === 'needs_review')
        .map((team) => team.team.canonicalName),
    },
    quality: {
      configuredScopeTeams: teams.length,
      coverageOkTeams: teams.filter((team) => team.team.editorial.coverageStatus === 'ok').length,
      auditedTeams: teams.filter((team) => team.team.editorial.coverageStatus === 'ok').length,
      excludedCoverageTeams: teams.filter((team) => team.team.editorial.coverageStatus !== 'ok').length,
      excludedCoverageTeamNames: teams
        .filter((team) => team.team.editorial.coverageStatus !== 'ok')
        .map((team) => team.team.canonicalName),
      teamsWithProfileGaps: teams.filter((team) => (team.team.editorial.quality.playerProfilePct ?? 100) < 100).length,
      teamsWithBirthDateGaps: teams.filter((team) => (team.team.editorial.quality.birthDateKnownPct ?? 100) < 100).length,
      teamsWithClubGaps: teams.filter((team) => (team.team.editorial.quality.currentClubKnownPct ?? 100) < 100).length,
      teamsWithTemplatedCommentary: teams.filter((team) => (team.team.editorial.quality.templatedCommentaryCount ?? 0) > 0).length,
      teamsWithGenericStorylines: teams.filter((team) => (team.team.editorial.quality.genericTitleCount ?? 0) > 0).length,
      teamsWithDuplicateStorylines: teams.filter((team) => (team.team.editorial.quality.duplicateTitleCount ?? 0) > 0).length,
    },
    diff: {
      generatedAt: fallback.diff.generatedAt,
      baselineAvailable: fallback.diff.baselineAvailable,
      changedTeamCount: teams.filter((team) => team.team.editorial.diff?.hasChanges).length,
      changedTeams: teams.filter((team) => team.team.editorial.diff?.hasChanges).map((team) => team.team.canonicalName),
      coverageStatusChangedTeams: teams
        .filter((team) => team.team.editorial.diff?.changeKinds.includes('coverage'))
        .map((team) => team.team.canonicalName),
      issueChangedTeams: teams
        .filter((team) =>
          team.team.editorial.diff?.changeKinds.includes('coverage')
          && team.team.editorial.diff.summaryLines.some((line) => line.toLowerCase().includes('issue'))
        )
        .map((team) => team.team.canonicalName),
      rosterChangedTeams: teams
        .filter((team) => team.team.editorial.diff?.changeKinds.includes('roster'))
        .map((team) => team.team.canonicalName),
      statusChangedTeams: teams
        .filter((team) => team.team.editorial.diff?.changeKinds.includes('status'))
        .map((team) => team.team.canonicalName),
      officialAppearanceChangedTeams: teams
        .filter((team) => team.team.editorial.diff?.changeKinds.includes('official_appearance'))
        .map((team) => team.team.canonicalName),
      storylineChangedTeams: teams
        .filter((team) => team.team.editorial.diff?.changeKinds.includes('storyline'))
        .map((team) => team.team.canonicalName),
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const snapshot = await readFootballWorldCupJournalistSnapshot();
    if (!snapshot || !snapshot.teams.length) {
      return NextResponse.json(
        {
          message: 'World Cup journalist snapshot unavailable.',
          reason: 'missing_snapshot',
        },
        {
          status: 503,
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }

    const teamParam = request.nextUrl.searchParams.get('team');
    const personParam = request.nextUrl.searchParams.get('person');
    const selectedTeams = selectTeams(snapshot.teams, teamParam);

    if (teamParam && !selectedTeams.length) {
      return NextResponse.json(
        {
          message: `Unknown World Cup team: ${teamParam}`,
          reason: 'team_not_found',
        },
        {
          status: 404,
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }

    const teams = selectedTeams
      .map((team) => filterTeamByPerson(team, personParam))
      .filter((team): team is JournalistTeamView => Boolean(team));

    if (personParam && !teams.length) {
      return NextResponse.json(
        {
          message: `Unknown World Cup person: ${personParam}`,
          reason: 'person_not_found',
        },
        {
          status: 404,
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }

    return NextResponse.json(
      {
        version: snapshot.version,
        exportedAt: snapshot.exportedAt,
        source: snapshot.source,
        appliedFilters: {
          team: teamParam,
          person: personParam,
        },
        summary: {
          ...snapshot.summary,
          teamCount: teams.length,
          personCount: teams.reduce((total, team) => total + team.playerCards.length + team.staffCards.length, 0),
          playerCount: teams.reduce((total, team) => total + team.playerCards.length, 0),
          staffCount: teams.reduce((total, team) => total + team.staffCards.length, 0),
          officialAppearanceCount: teams.reduce((total, team) => total + team.officialAppearanceTimeline.length, 0),
          storylineCount: teams.reduce((total, team) => total + team.storylineList.length, 0),
        },
        editorialSummary: buildFilteredEditorialSummary(teams, snapshot.editorialSummary),
        teams,
      },
      {
        status: 200,
        headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'snapshot-file' }),
      }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Failed to load World Cup journalist payload.',
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
