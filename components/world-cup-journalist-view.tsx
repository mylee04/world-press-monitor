"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { WorldCupLanguageSelect } from "@/components/world-cup-language-select";
import { WorldCupTeamSelect } from "@/components/world-cup-team-select";
import styles from "@/components/world-cup-journalist-view.module.css";
import type { FootballOfficialNewsLaneSummary } from "@/lib/football-official-news-store";
import type {
  HumanInterestPilotRecord,
  HumanInterestPilotResearchNote,
} from "@/lib/football-world-cup-human-interest";
import {
  FOOTBALL_WORLD_CUP_FRESHNESS_THRESHOLDS,
  classifyFreshnessAgeDays,
  diffDaysFromNow,
  type FreshnessState,
} from "@/lib/football-world-cup-freshness";
import type {
  FootballWorldCupJournalistSnapshot,
  JournalistAppearance,
  JournalistClaim,
  JournalistClubHistoryItem,
  JournalistPersonCard,
  JournalistStoryline,
  JournalistTeamView,
} from "@/lib/football-world-cup-journalist-store";
import {
  getWorldCupJournalistI18n,
  type WorldCupJournalistI18n,
  type WorldCupJournalistLanguage,
} from "@/lib/world-cup-journalist-i18n";

type Props = {
  snapshot: FootballWorldCupJournalistSnapshot;
  selectedTeam: JournalistTeamView;
  officialNewsSummary?: FootballOfficialNewsLaneSummary | null;
  selectedPersonId?: string | null;
  language: WorldCupJournalistLanguage;
  selectedLeadType?: string | null;
  selectedLeadSource?: string | null;
  humanInterestRecords?: HumanInterestPilotRecord[];
};

type Tone = "default" | "muted" | "warm" | "danger";

type BadgeItem = {
  label: string;
  tone: Tone;
};

type ScoreBreakdownKey =
  | "injury"
  | "return"
  | "suspension"
  | "leadership"
  | "status"
  | "humanInterest"
  | "reported"
  | "rumor"
  | "controversy"
  | "official";

type ScoreBreakdownItem = {
  key: ScoreBreakdownKey;
  label: string;
  value: number;
  maxValue: number;
  tone: Tone;
  detail: string;
};

type PersonEntry = {
  id: string;
  displayName: string;
  roleLabel: string;
  portrait: JournalistPersonCard["portrait"];
  instagram: JournalistPersonCard["socialProfiles"]["instagram"];
  squadNumber: number | null;
  statusLine: string;
  hook: string | null;
  evidence: string | null;
  href: string | null;
  updatedAt: string | null;
  badges: BadgeItem[];
  scoreBreakdown: ScoreBreakdownItem[];
  signalScore: number;
  starPowerScore: number;
  rarity: CardRarity;
  lane: string;
  laneTone: Tone;
  category: "status" | "story" | "voice" | "none";
  isPlayer: boolean;
  researchNotes: HumanInterestPilotResearchNote[];
};

type DeskLead = {
  id: string;
  lane: string;
  tone: Tone;
  title: string;
  summary: string;
  note: string;
  href: string | null;
  detailHref: string | null;
  personId: string | null;
  tag: string | null;
  provenanceType: string | null;
  provenanceSource: string | null;
  updatedAt: string | null;
};

type CanonicalNamesInput =
  | string
  | Array<string | null | undefined>
  | null
  | undefined;

type LeadFilterState = {
  leadType: string | null;
  leadSource: string | null;
};

type LeadFilterOption = {
  value: string;
  label: string;
  count: number;
};

type FreshnessMetric = {
  label: string;
  state: FreshnessState;
  ageDays: number | null;
  lastSeenAt: string | null;
};

type StorylineTheme = "reported" | "rumor" | "controversy";

type CardRarity = "bronze" | "silver" | "gold" | "platinum" | "legend";

type CardSortMode =
  | "star_power"
  | "top_story_targets"
  | "risk_radar"
  | "official_voices";

type TeamVisualProfile = {
  crestLabel: string;
  crestShort: string;
  flagEmoji: string | null;
  logoUrls: string[];
  primary: string;
  secondary: string;
  glow: string;
};

type PositionVisual = {
  label: string;
  accent: string;
  glow: string;
};

type CardAtlasCopy = {
  kicker: string;
  title: string;
  note: string;
  featureStoryTargets: string;
  featureStoryTargetsNote: string;
  noFeatureStoryTargets: string;
  featureBadge: string;
  spotlight: string;
  fullSquad: string;
  heat: string;
  club: string;
  official: string;
  reported: string;
  risk: string;
  rumorsAndScandals: string;
  profileSnapshot: string;
  profileSource: string;
  noReported: string;
  noRisk: string;
};

type ResearchHintCopy = {
  kicker: string;
  title: string;
  note: string;
  discoveryOnly: string;
  claimTypes: string;
  openHint: string;
  noHints: string;
  verifyFirst: string;
  verifySoon: string;
};

type HumanInterestAngleCopy = {
  kicker: string;
  title: string;
  note: string;
  noAngles: string;
  featureAngle: string;
  publicContext: string;
  verification: string;
  review: string;
  sensitivity: string;
  openSource: string;
};

type BackgroundCopy = {
  kicker: string;
  title: string;
  note: string;
  noFacts: string;
  birthPlace: string;
  hometown: string;
  residenceCountry: string;
  education: string;
  youthClubs: string;
  clubHistory: string;
  height: string;
  weight: string;
  footedness: string;
  handedness: string;
  source: string;
  present: string;
};

type HumanInterestAngleItem =
  | ({
      angleSource: "feature";
    } & HumanInterestPilotRecord["featureAngles"][number])
  | ({
      angleSource: "context";
    } & HumanInterestPilotRecord["publicPersonalContext"][number]);

const ENGLISH_CARD_ATLAS_COPY: CardAtlasCopy = {
  kicker: "Card atlas",
  title: "Player and coach cards by news value",
  note: "This is the FIFA-style layer: scan the squad as cards first, then open the dossier for official voice, reported hooks, and risk signals.",
  featureStoryTargets: "Feature story targets",
  featureStoryTargetsNote: "Players with source-backed human-interest angles are grouped here first so reporters can scan immediate feature candidates.",
  noFeatureStoryTargets: "No source-backed feature-story targets are attached to this squad yet.",
  featureBadge: "Feature",
  spotlight: "Spotlight cards",
  fullSquad: "Full squad cards",
  heat: "Signal mix",
  club: "Club",
  official: "Official",
  reported: "Reported",
  risk: "Risk",
  rumorsAndScandals: "Rumors and controversy",
  profileSnapshot: "Profile snapshot",
  profileSource: "Profile source",
  noReported: "No reported storyline is attached to this person yet.",
  noRisk: "No rumor or controversy signal is attached to this person yet.",
};

const LOCALIZED_CARD_ATLAS_COPY: Record<
  WorldCupJournalistLanguage,
  CardAtlasCopy
> = {
  en: ENGLISH_CARD_ATLAS_COPY,
  ko: {
    kicker: "카드 아틀라스",
    title: "기사가치 기준 선수·감독 카드",
    note: "이제는 표보다 카드가 먼저다. 먼저 스쿼드를 카드로 훑고, 그다음 상세 패널에서 공식 발언, 보도 훅, 리스크 신호를 본다.",
    featureStoryTargets: "피처 타깃 선수",
    featureStoryTargetsNote: "소스가 확인된 휴먼 스토리 앵글이 있는 선수만 먼저 모아 보여줍니다. 기자가 장문 피처 후보를 빠르게 훑는 용도입니다.",
    noFeatureStoryTargets: "이 스쿼드에 연결된 소스 확인 피처 타깃 선수가 아직 없습니다.",
    featureBadge: "피처",
    spotlight: "스포트라이트 카드",
    fullSquad: "전체 스쿼드 카드",
    heat: "신호 조합",
    club: "소속팀",
    official: "공식",
    reported: "보도",
    risk: "리스크",
    rumorsAndScandals: "루머 · 논란",
    profileSnapshot: "프로필 스냅샷",
    profileSource: "프로필 소스",
    noReported: "이 인물에 연결된 보도형 스토리라인이 아직 없습니다.",
    noRisk: "이 인물에 연결된 루머나 논란 신호가 아직 없습니다.",
  },
  ja: ENGLISH_CARD_ATLAS_COPY,
  es: ENGLISH_CARD_ATLAS_COPY,
  vi: ENGLISH_CARD_ATLAS_COPY,
  it: ENGLISH_CARD_ATLAS_COPY,
  fr: ENGLISH_CARD_ATLAS_COPY,
};

const ENGLISH_RESEARCH_HINT_COPY: ResearchHintCopy = {
  kicker: "Research hints",
  title: "Discovery leads to verify next",
  note: "These are discovery-only cues from wiki and community surfaces. Use them to queue reporting, not as final evidence.",
  discoveryOnly: "Discovery only",
  claimTypes: "Possible angles",
  openHint: "Open hint",
  noHints: "No research hints are queued for this person yet.",
  verifyFirst: "Verify first",
  verifySoon: "Verify soon",
};

const LOCALIZED_RESEARCH_HINT_COPY: Record<
  WorldCupJournalistLanguage,
  ResearchHintCopy
> = {
  en: ENGLISH_RESEARCH_HINT_COPY,
  ko: {
    kicker: "취재 힌트",
    title: "다음 검증 후보",
    note: "위키·커뮤니티 계열에서 잡은 discovery 전용 단서입니다. 바로 기사 근거로 쓰지 말고, 후속 검증 큐로만 써야 합니다.",
    discoveryOnly: "발굴용",
    claimTypes: "가능한 앵글",
    openHint: "힌트 열기",
    noHints: "이 인물에 대해 아직 큐에 올라간 취재 힌트가 없습니다.",
    verifyFirst: "우선 검증",
    verifySoon: "후속 검증",
  },
  ja: ENGLISH_RESEARCH_HINT_COPY,
  es: ENGLISH_RESEARCH_HINT_COPY,
  vi: ENGLISH_RESEARCH_HINT_COPY,
  it: ENGLISH_RESEARCH_HINT_COPY,
  fr: ENGLISH_RESEARCH_HINT_COPY,
};

const ENGLISH_HUMAN_INTEREST_ANGLE_COPY: HumanInterestAngleCopy = {
  kicker: "Human-interest angles",
  title: "Source-backed feature angles",
  note: "These are the angles already upgraded beyond discovery notes. Use them as feature leads, background frames, or profile color with source discipline.",
  noAngles: "No source-backed human-interest angles are attached to this person yet.",
  featureAngle: "Feature angle",
  publicContext: "Public context",
  verification: "Verification",
  review: "Review",
  sensitivity: "Sensitivity",
  openSource: "Open source",
};

const LOCALIZED_HUMAN_INTEREST_ANGLE_COPY: Record<
  WorldCupJournalistLanguage,
  HumanInterestAngleCopy
> = {
  en: ENGLISH_HUMAN_INTEREST_ANGLE_COPY,
  ko: {
    kicker: "휴먼 스토리",
    title: "소스 확인된 피처 앵글",
    note: "이 항목들은 discovery note를 넘어서 공개 소스로 한 번 더 올라온 피처용 앵글입니다. 장문 피처, 프로필, 배경 설명에 바로 쓸 수 있습니다.",
    noAngles: "이 인물에 연결된 소스 확인 휴먼 스토리 앵글이 아직 없습니다.",
    featureAngle: "피처 앵글",
    publicContext: "공개 맥락",
    verification: "검증 상태",
    review: "에디토리얼 검토",
    sensitivity: "민감도",
    openSource: "소스 열기",
  },
  ja: ENGLISH_HUMAN_INTEREST_ANGLE_COPY,
  es: ENGLISH_HUMAN_INTEREST_ANGLE_COPY,
  vi: ENGLISH_HUMAN_INTEREST_ANGLE_COPY,
  it: ENGLISH_HUMAN_INTEREST_ANGLE_COPY,
  fr: ENGLISH_HUMAN_INTEREST_ANGLE_COPY,
};

const ENGLISH_BACKGROUND_COPY: BackgroundCopy = {
  kicker: "Background",
  title: "Structured biography facts",
  note: "This block is where hometown, education, youth path, and club history should live. It stays sparse until a defensible public source is attached.",
  noFacts: "No structured biography facts are attached to this person yet.",
  birthPlace: "Birthplace",
  hometown: "Hometown",
  residenceCountry: "Residence",
  education: "Education",
  youthClubs: "Youth clubs",
  clubHistory: "Club history",
  height: "Height",
  weight: "Weight",
  footedness: "Preferred foot",
  handedness: "Handedness",
  source: "Fact source",
  present: "Present",
};

const LOCALIZED_BACKGROUND_COPY: Record<
  WorldCupJournalistLanguage,
  BackgroundCopy
> = {
  en: ENGLISH_BACKGROUND_COPY,
  ko: {
    kicker: "배경 정보",
    title: "구조화된 인물 팩트",
    note: "여기는 고향, 학력, 유소년 경로, 이전 팀 경력을 넣는 자리입니다. 공개적으로 방어 가능한 소스가 붙기 전까지는 억지로 채우지 않습니다.",
    noFacts: "이 인물에 연결된 구조화 biography fact가 아직 없습니다.",
    birthPlace: "출생지",
    hometown: "고향",
    residenceCountry: "거주 국가",
    education: "학력",
    youthClubs: "유소년 팀",
    clubHistory: "클럽 경력",
    height: "신장",
    weight: "체중",
    footedness: "주발",
    handedness: "손잡이",
    source: "팩트 소스",
    present: "현재",
  },
  ja: ENGLISH_BACKGROUND_COPY,
  es: ENGLISH_BACKGROUND_COPY,
  vi: ENGLISH_BACKGROUND_COPY,
  it: ENGLISH_BACKGROUND_COPY,
  fr: ENGLISH_BACKGROUND_COPY,
};

const SCORE_BREAKDOWN_LIMITS: Record<ScoreBreakdownKey, number> = {
  injury: 34,
  return: 12,
  suspension: 20,
  leadership: 10,
  status: 6,
  humanInterest: 18,
  reported: 22,
  rumor: 18,
  controversy: 24,
  official: 18,
};

const TEAM_LOGO_HOME_OVERRIDES: Record<string, string> = {
  "United States": "https://www.ussoccer.com/",
  Canada: "https://canadasoccer.com/",
  Mexico: "https://miseleccion.mx/",
  Argentina: "https://www.afa.com.ar/",
  Brazil: "https://www.cbf.com.br/",
  France: "https://www.fff.fr/",
  Spain: "https://rfef.es/",
  England: "https://www.englandfootball.com/",
  Germany: "https://www.dfb.de/",
  Portugal: "https://www.fpf.pt/",
  Netherlands: "https://www.onsoranje.nl/",
  Belgium: "https://www.rbfa.be/",
  Croatia: "https://hns.family/",
  Uruguay: "https://www.auf.org.uy/",
  Japan: "https://www.jfa.jp/",
  "South Korea": "https://www.kfa.or.kr/",
  Iran: "https://www.the-ffiri.com/",
  Morocco: "https://www.frmf.ma/",
  Colombia: "https://fcf.com.co/",
  Ecuador: "https://www.fef.ec/",
  Turkey: "https://www.tff.org/",
  Switzerland: "https://www.football.ch/",
  Senegal: "https://fsfoot.sn/",
  Australia: "https://www.footballaustralia.com.au/",
  Algeria: "https://www.faf.dz/",
  Austria: "https://www.oefb.at/",
  "Bosnia-Herzegovina": "https://www.nfsbih.ba/",
  "Cape Verde Islands": "https://fcf.cv/",
  "Congo DR": "https://fecofa.cd/",
  Curaçao: "https://ffk.cw/",
  Czechia: "https://www.fotbal.cz/",
  Egypt: "https://efa.com.eg/",
  Ghana: "https://www.ghanafa.org/",
  Haiti: "https://fhfhaiti.ht/",
  Iraq: "https://ifa.iq/",
  "Ivory Coast": "https://www.fifciv.com/",
  Jordan: "https://www.jfa.com.jo/",
  "New Zealand": "https://www.nzfootball.co.nz/",
  Norway: "https://www.fotball.no/",
  Panama: "https://www.fepafut.com/",
  Paraguay: "https://www.apf.org.py/",
  Qatar: "https://www.qfa.qa/",
  "Saudi Arabia": "https://www.saff.com.sa/",
  Scotland: "https://www.scottishfa.co.uk/",
  "South Africa": "https://www.safa.net/",
  Sweden: "https://www.svenskfotboll.se/",
  Tunisia: "https://www.ftf.org.tn/",
  Uzbekistan: "https://ufa.uz/",
};

const TEAM_LOGO_CANDIDATE_PATHS = [
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png",
  "/android-chrome-512x512.png",
  "/android-chrome-192x192.png",
  "/favicon-512x512.png",
  "/favicon-192x192.png",
  "/favicon-96x96.png",
  "/favicon-32x32.png",
  "/favicon-16x16.png",
  "/favicon.png",
  "/favicon.ico",
];

const TEAM_LOGO_LOCAL_ASSET_EXTENSIONS: Record<string, readonly string[]> = {
  algeria: ["png", "ico"],
  argentina: ["png"],
  australia: ["png"],
  austria: ["png"],
  belgium: ["png"],
  "bosnia-herzegovina": ["ico"],
  brazil: ["png"],
  canada: ["png"],
  "cape-verde-islands": ["png"],
  colombia: ["png"],
  "congo-dr": ["png", "ico"],
  croatia: ["png"],
  curacao: ["png"],
  czechia: ["ico"],
  ecuador: ["png"],
  egypt: ["ico"],
  england: ["png"],
  france: ["ico"],
  germany: ["png"],
  ghana: ["ico"],
  haiti: ["png"],
  iran: ["png"],
  iraq: ["ico"],
  "ivory-coast": ["png"],
  japan: ["png"],
  jordan: ["png"],
  mexico: ["ico"],
  morocco: ["png"],
  netherlands: ["png"],
  "new-zealand": ["png"],
  norway: ["png"],
  panama: ["png"],
  paraguay: ["png"],
  portugal: ["ico", "png"],
  qatar: ["ico", "png"],
  "saudi-arabia": ["png"],
  scotland: ["png"],
  senegal: ["png"],
  "south-africa": ["png"],
  "south-korea": ["ico"],
  spain: ["png"],
  sweden: ["png"],
  switzerland: ["png"],
  tunisia: ["png"],
  turkey: ["png"],
  "united-states": ["png"],
  uruguay: ["ico"],
  uzbekistan: ["ico", "png"],
};

const TEAM_LOGO_LOCAL_ASSET_ALIASES: Record<string, string> = {
  "DR Congo": "congo-dr",
  "Korea Republic": "south-korea",
};

const CARD_SORT_MODES: CardSortMode[] = [
  "star_power",
  "top_story_targets",
  "risk_radar",
  "official_voices",
];

const TEAM_FLAG_EMOJIS: Record<string, string> = {
  Algeria: "🇩🇿",
  Argentina: "🇦🇷",
  Australia: "🇦🇺",
  Austria: "🇦🇹",
  Belgium: "🇧🇪",
  "Bosnia-Herzegovina": "🇧🇦",
  Brazil: "🇧🇷",
  Canada: "🇨🇦",
  "Cape Verde": "🇨🇻",
  "Cape Verde Islands": "🇨🇻",
  Colombia: "🇨🇴",
  Croatia: "🇭🇷",
  Curaçao: "🇨🇼",
  Czechia: "🇨🇿",
  Ecuador: "🇪🇨",
  Egypt: "🇪🇬",
  England: "🏴",
  France: "🇫🇷",
  Germany: "🇩🇪",
  Ghana: "🇬🇭",
  Haiti: "🇭🇹",
  Iran: "🇮🇷",
  Iraq: "🇮🇶",
  Japan: "🇯🇵",
  Jordan: "🇯🇴",
  Mexico: "🇲🇽",
  Morocco: "🇲🇦",
  Netherlands: "🇳🇱",
  "New Zealand": "🇳🇿",
  Panama: "🇵🇦",
  Portugal: "🇵🇹",
  Qatar: "🇶🇦",
  "Saudi Arabia": "🇸🇦",
  Scotland: "🏴",
  Senegal: "🇸🇳",
  "South Africa": "🇿🇦",
  Spain: "🇪🇸",
  Switzerland: "🇨🇭",
  Tunisia: "🇹🇳",
  Uruguay: "🇺🇾",
  "United States": "🇺🇸",
  Uzbekistan: "🇺🇿",
  "DR Congo": "🇨🇩",
  "Congo DR": "🇨🇩",
  "Korea Republic": "🇰🇷",
  "South Korea": "🇰🇷",
};

const TEAM_COLOR_OVERRIDES: Record<
  string,
  Omit<TeamVisualProfile, "crestLabel" | "crestShort" | "logoUrls">
> = {
  Argentina: {
    flagEmoji: "🇦🇷",
    primary: "#89d3ff",
    secondary: "#1d5ea8",
    glow: "rgba(137, 211, 255, 0.34)",
  },
  Brazil: {
    flagEmoji: "🇧🇷",
    primary: "#f6d94e",
    secondary: "#177a46",
    glow: "rgba(246, 217, 78, 0.32)",
  },
  France: {
    flagEmoji: "🇫🇷",
    primary: "#3b6df0",
    secondary: "#d84b5b",
    glow: "rgba(59, 109, 240, 0.3)",
  },
  Germany: {
    flagEmoji: "🇩🇪",
    primary: "#f4c84a",
    secondary: "#161718",
    glow: "rgba(244, 200, 74, 0.3)",
  },
  Japan: {
    flagEmoji: "🇯🇵",
    primary: "#d84557",
    secondary: "#294a78",
    glow: "rgba(216, 69, 87, 0.3)",
  },
  Mexico: {
    flagEmoji: "🇲🇽",
    primary: "#f5d582",
    secondary: "#1f7a55",
    glow: "rgba(245, 213, 130, 0.3)",
  },
  Portugal: {
    flagEmoji: "🇵🇹",
    primary: "#d9b649",
    secondary: "#9b243d",
    glow: "rgba(217, 182, 73, 0.28)",
  },
  "Saudi Arabia": {
    flagEmoji: "🇸🇦",
    primary: "#9ce5b0",
    secondary: "#0f6a46",
    glow: "rgba(156, 229, 176, 0.3)",
  },
  Spain: {
    flagEmoji: "🇪🇸",
    primary: "#f1ca54",
    secondary: "#8c1f36",
    glow: "rgba(241, 202, 84, 0.3)",
  },
  "United States": {
    flagEmoji: "🇺🇸",
    primary: "#e36f72",
    secondary: "#2d5bb3",
    glow: "rgba(227, 111, 114, 0.3)",
  },
  Uruguay: {
    flagEmoji: "🇺🇾",
    primary: "#9ad9ff",
    secondary: "#2b67a7",
    glow: "rgba(154, 217, 255, 0.32)",
  },
};

const TEAM_COLOR_PALETTES = [
  ["#f3bf6a", "#8156d7", "rgba(243, 191, 106, 0.28)"],
  ["#8fd7ff", "#275aa6", "rgba(143, 215, 255, 0.28)"],
  ["#f58974", "#8e2243", "rgba(245, 137, 116, 0.28)"],
  ["#9de0b3", "#186f55", "rgba(157, 224, 179, 0.28)"],
  ["#f3d077", "#7a4b1f", "rgba(243, 208, 119, 0.28)"],
  ["#c0b0ff", "#384fb8", "rgba(192, 176, 255, 0.28)"],
  ["#f7a6c1", "#6d2753", "rgba(247, 166, 193, 0.28)"],
];

const LOCALIZED_ROLE_LABELS: Record<
  WorldCupJournalistLanguage,
  Record<string, string>
> = {
  en: {
    Player: "Player",
    "Head Coach": "Head Coach",
    "Assistant Coach": "Assistant Coach",
    "Physical Coach": "Physical Coach",
    "Goalkeeping Coach": "Goalkeeping Coach",
    "Technical Coach": "Technical Coach",
    Goalkeeper: "Goalkeeper",
    Defender: "Defender",
    Midfielder: "Midfielder",
    Forward: "Forward",
    "Midfielder/Forward": "Midfielder/Forward",
  },
  ko: {
    Player: "선수",
    "Head Coach": "감독",
    "Assistant Coach": "수석 코치",
    "Physical Coach": "피지컬 코치",
    "Goalkeeping Coach": "골키퍼 코치",
    "Technical Coach": "기술 코치",
    Goalkeeper: "골키퍼",
    Defender: "수비수",
    Midfielder: "미드필더",
    Forward: "공격수",
    "Midfielder/Forward": "미드필더/공격수",
  },
  ja: {
    Player: "選手",
    "Head Coach": "監督",
    "Assistant Coach": "アシスタントコーチ",
    "Physical Coach": "フィジカルコーチ",
    "Goalkeeping Coach": "GKコーチ",
    "Technical Coach": "テクニカルコーチ",
    Goalkeeper: "GK",
    Defender: "DF",
    Midfielder: "MF",
    Forward: "FW",
    "Midfielder/Forward": "MF/FW",
  },
  es: {
    Player: "Jugador",
    "Head Coach": "Seleccionador",
    "Assistant Coach": "Asistente técnico",
    "Physical Coach": "Preparador físico",
    "Goalkeeping Coach": "Entrenador de porteros",
    "Technical Coach": "Entrenador técnico",
    Goalkeeper: "Portero",
    Defender: "Defensa",
    Midfielder: "Centrocampista",
    Forward: "Delantero",
    "Midfielder/Forward": "Centrocampista/Delantero",
  },
  vi: {
    Player: "Cầu thủ",
    "Head Coach": "HLV trưởng",
    "Assistant Coach": "Trợ lý HLV",
    "Physical Coach": "HLV thể lực",
    "Goalkeeping Coach": "HLV thủ môn",
    "Technical Coach": "HLV kỹ thuật",
    Goalkeeper: "Thủ môn",
    Defender: "Hậu vệ",
    Midfielder: "Tiền vệ",
    Forward: "Tiền đạo",
    "Midfielder/Forward": "Tiền vệ/Tiền đạo",
  },
  it: {
    Player: "Giocatore",
    "Head Coach": "Ct",
    "Assistant Coach": "Vice allenatore",
    "Physical Coach": "Preparatore atletico",
    "Goalkeeping Coach": "Allenatore dei portieri",
    "Technical Coach": "Allenatore tecnico",
    Goalkeeper: "Portiere",
    Defender: "Difensore",
    Midfielder: "Centrocampista",
    Forward: "Attaccante",
    "Midfielder/Forward": "Centrocampista/Attaccante",
  },
  fr: {
    Player: "Joueur",
    "Head Coach": "Sélectionneur",
    "Assistant Coach": "Adjoint",
    "Physical Coach": "Préparateur physique",
    "Goalkeeping Coach": "Entraîneur des gardiens",
    "Technical Coach": "Entraîneur technique",
    Goalkeeper: "Gardien",
    Defender: "Défenseur",
    Midfielder: "Milieu",
    Forward: "Attaquant",
    "Midfielder/Forward": "Milieu/Attaquant",
  },
};

