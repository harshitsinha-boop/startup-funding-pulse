// Usage: npm run backfill -- --weeks 4
import { config } from 'dotenv';
config({ path: '.env.local' }); config();
import { runIngest } from '../src/lib/ingest/pipeline';
import { runReconcile } from '../src/lib/reconcile';

async function main() {
  const i = process.argv.indexOf('--weeks'); const weeks = i > 0 ? Number(process.argv[i + 1]) : 4;
  const days = weeks * 7;
  console.log(`[..] backfill ${weeks} weeks (Google News when:${days}d + roundup reconciliation)`);
  let first = true;
  for (let round = 0; round < 40; round++) {
    const r = await runIngest({ gnewsDays: days, deadlineMs: 270_000, maxGeminiCalls: 80, skipDiscovery: !first });
    first = false;
    console.log(`[OK] round ${round + 1}:`, JSON.stringify(r.counts));
    if ((r.counts.queue_remaining ?? 0) === 0 || r.status === 'error') break;
  }
  const rec = await runReconcile({ weeks });
  console.log('[OK] reconciled', JSON.stringify(rec.map(x => ({ week: x.week, coverage: x.coverage }))));
}
main().catch(e => { console.error('[ERR]', e); process.exit(1); });
