import fs from "node:fs/promises";
import path from "node:path";
import { resolveFootballWorldCupJournalistSnapshotPath } from "@/lib/football-world-cup-journalist-store";

type Args = {
  apply: boolean;
  limit: number | null;
};

type ClaimValue = {
  mainsnak?: {
    datavalue?: {
      value?: unknown;
    };
  };
};

type WikidataEntity = {
  id: string;
  claims?: Record<string, ClaimValue[]>;
  sitelinks?: {
    enwiki?: {
      title?: string;
    };
  };
};

type JournalistPlayerCard = Record<string, any>;

const TEAM_WIKIDATA_DESCRIPTION_HINTS: Record<string, RegExp> = {
  "United States": /\b(american|united states|u\.s\.|usmnt)\b/i,
  Mexico: /\bmexican\b/i,
  Croatia: /\bcroatian\b/i,
  Turkey: /\bturkish\b/i,
  Switzerland: /\bswiss\b/i,
  Senegal: /\bsenegalese\b/i,
  Algeria: /\balgerian\b/i,
  Austria: /\baustrian\b/i,
  "Congo DR": /\b(congolese|dr congo|democratic republic of the congo)\b/i,
  Ghana: /\bghanaian\b/i,
  "Ivory Coast": /\b(ivorian|cote d'ivoire|côte d'ivoire)\b/i,
  Norway: /\bnorwegian\b/i,
  "Saudi Arabia": /\bsaudi\b/i,
  Scotland: /\bscottish\b/i,
  Tunisia: /\btunisian\b/i,
  Uzbekistan: /\buzbek\b/i,
};

const PLAYER_WIKIDATA_ENTITY_OVERRIDES: Record<string, string> = {
  "Algeria::Ryan Ait-Nouri": "Q50825738",
  "Algeria::Rayan Aït-Nouri": "Q50825738",
  "Ghana::Thomas Partey": "Q15963873",
  "Tunisia::Khali Ayari": "Q134711363",
  "Tunisia::Khalil Ayari": "Q134711363",
};

const BIG_FIVE_LEAGUE_CLUBS: Record<string, string[]> = {
  "Premier League": [
    "arsenal",
    "aston villa",
    "bournemouth",
    "brentford",
    "brighton & hove albion",
    "burnley",
    "chelsea",
    "crystal palace",
    "everton",
    "fulham",
    "leeds united",
    "liverpool",
    "manchester city",
    "manchester united",
    "newcastle united",
    "nottingham forest",
    "sunderland",
    "tottenham hotspur",
    "tottenham hotspur fc",
    "west ham united",
    "wolverhampton wanderers",
    "wolves",
  ],
  "La Liga": [
    "athletic bilbao",
    "athletic club",
    "atletico madrid",
    "atlético madrid",
    "barcelona",
    "betis",
    "real betis",
    "celta de vigo",
    "elche",
    "espanyol",
    "getafe",
    "girona",
    "levante",
    "mallorca",
    "osasuna",
    "rayo vallecano",
    "real madrid",
    "real oviedo",
    "real sociedad",
    "real sociedad san sebastian",
    "sevilla",
    "valencia",
    "villarreal",
  ],
  Bundesliga: [
    "bayern munich",
    "fc bayern munich",
    "borussia dortmund",
    "bayer leverkusen",
    "rb leipzig",
    "eintracht frankfurt",
    "vfb stuttgart",
    "sc freiburg",
    "mainz 05",
    "werder bremen",
    "borussia mönchengladbach",
    "borussia monchengladbach",
    "fc augsburg",
    "tsg hoffenheim",
    "vfl wolfsburg",
    "hamburger sv",
    "hamburg",
    "fc st. pauli",
    "st. pauli",
    "union berlin",
    "1. fc köln",
    "koln",
    "köln",
    "heidenheim",
  ],
  "Serie A": [
    "ac milan",
    "inter milan",
    "internazionale",
    "juventus",
    "roma",
    "as roma",
    "napoli",
    "atalanta",
    "bologna",
    "fiorentina",
    "genoa",
    "como",
    "sassuolo",
    "torino",
    "parma",
    "cagliari",
    "cremonese",
    "lazio",
    "lecce",
    "pisa",
    "udinese",
    "verona",
  ],
  "Ligue 1": [
    "paris saint-germain",
    "psg",
    "monaco",
    "marseille",
    "lyon",
    "olympique lyonnais",
    "lille",
    "nice",
    "strasbourg",
    "racing strasbourg",
    "toulouse",
    "le havre",
    "lens",
    "rennes",
    "nantes",
    "brest",
    "lorient",
    "metz",
    "angers",
    "auxerre",
    "paris fc",
  ],
};

