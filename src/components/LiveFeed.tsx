'use client';
import { useEffect, useRef, useState } from 'react';
import { Pane } from './ui';
import type { FeedEvent } from '@/lib/client-types';

const COLOR: Record<string, string> = { OK: 'ok', '..': 'dim', NEW: 'amber glow', MERGE: 'ok', WARN: 'amber', ERR: 'err' };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export function LiveFeed({ events, lastRun, nextRun, onPickDeal, live }: { events: FeedEvent[]; lastRun: any; nextRun: string; onPickDeal: (name: string) => void; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null); const [paused, setPaused] = useState(false);
  useEffect(() => { if (!paused && ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [events, paused]);
  const next = new Date(nextRun).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return (
    <Pane title="LIVE_FEED" right={<span className={live ? 'ok' : 'amber'}>{live ? '[LIVE]' : '[POLL]'}</span>} className="h-full">
      <div className="dim mb-1">$ tail -f deals.log {paused ? <span className="amber">[paused]</span> : null}</div>
      <div ref={ref} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="overflow-y-auto" style={{ height: 210 }} tabIndex={0} aria-live="polite" role="log">
        {events.length === 0 && (
          <div className="dim">[..] no activity yet.<br />{lastRun ? `last run: ${lastRun.status} — ${JSON.stringify(lastRun.counts ?? {})}` : 'no ingest runs recorded — use [ RUN INGEST ]'}<br />next scheduled run: {next} IST</div>
        )}
        {events.map(e => {
          const isNew = e.level === 'NEW';
          return (
            <div key={e.id} className={`${COLOR[e.level] ?? ''} wrap ${isNew ? 'cursor-pointer hover:bg-[#0d2a0d]' : ''}`} onClick={() => isNew && onPickDeal(e.message.split(/\s{1}(?=[A-Z_]{4,}|SEED|\$|—)/)[0])}>
              <span className="dim">{hhmm(e.created_at)}</span> [{e.level}] {e.message}
            </div>
          );
        })}
      </div>
      {events.length > 0 && <div className="dim mt-1 border-t border-dashed border-border pt-1">next run {next} IST</div>}
    </Pane>
  );
}
