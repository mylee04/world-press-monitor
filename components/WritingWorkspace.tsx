'use client';

import { useMemo, useState } from 'react';
import type { NewsItem } from '@/lib/types';
import {
  draftIdFromLink,
  isLikelyBreakingTitle,
  nowIso,
  normalizeLinkForId,
  parseDateSafe,
  type DraftRecord,
} from '@/lib/pipeline';

type Locale = 'en' | 'es';

type Props = {
  locale: Locale;
  drafts: DraftRecord[];
  setDrafts: React.Dispatch<React.SetStateAction<DraftRecord[]>>;
  onSentToDistribution?: (draftId: string) => void;
};

const COPY: Record<Locale, Record<string, string>> = {
  en: {
    title: 'Writing Workspace',
    subtitle: 'Breaking detection to Spanish newsroom draft',
    discover: 'Discover Breaking',
    discovering: 'Discovering...',
    queue: 'Draft Queue',
    empty: 'No drafts yet. Run breaking discovery first.',
    source: 'Source',
    published: 'Published',
    statusDraft: 'Draft',
    statusApproved: 'Approved',
    statusPublished: 'Published',
    regenerate: 'Regenerate Draft',
    saving: 'Saving...',
    approve: 'Approve & Send to Distribution',
    approved: 'Approved',
    headline: 'Headline (ES)',
    body: 'Body (ES)',
    origin: 'Original Article',
    openArticle: 'Open source link',
    countNew: 'new drafts',
    lastRun: 'Last discovery',
    notes: 'Editor can revise text before approval.'
  },
  es: {
    title: 'Workspace de Redacción',
    subtitle: 'Detección de breaking a borrador periodístico en español',
    discover: 'Detectar Breaking',
    discovering: 'Detectando...',
    queue: 'Cola de borradores',
    empty: 'No hay borradores. Ejecuta la detección de breaking.',
    source: 'Fuente',
    published: 'Publicado',
    statusDraft: 'Borrador',
    statusApproved: 'Aprobado',
    statusPublished: 'Publicado',
    regenerate: 'Regenerar borrador',
    saving: 'Guardando...',
    approve: 'Aprobar y enviar a Distribución',
    approved: 'Aprobado',
    headline: 'Titular (ES)',
    body: 'Cuerpo (ES)',
    origin: 'Artículo original',
    openArticle: 'Abrir enlace',
    countNew: 'borradores nuevos',
    lastRun: 'Última detección',
    notes: 'El editor puede revisar el texto antes de aprobar.'
  }
};

function isBreakingCandidate(item: NewsItem): boolean {
  const freshCutoff = Date.now() - 6 * 60 * 60 * 1000;
  const ts = parseDateSafe(item.publishedAt);
  if (!ts || ts < freshCutoff) return false;
  return Boolean(item.tags?.includes('breaking')) || isLikelyBreakingTitle(item.title);
}

async function generateDraftFromArticle(item: NewsItem): Promise<Pick<DraftRecord, 'headlineEs' | 'bodyEs'>> {
  const response = await fetch('/api/ai/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: item.title,
      source: item.source,
      link: item.link,
      publishedAt: item.publishedAt
    })
  });
  const json = await response.json().catch(() => null) as { headlineEs?: string; bodyEs?: string } | null;
  if (!response.ok || !json?.headlineEs || !json?.bodyEs) {
    return {
      headlineEs: item.title,
      bodyEs: `${item.source} reportó: ${item.title}\n\nFuente: ${item.link}`
    };
  }
  return {
    headlineEs: json.headlineEs,
    bodyEs: json.bodyEs
  };
}

async function generateDistribution(headlineEs: string, bodyEs: string, link: string): Promise<DraftRecord['distribution'] | undefined> {
  const response = await fetch('/api/ai/repurpose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ headlineEs, bodyEs, link })
  });
  const json = await response.json().catch(() => null) as DraftRecord['distribution'] | null;
  if (!response.ok || !json) return undefined;
  if (!json.twitter || !json.instagram || !json.linkedin || !json.tiktok || !json.newsletter) {
    return undefined;
  }
  return json;
}

