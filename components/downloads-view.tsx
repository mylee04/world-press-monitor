'use client';

import { CustomerAccessPanel } from '@/components/customer-access-panel';
import { useCustomerAccess } from '@/components/customer-access-provider';

export function DownloadsView() {
  const { hasToken, isReady } = useCustomerAccess();

  if (!isReady) {
    return <div className="panel muted">Checking customer access...</div>;
  }

  if (!hasToken) {
    return (
      <CustomerAccessPanel
        title="Downloads Locked"
        description="Anonymous users do not receive news article downloads. Customers can export only the current Explorer result page after providing a valid token."
      />
    );
  }

  return (
    <div className="page-stack">
      <section className="hero-panel compact">
        <div className="eyebrow">Downloads</div>
        <h1>Bulk public exports are disabled in the customer portal.</h1>
        <p>
          This portal no longer publishes static article files, manifest indexes, or hourly CSV snapshots.
          Customers can export the current filtered Explorer page instead of downloading the old public shard set.
        </p>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>What changed</h2>
          <span>Customer-only mode</span>
        </div>
        <div className="link-list">
          <div>No public `manifest.json` download links are exposed from this portal build.</div>
          <div>No public `latest-24h.csv` or shard JSON files are exposed from this portal build.</div>
          <div>Use the Explorer page to export only the current page of authenticated search results.</div>
        </div>
      </section>
    </div>
  );
}