const LOCALIZED_COVERAGE_STATUS_LABELS: Record<
  WorldCupJournalistLanguage,
  Record<JournalistTeamView["team"]["editorial"]["coverageStatus"], string>
> = {
  en: { ok: "Ready", needs_review: "Needs review", blocker: "Blocked" },
  ko: { ok: "준비됨", needs_review: "검토 필요", blocker: "보류" },
  ja: { ok: "準備完了", needs_review: "要確認", blocker: "保留" },
  es: { ok: "Listo", needs_review: "Revisión pendiente", blocker: "Bloqueado" },
  vi: { ok: "Sẵn sàng", needs_review: "Cần rà soát", blocker: "Bị chặn" },
  it: { ok: "Pronto", needs_review: "Da verificare", blocker: "Bloccato" },
  fr: { ok: "Prêt", needs_review: "À vérifier", blocker: "Bloqué" },
};

const LOCALIZED_SCOPE_TIER_LABELS: Record<
  WorldCupJournalistLanguage,
  Record<JournalistTeamView["team"]["scopeTier"], string>
> = {
  en: { priority: "Priority", secondary: "Secondary", unknown: "Unknown" },
  ko: { priority: "우선", secondary: "보조", unknown: "미분류" },
  ja: { priority: "優先", secondary: "セカンダリ", unknown: "未分類" },
  es: {
    priority: "Prioridad",
    secondary: "Secundario",
    unknown: "Sin clasificar",
  },
  vi: { priority: "Ưu tiên", secondary: "Thứ cấp", unknown: "Chưa phân loại" },
  it: {
    priority: "Prioritario",
    secondary: "Secondario",
    unknown: "Non classificato",
  },
  fr: {
    priority: "Prioritaire",
    secondary: "Secondaire",
    unknown: "Non classé",
  },
};

const LOCALIZED_COVERAGE_NOTICES: Record<
  WorldCupJournalistLanguage,
  {
    secondaryBlockerTitle: string;
    secondaryBlockerBody: string;
    needsReviewTitle: string;
    needsReviewBody: string;
    limitedCoverageEmpty: string;
  }
> = {
  en: {
    secondaryBlockerTitle: "48-team scope, secondary coverage still pending",
    secondaryBlockerBody:
      "This team is included in the full 48-team tournament view, but detailed roster, status, and storyline coverage has not been backfilled yet. Use the official source panel as the lead map and treat player-level fields as incomplete for now.",
    needsReviewTitle: "Coverage is usable, but provenance still needs review",
    needsReviewBody:
      "This team is available in the desk, but parts of the roster or official-source chain still rely on manual or fallback paths. Keep the provenance badges visible when you publish.",
    limitedCoverageEmpty:
      "Detailed player-level coverage is not ready for this team yet. Start from the official source panel and treat the rest of this desk as incomplete for now.",
  },
  ko: {
    secondaryBlockerTitle:
      "48팀 범위에는 포함되지만 보조 커버리지는 아직 대기 상태입니다",
    secondaryBlockerBody:
      "이 팀은 48개국 전체 뷰에는 포함되지만, 자세한 로스터·상태·스토리라인 커버리지는 아직 backfill되지 않았습니다. 지금은 공식 소스 패널을 진입점으로 보고, 선수 단위 필드는 미완성으로 취급하는 게 맞습니다.",
    needsReviewTitle: "사용은 가능하지만 provenance 검토가 아직 남아 있습니다",
    needsReviewBody:
      "이 팀은 데스크에서 사용할 수 있지만, 로스터나 공식 소스 체인의 일부가 아직 수동 또는 대체 경로에 의존합니다. 기사화할 때 provenance 배지는 그대로 노출하는 게 맞습니다.",
    limitedCoverageEmpty:
      "이 팀의 선수 단위 상세 커버리지는 아직 준비되지 않았습니다. 먼저 공식 소스 패널을 보고, 나머지 desk 정보는 미완성 상태로 보세요.",
  },
  ja: {
    secondaryBlockerTitle:
      "48チーム対象には入っているが、二次カバレッジは未整備です",
    secondaryBlockerBody:
      "このチームは48チーム全体ビューには含まれますが、詳細なロスター、状態、ストーリーラインのカバレッジはまだバックフィルされていません。まず公式ソースパネルを起点にし、選手レベルの項目は未完成として扱ってください。",
    needsReviewTitle: "利用は可能だが、provenance の確認がまだ必要です",
    needsReviewBody:
      "このチームはデスク上で利用できますが、ロスターや公式ソースチェーンの一部はまだ手動または代替経路に依存しています。公開時は provenance バッジを残してください。",
    limitedCoverageEmpty:
      "このチームの選手レベルの詳細カバレッジはまだ準備できていません。まず公式ソースパネルを確認し、それ以外のデスク情報は未完成として扱ってください。",
  },
  es: {
    secondaryBlockerTitle:
      "Está dentro del alcance de 48 equipos, pero la cobertura secundaria sigue pendiente",
    secondaryBlockerBody:
      "Este equipo está incluido en la vista completa de 48 selecciones, pero la cobertura detallada de lista, estado y storylines aún no se ha completado. Usa el panel de fuentes oficiales como mapa inicial y trata los campos a nivel jugador como incompletos por ahora.",
    needsReviewTitle:
      "La cobertura se puede usar, pero la procedencia aún requiere revisión",
    needsReviewBody:
      "Este equipo está disponible en la mesa editorial, pero parte de la lista o de la cadena de fuentes oficiales todavía depende de rutas manuales o de respaldo. Mantén visibles las insignias de procedencia al publicar.",
    limitedCoverageEmpty:
      "La cobertura detallada por jugador todavía no está lista para este equipo. Empieza por el panel de fuentes oficiales y trata el resto de este desk como incompleto por ahora.",
  },
  vi: {
    secondaryBlockerTitle:
      "Đã nằm trong phạm vi 48 đội, nhưng lớp coverage phụ vẫn đang chờ",
    secondaryBlockerBody:
      "Đội này đã có trong chế độ xem đủ 48 đội, nhưng coverage chi tiết về danh sách, trạng thái và storyline vẫn chưa được backfill. Hãy dùng bảng nguồn chính thức làm điểm vào và coi các trường cấp cầu thủ là chưa hoàn chỉnh.",
    needsReviewTitle: "Có thể dùng, nhưng provenance vẫn cần rà soát",
    needsReviewBody:
      "Đội này đã dùng được trong desk, nhưng một phần danh sách hoặc chuỗi nguồn chính thức vẫn còn dựa vào đường thủ công hoặc fallback. Khi xuất bản, nên giữ nguyên badge provenance.",
    limitedCoverageEmpty:
      "Coverage chi tiết ở cấp cầu thủ cho đội này vẫn chưa sẵn sàng. Hãy bắt đầu từ bảng nguồn chính thức và coi phần còn lại của desk là chưa hoàn chỉnh.",
  },
  it: {
    secondaryBlockerTitle:
      "Rientra nel perimetro a 48 squadre, ma la copertura secondaria è ancora in attesa",
    secondaryBlockerBody:
      "Questa squadra è inclusa nella vista completa a 48, ma la copertura dettagliata di rosa, stato e storyline non è ancora stata completata. Usa il pannello delle fonti ufficiali come punto di partenza e considera i campi a livello giocatore ancora incompleti.",
    needsReviewTitle:
      "La copertura è utilizzabile, ma la provenance va ancora verificata",
    needsReviewBody:
      "Questa squadra è disponibile nel desk, ma parte della rosa o della catena di fonti ufficiali dipende ancora da percorsi manuali o fallback. In pubblicazione conviene mantenere visibili i badge di provenance.",
    limitedCoverageEmpty:
      "La copertura dettagliata a livello giocatore non è ancora pronta per questa squadra. Parti dal pannello delle fonti ufficiali e considera il resto del desk ancora incompleto.",
  },
  fr: {
    secondaryBlockerTitle:
      "Inclus dans le périmètre à 48 équipes, mais la couverture secondaire est encore en attente",
    secondaryBlockerBody:
      "Cette équipe est incluse dans la vue complète à 48, mais la couverture détaillée de l'effectif, des statuts et des storylines n'a pas encore été complétée. Utilise le panneau des sources officielles comme point d'entrée et considère les champs au niveau joueur comme incomplets pour l'instant.",
    needsReviewTitle:
      "La couverture est exploitable, mais la provenance doit encore être vérifiée",
    needsReviewBody:
      "Cette équipe est disponible dans le desk, mais une partie de l'effectif ou de la chaîne de sources officielles repose encore sur des chemins manuels ou de repli. Au moment de publier, garde les badges de provenance visibles.",
    limitedCoverageEmpty:
      "La couverture détaillée au niveau joueur n'est pas encore prête pour cette équipe. Commence par le panneau des sources officielles et considère le reste du desk comme incomplet pour l'instant.",
  },
};

const LOCALIZED_SOURCE_NOTES: Record<
  WorldCupJournalistLanguage,
  {
    article: string;
    page: string;
    pdf: string;
    matchPages: string;
    rendered: string;
    ocr: string;
    blocked: string;
    default: string;
  }
> = {
  en: {
    article:
      "Official federation article with current roster or staff coverage.",
    page: "Official federation page with current roster or staff coverage.",
    pdf: "Official federation PDF source with current roster or staff coverage.",
    matchPages:
      "Official match pages are used to reconstruct the current roster and staff.",
    rendered:
      "Official federation source is browser-rendered; the current roster is read from the rendered page.",
    ocr: "Official federation source is image-based and the current roster is parsed via OCR.",
    blocked:
      "Official federation source is blocked in this environment, so the current coverage uses the best verified fallback path.",
    default:
      "Official federation source is configured for current roster and staff coverage.",
  },
  ko: {
    article: "현재 로스터나 스태프를 확인할 수 있는 연맹 공식 기사입니다.",
    page: "현재 로스터나 스태프를 확인할 수 있는 연맹 공식 페이지입니다.",
    pdf: "현재 로스터나 스태프를 확인할 수 있는 연맹 공식 PDF 소스입니다.",
    matchPages:
      "공식 경기 페이지를 합쳐 현재 로스터와 스태프를 재구성하고 있습니다.",
    rendered:
      "연맹 공식 소스가 브라우저 렌더형이라, 렌더된 페이지에서 현재 로스터를 읽어옵니다.",
    ocr: "연맹 공식 소스가 이미지 기반이라, 현재 로스터를 OCR로 파싱합니다.",
    blocked:
      "이 환경에서는 연맹 공식 소스 접근이 막혀 있어, 현재는 검증된 대체 경로를 사용합니다.",
    default:
      "현재 로스터와 스태프 커버리지를 위한 연맹 공식 소스가 설정돼 있습니다.",
  },
  ja: {
    article: "現在のロスターやスタッフを確認できる連盟公式記事です。",
    page: "現在のロスターやスタッフを確認できる連盟公式ページです。",
    pdf: "現在のロスターやスタッフを確認できる連盟公式PDFソースです。",
    matchPages:
      "公式試合ページを使って現在のロスターとスタッフを再構成しています。",
    rendered:
      "連盟公式ソースはブラウザ描画型のため、描画済みページから現在のロスターを取得しています。",
    ocr: "連盟公式ソースは画像ベースのため、現在のロスターをOCRで解析しています。",
    blocked:
      "この環境では連盟公式ソースへのアクセスが遮断されているため、検証済みの代替経路を使っています。",
    default:
      "現在のロスターとスタッフを把握するための連盟公式ソースが設定されています。",
  },
  es: {
    article:
      "Artículo oficial de la federación con cobertura actual de lista o staff.",
    page: "Página oficial de la federación con cobertura actual de lista o staff.",
    pdf: "PDF oficial de la federación con cobertura actual de lista o staff.",
    matchPages:
      "Las páginas oficiales de partido se usan para reconstruir la lista y el staff actuales.",
    rendered:
      "La fuente oficial de la federación se renderiza en navegador; la lista actual se lee desde esa página renderizada.",
    ocr: "La fuente oficial de la federación es una imagen y la lista actual se extrae vía OCR.",
    blocked:
      "La fuente oficial de la federación está bloqueada en este entorno, así que la cobertura actual usa la mejor ruta alternativa verificada.",
    default:
      "Hay una fuente oficial de la federación configurada para la cobertura actual de lista y staff.",
  },
  vi: {
    article:
      "Bài viết chính thức của liên đoàn với dữ liệu hiện tại về danh sách hoặc ban huấn luyện.",
    page: "Trang chính thức của liên đoàn với dữ liệu hiện tại về danh sách hoặc ban huấn luyện.",
    pdf: "Nguồn PDF chính thức của liên đoàn với dữ liệu hiện tại về danh sách hoặc ban huấn luyện.",
    matchPages:
      "Các trang trận đấu chính thức được dùng để dựng lại danh sách và ban huấn luyện hiện tại.",
    rendered:
      "Nguồn chính thức của liên đoàn là trang render bằng trình duyệt; danh sách hiện tại được đọc từ trang đã render.",
    ocr: "Nguồn chính thức của liên đoàn ở dạng hình ảnh nên danh sách hiện tại được parse bằng OCR.",
    blocked:
      "Nguồn chính thức của liên đoàn bị chặn trong môi trường này, nên lớp phủ hiện tại dùng đường dự phòng đã xác minh.",
    default:
      "Nguồn chính thức của liên đoàn đã được cấu hình cho lớp phủ danh sách và ban huấn luyện hiện tại.",
  },
  it: {
    article:
      "Articolo ufficiale della federazione con copertura attuale di rosa o staff.",
    page: "Pagina ufficiale della federazione con copertura attuale di rosa o staff.",
    pdf: "PDF ufficiale della federazione con copertura attuale di rosa o staff.",
    matchPages:
      "Le pagine ufficiali delle partite vengono usate per ricostruire rosa e staff attuali.",
    rendered:
      "La fonte ufficiale della federazione è renderizzata via browser; la rosa attuale viene letta dalla pagina renderizzata.",
    ocr: "La fonte ufficiale della federazione è basata su immagini e la rosa attuale viene estratta via OCR.",
    blocked:
      "La fonte ufficiale della federazione è bloccata in questo ambiente, quindi la copertura attuale usa il miglior fallback verificato.",
    default:
      "È configurata una fonte ufficiale della federazione per la copertura attuale di rosa e staff.",
  },
  fr: {
    article:
      "Article officiel de la fédération avec couverture actuelle de la liste ou du staff.",
    page: "Page officielle de la fédération avec couverture actuelle de la liste ou du staff.",
    pdf: "Source PDF officielle de la fédération avec couverture actuelle de la liste ou du staff.",
    matchPages:
      "Les pages officielles de match servent à reconstituer la liste et le staff actuels.",
    rendered:
      "La source officielle de la fédération est rendue côté navigateur ; la liste actuelle est lue depuis cette page rendue.",
    ocr: "La source officielle de la fédération est basée sur une image et la liste actuelle est extraite via OCR.",
    blocked:
      "La source officielle de la fédération est bloquée dans cet environnement ; la couverture actuelle utilise donc le meilleur fallback vérifié.",
    default:
      "Une source officielle de la fédération est configurée pour la couverture actuelle de la liste et du staff.",
  },
};

const LOCALIZED_OFFICIAL_NEWS_LANE: Record<
  WorldCupJournalistLanguage,
  {
    kicker: string;
    title: string;
    note: string;
    officialArticles: string;
    linkedArticles: string;
    teamLinkedArticles: string;
    openGaps: string;
    selectedTeam: string;
    topTeams: string;
    remainingGapTeams: string;
    openJson: string;
    noSelectedTeamData: string;
    recentArticles: string;
  }
> = {
  en: {
    kicker: "Official news lane",
    title: "Official-source national-team news",
    note: "This lane isolates federation and verified official-source articles from the broader player-recall flow so team coverage can be audited on its own.",
    officialArticles: "Official articles",
    linkedArticles: "Linked articles",
    teamLinkedArticles: "Team-linked articles",
    openGaps: "Open team gaps",
    selectedTeam: "Selected team",
    topTeams: "Most active teams",
    remainingGapTeams: "Remaining gap teams",
    openJson: "Open lane JSON",
    noSelectedTeamData:
      "No 30-day official-source article is currently linked for the selected team.",
    recentArticles: "Recent official articles",
  },
  ko: {
    kicker: "공식 뉴스 레인",
    title: "공식 소스 국가대표팀 뉴스",
    note: "이 레인은 선수 중심 리콜과 분리해서, 연맹 및 검증된 공식 소스 기사만 따로 집계해 국가대표팀 커버리지를 독립적으로 점검할 수 있게 합니다.",
    officialArticles: "공식 기사 수",
    linkedArticles: "링크된 기사 수",
    teamLinkedArticles: "팀 링크 기사 수",
    openGaps: "남은 팀 갭",
    selectedTeam: "선택 팀",
    topTeams: "기사 많은 팀",
    remainingGapTeams: "남은 갭 팀",
    openJson: "레인 JSON 열기",
    noSelectedTeamData:
      "선택한 팀은 최근 30일 official-source 기사 연결이 아직 없습니다.",
    recentArticles: "최근 공식 기사",
  },
  ja: {
    kicker: "公式ニュースレーン",
    title: "公式ソース代表チームニュース",
    note: "このレーンは選手中心のリコールと分離し、連盟や検証済み公式ソースの記事だけを別集計して代表チーム報道を監査できるようにします。",
    officialArticles: "公式記事数",
    linkedArticles: "リンク済み記事数",
    teamLinkedArticles: "チーム連結記事数",
    openGaps: "未解消チームギャップ",
    selectedTeam: "選択中のチーム",
    topTeams: "記事が多いチーム",
    remainingGapTeams: "残るギャップのチーム",
    openJson: "レーンJSONを開く",
    noSelectedTeamData:
      "選択中のチームには直近30日でリンク済み公式記事がまだありません。",
    recentArticles: "最近の公式記事",
  },
  es: {
    kicker: "Carril oficial",
    title: "Noticias de selección desde fuentes oficiales",
    note: "Este carril separa los artículos de federaciones y otras fuentes oficiales verificadas del recall más amplio de jugadores para auditar la cobertura de selecciones por separado.",
    officialArticles: "Artículos oficiales",
    linkedArticles: "Artículos enlazados",
    teamLinkedArticles: "Artículos enlazados al equipo",
    openGaps: "Huecos de equipo",
    selectedTeam: "Equipo seleccionado",
    topTeams: "Equipos más activos",
    remainingGapTeams: "Equipos con huecos",
    openJson: "Abrir JSON del carril",
    noSelectedTeamData:
      "No hay artículos oficiales enlazados para el equipo seleccionado en la ventana de 30 días.",
    recentArticles: "Artículos oficiales recientes",
  },
  vi: {
    kicker: "Làn nguồn chính thức",
    title: "Tin đội tuyển từ nguồn chính thức",
    note: "Làn này tách riêng bài từ liên đoàn và nguồn chính thức đã xác minh khỏi luồng recall cầu thủ rộng hơn để kiểm tra coverage đội tuyển một cách độc lập.",
    officialArticles: "Bài chính thức",
    linkedArticles: "Bài đã link",
    teamLinkedArticles: "Bài đã link tới đội",
    openGaps: "Khoảng trống đội",
    selectedTeam: "Đội đang chọn",
    topTeams: "Đội hoạt động nhiều",
    remainingGapTeams: "Đội còn gap",
    openJson: "Mở lane JSON",
    noSelectedTeamData:
      "Hiện chưa có bài official-source được link cho đội đang chọn trong 30 ngày gần đây.",
    recentArticles: "Bài official gần đây",
  },
  it: {
    kicker: "Corsia ufficiale",
    title: "Notizie delle nazionali da fonti ufficiali",
    note: "Questa corsia separa gli articoli di federazione e le fonti ufficiali verificate dal flusso più ampio di recall sui giocatori, così la copertura della nazionale può essere auditata da sola.",
    officialArticles: "Articoli ufficiali",
    linkedArticles: "Articoli collegati",
    teamLinkedArticles: "Articoli collegati alla squadra",
    openGaps: "Gap squadra aperti",
    selectedTeam: "Squadra selezionata",
    topTeams: "Squadre più attive",
    remainingGapTeams: "Squadre con gap residui",
    openJson: "Apri JSON della corsia",
    noSelectedTeamData:
      "Nessun articolo official-source è attualmente collegato alla squadra selezionata nella finestra di 30 giorni.",
    recentArticles: "Articoli ufficiali recenti",
  },
  fr: {
    kicker: "Voie officielle",
    title: "Actualité des sélections depuis les sources officielles",
    note: "Cette voie sépare les articles de fédération et les autres sources officielles vérifiées du flux plus large centré sur les joueurs afin d’auditer la couverture des sélections séparément.",
    officialArticles: "Articles officiels",
    linkedArticles: "Articles liés",
    teamLinkedArticles: "Articles liés à l’équipe",
    openGaps: "Gaps équipe ouverts",
    selectedTeam: "Équipe sélectionnée",
    topTeams: "Équipes les plus actives",
    remainingGapTeams: "Équipes encore en gap",
    openJson: "Ouvrir le JSON de la voie",
    noSelectedTeamData:
      "Aucun article official-source n'est actuellement lié à l'équipe sélectionnée sur 30 jours.",
    recentArticles: "Articles officiels récents",
  },
};

const SOURCE_TOKEN_LABELS: Record<string, string> = {
  pending: "Pending",
  ussoccer: "U.S. Soccer",
  canadasoccer: "Canada Soccer",
  miseleccion: "Mi Seleccion",
  afa: "AFA",
  cbf: "CBF",
  fff: "FFF",
  rfef: "RFEF",
  englandfootball: "England Football",
  dfb: "DFB",
  fpf: "FPF",
  onsoranje: "OnsOranje",
  rbfa: "RBFA",
  hns: "HNS",
  auf: "AUF",
  jfa: "JFA",
  kfa: "KFA",
  ffiri: "FFIRI",
  fcf: "FCF",
  fef: "FEF",
  tff: "TFF",
  sfv: "SFV",
  fsfoot: "FSF",
  footballaustralia: "Football Australia",
  fifa: "FIFA",
  reuters: "Reuters",
  apnews: "AP News",
  espn: "ESPN",
  bbc: "BBC",
  skysports: "Sky Sports",
  nytimes: "The New York Times",
  theathletic: "The Athletic",
  guardian: "The Guardian",
  jina: "Jina",
  squad: "Squad",
  roster: "Roster",
  article: "Article",
  page: "Page",
  pdf: "PDF",
  rendered: "Rendered",
  team: "Team",
  member: "Member",
  notice: "Notice",
  match: "Match",
  pages: "Pages",
  current: "Current",
  selection: "Selection",
  bulleted: "Bulleted",
  list: "List",
  table: "Table",
  tables: "Tables",
  image: "Image",
  index: "Index",
  notice_pdf: "Notice PDF",
};

const LOCALIZED_STORYLINE_REWRITES: Record<
  WorldCupJournalistLanguage,
  {
    mediaBriefingTitle: (subject: string) => string;
    mediaBriefingSummary: (teamName: string) => string;
    officialInterviewOn: (teamName: string, topic: string) => string;
    teamUnityTitle: (subject: string) => string;
    teamUnitySummary: (teamName: string, subject: string) => string;
  }
