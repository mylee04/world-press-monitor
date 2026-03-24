import type { NewsSection } from '@/lib/types';

export type TaxonomyLocale = 'en' | 'ko' | 'ja' | 'es' | 'pt' | 'it' | 'fr';
export type TaxonomyLocaleMode = 'auto' | TaxonomyLocale;

const SUPPORTED_TAXONOMY_LOCALES: readonly TaxonomyLocale[] = ['en', 'ko', 'ja', 'es', 'pt', 'it', 'fr'];

type LabelMap = Record<TaxonomyLocale, string>;

const SECTION_LABELS: Record<NewsSection, LabelMap> = {
  world: {
    en: 'World',
    ko: '세계',
    ja: '国際',
    es: 'Mundo',
    pt: 'Mundo',
    it: 'Mondo',
    fr: 'Monde',
  },
  politics: {
    en: 'Politics',
    ko: '정치',
    ja: '政治',
    es: 'Política',
    pt: 'Política',
    it: 'Politica',
    fr: 'Politique',
  },
  conflicts: {
    en: 'Conflicts',
    ko: '분쟁',
    ja: '紛争',
    es: 'Conflictos',
    pt: 'Conflitos',
    it: 'Conflitti',
    fr: 'Conflits',
  },
  business: {
    en: 'Business',
    ko: '비즈니스',
    ja: 'ビジネス',
    es: 'Negocios',
    pt: 'Negócios',
    it: 'Economia',
    fr: 'Économie',
  },
  tech: {
    en: 'Technology',
    ko: '기술',
    ja: 'テクノロジー',
    es: 'Tecnología',
    pt: 'Tecnologia',
    it: 'Tecnologia',
    fr: 'Technologie',
  },
  sports: {
    en: 'Sports',
    ko: '스포츠',
    ja: 'スポーツ',
    es: 'Deportes',
    pt: 'Esportes',
    it: 'Sport',
    fr: 'Sport',
  },
  health: {
    en: 'Health',
    ko: '건강',
    ja: '健康',
    es: 'Salud',
    pt: 'Saúde',
    it: 'Salute',
    fr: 'Santé',
  },
  entertainment: {
    en: 'Entertainment',
    ko: '엔터테인먼트',
    ja: 'エンタメ',
    es: 'Entretenimiento',
    pt: 'Entretenimento',
    it: 'Intrattenimento',
    fr: 'Divertissement',
  },
  lifestyle: {
    en: 'Lifestyle',
    ko: '라이프스타일',
    ja: 'ライフスタイル',
    es: 'Estilo de vida',
    pt: 'Estilo de vida',
    it: 'Lifestyle',
    fr: 'Style de vie',
  },
  arts: {
    en: 'Arts',
    ko: '예술',
    ja: 'アート',
    es: 'Artes',
    pt: 'Artes',
    it: 'Arti',
    fr: 'Arts',
  },
  science: {
    en: 'Science',
    ko: '과학',
    ja: '科学',
    es: 'Ciencia',
    pt: 'Ciência',
    it: 'Scienza',
    fr: 'Science',
  },
  climate: {
    en: 'Climate',
    ko: '기후',
    ja: '気候',
    es: 'Clima',
    pt: 'Clima',
    it: 'Clima',
    fr: 'Climat',
  },
  others: {
    en: 'General / Unclassified',
    ko: '일반 / 미분류',
    ja: '一般 / 未分類',
    es: 'General / Sin clasificar',
    pt: 'Geral / Não classificado',
    it: 'Generale / Non classificato',
    fr: 'Général / Non classé',
  },
};

