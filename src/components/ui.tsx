'use client';
import { useEffect, useState } from 'react';

export function Pane({ title, right, children, className = '', solid = false, id }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string; solid?: boolean; id?: string }) {
  return (
    <section className={`pane ${className}`} aria-label={title} id={id}>
      <div className={`pane-title ${solid ? 'solid' : ''}`}><span className="glow">{'>'} {title}</span><span className="flex gap-2 items-center">{right}</span></div>
      <div className="pane-body">{children}</div>
    </section>
  );
}
export const Btn = ({ children, className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button className={`btn ${className}`} {...p}>[ {children} ]</button>;

const FRAMES = ['/', '-', '\\', '|'];
export function Spinner({ label = 'loading' }: { label?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI(x => (x + 1) % 4), 120); return () => clearInterval(t); }, []);
  return <span className="amber" role="status">[{FRAMES[i]}] {label}…</span>;
}
export const Err = ({ children }: { children: React.ReactNode }) => <div className="err wrap" role="alert">[ERR] {children}</div>;

export function Typewriter({ text, speed = 28, onDone, reduced }: { text: string; speed?: number; onDone?: () => void; reduced?: boolean }) {
  const [n, setN] = useState(reduced ? text.length : 0);
  useEffect(() => {
    if (reduced) { setN(text.length); return; }
    setN(0); const t = setInterval(() => setN(x => { if (x >= text.length) { clearInterval(t); onDone?.(); return x; } return x + 1; }), speed);
    return () => clearInterval(t);
  }, [text, speed, reduced]); // eslint-disable-line
  return <span>{text.slice(0, n)}<span className="cursor">&nbsp;</span></span>;
}

export function usePrefersReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => { const m = window.matchMedia('(prefers-reduced-motion: reduce)'); setR(m.matches); const h = () => setR(m.matches); m.addEventListener('change', h); return () => m.removeEventListener('change', h); }, []);
  return r;
}

export const LOGO = ` ___ _____ _   ___ _____ _   _ ___
/ __|_   _/_\\ | _ \\_   _| | | | _ \\
\\__ \\ | |/ _ \\|   / | | | |_| |  _/
|___/ |_/_/ \\_\\_|_\\ |_|  \\___/|_|
 FUNDING  P U L S E  // india.sh`;

export const badgeOf = (c: string) => ({ CONFIRMED: ['CONFIRMED', 'ok'], SINGLE_SOURCE: ['SINGLE', 'amber'], LOW: ['LOW', 'err'], RUMOURED: ['RUMOUR', 'dim'] } as Record<string, [string, string]>)[c] ?? [c, 'dim'];