const BIG_FIVE_CLUB_TO_LEAGUE = new Map(
  Object.entries(BIG_FIVE_LEAGUE_CLUBS).flatMap(([league, clubs]) =>
    clubs.map((club) => [normalizeClubKey(club), league] as const),
  ),
);

function normalizeText(value: string | null | undefined): string | null {
  const next = (value || "").trim();
  return next || null;
}

function normalizeClubKey(value: string | null | undefined): string {
  return (value || "")
    .toLocaleLowerCase("en-US")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bf\.c\.?\b/g, "fc")
    .replace(/[^a-z0-9&. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function currentClubForLeagueLookup(value: string | null | undefined): string | null {
  const currentClub = normalizeText(value);
  if (!currentClub) return null;
  return normalizeText(
    currentClub
      .replace(/\s*\(on loan from .+?\)\s*/i, "")
      .replace(/\s*on loan from .+$/i, "")
      .replace(/\s*,\s*(England|France|Spain|Italy|Germany)$/i, ""),
  );
}

function resolveBigFiveLeague(currentClub: string | null | undefined): string | null {
  const club = currentClubForLeagueLookup(currentClub);
  if (!club) return null;
  return BIG_FIVE_CLUB_TO_LEAGUE.get(normalizeClubKey(club)) || null;
}

function parseArgs(argv: string[]): Args {
  let apply = false;
  let limit: number | null = null;

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const next = Number.parseInt(arg.slice("--limit=".length), 10);
      if (Number.isFinite(next) && next > 0) limit = next;
    }
  }

  return { apply, limit };
}

function readClaim(entity: WikidataEntity, propertyId: string): string | null {
  const value = entity.claims?.[propertyId]?.[0]?.mainsnak?.datavalue?.value;
  return typeof value === "string" ? normalizeText(value) : null;
}