const TOPIC_LABELS: Record<string, LabelMap> = {
  'diplomacy': { en: 'Diplomacy', ko: '외교', ja: '外交', es: 'Diplomacia', pt: 'Diplomacia', it: 'Diplomazia', fr: 'Diplomatie' },
  'migration': { en: 'Migration', ko: '이주', ja: '移民', es: 'Migración', pt: 'Migração', it: 'Migrazione', fr: 'Migration' },
  'disasters': { en: 'Disasters', ko: '재난', ja: '災害', es: 'Desastres', pt: 'Desastres', it: 'Disastri', fr: 'Catastrophes' },
  'aviation / transport': { en: 'Aviation / Transport', ko: '항공 / 운송', ja: '航空 / 交通', es: 'Aviación / Transporte', pt: 'Aviação / Transporte', it: 'Aviazione / Trasporti', fr: 'Aviation / Transport' },
  'crime / security': { en: 'Crime / Security', ko: '범죄 / 치안', ja: '犯罪 / 安全保障', es: 'Crimen / Seguridad', pt: 'Crime / Segurança', it: 'Crimine / Sicurezza', fr: 'Crime / Sécurité' },
  'elections': { en: 'Elections', ko: '선거', ja: '選挙', es: 'Elecciones', pt: 'Eleições', it: 'Elezioni', fr: 'Élections' },
  'government policy': { en: 'Government Policy', ko: '정부 정책', ja: '政府政策', es: 'Política gubernamental', pt: 'Política governamental', it: 'Politica governativa', fr: 'Politique gouvernementale' },
  'courts / justice': { en: 'Courts / Justice', ko: '법원 / 사법', ja: '司法 / 裁判', es: 'Justicia / Tribunales', pt: 'Justiça / Tribunais', it: 'Giustizia / Tribunali', fr: 'Justice / Tribunaux' },
  'protests': { en: 'Protests', ko: '시위', ja: '抗議', es: 'Protestas', pt: 'Protestos', it: 'Proteste', fr: 'Manifestations' },
  'airstrikes / missiles': { en: 'Airstrikes / Missiles', ko: '공습 / 미사일', ja: '空爆 / ミサイル', es: 'Ataques aéreos / Misiles', pt: 'Ataques aéreos / Mísseis', it: 'Attacchi aerei / Missili', fr: 'Frappes aériennes / Missiles' },
  'ground operations': { en: 'Ground Operations', ko: '지상 작전', ja: '地上作戦', es: 'Operaciones terrestres', pt: 'Operações terrestres', it: 'Operazioni terrestri', fr: 'Opérations terrestres' },
  'ceasefire / talks': { en: 'Ceasefire / Talks', ko: '휴전 / 협상', ja: '停戦 / 協議', es: 'Alto el fuego / Negociaciones', pt: 'Cessar-fogo / Negociações', it: 'Cessate il fuoco / Colloqui', fr: 'Cessez-le-feu / Négociations' },
  'hostages / prisoners': { en: 'Hostages / Prisoners', ko: '인질 / 수감자', ja: '人質 / 収容者', es: 'Rehenes / Prisioneros', pt: 'Reféns / Prisioneiros', it: 'Ostaggi / Prigionieri', fr: 'Otages / Prisonniers' },
  'defense / weapons': { en: 'Defense / Weapons', ko: '국방 / 무기', ja: '防衛 / 武器', es: 'Defensa / Armas', pt: 'Defesa / Armas', it: 'Difesa / Armi', fr: 'Défense / Armement' },
  'markets': { en: 'Markets', ko: '시장', ja: '市場', es: 'Mercados', pt: 'Mercados', it: 'Mercati', fr: 'Marchés' },
  'economy': { en: 'Economy', ko: '경제', ja: '経済', es: 'Economía', pt: 'Economia', it: 'Economia', fr: 'Économie' },
  'banking / fintech': { en: 'Banking / Fintech', ko: '금융 / 핀테크', ja: '銀行 / フィンテック', es: 'Banca / Fintech', pt: 'Bancos / Fintech', it: 'Banche / Fintech', fr: 'Banque / Fintech' },
  'companies': { en: 'Companies', ko: '기업', ja: '企業', es: 'Empresas', pt: 'Empresas', it: 'Aziende', fr: 'Entreprises' },
  'real estate': { en: 'Real Estate', ko: '부동산', ja: '不動産', es: 'Bienes raíces', pt: 'Imobiliário', it: 'Immobiliare', fr: 'Immobilier' },
  'energy': { en: 'Energy', ko: '에너지', ja: 'エネルギー', es: 'Energía', pt: 'Energia', it: 'Energia', fr: 'Énergie' },
  'retail / consumer': { en: 'Retail / Consumer', ko: '소매 / 소비자', ja: '小売 / 消費者', es: 'Minorista / Consumo', pt: 'Varejo / Consumo', it: 'Retail / Consumi', fr: 'Commerce / Consommation' },
  'autos / transport': { en: 'Autos / Transport', ko: '자동차 / 운송', ja: '自動車 / 輸送', es: 'Automoción / Transporte', pt: 'Automóveis / Transporte', it: 'Auto / Trasporti', fr: 'Auto / Transport' },
  'crypto': { en: 'Crypto', ko: '암호화폐', ja: '暗号資産', es: 'Cripto', pt: 'Cripto', it: 'Cripto', fr: 'Crypto' },
  'ai': { en: 'AI', ko: 'AI', ja: 'AI', es: 'IA', pt: 'IA', it: 'IA', fr: 'IA' },
  'gadgets': { en: 'Gadgets', ko: '기기', ja: 'ガジェット', es: 'Dispositivos', pt: 'Gadgets', it: 'Dispositivi', fr: 'Appareils' },
  'cybersecurity': { en: 'Cybersecurity', ko: '사이버보안', ja: 'サイバーセキュリティ', es: 'Ciberseguridad', pt: 'Cibersegurança', it: 'Cybersicurezza', fr: 'Cybersécurité' },
  'software / cloud': { en: 'Software / Cloud', ko: '소프트웨어 / 클라우드', ja: 'ソフトウェア / クラウド', es: 'Software / Nube', pt: 'Software / Nuvem', it: 'Software / Cloud', fr: 'Logiciels / Cloud' },
  'chips': { en: 'Chips', ko: '반도체', ja: '半導体', es: 'Chips', pt: 'Chips', it: 'Chip', fr: 'Semi-conducteurs' },
  'telecom': { en: 'Telecom', ko: '통신', ja: '通信', es: 'Telecomunicaciones', pt: 'Telecomunicações', it: 'Telecomunicazioni', fr: 'Télécoms' },
  'social media': { en: 'Social Media', ko: '소셜 미디어', ja: 'ソーシャルメディア', es: 'Redes sociales', pt: 'Redes sociais', it: 'Social media', fr: 'Réseaux sociaux' },
  'gaming': { en: 'Gaming', ko: '게임', ja: 'ゲーム', es: 'Gaming', pt: 'Games', it: 'Gaming', fr: 'Jeux vidéo' },
  'space': { en: 'Space', ko: '우주', ja: '宇宙', es: 'Espacio', pt: 'Espaço', it: 'Spazio', fr: 'Espace' },
  'american football': { en: 'American Football', ko: '미식축구', ja: 'アメリカンフットボール', es: 'Fútbol americano', pt: 'Futebol americano', it: 'Football americano', fr: 'Football américain' },
  'football': { en: 'Football', ko: '축구', ja: 'サッカー', es: 'Fútbol', pt: 'Futebol', it: 'Calcio', fr: 'Football' },
  'basketball': { en: 'Basketball', ko: '농구', ja: 'バスケットボール', es: 'Baloncesto', pt: 'Basquete', it: 'Basket', fr: 'Basket-ball' },
  'baseball': { en: 'Baseball', ko: '야구', ja: '野球', es: 'Béisbol', pt: 'Beisebol', it: 'Baseball', fr: 'Baseball' },
  'tennis': { en: 'Tennis', ko: '테니스', ja: 'テニス', es: 'Tenis', pt: 'Tênis', it: 'Tennis', fr: 'Tennis' },
  'golf': { en: 'Golf', ko: '골프', ja: 'ゴルフ', es: 'Golf', pt: 'Golfe', it: 'Golf', fr: 'Golf' },
  'motorsport': { en: 'Motorsport', ko: '모터스포츠', ja: 'モータースポーツ', es: 'Automovilismo', pt: 'Automobilismo', it: 'Motorsport', fr: 'Sport automobile' },
  'cricket': { en: 'Cricket', ko: '크리켓', ja: 'クリケット', es: 'Críquet', pt: 'Críquete', it: 'Cricket', fr: 'Cricket' },
  'hockey': { en: 'Hockey', ko: '하키', ja: 'ホッケー', es: 'Hockey', pt: 'Hóquei', it: 'Hockey', fr: 'Hockey' },
  'volleyball': { en: 'Volleyball', ko: '배구', ja: 'バレーボール', es: 'Voleibol', pt: 'Vôlei', it: 'Pallavolo', fr: 'Volley-ball' },
  'boxing / mma': { en: 'Boxing / MMA', ko: '복싱 / MMA', ja: 'ボクシング / MMA', es: 'Boxeo / MMA', pt: 'Boxe / MMA', it: 'Pugilato / MMA', fr: 'Boxe / MMA' },
  'olympics': { en: 'Olympics', ko: '올림픽', ja: 'オリンピック', es: 'Juegos Olímpicos', pt: 'Olimpíadas', it: 'Olimpiadi', fr: 'Jeux olympiques' },
  'winter sports': { en: 'Winter Sports', ko: '동계 스포츠', ja: '冬季スポーツ', es: 'Deportes de invierno', pt: 'Esportes de inverno', it: 'Sport invernali', fr: 'Sports d’hiver' },
  'snooker': { en: 'Snooker', ko: '스누커', ja: 'スヌーカー', es: 'Snooker', pt: 'Snooker', it: 'Snooker', fr: 'Snooker' },
  'esports': { en: 'Esports', ko: 'e스포츠', ja: 'eスポーツ', es: 'Esports', pt: 'Esports', it: 'Esports', fr: 'Esports' },
  'public health': { en: 'Public Health', ko: '공중보건', ja: '公衆衛生', es: 'Salud pública', pt: 'Saúde pública', it: 'Sanità pubblica', fr: 'Santé publique' },
  'healthcare': { en: 'Healthcare', ko: '의료', ja: '医療', es: 'Atención sanitaria', pt: 'Cuidados de saúde', it: 'Sanità', fr: 'Soins de santé' },
  'mental health': { en: 'Mental Health', ko: '정신건강', ja: 'メンタルヘルス', es: 'Salud mental', pt: 'Saúde mental', it: 'Salute mentale', fr: 'Santé mentale' },
  'pharma / biotech': { en: 'Pharma / Biotech', ko: '제약 / 바이오', ja: '製薬 / バイオ', es: 'Farmacéutica / Biotecnología', pt: 'Farmacêutico / Biotech', it: 'Farmaceutica / Biotech', fr: 'Pharma / Biotech' },
  'nutrition / fitness': { en: 'Nutrition / Fitness', ko: '영양 / 피트니스', ja: '栄養 / フィットネス', es: 'Nutrición / Fitness', pt: 'Nutrição / Fitness', it: 'Nutrizione / Fitness', fr: 'Nutrition / Fitness' },
  'film / tv': { en: 'Film / TV', ko: '영화 / TV', ja: '映画 / テレビ', es: 'Cine / TV', pt: 'Cinema / TV', it: 'Cinema / TV', fr: 'Cinéma / TV' },
  'music': { en: 'Music', ko: '음악', ja: '音楽', es: 'Música', pt: 'Música', it: 'Musica', fr: 'Musique' },
  'celebrities': { en: 'Celebrities', ko: '셀럽', ja: '著名人', es: 'Celebridades', pt: 'Celebridades', it: 'Celebrità', fr: 'Célébrités' },
  'awards': { en: 'Awards', ko: '시상식', ja: '受賞', es: 'Premios', pt: 'Prêmios', it: 'Premi', fr: 'Récompenses' },
  'fashion / beauty': { en: 'Fashion / Beauty', ko: '패션 / 뷰티', ja: 'ファッション / 美容', es: 'Moda / Belleza', pt: 'Moda / Beleza', it: 'Moda / Bellezza', fr: 'Mode / Beauté' },
  'travel': { en: 'Travel', ko: '여행', ja: '旅行', es: 'Viajes', pt: 'Viagem', it: 'Viaggi', fr: 'Voyage' },
  'food / drink': { en: 'Food / Drink', ko: '음식 / 음료', ja: '食 / 飲料', es: 'Comida / Bebida', pt: 'Comida / Bebida', it: 'Cibo / Bevande', fr: 'Cuisine / Boissons' },
  'home / design': { en: 'Home / Design', ko: '홈 / 디자인', ja: '住まい / デザイン', es: 'Hogar / Diseño', pt: 'Casa / Design', it: 'Casa / Design', fr: 'Maison / Design' },
  'relationships / family': { en: 'Relationships / Family', ko: '관계 / 가족', ja: '家族 / 関係', es: 'Relaciones / Familia', pt: 'Relacionamentos / Família', it: 'Relazioni / Famiglia', fr: 'Relations / Famille' },
  'visual art': { en: 'Visual Art', ko: '시각예술', ja: '視覚芸術', es: 'Artes visuales', pt: 'Artes visuais', it: 'Arti visive', fr: 'Arts visuels' },
  'books / literature': { en: 'Books / Literature', ko: '도서 / 문학', ja: '書籍 / 文学', es: 'Libros / Literatura', pt: 'Livros / Literatura', it: 'Libri / Letteratura', fr: 'Livres / Littérature' },
  'theater / dance': { en: 'Theater / Dance', ko: '연극 / 무용', ja: '舞台 / ダンス', es: 'Teatro / Danza', pt: 'Teatro / Dança', it: 'Teatro / Danza', fr: 'Théâtre / Danse' },
  'architecture / design': { en: 'Architecture / Design', ko: '건축 / 디자인', ja: '建築 / デザイン', es: 'Arquitectura / Diseño', pt: 'Arquitetura / Design', it: 'Architettura / Design', fr: 'Architecture / Design' },
  'space / astronomy': { en: 'Space / Astronomy', ko: '우주 / 천문', ja: '宇宙 / 天文', es: 'Espacio / Astronomía', pt: 'Espaço / Astronomia', it: 'Spazio / Astronomia', fr: 'Espace / Astronomie' },
  'biology / medicine': { en: 'Biology / Medicine', ko: '생물 / 의학', ja: '生物 / 医学', es: 'Biología / Medicina', pt: 'Biologia / Medicina', it: 'Biologia / Medicina', fr: 'Biologie / Médecine' },
  'archaeology / history': { en: 'Archaeology / History', ko: '고고학 / 역사', ja: '考古学 / 歴史', es: 'Arqueología / Historia', pt: 'Arqueologia / História', it: 'Archeologia / Storia', fr: 'Archéologie / Histoire' },
  'physics / energy': { en: 'Physics / Energy', ko: '물리 / 에너지', ja: '物理 / エネルギー', es: 'Física / Energía', pt: 'Física / Energia', it: 'Fisica / Energia', fr: 'Physique / Énergie' },
  'extreme weather': { en: 'Extreme Weather', ko: '극한기상', ja: '異常気象', es: 'Clima extremo', pt: 'Tempo extremo', it: 'Meteo estremo', fr: 'Météo extrême' },
  'energy transition': { en: 'Energy Transition', ko: '에너지 전환', ja: 'エネルギー転換', es: 'Transición energética', pt: 'Transição energética', it: 'Transizione energetica', fr: 'Transition énergétique' },
  'emissions / policy': { en: 'Emissions / Policy', ko: '배출 / 정책', ja: '排出 / 政策', es: 'Emisiones / Política', pt: 'Emissões / Política', it: 'Emissioni / Politica', fr: 'Émissions / Politique' },
  'conservation': { en: 'Conservation', ko: '보전', ja: '保全', es: 'Conservación', pt: 'Conservação', it: 'Conservazione', fr: 'Conservation' },
};

