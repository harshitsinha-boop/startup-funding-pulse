'use client';
import { fmtUsdShort } from './fmt';
import type { Deal } from '@/lib/client-types';

export function Ticker({ deals, inr }: { deals: Deal[]; inr: number }) {
  const items = deals.filter(d => d.status !== 'REPORTED_IN_TALKS').slice(0, 20);
  if (!items.length) return <div className="ticker dim px-2" aria-hidden>[..] awaiting deals</div>;
  const row = items.map(d => <span key={d.id}>{d.company_name.toUpperCase()} <span className="ok">▲</span> {(d.stage ?? 'N/A')} {fmtUsdShort(d.amount_usd)}{d.amount_usd ? `/${Math.round((d.amount_usd * inr) / 1e7)}CR` : ''}</span>);
  return <div className="ticker px-2" role="marquee" aria-label="latest deals ticker"><div className="ticker-track">{row}{row}</div></div>;
}
