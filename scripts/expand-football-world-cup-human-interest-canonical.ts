import fs from "node:fs/promises";
import path from "node:path";
import { buildFootballWorldCupDossierProgram } from "@/lib/football-world-cup-dossier-program";
import type {
  HumanInterestPilotRecord,
  HumanInterestPilotResearchNote,
} from "@/lib/football-world-cup-human-interest";
import {
  readFootballWorldCupHumanInterestPilotCanonical,
  resolveFootballWorldCupHumanInterestPilotCanonicalPath,
} from "@/lib/football-world-cup-human-interest-store";
import {
  readFootballWorldCupJournalistSnapshot,
  type JournalistClaim,
  type JournalistPersonCard,
  type JournalistTeamView,
} from "@/lib/football-world-cup-journalist-store";

type Args = {
  apply: boolean;
  outPath: string;
};

function parseArgs(argv: string[]): Args {
  let apply = false;
  let outPath = path.join(
    process.cwd(),
    "output",
    "football-world-cup-human-interest-canonical-expand",
    "latest.json",
  );

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg.startsWith("--out=")) {
      outPath = path.resolve(process.cwd(), arg.slice("--out=".length));
    }
  }

  return { apply, outPath };
}

function normalizeText(value: string | null | undefined): string | null {
  const next = (value || "").trim();
  return next || null;
}

function lookupKey(teamCanonicalName: string, personCanonicalName: string): string {
  return `${teamCanonicalName}::${personCanonicalName}`
    .toLocaleLowerCase("en-US")
    .trim();
}

function storyPriorityReason(rank: number): string {
  if (rank <= 20) {
    return "Top-20 newsroom discovery target. Keep an official selection peg live and upgrade any defensible family, hometown, youth, or coach-trust angle with public sourcing.";
  }
  if (rank <= 50) {
    return "Top-50 newsroom discovery target. Start from the current official roster peg, then add one defensible human-interest angle editors can actually write from.";
  }
  return "Top-500 discovery watchlist. Keep a public official hook on file and queue manual follow-up for biography, hometown, youth path, and community context.";
}

function priorityTierForRank(rank: number): HumanInterestPilotRecord["priorityTier"] {
  if (rank <= 20) return "top20";
  if (rank <= 50) return "top50";
  return "watchlist";
}

function buildSelectionHook(
  team: JournalistTeamView,
  card: JournalistPersonCard,
): HumanInterestPilotRecord["liveHooks"][number] | null {
  const claim = card.statusPanel.latestSelectionStatus;
  if (claim?.sourceUrl || claim?.sourceLabel) {
    return {
      hookType: "selection",
      headline: `Officially listed in ${team.team.canonicalName}'s current World Cup 2026 squad`,
      summary: claim.claimText || "Current official roster peg for daily coverage.",
      sourceTier: "official",
      sourceLabel: claim.sourceLabel,
      sourceUrl: claim.sourceUrl,
      observedAt: claim.effectiveAt || null,
    };
  }
  const sourceUrl = normalizeText(team.team.officialSource.sourceUrl);
  const sourceLabel = normalizeText(team.team.officialSource.sourceLabel);
  if (!sourceUrl && !sourceLabel) return null;
  return {
    hookType: "selection",
    headline: `Officially listed in ${team.team.canonicalName}'s current World Cup 2026 squad`,
    summary: "Use as the current official roster peg before building any richer narrative feature.",
    sourceTier: "official",
    sourceLabel,
    sourceUrl,
    observedAt:
      normalizeText(team.team.summary.latestSelectionSignalAt) ||
      normalizeText(team.team.summary.latestCurrentStatusAt),
  };
}

function buildStatusHook(
  claim: JournalistClaim | null,
  hookType:
    | "injury"
    | "suspension"
    | "captaincy",
): HumanInterestPilotRecord["liveHooks"][number] | null {
  if (!claim || (!claim.sourceUrl && !claim.sourceLabel)) return null;
  return {
    hookType,
    headline: claim.claimText,
    summary: normalizeText(claim.claimStatus),
    sourceTier: "official",
    sourceLabel: claim.sourceLabel,
    sourceUrl: claim.sourceUrl,
    observedAt: claim.effectiveAt || null,
  };
}

