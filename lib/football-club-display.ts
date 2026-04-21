type NullableString = string | null | undefined;

export const CURRENT_CLUB_DISPLAY_OVERRIDES: Record<string, string> = {
  '스토크 시티 FC': 'Stoke City FC',
  '보루시아 묀헨글라트바흐': 'Borussia Mönchengladbach',
  'FC 미트윌란': 'FC Midtjylland',
  '샤르자 FC': 'Sharjah FC',
  '스완지 시티 AFC': 'Swansea City AFC',
  'KAA 헨트': 'KAA Gent',
  '울버햄튼원더러스': 'Wolverhampton Wanderers',
  '울산HDFC': 'Ulsan HD FC',
  '전북현대모터스': 'Jeonbuk Hyundai Motors',
  '산프레체 히로시마': 'Sanfrecce Hiroshima',
  'FC 바이에른 뮌헨': 'FC Bayern Munich',
  '대전하나시티즌': 'Daejeon Hana Citizen',
  'FC 도쿄': 'FC Tokyo',
  '가시마 앤틀러스': 'Kashima Antlers',
  '카를스루어 SC': 'Karlsruher SC',
  'FSV 마인츠05': 'FSV Mainz 05',
  '파리 생제르맹 FC': 'Paris Saint-Germain FC',
  'FK 아우스트리아 빈': 'FK Austria Vienna',
  '베식타스 JK': 'Beşiktaş JK',
  '버밍엄 시티 FC': 'Birmingham City FC',
  '저장 FC': 'Zhejiang FC',
  'FK 츠르베나 즈베즈다': 'FK Crvena zvezda',
  '로스앤젤레스 FC': 'Los Angeles FC',
  '셀틱 FC': 'Celtic FC',
  'Real Madrid Club de Fútbol': 'Real Madrid',
  'Paris Saint-Germain FC': 'Paris Saint-Germain',
  'AS Monaco Football Club/France': 'AS Monaco',
};

const CURRENT_CLUB_TRAILING_COUNTRIES = new Set([
  'Austria',
  'Belgium',
  'Czech Republic',
  'England',
  'France',
  'Germany',
  'Italy',
  'Netherlands',
  'Scotland',
  'Serbia',
  'Spain',
  'Turkey',
]);

export function normalizeFootballClubDisplayName(value: NullableString): string | null {
  if (!value) return null;
  const compact = value.trim().replace(/\s+/g, ' ');
  if (!compact) return null;
  if (CURRENT_CLUB_DISPLAY_OVERRIDES[compact]) {
    return CURRENT_CLUB_DISPLAY_OVERRIDES[compact];
  }

  const slashParts = compact.split('/').map((part) => part.trim()).filter(Boolean);
  if (
    slashParts.length === 2
    && CURRENT_CLUB_TRAILING_COUNTRIES.has(slashParts[1])
  ) {
    return CURRENT_CLUB_DISPLAY_OVERRIDES[slashParts[0]] || slashParts[0];
  }

  return compact;
}

export function normalizeKnownFootballClubNamesInText(value: NullableString): string | null {
  if (!value) return value || null;
  let normalized = value;
  for (const [raw, english] of Object.entries(CURRENT_CLUB_DISPLAY_OVERRIDES)) {
    if (!normalized.includes(raw)) continue;
    normalized = normalized.split(raw).join(english);
  }
  return normalized;
}