function titleizeFallback(value: string): string {
  return value
    .split('/')
    .map((part) =>
      part
        .trim()
        .split(/\s+/)
        .map((token) => (token ? token.charAt(0).toUpperCase() + token.slice(1) : token))
        .join(' ')
    )
    .join(' / ');
}

export function resolveTaxonomyLocale(input: string | null | undefined): TaxonomyLocale {
  const normalized = (input || '').trim().toLowerCase();
  if (!normalized) return 'en';
  const direct = normalized.slice(0, 2) as TaxonomyLocale;
  if ((SUPPORTED_TAXONOMY_LOCALES as readonly string[]).includes(direct)) return direct;
  return 'en';
}

export function getResolvedTaxonomyLocale(mode: TaxonomyLocaleMode, browserLocale: string | null | undefined): TaxonomyLocale {
  if (mode !== 'auto') return mode;
  return resolveTaxonomyLocale(browserLocale);
}

export function getTaxonomyLocaleLabel(mode: TaxonomyLocaleMode, browserLocale: string | null | undefined): string {
  if (mode === 'auto') {
    const resolved = getResolvedTaxonomyLocale(mode, browserLocale);
    return `Automatic (${getTaxonomyLocaleName(resolved)})`;
  }
  return getTaxonomyLocaleName(mode);
}

