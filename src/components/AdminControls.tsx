'use client';
import { useState } from 'react';
import { Btn, Spinner } from './ui';

export function AdminControls({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const run = async (job: string) => {
    setBusy(job); setMsg(null);
    try {
      const r = await fetch('/api/admin/run', { method: 'POST', body: JSON.stringify({ job }) }); const j = await r.json();
      setMsg(r.ok ? { t: `[OK] ${job} done — ${j.error ? j.error : JSON.stringify(j.counts ?? j).slice(0, 200)}`, err: !!j.error } : { t: `[ERR] ${j.error ?? 'failed'}`, err: true }); onDone();
    } catch (e: any) { setMsg({ t: `[ERR] ${e.message}`, err: true }); }
    setBusy(null);
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2 items-center">
        <Btn onClick={() => run('ingest')} disabled={!!busy}>RUN INGEST</Btn><Btn onClick={() => run('reconcile')} disabled={!!busy}>RECONCILE</Btn>
        <Btn className="amber" onClick={() => run('brief')} disabled={!!busy}>GENERATE BRIEF NOW</Btn><Btn className="amber" onClick={() => run('test-email')} disabled={!!busy}>SEND TEST EMAIL</Btn>
        <a href="/config">[ CONFIG ]</a>
      </div>
      {busy && <Spinner label={`${busy} running (ingest can take up to ~5 min; live progress in LIVE_FEED)`} />}
      {msg && <span className={`${msg.err ? 'err' : 'ok'} wrap`}>{msg.t}</span>}
      <div className="dim">test email goes to the configured inbox · jobs are rate-limited · config editing is passcode-protected</div>
    </div>);
}
