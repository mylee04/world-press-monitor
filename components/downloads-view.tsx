'use client';

import { useManifest } from '@/components/public-data-hooks';
import { withBasePath } from '@/lib/site-paths';

export function DownloadsView() {
  const manifestState = useManifest();
  const manifest = manifestState.data;

  if (manifestState.loading && !manifest) {
    return <div className="panel muted">Loading manifest...</div>;
  }

  if (manifestState.error) {
    return <div className="panel danger">Manifest load failed: {manifestState.error}</div>;
  }

  if (!manifest) {
    return <div className="panel muted">No static export available yet.</div>;
  }

  return (
    <div className="page-stack">
      <section className="hero-panel compact">
        <div className="eyebrow">Downloads</div>
        <h1>Static file entry points</h1>
        <p>
          Common CSV ranges are prebuilt. JSON shards stay addressable directly so the web app can
          fetch only the slices it needs.
        </p>
      </section>

      <section className="grid-two">
        <article className="panel">
          <div className="section-head">
            <h2>CSV downloads</h2>
            <span>{manifest.downloads.byDate.length + manifest.downloads.byCountryMonth.length + 1} files</span>
          </div>
          <div className="link-list">
            <a href={withBasePath(manifest.downloads.latest24h) || '#'}>latest-24h.csv</a>
            {manifest.downloads.byDate.map((path) => (
              <a href={withBasePath(path) || '#'} key={path}>
                {path.replace('/data/downloads/', '')}
              </a>
            ))}
            {manifest.downloads.byCountryMonth.map((path) => (
              <a href={withBasePath(path) || '#'} key={path}>
                {path.replace('/data/downloads/', '')}
              </a>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="section-head">
            <h2>JSON shards</h2>
            <span>{manifest.availableDates.length + Object.keys(manifest.countryMonths).length} groups</span>
          </div>
          <div className="link-list">
            <a href={withBasePath('/data/manifest.json') || '#'}>manifest.json</a>
            <a href={withBasePath('/data/sources.json') || '#'}>sources.json</a>
            {manifest.availableDates.map((date) => (
              <a href={withBasePath(`/data/by-date/${date}.json`) || '#'} key={date}>
                by-date/{date}.json
              </a>
            ))}
            {Object.entries(manifest.countryMonths).flatMap(([countryCode, months]) =>
              months.map((month) => (
                <a
                  href={withBasePath(`/data/by-country/${countryCode}/${month}.json`) || '#'}
                  key={`${countryCode}-${month}`}
                >
                  by-country/{countryCode}/{month}.json
                </a>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