export function getTaxonomyLocaleName(locale: TaxonomyLocale): string {
  const names: Record<TaxonomyLocale, string> = {
    en: 'English',
    ko: '한국어',
    ja: '日本語',
    es: 'Español',
    pt: 'Português',
    it: 'Italiano',
    fr: 'Français',
  };
  return names[locale];
}

export function getSectionLabel(section: string | null | undefined, locale: TaxonomyLocale): string {
  const normalized = ((section || '').trim().toLowerCase() || 'others') as NewsSection;
  const labels = SECTION_LABELS[normalized] || SECTION_LABELS.others;
  return labels[locale] || labels.en;
}

export function getTopicLabel(topic: string | null | undefined, locale: TaxonomyLocale): string {
  const normalized = (topic || '').trim().toLowerCase();
  if (!normalized) return '-';
  const labels = TOPIC_LABELS[normalized];
  if (labels) return labels[locale] || labels.en;
  return titleizeFallback(topic || '');
}

export function getSectionListLabel(sections: string[] | null | undefined, locale: TaxonomyLocale): string {
  const normalized = [...new Set((sections || []).filter(Boolean))];
  if (!normalized.length) return getSectionLabel('others', locale);
  return normalized.map((section) => getSectionLabel(section, locale)).join(', ');
}

export function getTopicListLabel(topics: string[] | null | undefined, locale: TaxonomyLocale, emptyLabel = '-'): string {
  const normalized = [...new Set((topics || []).filter(Boolean))];
  if (!normalized.length) return emptyLabel;
  return normalized.map((topic) => getTopicLabel(topic, locale)).join(', ');
}
