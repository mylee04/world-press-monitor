import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { CustomerAccessProvider } from '@/components/customer-access-provider';
import { PublicationTimeProvider } from '@/components/publication-time-provider';
import { TaxonomyLocaleProvider } from '@/components/taxonomy-locale-provider';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'World Press Radar',
  description: 'Global news publishing monitoring, source coverage, and map-based intelligence views.',
};

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/benchmark/', label: 'Benchmark' },
  { href: '/map/', label: 'Map' },
  { href: '/access/', label: 'Access' },
];

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <CustomerAccessProvider>
          <TaxonomyLocaleProvider>
            <PublicationTimeProvider>
              <div className="app-shell">
                <header className="site-header">
                  <div>
                    <span className="brand-kicker">World Press Radar</span>
                    <p>Global news publishing map, source coverage, and customer dashboard intelligence.</p>
                  </div>
                  <nav>
                    {navItems.map((item) => (
                      item.href === '/map/' ? (
                        // Hard-navigate to the map so stale country query state cannot survive.
                        <a href={item.href} key={item.href}>
                          {item.label}
                        </a>
                      ) : (
                        <Link href={item.href} key={item.href}>
                          {item.label}
                        </Link>
                      )
                    ))}
                  </nav>
                </header>
                <main>{children}</main>
              </div>
              <Analytics />
            </PublicationTimeProvider>
          </TaxonomyLocaleProvider>
        </CustomerAccessProvider>
      </body>
    </html>
  );
}