function dedupeLiveHooks(
  hooks: HumanInterestPilotRecord["liveHooks"],
): HumanInterestPilotRecord["liveHooks"] {
  const seen = new Set<string>();
  const next: HumanInterestPilotRecord["liveHooks"] = [];
  for (const hook of hooks) {
    const title = normalizeText(hook.headline);
    if (!title) continue;
    const key = `${hook.hookType}::${title.toLocaleLowerCase("en-US")}::${
      normalizeText(hook.sourceUrl)?.toLocaleLowerCase("en-US") || ""
    }`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({
      ...hook,
      headline: title,
      summary: normalizeText(hook.summary),
      sourceLabel: normalizeText(hook.sourceLabel),
      sourceUrl: normalizeText(hook.sourceUrl),
      observedAt: normalizeText(hook.observedAt),
    });
  }
  return next;
}

function dedupeResearchNotes(
  notes: HumanInterestPilotResearchNote[],
): HumanInterestPilotResearchNote[] {
  const seen = new Set<string>();
  const next: HumanInterestPilotResearchNote[] = [];
  for (const note of notes) {
    const text = normalizeText(note.text);
    if (!text) continue;
    const key = [
      note.noteType,
      normalizeText(note.sourceLabel)?.toLocaleLowerCase("en-US") || "",
      normalizeText(note.evidenceUrl)?.toLocaleLowerCase("en-US") || "",
      text.toLocaleLowerCase("en-US"),
    ].join("::");
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({
      ...note,
      text,
      sourceLabel: normalizeText(note.sourceLabel),
      evidenceUrl: normalizeText(note.evidenceUrl),
      notes: normalizeText(note.notes) ?? undefined,
    });
  }
  return next;
}

function buildManualFollowUpNotes(
  card: JournalistPersonCard,
): HumanInterestPilotResearchNote[] {
  const metadata =
    typeof card.profile?.metadata === "object" && card.profile?.metadata
      ? (card.profile.metadata as Record<string, unknown>)
      : {};
  const sourceLadder =
    typeof metadata.sourceLadder === "object" && metadata.sourceLadder
      ? (metadata.sourceLadder as Record<string, unknown>)
      : {};
  const notes: HumanInterestPilotResearchNote[] = [];
  const pushSourceNote = (
    sourceLabel: string,
    evidenceUrl: string | null | undefined,
    text: string,
  ) => {
    const url = normalizeText(evidenceUrl);
    if (!url) return;
    notes.push({
      noteType: "manual_follow_up",
      sourceSystem: "other",
      sourceLabel,
      text,
      evidenceUrl: url,
      notes: "Use this as a reporting queue source, not automatic final copy.",
    });
  };

  pushSourceNote(
    "Wikipedia",
    card.profile?.biographySourceUrl,
    "Use this as a discovery pass for early-life, family, and youth-path reporting, then verify with stronger public sources before promotion.",
  );
  pushSourceNote(
    "Club official biography",
    typeof sourceLadder.clubOfficialBiography === "string"
      ? sourceLadder.clubOfficialBiography
      : null,
    "Check the club profile for official bio details, youth path, and personal notes that can support a cleaner feature draft.",
  );
  pushSourceNote(
    "National Football Teams",
    typeof sourceLadder.nationalFootballTeams === "string"
      ? sourceLadder.nationalFootballTeams
      : null,
    "Use this to verify national-team ledger, current club, and chronology before writing a broader narrative.",
  );
  pushSourceNote(
    "Transfermarkt",
    typeof sourceLadder.transfermarkt === "string"
      ? sourceLadder.transfermarkt
      : null,
    "Use this for contract, injury, and transfer-context follow-up only after basic identity fields are stable.",
  );

  notes.push({
    noteType: "wiki_hint",
    sourceSystem: "grokpedia",
    sourceTier: "wiki_hint",
    sourceLabel: "Grokpedia",
    hintedClaimTypes: ["career_origin", "family_influence"],
    reviewPriority: "low",
    text: "Secondary encyclopedia discovery pass only; never final evidence without stronger verification.",
    evidenceUrl: null,
  });
  notes.push({
    noteType: "community_hint",
    sourceSystem: "namuwiki",
    sourceTier: "community_hint",
    sourceLabel: "Namuwiki",
    hintedClaimTypes: ["career_origin", "family_influence", "community_symbol"],
    reviewPriority: "medium",
    text: "Korean-language discovery queue only; use to find angles, not as final evidence.",
    evidenceUrl: null,
  });
  return notes;
}

