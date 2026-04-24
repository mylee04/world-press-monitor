import type { Metadata } from 'next';
import { WorldCupDocumentLanguage } from '@/components/world-cup-document-language';
import { WorldCupJournalistView } from '@/components/world-cup-journalist-view';
import { buildFootballWorldCupDossierProgram } from '@/lib/football-world-cup-dossier-program';
import { readFootballOfficialNewsLaneSummary } from '@/lib/football-official-news-store';
import { readFootballWorldCupHumanInterestPilotCanonical } from '@/lib/football-world-cup-human-interest-store';
import {
  readFootballWorldCupJournalistSnapshot,
  resolveFootballWorldCupJournalistSnapshotPath,
} from '@/lib/football-world-cup-journalist-store';
import {
  normalizeWorldCupJournalistLanguage,
  type WorldCupJournalistLanguage,
} from '@/lib/world-cup-journalist-i18n';

type Props = {
  searchParams?: Promise<{
    team?: string | string[];
    person?: string | string[];
    lang?: string | string[];
    leadType?: string | string[];
    leadSource?: string | string[];
  }>;
};

const PAGE_META: Record<
  WorldCupJournalistLanguage,
  {
    title: (teamName: string | null) => string;
    description: (teamName: string | null) => string;
  }
> = {
  en: {
    title: (teamName) => (teamName ? `${teamName} Editorial Desk | World Press Radar` : 'World Cup Editorial Desk | World Press Radar'),
    description: (teamName) =>
      teamName
        ? `${teamName} national-team profiles, status signals, official appearances, and storyline hooks for newsroom use.`
        : 'World Cup national-team profiles, status signals, official appearances, and storyline hooks for newsroom use.',
  },
  ko: {
    title: (teamName) => (teamName ? `${teamName} 편집 데스크 | World Press Radar` : '월드컵 편집 데스크 | World Press Radar'),
    description: (teamName) =>
      teamName
        ? `${teamName} 대표팀의 프로필, 상태 시그널, 공식 출연, 스토리라인 훅을 기자용으로 정리한 화면입니다.`
        : '월드컵 대표팀의 프로필, 상태 시그널, 공식 출연, 스토리라인 훅을 기자용으로 정리한 화면입니다.',
  },
  ja: {
    title: (teamName) => (teamName ? `${teamName} 編集デスク | World Press Radar` : 'ワールドカップ編集デスク | World Press Radar'),
    description: (teamName) =>
      teamName
        ? `${teamName}代表のプロフィール、状態シグナル、公式出演、ストーリーラインの取材フックを記者向けに整理した画面です。`
        : 'ワールドカップ代表チームのプロフィール、状態シグナル、公式出演、ストーリーラインの取材フックを記者向けに整理した画面です。',
  },
  es: {
    title: (teamName) => (teamName ? `Mesa editorial de ${teamName} | World Press Radar` : 'Mesa editorial del Mundial | World Press Radar'),
    description: (teamName) =>
      teamName
        ? `Vista periodística con perfiles, señales de estado, apariciones oficiales y ángulos de storyline de la selección de ${teamName}.`
        : 'Vista periodística con perfiles, señales de estado, apariciones oficiales y ángulos de storyline de selecciones del Mundial.',
  },
  vi: {
    title: (teamName) => (teamName ? `Bàn biên tập ${teamName} | World Press Radar` : 'Bàn biên tập World Cup | World Press Radar'),
    description: (teamName) =>
      teamName
        ? `Màn hình dành cho newsroom với hồ sơ, tín hiệu trạng thái, xuất hiện chính thức và các hook storyline của đội tuyển ${teamName}.`
        : 'Màn hình dành cho newsroom với hồ sơ, tín hiệu trạng thái, xuất hiện chính thức và các hook storyline của các đội tuyển World Cup.',
  },
  it: {
    title: (teamName) => (teamName ? `Desk editoriale ${teamName} | World Press Radar` : 'Desk editoriale Mondiale | World Press Radar'),
    description: (teamName) =>
      teamName
        ? `Vista newsroom con profili, segnali di stato, apparizioni ufficiali e hook narrativi della nazionale ${teamName}.`
        : 'Vista newsroom con profili, segnali di stato, apparizioni ufficiali e hook narrativi delle nazionali del Mondiale.',
  },
  fr: {
    title: (teamName) => (teamName ? `Desk éditorial ${teamName} | World Press Radar` : 'Desk éditorial Coupe du monde | World Press Radar'),
    description: (teamName) =>
      teamName
        ? `Vue newsroom avec profils, signaux d’état, apparitions officielles et hooks de storyline de la sélection ${teamName}.`
        : 'Vue newsroom avec profils, signaux d’état, apparitions officielles et hooks de storyline des sélections de la Coupe du monde.',
  },
};

function getSingleQueryValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const trimmed = (item || '').trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function resolveSelectedTeamName(
  requestedTeam: string | null,
  snapshot: Awaited<ReturnType<typeof readFootballWorldCupJournalistSnapshot>>
): string | null {
  if (!snapshot?.teams.length) return null;
  const selectedTeam =
    snapshot.teams.find((team) => team.team.slug === requestedTeam || team.team.canonicalName === requestedTeam) ||
    snapshot.teams[0];
  return selectedTeam?.team.canonicalName || null;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = (await searchParams) || {};
  const requestedTeam = getSingleQueryValue(params.team);
  const language = normalizeWorldCupJournalistLanguage(getSingleQueryValue(params.lang));
  const snapshot = await readFootballWorldCupJournalistSnapshot();
  const teamName = resolveSelectedTeamName(requestedTeam, snapshot);
  const pageMeta = PAGE_META[language];

  return {
    title: pageMeta.title(teamName),
    description: pageMeta.description(teamName),
  };
}

export default async function WorldCupPage({ searchParams }: Props) {
  const params = (await searchParams) || {};
  const requestedTeam = getSingleQueryValue(params.team);
  const requestedPerson = getSingleQueryValue(params.person);
  const language = normalizeWorldCupJournalistLanguage(getSingleQueryValue(params.lang));
  const requestedLeadType = getSingleQueryValue(params.leadType);
  const requestedLeadSource = getSingleQueryValue(params.leadSource);
  const [snapshot, humanInterestPayload] = await Promise.all([
    readFootballWorldCupJournalistSnapshot(),
    readFootballWorldCupHumanInterestPilotCanonical(),
  ]);
  if (!snapshot || !snapshot.teams.length) {
    return (
      <div className="page-stack world-cup-page-root">
        <section className="panel danger">
          <h2>World Cup journalist export unavailable</h2>
          <p>
            Run <code>bun run football:wc:journalist-views</code> to generate the read model first.
          </p>
          <p>
            Expected file: <code>{resolveFootballWorldCupJournalistSnapshotPath()}</code>
          </p>
        </section>
      </div>
    );
  }

  const selectedTeam = snapshot.teams.find((team) =>
    team.team.slug === requestedTeam || team.team.canonicalName === requestedTeam
  ) || snapshot.teams[0];
  const officialNewsSummary = await readFootballOfficialNewsLaneSummary(30, selectedTeam.team.canonicalName).catch(() => null);
  const dossierProgram = buildFootballWorldCupDossierProgram(
    snapshot,
    humanInterestPayload?.records || [],
  );

  return (
    <>
      <WorldCupDocumentLanguage language={language} />
      <WorldCupJournalistView
        snapshot={snapshot}
        selectedTeam={selectedTeam}
        officialNewsSummary={officialNewsSummary}
        selectedPersonId={requestedPerson}
        language={language}
        selectedLeadType={requestedLeadType}
        selectedLeadSource={requestedLeadSource}
        humanInterestRecords={humanInterestPayload?.records || []}
        dossierProgram={dossierProgram}
      />
    </>
  );
}
