import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  HumanInterestPilotRecord,
  HumanInterestResearchHintRecord,
} from '@/lib/football-world-cup-human-interest';

export type FootballWorldCupHumanInterestPilotPayload = {
  version: number;
  updatedAt: string | null;
  instructions?: string[];
  records: HumanInterestPilotRecord[];
};

export type FootballWorldCupHumanInterestResearchHintsPayload = {
  version: number;
  updatedAt: string | null;
  instructions?: string[];
  records: HumanInterestResearchHintRecord[];
};

const CANONICAL_PILOT_RELATIVE_PATH = path.join(
  'data',
  'football-world-cup-human-interest-pilot.canonical.json'
);

const TOP50_RESEARCH_HINTS_RELATIVE_PATH = path.join(
  'data',
  'football-world-cup-human-interest-research-hints.top50.json'
);

async function readJsonPayload<T>(relativePath: string): Promise<T | null> {
  const filePath = path.join(process.cwd(), relativePath);
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function readFootballWorldCupHumanInterestPilotCanonical():
  Promise<FootballWorldCupHumanInterestPilotPayload | null> {
  const parsed = await readJsonPayload<FootballWorldCupHumanInterestPilotPayload>(
    CANONICAL_PILOT_RELATIVE_PATH
  );
  if (!parsed || !Array.isArray(parsed.records)) return null;
  return parsed;
}

export async function readFootballWorldCupHumanInterestResearchHintsTop50():
  Promise<FootballWorldCupHumanInterestResearchHintsPayload | null> {
  const parsed = await readJsonPayload<FootballWorldCupHumanInterestResearchHintsPayload>(
    TOP50_RESEARCH_HINTS_RELATIVE_PATH
  );
  if (!parsed || !Array.isArray(parsed.records)) return null;
  return parsed;
}

export function resolveFootballWorldCupHumanInterestPilotCanonicalPath(): string {
  return path.join(process.cwd(), CANONICAL_PILOT_RELATIVE_PATH);
}

export function resolveFootballWorldCupHumanInterestResearchHintsTop50Path(): string {
  return path.join(process.cwd(), TOP50_RESEARCH_HINTS_RELATIVE_PATH);
}
