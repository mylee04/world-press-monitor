'use client';

import { useMemo, useState } from 'react';
import type { DistributionPayload, DraftRecord, DistributionPlatform } from '@/lib/pipeline';
import { nowIso, parseDateSafe } from '@/lib/pipeline';

type Locale = 'en' | 'es';

type Props = {
  locale: Locale;
  drafts: DraftRecord[];
  setDrafts: React.Dispatch<React.SetStateAction<DraftRecord[]>>;
};

const PLATFORMS: Array<{ key: DistributionPlatform; title: string }> = [
  { key: 'twitter', title: 'Tweet Generator' },
  { key: 'instagram', title: 'Create Instagram posts' },
  { key: 'linkedin', title: 'Create LinkedIn posts' },
  { key: 'tiktok', title: 'Create TikTok captions' },
  { key: 'newsletter', title: 'Format newsletter' }
];

const COPY: Record<Locale, Record<string, string>> = {
  en: {
    title: 'Distribution Workspace',
    subtitle: 'Approved drafts to multi-platform output',
    empty: 'No approved draft yet. Approve one in Writing first.',
    draftQueue: 'Approved Queue',
    generate: 'Generate Distribution',
    generating: 'Generating...',
    copy: 'Copy',
    published: 'Mark Published',
    statusApproved: 'Approved',
    statusPublished: 'Published',
    publishedAt: 'Published at',
    source: 'Source'
  },
  es: {
    title: 'Workspace de Distribución',
    subtitle: 'Borradores aprobados a salida multicanal',
    empty: 'Aún no hay borrador aprobado. Apruébalo en Redacción primero.',
    draftQueue: 'Cola aprobada',
    generate: 'Generar Distribución',
    generating: 'Generando...',
    copy: 'Copiar',
    published: 'Marcar Publicado',
    statusApproved: 'Aprobado',
    statusPublished: 'Publicado',
    publishedAt: 'Publicado en',
    source: 'Fuente'
  }
};

async function createDistributionPayload(draft: DraftRecord): Promise<DistributionPayload | null> {
  const response = await fetch('/api/ai/repurpose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      headlineEs: draft.headlineEs,
      bodyEs: draft.bodyEs,
      link: draft.sourceLink
    })
  });
  const json = await response.json().catch(() => null) as DistributionPayload | null;
  if (!response.ok || !json) return null;
  if (!json.twitter || !json.instagram || !json.linkedin || !json.tiktok || !json.newsletter) return null;
  return json;
}

export function DistributionWorkspace({ locale, drafts, setDrafts }: Props) {
  const t = COPY[locale];
  const [selectedId, setSelectedId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const approvedDrafts = useMemo(
    () => drafts
      .filter((draft) => draft.status === 'approved' || draft.status === 'published')
      .sort((a, b) => parseDateSafe(b.updatedAt) - parseDateSafe(a.updatedAt)),
    [drafts]
  );
  const selected = approvedDrafts.find((draft) => draft.id === selectedId) || approvedDrafts[0];

  const patchSelected = (patch: Partial<DraftRecord>) => {
    if (!selected) return;
    setDrafts((prev) => prev.map((item) => (
      item.id === selected.id ? { ...item, ...patch, updatedAt: nowIso() } : item
    )));
  };

  const generate = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const payload = await createDistributionPayload(selected);
      if (!payload) return;
      patchSelected({ distribution: payload });
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // no-op
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
          <h3>{t.draftQueue}</h3>
          {approvedDrafts.length === 0 ? (
            <p className="workspace-empty">{t.empty}</p>
          ) : (
            <div className="workspace-scroll">
              {approvedDrafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  className={`workspace-item ${selected?.id === draft.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(draft.id)}
                >
                  <strong>{draft.headlineEs}</strong>
                  <span>{t.source}: {draft.source}</span>
                  <span>{new Date(draft.updatedAt).toLocaleString()}</span>
                  <code>{draft.status === 'published' ? t.statusPublished : t.statusApproved}</code>
                </button>
              ))}
            </div>
          )}
        </aside>

        <article className="workspace-editor">
          {!selected ? null : (
            <>
              <div className="workspace-actions-row">
                <button type="button" onClick={generate} disabled={busy}>
                  {busy ? t.generating : t.generate}
                </button>
                <button
                  type="button"
                  onClick={() => patchSelected({ status: 'published', publishedAt: nowIso() })}
                  disabled={busy || selected.status === 'published'}
                >
                  {selected.status === 'published' ? t.statusPublished : t.published}
                </button>
              </div>

              {selected.publishedAt ? (
                <p className="workspace-note">{t.publishedAt}: {new Date(selected.publishedAt).toLocaleString()}</p>
              ) : null}

              {!selected.distribution ? (
                <p className="workspace-empty">{t.empty}</p>
              ) : (
                <div className="distribution-grid">
                  {PLATFORMS.map((platform) => {
                    const value = selected.distribution?.[platform.key] || '';
                    return (
                      <section key={platform.key} className="distribution-card">
                        <header>
                          <h4>{platform.title}</h4>
                          <button type="button" onClick={() => copyText(value)}>{t.copy}</button>
                        </header>
                        <textarea
                          value={value}
                          onChange={(event) => {
                            patchSelected({
                              distribution: {
                                ...(selected.distribution || {
                                  twitter: '',
                                  instagram: '',
                                  linkedin: '',
                                  tiktok: '',
                                  newsletter: ''
                                }),
                                [platform.key]: event.target.value
                              } as DistributionPayload
                            });
                          }}
                          rows={8}
                        />
                      </section>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </article>
      </div>
    </section>
  );
}
