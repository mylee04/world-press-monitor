import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildFootballWorldCupDossierProgram } from "@/lib/football-world-cup-dossier-program";
import { readFootballWorldCupHumanInterestPilotCanonical } from "@/lib/football-world-cup-human-interest-store";
import { readFootballWorldCupJournalistSnapshot } from "@/lib/football-world-cup-journalist-store";

async function main() {
  const [snapshot, humanInterestPayload] = await Promise.all([
    readFootballWorldCupJournalistSnapshot(),
    readFootballWorldCupHumanInterestPilotCanonical(),
  ]);

  if (!snapshot || !snapshot.teams.length) {
    throw new Error("World Cup journalist snapshot unavailable.");
  }

  const program = buildFootballWorldCupDossierProgram(
    snapshot,
    humanInterestPayload?.records || [],
  );
  const outputPath = path.join(
    process.cwd(),
    "output",
    "football-world-cup-dossier-program",
    "latest.json",
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(program, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        outputPath,
        targetCohortCount: program.summary.targetCohortCount,
        top20MissingLiveBiographyCount:
          program.summary.top20MissingLiveBiographyCount,
        averageCompletenessPct:
          program.summary.targetCohortAverageCompletenessPct,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
