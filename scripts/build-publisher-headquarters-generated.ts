import fs from 'node:fs/promises';
import path from 'node:path';

type PublisherHeadquartersRecord = {
  country: string;
  publisher: string;
  city: string;
  region: string;
  lat: number;
  lon: number;
  label: string;
};

type CandidateRecord = {
  country: string;
  publisher: string;
  city: string;
  region: string;
  lat: number;
  lon: number;
  label: string;
  confidence: 'high' | 'medium';
  matchedDomain: string | null;
};

type CandidateFile = {
  records?: CandidateRecord[];
};

function normalize(value: string): string {
  return (value || '').trim().toLowerCase();
}

function parseArgs(argv: string[]): { inputs: string[]; outPath: string } {
  const inputs: string[] = [];
  let outPath = path.join(process.cwd(), 'data', 'publisher-headquarters.generated.json');

  for (const arg of argv) {
    if (arg.startsWith('--out=')) {
      const value = arg.slice('--out='.length).trim();
      if (value) outPath = path.resolve(process.cwd(), value);
    } else {
      inputs.push(path.resolve(process.cwd(), arg));
    }
  }

  if (inputs.length === 0) {
    inputs.push(path.join(process.cwd(), 'output', 'publisher-headquarters-candidates.top50.json'));
  }

  return { inputs, outPath };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const merged = new Map<string, PublisherHeadquartersRecord>();

  for (const input of args.inputs) {
    const raw = await fs.readFile(input, 'utf8');
    const parsed = JSON.parse(raw) as CandidateFile;
    for (const row of parsed.records || []) {
      if (row.confidence !== 'high' || !row.matchedDomain) continue;
      const key = `${normalize(row.country)}::${normalize(row.publisher)}`;
      if (!row.city || !Number.isFinite(row.lat) || !Number.isFinite(row.lon)) continue;
      merged.set(key, {
        country: row.country,
        publisher: row.publisher,
        city: row.city,
        region: row.region || row.city,
        lat: row.lat,
        lon: row.lon,
        label: row.label,
      });
    }
  }

  const output = [...merged.values()].sort(
    (a, b) => a.country.localeCompare(b.country) || a.publisher.localeCompare(b.publisher)
  );
  await fs.mkdir(path.dirname(args.outPath), { recursive: true });
  await fs.writeFile(args.outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${output.length} generated publisher HQ records to ${args.outPath}`);
}

await main();
