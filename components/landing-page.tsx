import Link from 'next/link';
import styles from '@/components/landing-page.module.css';

const signalClusters = [
  { id: 'north-west', position: 'northWest', bars: 4, delayStep: 0.28, widthOffset: 0 },
  { id: 'west-mid', position: 'westMid', bars: 5, delayStep: 0.22, widthOffset: 8 },
  { id: 'east-mid', position: 'eastMid', bars: 4, delayStep: 0.26, widthOffset: 14 },
  { id: 'south-east', position: 'southEast', bars: 5, delayStep: 0.24, widthOffset: 6 },
];

const metricItems = [
  { value: '24/7', label: 'Continuous signal watch' },
  { value: '190+', label: 'Country and territory lenses' },
  { value: '4X', label: 'Views across dashboard, benchmark, map, and access' },
];

const capabilityCards = [
  {
    title: 'Signal-first dashboard',
    description: 'Track rolling article volume, section mix, and top-country drift without exposing raw source rows.',
  },
  {
    title: 'Benchmark windows',
    description: 'Move from hourly pulse to fixed-period comparisons when a region starts to break from baseline.',
  },
  {
    title: 'Controlled source access',
    description: 'Keep private map drill-down and source detail views gated behind customer token access.',
  },
];

export function LandingPage() {
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
          <h1>High-signal monitoring for the world&apos;s newsrooms.</h1>
          <p>
            WPR can absolutely carry this kind of cinematic interface. The moving red blocks here are built as
            lightweight CSS signal bursts, so they appear, intensify, and fade across the canvas without adding heavy
            browser overhead.
          </p>
          <div className={styles.heroActions}>
            <Link href="/dashboard/">Open Dashboard</Link>
            <Link href="/map/">Launch Map</Link>
            <Link href="/benchmark/">Compare Benchmarks</Link>
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

      <section className={styles.capabilityGrid}>
        {capabilityCards.map((card) => (
          <article className={styles.capabilityCard} key={card.title}>
            <span className={styles.cardKicker}>Core Surface</span>
            <h2>{card.title}</h2>
            <p>{card.description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