export function WritingWorkspace({ locale, drafts, setDrafts, onSentToDistribution }: Props) {
  const t = COPY[locale];
  const [selectedId, setSelectedId] = useState<string>(drafts[0]?.id || '');
  const [discovering, setDiscovering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusLine, setStatusLine] = useState<string>('');

  const orderedDrafts = useMemo(
    () => [...drafts].sort((a, b) => parseDateSafe(b.updatedAt) - parseDateSafe(a.updatedAt)),
    [drafts]
  );
  const selected = orderedDrafts.find((draft) => draft.id === selectedId) || orderedDrafts[0];

  const setSelectedPatch = (patch: Partial<DraftRecord>) => {
    if (!selected) return;
    setDrafts((prev) => prev.map((item) => (
      item.id === selected.id ? { ...item, ...patch, updatedAt: nowIso() } : item
    )));
  };

  const discoverBreaking = async () => {
    setDiscovering(true);
    setStatusLine('');
    try {
      const response = await fetch('/api/news?limit=3500');
      if (!response.ok) throw new Error(`news_${response.status}`);
      const json = await response.json() as { items?: NewsItem[] };
      const items = (json.items || []).filter(isBreakingCandidate);
      const existing = new Set(drafts.map((d) => normalizeLinkForId(d.sourceLink)));
      const candidates = items.filter((item) => !existing.has(normalizeLinkForId(item.link))).slice(0, 8);
      if (candidates.length === 0) {
        setStatusLine(`0 ${t.countNew}`);
        return;
      }

      const created: DraftRecord[] = [];
      for (const item of candidates) {
        const draft = await generateDraftFromArticle(item);
        const createdAt = nowIso();
        created.push({
          id: draftIdFromLink(item.link),
          sourceArticleId: draftIdFromLink(item.link),
          source: item.source,
          sourceLink: item.link,
          sourceTitle: item.title,
          sourcePublishedAt: item.publishedAt,
          status: 'draft',
          headlineEs: draft.headlineEs,
          bodyEs: draft.bodyEs,
          createdAt,
          updatedAt: createdAt
        });
      }

      setDrafts((prev) => {
        const dedup = new Map(prev.map((d) => [normalizeLinkForId(d.sourceLink), d]));
        for (const item of created) {
          dedup.set(normalizeLinkForId(item.sourceLink), item);
        }
        return [...dedup.values()];
      });
      setSelectedId(created[0].id);
      setStatusLine(`${created.length} ${t.countNew} · ${t.lastRun}: ${new Date().toLocaleTimeString()}`);
    } catch {
      setStatusLine('error');
    } finally {
      setDiscovering(false);
    }
  };

  const regenerateSelected = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const regenerated = await generateDraftFromArticle({
        id: selected.sourceArticleId,
        title: selected.sourceTitle,
        link: selected.sourceLink,
        source: selected.source,
        tier: 2,
        publishedAt: selected.sourcePublishedAt,
        beat: 'world',
        confidence: 0.5,
        classificationSource: 'keyword'
      });
      setSelectedPatch({
        headlineEs: regenerated.headlineEs,
        bodyEs: regenerated.bodyEs
      });
    } finally {
      setSaving(false);
    }
  };

  const approveAndSend = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const distribution = selected.distribution || await generateDistribution(
        selected.headlineEs,
        selected.bodyEs,
        selected.sourceLink
      );
      const approvedAt = nowIso();
      setSelectedPatch({
        status: 'approved',
        approvedAt,
        distribution
      });
      onSentToDistribution?.(selected.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="workspace-shell">
      <header className="workspace-head">
        <h2>{t.title}</h2>
        <p>{t.subtitle}</p>
      </header>

      <div className="workspace-grid">
        <aside className="workspace-list">
          <div className="workspace-actions">
            <button type="button" onClick={discoverBreaking} disabled={discovering}>
              {discovering ? t.discovering : t.discover}
            </button>
            <small>{statusLine || t.notes}</small>
          </div>
          <h3>{t.queue}</h3>
          {orderedDrafts.length === 0 ? (
            <p className="workspace-empty">{t.empty}</p>
          ) : (
            <div className="workspace-scroll">
              {orderedDrafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  className={`workspace-item ${selected?.id === draft.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(draft.id)}
                >
                  <strong>{draft.headlineEs || draft.sourceTitle}</strong>
                  <span>{draft.source}</span>
                  <span>{new Date(draft.sourcePublishedAt).toLocaleString()}</span>
                  <code>{draft.status === 'draft' ? t.statusDraft : draft.status === 'approved' ? t.statusApproved : t.statusPublished}</code>
                </button>
              ))}
            </div>
          )}
        </aside>

        <article className="workspace-editor">
          {!selected ? null : (
            <>
              <div className="workspace-meta">
                <h3>{t.origin}</h3>
                <p>{selected.sourceTitle}</p>
                <p>{t.source}: {selected.source}</p>
                <p>{t.published}: {new Date(selected.sourcePublishedAt).toLocaleString()}</p>
                <a href={selected.sourceLink} target="_blank" rel="noreferrer">{t.openArticle}</a>
              </div>

              <label>
                {t.headline}
                <input
                  value={selected.headlineEs}
                  onChange={(event) => setSelectedPatch({ headlineEs: event.target.value })}
                />
              </label>

              <label>
                {t.body}
                <textarea
                  value={selected.bodyEs}
                  onChange={(event) => setSelectedPatch({ bodyEs: event.target.value })}
                  rows={14}
                />
              </label>

              <div className="workspace-actions-row">
                <button type="button" onClick={regenerateSelected} disabled={saving}>
                  {saving ? t.saving : t.regenerate}
                </button>
                <button
                  type="button"
                  onClick={approveAndSend}
                  disabled={saving || selected.status === 'published'}
                >
                  {selected.status === 'approved' || selected.status === 'published'
                    ? t.approved
                    : (saving ? t.saving : t.approve)}
                </button>
              </div>
            </>
          )}
        </article>
      </div>
    </section>
  );
}
