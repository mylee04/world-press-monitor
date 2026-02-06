const LATAM_COUNTRIES = new Set(['LATAM', 'Argentina', 'Chile', 'Uruguay']);

const LATAM_ENTITY_TERMS = [
  'argentina',
  'argentine',
  'buenos aires',
  'chile',
  'chilean',
  'santiago',
  'uruguay',
  'uruguayan',
  'montevideo',
  'mercosur',
  'patagonia',
  'rio de la plata',
  'southern cone',
  'latam',
  'latin america',
  'latinoamerica',
  'america latina',
];

export function isLatamCountry(country?: string): boolean {
  if (!country) return false;
  return LATAM_COUNTRIES.has(country);
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function isLatamEntityTitle(title: string): boolean {
  const normalized = normalizeText(title || '');
  return LATAM_ENTITY_TERMS.some((term) => normalized.includes(term));
}
