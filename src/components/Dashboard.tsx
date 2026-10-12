'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Box } from 'lucide-react';
import { Pane, Btn, Err, LOGO, Spinner, Typewriter, usePrefersReducedMotion } from './ui';
import { LiveFeed } from './LiveFeed';
import { Ticker } from './Ticker';
import { DealTable } from './DealTable';
import { DealDetail } from './DealDetail';
import { PatternsPane } from './PatternsPane';
import { WatchlistPane } from './WatchlistPane';
import { CommandBar, type CmdHandle } from './CommandBar';
import { AdminControls } from './AdminControls';
import type { Pick } from './CapitalMap';
import { parseCommand, type Filters } from '@/lib/commands';
import { sb } from '@/lib/supabase-browser';
import type { DashData, Deal, FeedEvent } from '@/lib/client-types';

const CapitalMap = dynamic(() => import('./CapitalMap'), { ssr: false, loading: () => <div className="p-2"><Spinner label="loading CAPITAL_MAP.3D" /></div> });
const BOOT = ['BOOT pulse.sh v1.0 ........ [OK]', 'MOUNT supabase://deals ...... [OK]', 'LOAD  gemini extractor ...... [OK]', 'SYNC  realtime channel ...... [OK]'];

function isoWeek(ymd: string) { const d = new Date(ymd + 'T00:00:00Z'); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); return Math.ceil(((+t - +new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7); }

export function Dashboard() {
  const reduced = usePrefersReducedMotion();
  const [data, setData] = useState<DashData | null>(null); const [error, setError] = useState<string | null>(null);
  const [week, setWeek] = useState<string | null>(null); const [feed, setFeed] = useState<FeedEvent[]>([]); const [live, setLive] = useState(false);
  const [filters, setFilters] = useState<Filters>({}); const [open, setOpen] = useState<Deal | null>(null); const [view, setView] = useState<'graph' | 'city'>('graph');
  const [out, setOut] = useState<{ text: string; err?: boolean }[]>([]); const [boot, setBoot] = useState(0); const [booted, setBooted] = useState(false);
  const cmd = useRef<CmdHandle>(null); const weekRef = useRef<string | null>(null); weekRef.current = week;

  const load = useCallback(async (w?: string | null) => {
    try { const r = await fetch(`/api/dashboard${w ? `?week=${w}` : ''}`, { cache: 'no-store' }); const j = await r.json(); if (!r.ok) throw new Error(j.error);
      setData(j); setFeed(j.feed); setError(null); setWeek(j.week); } catch (e: any) { setError(e.message); }
  }, []);

  // boot sequence — once per session
  useEffect(() => {
    let seen = false; try { seen = !!sessionStorage.getItem('pulse_booted'); } catch {}
    if (seen || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setBooted(true); return; }
    let i = 0; const t = setInterval(() => { i++; setBoot(i); if (i >= BOOT.length + 3) { clearInterval(t); setBooted(true); try { sessionStorage.setItem('pulse_booted', '1'); } catch {} } }, 320);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { load(new URLSearchParams(location.search).get('week')); }, [load]);

  // realtime + polling fallback
  useEffect(() => {
    const c = sb(); let deb: any; const refetch = () => { clearTimeout(deb); deb = setTimeout(() => load(weekRef.current), 1200); };
    if (!c) { const t = setInterval(() => load(weekRef.current), 30000); return () => clearInterval(t); }
    const ch = c.channel('pulse-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_events' }, p => setFeed(f => [...f.slice(-199), p.new as FeedEvent]))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingest_runs' }, refetch)
      .subscribe(s => setLive(s === 'SUBSCRIBED'));
    const poll = setInterval(() => load(weekRef.current), 60000);
    return () => { clearTimeout(deb); clearInterval(poll); c.removeChannel(ch); };
  }, [load]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName; if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === '/' || e.key === ':') { e.preventDefault(); cmd.current?.focus(); } else if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);

  const filtered = useMemo(() => (data?.deals ?? []).filter(d => {
    if (filters.sector && (d.sector ?? '').toLowerCase() !== filters.sector.toLowerCase()) return false;
    if (filters.stage && d.stage !== filters.stage) return false;
    if (filters.minUsd && (d.amount_usd ?? 0) < filters.minUsd) return false;
    if (filters.watch && !d.watchlist_hit && !d.adjacency?.is_adjacent) return false;
    if (filters.investor && !d.investors.some(i => i.name === filters.investor)) return false;
    if (filters.q && !d.company_name.toLowerCase().includes(filters.q.toLowerCase())) return false;
    return true;
  }), [data, filters]);
  const rumoured = filtered.filter(d => d.status === 'REPORTED_IN_TALKS'), closed = filtered.filter(d => d.status !== 'REPORTED_IN_TALKS');
  const prevByKey = useMemo(() => Object.fromEntries(Object.entries(data?.stats?.by_sector ?? {}).map(([k, v]: any) => [k, v.prev.usd])), [data]);

  const run = (input: string) => {
    if (!data) return; const r = parseCommand(input, data.week); const push = (text: string, err?: boolean) => text && setOut(o => [...o.slice(-6), { text: `$ ${input}`, }, ...text.split('\n').map(t => ({ text: t, err }))]);
    switch (r.kind) {
      case 'filter': setFilters(r.filters); push(r.out); break;
      case 'clear': setFilters({}); setOut([]); setOpen(null); break;
      case 'nav': window.location.href = r.href; break;
      case 'week': { const i = data.weeks.indexOf(data.week); const t = data.weeks[Math.max(0, Math.min(data.weeks.length - 1, i - r.offset))]; setWeek(t); load(t); push(`[OK] week ${t}`); break; }
      case 'show': { const d = data.deals.find(x => x.company_name.toLowerCase().includes(r.company.toLowerCase())); d ? (setOpen(d), push(`[OK] opened ${d.company_name}`)) : push(`[ERR] no deal matching "${r.company}" in week ${data.week}`, true); break; }
      case 'investors': { const s = data.stats; const list = r.newOnly ? s.new_investors.map((i: any) => `${i.name} → ${i.sector} (new)`) : s.top_investors.map((i: any) => `${i.name} (${i.deals} deals)`); push(list.length ? list.join('\n') : '[..] none this week'); break; }
      default: push(r.out, (r as any).err);
    }
  };
  const pick = (p: Pick) => {
    if (p.kind === 'sector') setFilters(f => ({ ...f, sector: f.sector === p.name ? undefined : p.name }));
    else if (p.kind === 'investor') setFilters(f => ({ ...f, investor: f.investor === p.name ? undefined : p.name }));
    else { const d = data?.deals.find(x => x.id === p.id); if (d) setOpen(d); }
  };
  const openByName = (name: string) => { const d = data?.deals.find(x => name.toLowerCase().includes(x.company_name.toLowerCase())); if (d) setOpen(d); };

  if (!booted) return (<main className="p-4"><pre className="ascii-logo glow">{LOGO}</pre><div className="mt-3">{BOOT.slice(0, Math.min(boot, BOOT.length)).map(l => <div key={l}>{l}</div>)}{boot > BOOT.length && <div className="text-xl mt-2 glow"><Typewriter text="STARTUP_FUNDING_PULSE" speed={30} /></div>}</div></main>);
  const wkLabel = week ? `wk ${isoWeek(week)}` : 'wk --'; const lr = data?.lastRun;
  const lastIng = lr?.finished_at ? new Date(lr.finished_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : null;
  const activeFilters = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k}=${typeof v === 'number' ? v / 1e6 + 'M' : v}`).join(' ');

  return (
    <main className="p-2 md:p-3 flex flex-col gap-2 max-w-[1600px] mx-auto">
      <header className="pane px-2 py-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0"><pre className="ascii-logo glow hide-m" aria-hidden>{LOGO}</pre><h1 className="m-0 text-base glow glitch">STARTUP_FUNDING_PULSE<span className="cursor">&nbsp;</span></h1></div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="caps dim" htmlFor="wk">week</label>
          <select id="wk" className="field" style={{ width: 'auto' }} value={week ?? ''} onChange={e => { setWeek(e.target.value); load(e.target.value); }}>{(data?.weeks ?? (week ? [week] : [])).map(w => <option key={w} value={w}>[{`wk ${isoWeek(w)}`} · {w}]</option>)}</select>
          <span className={error ? 'err' : 'ok'}>{error ? '[ERR]' : '[OK]'}</span><span className="dim">{lastIng ? `last ingest ${lastIng} IST` : 'no ingest yet'}</span>
          <a href="/briefs">[ BRIEFS ]</a><a href="/system">[ SYSTEM ]</a><a href="/config">[ CONFIG ]</a>
        </div>
      </header>
      {data && <Ticker deals={data.deals} inr={data.inr} />}
      {error && <Err>{error}{error.includes('Supabase') ? ' — set env vars, see README' : ''}</Err>}
      {!data && !error && <Spinner label="connecting to supabase" />}
      {data && (<>
        <div className="grid gap-2 md:grid-cols-[1.4fr_1fr]">
          <Pane title="CAPITAL_MAP.3D" right={<span className="flex gap-1"><Btn className={view === 'graph' ? 'sel' : ''} onClick={() => setView('graph')} aria-pressed={view === 'graph'}>GRAPH</Btn><Btn className={view === 'city' ? 'sel' : ''} onClick={() => setView('city')} aria-pressed={view === 'city'}>CITY</Btn></span>}>
            <div className="-m-2"><CapitalMap deals={data.deals} prevByKey={prevByKey} activeSector={filters.sector} onPick={pick} view={view} /></div>
            <div className="dim mt-3 flex flex-wrap gap-x-3"><span><Box size={12} className="inline" color="#33ff00" strokeWidth={2} /> drag·scroll·click to filter</span><span className="err">■ watchlist</span><span className="amber">■ adjacent/investor</span></div>
          </Pane>
          <LiveFeed events={feed} lastRun={data.lastRun} nextRun={data.nextRun} onPickDeal={openByName} live={live} />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <WatchlistPane deals={data.deals} total={data.watchlist.length} onOpen={setOpen} />
          <PatternsPane data={data} activeSector={filters.sector} onSector={s => setFilters(f => ({ ...f, sector: f.sector === s ? undefined : s }))} />
        </div>
        <div className={`grid gap-2 ${open ? 'lg:grid-cols-[1.3fr_1fr]' : ''}`}>
          <div className="flex flex-col gap-2 min-w-0">
            <DealTable title={`DEAL_TABLE ${closed.length}${activeFilters ? ` | ${activeFilters}` : ''}`} deals={closed} inr={data.inr} selectedId={open?.id ?? null} onOpen={setOpen} />
            {rumoured.length > 0 && <DealTable title={`RUMOURED / IN TALKS ${rumoured.length} (not counted)`} deals={rumoured} inr={data.inr} selectedId={open?.id ?? null} onOpen={setOpen} />}
          </div>
          {open && <DealDetail deal={open} inr={data.inr} onClose={() => setOpen(null)} />}
        </div>
      </>)}
      <CommandBar ref={cmd} onRun={run} output={out} />
      <footer className="pane px-2 py-1"><div className="dim caps mb-1 flex items-center gap-1"><Activity size={12} color="#33ff00" strokeWidth={2} /> controls</div><AdminControls onDone={() => load(weekRef.current)} /></footer>
    </main>
  );
}
