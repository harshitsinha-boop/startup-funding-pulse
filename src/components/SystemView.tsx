'use client';
import { useEffect, useState } from 'react';
import { Pane, Spinner, Err } from './ui';

export function SystemView() {
  const [d, setD] = useState<any>(null); const [e, setE] = useState<string | null>(null);
  useEffect(() => { fetch('/api/system').then(r => r.json()).then(setD).catch(x => setE(x.message)); }, []);
  if (e) return <Err>{e}</Err>; if (!d) return <Spinner label="reading system state" />;
  const t = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' }) : '—';
  const funnel = (c: any) => `discovered ${c.discovered ?? 0} → unique ${c.unique_urls ?? 0} → new ${c.new_urls ?? 0} → prefilter ${c.prefilter_pass ?? 0} → extracted ${c.articles_extracted ?? 0} → new deals ${c.deals_new ?? 0}`;
  return (
    <div className="flex flex-col gap-2">
      <Pane title="SOURCE_HEALTH"><div className="overflow-x-auto"><table className="t"><thead><tr><th>source</th><th>tier</th><th>enabled</th><th>status</th><th>items</th><th>checked</th></tr></thead><tbody>
        {d.sources.map((s: any) => <tr key={s.slug}><td>{s.name}</td><td>T{s.tier}</td><td>{s.enabled ? 'yes' : 'no'}</td><td className={s.last_status === 'ok' ? 'ok' : s.last_status ? 'err' : 'dim'}>[{s.last_status ?? 'n/a'}]</td><td>{s.last_item_count ?? '—'}</td><td className="dim">{t(s.last_checked_at)}</td></tr>)}</tbody></table></div></Pane>
      <Pane title="QUEUE"><div>articles stored: {d.articles} · awaiting extraction: <span className={d.queued ? 'amber' : 'ok'}>{d.queued}</span> (resumes automatically on next run)</div></Pane>
      <Pane title="RUNS (funnel · tokens · errors)"><div className="overflow-x-auto"><table className="t"><thead><tr><th>started</th><th>kind</th><th>status</th><th>funnel</th><th>gemini</th><th>tokens in/out</th></tr></thead><tbody>
        {d.runs.map((r: any) => <><tr key={r.id}><td className="nowrap-m">{t(r.started_at)}</td><td>{r.kind}</td><td className={r.status === 'ok' ? 'ok' : r.status === 'error' ? 'err' : 'amber'}>[{r.status}]</td><td className="wrap">{r.kind === 'ingest' ? funnel(r.counts ?? {}) : JSON.stringify(r.counts ?? {})}</td><td>{r.gemini_calls}</td><td>{r.tokens_in}/{r.tokens_out}</td></tr>
          {(r.errors ?? []).slice(0, 3).map((x: any, i: number) => <tr key={r.id + i}><td colSpan={6} className="err wrap">[ERR] {t(x.t)} {x.msg}</td></tr>)}</>)}</tbody></table></div></Pane>
      <a href="/">[ BACK ]</a>
    </div>);
}
