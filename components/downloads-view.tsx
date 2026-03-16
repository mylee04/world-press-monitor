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
          `latest-24h.csv` is prebuilt. JSON shards stay addressable directly so the web app can
          fetch only the slices it needs, and deeper CSV exports can be generated from Explorer.
        </p>
      </section>

      <section className="grid-two">
        <article className="panel">
          <div className="section-head">
            <h2>CSV downloads</h2>
            <span>
              {manifest.downloads.byDate.length + manifest.downloads.byCountryMonth.length + (manifest.downloads.latest24h ? 1 : 0)} files
            </span>
          </div>
          <div className="link-list">
            {manifest.downloads.latest24h ? (
              <a href={withBasePath(manifest.downloads.latest24h) || '#'}>latest-24h.csv</a>
            ) : null}
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
            {!manifest.downloads.latest24h && manifest.downloads.byDate.length === 0 && manifest.downloads.byCountryMonth.length === 0 ? (
              <div className="muted">No prebuilt CSV files published in this export.</div>
            ) : null}
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