> = {
  en: {
    mediaBriefingTitle: (subject) => `${subject} media briefing`,
    mediaBriefingSummary: (teamName) =>
      `Official ${teamName} press-conference briefing.`,
    officialInterviewOn: (teamName, topic) =>
      `Official ${teamName} interview on ${topic}.`,
    teamUnityTitle: (subject) => `${subject} and the team-unity message`,
    teamUnitySummary: (teamName, subject) =>
      `${subject} is linked to the team-unity angle in official ${teamName} material.`,
  },
  ko: {
    mediaBriefingTitle: (subject) => `${subject} 미디어 브리핑`,
    mediaBriefingSummary: (teamName) =>
      `${teamName} 공식 기자회견 브리핑입니다.`,
    officialInterviewOn: (teamName, topic) =>
      `${topic}에 대한 ${teamName} 공식 인터뷰입니다.`,
    teamUnityTitle: (subject) => `${subject}의 팀 결속 메시지`,
    teamUnitySummary: (teamName, subject) =>
      `${subject}는 ${teamName} 공식 자료에서 팀 결속 앵글과 연결돼 있습니다.`,
  },
  ja: {
    mediaBriefingTitle: (subject) => `${subject} メディアブリーフィング`,
    mediaBriefingSummary: (teamName) =>
      `${teamName}の公式会見ブリーフィングです。`,
    officialInterviewOn: (teamName, topic) =>
      `${topic}に関する${teamName}の公式インタビューです。`,
    teamUnityTitle: (subject) => `${subject}とチーム結束メッセージ`,
    teamUnitySummary: (teamName, subject) =>
      `${subject}は${teamName}の公式素材でチーム結束の角度に紐づいています。`,
  },
  es: {
    mediaBriefingTitle: (subject) => `Briefing de prensa de ${subject}`,
    mediaBriefingSummary: (teamName) =>
      `Briefing de rueda de prensa oficial de ${teamName}.`,
    officialInterviewOn: (teamName, topic) =>
      `Entrevista oficial de ${teamName} sobre ${topic}.`,
    teamUnityTitle: (subject) => `${subject} y el mensaje de unidad`,
    teamUnitySummary: (teamName, subject) =>
      `${subject} queda vinculado al ángulo de unidad del equipo en material oficial de ${teamName}.`,
  },
  vi: {
    mediaBriefingTitle: (subject) => `Họp media của ${subject}`,
    mediaBriefingSummary: (teamName) =>
      `Buổi briefing họp báo chính thức của ${teamName}.`,
    officialInterviewOn: (teamName, topic) =>
      `Phỏng vấn chính thức của ${teamName} về ${topic}.`,
    teamUnityTitle: (subject) => `${subject} và thông điệp đoàn kết`,
    teamUnitySummary: (teamName, subject) =>
      `${subject} được gắn với góc nhìn về tinh thần đoàn kết trong nguồn chính thức của ${teamName}.`,
  },
  it: {
    mediaBriefingTitle: (subject) => `Briefing stampa di ${subject}`,
    mediaBriefingSummary: (teamName) =>
      `Briefing ufficiale in conferenza stampa di ${teamName}.`,
    officialInterviewOn: (teamName, topic) =>
      `Intervista ufficiale di ${teamName} su ${topic}.`,
    teamUnityTitle: (subject) => `${subject} e il messaggio di unità`,
    teamUnitySummary: (teamName, subject) =>
      `${subject} è collegato all'angolo sull'unità del gruppo nel materiale ufficiale di ${teamName}.`,
  },
  fr: {
    mediaBriefingTitle: (subject) => `Briefing média de ${subject}`,
    mediaBriefingSummary: (teamName) =>
      `Briefing officiel en conférence de presse de ${teamName}.`,
    officialInterviewOn: (teamName, topic) =>
      `Interview officielle de ${teamName} sur ${topic}.`,
    teamUnityTitle: (subject) => `${subject} et le message d'unité`,
    teamUnitySummary: (teamName, subject) =>
      `${subject} est relié à l'angle de l'unité du groupe dans le matériel officiel de ${teamName}.`,
  },
};

const UPPERCASE_NAME_STOP_WORDS = new Set([
  "FIFA",
  "UEFA",
  "AFC",
  "CAF",
  "CONMEBOL",
  "CONCACAF",
  "OFC",
  "JFA",
  "CBF",
  "FRMF",
  "FA",
  "SAMURAI",
  "WORLD",
  "CUP",
]);

function formatDateTime(
  value: string | null | undefined,
  i18n: WorldCupJournalistI18n,
): string {
  if (!value) return i18n.labels.unavailable;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || i18n.labels.unavailable;
  try {
    return new Intl.DateTimeFormat(i18n.locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return value;
  }
}

function formatRelativeTimeFromNow(
  value: string | null | undefined,
  i18n: WorldCupJournalistI18n,
): string {
  if (!value) return i18n.labels.unavailable;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return i18n.labels.unavailable;
  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;

  let unit: Intl.RelativeTimeFormatUnit = "minute";
  let amount = Math.round(diffMs / minute);
  if (absMs >= day * 2) {
    unit = "day";
    amount = Math.round(diffMs / day);
  } else if (absMs >= hour) {
    unit = "hour";
    amount = Math.round(diffMs / hour);
  }

  try {
    return new Intl.RelativeTimeFormat(i18n.locale, { numeric: "auto" }).format(
      amount,
      unit,
    );
  } catch {
    return formatDateTime(value, i18n);
  }
}

function freshnessTone(state: FreshnessState): Tone {
  if (state === "stale") return "danger";
  if (state === "monitor") return "warm";
  if (state === "unknown") return "muted";
  return "default";
}

function formatFreshnessStateLabel(
  state: FreshnessState,
  i18n: WorldCupJournalistI18n,
): string {
  if (state === "fresh") return i18n.labels.fresh;
  if (state === "monitor") return i18n.labels.monitor;
  if (state === "stale") return i18n.labels.stale;
  return i18n.labels.unknown;
}

function buildFreshnessMetric(
  label: string,
  ageDays: number | null,
  lastSeenAt: string | null,
  threshold: (typeof FOOTBALL_WORLD_CUP_FRESHNESS_THRESHOLDS)[keyof typeof FOOTBALL_WORLD_CUP_FRESHNESS_THRESHOLDS],
): FreshnessMetric {
  return {
    label,
    state: classifyFreshnessAgeDays(ageDays, threshold),
    ageDays,
    lastSeenAt,
  };
}

function formatFreshnessSummary(
  metric: FreshnessMetric,
  i18n: WorldCupJournalistI18n,
): string {
  if (metric.state === "unknown") return i18n.labels.unavailable;
  const relative = metric.lastSeenAt
    ? formatRelativeTimeFromNow(metric.lastSeenAt, i18n)
    : null;
  return relative
    ? `${formatFreshnessStateLabel(metric.state, i18n)} · ${relative}`
    : formatFreshnessStateLabel(metric.state, i18n);
}

function formatFreshnessValue(
  metric: FreshnessMetric,
  i18n: WorldCupJournalistI18n,
): string {
  if (metric.state === "unknown") return i18n.labels.unavailable;
  return metric.lastSeenAt
    ? formatRelativeTimeFromNow(metric.lastSeenAt, i18n)
    : formatFreshnessStateLabel(metric.state, i18n);
}

function buildTeamFreshnessMetrics(
  team: JournalistTeamView,
  i18n: WorldCupJournalistI18n,
): FreshnessMetric[] {
  return [
    getTeamFreshnessMetric(team, "official", i18n),
    getTeamFreshnessMetric(team, "status", i18n),
    getTeamFreshnessMetric(team, "storyline", i18n),
  ];
}

function getTeamFreshnessMetric(
  team: JournalistTeamView,
  kind: "official" | "status" | "storyline",
  i18n: WorldCupJournalistI18n,
): FreshnessMetric {
  if (kind === "official") {
    return buildFreshnessMetric(
      i18n.labels.officialFreshness,
      team.team.editorial.freshness.officialAppearanceAgeDays,
      team.team.summary.latestOfficialAppearanceAt,
      FOOTBALL_WORLD_CUP_FRESHNESS_THRESHOLDS.officialAppearance,
    );
  }
  if (kind === "status") {
    return buildFreshnessMetric(
      i18n.labels.statusFreshness,
      team.team.editorial.freshness.currentStatusAgeDays,
      team.team.summary.latestCurrentStatusAt,
      FOOTBALL_WORLD_CUP_FRESHNESS_THRESHOLDS.currentStatus,
    );
  }
  return buildFreshnessMetric(
    i18n.labels.storylineFreshness,
    team.team.editorial.freshness.storylineAgeDays,
    team.team.summary.latestStorylineSeenAt,
    FOOTBALL_WORLD_CUP_FRESHNESS_THRESHOLDS.storyline,
  );
}

function buildPersonFreshnessMetrics(
  card: JournalistPersonCard,
  i18n: WorldCupJournalistI18n,
): FreshnessMetric[] {
  const lastOfficialAppearanceAt =
    card.officialAppearanceTimeline[0]?.appearanceDate || null;
  const lastStorylineAt = card.storylineList[0]?.lastSeenAt || null;
  const lastStatusAt = card.statusPanel.updatedAt || null;

  return [
    buildFreshnessMetric(
      i18n.labels.officialFreshness,
      diffDaysFromNow(lastOfficialAppearanceAt),
      lastOfficialAppearanceAt,
      FOOTBALL_WORLD_CUP_FRESHNESS_THRESHOLDS.officialAppearance,
    ),
    buildFreshnessMetric(
      i18n.labels.statusFreshness,
      diffDaysFromNow(lastStatusAt),
      lastStatusAt,
      FOOTBALL_WORLD_CUP_FRESHNESS_THRESHOLDS.currentStatus,
    ),
    buildFreshnessMetric(
      i18n.labels.storylineFreshness,
      diffDaysFromNow(lastStorylineAt),
      lastStorylineAt,
      FOOTBALL_WORLD_CUP_FRESHNESS_THRESHOLDS.storyline,
    ),
  ];
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compactText(
  value: string | null | undefined,
  maxLength = 170,
): string | null {
  if (!value) return null;
  const next = normalizeWhitespace(value);
  if (!next) return null;
  if (next.length <= maxLength) return next;
  return `${next.slice(0, maxLength - 1).trimEnd()}…`;
}

function humanizeToken(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function countPatternMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length || 0;
}

function shouldPreferReadableEnglishFallback(
  value: string | null | undefined,
  i18n: WorldCupJournalistI18n,
): boolean {
  if (i18n.code !== "en") return false;
  const next = normalizeWhitespace(value || "");
  if (!next) return false;
  const hangulCount = countPatternMatches(
    next,
    /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/g,
  );
  if (hangulCount > 0) return true;
  const foreignScriptCount = countPatternMatches(
    next,
    /[\u0400-\u04FF\u0600-\u06FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/g,
  );
  if (!foreignScriptCount) return false;
  const latinLetterCount = countPatternMatches(next, /[A-Za-z]/g);
  return foreignScriptCount >= Math.max(4, latinLetterCount);
}

function localizeRoleLabel(
  value: string,
  i18n: WorldCupJournalistI18n,
): string {
  return LOCALIZED_ROLE_LABELS[i18n.code][value] || value;
}

function humanizeSourceToken(value: string): string {
  const parts = value
    .split("_")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) return humanizeToken(value);
  return parts
    .map((part) => SOURCE_TOKEN_LABELS[part] || humanizeToken(part))
    .join(" ");
}

function formatSourceMetaBadge(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.includes("_")) return humanizeSourceToken(trimmed);
  return normalizeText(trimmed) || trimmed;
}

function prioritizeEditorialIssues(issues: string[]): string[] {
  const priorityByIssue: Record<string, number> = {
    ambiguous_player_identity: 0,
    current_status_gap: 1,
    selection_claim_gap: 2,
    manual_override_active: 3,
    source_disabled: 4,
  };

  return [...issues].sort((left, right) => {
    const leftPriority = priorityByIssue[left] ?? 99;
    const rightPriority = priorityByIssue[right] ?? 99;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return left.localeCompare(right);
  });
}

function formatCoverageStatusLabel(
  value: JournalistTeamView["team"]["editorial"]["coverageStatus"],
  i18n: WorldCupJournalistI18n,
): string {
  return (
    LOCALIZED_COVERAGE_STATUS_LABELS[i18n.code][value] || humanizeToken(value)
  );
}

function formatScopeTierLabel(
  value: JournalistTeamView["team"]["scopeTier"],
  i18n: WorldCupJournalistI18n,
): string | null {
  if (value === "unknown") return null;
  return LOCALIZED_SCOPE_TIER_LABELS[i18n.code][value] || humanizeToken(value);
}

function coverageTone(
  value: JournalistTeamView["team"]["editorial"]["coverageStatus"],
): Tone {
  if (value === "blocker") return "danger";
  if (value === "needs_review") return "default";
  return "warm";
}

function getCoverageNotice(
  team: JournalistTeamView,
  i18n: WorldCupJournalistI18n,
): { title: string; body: string; tone: Tone } | null {
  const copy = LOCALIZED_COVERAGE_NOTICES[i18n.code];
  if (
    team.team.editorial.coverageStatus === "blocker" &&
    team.team.scopeTier === "secondary"
  ) {
    return {
      title: copy.secondaryBlockerTitle,
      body: copy.secondaryBlockerBody,
      tone: "danger",
    };
  }
  if (team.team.editorial.coverageStatus === "needs_review") {
    return {
      title: copy.needsReviewTitle,
      body: copy.needsReviewBody,
      tone: "default",
    };
  }
  return null;
}

function getLimitedCoverageEmptyMessage(
  team: JournalistTeamView,
  i18n: WorldCupJournalistI18n,
): string | null {
  if (team.team.editorial.coverageStatus !== "blocker") return null;
  return LOCALIZED_COVERAGE_NOTICES[i18n.code].limitedCoverageEmpty;
}

function formatDisplaySourceLabel(
  value: string | null | undefined,
  teamCanonicalName: string,
): string | null {
  const cleaned =
    cleanSourceLabelCandidate(value, teamCanonicalName) ||
    normalizeText(value) ||
    value?.trim() ||
    null;
  if (!cleaned) return null;
  const normalized = normalizeWhitespace(cleaned);
  if (!normalized) return null;
  if (/^[a-z0-9_]+$/i.test(normalized) && normalized.includes("_")) {
    return humanizeSourceToken(normalized);
  }
  return normalized;
}

function normalizeHostValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = trimmed.includes("://")
      ? new URL(trimmed)
      : new URL(`https://${trimmed}`);
    return url.hostname.toLowerCase();
  } catch {
    return (
      trimmed
        .replace(/^https?:\/\//i, "")
        .split("/")[0]
        .split(":")[0]
        .trim()
        .toLowerCase() || null
    );
  }
}

function formatHostSourceLabel(
  value: string | null | undefined,
): string | null {
  const host = normalizeHostValue(value);
  if (!host) return null;
  const compactHost = host.replace(/^www\./, "");
  const parts = compactHost.split(".").filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0];
  const token =
    ["www", "m", "media", "archive", "news"].includes(first) && parts[1]
      ? parts[1]
      : first;
  return SOURCE_TOKEN_LABELS[token] || humanizeToken(token);
}

function isLikelyPublisherName(
  value: string | null | undefined,
): value is string {
  const next = normalizeText(value);
  if (!next) return false;
  if (next.length > 34) return false;
  if (/[.!?]/.test(next)) return false;
  if (
    /\b(current|preview|roster|selection|details|march|world cup|calls?|players?|training camp)\b/i.test(
      next,
    )
  )
    return false;
  return next.split(/\s+/).length <= 4;
}

function pickReadableSourceName(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (!isLikelyPublisherName(value)) continue;
    return normalizeText(value) || value;
  }
  return null;
}

