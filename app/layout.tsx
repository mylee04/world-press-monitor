import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PressLab Global Radar',
  description: 'Real-time newsroom intelligence dashboard'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
