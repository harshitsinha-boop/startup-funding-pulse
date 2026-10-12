import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, VT323 } from 'next/font/google';
import './globals.css';

const jb = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jb', display: 'swap' });
const vt = VT323({ subsets: ['latin'], weight: '400', variable: '--font-vt', display: 'swap' });

export const metadata: Metadata = { title: 'STARTUP_FUNDING_PULSE', description: 'Weekly Indian startup funding intelligence — extracted, de-duplicated, ranked against your focus.' };
export const viewport: Viewport = { themeColor: '#0a0a0a', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en" className={`${jb.variable} ${vt.variable}`}><body className="font-mono">{children}<div className="crt" aria-hidden="true" /></body></html>);
}
