'use client';
import { useEffect, useState } from 'react';
import { Btn, Spinner } from './ui';

export function AdminControls({ onDone }: { onDone: () => void }) {
  const [admin, setAdmin] = useState(false); const [pass, setPass] = useState(''); const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  useEffect(() => { fetch('/api/auth').then(r => r.json()).then(j => setAdmin(!!j.admin)).catch(() => {}); }, []);
  const login = async (e: React.FormEvent) => { e.preventDefault(); const r = await fetch('/api/auth', { method: 'POST', body: JSON.stringify({ passcode: pass }) }); if (r.ok) { setAdmin(true); setMsg({ t: '[OK] access granted' }); } else setMsg({ t: '[ERR] access denied', err: true }); setPass(''); };
  const run = async (job: string) => {
    setBusy(job); setMsg(null);
    try { const r = await fetch('/api/admin/run', { method: 'POST', body: JSON.stringify({ job }) }); const j = await r.json();
      setMsg(r.ok ? { t: `[OK] ${job} done — ${JSON.stringify(j.counts ?? j).slice(0, 200)}` } : { t: `[ERR] ${j.error ?? 'failed'}`, err: true }); onDone();
    } catch (e: any) { setMsg({ t: `[ERR] ${e.message}`, err: true }); }
    setBusy(null);
  };
  if (!admin) return (
    <form onSubmit={login} className="prompt" aria-label="admin login"><label htmlFor="pc" className="ps1">admin@pulse:~$ passcode</label>
      <input id="pc" type="password" value={pass} onChange={e => setPass(e.target.value)} autoComplete="off" style={{ maxWidth: 160 }} /><span className="cursor">&nbsp;</span>{msg && <span className={msg.err ? 'err' : 'ok'}>{msg.t}</span>}</form>);
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Btn onClick={() => run('ingest')} disabled={!!busy}>RUN INGEST</Btn><Btn onClick={() => run('reconcile')} disabled={!!busy}>RECONCILE</Btn>
      <Btn className="amber" onClick={() => run('brief')} disabled={!!busy}>GENERATE BRIEF NOW</Btn><Btn className="amber" onClick={() => run('test-email')} disabled={!!busy}>SEND TEST EMAIL</Btn>
      <a href="/config">[ CONFIG ]</a>
      {busy && <Spinner label={`${busy} running (may take a few minutes)`} />}{msg && <span className={`${msg.err ? 'err' : 'ok'} wrap`}>{msg.t}</span>}
    </div>);
}
