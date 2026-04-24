import fs from "node:fs/promises";
import path from "node:path";
import {
  buildFootballWorldCupDossierProgram,
} from "@/lib/football-world-cup-dossier-program";
import { readFootballWorldCupHumanInterestPilotCanonical } from "@/lib/football-world-cup-human-interest-store";
import { readFootballWorldCupJournalistSnapshot } from "@/lib/football-world-cup-journalist-store";

type CommunityHint = {
  sourceId: "grokpedia" | "namuwiki";
  label: string;
  query: string;
  url: string | null;
  status: "not_fetched_discovery_only" | "manual_lookup_required_discovery_only";
  promotionPolicy: "never_auto_promote_to_live_profile";
};

type CommunityHintRecord = {
  sportsPersonId: string;
  displayName: string;
  canonicalName: string;
  teamCanonicalName: string;
  seedRank: number;
  hints: CommunityHint[];
};

function buildNamuwikiSearchUrl(query: string): string {
  return `https://namu.wiki/Search?q=${encodeURIComponent(query)}`;
}

async function main() {
  const snapshot = await readFootballWorldCupJournalistSnapshot();
  const humanInterestPayload =
    await readFootballWorldCupHumanInterestPilotCanonical();

  if (!snapshot) {
    throw new Error("World Cup journalist snapshot unavailable.");
  }

  const program = buildFootballWorldCupDossierProgram(
    snapshot,
    humanInterestPayload?.records || [],
  );
  const targetPlayers = program.targetPlayers.slice(0, 500);
  const generatedAt = new Date().toISOString();

  const records: CommunityHintRecord[] = targetPlayers.map((player) => {
    const query = `${player.displayName || player.canonicalName} footballer`;
    return {
      sportsPersonId: player.sportsPersonId,
      displayName: player.displayName || player.canonicalName,
      canonicalName: player.canonicalName,
      teamCanonicalName: player.teamCanonicalName,
      seedRank: player.seedRank,
      hints: [
        {
          sourceId: "namuwiki",
          label: "Namuwiki search",
          query,
          url: buildNamuwikiSearchUrl(player.displayName || player.canonicalName),
          status: "not_fetched_discovery_only",
          promotionPolicy: "never_auto_promote_to_live_profile",
        },
        {
          sourceId: "grokpedia",
          label: "Grokpedia manual lookup",
          query,
          url: null,
          status: "manual_lookup_required_discovery_only",
          promotionPolicy: "never_auto_promote_to_live_profile",
        },
      ],
    };
  });

  const outPath = path.join(
    process.cwd(),
    "output",
    "football-world-cup-player-community-hints",
    "latest.json",
  );
  const payload = {
    version: 1,
    generatedAt,
    policy:
      "Community-wiki material is discovery-only. It must not be promoted into live player profiles without stronger public sourcing.",
    targetCount: records.length,
    records,
  };

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
