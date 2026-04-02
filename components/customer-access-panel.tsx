'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCustomerAccess } from '@/components/customer-access-provider';

type CustomerAccessPanelProps = {
  title?: string;
  description?: string;
  error?: string | null;
};

export function CustomerAccessPanel({
  title = 'Customer Access Required',
  description = 'Dashboard counts, benchmark views, and restricted customer data require a valid API token or API key.',
  error = null,
}: CustomerAccessPanelProps) {
  const { hasToken, apiConfigured, savePending, authError, saveToken, clearToken } = useCustomerAccess();
  const [draftToken, setDraftToken] = useState('');

  useEffect(() => {
    if (!hasToken) {
      setDraftToken('');
    }
  }, [hasToken]);

  const effectiveError = error || authError;

  return (
    <div className="page-stack">
      <section className="hero-panel compact">
        <div className="eyebrow">Customer Access</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </section>

      {!apiConfigured ? (
        <section className="panel danger">
          <div className="section-head">
            <h2>Portal Misconfigured</h2>
            <span>API unavailable</span>
          </div>
          <p className="muted">
            `WORLDPRESSRADAR_API_BASE_URL` is not configured on the portal server, so this portal cannot proxy
            customer data yet.
          </p>
        </section>
      ) : null}

      <section className="panel">
        <div className="section-head">
          <h2>Token</h2>
          <span>{hasToken ? 'Stored in secure portal session' : 'Required before data loads'}</span>
        </div>
        {effectiveError ? <div className="danger-banner">{effectiveError}</div> : null}
        <label>
          <span>API token or API key</span>
          <input
            placeholder="Paste customer token"
            type="password"
            value={draftToken}
            onChange={(event) => setDraftToken(event.target.value)}
          />
        </label>
        <div className="toolbar">
          <button
            className="button"
            type="button"
            onClick={() => void saveToken(draftToken)}
            disabled={!draftToken.trim() || savePending || !apiConfigured}
          >
            {savePending ? 'Saving...' : 'Save token'}
          </button>
          <button className="button" type="button" onClick={() => void clearToken()} disabled={!hasToken || savePending}>
            Clear token
          </button>
          <Link href="/">Go to Dashboard</Link>
          <Link href="/benchmark/">Open Benchmark</Link>
        </div>
        <div className="muted">
          A valid token unlocks restricted dashboard, benchmark, and export features.
        </div>
      </section>
    </div>
  );
}