function wikipediaUrlFromTitle(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title).replace(/%20/g, "_")}`;
}

function wikipediaTitleFromUrl(url: string | null | undefined): string | null {
  const next = normalizeText(url);
  if (!next) return null;
  const match = next.match(/^https?:\/\/en\.wikipedia\.org\/wiki\/([^?#]+)/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1].replace(/_/g, " "));
  } catch {
    return match[1].replace(/_/g, " ");
  }
}

function normalizeWikidataEntityId(value: string | null | undefined): string | null {
  const next = normalizeText(value);
  return next && /^Q\d+$/.test(next) ? next : null;
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "world-press-radar-local-source-ladder/1.0",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeSearchKey(value: string | null | undefined): string {
  return (value || "")
    .toLocaleLowerCase("en-US")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchWikidataEntity(
  name: string,
  teamCanonicalName: string | null,
): Promise<string | null> {
  const url =
    "https://www.wikidata.org/w/api.php?action=wbsearchentities&language=en&format=json&limit=5&search=" +
    encodeURIComponent(name);
  const payload = await fetchJson(url);
  const search = Array.isArray(payload?.search) ? payload.search : [];
  const nameKey = normalizeSearchKey(name);
  let best: { id: string; score: number } | null = null;
  const teamHint = teamCanonicalName
    ? TEAM_WIKIDATA_DESCRIPTION_HINTS[teamCanonicalName] || null
    : null;

  for (const item of search) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : null;
    if (!id) continue;
    const description =
      typeof row.description === "string"
        ? row.description.toLocaleLowerCase("en-US")
        : "";
    if (!/football|soccer/.test(description)) continue;
    const label = typeof row.label === "string" ? row.label : "";
    let score = 10;
    if (normalizeSearchKey(label) === nameKey) score += 5;
    if (teamHint?.test(description)) score += 8;
    if (!best || score > best.score) best = { id, score };
  }
  return best?.id || null;
}

async function wikidataEntityIdFromWikipediaTitle(title: string): Promise<string | null> {
  const payload = await fetchJson(
    "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageprops&titles=" +
      encodeURIComponent(title),
  );
  const pages = (payload?.query as Record<string, unknown> | undefined)?.pages;
  if (!pages || typeof pages !== "object") return null;
  for (const page of Object.values(pages as Record<string, unknown>)) {
    if (!page || typeof page !== "object") continue;
    const pageprops = (page as Record<string, unknown>).pageprops;
    if (!pageprops || typeof pageprops !== "object") continue;
    const qid = (pageprops as Record<string, unknown>).wikibase_item;
    if (typeof qid === "string" && /^Q\d+$/.test(qid)) return qid;
  }
  return null;
}

async function fetchWikidataEntity(qid: string): Promise<WikidataEntity | null> {
  const entityPayload = await fetchJson(
    "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=" +
      encodeURIComponent(qid) +
      "&props=claims|sitelinks",
  );
  const apiEntities = entityPayload?.entities as
    | Record<string, WikidataEntity>
    | undefined;
  if (apiEntities?.[qid]) return apiEntities[qid];

  const payload = await fetchJson(
    `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`,
  );
  const entities = payload?.entities as Record<string, WikidataEntity> | undefined;
  return entities?.[qid] || null;
}

function buildLadderFromEntity(entity: WikidataEntity): Record<string, string> {
  const ladder: Record<string, string> = {
    wikidata: `https://www.wikidata.org/wiki/${entity.id}`,
  };
  const wikipediaTitle = normalizeText(entity.sitelinks?.enwiki?.title);
  if (wikipediaTitle) ladder.wikipedia = wikipediaUrlFromTitle(wikipediaTitle);

  const transfermarkt = readClaim(entity, "P2446");
  if (transfermarkt) {
    ladder.transfermarkt = `https://www.transfermarkt.com/-/profil/spieler/${transfermarkt}`;
  }
  const nationalFootballTeams = readClaim(entity, "P2574");
  if (nationalFootballTeams) {
    ladder.nationalFootballTeams = `https://www.national-football-teams.com/player/${nationalFootballTeams}.html`;
  }
  const soccerway = readClaim(entity, "P2369");
  if (soccerway) {
    ladder.soccerway = `https://www.soccerway.com/players/-/${soccerway}/`;
  }
  const fbref = readClaim(entity, "P5750");
  if (fbref) {
    ladder.fbref = `https://fbref.com/en/players/${fbref}/`;
  }
  const soccerbase = readClaim(entity, "P2193");
  if (soccerbase) {
    ladder.soccerbase = `https://www.soccerbase.com/players/player.sd?player_id=${soccerbase}`;
  }
  const footballDatabase = readClaim(entity, "P3537");
  if (footballDatabase) {
    ladder.footballDatabase = `https://www.footballdatabase.eu/en/player/details/${footballDatabase}`;
  }

  return ladder;
}

