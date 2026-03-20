import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CustomerAccessProvider } from '@/components/customer-access-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'World Press Radar Customer Portal',
  description: 'Customer news intelligence portal for filtered article access and live coverage summaries.',
};

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/explorer/', label: 'Explorer' },
  { href: '/access/', label: 'Access' },
];

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <CustomerAccessProvider>
          <div className="app-shell">
            <header className="site-header">
              <div>
                <span className="brand-kicker">World Press Radar</span>
                <p>Customer-only news intelligence portal. A valid API token is required to load article data.</p>
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
        </CustomerAccessProvider>
      </body>
    </html>
  );
}
