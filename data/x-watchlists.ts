export type XWatchAccount = {
  handle: string;
  country: 'United States' | 'Argentina' | 'LATAM';
  priority?: boolean;
};

export const US_MAJOR_X_ACCOUNTS: XWatchAccount[] = [
  { handle: 'Reuters', country: 'United States', priority: true },
  { handle: 'AP', country: 'United States', priority: true },
  { handle: 'cnnbrk', country: 'United States', priority: true },
  { handle: 'CNN', country: 'United States', priority: true },
  { handle: 'FoxNews', country: 'United States', priority: true },
  { handle: 'NBCNews', country: 'United States', priority: true },
  { handle: 'CBSNews', country: 'United States', priority: true },
  { handle: 'ABC', country: 'United States', priority: true },
  { handle: 'NPR', country: 'United States', priority: true },
  { handle: 'USATODAY', country: 'United States' },
  { handle: 'nytimes', country: 'United States', priority: true },
  { handle: 'washingtonpost', country: 'United States', priority: true },
  { handle: 'WSJ', country: 'United States', priority: true },
  { handle: 'latimes', country: 'United States' },
  { handle: 'nypost', country: 'United States' },
  { handle: 'politico', country: 'United States' },
  { handle: 'axios', country: 'United States' },
  { handle: 'thehill', country: 'United States' },
  { handle: 'NBCNewsWorld', country: 'United States' },
  { handle: 'BloombergTV', country: 'United States', priority: true },
  { handle: 'business', country: 'United States' },
  { handle: 'Bloomberg', country: 'United States' },
  { handle: 'CNBC', country: 'United States', priority: true },
  { handle: 'MarketWatch', country: 'United States' },
  { handle: 'Forbes', country: 'United States' },
  { handle: 'FortuneMagazine', country: 'United States' },
  { handle: 'BusinessInsider', country: 'United States' },
  { handle: 'FastCompany', country: 'United States' },
  { handle: 'TechCrunch', country: 'United States' },
  { handle: 'verge', country: 'United States' },
  { handle: 'WIRED', country: 'United States' },
  { handle: 'arstechnica', country: 'United States' },
  { handle: 'engadget', country: 'United States' },
  { handle: 'VentureBeat', country: 'United States' },
  { handle: 'Gizmodo', country: 'United States' },
  { handle: 'CNET', country: 'United States' },
  { handle: 'ZDNET', country: 'United States' },
  { handle: 'ProPublica', country: 'United States' },
  { handle: 'Newsweek', country: 'United States' },
  { handle: 'TIME', country: 'United States' },
  { handle: 'TheAtlantic', country: 'United States' },
  { handle: 'newyorker', country: 'United States' },
  { handle: 'thedailybeast', country: 'United States' },
  { handle: 'people', country: 'United States' },
  { handle: 'RollingStone', country: 'United States' },
  { handle: 'billboard', country: 'United States' },
  { handle: 'variety', country: 'United States' },
  { handle: 'THR', country: 'United States' },
  { handle: 'espn', country: 'United States' },
  { handle: 'CBSSports', country: 'United States' }
];

export const ARGENTINA_MAJOR_X_ACCOUNTS: XWatchAccount[] = [
  { handle: 'infobae', country: 'Argentina', priority: true },
  { handle: 'LANACION', country: 'Argentina', priority: true },
  { handle: 'clarincom', country: 'Argentina', priority: true },
  { handle: 'pagina12', country: 'Argentina' },
  { handle: 'cronistacom', country: 'Argentina' },
  { handle: 'Ambitocom', country: 'Argentina' },
  { handle: 'perfilcom', country: 'Argentina' },
  { handle: 'laderechadiario', country: 'Argentina' },
  { handle: 'A24COM', country: 'Argentina' },
  { handle: 'C5N', country: 'Argentina' },
  { handle: 'todonoticias', country: 'Argentina', priority: true },
  { handle: 'telefenoticias', country: 'Argentina' },
  { handle: 'CronicaTV', country: 'Argentina' },
  { handle: 'LaPoliticaOnline', country: 'Argentina' },
  { handle: 'ElDestapeWeb', country: 'Argentina' }
];

export const DEFAULT_X_WATCH_ACCOUNTS: XWatchAccount[] = [
  ...US_MAJOR_X_ACCOUNTS,
  ...ARGENTINA_MAJOR_X_ACCOUNTS
];
