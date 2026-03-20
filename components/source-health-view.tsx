'use client';

import { CustomerAccessPanel } from '@/components/customer-access-panel';
import { useCustomerAccess } from '@/components/customer-access-provider';

export function SourceHealthView() {
  const { hasToken, isReady, apiConfigured } = useCustomerAccess();

  if (!isReady) {
    return <div className="panel muted">Checking customer access...</div>;
  }

  if (!apiConfigured && isReady) {
    return (
      <CustomerAccessPanel
        title="Portal API Not Configured"
        description="This customer portal requires a server-side World Press Radar API base URL before authenticated source-health access can work."
      />
    );
  }

  if (!hasToken) {
    return (
      <CustomerAccessPanel
        title="Source Health Restricted"
        description="Source health is not published anonymously. Internal or customer access requires a valid token and a dedicated authenticated source-health API."
      />
    );
  }

  return (
    <div className="page-stack">
      <section className="hero-panel compact">
        <div className="eyebrow">Source Health</div>
        <h1>Source health is not exposed in this customer portal build.</h1>
        <p>
          The old static `sources.json` snapshot is no longer served publicly. If source-health access is needed,
          it should move to a dedicated authenticated API rather than a static export file.
        </p>
      </section>
    </div>
  );
}
