const DATE_TIMEZONE_OFFSETS: Record<string, string> = {
  BST: '+0100',
  CET: '+0100',
  CEST: '+0200',
  EET: '+0200',
  EEST: '+0300',
  MSD: '+0400',
  MSK: '+0300',
  WEST: '+0100',
  WET: '+0000',
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getOffsetFormatter(timeZone: string): Intl.DateTimeFormat | null {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    formatterCache.set(timeZone, formatter);
    return formatter;
  } catch {
    return null;
  }
}

function parseOffsetLabelToMs(value: string): number | null {
  const label = value.trim();
  if (!label || label === 'GMT' || label === 'UTC') return 0;
  const match = label.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2] || '0', 10);
  const minutes = Number.parseInt(match[3] || '0', 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return sign * ((hours * 60) + minutes) * 60 * 1000;
}

function getTimeZoneOffsetMs(timestampMs: number, timeZone: string): number | null {
  const formatter = getOffsetFormatter(timeZone);
  if (!formatter) return null;
  const parts = formatter.formatToParts(new Date(timestampMs));
  const label = parts.find((part) => part.type === 'timeZoneName')?.value || '';
  return parseOffsetLabelToMs(label);
}

function parseNamedTimeZoneDateMs(base: string, timeZone: string): number | null {
  const baseUtcMs = Date.parse(`${base} UTC`);
  if (!Number.isFinite(baseUtcMs)) return null;

  let candidateMs = baseUtcMs;
  for (let index = 0; index < 4; index += 1) {
    const offsetMs = getTimeZoneOffsetMs(candidateMs, timeZone);
    if (offsetMs === null) return null;
    const nextMs = baseUtcMs - offsetMs;
    if (Math.abs(nextMs - candidateMs) < 1000) return nextMs;
    candidateMs = nextMs;
  }

  return candidateMs;
}

export function parseLooseDateMs(value: unknown): number | null {
  if (value == null) return null;

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const normalized = Math.abs(value) < 1e11 ? value * 1000 : value;
    return Number.isFinite(normalized) ? normalized : null;
  }

  if (typeof value === 'bigint') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const normalized = Math.abs(numeric) < 1e11 ? numeric * 1000 : numeric;
    return Number.isFinite(normalized) ? normalized : null;
  }

  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const dateOnlyMs = Date.parse(`${raw}T12:00:00Z`);
    return Number.isFinite(dateOnlyMs) ? dateOnlyMs : null;
  }

  const directMs = Date.parse(raw);
  if (Number.isFinite(directMs)) return directMs;

  const abbreviationMatch = raw.match(/^(.*\s)([A-Z]{2,5})$/);
  if (abbreviationMatch) {
    const normalizedOffset = DATE_TIMEZONE_OFFSETS[abbreviationMatch[2]];
    if (normalizedOffset) {
      const abbreviationMs = Date.parse(`${abbreviationMatch[1]}${normalizedOffset}`);
      if (Number.isFinite(abbreviationMs)) return abbreviationMs;
    }
  }

  const namedTimeZoneMatch = raw.match(/^(.*\S)\s([A-Za-z_]+\/[A-Za-z0-9_.+-]+)$/);
  if (namedTimeZoneMatch) {
    const namedTimeZoneMs = parseNamedTimeZoneDateMs(namedTimeZoneMatch[1], namedTimeZoneMatch[2]);
    if (namedTimeZoneMs !== null) return namedTimeZoneMs;
  }

  return null;
}

export function normalizeLooseDateToIso(value: unknown): string {
  const ms = parseLooseDateMs(value);
  return ms === null ? '' : new Date(ms).toISOString();
}
