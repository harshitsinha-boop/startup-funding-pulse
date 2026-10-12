'use client';
import { useState } from 'react';
import { Pane, Typewriter, usePrefersReducedMotion } from './ui';
import { bar, delta, spark } from '@/lib/ascii';
import { fmtUsdShort } from './fmt';
import type { DashData } from '@/lib/client-types';

export function CoverageMeter({ pct, matched }: { pct: number | null; matched?: string }) {
  if (pct == null) return <div className="dim">COVERAGE vs ENTRACKR [..............] pending — runs Sunday / [ RECONCILE ]</div>;
  return <div className="wrap">COVERAGE vs ENTRACKR <span className="ok">{bar(pct, 20)}</span> {pct}% {matched}</div>;
}

export function PatternsPane({ data, activeSector, onSector }: { data: DashData; activeSector?: string; onSector: (s: string) => void }) {
  const reduced = usePrefersReducedMotion(); const [i, setI] = useState(0);
  const s = data.stats; const sectors = Object.entries(s?.by_sector ?? {}).filter(([, v]: any) => v.cur.count || v.prev.count).sort((a: any, b: any) => b[1].cur.count - a[1].cur.count) as [string, any][];
  const focus = new Set(data.config.sectors);
  return (
    <Pane title="PATTERNS" right={<span className="dim">{s?.total.count ?? 0} deals · {fmtUsdShort(s?.total.usd)}</span>}>
      <CoverageMeter pct={data.coverage} />
      <div className="mt-2 overflow-x-auto"><pre className="m-0" style={{ fontFamily: 'inherit' }}>
        {sectors.length === 0 ? <span className="dim">[..] no sector data for this week yet</span> : sectors.slice(0, 8).map(([k, v]) => (
          <div key={k}><button className={`btn ${activeSector === k ? 'sel' : ''}`} style={{ border: 0, padding: 0 }} onClick={() => onSector(k)} aria-label={`filter by ${k}`}>
            {focus.has(k) ? '*' : ' '}{k.toUpperCase().padEnd(11).slice(0, 11)}</button> {bar(v.share_pct)} {String(v.share_pct).padStart(3)}% <span className={v.wow_pct == null ? 'dim' : v.wow_pct >= 0 ? 'ok' : 'err'}>{delta(v.wow_pct).padEnd(6)}</span> <span className="amber" style={{ fontFamily: "Menlo, Consolas, monospace", lineHeight: 1 }}>{spark(v.trend6)}</span> <span className="dim">6wk</span>
          </div>))}
      </pre></div>
      {s?.accelerating?.length > 0 && <div className="mt-1"><span className="ok">▲ accelerating:</span> {s.accelerating.join(', ')}</div>}
      {s?.cooling?.length > 0 && <div><span className="err">▼ cooling:</span> {s.cooling.join(', ')}</div>}
      <div className="mt-2 border-t border-dashed border-border pt-1">
        {data.insights.length === 0 ? <span className="dim">[..] no AI insights yet — [ GENERATE BRIEF NOW ] to narrate this week</span> : (
          <div className="wrap"><span className="amber">// </span><Typewriter key={i} reduced={reduced} text={`${data.insights[i].headline} — ${data.insights[i].detail}`} speed={14} onDone={() => data.insights.length > 1 && setTimeout(() => setI(x => (x + 1) % data.insights.length), 4000)} /></div>
        )}
      </div>
    </Pane>
  );
}
