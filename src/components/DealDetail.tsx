'use client';
import { Pane, badgeOf } from './ui';
import { fmtInrShort, fmtUsdShort, stageLabel } from './fmt';
import type { Deal } from '@/lib/client-types';

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex gap-2"><span className="dim shrink-0" style={{ width: '11ch' }}>{k}</span><span className="wrap min-w-0">{v}</span></div>;
export function DealDetail({ deal, inr, onClose }: { deal: Deal; inr: number; onClose: () => void }) {
  const [bl, bc] = badgeOf(deal.confidence);
  const leads = deal.investors.filter(i => i.role === 'lead'), others = deal.investors.filter(i => i.role !== 'lead');
  const orig = deal.amount_value != null ? `${deal.amount_currency} ${deal.amount_value} ${deal.amount_unit}` : 'undisclosed';
  return (
    <Pane title={`DEAL: ${deal.company_name}`} solid right={<button className="btn" style={{ borderColor: '#000', color: '#000' }} onClick={onClose} autoFocus aria-label="close detail (esc)">[ :q ]</button>}>
      <div className="space-y-1">
        <Row k="status" v={<span className={bc}>[{bl}]{deal.status === 'REPORTED_IN_TALKS' ? ' — reported, in talks' : ''}{!deal.evidence_verified ? ' — evidence check failed' : ''}</span>} />
        <Row k="what" v={deal.description ?? '—'} />
        <Row k="amount" v={`${fmtUsdShort(deal.amount_usd)} / ${fmtInrShort(deal.amount_usd, inr)}  (as written: ${orig})`} />
        <Row k="stage" v={`${stageLabel(deal.stage)} · ${deal.instrument}`} />
        <Row k="sector" v={`${deal.sector ?? '—'} (raw: ${deal.sector_raw ?? '—'})`} />
        <Row k="city" v={deal.hq_city ?? '—'} />
        <Row k="week" v={`${deal.week_start}${deal.announcement_date ? ` · announced ${deal.announcement_date}` : ''}`} />
        <Row k="lead" v={leads.map(i => i.name).join(', ') || '—'} />
        <Row k="others" v={others.map(i => i.name).join(', ') || '—'} />
        {deal.watchlist_hit && <Row k="watchlist" v={<span className="err">EXACT MATCH: {deal.watchlist_hit}</span>} />}
        {deal.adjacency?.is_adjacent && <Row k="adjacency" v={<span className="amber">{deal.adjacency.relationship?.toUpperCase()} of {deal.adjacency.watchlist_company} — {deal.adjacency.reason}</span>} />}
      </div>
      <div className="mt-2 border-t border-dashed border-border pt-1"><div className="amber caps">// evidence</div>
        {(['amount', 'stage', 'investors'] as const).map(k => deal.evidence?.[k] ? <div key={k} className="wrap"><span className="dim">{k}:</span> “{deal.evidence[k]}”</div> : null)}
        {!deal.evidence?.amount && !deal.evidence?.stage && !deal.evidence?.investors && <div className="dim">no verified quotes stored</div>}
      </div>
      <div className="mt-2 border-t border-dashed border-border pt-1"><div className="amber caps">// sources ({deal.sources.length})</div>
        {deal.sources.map(s => <div key={s.url} className="wrap">- <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> <span className="dim">{s.title}</span></div>)}</div>
      <div className="mt-2 dim border-t border-dashed border-border pt-1">first seen {new Date(deal.first_seen).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })} · updated {new Date(deal.last_updated).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })} IST</div>
    </Pane>
  );
}
