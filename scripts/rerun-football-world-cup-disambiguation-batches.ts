import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { buildFootballWorldCupDossierProgram } from "@/lib/football-world-cup-dossier-program";
import { readFootballWorldCupHumanInterestPilotCanonical } from "@/lib/football-world-cup-human-interest-store";
import { readFootballWorldCupJournalistSnapshot } from "@/lib/football-world-cup-journalist-store";

type Args = {
  apply: boolean;
  scope: "target-completeness";
  chunkSize: number;
  rankFrom: number;
  rankTo: number | null;
  timeoutMs: number;
  outPath: string;
};

type BatchResult = {
  rankFrom: number;
  rankTo: number;
  ok: boolean;
  timedOut: boolean;
  durationMs: number;
  targetCount: number | null;
  appliedCount: number | null;
  error: string | null;
  warnings: string[];
};

function logBatchResult(result: BatchResult) {
  console.log(
    JSON.stringify(
      {
        rankFrom: result.rankFrom,
        rankTo: result.rankTo,
        ok: result.ok,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
        appliedCount: result.appliedCount,
        error: result.error,
      },
      null,
      2,
    ),
  );
}

function parseArgs(argv: string[]): Args {
  let apply = false;
  let chunkSize = 10;
  let rankFrom = 1;
  let rankTo: number | null = null;
  let timeoutMs = 90_000;
  let outPath = path.join(
    process.cwd(),
    "output",
    "football-world-cup-disambiguation-batches",
    "latest.json",
  );

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg.startsWith("--chunk-size=")) {
      const value = Number(arg.slice("--chunk-size=".length));
      if (Number.isFinite(value) && value > 0) chunkSize = Math.floor(value);
      continue;
    }
    if (arg.startsWith("--rank-from=")) {
      const value = Number(arg.slice("--rank-from=".length));
      if (Number.isFinite(value) && value > 0) rankFrom = Math.floor(value);
      continue;
    }
    if (arg.startsWith("--rank-to=")) {
      const value = Number(arg.slice("--rank-to=".length));
      if (Number.isFinite(value) && value > 0) rankTo = Math.floor(value);
      continue;
    }
    if (arg.startsWith("--timeout-ms=")) {
      const value = Number(arg.slice("--timeout-ms=".length));
      if (Number.isFinite(value) && value > 0) timeoutMs = Math.floor(value);
      continue;
    }
    if (arg.startsWith("--out=")) {
      outPath = path.resolve(process.cwd(), arg.slice("--out=".length));
    }
  }

  return {
    apply,
    scope: "target-completeness",
    chunkSize,
    rankFrom,
    rankTo,
    timeoutMs,
    outPath,
  };
}

async function resolveTargetRankTo(): Promise<number> {
  const [snapshot, humanInterest] = await Promise.all([
    readFootballWorldCupJournalistSnapshot(),
    readFootballWorldCupHumanInterestPilotCanonical(),
  ]);
  if (!snapshot) throw new Error("World Cup journalist snapshot unavailable.");
  const program = buildFootballWorldCupDossierProgram(
    snapshot,
    humanInterest?.records || [],
  );
  return program.summary.targetCohortCount;
}

function parseChildJson(output: string): Record<string, unknown> | null {
  const trimmed = output.trim();
  if (!trimmed) return null;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function runBatch(
  rankFrom: number,
  rankTo: number,
  apply: boolean,
  timeoutMs: number,
): Promise<BatchResult> {
  const args = [
    "scripts/backfill-football-world-cup-player-biographies.ts",
    "--scope=target-completeness",
    `--rank-from=${rankFrom}`,
    `--rank-to=${rankTo}`,
    "--identity-only",
    "--skip-fbref",
    "--skip-soccerway",
    "--skip-football-database",
    ...(apply ? ["--apply"] : []),
  ];

  const startAt = Date.now();
  const child = spawn("bun", args, {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let timedOut = false;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // no-op
      }
      setTimeout(() => {
        if (!child.killed) {
          try {
            child.kill("SIGKILL");
          } catch {
            // no-op
          }
        }
      }, 2_000).unref();
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });

  const durationMs = Date.now() - startAt;
  const parsed = parseChildJson(stdout);
  const warnings =
    parsed && Array.isArray(parsed.results)
      ? []
      : stderr
          .split("\n")
          .map((line: string) => line.trim())
          .filter(Boolean)
          .slice(0, 10);

  return {
    rankFrom,
    rankTo,
    ok: !timedOut && exitCode === 0,
    timedOut,
    durationMs,
    targetCount:
      parsed && typeof parsed.targetCount === "number"
        ? Number(parsed.targetCount)
        : null,
    appliedCount:
      parsed && typeof parsed.appliedCount === "number"
        ? Number(parsed.appliedCount)
        : null,
    error:
      timedOut
        ? `timeout after ${timeoutMs}ms`
        : exitCode === 0
          ? null
          : (stderr.trim() || `exit ${exitCode}`),
    warnings,
  };
}

async function collectBatchResults(
  rankFrom: number,
  rankTo: number,
  apply: boolean,
  timeoutMs: number,
  results: BatchResult[],
): Promise<void> {
  const result = await runBatch(rankFrom, rankTo, apply, timeoutMs);
  if (result.timedOut && rankFrom < rankTo) {
    const midpoint = Math.floor((rankFrom + rankTo) / 2);
    await collectBatchResults(rankFrom, midpoint, apply, timeoutMs, results);
    await collectBatchResults(midpoint + 1, rankTo, apply, timeoutMs, results);
    return;
  }
  results.push(result);
  logBatchResult(result);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const maxRank = args.rankTo || (await resolveTargetRankTo());
  const results: BatchResult[] = [];

  for (let rank = args.rankFrom; rank <= maxRank; rank += args.chunkSize) {
    const chunkEnd = Math.min(maxRank, rank + args.chunkSize - 1);
    await collectBatchResults(rank, chunkEnd, args.apply, args.timeoutMs, results);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apply: args.apply,
    scope: args.scope,
    chunkSize: args.chunkSize,
    rankFrom: args.rankFrom,
    rankTo: maxRank,
    batchCount: results.length,
    okCount: results.filter((item) => item.ok).length,
    timeoutCount: results.filter((item) => item.timedOut).length,
    appliedCount: results.reduce(
      (total, item) => total + (item.appliedCount || 0),
      0,
    ),
    results,
  };

  await fs.mkdir(path.dirname(args.outPath), { recursive: true });
  await fs.writeFile(args.outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
