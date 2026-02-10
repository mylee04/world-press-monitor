'use client';

import { useEffect, useMemo, useState } from 'react';
import { NewsroomDashboard } from '@/components/NewsroomDashboard';
import { WritingWorkspace } from '@/components/WritingWorkspace';
import { DistributionWorkspace } from '@/components/DistributionWorkspace';
import { DRAFT_STORAGE_KEY, type DraftRecord } from '@/lib/pipeline';

type Locale = 'en' | 'es';
type NavKey = 'tools' | 'projects' | 'research' | 'writing' | 'media' | 'distribution' | 'workflows' | 'analytics';

const COPY: Record<Locale, Record<string, string>> = {
  en: {
    brand: 'PressLab',
    selectProject: 'Select project',
    localeLabel: 'Language',
    tools: 'Tools',
    projects: 'Projects',
    research: 'Research',
    writing: 'Writing',
    media: 'PressLab Media',
    distribution: 'Distribution',
    workflows: 'Workflows',
    analytics: 'Analytics',
    settings: 'Settings',
    profile: 'My profile',
    help: 'Help',
    researchTitle: 'Research Workspace',
    researchSub: 'Realtime newsroom monitoring for US + LATAM',
    stepLanguage: 'Language',
    stepWelcome: 'Welcome',
    stepPersonal: 'Personal',
    stepProfessional: 'Professional',
    stepCoverage: 'Coverage',
    placeholderTitle: 'Coming Soon',
    placeholderBody: 'This workspace tab will be connected in the next iteration.',
    writingTitle: 'Writing Workspace',
    distributionTitle: 'Distribution Workspace'
  },
  es: {
    brand: 'PressLab',
    selectProject: 'Seleccionar proyecto',
    localeLabel: 'Idioma',
    tools: 'Herramientas',
    projects: 'Proyectos',
    research: 'Research',
    writing: 'Redacción',
    media: 'PressLab Media',
    distribution: 'Distribución',
    workflows: 'Workflows',
    analytics: 'Analítica',
    settings: 'Configuración',
    profile: 'Mi perfil',
    help: 'Ayuda',
    researchTitle: 'Workspace de Research',
    researchSub: 'Monitoreo de newsroom en tiempo real para EE.UU. + LATAM',
    stepLanguage: 'Idioma',
    stepWelcome: 'Bienvenida',
    stepPersonal: 'Personal',
    stepProfessional: 'Profesional',
    stepCoverage: 'Cobertura',
    placeholderTitle: 'Próximamente',
    placeholderBody: 'Esta pestaña del espacio de trabajo se conectará en la próxima iteración.',
    writingTitle: 'Workspace de Redacción',
    distributionTitle: 'Workspace de Distribución'
  }
};

export function PresslabWorkbench() {
  const [locale, setLocale] = useState<Locale>('en');
  const [activeNav, setActiveNav] = useState<NavKey>('research');
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const text = useMemo(() => COPY[locale], [locale]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/drafts');
        const json = await response.json().catch(() => null) as { drafts?: DraftRecord[] } | null;
        if (cancelled) return;
        if (response.ok && Array.isArray(json?.drafts)) {
          setDrafts(json?.drafts || []);
        } else {
          const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
          if (!raw) return;
          const parsed = JSON.parse(raw) as DraftRecord[];
          if (Array.isArray(parsed)) setDrafts(parsed);
        }
      } catch {
        try {
          const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
          if (!raw) return;
          const parsed = JSON.parse(raw) as DraftRecord[];
          if (Array.isArray(parsed)) setDrafts(parsed);
        } catch {
          // no-op
        }
      } finally {
        if (!cancelled) setDraftsLoaded(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draftsLoaded) return;
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
    const timer = setTimeout(() => {
      void fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drafts })
      }).catch(() => {
        // no-op: local fallback remains available
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [drafts, draftsLoaded]);

  const navItems: Array<{ key: NavKey; label: string; icon: string }> = [
    { key: 'tools', label: text.tools, icon: '🔧' },
    { key: 'projects', label: text.projects, icon: '🗂' },
    { key: 'research', label: text.research, icon: '🔍' },
    { key: 'writing', label: text.writing, icon: '✍︎' },
    { key: 'media', label: text.media, icon: '🖼' },
    { key: 'distribution', label: text.distribution, icon: '✉︎' },
    { key: 'workflows', label: text.workflows, icon: '⚭' },
    { key: 'analytics', label: text.analytics, icon: '📊' }
  ];

  const queueDraftFromResearch = (draft: DraftRecord) => {
    setDrafts((prev) => {
      const normalized = draft.sourceLink.trim().toLowerCase();
      const exists = prev.some((item) => item.sourceLink.trim().toLowerCase() === normalized);
      if (exists) return prev;
      return [draft, ...prev];
    });
  };

  return (
    <div className="workbench-root">
      <aside className="workbench-sidebar">
        <div className="workbench-brand">
          <h1>{text.brand}</h1>
        </div>

        <button type="button" className="project-select">{text.selectProject}</button>

        <label className="locale-inline locale-sidebar">
          {text.localeLabel}
          <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </label>

        <nav className="workbench-nav" aria-label="Workbench navigation">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={activeNav === item.key ? 'active' : ''}
              onClick={() => setActiveNav(item.key)}
            >
              <span className="nav-label">
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </span>
              <span>⌄</span>
            </button>
          ))}
        </nav>

        <div className="workbench-sidebar-footer">
          <button type="button"><span className="footer-icon">⚙︎</span>{text.settings}</button>
          <button type="button" className="active"><span className="footer-icon">◉</span>{text.profile}</button>
          <button type="button"><span className="footer-icon">❔</span>{text.help}</button>
        </div>
      </aside>

      <section className="workbench-main">
        <div className="workbench-content">
          {activeNav === 'research' ? (
            <section className="research-shell">
              <div className="research-head">
                <h2>{text.researchTitle}</h2>
                <p>{text.researchSub}</p>
              </div>
              <NewsroomDashboard
                locale={locale}
                onQueueDraft={queueDraftFromResearch}
                existingDraftLinks={drafts.map((item) => item.sourceLink)}
                onBreakingQueued={() => setActiveNav('writing')}
              />
            </section>
          ) : activeNav === 'writing' ? (
            <WritingWorkspace
              locale={locale}
              drafts={drafts}
              setDrafts={setDrafts}
              onSentToDistribution={() => setActiveNav('distribution')}
            />
          ) : activeNav === 'distribution' ? (
            <DistributionWorkspace
              locale={locale}
              drafts={drafts}
              setDrafts={setDrafts}
            />
          ) : (
            <section className="workbench-placeholder">
              <h2>{text.placeholderTitle}</h2>
              <p>{text.placeholderBody}</p>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
