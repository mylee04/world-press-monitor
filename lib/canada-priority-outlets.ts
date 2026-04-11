import type { OutletFeed } from './types';

export const CANADA_PRIORITY_SOURCE_NAMES = [
  'APTN News',
  'Abbotsford News',
  'Agassiz-Harrison Observer',
  'Aldergrove Star',
  'BarrieToday',
  'Battlefords NOW',
  'BayToday',
  'Brandon Sun',
  'Cabin Radio',
  'Campbell River Mirror',
  'Castlegar News',
  'Chilliwack Progress',
  'CollingwoodToday',
  'Comox Valley Record',
  'Cranbrook Townsman',
  'Delta Optimist',
  'ElliotLakeToday',
  'GuelphToday',
  'Kelowna Capital News',
  'Langley Advance Times',
  'Lethbridge Herald',
  'Maple Ridge News',
  'Medicine Hat News',
  'MidlandToday',
  'Mission City Record',
  'Moose Jaw Today',
  'NTV Newfoundland',
  'NNSL Media',
  'Nanaimo News Bulletin',
  'North Delta Reporter',
  'North Shore News',
  'Nunatsiaq News',
  'OrilliaMatters',
  'Peace Arch News',
  'Penticton Western News',
  'Prince George Citizen',
  'Prince Rupert Northern View',
  'Quesnel Observer',
  'Richmond News',
  'SaltWire - Newfoundland and Labrador',
  'SaltWire - Nova Scotia',
  'SaltWire - Prince Edward Island',
  'Salmon Arm Observer',
  'SaskToday.ca',
  'SooToday',
  'Sudbury.com',
  'Surrey Now-Leader',
  'TBNewsWatch',
  'Terrace Standard',
  'Vernon Morning Star',
  'Victoria News',
  'VOCM',
  'Williams Lake Tribune',
  'Yukon News',
  'paNOW',
].sort((left, right) => left.localeCompare(right));

const CANADA_PRIORITY_SOURCE_SET = new Set(CANADA_PRIORITY_SOURCE_NAMES);

export function isCanadaPrioritySourceName(sourceName: string | undefined): boolean {
  return CANADA_PRIORITY_SOURCE_SET.has((sourceName || '').trim());
}

export function isCanadaPriorityOutlet(outlet: Pick<OutletFeed, 'country' | 'name'>): boolean {
  return outlet.country === 'Canada' && isCanadaPrioritySourceName(outlet.name);
}

export function formatCanadaPrioritySourcesCsv(): string {
  return CANADA_PRIORITY_SOURCE_NAMES.join(',');
}
