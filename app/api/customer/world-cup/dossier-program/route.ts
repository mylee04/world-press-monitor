import { NextRequest, NextResponse } from "next/server";
import { buildPublicSnapshotCacheHeaders } from "@/lib/dashboard-cache-control";
import { buildFootballWorldCupDossierProgram } from "@/lib/football-world-cup-dossier-program";
import { readFootballWorldCupHumanInterestPilotCanonical } from "@/lib/football-world-cup-human-interest-store";
import { readFootballWorldCupJournalistSnapshot } from "@/lib/football-world-cup-journalist-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const [snapshot, humanInterestPayload] = await Promise.all([
      readFootballWorldCupJournalistSnapshot(),
      readFootballWorldCupHumanInterestPilotCanonical(),
    ]);

    if (!snapshot || !snapshot.teams.length) {
      return NextResponse.json(
        {
          message: "World Cup journalist snapshot unavailable.",
          reason: "missing_snapshot",
        },
        {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const teamParam = request.nextUrl.searchParams.get("team")?.trim() || null;
    const personParam = request.nextUrl.searchParams.get("person")?.trim() || null;
    const program = buildFootballWorldCupDossierProgram(
      snapshot,
      humanInterestPayload?.records || [],
    );

    const filteredTargetPlayers = program.targetPlayers.filter((item) => {
      if (teamParam) {
        const normalizedTeam = teamParam.toLowerCase();
        if (
          item.teamCanonicalName.toLowerCase() !== normalizedTeam &&
          item.teamSlug.toLowerCase() !== normalizedTeam
        ) {
          return false;
        }
      }
      if (personParam) {
        const normalizedPerson = personParam.toLowerCase();
        if (
          item.sportsPersonId !== personParam &&
          item.canonicalName.toLowerCase() !== normalizedPerson &&
          item.displayName.toLowerCase() !== normalizedPerson
        ) {
          return false;
        }
      }
      return true;
    });

    const filteredTop20MissingLiveBio = program.top20MissingLiveBio.filter((item) => {
      if (teamParam) {
        const normalizedTeam = teamParam.toLowerCase();
        if (
          item.teamCanonicalName.toLowerCase() !== normalizedTeam &&
          item.teamSlug.toLowerCase() !== normalizedTeam
        ) {
          return false;
        }
      }
      if (personParam) {
        const normalizedPerson = personParam.toLowerCase();
        if (
          item.sportsPersonId !== personParam &&
          item.canonicalName.toLowerCase() !== normalizedPerson &&
          item.displayName.toLowerCase() !== normalizedPerson
        ) {
          return false;
        }
      }
      return true;
    });

    return NextResponse.json(
      {
        ...program,
        appliedFilters: {
          team: teamParam,
          person: personParam,
        },
        summary: {
          ...program.summary,
          targetCohortCount: filteredTargetPlayers.length,
          top20MissingLiveBiographyCount: filteredTop20MissingLiveBio.length,
        },
        targetPlayers: filteredTargetPlayers,
        top20MissingLiveBio: filteredTop20MissingLiveBio,
      },
      {
        status: 200,
        headers: buildPublicSnapshotCacheHeaders({
          "X-Data-Source": "snapshot-derived-dossier-program",
        }),
      },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Failed to build World Cup dossier program.",
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
