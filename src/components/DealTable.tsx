'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pane, badgeOf } from './ui';
import { fmtInrShort, fmtUsdShort, stageLabel } from './fmt';
import type { Deal } from '@/lib/client-types';

type Key = 'score' | 'company_name' | 'amount_usd' | 'stage' | 'sector' | 'confidence';
export function DealTable({ deals, inr, selectedId, onOpen, title }: { deals: Deal[]; inr: number; selectedId: string | null; onOpen: (d: Deal) => void; title: string }) {
  const [key, setKey] = useState<Key>('score'); const [dir, setDir] = useState<1 | -1>(-1); const [cur, setCur] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => [...deals].sort((a, b) => {
    const x = (a as any)[key] ?? (key === 'amount_usd' ? -1 : ''), y = (b as any)[key] ?? (key === 'amount_usd' ? -1 : '');
    return (x > y ? 1 : x < y ? -1 : 0) * dir;
  }), [deals, key, dir]);
  useEffect(() => { setCur(c => Math.min(c, Math.max(0, rows.length - 1))); }, [rows.length]);
  const th = (k: Key, label: string, cls = '') => <th className={cls} onClick={() => { k === key ? setDir(d => (d === 1 ? -1 : 1)) : (setKey(k), setDir(-1)); }} aria-sort={k === key ? (dir === 1 ? 'ascending' : 'descending') : 'none'}>{label}{k === key ? (dir === 1 ? '▲' : '▼') : ''}</th>;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setCur(c => Math.min(rows.length - 1, c + 1)); }
    else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setCur(c => Math.max(0, c - 1)); }
    else if (e.key === 'Enter' && rows[cur]) onOpen(rows[cur]);
  };
  useEffect(() => { ref.current?.querySelector('tr.cur')?.scrollIntoView({ block: 'nearest' }); }, [cur]);
  return (
    <Pane title={title} right={<span className="dim">j/k move · enter open</span>}>
      <div ref={ref} className="overflow-auto" style={{ maxHeight: 360 }} tabIndex={0} onKeyDown={onKey} role="grid" aria-label="deal table — j and k to navigate, enter to open">
        <table className="t">
          <thead><tr>{th('company_name', 'company')}{th('stage', 'stage', '')}{th('sector', 'sector', 'hide-m')}{th('amount_usd', 'amount')}<th className="hide-m">₹</th>{th('confidence', 'conf')}{th('score', 'score', 'hide-m')}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="dim">[..] no deals match the current filters</td></tr>}
            {rows.map((d, i) => {
              const [bl, bc] = badgeOf(d.confidence); const alert = d.watchlist_hit || d.adjacency?.is_adjacent;
              return (
                <tr key={d.id} className={`row ${i === cur ? 'cur' : ''} ${d.id === selectedId ? 'sel' : ''}`} onClick={() => { setCur(i); onOpen(d); }}>
                  <td className="wrapword"><span className={alert ? 'err' : ''}>{alert ? '[!] ' : ''}</span>{d.company_name}</td>
                  <td className="nowrap-m">{stageLabel(d.stage)}</td>
                  <td className="hide-m">{d.sector ?? '—'}</td>
                  <td>{fmtUsdShort(d.amount_usd)}</td>
                  <td className="hide-m">{fmtInrShort(d.amount_usd, inr)}</td>
                  <td className={d.id === selectedId ? '' : bc}>[{bl}]</td>
                  <td className="hide-m dim">{d.score}</td>
                </tr>);
            })}
          </tbody>
        </table>
      </div>
    </Pane>
  );
}
