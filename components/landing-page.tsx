import { headers } from 'next/headers';
import Link from 'next/link';
import { readDashboardSummarySnapshot } from '@/lib/customer-dashboard-snapshot-store';
import type { NewsApiDashboardSummaryResponse } from '@/lib/news-api';
import styles from '@/components/landing-page.module.css';

const signalClusters = [
  { id: 'north-west', position: 'northWest', bars: 4, delayStep: 0.28, widthOffset: 0 },
  { id: 'west-mid', position: 'westMid', bars: 5, delayStep: 0.22, widthOffset: 8 },
  { id: 'east-mid', position: 'eastMid', bars: 4, delayStep: 0.26, widthOffset: 14 },
  { id: 'south-east', position: 'southEast', bars: 5, delayStep: 0.24, widthOffset: 6 },
] as const;

const ctaItems = [
  {
    href: '/dashboard/',
    label: 'Enter The Feed',
    previewPosition: 'previewLeft',
    previewEyebrow: 'Dashboard',
    previewTitle: 'Topic Distribution',
    previewImageSrc: '/landing/cta-dashboard-preview.png',
    previewImageAlt: 'Dashboard topic distribution preview',
    previewImagePosition: 'center top',
  },
  {
    href: '/map/',
    label: 'Watch The Map',
    previewPosition: 'previewRight',
    previewEyebrow: 'Map',
    previewTitle: 'World Publishing Pulse',
    previewImageSrc: '/landing/cta-map-preview.png',
    previewImageAlt: 'World publishing pulse map preview',
    previewImagePosition: '54% top',
  },
] as const;

async function getLandingMetricItems() {
  const summary = await readDashboardSummarySnapshot();
  const snapshotInserted24h = summary?.storage === 'postgres' ? summary.totals.inserted24h : 0;

  let inserted24h = snapshotInserted24h;

  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host');
    if (host) {
      const protocol =
        requestHeaders.get('x-forwarded-proto') ||
        (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');
      const response = await fetch(`${protocol}://${host}/api/customer/dashboard/summary/`, {
        cache: 'no-store',
      });

      if (response.ok) {
        const payload = (await response.json()) as NewsApiDashboardSummaryResponse;
        if (payload?.storage === 'postgres') {
          inserted24h = payload.totals.inserted24h;
        }
      }
    }
  } catch {
    inserted24h = snapshotInserted24h;
  }

  return [
    { value: '71', label: 'Countries Under Watch' },
    { value: '4,005', label: 'Global Newsrooms' },
    {
      value: inserted24h > 0 ? inserted24h.toLocaleString() : '24/7',
      label: inserted24h > 0 ? 'Processed In 24h' : 'Continuous Signal Watch',
    },
  ];
}

export async function LandingPage() {
  const metricItems = await getLandingMetricItems();

  return (
    <div className={`page-stack landing-page-root ${styles.root}`}>
      <section className={styles.hero}>
        <div className={styles.scene} aria-hidden="true">
          <div className={styles.radarHalo} />
          <div className={styles.radarOrbit} />
          <div className={styles.radarOrbitInner} />
          <div className={styles.radarNeedle} />
          {signalClusters.map((cluster) => (
            <div className={`${styles.signalCluster} ${styles[cluster.position]}`} key={cluster.id}>
              <div className={styles.signalGrid} />
              <div className={styles.signalBars}>
                {Array.from({ length: cluster.bars }).map((_, index) => (
                  <span
                    key={`${cluster.id}-${index + 1}`}
                    style={{
                      width: `${64 + cluster.widthOffset + index * 8}%`,
                      animationDelay: `${index * cluster.delayStep}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.heroContent}>
          <div className="eyebrow">World Press Radar</div>
          <h1>
            <span className={styles.headlineLine}>See the world break,</span>
            <span className={styles.headlineLine}>in real time.</span>
          </h1>
          <p>Track pressure shifts across global newsrooms before the narrative settles.</p>
          <div className={styles.heroActions}>
            {ctaItems.map((item, index) => (
              <div className={`${styles.ctaItem} ${styles[item.previewPosition]}`} key={item.label}>
                <Link href={item.href} className={index === 0 ? styles.primaryCta : undefined}>
                  {item.label}
                </Link>
                <div className={styles.ctaPreview} aria-hidden="true">
                  <div className={styles.ctaPreviewHeader}>
                    <span className={styles.ctaPreviewEyebrow}>{item.previewEyebrow}</span>
                    <strong className={styles.ctaPreviewTitle}>{item.previewTitle}</strong>
                  </div>
                  <div className={styles.ctaPreviewFrame}>
                    <img
                      src={item.previewImageSrc}
                      alt={item.previewImageAlt}
                      width={1040}
                      height={640}
                      className={styles.ctaPreviewImage}
                      style={{ objectPosition: item.previewImagePosition }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.metricRail}>
            {metricItems.map((item) => (
              <article className={styles.metricPill} key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
