import { Pool } from 'pg';

type ArticleRow = {
  external_id: string;
  stable_id: string | null;
  source: string;
  title_original: string;
  url: string;
  publication_datetime: string;
};

type MatchRow = {
  legacy: ArticleRow;
  canonical: ArticleRow;
  overlap: number;
  containment: number;
  jaccard: number;
  diffHours: number;
};

function parseArgValue(flag: string): string | null {
  const inline = process.argv.find((token) => token.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1).trim() || null;
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1].trim() || null;
  return null;
}

function parseIntArg(flag: string, fallback: number, min = 1, max = 10_000): number {
  const raw = parseArgValue(flag);
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseFloatArg(flag: string, fallback: number, min = 0, max = 1): number {
  const raw = parseArgValue(flag);
  const parsed = Number.parseFloat(raw || '');
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toTokenSet(value: string): Set<string> {
  return new Set(normalizeText(value).split(' ').filter((token) => token.length >= 4));
}

function getHostname(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function getUrlDateKey(value: string): string {
  try {
    const pathname = new URL(value).pathname;
    const match = pathname.match(/\/(20\d{2})\/(0[1-9]|1[0-2])\/([0-2]\d|3[01])(?:\/|$)/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
  } catch {
    return '';
  }
}

function compareTitles(left: string, right: string): { overlap: number; containment: number; jaccard: number } {
  const leftTokens = toTokenSet(left);
  const rightTokens = toTokenSet(right);
  if (!leftTokens.size || !rightTokens.size) {
    return { overlap: 0, containment: 0, jaccard: 0 };
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const containment = overlap / Math.min(leftTokens.size, rightTokens.size);
  const jaccard = union > 0 ? overlap / union : 0;
  return { overlap, containment, jaccard };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const sourcePrefix = parseArgValue('--source-prefix');
  if (!sourcePrefix) {
    throw new Error('--source-prefix is required');
  }

  const hours = parseIntArg('--hours', 168, 1, 24 * 30);
  const maxHoursApart = parseIntArg('--max-hours-apart', 36, 1, 24 * 14);
  const minContainment = parseFloatArg('--min-containment', 0.6, 0.1, 1);
  const apply = hasFlag('--apply');
  const db = new Pool({ connectionString: databaseUrl });

  try {
    const result = await db.query<ArticleRow>(
      `
      select external_id, stable_id, source, title_original, url, publication_datetime
      from news_articles
      where publication_datetime >= now() - ($1::int * interval '1 hour')
        and source like $2
      order by publication_datetime desc
      `,
      [hours, `${sourcePrefix}%`]
    );

    const rows = result.rows;
    const canonicalRows = rows.filter((row) => row.stable_id);
    const canonicalByHost = canonicalRows.reduce((acc, row) => {
      const hostname = getHostname(row.url);
      if (!hostname) return acc;
      const bucket = acc.get(hostname) || [];
      bucket.push(row);
      acc.set(hostname, bucket);
      return acc;
    }, new Map<string, ArticleRow[]>());

    const matches: MatchRow[] = [];
    for (const legacy of rows) {
      if (legacy.stable_id) continue;
      const hostname = getHostname(legacy.url);
      if (!hostname) continue;
      const candidates = canonicalByHost.get(hostname) || [];
      if (!candidates.length) continue;

      const legacyMs = new Date(legacy.publication_datetime).getTime();
      let best: MatchRow | null = null;
      for (const canonical of candidates) {
        if (canonical.external_id === legacy.external_id) continue;
        const legacyDateKey = getUrlDateKey(legacy.url);
        const canonicalDateKey = getUrlDateKey(canonical.url);
        if (legacyDateKey && canonicalDateKey && legacyDateKey !== canonicalDateKey) continue;
        const canonicalMs = new Date(canonical.publication_datetime).getTime();
        const diffHours = Math.abs(legacyMs - canonicalMs) / (60 * 60 * 1000);
        if (!Number.isFinite(diffHours) || diffHours > maxHoursApart) continue;

        const compared = compareTitles(legacy.title_original, canonical.title_original);
        if (compared.overlap < 4 || compared.containment < minContainment || compared.jaccard < 0.5) continue;

        const candidate: MatchRow = {
          legacy,
          canonical,
          overlap: compared.overlap,
          containment: compared.containment,
          jaccard: compared.jaccard,
          diffHours,
        };
        if (
          !best
          || candidate.containment > best.containment
          || (candidate.containment === best.containment && candidate.jaccard > best.jaccard)
          || (
            candidate.containment === best.containment
            && candidate.jaccard === best.jaccard
            && candidate.diffHours < best.diffHours
          )
        ) {
          best = candidate;
        }
      }

      if (best) matches.push(best);
    }

    const uniqueMatches = [...matches.reduce((acc, match) => {
      if (!acc.has(match.legacy.external_id)) {
        acc.set(match.legacy.external_id, match);
      }
      return acc;
    }, new Map<string, MatchRow>()).values()];

    if (!apply) {
      console.log(JSON.stringify({
        apply: false,
        sourcePrefix,
        matches: uniqueMatches.length,
        sample: uniqueMatches.slice(0, 10).map((match) => ({
          legacySource: match.legacy.source,
          legacyTitle: match.legacy.title_original,
          legacyUrl: match.legacy.url,
          canonicalSource: match.canonical.source,
          canonicalTitle: match.canonical.title_original,
          canonicalUrl: match.canonical.url,
          overlap: match.overlap,
          containment: Number(match.containment.toFixed(3)),
          jaccard: Number(match.jaccard.toFixed(3)),
          diffHours: Number(match.diffHours.toFixed(2)),
        })),
      }, null, 2));
      return;
    }

    for (const match of uniqueMatches) {
      const mergedPublicationDatetime =
        new Date(match.legacy.publication_datetime).getTime() > new Date(match.canonical.publication_datetime).getTime()
          ? match.legacy.publication_datetime
          : match.canonical.publication_datetime;
      await db.query(
        `
        update news_articles
        set publication_datetime = $2::timestamptz,
            updated_at = now()
        where external_id = $1
        `,
        [match.canonical.external_id, mergedPublicationDatetime]
      );
    }

    const deleted = uniqueMatches.length
      ? await db.query(
        `delete from news_articles where external_id = any($1::text[])`,
        [uniqueMatches.map((match) => match.legacy.external_id)]
      )
      : { rowCount: 0 };

    console.log(JSON.stringify({
      apply: true,
      sourcePrefix,
      matches: uniqueMatches.length,
      deleted: deleted.rowCount || 0,
    }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error('[reconcile-article-url-drift] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