function buildExpandedRecord(
  existing: HumanInterestPilotRecord | null,
  team: JournalistTeamView,
  card: JournalistPersonCard,
  rank: number,
): HumanInterestPilotRecord {
  const selectionHook = buildSelectionHook(team, card);
  const hooks = dedupeLiveHooks([
    ...(existing?.liveHooks || []),
    ...(selectionHook ? [selectionHook] : []),
    ...[
      buildStatusHook(card.statusPanel.latestInjuryStatus, "injury"),
      buildStatusHook(card.statusPanel.latestSuspensionStatus, "suspension"),
      buildStatusHook(card.statusPanel.latestCaptaincyStatus, "captaincy"),
    ].filter(Boolean) as HumanInterestPilotRecord["liveHooks"],
  ]);

  const notes = dedupeResearchNotes([
    ...(existing?.researchNotes || []),
    ...buildManualFollowUpNotes(card),
  ]);

  return {
    teamCanonicalName: team.team.canonicalName,
    personCanonicalName: card.canonicalName,
    personRoleType: card.personType,
    priorityTier: existing?.priorityTier || priorityTierForRank(rank),
    editorialPriorityReason:
      existing?.editorialPriorityReason || storyPriorityReason(rank),
    identityHints: {
      positionGroup:
        normalizeText(existing?.identityHints?.positionGroup) ||
        normalizeText(card.role.positionGroup),
      currentClub:
        normalizeText(existing?.identityHints?.currentClub) ||
        normalizeText(card.currentClub),
    },
    liveHooks: hooks,
    featureAngles: existing?.featureAngles || [],
    careerArc: existing?.careerArc || [],
    publicPersonalContext: existing?.publicPersonalContext || [],
    researchNotes: notes,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [snapshot, humanInterestPayload] = await Promise.all([
    readFootballWorldCupJournalistSnapshot(),
    readFootballWorldCupHumanInterestPilotCanonical(),
  ]);

  if (!snapshot) throw new Error("World Cup journalist snapshot unavailable.");

  const program = buildFootballWorldCupDossierProgram(
    snapshot,
    humanInterestPayload?.records || [],
  );

  const teamByName = new Map(snapshot.teams.map((team) => [team.team.canonicalName, team]));
  const existingRecords = new Map(
    (humanInterestPayload?.records || []).map((record) => [
      lookupKey(record.teamCanonicalName, record.personCanonicalName),
      record,
    ]),
  );

  const targetKeys = new Set(
    program.targetPlayers.map((player) =>
      lookupKey(player.teamCanonicalName, player.canonicalName),
    ),
  );

  const nextTargetRecords: HumanInterestPilotRecord[] = [];
  for (const player of program.targetPlayers) {
    const team = teamByName.get(player.teamCanonicalName);
    const card = team?.playerCards.find(
      (item) => item.sportsPersonId === player.sportsPersonId,
    );
    if (!team || !card) continue;
    const key = lookupKey(player.teamCanonicalName, player.canonicalName);
    nextTargetRecords.push(
      buildExpandedRecord(existingRecords.get(key) || null, team, card, player.seedRank),
    );
  }

  const untouchedRecords = (humanInterestPayload?.records || []).filter(
    (record) => !targetKeys.has(lookupKey(record.teamCanonicalName, record.personCanonicalName)),
  );

  const nextRecords = [...nextTargetRecords, ...untouchedRecords];
  const nextPayload = {
    version: 1,
    updatedAt: new Date().toISOString().slice(0, 10),
    instructions: [
      "This canonical pilot now carries baseline public official hooks for the full top-500 target cohort.",
      "Selection, injury, suspension, and captaincy live hooks are safe public pegs; use them as current reporting anchors.",
      "Manual follow-up notes point reporters toward official and structured public sources for deeper narrative work.",
      "Do not promote Wikipedia, Grokpedia, or Namuwiki hints into live newsroom copy without verification.",
      "Feature angles and public-personal context remain the promoted newsroom layer only when defensible public sourcing exists.",
    ],
    records: nextRecords,
  };

  if (args.apply) {
    await fs.writeFile(
      resolveFootballWorldCupHumanInterestPilotCanonicalPath(),
      `${JSON.stringify(nextPayload, null, 2)}\n`,
      "utf8",
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apply: args.apply,
    previousCount: humanInterestPayload?.records.length || 0,
    nextCount: nextRecords.length,
    targetCoverageCount: nextTargetRecords.length,
    addedCount: Math.max(
      0,
      nextRecords.length - (humanInterestPayload?.records.length || 0),
    ),
    targetWithLiveHooks: nextTargetRecords.filter((record) => record.liveHooks.length > 0)
      .length,
    targetWithResearchNotes: nextTargetRecords.filter(
      (record) => record.researchNotes.length > 0,
    ).length,
    outputPath: resolveFootballWorldCupHumanInterestPilotCanonicalPath(),
  };

  await fs.mkdir(path.dirname(args.outPath), { recursive: true });
  await fs.writeFile(args.outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
