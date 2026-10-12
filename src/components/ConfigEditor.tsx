'use client';
import { useEffect, useState } from 'react';
import { Pane, Btn, Err, Spinner } from './ui';
import type { Config } from '@/lib/types';

const STAGES = ['PRE_SEED','SEED','PRE_SERIES_A','SERIES_A','SERIES_B','SERIES_C','SERIES_D','SERIES_E_PLUS','GROWTH','BRIDGE','DEBT'];
type W = { name: string; description: string; aliases: string[] };
type S = { slug: string; name: string; tier: number; enabled: boolean; last_status: string | null };

export function ConfigEditor() {
  const [cfg, setCfg] = useState<Config | null>(null); const [watch, setWatch] = useState<W[]>([]); const [sources, setSources] = useState<S[]>([]);
  const [admin, setAdmin] = useState<boolean | null>(null); const [pass, setPass] = useState(''); const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null); const [custom, setCustom] = useState('');
  useEffect(() => {
    fetch('/api/auth').then(r => r.json()).then(j => setAdmin(!!j.admin));
    fetch('/api/config').then(r => r.json()).then(j => { setCfg(j.config); setWatch(j.watchlist.map((w: any) => ({ ...w, aliases: w.aliases ?? [] }))); }).catch(e => setMsg({ t: e.message, err: true }));
    fetch('/api/system').then(r => r.json()).then(j => setSources(j.sources ?? [])).catch(() => {});
  }, []);
  const login = async (e: React.FormEvent) => { e.preventDefault(); const r = await fetch('/api/auth', { method: 'POST', body: JSON.stringify({ passcode: pass }) }); r.ok ? setAdmin(true) : setMsg({ t: 'access denied', err: true }); setPass(''); };
  if (admin === null || !cfg) return <div className="p-3">{msg ? <Err>{msg.t}</Err> : <Spinner label="reading config" />}</div>;
  if (!admin) return (<Pane title="AUTH_REQUIRED"><form onSubmit={login} className="prompt"><label htmlFor="pc" className="ps1">passcode:</label><input id="pc" type="password" value={pass} onChange={e => setPass(e.target.value)} autoFocus /><span className="cursor">&nbsp;</span></form>{msg && <Err>{msg.t}</Err>}</Pane>);

  const set = (p: Partial<Config>) => setCfg({ ...cfg, ...p });
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  const save = async () => {
    setMsg(null); const r = await fetch('/api/config', { method: 'PUT', body: JSON.stringify({ config: cfg, watchlist: watch, sources: sources.map(s => ({ slug: s.slug, enabled: s.enabled })) }) });
    setMsg(r.ok ? { t: '[OK] saved — applies on next ingest (Google News queries regenerate from this)' } : { t: `[ERR] ${(await r.json()).error}`, err: true });
  };
  const num = (v: number, f: (n: number) => void) => <input className="field" type="number" value={v} onChange={e => f(Number(e.target.value))} />;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <Pane title="FOCUS_SECTORS">
        <div className="flex flex-wrap gap-x-4">{[...new Set([...cfg.taxonomy, ...cfg.sectors])].map(s => <label key={s} className="cursor-pointer"><input type="checkbox" checked={cfg.sectors.includes(s)} onChange={() => set({ sectors: toggle(cfg.sectors, s) })} /> {s}</label>)}</div>
        <div className="prompt mt-2"><span className="ps1">add sector:</span><input value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) { set({ sectors: [...cfg.sectors, custom.trim()], taxonomy: [...cfg.taxonomy, custom.trim()] }); setCustom(''); } }} aria-label="custom sector" /><span className="cursor">&nbsp;</span></div>
      </Pane>
      <Pane title="FOCUS_STAGES"><div className="flex flex-wrap gap-x-4">{STAGES.map(s => <label key={s} className="cursor-pointer"><input type="checkbox" checked={cfg.stages.includes(s as any)} onChange={() => set({ stages: toggle(cfg.stages, s) as any })} /> {s}</label>)}</div></Pane>
      <Pane title="CHEQUE_RANGE (USD)"><label>min {num(cfg.chequeMinUsd, n => set({ chequeMinUsd: n }))}</label><label>max {num(cfg.chequeMaxUsd, n => set({ chequeMaxUsd: n }))}</label></Pane>
      <Pane title="RANKING_WEIGHTS"><div className="grid grid-cols-2 gap-x-3">
        {(['sector', 'stage', 'watchlist', 'adjacency', 'cheque'] as const).map(k => <label key={k}>{k}{num(cfg.weights[k], n => set({ weights: { ...cfg.weights, [k]: n } }))}</label>)}
        {(['CONFIRMED', 'SINGLE_SOURCE', 'LOW', 'RUMOURED'] as const).map(k => <label key={k}>×{k.toLowerCase()}{num(cfg.weights.conf[k], n => set({ weights: { ...cfg.weights, conf: { ...cfg.weights.conf, [k]: n } } }))}</label>)}</div></Pane>
      <Pane title="WATCHLIST" className="md:col-span-2">
        <div className="dim mb-1">company · one-line description (used for adjacency detection) · aliases (comma separated)</div>
        {watch.map((w, i) => (<div key={i} className="grid gap-1 md:grid-cols-[1fr_2fr_1fr_auto] mb-1">
          <input className="field" placeholder="company" value={w.name} onChange={e => setWatch(watch.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} aria-label="company name" />
          <input className="field" placeholder="B2B SaaS for pharmacy inventory" value={w.description} onChange={e => setWatch(watch.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} aria-label="description" />
          <input className="field" placeholder="aliases" value={w.aliases.join(', ')} onChange={e => setWatch(watch.map((x, j) => j === i ? { ...x, aliases: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } : x))} aria-label="aliases" />
          <Btn className="amber" onClick={() => setWatch(watch.filter((_, j) => j !== i))}>RM</Btn></div>))}
        <Btn onClick={() => setWatch([...watch, { name: '', description: '', aliases: [] }])}>+ ADD</Btn>
      </Pane>
      <Pane title="EMAIL"><label>recipients (comma separated; BRIEF_TO_EMAIL env is always included)<input className="field" value={cfg.emailRecipients.join(', ')} onChange={e => set({ emailRecipients: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} /></label>
        <label>send time (informational — cron is fixed in vercel.json)<input className="field" value={cfg.briefSendTime} onChange={e => set({ briefSendTime: e.target.value })} /></label></Pane>
      <Pane title="SOURCES">{sources.map(s => <label key={s.slug} className="block cursor-pointer"><input type="checkbox" checked={s.enabled} onChange={() => setSources(sources.map(x => x.slug === s.slug ? { ...x, enabled: !x.enabled } : x))} /> T{s.tier} {s.name} <span className={s.last_status === 'ok' ? 'ok' : 'dim'}>[{s.last_status ?? 'unchecked'}]</span></label>)}</Pane>
      <div className="md:col-span-2 flex gap-2 items-center"><Btn onClick={save}>SAVE CONFIG</Btn><a href="/">[ BACK ]</a>{msg && <span className={msg.err ? 'err' : 'ok'}>{msg.t}</span>}</div>
    </div>);
}
