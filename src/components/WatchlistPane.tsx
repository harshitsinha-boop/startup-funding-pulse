'use client';
import { Pane } from './ui';
import { fmtUsdShort } from './fmt';
import type { Deal } from '@/lib/client-types';

export function WatchlistPane({ deals, total, onOpen }: { deals: Deal[]; total: number; onOpen: (d: Deal) => void }) {
  const hits = deals.filter(d => d.watchlist_hit || d.adjacency?.is_adjacent);
  return (
    <Pane title="WATCHLIST_ALERTS" right={<span className={hits.length ? 'err' : 'dim'}>{hits.length ? '[!]' : '[OK]'}</span>}>
      {hits.length === 0 ? <div className="dim">[OK] no hits this week · {total} compan{total === 1 ? 'y' : 'ies'} monitored{total === 0 ? ' — add some in /config' : ''}</div> :
        hits.map(d => (
          <button key={d.id} onClick={() => onOpen(d)} className="block w-full text-left py-1 border-b border-dashed border-border hover:bg-[#0d2a0d]" style={{ background: 'none', border: 0, color: 'inherit', font: 'inherit' }}>
            <span className="err">[!]</span> <b>{d.company_name}</b> <span className="dim">{fmtUsdShort(d.amount_usd)} {d.stage}</span><br />
            {d.watchlist_hit ? <span className="err">EXACT: {d.watchlist_hit}</span> : <span className="amber wrap">{d.adjacency?.relationship} of {d.adjacency?.watchlist_company}: {d.adjacency?.reason}</span>}
          </button>))}
    </Pane>
  );
}