async function resolveCardWikidataEntityId(
  card: JournalistPlayerCard,
  teamCanonicalName: string,
  metadata: Record<string, any>,
  sourceLadder: Record<string, any>,
): Promise<string | null> {
  const personName = normalizeText(card.displayName) || normalizeText(card.canonicalName);
  const override = personName
    ? PLAYER_WIKIDATA_ENTITY_OVERRIDES[`${teamCanonicalName}::${personName}`]
    : null;
  if (override) return override;

  const existingQid =
    normalizeWikidataEntityId(metadata.wikidataEntityId) ||
    normalizeWikidataEntityId(String(metadata.wikidataEntityUrl || "").match(/Q\d+/)?.[0]);
  if (existingQid) return existingQid;

  const wikipediaTitle =
    wikipediaTitleFromUrl(sourceLadder.wikipedia) ||
    wikipediaTitleFromUrl(metadata.wikipediaUrl) ||
    wikipediaTitleFromUrl(card.profile?.biographySourceUrl);
  if (wikipediaTitle) {
    const qid = await wikidataEntityIdFromWikipediaTitle(wikipediaTitle);
    if (qid) return qid;
  }

  if (!personName) return null;
  return searchWikidataEntity(personName, teamCanonicalName);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const snapshotPath = resolveFootballWorldCupJournalistSnapshotPath();
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf8")) as {
    teams: Array<{
      team: { canonicalName: string };
      playerCards: Array<Record<string, any>>;
    }>;
  };
  const generatedAt = new Date().toISOString();
  let bigFiveCount = 0;
  let searchedCount = 0;
  let updatedCount = 0;
  let skippedForLimitCount = 0;
  const unresolved: Array<{ teamCanonicalName: string; canonicalName: string; currentClub: string | null }> = [];
  const entityCache = new Map<string, WikidataEntity | null>();

  for (const team of snapshot.teams) {
    for (const card of team.playerCards || []) {
      const status =
        card.statusPanel?.latestSelectionStatus?.claimValue?.status ||
        card.statusPanel?.currentStatus?.claimValue?.selectionStatus;
      if (status !== "selected") continue;
      const league = resolveBigFiveLeague(card.currentClub);
      if (!league) continue;
      bigFiveCount += 1;

      const metadata =
        typeof card.profile?.metadata === "object" && card.profile?.metadata
          ? card.profile.metadata
          : {};
      const existingLadder =
        typeof metadata.sourceLadder === "object" && metadata.sourceLadder
          ? metadata.sourceLadder
          : {};
      const existingUsefulSourceCount = [
        existingLadder.wikidata,
        existingLadder.wikipedia,
        existingLadder.transfermarkt,
        existingLadder.fbref,
        existingLadder.nationalFootballTeams,
        existingLadder.soccerway,
        existingLadder.footballDatabase,
      ].filter(Boolean).length;
      if (existingUsefulSourceCount >= 4) continue;

      if (args.limit && searchedCount >= args.limit) {
        skippedForLimitCount += 1;
        continue;
      }

      searchedCount += 1;
      const qid = await resolveCardWikidataEntityId(
        card,
        team.team.canonicalName,
        metadata,
        existingLadder,
      );
      if (!qid) {
        unresolved.push({
          teamCanonicalName: team.team.canonicalName,
          canonicalName: card.canonicalName,
          currentClub: normalizeText(card.currentClub),
        });
        continue;
      }
      const cachedEntity = entityCache.has(qid) ? entityCache.get(qid)! : await fetchWikidataEntity(qid);
      entityCache.set(qid, cachedEntity);
      const entity = cachedEntity;
      if (!entity) {
        unresolved.push({
          teamCanonicalName: team.team.canonicalName,
          canonicalName: card.canonicalName,
          currentClub: normalizeText(card.currentClub),
        });
        continue;
      }
      const sourceLadder = {
        ...existingLadder,
        ...buildLadderFromEntity(entity),
      };
      card.profile ||= {};
      card.profile.metadata = {
        ...metadata,
        wikidataEntityId: entity.id,
        wikidataEntityUrl: `https://www.wikidata.org/wiki/${entity.id}`,
        wikipediaUrl: sourceLadder.wikipedia || metadata.wikipediaUrl || null,
        sourceLadder,
        bigFiveSourceLadderBackfilledAt: generatedAt,
      };
      if (!card.profile.biographySourceUrl && sourceLadder.wikipedia) {
        card.profile.biographySourceLabel = "Wikipedia profile";
        card.profile.biographySourceUrl = sourceLadder.wikipedia;
      }
      updatedCount += 1;
    }
  }

  if (args.apply) {
    await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  }
  const report = {
    generatedAt,
    apply: args.apply,
    bigFiveCount,
    searchedCount,
    updatedCount,
    skippedForLimitCount,
    unresolved,
    snapshotPath,
  };
  const outPath = path.join(
    process.cwd(),
    "output",
    "football-world-cup-big-five-source-ladder",
    "latest.json",
  );
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
