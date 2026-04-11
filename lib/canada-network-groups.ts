export type CanadaSyndicationNetwork = 'village-media' | 'black-press';

export const VILLAGE_MEDIA_CANADA_HOSTS = new Set([
  'barrietoday.com',
  'baytoday.ca',
  'bradfordtoday.ca',
  'collingwoodtoday.ca',
  'elliotlaketoday.com',
  'guelphtoday.com',
  'midlandtoday.ca',
  'orilliamatters.com',
  'sootoday.com',
  'sudbury.com',
]);

export const BLACK_PRESS_CANADA_HOSTS = new Set([
  'abbynews.com',
  'agassizharrisonobserver.com',
  'aldergrovestar.com',
  'campbellrivermirror.com',
  'castlegarnews.com',
  'comoxvalleyrecord.com',
  'cranbrooktownsman.com',
  'kelownacapnews.com',
  'langleyadvancetimes.com',
  'mapleridgenews.com',
  'missioncityrecord.com',
  'nanaimobulletin.com',
  'northdeltareporter.com',
  'peacearchnews.com',
  'pentictonwesternnews.com',
  'quesnelobserver.com',
  'saobserver.net',
  'surreynowleader.com',
  'terracestandard.com',
  'theprogress.com',
  'thenorthernview.com',
  'vernonmorningstar.com',
  'vicnews.com',
  'wltribune.com',
]);

export function normalizeCanadaNetworkHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, '').replace(/\.+$/, '');
}

export function isVillageMediaHost(hostname: string): boolean {
  return VILLAGE_MEDIA_CANADA_HOSTS.has(normalizeCanadaNetworkHostname(hostname));
}

export function isBlackPressHost(hostname: string): boolean {
  return BLACK_PRESS_CANADA_HOSTS.has(normalizeCanadaNetworkHostname(hostname));
}

export function getCanadaSyndicationNetworkByHostname(hostname: string): CanadaSyndicationNetwork | null {
  if (isVillageMediaHost(hostname)) return 'village-media';
  if (isBlackPressHost(hostname)) return 'black-press';
  return null;
}

export function getCanadaSyndicationNetworkByUrl(url: string): CanadaSyndicationNetwork | null {
  try {
    return getCanadaSyndicationNetworkByHostname(new URL(url).hostname);
  } catch {
    return null;
  }
}
