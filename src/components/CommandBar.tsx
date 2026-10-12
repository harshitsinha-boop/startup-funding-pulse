'use client';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { complete } from '@/lib/commands';

export interface CmdHandle { focus: () => void }
export const CommandBar = forwardRef<CmdHandle, { onRun: (cmd: string) => void; output: { text: string; err?: boolean }[] }>(function CommandBar({ onRun, output }, ref) {
  const [v, setV] = useState(''); const [hist, setHist] = useState<string[]>([]); const [hi, setHi] = useState(-1); const el = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => el.current?.focus() }));
  const hints = v && !v.includes(' ') ? complete(v) : [];
  return (
    <div className="pane" aria-label="command bar">
      {output.length > 0 && <div className="px-2 pt-1 wrap" style={{ maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap' }} aria-live="polite">{output.map((o, i) => <div key={i} className={o.err ? 'err' : 'dim'}>{o.text}</div>)}</div>}
      <form className="prompt px-2 py-1" onSubmit={e => { e.preventDefault(); if (v.trim()) { onRun(v); setHist(h => [v, ...h]); } setV(''); setHi(-1); }} onClick={() => el.current?.focus()}>
        <label htmlFor="cmd" className="ps1 shrink-0">aarav@pulse:~$</label>
        <input id="cmd" ref={el} value={v} onChange={e => setV(e.target.value)} autoComplete="off" spellCheck={false} aria-label="command input — type help"
          placeholder="type help  ( / to focus )"
          onKeyDown={e => {
            if (e.key === 'Tab') { e.preventDefault(); if (hints.length === 1) setV(hints[0] + ' '); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); const n = Math.min(hist.length - 1, hi + 1); if (hist[n]) { setHi(n); setV(hist[n]); } }
            else if (e.key === 'ArrowDown') { e.preventDefault(); const n = hi - 1; setHi(n); setV(n >= 0 ? hist[n] : ''); }
            else if (e.key === 'Escape') el.current?.blur();
          }} />
        <span className="cursor" aria-hidden>&nbsp;</span>
      </form>
      {hints.length > 0 && <div className="px-2 dim">tab ⇥ {hints.join('  ')}</div>}
    </div>
  );
});
