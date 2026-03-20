'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCustomerAccess } from '@/components/customer-access-provider';
import { hasNewsApiBaseUrl } from '@/lib/news-api';

type CustomerAccessPanelProps = {
  title?: string;
  description?: string;
  error?: string | null;
};

export function CustomerAccessPanel({
  title = 'Customer Access Required',
  description = 'News articles, live counts, and downloads are available only to customers with a valid API token or API key.',
  error = null,
}: CustomerAccessPanelProps) {
  const { token, hasToken, setToken, clearToken } = useCustomerAccess();
  const [draftToken, setDraftToken] = useState(token);
  const apiConfigured = hasNewsApiBaseUrl();

  useEffect(() => {
    setDraftToken(token);
  }, [token]);

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
            `NEXT_PUBLIC_NEWS_API_BASE_URL` is not configured, so this portal cannot request customer data yet.
          </p>
        </section>
      ) : null}

      <section className="panel">
        <div className="section-head">
          <h2>Token</h2>
          <span>{hasToken ? 'Saved in this browser' : 'Required before data loads'}</span>
        </div>
        {error ? <div className="danger-banner">{error}</div> : null}
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
          <button className="button" type="button" onClick={() => setToken(draftToken)} disabled={!draftToken.trim()}>
            Save token
          </button>
          <button className="button" type="button" onClick={clearToken} disabled={!hasToken}>
            Clear token
          </button>
          <Link href="/">Go to Dashboard</Link>
          <Link href="/explorer/">Open Explorer</Link>
        </div>
        <div className="muted">
          Without a valid token, this portal does not request article data and does not expose static export downloads.
        </div>
      </section>
    </div>
  );
}
