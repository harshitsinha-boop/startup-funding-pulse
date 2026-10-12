import { db } from '../db';

export class RunLog {
  lines: { t: string; level: string; msg: string }[] = [];
  errors: { t: string; msg: string }[] = [];
  counts: Record<string, number> = {};
  runId: string | null = null;
  constructor(public persist = true, public kind = 'ingest') {}
  async start() {
    if (!this.persist) return;
    const { data } = await db().from('ingest_runs').insert({ kind: this.kind }).select('id').single();
    this.runId = data?.id ?? null;
  }
  inc(k: string, n = 1) { this.counts[k] = (this.counts[k] ?? 0) + n; }
  set(k: string, n: number) { this.counts[k] = n; }
  async log(level: 'OK'|'..'|'NEW'|'MERGE'|'WARN'|'ERR', msg: string) {
    const t = new Date().toISOString();
    this.lines.push({ t, level, msg });
    if (level === 'ERR') this.errors.push({ t, msg });
    if (!this.persist) { console.log(`[${level}] ${msg}`); return; }
    await db().from('feed_events').insert({ run_id: this.runId, level, message: msg.slice(0, 400) });
  }
  async finish(status: string, tokens: { calls: number; tokensIn: number; tokensOut: number }) {
    if (!this.persist || !this.runId) return;
    await db().from('ingest_runs').update({
      finished_at: new Date().toISOString(), status, counts: this.counts, logs: this.lines.slice(-200), errors: this.errors,
      gemini_calls: tokens.calls, tokens_in: tokens.tokensIn, tokens_out: tokens.tokensOut,
    }).eq('id', this.runId);
  }
}