function capitalizeDisplayLabel(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatStatusValue(
  value: string | null | undefined,
  i18n: WorldCupJournalistI18n,
): string | null {
  if (!value) return null;
  return i18n.statusValues[value] || humanizeToken(value);
}

function formatUppercaseNamePart(value: string): string {
  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/u.test(value)) return value;
  const upper = value.toLocaleUpperCase("en-US");
  const lower = value.toLocaleLowerCase("en-US");
  if (value !== upper || value === lower) return value;
  return value
    .split(/([-'’])/)
    .map((part) => {
      if (!part || part === "-" || part === "'" || part === "’") return part;
      const partUpper = part.toLocaleUpperCase("en-US");
      const partLower = part.toLocaleLowerCase("en-US");
      if (part !== partUpper || part === partLower) return part;
      return `${partLower.charAt(0).toLocaleUpperCase("en-US")}${partLower.slice(1)}`;
    })
    .join("");
}

function formatPersonName(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return value
    .split(/\s+/)
    .map((part) => formatUppercaseNamePart(part))
    .join(" ");
}

function resolveDisplayPersonName(
  displayName: string | null | undefined,
  canonicalName?: string | null | undefined,
): string {
  const normalizedDisplayName = normalizeText(displayName);
  if (normalizedDisplayName) return normalizedDisplayName;
  if (canonicalName) return formatPersonName(canonicalName);
  return "Unknown";
}

function collectNameVariants(
  values: Array<string | null | undefined>,
): string[] {
  return [
    ...new Set(
      values.map((value) => normalizeWhitespace(value || "")).filter(Boolean),
    ),
  ];
}

function normalizeInlineUppercaseName(value: string): string {
  return value.replace(
    /\b([A-ZÀ-ÖØ-Þ]{3,}(?:[-'’][A-ZÀ-ÖØ-Þ]{2,})?)\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ]+(?:[-'’][A-Za-zÀ-ÖØ-öø-ÿ]+)*)/gu,
    (match, uppercaseToken: string, nextToken: string) => {
      if (UPPERCASE_NAME_STOP_WORDS.has(uppercaseToken)) return match;
      return `${formatUppercaseNamePart(uppercaseToken)} ${nextToken}`;
    },
  );
}

function normalizeCanonicalNames(
  canonicalNames: CanonicalNamesInput,
): string[] {
  const names = Array.isArray(canonicalNames)
    ? canonicalNames
    : [canonicalNames];
  return [
    ...new Set(names.map((value) => (value || "").trim()).filter(Boolean)),
  ].sort((left, right) => right.length - left.length);
}

function normalizeText(
  value: string | null | undefined,
  canonicalNames?: CanonicalNamesInput,
): string | null {
  if (!value) return null;
  let next = normalizeWhitespace(value);
  for (const canonicalName of normalizeCanonicalNames(canonicalNames)) {
    next = next.split(canonicalName).join(formatPersonName(canonicalName));
  }
  return normalizeInlineUppercaseName(next);
}

function stripOfficialSuffixes(
  value: string | null | undefined,
): string | null {
  const next = normalizeText(value);
  if (!next) return null;
  return next
    .replace(/\s+\|\s+JFA$/i, "")
    .replace(/\s+-\s+Confederação Brasileira de Futebol$/i, "")
    .trim();
}

function cleanSourceLabelCandidate(
  value: string | null | undefined,
  teamCanonicalName: string,
): string | null {
  const next = stripOfficialSuffixes(value);
  if (!next) return null;

  const withoutTeamPrefix = next
    .replace(/^England Football\s+/i, "")
    .replace(/^CBF\s+/i, "")
    .replace(/^JFA Samurai Blue\s+/i, "")
    .replace(new RegExp(`^${escapeRegExp(teamCanonicalName)}\\s+`, "i"), "")
    .replace(/\s+(article|page)$/i, "")
    .trim();

  return withoutTeamPrefix || next;
}

function stripLeadingCurrentStatus(
  value: string | null | undefined,
  canonicalName: string,
): string | null {
  const next = normalizeText(value, canonicalName);
  if (!next) return null;
  const displayName = formatPersonName(canonicalName);
  if (next.startsWith(`${displayName} current status:`)) {
    return normalizeWhitespace(
      next.slice(`${displayName} current status:`.length),
    );
  }
  if (next.startsWith("current status:")) {
    return normalizeWhitespace(next.slice("current status:".length));
  }
  return next;
}

function ensureSentence(value: string | null | undefined): string | null {
  if (!value) return null;
  const next = normalizeWhitespace(value)
    .replace(/[.;:,]+$/g, "")
    .trim();
  if (!next) return null;
  const sentence = `${next.charAt(0).toUpperCase()}${next.slice(1)}`;
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function stripStatusBoilerplate(
  value: string | null | undefined,
  canonicalName: string,
): string | null {
  const next = stripLeadingCurrentStatus(value, canonicalName);
  if (!next) return null;
  return ensureSentence(
    next
      .replace(/^selected in [^;]+;\s*/i, "")
      .replace(/^reported as\s+/i, "")
      .replace(/^reported\s+/i, "")
      .replace(/^currently\s+/i, "")
      .trim(),
  );
}

function isWeakStatusHook(value: string | null | undefined): boolean {
  if (!value) return true;
  return /^(dealing with an injury|injured|suspended|captain|reported as captain)\.?$/i.test(
    value.trim(),
  );
}

function badgeClass(tone: Tone): string {
  if (tone === "muted") return `${styles.badge} ${styles.badgeMuted}`;
  if (tone === "warm") return `${styles.badge} ${styles.badgeWarm}`;
  if (tone === "danger") return `${styles.badge} ${styles.badgeDanger}`;
  return styles.badge;
}

function renderLaneLabel(lane: string, i18n: WorldCupJournalistI18n): string {
  if (lane === "Roster") return i18n.lanes.roster;
  if (lane === "Leadership") return i18n.lanes.leadership;
  if (lane === "Availability") return i18n.lanes.availability;
  if (lane === "Storyline") return i18n.lanes.storyline;
  if (lane === "Quote lane") return i18n.lanes.quoteLane;
  if (lane === "Roster lane") return i18n.lanes.rosterLane;
  if (lane === "Momentum lane") return i18n.lanes.momentumLane;
  if (lane === "Preview lane") return i18n.lanes.previewLane;
  if (lane === "Coach line") return i18n.lanes.coachLine;
  if (lane === "Official lane") return i18n.lanes.officialLane;
  return lane;
}

function leadCardClass(tone: Tone): string {
  if (tone === "muted") return `${styles.leadCard} ${styles.leadCardMuted}`;
  if (tone === "warm") return `${styles.leadCard} ${styles.leadCardWarm}`;
  if (tone === "danger") return `${styles.leadCard} ${styles.leadCardDanger}`;
  return styles.leadCard;
}

function resolveRoleLabel(card: JournalistPersonCard): string {
  if (card.role.roleType === "player" && card.role.positionGroup) {
    return card.role.positionGroup;
  }
  return card.role.roleLabel;
}

function summarizeOfficialSourceNote(
  team: JournalistTeamView,
  i18n: WorldCupJournalistI18n,
): string {
  const note = team.team.officialSource.notes;
  if (!note) return i18n.labels.unavailable;
  if (i18n.code === "en") return note;

  const lower = note.toLowerCase();
  const templates = LOCALIZED_SOURCE_NOTES[i18n.code];

  if (
    /(cloudflare|blocked|not permitted|timed out|did not resolve|remains blocked)/.test(
      lower,
    )
  )
    return templates.blocked;
  if (/(ocr|image-based|squad image)/.test(lower)) return templates.ocr;
  if (/pdf/.test(lower)) return templates.pdf;
  if (
    /(client-rendered|rendered dom|rendered page|browser-rendered)/.test(lower)
  )
    return templates.rendered;
  if (/match pages?/.test(lower)) return templates.matchPages;
  if (
    /(member page|current senior national-team page|current roster page|position pages|player cards)/.test(
      lower,
    )
  )
    return templates.page;
  if (
    /(official article|call-up article|squad article|roster article|26-player list|full senior squad list|article exposes)/.test(
      lower,
    )
  )
    return templates.article;
  return templates.default;
}

function normalizeLeadHref(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.origin.toLowerCase()}${pathname}${url.search}`;
  } catch {
    return value.trim().replace(/\/+$/, "");
  }
}

function normalizeLeadTitleForCompare(value: string): string {
  return normalizeWhitespace(
    normalizeInlineUppercaseName(value)
      .toLocaleLowerCase("en-US")
      .replace(/[’'".,!?():-]+/g, " ")
      .replace(/\bon\b/g, " "),
  );
}

function areLikelyDuplicateExternalLeads(
  left: DeskLead,
  right: DeskLead,
): boolean {
  const leftHref = normalizeLeadHref(left.href);
  const rightHref = normalizeLeadHref(right.href);
  if (!leftHref || !rightHref || leftHref !== rightHref) return false;

  const bothStorylines =
    left.lane === "Storyline" && right.lane === "Storyline";
  if (bothStorylines) return false;

  const leftTitle = normalizeLeadTitleForCompare(left.title);
  const rightTitle = normalizeLeadTitleForCompare(right.title);
  if (!leftTitle || !rightTitle) return false;
  if (leftTitle === rightTitle) return true;
  if (leftTitle.includes(rightTitle) || rightTitle.includes(leftTitle))
    return true;

  return false;
}

function rewriteStorylineTitle(
  item: JournalistStoryline,
  i18n: WorldCupJournalistI18n,
): string {
  const subject =
    resolveDisplayPersonName(
      item.subjectDisplayName,
      item.subjectCanonicalName,
    ) || item.teamCanonicalName;
  const subjectNames = collectNameVariants([
    item.subjectDisplayName,
    item.subjectCanonicalName,
  ]);
  const rawTitle = normalizeText(item.title, subjectNames) || item.title;
  const localized = LOCALIZED_STORYLINE_REWRITES[i18n.code];

  const malformedOn = rawTitle.match(/^(.+?) on explains (.+)$/i);
  if (malformedOn) {
    return `${resolveDisplayPersonName(malformedOn[1])} on ${normalizeWhitespace(malformedOn[2])}`;
  }

  if (/^.+?:\s*World Cup media briefing$/i.test(rawTitle)) {
    return localized.mediaBriefingTitle(subject);
  }

  if (/^.+? on It is important that we stick together$/i.test(rawTitle)) {
    return localized.teamUnityTitle(subject);
  }

  return rawTitle;
}

function rewriteStorylineSummary(
  item: JournalistStoryline,
  i18n: WorldCupJournalistI18n,
): string | null {
  const subject =
    resolveDisplayPersonName(
      item.subjectDisplayName,
      item.subjectCanonicalName,
    ) || item.teamCanonicalName;
  const subjectNames = collectNameVariants([
    item.subjectDisplayName,
    item.subjectCanonicalName,
  ]);
  const rawTitle = normalizeText(item.title, subjectNames) || item.title;
  const rawSummary = compactText(
    normalizeText(item.summary, subjectNames),
    170,
  );
  const localized = LOCALIZED_STORYLINE_REWRITES[i18n.code];

  if (/^.+? on It is important that we stick together$/i.test(rawTitle)) {
    return localized.teamUnitySummary(item.teamCanonicalName, subject);
  }

  if (/^.+?:\s*World Cup media briefing$/i.test(rawTitle)) {
    return localized.mediaBriefingSummary(item.teamCanonicalName);
  }

  const malformedSummary = rawSummary?.match(
    /^.+? addressed explains (.+?) in an official .+? interview\.?$/i,
  );
  if (malformedSummary) {
    return localized.officialInterviewOn(
      item.teamCanonicalName,
      normalizeWhitespace(malformedSummary[1]),
    );
  }

  return rawSummary;
}

function buildPersonBadges(
  card: JournalistPersonCard,
  i18n: WorldCupJournalistI18n,
): BadgeItem[] {
  const structured = card.statusPanel.structured;
  const items: BadgeItem[] = [];
  const selectionStatus = formatStatusValue(structured.selectionStatus, i18n);
  const injuryStatus = formatStatusValue(structured.injuryStatus, i18n);
  const returnStatus = formatStatusValue(structured.returnStatus, i18n);
  const suspensionStatus = formatStatusValue(structured.suspensionStatus, i18n);
  const captaincyStatus = formatStatusValue(structured.captaincyStatus, i18n);

  if (selectionStatus) items.push({ label: selectionStatus, tone: "default" });
  if (injuryStatus) items.push({ label: injuryStatus, tone: "danger" });
  if (returnStatus) items.push({ label: returnStatus, tone: "warm" });
  if (suspensionStatus) items.push({ label: suspensionStatus, tone: "danger" });
  if (captaincyStatus) items.push({ label: captaincyStatus, tone: "warm" });
  if (card.storylineList.length)
    items.push({
      label: i18n.counts.storyline(card.storylineList.length),
      tone: "warm",
    });
  if (!card.storylineList.length && card.officialAppearanceTimeline.length) {
    items.push({
      label: i18n.counts.officialSignal(card.officialAppearanceTimeline.length),
      tone: "muted",
    });
  }
  return items;
}

function buildPersonSignalScore(
  card: JournalistPersonCard,
  language: WorldCupJournalistLanguage,
): number {
  return buildPersonScoreBreakdown(card, language).reduce(
    (total, item) => total + item.value,
    0,
  );
}

function buildPersonStatusLine(
  card: JournalistPersonCard,
  i18n: WorldCupJournalistI18n,
): string {
  const structured = card.statusPanel.structured;
  const parts = [
    formatStatusValue(structured.selectionStatus, i18n),
    formatStatusValue(structured.injuryStatus, i18n),
    formatStatusValue(structured.returnStatus, i18n),
    formatStatusValue(structured.suspensionStatus, i18n),
    formatStatusValue(structured.captaincyStatus, i18n),
  ].filter(Boolean);

  if (parts.length) return parts.join(" · ");
  if (card.storylineList.length) return i18n.copy.storylinesLinked;
  if (card.officialAppearanceTimeline.length)
    return i18n.copy.officialVoiceLinked;
  if (card.role.roleType !== "player") return i18n.copy.staffListed;
  return i18n.copy.noLiveStatusNote;
}

function buildPersonHook(
  card: JournalistPersonCard,
  i18n: WorldCupJournalistI18n,
): string | null {
  const structured = card.statusPanel.structured;
  const cleanedCurrent = compactText(
    stripStatusBoilerplate(
      card.statusPanel.currentStatus?.claimText,
      card.canonicalName,
    ),
    140,
  );
  const currentHook =
    cleanedCurrent && !isWeakStatusHook(cleanedCurrent) ? cleanedCurrent : null;
  const firstStoryline = card.storylineList[0]
    ? deriveStorylineLead(card.storylineList[0], i18n)
    : null;
  const firstAppearance = card.officialAppearanceTimeline[0]
    ? deriveAppearanceLead(card.officialAppearanceTimeline[0], i18n)
    : null;

  if (structured.injuryStatus) {
    return currentHook || i18n.copy.availabilityFitness;
  }
  if (structured.suspensionStatus) {
    return currentHook || i18n.copy.availabilitySuspension;
  }
  if (structured.captaincyStatus) {
    return currentHook || i18n.copy.leadershipCaptain;
  }
  if (structured.returnStatus) {
    return currentHook || i18n.copy.returnReadiness;
  }
  if (firstAppearance?.summary) {
    return firstAppearance.summary;
  }
  if (firstStoryline) {
    return (
      compactText(firstStoryline.summary, 150) ||
      ensureSentence(firstStoryline.title) ||
      i18n.copy.storylinesLinked
    );
  }
  if (firstAppearance) {
    return (
      ensureSentence(firstAppearance.title) || i18n.copy.officialVoiceLinked
    );
  }

  return null;
}

function buildPersonEvidence(
  card: JournalistPersonCard,
  i18n: WorldCupJournalistI18n,
): string | null {
  const firstEvidence =
    card.statusPanel.currentStatus?.evidence?.[0] ||
    card.statusPanel.latestSelectionStatus?.evidence?.[0] ||
    null;

  if (firstEvidence?.evidenceText) {
    return compactText(
      normalizeText(firstEvidence.evidenceText, card.canonicalName),
      150,
    );
  }
  if (card.storylineList[0]?.summary || card.storylineList[0]?.topicSnippet) {
    return compactText(
      normalizeText(
        card.storylineList[0]?.summary || card.storylineList[0]?.topicSnippet,
      ),
      150,
    );
  }
  if (card.officialAppearanceTimeline[0]?.summary) {
    return compactText(
      deriveAppearanceLead(card.officialAppearanceTimeline[0], i18n).summary,
      150,
    );
  }
  return null;
}

function buildPersonEntry(
  card: JournalistPersonCard,
  i18n: WorldCupJournalistI18n,
  humanInterestRecord?: HumanInterestPilotRecord | null,
): PersonEntry {
  const structured = card.statusPanel.structured;
  const scoreBreakdown = buildPersonScoreBreakdown(
    card,
    i18n.code,
    humanInterestRecord,
  );
  const starPowerScore = computeStarPowerScore(card, humanInterestRecord);
  const signalScore = scoreBreakdown.reduce(
    (total, item) => total + item.value,
    0,
  );
  let lane = "Roster";
  let laneTone: Tone = "muted";
  let category: PersonEntry["category"] = "none";

  if (
    structured.injuryStatus ||
    structured.suspensionStatus ||
    structured.returnStatus ||
    structured.captaincyStatus
  ) {
    lane = structured.captaincyStatus ? "Leadership" : "Availability";
    laneTone =
      structured.injuryStatus || structured.suspensionStatus
        ? "danger"
        : "warm";
    category = "status";
  } else if (card.storylineList.length) {
    lane = "Storyline";
    laneTone = "warm";
    category = "story";
  } else if (card.officialAppearanceTimeline.length) {
    lane = "Quote lane";
    laneTone = "default";
    category = "voice";
  }

  const firstEvidence =
    card.statusPanel.currentStatus?.evidence?.[0] ||
    card.statusPanel.latestSelectionStatus?.evidence?.[0] ||
    null;

  return {
    id: card.sportsPersonId,
    displayName: resolveDisplayPersonName(card.displayName, card.canonicalName),
    roleLabel: localizeRoleLabel(resolveRoleLabel(card), i18n),
    portrait: card.portrait,
    instagram: card.socialProfiles.instagram,
    squadNumber: card.role.squadNumber,
    statusLine: buildPersonStatusLine(card, i18n),
    hook: buildPersonHook(card, i18n),
    evidence: buildPersonEvidence(card, i18n),
    href:
      firstEvidence?.sourceUrl ||
      card.officialAppearanceTimeline[0]?.url ||
      card.profile?.sourceUrl ||
      null,
    updatedAt: card.statusPanel.updatedAt,
    badges: buildPersonBadges(card, i18n),
    scoreBreakdown,
    signalScore,
    starPowerScore,
    rarity: buildCardRarity(buildDisplayHeatScore(signalScore)),
    lane,
    laneTone,
    category,
    isPlayer: card.role.roleType === "player",
    researchNotes: (humanInterestRecord?.researchNotes || []).filter((note) =>
      shouldDisplayResearchNote(note, i18n.code),
    ),
  };
}

function buildProfileSnapshotText(card: JournalistPersonCard): string | null {
  return compactText(
    normalizeText(card.profile?.shortBio || card.profile?.longBio),
    120,
  );
}

function classifyStorylineTheme(item: JournalistStoryline): StorylineTheme {
  const haystack = [
    item.storyType,
    item.claimType,
    item.title,
    item.summary,
    item.topicSnippet,
    item.sourceLabel,
    ...item.articles.flatMap((article) => [article.title, article.snippet]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en-US");

  if (
    /(controvers|scandal|backlash|critic|probe|investig|arrest|court|lawsuit|abuse|racis|ban\b|banned|feud|row\b|fallout|police|assault)/.test(
      haystack,
    )
  ) {
    return "controversy";
  }

  if (
    /(rumou?r|speculat|linked? with|interest from|target|transfer|uncertain|uncertainty|question mark|doubt|could\b|might\b|expected to|set to)/.test(
      haystack,
    )
  ) {
    return "rumor";
  }

  return "reported";
}

function countStorylinesByTheme(
  card: JournalistPersonCard,
  theme: StorylineTheme,
): number {
  return card.storylineList.filter(
    (item) => classifyStorylineTheme(item) === theme,
  ).length;
}

function buildStorylineLeadsByTheme(
  card: JournalistPersonCard,
  theme: StorylineTheme,
  i18n: WorldCupJournalistI18n,
): DeskLead[] {
  return card.storylineList
    .filter((item) => classifyStorylineTheme(item) === theme)
    .sort((left, right) => {
      if ((right.heatScore || 0) !== (left.heatScore || 0))
        return (right.heatScore || 0) - (left.heatScore || 0);
      return (
        (Date.parse(right.lastSeenAt || "") || 0) -
        (Date.parse(left.lastSeenAt || "") || 0)
      );
    })
    .slice(0, 4)
    .map((item) => deriveStorylineLead(item, i18n));
}

function buildDisplayHeatScore(score: number): number {
  return Math.max(0, Math.min(99, Math.round(score)));
}

function buildHeatTone(score: number): Tone {
  if (score >= 72) return "danger";
  if (score >= 36) return "warm";
  if (score > 0) return "default";
  return "muted";
}

function buildCardSubtitle(
  card: JournalistPersonCard,
  entry: PersonEntry,
  atlasCopy: CardAtlasCopy,
): string {
  const parts = [entry.roleLabel];
  if (card.currentClub) parts.push(`${atlasCopy.club} ${card.currentClub}`);
  if (entry.squadNumber != null) parts.push(`#${entry.squadNumber}`);
  return parts.join(" · ");
}

function hashString(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildCrestShort(teamName: string): string {
  const words = teamName
    .replace(/[()'’.]/g, " ")
    .split(/[\s/-]+/)
    .filter(Boolean);
  const short = words
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return short || teamName.slice(0, 3).toUpperCase();
}

function pushUniqueString(target: string[], value: string | null | undefined) {
  if (!value || target.includes(value)) return;
  target.push(value);
}

function resolveLogoOrigin(
  sourceUrl: string | null | undefined,
): string | null {
  if (!sourceUrl) return null;
  try {
    return new URL(sourceUrl).origin.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function buildLogoCandidatesFromOrigin(origin: string): string[] {
  const candidates: string[] = [];
  for (const path of TEAM_LOGO_CANDIDATE_PATHS) {
    pushUniqueString(candidates, `${origin}${path}`);
  }
  pushUniqueString(
    candidates,
    `https://www.google.com/s2/favicons?sz=256&domain_url=${encodeURIComponent(origin)}`,
  );
  return candidates;
}

function buildTeamLogoAssetSlug(teamName: string): string {
  const aliasedName = TEAM_LOGO_LOCAL_ASSET_ALIASES[teamName];
  if (aliasedName) return aliasedName;
  return teamName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildLocalLogoAssetCandidates(teamName: string): string[] {
  const slug = buildTeamLogoAssetSlug(teamName);
  const extensions = TEAM_LOGO_LOCAL_ASSET_EXTENSIONS[slug];
  if (!extensions?.length) return [];
  return extensions.map(
    (extension) => `/world-cup-federation-icons/${slug}.${extension}`,
  );
}

function resolveOfficialLogoUrls(
  teamName: string,
  sourceUrl: string | null | undefined,
): string[] {
  const candidates: string[] = [];
  for (const localAsset of buildLocalLogoAssetCandidates(teamName)) {
    pushUniqueString(candidates, localAsset);
  }

  const origins = [
    resolveLogoOrigin(TEAM_LOGO_HOME_OVERRIDES[teamName]),
    resolveLogoOrigin(sourceUrl),
  ].filter(Boolean) as string[];

  for (const origin of origins) {
    for (const candidate of buildLogoCandidatesFromOrigin(origin)) {
      pushUniqueString(candidates, candidate);
    }
  }

  return candidates;
}

function buildTeamVisualProfile(
  teamInput:
    | string
    | {
        canonicalName: string;
        officialSource?: {
          sourceUrl: string | null;
        };
      },
): TeamVisualProfile {
  const teamName =
    typeof teamInput === "string" ? teamInput : teamInput.canonicalName;
  const logoUrls = resolveOfficialLogoUrls(
    teamName,
    typeof teamInput === "string" ? null : teamInput.officialSource?.sourceUrl,
  );
  const override = TEAM_COLOR_OVERRIDES[teamName];
  if (override) {
    return {
      crestLabel: teamName,
      crestShort: buildCrestShort(teamName),
      flagEmoji: override.flagEmoji,
      logoUrls,
      primary: override.primary,
      secondary: override.secondary,
      glow: override.glow,
    };
  }

  const palette =
    TEAM_COLOR_PALETTES[hashString(teamName) % TEAM_COLOR_PALETTES.length];
  return {
    crestLabel: teamName,
    crestShort: buildCrestShort(teamName),
    flagEmoji: TEAM_FLAG_EMOJIS[teamName] || null,
    logoUrls,
    primary: palette[0],
    secondary: palette[1],
    glow: palette[2],
  };
}

function buildPositionVisual(card: JournalistPersonCard): PositionVisual {
  const position =
    `${card.role.positionGroup || ""} ${card.role.roleLabel || ""}`.toLocaleLowerCase(
      "en-US",
    );
  if (card.role.roleType !== "player") {
    if (/head coach|manager|coach/.test(position)) {
      return {
        label: "Coach",
        accent: "#f58b62",
        glow: "rgba(245, 139, 98, 0.26)",
      };
    }
    return {
      label: "Staff",
      accent: "#7db8e8",
      glow: "rgba(125, 184, 232, 0.24)",
    };
  }
  if (/goalkeeper/.test(position))
    return {
      label: "GK",
      accent: "#68d8c7",
      glow: "rgba(104, 216, 199, 0.26)",
    };
  if (/defender/.test(position))
    return {
      label: "DF",
      accent: "#67a7ff",
      glow: "rgba(103, 167, 255, 0.26)",
    };
  if (/midfielder/.test(position))
    return {
      label: "MF",
      accent: "#f4cb6a",
      glow: "rgba(244, 203, 106, 0.26)",
    };
  if (/forward/.test(position))
    return {
      label: "FW",
      accent: "#ff7e71",
      glow: "rgba(255, 126, 113, 0.28)",
    };
  return { label: "SQ", accent: "#f3bf6a", glow: "rgba(243, 191, 106, 0.24)" };
}

function scoreStoryline(item: JournalistStoryline): number {
  const heatBoost = Math.min(16, Math.round((item.heatScore || 0) / 6));
  const theme = classifyStorylineTheme(item);
  if (theme === "controversy") return 22 + heatBoost;
  if (theme === "rumor")
    return 16 + Math.min(14, Math.round((item.heatScore || 0) / 7));
  return 10 + heatBoost;
}

function formatScoreBreakdownLabel(
  key: ScoreBreakdownKey,
  language: WorldCupJournalistLanguage,
): string {
  if (language === "ko") {
    if (key === "injury") return "부상";
    if (key === "return") return "복귀";
    if (key === "suspension") return "징계";
    if (key === "leadership") return "리더십";
    if (key === "status") return "상태";
    if (key === "humanInterest") return "피처";
    if (key === "reported") return "보도";
    if (key === "rumor") return "루머";
    if (key === "controversy") return "논란";
    if (key === "official") return "공식";
  }

  if (key === "injury") return "Injury";
  if (key === "return") return "Return";
  if (key === "suspension") return "Suspension";
  if (key === "leadership") return "Leadership";
  if (key === "status") return "Status";
  if (key === "humanInterest") return "Feature";
  if (key === "reported") return "Reported";
  if (key === "rumor") return "Rumor";
  if (key === "controversy") return "Controversy";
  if (key === "official") return "Official";
  return key;
}

function formatScoreBreakdownDetail(
  key: ScoreBreakdownKey,
  card: JournalistPersonCard,
  counts: {
    reported: number;
    rumor: number;
    controversy: number;
    humanInterestFeatureAngles: number;
    humanInterestContext: number;
  },
  language: WorldCupJournalistLanguage,
): string {
  if (language === "ko") {
    if (key === "injury") {
      return card.statusPanel.structured.injuryStatus === "ruled_out"
        ? "출전 불가 부상 신호가 현재 상태 패널에 반영돼 있습니다."
        : "현재 상태 패널에 부상 신호가 붙어 있습니다.";
    }
    if (key === "return")
      return "복귀 또는 컨디션 회복 신호가 연결돼 있습니다.";
    if (key === "suspension")
      return "징계 또는 출전 정지 신호가 연결돼 있습니다.";
    if (key === "leadership") return "주장 또는 리더십 마커가 연결돼 있습니다.";
    if (key === "status") return "현재 상태 라인이 명시돼 있습니다.";
    if (key === "humanInterest")
      return `소스가 확인된 피처 앵글 ${counts.humanInterestFeatureAngles}개와 공개 개인 맥락 ${counts.humanInterestContext}개가 카드 점수에 반영돼 있습니다.`;
    if (key === "reported")
      return `${counts.reported}개의 보도형 스토리라인이 연결돼 있습니다.`;
    if (key === "rumor")
      return `${counts.rumor}개의 루머형 스토리라인이 연결돼 있습니다.`;
    if (key === "controversy")
      return `${counts.controversy}개의 논란형 스토리라인이 연결돼 있습니다.`;
    if (key === "official")
      return `${card.officialAppearanceTimeline.length}개의 공식 발언/출연 신호가 연결돼 있습니다.`;
  }

  if (key === "injury") {
    return card.statusPanel.structured.injuryStatus === "ruled_out"
      ? "A ruled-out injury signal is attached on the current status panel."
      : "An injury signal is attached on the current status panel.";
  }
  if (key === "return")
    return "A return-to-fitness or comeback signal is attached.";
  if (key === "suspension") return "A suspension or ban signal is attached.";
  if (key === "leadership")
    return "A captaincy or leadership marker is attached.";
  if (key === "status") return "A current status line exists for this person.";
  if (key === "humanInterest")
    return `${counts.humanInterestFeatureAngles} source-backed feature angle(s) and ${counts.humanInterestContext} public personal context item(s) are boosting this card.`;
  if (key === "reported")
    return `${counts.reported} reported storyline signal(s) are attached.`;
  if (key === "rumor")
    return `${counts.rumor} rumor storyline signal(s) are attached.`;
  if (key === "controversy")
    return `${counts.controversy} controversy storyline signal(s) are attached.`;
  return `${card.officialAppearanceTimeline.length} official voice signal(s) are attached.`;
}

function formatScoreBreakdownTooltip(item: ScoreBreakdownItem): string {
  return `${item.label}: ${item.value}/${item.maxValue}. ${item.detail}`;
}

function formatCardSortModeLabel(
  mode: CardSortMode,
  language: WorldCupJournalistLanguage,
): string {
  if (language === "ko") {
    if (mode === "star_power") return "스타 파워";
    if (mode === "risk_radar") return "리스크 레이더";
    if (mode === "official_voices") return "공식 발언 우선";
    return "탑 스토리 타깃";
  }

  if (mode === "star_power") return "Star Power";
  if (mode === "risk_radar") return "Risk Radar";
  if (mode === "official_voices") return "Official Voices";
  return "Top Story Targets";
}

function formatCardSortModeNote(
  mode: CardSortMode,
  language: WorldCupJournalistLanguage,
): string {
  if (language === "ko") {
    if (mode === "star_power")
      return "인스타그램 팔로워, 피처 우선순위, 주장 여부, 공식 발언, 클럽 위상을 함께 반영해 가장 유명한 선수부터 위로 올립니다.";
    if (mode === "risk_radar")
      return "부상, 징계, 루머, 논란 점수를 더 세게 반영해 당장 기사화할 위험 인물을 위로 올립니다.";
    if (mode === "official_voices")
      return "공식 인터뷰, 보도형 스토리라인, 리더십 신호를 더 세게 반영해 인용 가치가 높은 인물을 위로 올립니다.";
    return "전체 기사거리 점수와 소스가 확인된 피처 앵글을 함께 반영해 지금 당장 후속 가치가 높은 선수와 감독을 먼저 올립니다.";
  }

  if (mode === "star_power") {
    return "Pushes the most recognizable players to the top using Instagram reach, feature priority, captaincy, official voice, and club stature.";
  }
  if (mode === "risk_radar") {
    return "Pushes injury, suspension, rumor, and controversy signals to the top for fast risk scanning.";
  }
  if (mode === "official_voices") {
    return "Pushes official interviews, reported hooks, and leadership signals to the top for quote-first coverage.";
  }
  return "Ranks the squad by overall article-worthiness, including source-backed feature angles, so the highest-value follow-up targets surface first.";
}

function getScoreBreakdownValue(
  entry: PersonEntry,
  key: ScoreBreakdownKey,
): number {
  return entry.scoreBreakdown.find((item) => item.key === key)?.value || 0;
}

function computeCardSortWeight(entry: PersonEntry, mode: CardSortMode): number {
  if (mode === "star_power") {
    return entry.starPowerScore * 1.15 + entry.signalScore * 0.2;
  }

  if (mode === "risk_radar") {
    return (
      getScoreBreakdownValue(entry, "injury") * 1.35 +
      getScoreBreakdownValue(entry, "suspension") * 1.2 +
      getScoreBreakdownValue(entry, "controversy") * 1.15 +
      getScoreBreakdownValue(entry, "rumor") +
      entry.signalScore * 0.2
    );
  }

  if (mode === "official_voices") {
    return (
      getScoreBreakdownValue(entry, "official") * 1.25 +
      getScoreBreakdownValue(entry, "reported") * 1.15 +
      getScoreBreakdownValue(entry, "leadership") +
      getScoreBreakdownValue(entry, "status") * 0.6 +
      entry.signalScore * 0.15
    );
  }

  return (
    entry.signalScore +
    getScoreBreakdownValue(entry, "humanInterest") * 0.9
  );
}

function sortAtlasEntries(
  entries: PersonEntry[],
  mode: CardSortMode,
  locale: string,
): PersonEntry[] {
  return [...entries].sort((left, right) => {
    const scoreDelta =
      computeCardSortWeight(right, mode) - computeCardSortWeight(left, mode);
    if (scoreDelta !== 0) return scoreDelta;
    const leftNumber = left.squadNumber ?? Number.MAX_SAFE_INTEGER;
    const rightNumber = right.squadNumber ?? Number.MAX_SAFE_INTEGER;
    if (leftNumber !== rightNumber) return leftNumber - rightNumber;
    if (left.isPlayer !== right.isPlayer) return left.isPlayer ? -1 : 1;
    return left.displayName.localeCompare(right.displayName, locale);
  });
}

function buildPersonScoreBreakdown(
  card: JournalistPersonCard,
  language: WorldCupJournalistLanguage,
  humanInterestRecord?: HumanInterestPilotRecord | null,
): ScoreBreakdownItem[] {
  const structured = card.statusPanel.structured;
  const reportedStorylineCount = countStorylinesByTheme(card, "reported");
  const rumorStorylineCount = countStorylinesByTheme(card, "rumor");
  const controversyStorylineCount = countStorylinesByTheme(card, "controversy");
  const humanInterestSignal = buildHumanInterestSignal(humanInterestRecord);
  const reportedValue = Math.min(
    22,
    card.storylineList
      .filter((item) => classifyStorylineTheme(item) === "reported")
      .reduce((total, item) => total + scoreStoryline(item), 0),
  );
  const rumorValue = Math.min(
    18,
    card.storylineList
      .filter((item) => classifyStorylineTheme(item) === "rumor")
      .reduce((total, item) => total + scoreStoryline(item), 0),
  );
  const controversyValue = Math.min(
    24,
    card.storylineList
      .filter((item) => classifyStorylineTheme(item) === "controversy")
      .reduce((total, item) => total + scoreStoryline(item), 0),
  );

  const rawItems: Array<{
    key: ScoreBreakdownKey;
    value: number;
    tone: Tone;
  }> = [
    {
      key: "injury",
      value:
        structured.injuryStatus === "ruled_out"
          ? SCORE_BREAKDOWN_LIMITS.injury
          : structured.injuryStatus
            ? 24
            : 0,
      tone: "danger",
    },
    {
      key: "return",
      value: structured.returnStatus ? SCORE_BREAKDOWN_LIMITS.return : 0,
      tone: "warm",
    },
    {
      key: "suspension",
      value: structured.suspensionStatus
        ? SCORE_BREAKDOWN_LIMITS.suspension
        : 0,
      tone: "danger",
    },
    {
      key: "leadership",
      value: structured.captaincyStatus ? SCORE_BREAKDOWN_LIMITS.leadership : 0,
      tone: "warm",
    },
    {
      key: "status",
      value: card.statusPanel.currentStatus ? SCORE_BREAKDOWN_LIMITS.status : 0,
      tone: "default",
    },
    {
      key: "humanInterest",
      value: humanInterestSignal.value,
      tone: "warm",
    },
    { key: "reported", value: reportedValue, tone: "default" },
    { key: "rumor", value: rumorValue, tone: "warm" },
    { key: "controversy", value: controversyValue, tone: "danger" },
    {
      key: "official",
      value: Math.min(
        SCORE_BREAKDOWN_LIMITS.official,
        card.officialAppearanceTimeline.length * 6,
      ),
      tone: "muted",
    },
  ];

  return rawItems
    .filter((item) => item.value > 0)
    .map((item) => ({
      ...item,
      label: formatScoreBreakdownLabel(item.key, language),
      maxValue: SCORE_BREAKDOWN_LIMITS[item.key],
      detail: formatScoreBreakdownDetail(
        item.key,
        card,
        {
          reported: reportedStorylineCount,
          rumor: rumorStorylineCount,
          controversy: controversyStorylineCount,
          humanInterestFeatureAngles: humanInterestSignal.featureAngleCount,
          humanInterestContext: humanInterestSignal.contextCount,
        },
        language,
      ),
    }))
    .sort((left, right) => right.value - left.value);
}

function buildCardRarity(score: number): CardRarity {
  if (score >= 92) return "legend";
  if (score >= 72) return "platinum";
  if (score >= 48) return "gold";
  if (score >= 24) return "silver";
  return "bronze";
}

function formatCardRarity(
  rarity: CardRarity,
  language: WorldCupJournalistLanguage,
): string {
  if (language === "ko") {
    if (rarity === "legend") return "레전드";
    if (rarity === "platinum") return "플래티넘";
    if (rarity === "gold") return "골드";
    if (rarity === "silver") return "실버";
    return "브론즈";
  }
  if (rarity === "legend") return "Legend";
  if (rarity === "platinum") return "Platinum";
  if (rarity === "gold") return "Gold";
  if (rarity === "silver") return "Silver";
  return "Bronze";
}

function readSelectedPersonIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const personId = params.get("person");
  return personId?.trim() || null;
}

function buildCardStyle(
  teamVisual: TeamVisualProfile | null | undefined,
  positionVisual: PositionVisual,
  rarity: CardRarity,
): CSSProperties {
  const resolvedTeamVisual = teamVisual || buildTeamVisualProfile("World Cup");
  const rarityPalette: Record<
    CardRarity,
    { border: string; foil: string; shadow: string }
  > = {
    bronze: {
      border: "#b47a44",
      foil: "rgba(180, 122, 68, 0.18)",
      shadow: "rgba(180, 122, 68, 0.22)",
    },
    silver: {
      border: "#b9c7db",
      foil: "rgba(185, 199, 219, 0.2)",
      shadow: "rgba(185, 199, 219, 0.2)",
    },
    gold: {
      border: "#f0c45b",
      foil: "rgba(240, 196, 91, 0.22)",
      shadow: "rgba(240, 196, 91, 0.24)",
    },
    platinum: {
      border: "#76e0ff",
      foil: "rgba(118, 224, 255, 0.2)",
      shadow: "rgba(118, 224, 255, 0.24)",
    },
    legend: {
      border: "#ff7d65",
      foil: "rgba(255, 125, 101, 0.22)",
      shadow: "rgba(255, 125, 101, 0.26)",
    },
  };

  const palette = rarityPalette[rarity];
  return {
    ["--card-team-primary" as string]: resolvedTeamVisual.primary,
    ["--card-team-secondary" as string]: resolvedTeamVisual.secondary,
    ["--card-team-glow" as string]: resolvedTeamVisual.glow,
    ["--card-position-accent" as string]: positionVisual.accent,
    ["--card-position-glow" as string]: positionVisual.glow,
    ["--card-rarity-border" as string]: palette.border,
    ["--card-rarity-foil" as string]: palette.foil,
    ["--card-rarity-shadow" as string]: palette.shadow,
  };
}

function buildPersonInitials(name: string): string {
  const parts = formatPersonName(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return "P";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function PortraitThumb({
  portrait,
  name,
  size,
  className,
  style,
}: {
  portrait: JournalistPersonCard["portrait"];
  name: string;
  size: "sm" | "md" | "lg";
  className?: string;
  style?: CSSProperties;
}) {
  const frameClass =
    size === "sm"
      ? styles.portraitFrameSm
      : size === "lg"
        ? styles.portraitFrameLg
        : styles.portraitFrameMd;

  return (
    <span
      className={`${styles.portraitFrame} ${frameClass} ${className || ""}`.trim()}
      style={style}
    >
      {portrait?.publicPath ? (
        <img
          alt={name}
          className={styles.portraitImage}
          src={portrait.publicPath}
          loading="lazy"
        />
      ) : (
        <span className={styles.portraitFallback}>
          {buildPersonInitials(name)}
        </span>
      )}
    </span>
  );
}

function formatNumber(
  value: number | null | undefined,
  i18n: WorldCupJournalistI18n,
): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  try {
    return new Intl.NumberFormat(i18n.locale).format(value);
  } catch {
    return String(value);
  }
}

function formatCompactNumber(
  value: number | null | undefined,
  i18n: WorldCupJournalistI18n,
): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  try {
    return new Intl.NumberFormat(i18n.locale, {
      notation: "compact",
      maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
    }).format(value);
  } catch {
    return formatNumber(value, i18n);
  }
}

function InstagramIcon() {
  return (
    <svg
      aria-hidden="true"
      className={styles.instagramIcon}
      viewBox="0 0 24 24"
      fill="none"
    >
      <rect
        x="3.25"
        y="3.25"
        width="17.5"
        height="17.5"
        rx="5.25"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle
        cx="12"
        cy="12"
        r="4.15"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="17.45" cy="6.55" r="1.15" fill="currentColor" />
    </svg>
  );
}

function InstagramLinkPill({
  profile,
  name,
  i18n,
  className,
}: {
  profile: JournalistPersonCard["socialProfiles"]["instagram"];
  name: string;
  i18n: WorldCupJournalistI18n;
  className?: string;
}) {
  if (!profile?.profileUrl) return null;
  const compactFollowers = formatCompactNumber(profile.followersCount, i18n);
  const fullFollowers = formatNumber(profile.followersCount, i18n);
  const pillLabel = compactFollowers || `@${profile.handle}`;
  const titleParts = [`${i18n.labels.instagram} · @${profile.handle}`];
  if (fullFollowers)
    titleParts.push(`${fullFollowers} ${i18n.labels.followers}`);

  return (
    <a
      href={profile.profileUrl}
      target="_blank"
      rel="noreferrer"
      className={`${styles.instagramPill} ${className || ""}`.trim()}
      title={titleParts.join(" · ")}
      aria-label={
        fullFollowers
          ? `${name} ${i18n.labels.instagram}, ${fullFollowers} ${i18n.labels.followers}`
          : `${name} ${i18n.labels.instagram}`
      }
    >
      <InstagramIcon />
      <span className={styles.instagramCount}>{pillLabel}</span>
    </a>
  );
}

function formatDate(
  value: string | null | undefined,
  i18n: WorldCupJournalistI18n,
): string {
  if (!value) return i18n.labels.unavailable;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(i18n.locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return value;
  }
}

function formatYearToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const match = value.match(/\b(\d{4})\b/);
    return match?.[1] || value;
  }
  return String(date.getUTCFullYear());
}

function formatCareerWindow(
  item: JournalistClubHistoryItem,
  copy: BackgroundCopy,
): string | null {
  const start = formatYearToken(item.startDate);
  const end = item.isCurrent ? copy.present : formatYearToken(item.endDate);
  if (start && end) return start + " - " + end;
  if (start) return start + " - " + copy.present;
  if (end) return end;
  return null;
}

function formatBackgroundMeasurement(
  value: number | null | undefined,
  unit: string,
  i18n: WorldCupJournalistI18n,
): string | null {
  const formatted = formatNumber(value, i18n);
  return formatted ? formatted + " " + unit : null;
}

function appendLeadFilterParams(
  params: URLSearchParams,
  filters?: Partial<LeadFilterState>,
) {
  if (filters?.leadType) params.set("leadType", filters.leadType);
  if (filters?.leadSource) params.set("leadSource", filters.leadSource);
}

function buildLeadFilterHref({
  teamSlug,
  language,
  selectedPersonId,
  filters,
  anchor = "lead-angles",
}: {
  teamSlug: string;
  language: WorldCupJournalistLanguage;
  selectedPersonId?: string | null;
  filters?: Partial<LeadFilterState>;
  anchor?: "lead-angles" | "person-detail" | "official-news-lane" | null;
}): string {
  const params = new URLSearchParams();
  params.set("team", teamSlug);
  params.set("lang", language);
  if (selectedPersonId) params.set("person", selectedPersonId);
  appendLeadFilterParams(params, filters);
  return anchor
    ? `/world-cup/?${params.toString()}#${anchor}`
    : `/world-cup/?${params.toString()}`;
}

function buildTeamHref(
  teamSlug: string,
  language: WorldCupJournalistLanguage,
  filters?: Partial<LeadFilterState>,
): string {
  return buildLeadFilterHref({
    teamSlug,
    language,
    filters,
    anchor: null,
  });
}

function buildPersonHref(
  teamSlug: string,
  personId: string,
  language: WorldCupJournalistLanguage,
  filters?: Partial<LeadFilterState>,
): string {
  return buildLeadFilterHref({
    teamSlug,
    language,
    selectedPersonId: personId,
    filters,
    anchor: "person-detail",
  });
}

function formatClaimTypeLabel(
  value: string,
  i18n: WorldCupJournalistI18n,
): string {
  return i18n.claimTypes[value] || humanizeToken(value);
}

function collectAliases(card: JournalistPersonCard): string[] {
  const displayName = resolveDisplayPersonName(
    card.displayName,
    card.canonicalName,
  ).toLocaleLowerCase("en-US");
  const seen = new Set<string>();
  const values = [
    ...card.aliases.accentless,
    ...card.aliases.all.map((item) => item.alias),
  ];

  const aliases: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    const formatted = formatPersonName(normalized);
    const key = formatted.toLocaleLowerCase("en-US");
    if (!formatted || key === displayName || seen.has(key)) continue;
    seen.add(key);
    aliases.push(formatted);
  }
  return aliases;
}

function buildPersonSubtitle(
  card: JournalistPersonCard,
  entry: PersonEntry,
): string {
  const parts = [entry.roleLabel];
  if (card.primaryNationality) parts.push(card.primaryNationality);
  if (entry.squadNumber != null) parts.push(`#${entry.squadNumber}`);
  return parts.join(" · ");
}

function normalizeResearchLookupValue(
  value: string | null | undefined,
): string {
  return normalizeWhitespace(formatPersonName(value || "")).toLocaleLowerCase(
    "en-US",
  );
}

function buildHumanInterestLookupKey(
  teamCanonicalName: string,
  personName: string | null | undefined,
): string {
  return `${normalizeResearchLookupValue(teamCanonicalName)}::${normalizeResearchLookupValue(personName)}`;
}

function resolveHumanInterestRecord(
  teamCanonicalName: string,
  card: JournalistPersonCard,
  recordByKey: Map<string, HumanInterestPilotRecord>,
): HumanInterestPilotRecord | null {
  const candidates = [
    card.canonicalName,
    card.displayName,
    ...card.aliases.accentless,
    ...card.aliases.all.map((item) => item.alias),
  ];

  for (const candidate of candidates) {
    const record = recordByKey.get(
      buildHumanInterestLookupKey(teamCanonicalName, candidate),
    );
    if (record) return record;
  }
  return null;
}

function buildHumanInterestSignal(
  record: HumanInterestPilotRecord | null | undefined,
): {
  value: number;
  featureAngleCount: number;
  contextCount: number;
} {
  if (!record) {
    return { value: 0, featureAngleCount: 0, contextCount: 0 };
  }

  const approvedFeatureAngles = (record.featureAngles || []).filter(
    (item) => item.reviewStatus !== "blocked",
  );
  const approvedContextItems = (record.publicPersonalContext || []).filter(
    (item) => item.reviewStatus !== "blocked",
  );

  let total = 0;
  for (const item of approvedFeatureAngles) {
    const featureWeight = Math.round((item.featureScore || 0) * 8);
    const sourceWeight = Math.round((item.sourceStrength || 0) * 4);
    const verificationBoost =
      item.verificationStatus === "verified"
        ? 2
        : item.verificationStatus === "well_sourced"
          ? 1
          : 0;
    total += 3 + featureWeight + sourceWeight + verificationBoost;
  }

  for (const item of approvedContextItems) {
    total += item.reviewStatus === "approved" ? 4 : 2;
  }

  if (record.priorityTier === "top20") total += 2;
  else if (record.priorityTier === "top50") total += 1;

  return {
    value: Math.min(SCORE_BREAKDOWN_LIMITS.humanInterest, total),
    featureAngleCount: approvedFeatureAngles.length,
    contextCount: approvedContextItems.length,
  };
}

function computeClubPrestigeBoost(
  currentClub: string | null | undefined,
): number {
  const normalized = normalizeText(currentClub)?.toLocaleLowerCase("en-US");
  if (!normalized) return 0;

  if (
    /(real madrid|barcelona|bayern|paris saint-germain|psg|manchester city|manchester united|liverpool|arsenal|chelsea|tottenham|juventus|inter milan|internazionale|ac milan|borussia dortmund|atletico madrid)/.test(
      normalized,
    )
  ) {
    return 14;
  }

  if (
    /(newcastle|aston villa|napoli|roma|monaco|marseille|lyon|feyenoord|ajax|psv|benfica|porto|sporting|celtic|rangers|slavia|eintracht frankfurt|bayer leverkusen|rb leipzig|real sociedad|athletic club|sevilla|valencia|west ham|wolverhampton|brighton|gent|genk|los angeles fc|stoke city|mainz|crvena zvezda|midtjylland|swansea city|ulsan|jeonbuk)/.test(
      normalized,
    )
  ) {
    return 8;
  }

  return 0;
}

function computeCareerPrestigeBoost(card: JournalistPersonCard): number {
  const currentClubBoost = computeClubPrestigeBoost(card.currentClub);
  const historyBoost = Math.max(
    0,
    ...(card.profile?.clubHistory || []).map((item) =>
      computeClubPrestigeBoost(item.club),
    ),
  );
  return Math.max(currentClubBoost, historyBoost);
}

function computeFollowerStarBoost(followers: number): number {
  if (!Number.isFinite(followers) || followers <= 0) return 0;

  const logBoost = Math.min(80, Math.round(Math.log10(followers + 10) * 10));
  const tierBoost =
    followers >= 100_000_000
      ? 30
      : followers >= 25_000_000
        ? 24
        : followers >= 10_000_000
          ? 18
          : followers >= 5_000_000
            ? 14
            : followers >= 1_000_000
              ? 10
              : followers >= 250_000
                ? 6
                : followers >= 50_000
                  ? 3
                  : 0;

  return logBoost + tierBoost;
}

function computeStarPowerScore(
  card: JournalistPersonCard,
  humanInterestRecord: HumanInterestPilotRecord | null | undefined,
): number {
  const followers = card.socialProfiles.instagram?.followersCount || 0;
  const followerBoost = computeFollowerStarBoost(followers);
  const humanInterestSignal = buildHumanInterestSignal(humanInterestRecord);
  const priorityBoost =
    humanInterestRecord?.priorityTier === "top20"
      ? 18
      : humanInterestRecord?.priorityTier === "top50"
        ? 10
        : 0;
  const handleBoost =
    followers === 0 && card.socialProfiles.instagram?.handle ? 3 : 0;
  const leadershipBoost = card.statusPanel.structured.captaincyStatus ? 8 : 0;
  const officialBoost = Math.min(10, card.officialAppearanceTimeline.length * 2);
  const reportedBoost = Math.min(8, countStorylinesByTheme(card, "reported") * 2);
  const clubBoost = computeCareerPrestigeBoost(card);

  return (
    followerBoost +
    priorityBoost +
    handleBoost +
    humanInterestSignal.value +
    leadershipBoost +
    officialBoost +
    reportedBoost +
    clubBoost
  );
}

function formatResearchHintPriority(
  value: HumanInterestPilotResearchNote["reviewPriority"],
  copy: ResearchHintCopy,
): string {
  return value === "high" ? copy.verifyFirst : copy.verifySoon;
}

function researchHintTone(
  value: HumanInterestPilotResearchNote["sourceTier"],
): Tone {
  if (value === "blocked") return "danger";
  if (value === "community_hint") return "warm";
  return "muted";
}

function shouldDisplayResearchNote(
  note: HumanInterestPilotResearchNote,
  language: WorldCupJournalistLanguage,
): boolean {
  if (note.sourceSystem === "namuwiki" && language !== "ko") return false;
  return true;
}

function buildCompactResearchHintText(
  hint: HumanInterestPilotResearchNote,
): string {
  const normalized = (normalizeText(hint.text) || hint.text)
    .replace(/^queue\s+/i, "")
    .replace(
      /,?\s*plus adjacent biography angles for verification\.?$/i,
      "",
    )
    .replace(/,?\s*for verification\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return compactText(normalized, 108) || normalized || hint.text;
}

function resolveResearchHintSourceLabel(
  hint: HumanInterestPilotResearchNote,
  copy: ResearchHintCopy,
): string {
  return (
    hint.sourceLabel ||
    (hint.sourceSystem ? humanizeToken(hint.sourceSystem) : copy.discoveryOnly)
  );
}

function humanInterestAngleSourceTone(sourceTier: string): Tone {
  if (sourceTier === "official") return "default";
  if (sourceTier === "self_disclosed") return "warm";
  if (sourceTier === "major_press") return "muted";
  if (sourceTier === "blocked") return "danger";
  return "muted";
}

function humanInterestAngleSensitivityTone(sensitivity: string): Tone {
  if (sensitivity === "high") return "danger";
  if (sensitivity === "medium") return "warm";
  return "muted";
}

function humanInterestAngleReviewTone(reviewStatus: string): Tone {
  if (reviewStatus === "blocked") return "danger";
  if (reviewStatus === "needs_review") return "warm";
  return "muted";
}

function collectPersonClaims(card: JournalistPersonCard): JournalistClaim[] {
  const orderedClaims = [
    card.statusPanel.currentStatus,
    card.statusPanel.latestSelectionStatus,
    card.statusPanel.latestInjuryStatus,
    card.statusPanel.latestReturnStatus,
    card.statusPanel.latestSuspensionStatus,
    card.statusPanel.latestCaptaincyStatus,
  ].filter(Boolean) as JournalistClaim[];

  const seen = new Set<string>();
  const claims: JournalistClaim[] = [];
  for (const claim of orderedClaims) {
    if (seen.has(claim.claimId)) continue;
    seen.add(claim.claimId);
    claims.push(claim);
  }
  return claims;
}

function formatAppearanceType(
  value: string,
  i18n: WorldCupJournalistI18n,
): string {
  return i18n.appearanceTypes[value] || value.replace(/_/g, " ");
}

function resolveAppearanceProvenanceType(
  item: JournalistAppearance,
  i18n: WorldCupJournalistI18n,
): string | null {
  return (
    capitalizeDisplayLabel(i18n.appearanceTypes[item.appearanceType]) ||
    humanizeToken(item.appearanceType)
  );
}

function resolveAppearanceProvenanceSource(
  item: JournalistAppearance,
): string | null {
  return (
    pickReadableSourceName(item.publisherName, item.outletName) ||
    formatHostSourceLabel(item.officialHost || item.url || item.source)
  );
}

function resolveStorylineProvenanceType(
  item: JournalistStoryline,
  i18n: WorldCupJournalistI18n,
): string | null {
  const storyType = item.storyType.toLowerCase();
  if (storyType.includes("interview")) return i18n.tags.officialInterview;
  if (storyType.includes("press")) return i18n.tags.pressConference;
  if (storyType.includes("official"))
    return capitalizeDisplayLabel(i18n.appearanceTypes.official_team_article);
  if (item.articles.length) return i18n.tags.article;
  return null;
}

function resolveStorylineProvenanceSource(
  item: JournalistStoryline,
): string | null {
  const representative =
    item.articles.find((article) => article.isRepresentative) ||
    item.articles[0] ||
    null;
  return (
    pickReadableSourceName(representative?.source) ||
    formatHostSourceLabel(item.sourceUrl || representative?.url)
  );
}

function buildLeadFilterOptions(
  leads: DeskLead[],
  field: "provenanceType" | "provenanceSource",
): LeadFilterOption[] {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const value = lead[field]?.trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.label.localeCompare(right.label, "en-US");
    });
}

function normalizeLeadFilterValue(
  value: string | null | undefined,
  options: LeadFilterOption[],
): string | null {
  if (!value) return null;
  return options.some((option) => option.value === value) ? value : null;
}

function rewriteLeadTitle(
  item: JournalistAppearance,
  lane: string,
  i18n: WorldCupJournalistI18n,
): string {
  const subjectNames = collectNameVariants(
    item.subjects.flatMap((subject) => [
      subject.displayName,
      subject.canonicalName,
    ]),
  );
  const originalTitle =
    normalizeText(item.title, subjectNames) || i18n.labels.officialSource;
  const rawTitle =
    stripOfficialSuffixes(normalizeText(item.title, subjectNames)) ||
    i18n.labels.officialSource;
  const sourceLabel = cleanSourceLabelCandidate(
    item.sourceLabel,
    item.teamCanonicalName,
  );
  const host = item.officialHost || "";

  if (/^【Match Report】/i.test(rawTitle) && sourceLabel) {
    return sourceLabel;
  }

  if (/Selected Players\/Staff/i.test(rawTitle)) {
    return i18n.templates.teamRosterAnnouncement(item.teamCanonicalName);
  }

  if (
    host.includes("englandfootball.com") &&
    /press conference$/i.test(rawTitle)
  ) {
    return rawTitle
      .replace(
        new RegExp(`^${escapeRegExp(item.teamCanonicalName)}\\s+`, "i"),
        "",
      )
      .trim();
  }

  if (sourceLabel && shouldPreferReadableEnglishFallback(rawTitle, i18n)) {
    return sourceLabel;
  }

  if (host.includes("cbf.com.br")) {
    if (
      (item.appearanceType === "press_conference" ||
        item.appearanceType === "official_interview") &&
      sourceLabel
    ) {
      return sourceLabel;
    }
    if (lane === "Roster lane" && sourceLabel && /call-up/i.test(sourceLabel)) {
      return i18n.templates.teamMarchCallUp(item.teamCanonicalName);
    }
  }

  if (
    sourceLabel &&
    (item.appearanceType === "press_conference" ||
      item.appearanceType === "official_interview") &&
    (rawTitle.length > 72 || rawTitle !== originalTitle)
  ) {
    return sourceLabel;
  }

  return rawTitle;
}

function rewriteLeadSummary(
  item: JournalistAppearance,
  lane: string,
  i18n: WorldCupJournalistI18n,
): string {
  const subjectNames = collectNameVariants(
    item.subjects.flatMap((subject) => [
      subject.displayName,
      subject.canonicalName,
    ]),
  );
  const rawTitle =
    stripOfficialSuffixes(normalizeText(item.title, subjectNames)) || "";
  const sourceLabel = cleanSourceLabelCandidate(
    item.sourceLabel,
    item.teamCanonicalName,
  );
  const host = item.officialHost || "";
  let summary = compactText(normalizeText(item.summary, subjectNames), 170);

  if (
    sourceLabel &&
    shouldPreferReadableEnglishFallback(summary || rawTitle, i18n)
  ) {
    if (lane === "Roster lane") {
      return i18n.copy.rosterConfirmation;
    }
    if (item.appearanceType === "press_conference") {
      return i18n.templates.officialPressConference(sourceLabel);
    }
    if (item.appearanceType === "official_interview") {
      return i18n.templates.officialInterview(sourceLabel);
    }
    return sourceLabel;
  }

  if (host.includes("jfa.jp")) {
    if (/^【Match Report】/i.test(rawTitle) && sourceLabel) {
      const afterTopic = sourceLabel.match(/\bafter\b\s+(.+)$/i)?.[1];
      if (afterTopic) {
        const needsWinSuffix =
          /(victory|beat|win)/i.test(rawTitle) &&
          !/\b(win|victory|beat)\b/i.test(afterTopic);
        return i18n.templates.officialReactionAfter(
          item.teamCanonicalName,
          afterTopic,
          needsWinSuffix,
        );
      }
    }
    if (/Selected Players\/Staff/i.test(rawTitle)) {
      return i18n.copy.rosterConfirmation;
    }
  }

  if (
    host.includes("englandfootball.com") &&
    item.appearanceType === "press_conference" &&
    /squad announcement/i.test(`${rawTitle} ${sourceLabel || ""}`.toLowerCase())
  ) {
    return i18n.copy.explainedSquadAnnouncement;
  }

  if (host.includes("cbf.com.br")) {
    if (item.appearanceType === "press_conference") {
      return i18n.copy.preWorldCupPressConference;
    }
    if (item.appearanceType === "official_interview" && sourceLabel) {
      return i18n.templates.officialInterview(sourceLabel);
    }
    if (lane === "Roster lane") {
      return i18n.templates.officialCallUpBeforeFinalList(
        item.teamCanonicalName,
      );
    }
  }

  if (lane === "Roster lane" && (!summary || /^[0-9]+\s/.test(summary))) {
    return i18n.copy.rosterConfirmation;
  }

  if (!summary && sourceLabel) {
    if (item.appearanceType === "press_conference") {
      return i18n.templates.officialPressConference(sourceLabel);
    }
    if (item.appearanceType === "official_interview") {
      return i18n.templates.officialInterview(sourceLabel);
    }
  }

  return (
    summary || sourceLabel || formatAppearanceType(item.appearanceType, i18n)
  );
}

function deriveAppearanceLead(
  item: JournalistAppearance,
  i18n: WorldCupJournalistI18n,
): DeskLead {
  const haystack =
    `${item.title} ${item.summary || ""} ${item.sourceLabel || ""}`.toLowerCase();
  let lane = "Official lane";
  let tone: Tone = "muted";
  let note = i18n.notes.federationContext;

  if (
    /(roster|selected players|calls [0-9]+ players|current roster|member|squad named|squad announcement|call-up|convocad)/.test(
      haystack,
    )
  ) {
    lane = "Roster lane";
    tone = "warm";
    note = i18n.notes.rosterContext;
  } else if (
    /(beat|victory|qualified|book their place|secure|win)/.test(haystack)
  ) {
    lane = "Momentum lane";
    tone = "warm";
    note = i18n.notes.momentumContext;
  } else if (
    /(prepare|preview|ahead of|little details|top-10)/.test(haystack)
  ) {
    lane = "Preview lane";
    tone = "default";
    note = i18n.notes.previewContext;
  } else if (item.appearanceType === "press_conference") {
    lane = "Coach line";
    tone = "warm";
    note = i18n.notes.coachContext;
  } else if (item.appearanceType === "official_interview") {
    lane = "Quote lane";
    tone = "default";
    note = i18n.notes.quoteContext;
  }

  return {
    id: `appearance:${item.appearanceId}`,
    lane,
    tone,
    title: rewriteLeadTitle(item, lane, i18n),
    summary: rewriteLeadSummary(item, lane, i18n),
    note,
    href: item.url,
    detailHref: null,
    personId: null,
    tag: null,
    provenanceType: resolveAppearanceProvenanceType(item, i18n),
    provenanceSource: resolveAppearanceProvenanceSource(item),
    updatedAt: item.appearanceDate,
  };
}

function deriveStorylineLead(
  item: JournalistStoryline,
  i18n: WorldCupJournalistI18n,
): DeskLead {
  const subjectNames = collectNameVariants([
    item.subjectDisplayName,
    item.subjectCanonicalName,
  ]);
  return {
    id: `storyline:${item.storylineId}`,
    lane: "Storyline",
    tone: "warm",
    title: rewriteStorylineTitle(item, i18n),
    summary:
      rewriteStorylineSummary(item, i18n) ||
      compactText(normalizeText(item.topicSnippet, subjectNames), 170) ||
      i18n.copy.storylinesLinked,
    note: i18n.notes.storylineContext,
    href: item.sourceUrl || item.articles[0]?.url || null,
    detailHref: null,
    personId: null,
    tag: item.claimType
      ? formatClaimTypeLabel(item.claimType, i18n)
      : item.storyType
        ? humanizeToken(item.storyType)
        : null,
    provenanceType: resolveStorylineProvenanceType(item, i18n),
    provenanceSource: resolveStorylineProvenanceSource(item),
    updatedAt: item.lastSeenAt,
  };
}

function buildLeadDeck(
  team: JournalistTeamView,
  watchEntries: PersonEntry[],
  language: WorldCupJournalistLanguage,
  i18n: WorldCupJournalistI18n,
  filters: Partial<LeadFilterState>,
): DeskLead[] {
  const leads: DeskLead[] = [];

  const pushLead = (lead: DeskLead) => {
    if (
      leads.some((existingLead) =>
        areLikelyDuplicateExternalLeads(existingLead, lead),
      )
    )
      return;
    const key = `${lead.lane}:${lead.title}`;
    if (
      leads.some(
        (existingLead) => `${existingLead.lane}:${existingLead.title}` === key,
      )
    )
      return;
    leads.push(lead);
  };

  for (const person of watchEntries
    .filter((item) => item.category === "status")
    .slice(0, 3)) {
    pushLead({
      id: `person:${person.id}`,
      lane: person.lane,
      tone: person.laneTone,
      title: person.displayName,
      summary: person.statusLine,
      note: person.hook ?? person.statusLine,
      href: person.href,
      detailHref: buildPersonHref(team.team.slug, person.id, language, filters),
      personId: person.id,
      tag: person.roleLabel,
      provenanceType: null,
      provenanceSource: null,
      updatedAt: person.updatedAt,
    });
  }

  for (const storyline of team.storylineList) {
    pushLead(deriveStorylineLead(storyline, i18n));
  }

  for (const appearance of team.officialAppearanceTimeline) {
    pushLead(deriveAppearanceLead(appearance, i18n));
  }

  return leads;
}

function buildDeskTakeaway(
  team: JournalistTeamView,
  watchEntries: PersonEntry[],
  leadDeck: DeskLead[],
  i18n: WorldCupJournalistI18n,
): string {
  const coverageNotice = getCoverageNotice(team, i18n);
  const statusAlerts = watchEntries.filter(
    (item) => item.category === "status",
  ).length;
  const officialSignals = team.officialAppearanceTimeline.length;
  const storylineCount = team.storylineList.length;
  const seedCount = team.team.officialSource.appearanceSeeds.length;

  if (team.team.editorial.coverageStatus === "blocker" && coverageNotice) {
    return coverageNotice.title;
  }
  if (storylineCount > 0) {
    return i18n.summary.storylineTakeaway(storylineCount);
  }
  if (statusAlerts > 0) {
    return i18n.summary.statusTakeaway(statusAlerts);
  }
  if (officialSignals > 0) {
    return i18n.summary.officialTakeaway(officialSignals, seedCount);
  }
  if (leadDeck.length > 0) {
    return i18n.summary.leadTakeaway(leadDeck.length);
  }
  return i18n.summary.noCoverageTakeaway;
}

function renderSourceQuality(
  team: JournalistTeamView,
  i18n: WorldCupJournalistI18n,
): string {
  if (!team.team.officialSource.configured)
    return i18n.sourceQuality.noConfiguredOfficialSource;
  if (
    team.team.editorial.coverageStatus === "blocker" &&
    team.team.scopeTier === "secondary"
  ) {
    return i18n.sourceQuality.secondaryCoveragePending;
  }
  if (team.team.editorial.coverageStatus === "blocker")
    return i18n.sourceQuality.manualOrFallbackPath;
  if (
    team.team.editorial.manualOverrideActive ||
    team.team.editorial.coverageStatus === "needs_review"
  ) {
    return i18n.sourceQuality.manualOrFallbackPath;
  }
  if (!team.team.officialSource.enabled)
    return i18n.sourceQuality.manualOrFallbackPath;
  return i18n.sourceQuality.officialParserActive;
}

function LeadCard({
  item,
  active,
  onSelectPerson,
  i18n,
}: {
  item: DeskLead;
  active: boolean;
  onSelectPerson?: ((personId: string) => void) | null;
  i18n: WorldCupJournalistI18n;
}) {
  return (
    <article
      className={`${leadCardClass(item.tone)} ${active ? styles.leadCardActive : ""}`.trim()}
    >
      <div className={styles.leadTop}>
        <span className={badgeClass(item.tone)}>
          {renderLaneLabel(item.lane, i18n)}
        </span>
        {item.updatedAt ? (
          <span className={styles.leadTime}>
            {formatDateTime(item.updatedAt, i18n)}
          </span>
        ) : null}
      </div>
      <h3 className={styles.leadTitle}>
        {item.personId && onSelectPerson ? (
          <button
            type="button"
            onClick={() => onSelectPerson(item.personId!)}
            className={`${styles.personButton} ${styles.personLink} ${active ? styles.personLinkActive : ""}`.trim()}
          >
            {item.title}
          </button>
        ) : item.detailHref ? (
          <Link
            href={item.detailHref}
            className={`${styles.personLink} ${active ? styles.personLinkActive : ""}`.trim()}
          >
            {item.title}
          </Link>
        ) : (
          item.title
        )}
      </h3>
      <p className={styles.leadSummary}>{item.summary}</p>
      {item.provenanceType || item.provenanceSource ? (
        <div className={styles.leadProvenance}>
          {item.provenanceType ? <span>{item.provenanceType}</span> : null}
          {item.provenanceSource ? <span>{item.provenanceSource}</span> : null}
        </div>
      ) : null}
      <p className={styles.leadNote}>{item.note}</p>
      <div className={styles.leadMeta}>
        {item.tag ? <span>{item.tag}</span> : null}
        {item.personId && onSelectPerson ? (
          <button
            type="button"
            onClick={() => onSelectPerson(item.personId!)}
            className={styles.personButton}
          >
            {i18n.actions.openDossier}
          </button>
        ) : item.detailHref ? (
          <Link href={item.detailHref}>{i18n.actions.openDossier}</Link>
        ) : null}
        {item.href ? (
          <a href={item.href} target="_blank" rel="noreferrer">
            {i18n.actions.openSource}
          </a>
        ) : null}
      </div>
    </article>
  );
}

function TeamCrest({ teamVisual }: { teamVisual: TeamVisualProfile }) {
  const logoSignature = teamVisual.logoUrls.join("|");
  const [logoIndex, setLogoIndex] = useState(
    teamVisual.logoUrls.length ? 0 : -1,
  );

  useEffect(() => {
    setLogoIndex(teamVisual.logoUrls.length ? 0 : -1);
  }, [logoSignature, teamVisual.logoUrls.length]);

  const activeLogo = logoIndex >= 0 ? teamVisual.logoUrls[logoIndex] : null;

  return (
    <span className={styles.teamCrest} title={teamVisual.crestLabel}>
      <span className={styles.teamCrestImageFrame}>
        {activeLogo ? (
          <img
            alt={teamVisual.crestLabel}
            className={styles.teamCrestImage}
            src={activeLogo}
            loading="lazy"
            onError={() =>
              setLogoIndex((current) =>
                current + 1 < teamVisual.logoUrls.length ? current + 1 : -1,
              )
            }
          />
        ) : (
          <span className={styles.teamCrestFlag}>
            {teamVisual.flagEmoji || teamVisual.crestShort}
          </span>
        )}
      </span>
      <span className={styles.teamCrestLabel}>{teamVisual.crestShort}</span>
    </span>
  );
}

function ScoreBreakdownRail({
  items,
  variant = "compact",
  maxItems,
}: {
  items: ScoreBreakdownItem[];
  variant?: "compact" | "detail";
  maxItems?: number;
}) {
  const visibleItems = maxItems ? items.slice(0, maxItems) : items;
  if (!visibleItems.length) return null;
  const totalValue = visibleItems.reduce((sum, item) => sum + item.value, 0);

  return (
    <div
      className={`${styles.scoreBreakdownRail} ${variant === "detail" ? styles.scoreBreakdownRailDetail : styles.scoreBreakdownRailCompact}`}
    >
      {visibleItems.length > 1 ? (
        <div className={styles.scoreBreakdownStack} aria-hidden="true">
          {visibleItems.map((item) => {
            const segmentClass =
              item.tone === "danger"
                ? styles.scoreBreakdownSegmentDanger
                : item.tone === "warm"
                  ? styles.scoreBreakdownSegmentWarm
                  : item.tone === "muted"
                    ? styles.scoreBreakdownSegmentMuted
                    : "";
            const width = `${Math.max(10, Math.round((item.value / totalValue) * 100))}%`;
            return (
              <span
                className={`${styles.scoreBreakdownSegment} ${segmentClass}`.trim()}
                key={`stack:${item.key}:${item.value}`}
                style={{ width }}
                title={formatScoreBreakdownTooltip(item)}
              />
            );
          })}
        </div>
      ) : null}
      {visibleItems.map((item) => {
        const toneClass =
          item.tone === "danger"
            ? styles.scoreBreakdownMetricDanger
            : item.tone === "warm"
              ? styles.scoreBreakdownMetricWarm
              : item.tone === "muted"
                ? styles.scoreBreakdownMetricMuted
                : "";
        const fillWidth = `${Math.max(12, Math.round((item.value / item.maxValue) * 100))}%`;

        return (
          <div
            className={`${styles.scoreBreakdownMetric} ${toneClass}`.trim()}
            key={`${item.key}:${item.value}`}
            title={
              variant === "compact"
                ? formatScoreBreakdownTooltip(item)
                : undefined
            }
          >
            <div className={styles.scoreBreakdownMetricTop}>
              <span className={styles.scoreBreakdownMetricLabel}>
                {item.label}
              </span>
              <strong className={styles.scoreBreakdownMetricValue}>
                {item.value}
              </strong>
            </div>
            <span className={styles.scoreBreakdownBar}>
              <span
                className={styles.scoreBreakdownBarFill}
                style={{ width: fillWidth }}
              />
            </span>
            {variant === "detail" ? (
              <span className={styles.scoreBreakdownMetricDetail}>
                {item.detail}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function NarrativeRow({
  item,
  tag,
  i18n,
}: {
  item: DeskLead;
  tag?: string | null;
  i18n: WorldCupJournalistI18n;
}) {
  return (
    <article className={styles.detailItem}>
      <div className={styles.detailItemTop}>
        <strong className={styles.detailItemTitle}>{item.title}</strong>
        <span className={styles.detailItemMeta}>
          {item.updatedAt
            ? formatDateTime(item.updatedAt, i18n)
            : i18n.labels.unavailable}
        </span>
      </div>
      <p className={styles.detailBodyText}>{compactText(item.summary, 160)}</p>
      <div className={styles.detailInlineMeta}>
        {tag || item.tag ? <span>{tag || item.tag}</span> : null}
        {item.href ? (
          <a href={item.href} target="_blank" rel="noreferrer">
            {i18n.actions.openSource}
          </a>
        ) : null}
      </div>
    </article>
  );
}

function PlayerMatrixTile({
  card,
  item,
  isSelected,
  atlasCopy,
  language,
  onSelectPerson,
}: {
  card: JournalistPersonCard;
  item: PersonEntry;
  isSelected: boolean;
  atlasCopy: CardAtlasCopy;
  language: WorldCupJournalistLanguage;
  onSelectPerson: (personId: string) => void;
}) {
  const officialCount = card.officialAppearanceTimeline.length;
  const reportedCount = countStorylinesByTheme(card, "reported");
  const riskCount =
    countStorylinesByTheme(card, "rumor") +
    countStorylinesByTheme(card, "controversy");
  const researchHintCopy = LOCALIZED_RESEARCH_HINT_COPY[language];
  const primaryResearchHint = item.researchNotes[0] || null;
  const compactResearchHint = primaryResearchHint
    ? buildCompactResearchHintText(primaryResearchHint)
    : null;
  const researchSourceLabel = primaryResearchHint
    ? resolveResearchHintSourceLabel(primaryResearchHint, researchHintCopy)
    : null;
  const extraResearchHintCount = Math.max(0, item.researchNotes.length - 1);
  const positionVisual = buildPositionVisual(card);
  const subtitle =
    compactText(buildCardSubtitle(card, item, atlasCopy), 36) || item.roleLabel;
  const signalTotal = officialCount + reportedCount + riskCount;
  const noSignalLabel = language === "ko" ? "기사거리 대기" : "No active angle";

  return (
    <button
      type="button"
      className={`${styles.rosterTile} ${isSelected ? styles.rosterTileActive : ""}`.trim()}
      onClick={() => onSelectPerson(item.id)}
    >
      <div className={styles.rosterTileTop}>
        <PortraitThumb
          portrait={item.portrait}
          name={item.displayName}
          size="sm"
          className={styles.rosterTilePortrait}
        />
        <div className={styles.rosterTileIdentity}>
          <div className={styles.rosterTileBadgeRail}>
            {item.squadNumber != null ? (
              <span className={styles.numberBadge}>#{item.squadNumber}</span>
            ) : null}
            <span className={styles.positionChip}>{positionVisual.label}</span>
          </div>
          <div className={styles.rosterTileNameRow}>
            <strong className={styles.rosterTileName}>
              {item.displayName}
            </strong>
          </div>
          <span className={styles.rosterTileRole}>{subtitle}</span>
        </div>
      </div>

      {primaryResearchHint && compactResearchHint ? (
        <div className={styles.rosterTileHintStrip}>
          <div className={styles.rosterTileHintMeta}>
            {primaryResearchHint.reviewPriority ? (
              <span
                className={[
                  styles.rosterTileHintPriority,
                  primaryResearchHint.reviewPriority === "high"
                    ? styles.rosterTileHintPriorityHigh
                    : styles.rosterTileHintPriorityDefault,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {formatResearchHintPriority(
                  primaryResearchHint.reviewPriority,
                  researchHintCopy,
                )}
              </span>
            ) : null}
            {researchSourceLabel ? (
              <span className={styles.rosterTileHintSource}>
                {researchSourceLabel}
              </span>
            ) : null}
            {extraResearchHintCount > 0 ? (
              <span className={styles.rosterTileHintCount}>
                +{extraResearchHintCount}
              </span>
            ) : null}
          </div>
          <p className={styles.rosterTileHintText}>{compactResearchHint}</p>
        </div>
      ) : null}

      <div className={styles.rosterTileSignalRail}>
        {officialCount > 0 ? (
          <span className={styles.rosterTileSignal}>
            {atlasCopy.official} {officialCount}
          </span>
        ) : null}
        {reportedCount > 0 ? (
          <span className={styles.rosterTileSignal}>
            {atlasCopy.reported} {reportedCount}
          </span>
        ) : null}
        {riskCount > 0 ? (
          <span
            className={`${styles.rosterTileSignal} ${styles.rosterTileSignalDanger}`.trim()}
          >
            {atlasCopy.risk} {riskCount}
          </span>
        ) : null}
        {signalTotal === 0 ? (
          <span
            className={`${styles.rosterTileSignal} ${styles.rosterTileSignalMuted}`.trim()}
          >
            {noSignalLabel}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function SquadCard({
  card,
  item,
  teamSlug,
  isSelected,
  language,
  filters,
  i18n,
  atlasCopy,
  teamVisual,
  onSelectPerson,
  variant = "default",
}: {
  card: JournalistPersonCard;
  item: PersonEntry;
  teamSlug: string;
  isSelected: boolean;
  language: WorldCupJournalistLanguage;
  filters: Partial<LeadFilterState>;
  i18n: WorldCupJournalistI18n;
  atlasCopy: CardAtlasCopy;
  teamVisual: TeamVisualProfile;
  onSelectPerson?: ((personId: string) => void) | null;
  variant?: "default" | "spotlight";
}) {
  const officialCount = card.officialAppearanceTimeline.length;
  const reportedCount = countStorylinesByTheme(card, "reported");
  const riskCount =
    countStorylinesByTheme(card, "rumor") +
    countStorylinesByTheme(card, "controversy");
  const heatScore = buildDisplayHeatScore(item.signalScore);
  const isSpotlight = variant === "spotlight";
  const positionVisual = buildPositionVisual(card);
  const rarity = buildCardRarity(heatScore);
  const cardStyle = buildCardStyle(teamVisual, positionVisual, rarity);
  const dossierTone: Tone = item.laneTone === "muted" ? "default" : item.laneTone;
  const handleCardSelect = () => onSelectPerson?.(item.id);
  const compactLead =
    compactText(item.hook || item.statusLine, isSpotlight ? 92 : 72) ||
    item.statusLine;
  const compactClub = compactText(card.currentClub, 24);

  return (
    <article
      className={[
        styles.squadCard,
        isSpotlight ? styles.squadCardSpotlight : "",
        !item.isPlayer ? styles.squadCardStaff : "",
        isSelected ? styles.squadCardActive : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={cardStyle}
      role="button"
      tabIndex={0}
      onClick={handleCardSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleCardSelect();
        }
      }}
    >
      <div className={styles.squadCardTop}>
        <div className={styles.squadCardIdentity}>
          <PortraitThumb
            portrait={item.portrait}
            name={item.displayName}
            size={isSpotlight ? "lg" : "md"}
            className={styles.squadPortrait}
          />
          <div className={styles.squadCardCopy}>
            <div className={styles.squadCardBadges}>
              <span className={styles.positionChip}>
                {positionVisual.label}
              </span>
              <span className={badgeClass(item.laneTone)}>
                {renderLaneLabel(item.lane, i18n)}
              </span>
              {item.badges.slice(0, isSpotlight ? 4 : 2).map((badge) => (
                <span
                  className={badgeClass(badge.tone)}
                  key={`${item.id}:${badge.label}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
            <h3 className={styles.squadCardTitle}>
              <PersonNameLink
                teamSlug={teamSlug}
                personId={item.id}
                label={item.displayName}
                active={isSelected}
                language={language}
                filters={filters}
                onSelect={onSelectPerson}
              />
            </h3>
            <p className={styles.squadCardSubtitle}>
              {buildCardSubtitle(card, item, atlasCopy)}
            </p>
          </div>
        </div>
        <div className={styles.squadCardCorner}>
          <span className={styles.rarityChip}>
            {formatCardRarity(rarity, language)}
          </span>
          <TeamCrest teamVisual={teamVisual} />
        </div>
      </div>

      <p className={styles.squadCardHook}>{compactLead}</p>
      <div className={styles.squadCardStatRail}>
        {compactClub ? (
          <span className={styles.squadCardStatChip}>
            <span>{atlasCopy.club}</span>
            <strong>{compactClub}</strong>
          </span>
        ) : null}
        <span className={styles.squadCardStatChip}>
          <span>{atlasCopy.official}</span>
          <strong>{officialCount}</strong>
        </span>
        <span className={styles.squadCardStatChip}>
          <span>{atlasCopy.reported}</span>
          <strong>{reportedCount}</strong>
        </span>
        <span className={styles.squadCardStatChip}>
          <span>{atlasCopy.risk}</span>
          <strong>{riskCount}</strong>
        </span>
      </div>

      <div className={styles.squadCardActions}>
        <div className={styles.squadCardMeta}>
          {item.instagram ? (
            <InstagramLinkPill
              profile={item.instagram}
              name={item.displayName}
              i18n={i18n}
              className={styles.instagramPillCompact}
            />
          ) : null}
          {item.squadNumber != null ? (
            <span className={styles.numberBadge}>#{item.squadNumber}</span>
          ) : null}
        </div>
        <div className={styles.squadCardLinks}>
          {item.updatedAt ? (
            <span>{formatDateTime(item.updatedAt, i18n)}</span>
          ) : null}
          <span className={badgeClass(dossierTone)}>
            {i18n.actions.openDossier}
          </span>
        </div>
      </div>
    </article>
  );
}

function PersonNameLink({
  teamSlug,
  personId,
  label,
  active,
  language,
  filters,
  className,
  onSelect,
}: {
  teamSlug: string;
  personId: string;
  label: string;
  active: boolean;
  language: WorldCupJournalistLanguage;
  filters?: Partial<LeadFilterState>;
  className?: string;
  onSelect?: ((personId: string) => void) | null;
}) {
  if (onSelect) {
    return (
      <button
        type="button"
        onClick={() => onSelect(personId)}
        className={`${styles.personButton} ${styles.personLink} ${active ? styles.personLinkActive : ""} ${className || ""}`.trim()}
      >
        {label}
      </button>
    );
  }

  return (
    <Link
      href={buildPersonHref(teamSlug, personId, language, filters)}
      className={`${styles.personLink} ${active ? styles.personLinkActive : ""} ${className || ""}`.trim()}
    >
      {label}
    </Link>
  );
}

function ClaimRow({
  claim,
  canonicalName,
  i18n,
}: {
  claim: JournalistClaim;
  canonicalName: string;
  i18n: WorldCupJournalistI18n;
}) {
  const claimText =
    compactText(normalizeText(claim.claimText, canonicalName), 140) ||
    claim.claimText;
  const sourceLabel =
    normalizeText(claim.sourceLabel || claim.source, canonicalName) ||
    i18n.labels.sourceLabel;

  return (
    <article className={styles.detailItem}>
      <div className={styles.detailItemTop}>
        <strong className={styles.detailItemTitle}>
          {formatClaimTypeLabel(claim.claimType, i18n)}
        </strong>
        <span className={styles.detailItemMeta}>
          {formatDateTime(claim.effectiveAt, i18n)}
        </span>
      </div>
      <p className={styles.detailBodyText}>{claimText}</p>
      <div className={styles.detailInlineMeta}>
        <span>{sourceLabel}</span>
        {claim.sourceUrl ? (
          <a href={claim.sourceUrl} target="_blank" rel="noreferrer">
            {i18n.actions.openSource}
          </a>
        ) : null}
      </div>
    </article>
  );
}

function ResearchHintRow({
  hint,
  copy,
}: {
  hint: HumanInterestPilotResearchNote;
  copy: ResearchHintCopy;
}) {
  const claimTypes = (hint.hintedClaimTypes || [])
    .map((item) => humanizeToken(item))
    .join(" · ");
  const sourceLabel =
    hint.sourceLabel ||
    (hint.sourceSystem ? humanizeToken(hint.sourceSystem) : copy.discoveryOnly);
  const compactHintText = compactText(hint.text, 110) || hint.text;
  const compactHintNotes = compactText(hint.notes || copy.note, 120);

  return (
    <article className={styles.detailItem}>
      <div className={styles.detailItemTop}>
        <strong className={styles.detailItemTitle}>{compactHintText}</strong>
        <span className={styles.detailItemMeta}>{sourceLabel}</span>
      </div>
      <div className={styles.detailInlineMeta}>
        {hint.sourceTier ? (
          <span className={badgeClass(researchHintTone(hint.sourceTier))}>
            {humanizeToken(hint.sourceTier)}
          </span>
        ) : null}
        {hint.sourceSystem ? (
          <span className={badgeClass("muted")}>
            {humanizeToken(hint.sourceSystem)}
          </span>
        ) : null}
        {hint.reviewPriority ? (
          <span
            className={badgeClass(
              hint.reviewPriority === "high" ? "warm" : "muted",
            )}
          >
            {formatResearchHintPriority(hint.reviewPriority, copy)}
          </span>
        ) : null}
      </div>
      {claimTypes ? (
        <p className={styles.detailBodyText}>
          {copy.claimTypes}: {claimTypes}
        </p>
      ) : null}
      {compactHintNotes ? (
        <p className={styles.detailBodyText}>{compactHintNotes}</p>
      ) : null}
      <div className={styles.detailInlineMeta}>
        <span>{copy.discoveryOnly}</span>
        {hint.evidenceUrl ? (
          <a href={hint.evidenceUrl} target="_blank" rel="noreferrer">
            {copy.openHint}
          </a>
        ) : null}
      </div>
    </article>
  );
}

function HumanInterestAngleRow({
  item,
  copy,
  i18n,
}: {
  item: HumanInterestAngleItem;
  copy: HumanInterestAngleCopy;
  i18n: WorldCupJournalistI18n;
}) {
  const sourceLabel = item.sourceLabel || i18n.labels.unavailable;
  const bodyText =
    ("claimText" in item ? item.claimText : null) || item.summary || item.headline;
  const compactBodyText = compactText(bodyText, 180) || bodyText;
  const compactSummary =
    item.summary && "claimText" in item && item.summary !== item.claimText
      ? compactText(item.summary, 120)
      : null;

  return (
    <article className={styles.detailItem}>
      <div className={styles.detailItemTop}>
        <strong className={styles.detailItemTitle}>{item.headline}</strong>
        <span className={styles.detailItemMeta}>{sourceLabel}</span>
      </div>
      <div className={styles.detailInlineMeta}>
        <span className={badgeClass(item.angleSource === "feature" ? "default" : "muted")}>
          {item.angleSource === "feature" ? copy.featureAngle : copy.publicContext}
        </span>
        <span className={badgeClass(humanInterestAngleSourceTone(item.sourceTier))}>
          {humanizeToken(item.sourceTier)}
        </span>
        <span className={badgeClass(humanInterestAngleSensitivityTone(item.sensitivity))}>
          {copy.sensitivity}: {humanizeToken(item.sensitivity)}
        </span>
        {"verificationStatus" in item ? (
          <span className={badgeClass("muted")}>
            {copy.verification}: {humanizeToken(item.verificationStatus)}
          </span>
        ) : null}
        <span className={badgeClass(humanInterestAngleReviewTone(item.reviewStatus))}>
          {copy.review}: {humanizeToken(item.reviewStatus)}
        </span>
      </div>
      <p className={styles.detailBodyText}>{compactBodyText}</p>
      {compactSummary ? (
        <p className={styles.detailBodyText}>{compactSummary}</p>
      ) : null}
      <div className={styles.detailInlineMeta}>
        <span>{formatClaimTypeLabel(item.claimType, i18n)}</span>
        {item.sourceUrl ? (
          <a href={item.sourceUrl} target="_blank" rel="noreferrer">
            {copy.openSource}
          </a>
        ) : null}
      </div>
    </article>
  );
}

function PersonDetailPanel({
  teamSlug,
  card,
  entry,
  previousEntry,
  nextEntry,
  selectedIndex,
  totalCount,
  language,
  filters,
  teamVisual,
  onSelectPerson,
  onClearSelection,
  i18n,
  humanInterestAngles,
  researchNotes,
}: {
  teamSlug: string;
  card: JournalistPersonCard;
  entry: PersonEntry;
  previousEntry: PersonEntry | null;
  nextEntry: PersonEntry | null;
  selectedIndex: number;
  totalCount: number;
  language: WorldCupJournalistLanguage;
  filters: Partial<LeadFilterState>;
  teamVisual: TeamVisualProfile;
  onSelectPerson: (personId: string) => void;
  onClearSelection: () => void;
  i18n: WorldCupJournalistI18n;
  humanInterestAngles: HumanInterestAngleItem[];
  researchNotes: HumanInterestPilotResearchNote[];
}) {
  const atlasCopy = LOCALIZED_CARD_ATLAS_COPY[i18n.code];
  const humanInterestAngleCopy = LOCALIZED_HUMAN_INTEREST_ANGLE_COPY[i18n.code];
  const researchHintCopy = LOCALIZED_RESEARCH_HINT_COPY[i18n.code];
  const backgroundCopy = LOCALIZED_BACKGROUND_COPY[i18n.code];
  const positionVisual = buildPositionVisual(card);
  const aliases = collectAliases(card);
  const claims = collectPersonClaims(card);
  const reportedNarratives = buildStorylineLeadsByTheme(card, "reported", i18n);
  const controversyNarratives = buildStorylineLeadsByTheme(
    card,
    "controversy",
    i18n,
  );
  const rumorNarratives = buildStorylineLeadsByTheme(card, "rumor", i18n);
  const riskNarratives = [...controversyNarratives, ...rumorNarratives].slice(
    0,
    4,
  );
  const appearanceLeads = card.officialAppearanceTimeline
    .slice(0, 4)
    .map((item) => deriveAppearanceLead(item, i18n));
  const freshnessFacts = buildPersonFreshnessMetrics(card, i18n);
  const bio = buildProfileSnapshotText(card);
  const primarySourceHref = entry.href || card.profile?.sourceUrl || null;
  const instagramProfile = card.socialProfiles.instagram;
  const heatScore = buildDisplayHeatScore(entry.signalScore);
  const rarity = buildCardRarity(heatScore);
  const detailCardStyle = buildCardStyle(teamVisual, positionVisual, rarity);
  const profileSourceLabel = normalizeText(
    card.profile?.sourceLabel || card.profile?.source,
    card.canonicalName,
  );
  const backgroundFacts = [
    card.profile?.birthPlace
      ? {
          label: backgroundCopy.birthPlace,
          value: normalizeText(card.profile.birthPlace, card.canonicalName),
        }
      : null,
    card.profile?.hometown
      ? {
          label: backgroundCopy.hometown,
          value: normalizeText(card.profile.hometown, card.canonicalName),
        }
      : null,
    card.profile?.residenceCountry
      ? {
          label: backgroundCopy.residenceCountry,
          value: normalizeText(card.profile.residenceCountry, card.canonicalName),
        }
      : null,
    card.profile?.education.length
      ? {
          label: backgroundCopy.education,
          value: card.profile.education.join(" · "),
        }
      : null,
    card.profile?.youthClubs.length
      ? {
          label: backgroundCopy.youthClubs,
          value: card.profile.youthClubs.join(" · "),
        }
      : null,
    card.profile?.heightCm
      ? {
          label: backgroundCopy.height,
          value: formatBackgroundMeasurement(card.profile.heightCm, "cm", i18n),
        }
      : null,
    card.profile?.weightKg
      ? {
          label: backgroundCopy.weight,
          value: formatBackgroundMeasurement(card.profile.weightKg, "kg", i18n),
        }
      : null,
    card.profile?.footedness
      ? {
          label: backgroundCopy.footedness,
          value: humanizeToken(card.profile.footedness),
        }
      : null,
    card.profile?.handedness
      ? {
          label: backgroundCopy.handedness,
          value: humanizeToken(card.profile.handedness),
        }
      : null,
  ].filter((item): item is { label: string; value: string } =>
    Boolean(item?.value),
  );
  const backgroundClubHistory = (card.profile?.clubHistory || []).slice(0, 8);
  const compactBackgroundFacts = backgroundFacts.slice(0, 4);
  const compactBackgroundClubHistory = backgroundClubHistory.slice(0, 2);
  const compactClaims = claims.slice(0, 2);
  const compactHumanInterestAngles = humanInterestAngles.slice(0, 2);
  const compactResearchNotes = researchNotes.slice(0, 2);
  const compactReportedNarratives = reportedNarratives.slice(0, 2);
  const compactRiskNarratives = riskNarratives.slice(0, 1);
  const compactAppearanceLeads = appearanceLeads.slice(0, 1);
  const backgroundSourceLabel = normalizeText(
    card.profile?.biographySourceLabel,
    card.canonicalName,
  );
  const backgroundSourceUrl = card.profile?.biographySourceUrl || null;
  const reportedCount = countStorylinesByTheme(card, "reported");
  const riskCount =
    countStorylinesByTheme(card, "rumor") +
    countStorylinesByTheme(card, "controversy");
  const detailSubtitle = [
    entry.roleLabel,
    card.currentClub || card.primaryNationality,
  ]
    .filter(Boolean)
    .join(" · ");
  const detailNarrative =
    [bio, entry.evidence].find(
      (value) =>
        Boolean(value) && value !== entry.hook && value !== entry.statusLine,
    ) || null;
  const compactDetailNarrative = compactText(detailNarrative, 120);
  const detailFacts = [
    {
      label: i18n.labels.status,
      value: entry.statusLine,
    },
    card.currentClub
      ? {
          label: atlasCopy.club,
          value: card.currentClub,
        }
      : null,
    card.primaryNationality
      ? {
          label: i18n.labels.nationality,
          value: card.primaryNationality,
        }
      : null,
    card.birthDate
      ? {
          label: i18n.labels.birthDate,
          value: formatDate(card.birthDate, i18n),
        }
      : null,
    card.storylineList.length || card.officialAppearanceTimeline.length
      ? {
          label: i18n.labels.signalsLinked,
          value: i18n.templates.signalLinked(
            card.storylineList.length,
            card.officialAppearanceTimeline.length,
          ),
        }
      : null,
    reportedCount
      ? {
          label: atlasCopy.reported,
          value: String(reportedCount),
        }
      : null,
    riskCount
      ? {
          label: atlasCopy.risk,
          value: String(riskCount),
        }
      : null,
    ...freshnessFacts
      .filter((metric) => metric.state !== "unknown")
      .map((metric) => ({
        label: metric.label,
        value: formatFreshnessSummary(metric, i18n),
      })),
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return (
    <section
      className={`${styles.sectionBlock} ${styles.detailSection}`}
      id="person-detail"
      style={detailCardStyle}
    >
      <div className={styles.blockHead}>
        <div>
          <span className={styles.kicker}>{i18n.labels.personDossier}</span>
          <h2 className={styles.blockTitle}>{entry.displayName}</h2>
        </div>
        <div className={styles.detailActions}>
          <InstagramLinkPill
            profile={instagramProfile}
            name={entry.displayName}
            i18n={i18n}
          />
          {primarySourceHref ? (
            <a
              href={primarySourceHref}
              target="_blank"
              rel="noreferrer"
              className={styles.detailActionLink}
            >
              {i18n.actions.openPrimarySource}
            </a>
          ) : null}
          <button
            type="button"
            onClick={onClearSelection}
            className={styles.detailActionButton}
          >
            {i18n.actions.clearDetail}
          </button>
        </div>
      </div>

      <div className={styles.detailHero}>
        <div className={styles.detailIdentity}>
          <div className={styles.detailIdentityTop}>
            <PortraitThumb
              portrait={entry.portrait}
              name={entry.displayName}
              size="lg"
              className={styles.squadPortrait}
            />
            <div className={styles.detailIdentityCopy}>
              <div className={styles.detailLabels}>
                <span className={styles.positionChip}>
                  {positionVisual.label}
                </span>
                {entry.category !== "none" ? (
                  <span className={badgeClass(entry.laneTone)}>
                    {renderLaneLabel(entry.lane, i18n)}
                  </span>
                ) : null}
              </div>
              <p className={styles.detailSubtitle}>{detailSubtitle}</p>
            </div>
          </div>
          {entry.hook ? (
            <p className={styles.detailHook}>{entry.hook}</p>
          ) : null}
          {compactDetailNarrative ? (
            <p className={styles.detailBodyText}>{compactDetailNarrative}</p>
          ) : null}
          {profileSourceLabel ? (
            <div className={styles.detailInlineMeta}>
              <span>{atlasCopy.profileSource}</span>
              <span>{profileSourceLabel}</span>
            </div>
          ) : null}
          {aliases.length ? (
            <div className={styles.aliasRail}>
              {aliases.slice(0, 5).map((alias) => (
                <span
                  className={badgeClass("muted")}
                  key={`alias:${entry.id}:${alias}`}
                >
                  {alias}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className={styles.detailFactGrid}>
          {detailFacts.map((fact) => (
            <div
              className={styles.detailFactCard}
              key={`${card.sportsPersonId}:${fact.label}`}
            >
              <span className={styles.factLabel}>{fact.label}</span>
              <strong className={styles.factValue}>{fact.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.detailPager}>
        {previousEntry ? (
          <button
            type="button"
            onClick={() => onSelectPerson(previousEntry.id)}
            className={styles.detailActionButton}
          >
            {i18n.actions.previous}: {previousEntry.displayName}
          </button>
        ) : (
          <span className={styles.detailPagerHint}>
            {i18n.actions.previous}: {i18n.labels.unavailable}
          </span>
        )}
        <span className={styles.detailPagerHint}>
          {i18n.templates.teamOrder(selectedIndex + 1, totalCount)}
        </span>
        {nextEntry ? (
          <button
            type="button"
            onClick={() => onSelectPerson(nextEntry.id)}
            className={styles.detailActionButton}
          >
            {i18n.actions.next}: {nextEntry.displayName}
          </button>
        ) : (
          <span className={styles.detailPagerHint}>
            {i18n.actions.next}: {i18n.labels.unavailable}
          </span>
        )}
      </div>

      <div className={styles.detailGrid}>
        <section className={styles.detailCard}>
          <span className={styles.kicker}>{backgroundCopy.kicker}</span>
          <h3 className={styles.detailCardTitle}>{backgroundCopy.title}</h3>
          {compactBackgroundFacts.length || compactBackgroundClubHistory.length ? (
            <>
              {compactBackgroundFacts.length ? (
                <div className={styles.detailFactGrid}>
                  {compactBackgroundFacts.map((fact) => (
                    <div
                      className={styles.detailFactCard}
                      key={card.sportsPersonId + ":background:" + fact.label}
                    >
                      <span className={styles.factLabel}>{fact.label}</span>
                      <strong className={styles.factValue}>{fact.value}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
              {compactBackgroundClubHistory.length ? (
                <div className={styles.detailList}>
                  {compactBackgroundClubHistory.map((item, index) => (
                    <article
                      className={styles.detailItem}
                      key={card.sportsPersonId + ":club-history:" + item.club + ":" + String(index)}
                    >
                      <div className={styles.detailItemTop}>
                        <strong className={styles.detailItemTitle}>{item.club}</strong>
                        <span className={styles.detailItemMeta}>
                          {formatCareerWindow(item, backgroundCopy) || i18n.labels.unavailable}
                        </span>
                      </div>
                      <div className={styles.detailInlineMeta}>
                        <span>{backgroundCopy.clubHistory}</span>
                        {item.sourceLabel ? <span>{item.sourceLabel}</span> : null}
                        {item.sourceUrl ? (
                          <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                            {i18n.actions.openSource}
                          </a>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
              {compactResearchNotes.length ? (
                <div className={styles.detailHintRail}>
                  {compactResearchNotes.map((hint, index) => (
                    <span
                      className={badgeClass(hint.reviewPriority === "high" ? "warm" : "muted")}
                      key={`${card.sportsPersonId}:hint:${hint.sourceSystem || "unknown"}:${index}`}
                    >
                      {compactText(hint.text, 64) || hint.text}
                    </span>
                  ))}
                </div>
              ) : null}
              {backgroundSourceLabel ? (
                <div className={styles.detailInlineMeta}>
                  <span>{backgroundCopy.source}</span>
                  {backgroundSourceUrl ? (
                    <a href={backgroundSourceUrl} target="_blank" rel="noreferrer">
                      {backgroundSourceLabel}
                    </a>
                  ) : (
                    <span>{backgroundSourceLabel}</span>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <div className={styles.emptyState}>{backgroundCopy.noFacts}</div>
          )}
        </section>

        {compactClaims.length ? (
          <section className={styles.detailCard}>
            <span className={styles.kicker}>{i18n.labels.claims}</span>
            <h3 className={styles.detailCardTitle}>
              {i18n.labels.sourceBackedStatusAndSelection}
            </h3>
            <div className={styles.detailList}>
              {compactClaims.map((claim) => (
                <ClaimRow
                  claim={claim}
                  canonicalName={card.canonicalName}
                  i18n={i18n}
                  key={claim.claimId}
                />
              ))}
            </div>
          </section>
        ) : null}

        {compactHumanInterestAngles.length ? (
          <section className={styles.detailCard}>
            <span className={styles.kicker}>{humanInterestAngleCopy.kicker}</span>
            <h3 className={styles.detailCardTitle}>{humanInterestAngleCopy.title}</h3>
            <div className={styles.detailList}>
              {compactHumanInterestAngles.map((item, index) => (
                <HumanInterestAngleRow
                  item={item}
                  copy={humanInterestAngleCopy}
                  i18n={i18n}
                  key={`${item.angleSource}:${item.claimType}:${item.sourceUrl || "pending"}:${index}`}
                />
              ))}
            </div>
          </section>
        ) : null}

        {compactReportedNarratives.length ? (
          <section className={styles.detailCard}>
            <span className={styles.kicker}>{atlasCopy.reported}</span>
            <h3 className={styles.detailCardTitle}>{researchHintCopy.title}</h3>
            <div className={styles.detailList}>
              {compactReportedNarratives.map((item) => (
                <NarrativeRow item={item} i18n={i18n} key={item.id} />
              ))}
            </div>
          </section>
        ) : null}

        {compactRiskNarratives.length ? (
          <section className={styles.detailCard}>
            <span className={styles.kicker}>{atlasCopy.risk}</span>
            <h3 className={styles.detailCardTitle}>
              {atlasCopy.rumorsAndScandals}
            </h3>
            <div className={styles.detailList}>
              {compactRiskNarratives.map((item) => {
                const riskTag = controversyNarratives.some(
                  (riskItem) => riskItem.id === item.id,
                )
                  ? atlasCopy.rumorsAndScandals
                  : atlasCopy.risk;
                return (
                  <NarrativeRow
                    item={item}
                    tag={riskTag}
                    i18n={i18n}
                    key={item.id}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        {compactAppearanceLeads.length ? (
          <section className={styles.detailCard}>
            <span className={styles.kicker}>{i18n.labels.officialVoice}</span>
            <h3 className={styles.detailCardTitle}>
              {i18n.labels.interviewsAndPressLinesToMine}
            </h3>
            <div className={styles.detailList}>
              {compactAppearanceLeads.map((item) => (
                <article className={styles.detailItem} key={item.id}>
                  <div className={styles.detailItemTop}>
                    <strong className={styles.detailItemTitle}>
                      {item.title}
                    </strong>
                    <span className={styles.detailItemMeta}>
                      {item.updatedAt
                        ? formatDateTime(item.updatedAt, i18n)
                        : i18n.labels.unavailable}
                    </span>
                  </div>
                  <p className={styles.detailBodyText}>
                    {compactText(item.summary, 120) || item.summary}
                  </p>
                  <div className={styles.detailInlineMeta}>
                    {item.tag ? <span>{item.tag}</span> : null}
                    {item.href ? (
                      <a href={item.href} target="_blank" rel="noreferrer">
                        {i18n.actions.openSource}
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {compactResearchNotes.length ? (
          <section className={styles.detailCard}>
            <span className={styles.kicker}>{researchHintCopy.kicker}</span>
            <h3 className={styles.detailCardTitle}>{researchHintCopy.title}</h3>
            <div className={styles.detailList}>
              {compactResearchNotes.map((hint, index) => (
                <ResearchHintRow
                  hint={hint}
                  copy={researchHintCopy}
                  key={`${hint.sourceSystem || "unknown"}:${hint.evidenceUrl || "pending"}:${index}`}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}

function WatchCard({
  item,
  teamSlug,
  isSelected,
  language,
  filters,
  i18n,
}: {
  item: PersonEntry;
  teamSlug: string;
  isSelected: boolean;
  language: WorldCupJournalistLanguage;
  filters: Partial<LeadFilterState>;
  i18n: WorldCupJournalistI18n;
}) {
  return (
    <article
      className={`${styles.watchCard} ${isSelected ? styles.watchCardActive : ""}`.trim()}
    >
      <div className={styles.watchTop}>
        <div className={styles.watchIdentity}>
          <PortraitThumb
            portrait={item.portrait}
            name={item.displayName}
            size="md"
          />
          <div>
            <div className={styles.watchLabels}>
              <span className={badgeClass(item.laneTone)}>
                {renderLaneLabel(item.lane, i18n)}
              </span>
              {item.badges.slice(0, 3).map((badge) => (
                <span
                  className={badgeClass(badge.tone)}
                  key={`${item.id}:${badge.label}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
            <h3 className={styles.watchName}>
              <PersonNameLink
                teamSlug={teamSlug}
                personId={item.id}
                label={item.displayName}
                active={isSelected}
                language={language}
                filters={filters}
              />
            </h3>
            <p className={styles.watchRole}>{item.roleLabel}</p>
          </div>
        </div>
        {item.instagram || item.squadNumber != null ? (
          <div className={styles.watchAside}>
            <InstagramLinkPill
              profile={item.instagram}
              name={item.displayName}
              i18n={i18n}
              className={styles.instagramPillCompact}
            />
            {item.squadNumber != null ? (
              <span className={styles.numberBadge}>#{item.squadNumber}</span>
            ) : null}
          </div>
        ) : null}
      </div>

      {item.hook ? <p className={styles.watchHook}>{item.hook}</p> : null}
      <p className={styles.watchStatus}>{item.statusLine}</p>
      {item.evidence ? (
        <p className={styles.watchEvidence}>{item.evidence}</p>
      ) : null}

      <div className={styles.watchMeta}>
        <span>{formatDateTime(item.updatedAt, i18n)}</span>
        {item.href ? (
          <a href={item.href} target="_blank" rel="noreferrer">
            {i18n.actions.openSource}
          </a>
        ) : null}
      </div>
    </article>
  );
}

function LedgerRow({
  item,
  teamSlug,
  isSelected,
  language,
  filters,
}: {
  item: PersonEntry;
  teamSlug: string;
  isSelected: boolean;
  language: WorldCupJournalistLanguage;
  filters: Partial<LeadFilterState>;
}) {
  return (
    <article
      className={`${styles.ledgerRow} ${isSelected ? styles.ledgerRowActive : ""}`.trim()}
    >
      <div className={styles.ledgerNumber}>
        {item.squadNumber != null ? `#${item.squadNumber}` : "—"}
      </div>
      <div className={styles.ledgerNameCell}>
        <div className={styles.ledgerIdentity}>
          <PortraitThumb
            portrait={item.portrait}
            name={item.displayName}
            size="sm"
          />
          <div className={styles.ledgerIdentityText}>
            <strong className={styles.ledgerName}>
              <PersonNameLink
                teamSlug={teamSlug}
                personId={item.id}
                label={item.displayName}
                active={isSelected}
                language={language}
                filters={filters}
              />
            </strong>
            <span className={styles.ledgerRole}>{item.roleLabel}</span>
          </div>
        </div>
      </div>
      <div className={styles.ledgerStatus}>{item.statusLine}</div>
      <div className={styles.ledgerNote}>
        {item.hook || <span className={styles.quietMark}>—</span>}
      </div>
    </article>
  );
}

function SignalRow({
  item,
  i18n,
}: {
  item: JournalistAppearance;
  i18n: WorldCupJournalistI18n;
}) {
  const lead = deriveAppearanceLead(item, i18n);
  return (
    <article className={styles.signalRow}>
      <div className={styles.signalTop}>
        <span className={badgeClass(lead.tone)}>
          {renderLaneLabel(lead.lane, i18n)}
        </span>
        <span className={styles.signalTime}>
          {formatDateTime(item.appearanceDate, i18n)}
        </span>
      </div>
      <h3 className={styles.signalTitle}>{lead.title}</h3>
      {lead.summary ? (
        <p className={styles.signalSummary}>{lead.summary}</p>
      ) : null}
      <div className={styles.signalMeta}>
        {lead.tag ? <span>{lead.tag}</span> : null}
        {item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer">
            {i18n.actions.openArticle}
          </a>
        ) : null}
      </div>
    </article>
  );
}

export function WorldCupJournalistView({
  snapshot,
  selectedTeam,
  officialNewsSummary,
  selectedPersonId,
  language,
  selectedLeadType,
  selectedLeadSource,
  humanInterestRecords = [],
}: Props) {
  const i18n = getWorldCupJournalistI18n(language);
  const officialLaneCopy = LOCALIZED_OFFICIAL_NEWS_LANE[language];
  const atlasCopy = LOCALIZED_CARD_ATLAS_COPY[language];
  const teamVisual = buildTeamVisualProfile(selectedTeam.team);
  const coverageStatusBadge = formatCoverageStatusLabel(
    selectedTeam.team.editorial.coverageStatus,
    i18n,
  );
  const scopeTierBadge =
    selectedTeam.team.scopeTier === "secondary" ||
    selectedTeam.team.editorial.coverageStatus !== "ok"
      ? formatScopeTierLabel(selectedTeam.team.scopeTier, i18n)
      : null;
  const coverageNotice = getCoverageNotice(selectedTeam, i18n);
  const limitedCoverageEmptyMessage = getLimitedCoverageEmptyMessage(
    selectedTeam,
    i18n,
  );
  const humanInterestRecordByKey = new Map(
    humanInterestRecords.map((record) => [
      buildHumanInterestLookupKey(
        record.teamCanonicalName,
        record.personCanonicalName,
      ),
      record,
    ]),
  );
  const allCards = [...selectedTeam.playerCards, ...selectedTeam.staffCards];
  const cardById = new Map(allCards.map((card) => [card.sportsPersonId, card]));
  const allEntries = allCards
    .map((card) =>
      buildPersonEntry(
        card,
        i18n,
        resolveHumanInterestRecord(
          selectedTeam.team.canonicalName,
          card,
          humanInterestRecordByKey,
        ),
      ),
    )
    .sort((left, right) => {
      if (right.signalScore !== left.signalScore)
        return right.signalScore - left.signalScore;
      if (
        (left.squadNumber ?? Number.MAX_SAFE_INTEGER) !==
        (right.squadNumber ?? Number.MAX_SAFE_INTEGER)
      ) {
        return (
          (left.squadNumber ?? Number.MAX_SAFE_INTEGER) -
          (right.squadNumber ?? Number.MAX_SAFE_INTEGER)
        );
      }
      return left.displayName.localeCompare(right.displayName, i18n.locale);
    });

  const entryById = new Map(allEntries.map((entry) => [entry.id, entry]));
  const normalizedSelectedPersonId = (selectedPersonId || "")
    .trim()
    .toLocaleLowerCase("en-US");
  const requestedSelectedCard =
    allCards.find((card) => card.sportsPersonId === selectedPersonId) ||
    allCards.find(
      (card) =>
        card.displayName.toLocaleLowerCase("en-US") ===
        normalizedSelectedPersonId,
    ) ||
    allCards.find(
      (card) =>
        card.canonicalName.toLocaleLowerCase("en-US") ===
        normalizedSelectedPersonId,
    ) ||
    null;
  const [activePersonId, setActivePersonId] = useState<string | null>(
    requestedSelectedCard?.sportsPersonId || null,
  );
  const [cardSortMode, setCardSortMode] =
    useState<CardSortMode>("star_power");

  useEffect(() => {
    setActivePersonId(requestedSelectedCard?.sportsPersonId || null);
  }, [requestedSelectedCard?.sportsPersonId, selectedTeam.team.slug]);

  useEffect(() => {
    const handlePopState = () => {
      setActivePersonId(readSelectedPersonIdFromLocation());
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const syncSelectedPersonInUrl = (personId: string | null) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("team", selectedTeam.team.slug);
    params.set("lang", language);
    appendLeadFilterParams(params, activeFilters);
    if (personId) params.set("person", personId);
    else params.delete("person");
    const nextUrl = `/world-cup/?${params.toString()}${personId ? "#person-detail" : ""}`;
    window.history.replaceState({}, "", nextUrl);
  };

  const handleSelectPerson = (personId: string) => {
    setActivePersonId(personId);
    syncSelectedPersonInUrl(personId);
  };

  const handleClearSelectedPerson = () => {
    setActivePersonId(null);
    syncSelectedPersonInUrl(null);
  };

  const selectedCard = activePersonId
    ? cardById.get(activePersonId) || null
    : null;
  const selectedEntry = selectedCard
    ? entryById.get(selectedCard.sportsPersonId) ||
      buildPersonEntry(
        selectedCard,
        i18n,
        resolveHumanInterestRecord(
          selectedTeam.team.canonicalName,
          selectedCard,
          humanInterestRecordByKey,
        ),
      )
    : null;
  const atlasEntries = sortAtlasEntries(allEntries, cardSortMode, i18n.locale);
  const playerEntries = sortAtlasEntries(
    allEntries.filter((entry) => entry.isPlayer),
    cardSortMode,
    i18n.locale,
  );
  const featureTargetEntries = sortAtlasEntries(
    allEntries.filter(
      (entry) =>
        entry.isPlayer && getScoreBreakdownValue(entry, "humanInterest") > 0,
    ),
    "star_power",
    i18n.locale,
  ).slice(0, 8);
  const detailEntries = selectedEntry?.isPlayer ? playerEntries : atlasEntries;
  const selectedIndex = selectedEntry
    ? detailEntries.findIndex((entry) => entry.id === selectedEntry.id)
    : -1;
  const previousEntry =
    selectedIndex > 0 ? detailEntries[selectedIndex - 1] : null;
  const nextEntry =
    selectedIndex >= 0 && selectedIndex < detailEntries.length - 1
      ? detailEntries[selectedIndex + 1]
      : null;
  const watchEntries = allEntries.filter((item) => item.signalScore > 0);
  const watchIds = new Set(watchEntries.map((item) => item.id));
  const staffLedger = allEntries.filter(
    (item) => !item.isPlayer && !watchIds.has(item.id),
  );
  const selectedHumanInterestRecord = selectedCard
    ? resolveHumanInterestRecord(
        selectedTeam.team.canonicalName,
        selectedCard,
        humanInterestRecordByKey,
      )
    : null;
  const selectedHumanInterestAngles: HumanInterestAngleItem[] = [
    ...((selectedHumanInterestRecord?.featureAngles || []).map((item) => ({
      ...item,
      angleSource: "feature" as const,
    }))),
    ...((selectedHumanInterestRecord?.publicPersonalContext || []).map((item) => ({
      ...item,
      angleSource: "context" as const,
    }))),
  ];
  const selectedResearchNotes = (
    selectedHumanInterestRecord?.researchNotes || []
  ).filter((note) => shouldDisplayResearchNote(note, language));
  const unfilteredLeadDeck = buildLeadDeck(
    selectedTeam,
    watchEntries,
    language,
    i18n,
    {},
  );
  const typeOptions = buildLeadFilterOptions(
    unfilteredLeadDeck,
    "provenanceType",
  );
  const normalizedLeadType = normalizeLeadFilterValue(
    selectedLeadType,
    typeOptions,
  );
  const sourceBaseLeads = normalizedLeadType
    ? unfilteredLeadDeck.filter(
        (item) => item.provenanceType === normalizedLeadType,
      )
    : unfilteredLeadDeck;
  const sourceOptions = buildLeadFilterOptions(
    sourceBaseLeads,
    "provenanceSource",
  );
  const normalizedLeadSource = normalizeLeadFilterValue(
    selectedLeadSource,
    sourceOptions,
  );
  const activeFilters: LeadFilterState = {
    leadType: normalizedLeadType,
    leadSource: normalizedLeadSource,
  };

  useEffect(() => {
    if (!selectedCard || !selectedEntry) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setActivePersonId(null);
      syncSelectedPersonInUrl(null);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    selectedCard,
    selectedEntry,
    selectedTeam.team.slug,
    language,
    activeFilters.leadType,
    activeFilters.leadSource,
  ]);

  const leadDeck = buildLeadDeck(
    selectedTeam,
    watchEntries,
    language,
    i18n,
    activeFilters,
  );
  const filteredLeadDeck = leadDeck
    .filter((item) =>
      normalizedLeadType ? item.provenanceType === normalizedLeadType : true,
    )
    .filter((item) =>
      normalizedLeadSource
        ? item.provenanceSource === normalizedLeadSource
        : true,
    )
    .slice(0, 6);
  const statusAlerts = watchEntries.filter(
    (item) => item.category === "status",
  ).length;
  const deskTakeaway = buildDeskTakeaway(
    selectedTeam,
    watchEntries,
    unfilteredLeadDeck,
    i18n,
  );
  const teamMentionArticleCount =
    officialNewsSummary?.mentionBreakdown.find(
      (item) => item.entityType === "team",
    )?.articles || 0;
  const selectedTeamOfficialNews = officialNewsSummary?.selectedTeam || null;
  const remainingGapTeams = officialNewsSummary
    ? [...new Set(officialNewsSummary.teamMentionGaps.map((item) => item.team))]
    : [];
  const selectedTeamGap = remainingGapTeams.includes(
    selectedTeam.team.canonicalName,
  );
  const teamFreshnessMetrics = buildTeamFreshnessMetrics(selectedTeam, i18n);
  const teamOptions = snapshot.teams.map((team) => ({
    slug: team.team.slug,
    label: team.team.canonicalName,
  }));
  const rosterMatrixTitle = language === "ko" ? "선수 보드" : "Squad board";
  const rosterMatrixNote =
    language === "ko"
      ? "선수를 한 화면에서 훑고, 클릭하면 기사거리 상세를 별도 창으로 엽니다."
      : "Scan the whole squad here, then click any player to open the dossier.";
  const rosterSortLabel = language === "ko" ? "선수 정렬" : "Player Order";

  return (
    <div className={`page-stack world-cup-page-root ${styles.root}`}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.masthead}>
            <div className={styles.mastheadTop}>
              <span className={styles.eyebrow}>
                {i18n.labels.editorialDesk}
              </span>
              <div className={styles.heroControls}>
                <WorldCupTeamSelect
                  label={officialLaneCopy.selectedTeam}
                  currentTeamSlug={selectedTeam.team.slug}
                  options={teamOptions}
                  language={language}
                  selectedLeadType={activeFilters.leadType}
                  selectedLeadSource={activeFilters.leadSource}
                />
                <WorldCupLanguageSelect
                  label={i18n.labels.language}
                  currentLanguage={language}
                  options={i18n.languageOptions}
                  teamSlug={selectedTeam.team.slug}
                  selectedPersonId={selectedEntry?.id}
                  selectedLeadType={activeFilters.leadType}
                  selectedLeadSource={activeFilters.leadSource}
                />
              </div>
            </div>
            <h1 className={styles.teamName}>
              {selectedTeam.team.canonicalName}
            </h1>
            <p className={styles.heroSummary}>{deskTakeaway}</p>
          </div>
          <div className={styles.heroMeta}>
            <span>
              {i18n.labels.exported} {formatDateTime(snapshot.exportedAt, i18n)}
            </span>
            <span>{selectedTeam.team.competitionEditionName}</span>
            <span>{renderSourceQuality(selectedTeam, i18n)}</span>
          </div>
          <div className={styles.freshnessStrip}>
            {teamFreshnessMetrics.map((metric) => (
              <article
                className={styles.freshnessCard}
                key={`${selectedTeam.team.slug}:${metric.label}`}
              >
                <div className={styles.freshnessTop}>
                  <span className={styles.statLabel}>{metric.label}</span>
                  <span className={badgeClass(freshnessTone(metric.state))}>
                    {formatFreshnessStateLabel(metric.state, i18n)}
                  </span>
                </div>
                <strong className={styles.freshnessValue}>
                  {formatFreshnessValue(metric, i18n)}
                </strong>
                <small className={styles.freshnessMeta}>
                  {formatDateTime(metric.lastSeenAt, i18n)}
                </small>
              </article>
            ))}
          </div>
          {coverageNotice ? (
            <div className={styles.coverageNotice}>
              <div className={styles.coverageNoticeTop}>
                <span className={badgeClass(coverageNotice.tone)}>
                  {coverageStatusBadge}
                </span>
                {scopeTierBadge ? (
                  <span className={badgeClass("muted")}>{scopeTierBadge}</span>
                ) : null}
              </div>
              <strong className={styles.coverageNoticeTitle}>
                {coverageNotice.title}
              </strong>
              <p className={styles.coverageNoticeBody}>{coverageNotice.body}</p>
            </div>
          ) : null}
        </div>

        <div className={styles.statStrip}>
          <article className={styles.statCard}>
            <span className={styles.statLabel}>{i18n.labels.leadAngles}</span>
            <strong className={styles.statValue}>
              {unfilteredLeadDeck.length}
            </strong>
            <small className={styles.statHint}>{i18n.hints.leadAngles}</small>
          </article>
          <article className={styles.statCard}>
            <span className={styles.statLabel}>{i18n.labels.statusAlerts}</span>
            <strong className={styles.statValue}>{statusAlerts}</strong>
            <small className={styles.statHint}>{i18n.hints.statusAlerts}</small>
          </article>
          <article className={styles.statCard}>
            <span className={styles.statLabel}>
              {i18n.labels.officialSignals}
            </span>
            <strong className={styles.statValue}>
              {selectedTeam.team.summary.officialAppearanceCount}
            </strong>
            <small className={styles.statHint}>
              {i18n.hints.officialSignals}
            </small>
          </article>
          <article className={styles.statCard}>
            <span className={styles.statLabel}>{i18n.labels.rosterSize}</span>
            <strong className={styles.statValue}>
              {selectedTeam.team.summary.playerCount}
            </strong>
            <small className={styles.statHint}>{i18n.hints.rosterSize}</small>
          </article>
        </div>
      </section>

      {featureTargetEntries.length ? (
        <section className={styles.sectionBlock}>
          <div className={styles.rosterHead}>
            <div className={styles.rosterHeadCopy}>
              <span className={styles.kicker}>
                {atlasCopy.featureStoryTargets}
              </span>
              <h2 className={styles.rosterTitle}>
                {atlasCopy.featureStoryTargets}
              </h2>
              <p className={styles.rosterNote}>
                {atlasCopy.featureStoryTargetsNote}
              </p>
            </div>
          </div>

          <div className={styles.rosterGrid}>
            {featureTargetEntries.map((item) => {
              const card = cardById.get(item.id);
              if (!card) return null;
              return (
                <PlayerMatrixTile
                  card={card}
                  item={item}
                  key={`feature-target:${item.id}`}
                  isSelected={selectedEntry?.id === item.id}
                  atlasCopy={atlasCopy}
                  language={language}
                  onSelectPerson={handleSelectPerson}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      <section
        className={`${styles.sectionBlock} ${styles.rosterSection}`.trim()}
      >
        <div className={styles.rosterHead}>
          <div className={styles.rosterHeadCopy}>
            <span className={styles.kicker}>{atlasCopy.kicker}</span>
            <h2 className={styles.rosterTitle}>{rosterMatrixTitle}</h2>
            <p className={styles.rosterNote}>{rosterMatrixNote}</p>
          </div>
          <div className={styles.rosterHeadControls}>
            <span className={styles.filterGroupLabel}>{rosterSortLabel}</span>
            <div className={styles.filterPillRail}>
              {CARD_SORT_MODES.map((mode) => (
                <button
                  type="button"
                  key={`card-sort:${mode}`}
                  onClick={() => setCardSortMode(mode)}
                  className={`${styles.filterPill} ${styles.filterPillButton} ${cardSortMode === mode ? styles.filterPillActive : ""}`.trim()}
                >
                  <span>{formatCardSortModeLabel(mode, language)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className={styles.rosterSortNote}>
          {formatCardSortModeNote(cardSortMode, language)}
        </p>
        {staffLedger.length ? (
          <div className={styles.staffBenchStrip}>
            <div className={styles.staffBenchHeader}>
              <span className={styles.kicker}>{i18n.labels.staffBench}</span>
              <strong className={styles.staffBenchTitle}>
                {i18n.labels.technicalStaffOnFile}
              </strong>
            </div>
            <div className={styles.staffBenchRail}>
              {staffLedger.map((item) => (
                <PersonNameLink
                  key={`staff-bench:${item.id}`}
                  teamSlug={selectedTeam.team.slug}
                  personId={item.id}
                  label={item.displayName}
                  active={selectedEntry?.id === item.id}
                  language={language}
                  filters={activeFilters}
                  onSelect={handleSelectPerson}
                  className={styles.staffBenchButton}
                />
              ))}
            </div>
          </div>
        ) : null}

        {playerEntries.length ? (
          <div className={styles.rosterGrid}>
            {playerEntries.map((item) => {
              const card = cardById.get(item.id);
              if (!card) return null;
              return (
                <PlayerMatrixTile
                  card={card}
                  item={item}
                  key={`player:${item.id}`}
                  isSelected={selectedEntry?.id === item.id}
                  atlasCopy={atlasCopy}
                  language={language}
                  onSelectPerson={handleSelectPerson}
                />
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>
            {limitedCoverageEmptyMessage || i18n.empty.noWatchlist}
          </div>
        )}
      </section>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <section className={styles.sectionBlock} id="lead-angles">
            <div className={styles.blockHead}>
              <div>
                <span className={styles.kicker}>{i18n.labels.leadAngles}</span>
                <h2 className={styles.blockTitle}>
                  {i18n.labels.leadAnglesTitle}
                </h2>
              </div>
              <div className={styles.blockTools}>
                <p className={styles.blockNote}>{i18n.labels.leadAnglesNote}</p>
                <div className={styles.filterBoard}>
                  <div className={styles.filterGroup}>
                    <span className={styles.filterGroupLabel}>
                      {i18n.labels.sourceType}
                    </span>
                    <div className={styles.filterPillRail}>
                      <Link
                        href={buildLeadFilterHref({
                          teamSlug: selectedTeam.team.slug,
                          language,
                          selectedPersonId: selectedEntry?.id,
                          filters: { leadType: null, leadSource: null },
                        })}
                        className={`${styles.filterPill} ${!activeFilters.leadType ? styles.filterPillActive : ""}`.trim()}
                      >
                        <span>{i18n.labels.allSourceTypes}</span>
                        <small>{unfilteredLeadDeck.length}</small>
                      </Link>
                      {typeOptions.map((option) => (
                        <Link
                          href={buildLeadFilterHref({
                            teamSlug: selectedTeam.team.slug,
                            language,
                            selectedPersonId: selectedEntry?.id,
                            filters: {
                              leadType: option.value,
                              leadSource: null,
                            },
                          })}
                          className={`${styles.filterPill} ${activeFilters.leadType === option.value ? styles.filterPillActive : ""}`.trim()}
                          key={`type:${option.value}`}
                        >
                          <span>{option.label}</span>
                          <small>{option.count}</small>
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className={styles.filterGroup}>
                    <span className={styles.filterGroupLabel}>
                      {i18n.labels.sourceFilter}
                    </span>
                    <div className={styles.filterPillRail}>
                      <Link
                        href={buildLeadFilterHref({
                          teamSlug: selectedTeam.team.slug,
                          language,
                          selectedPersonId: selectedEntry?.id,
                          filters: {
                            leadType: activeFilters.leadType,
                            leadSource: null,
                          },
                        })}
                        className={`${styles.filterPill} ${!activeFilters.leadSource ? styles.filterPillActive : ""}`.trim()}
                      >
                        <span>{i18n.labels.allSources}</span>
                        <small>{sourceBaseLeads.length}</small>
                      </Link>
                      {sourceOptions.map((option) => (
                        <Link
                          href={buildLeadFilterHref({
                            teamSlug: selectedTeam.team.slug,
                            language,
                            selectedPersonId: selectedEntry?.id,
                            filters: {
                              leadType: activeFilters.leadType,
                              leadSource: option.value,
                            },
                          })}
                          className={`${styles.filterPill} ${activeFilters.leadSource === option.value ? styles.filterPillActive : ""}`.trim()}
                          key={`source:${option.value}`}
                        >
                          <span>{option.label}</span>
                          <small>{option.count}</small>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {filteredLeadDeck.length ? (
              <div className={styles.leadGrid}>
                {filteredLeadDeck.map((item) => (
                  <LeadCard
                    item={item}
                    key={item.id}
                    active={selectedEntry?.id === item.personId}
                    onSelectPerson={handleSelectPerson}
                    i18n={i18n}
                  />
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                {limitedCoverageEmptyMessage ||
                  (activeFilters.leadType || activeFilters.leadSource
                    ? i18n.empty.noLeadAngleMatch
                    : i18n.empty.noLeadAngle)}
              </div>
            )}
          </section>
        </div>

        <aside className={styles.sideColumn}>
          {officialNewsSummary ? (
            <section className={styles.sidebarPanel} id="official-news-lane">
              <span className={styles.kicker}>{officialLaneCopy.kicker}</span>
              <h2 className={styles.sideTitle}>{officialLaneCopy.title}</h2>
              <p className={styles.sideBody}>{officialLaneCopy.note}</p>
              <div className={styles.factGrid}>
                <div>
                  <span className={styles.factLabel}>
                    {officialLaneCopy.officialArticles}
                  </span>
                  <strong className={styles.factValue}>
                    {officialNewsSummary.totals.officialArticles}
                  </strong>
                </div>
                <div>
                  <span className={styles.factLabel}>
                    {officialLaneCopy.linkedArticles}
                  </span>
                  <strong className={styles.factValue}>
                    {officialNewsSummary.totals.linkedArticles}
                  </strong>
                </div>
                <div>
                  <span className={styles.factLabel}>
                    {officialLaneCopy.teamLinkedArticles}
                  </span>
                  <strong className={styles.factValue}>
                    {teamMentionArticleCount}
                  </strong>
                </div>
                <div>
                  <span className={styles.factLabel}>
                    {officialLaneCopy.openGaps}
                  </span>
                  <strong className={styles.factValue}>
                    {remainingGapTeams.length}
                  </strong>
                </div>
              </div>
              <article className={styles.laneSummaryCard}>
                <div className={styles.laneSummaryTop}>
                  <strong className={styles.laneSummaryTitle}>
                    {officialLaneCopy.selectedTeam}
                  </strong>
                  {selectedTeamGap ? (
                    <span className={badgeClass("warm")}>
                      {officialLaneCopy.openGaps}
                    </span>
                  ) : null}
                </div>
                {selectedTeamOfficialNews ? (
                  <p className={styles.laneSummaryBody}>
                    {selectedTeam.team.canonicalName}:{" "}
                    {selectedTeamOfficialNews.officialArticles} /{" "}
                    {selectedTeamOfficialNews.linkedArticles} /{" "}
                    {selectedTeamOfficialNews.teamMentionArticles}
                  </p>
                ) : (
                  <p className={styles.laneSummaryBody}>
                    {officialLaneCopy.noSelectedTeamData}
                  </p>
                )}
              </article>
              {officialNewsSummary.topTeams.length ? (
                <div className={styles.laneMiniList}>
                  <span className={styles.factLabel}>
                    {officialLaneCopy.topTeams}
                  </span>
                  {officialNewsSummary.topTeams.slice(0, 5).map((team) => (
                    <article className={styles.laneMiniRow} key={team.team}>
                      {snapshot.teams.find(
                        (item) => item.team.canonicalName === team.team,
                      ) ? (
                        <Link
                          href={buildLeadFilterHref({
                            teamSlug:
                              snapshot.teams.find(
                                (item) => item.team.canonicalName === team.team,
                              )?.team.slug || selectedTeam.team.slug,
                            language,
                            anchor: "official-news-lane",
                          })}
                          className={styles.personLink}
                        >
                          <strong>{team.team}</strong>
                        </Link>
                      ) : (
                        <strong>{team.team}</strong>
                      )}
                      <span className={styles.laneMiniMeta}>
                        {team.officialArticles} / {team.linkedArticles} /{" "}
                        {team.teamMentionArticles}
                      </span>
                    </article>
                  ))}
                </div>
              ) : null}
              {selectedTeamOfficialNews?.recentArticles.length ? (
                <div className={styles.laneArticleList}>
                  <span className={styles.factLabel}>
                    {officialLaneCopy.recentArticles}
                  </span>
                  {selectedTeamOfficialNews.recentArticles.map((article) => (
                    <article
                      className={styles.laneArticleRow}
                      key={`${article.url}:${article.publicationDatetime}`}
                    >
                      <div>
                        <h3 className={styles.seedTitle}>{article.title}</h3>
                        <p className={styles.laneArticleMeta}>
                          {[
                            formatDateTime(article.publicationDatetime, i18n),
                            article.entityTypes.join(", "),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <a href={article.url} target="_blank" rel="noreferrer">
                        {i18n.actions.openArticle}
                      </a>
                    </article>
                  ))}
                </div>
              ) : null}
              {remainingGapTeams.length ? (
                <div className={styles.laneBadgeRail}>
                  <span className={styles.factLabel}>
                    {officialLaneCopy.remainingGapTeams}
                  </span>
                  <div className={styles.sourceMeta}>
                    {remainingGapTeams.map((team) => (
                      <span className={badgeClass("muted")} key={team}>
                        {team}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <a
                href={`/api/customer/world-cup/official-news?days=${officialNewsSummary.windowDays}&team=${encodeURIComponent(selectedTeam.team.canonicalName)}`}
                target="_blank"
                rel="noreferrer"
                className={styles.primarySourceLink}
              >
                {officialLaneCopy.openJson}
              </a>
            </section>
          ) : null}

          <details
            className={`${styles.sidebarPanel} ${styles.collapsiblePanel}`.trim()}
          >
            <summary className={styles.collapsibleSummary}>
              <div className={styles.collapsibleSummaryText}>
                <span className={styles.kicker}>{i18n.labels.latestSignals}</span>
                <span className={styles.collapsibleTitle}>
                  {i18n.labels.officialMaterialToMineNext}
                </span>
              </div>
              <span className={styles.collapsibleCount}>
                {selectedTeam.officialAppearanceTimeline.length}
              </span>
            </summary>
            <div className={styles.collapsibleBody}>
              <div className={styles.signalList}>
                {selectedTeam.officialAppearanceTimeline.length ? (
                  selectedTeam.officialAppearanceTimeline.map((item) => (
                    <SignalRow item={item} i18n={i18n} key={item.appearanceId} />
                  ))
                ) : (
                  <div className={styles.emptyState}>
                    {limitedCoverageEmptyMessage ||
                      i18n.empty.noOfficialAppearance}
                  </div>
                )}
              </div>
            </div>
          </details>
        </aside>
      </div>

      {selectedCard && selectedEntry ? (
        <div
          className={styles.detailModalBackdrop}
          onClick={handleClearSelectedPerson}
        >
          <div
            className={styles.detailModalWindow}
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedEntry.displayName} ${i18n.labels.personDossier}`}
            onClick={(event) => event.stopPropagation()}
          >
            <PersonDetailPanel
              teamSlug={selectedTeam.team.slug}
              card={selectedCard}
              entry={selectedEntry}
              previousEntry={previousEntry}
              nextEntry={nextEntry}
              selectedIndex={selectedIndex}
              totalCount={detailEntries.length}
              language={language}
              filters={activeFilters}
              teamVisual={teamVisual}
              onSelectPerson={handleSelectPerson}
              onClearSelection={handleClearSelectedPerson}
              i18n={i18n}
              humanInterestAngles={selectedHumanInterestAngles}
              researchNotes={selectedResearchNotes}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
