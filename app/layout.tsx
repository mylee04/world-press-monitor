import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'World Press Monitor',
  description: 'Public news snapshots, source health, and downloadable data from World Press Monitor.',
};

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/explorer/', label: 'Explorer' },
  { href: '/downloads/', label: 'Downloads' },
  { href: '/source-health/', label: 'Source Health' },
];

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="site-header">
            <div>
              <span className="brand-kicker">World Press Monitor</span>
              <p>Public news snapshots, source health, and downloadable data.</p>
            </div>
            <nav>
              {navItems.map((item) => (
                <Link href={item.href} key={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
