// Re-evaluate recent deals against the current watchlist (exact match + Gemini adjacency).
import { config } from 'dotenv'; config({ path: '.env.local' });
import { db } from '../src/lib/db';
import { loadConfig, loadWatchlist } from '../src/lib/config';
import { checkWatchlist } from '../src/lib/ingest/persist';
import { rescore } from '../src/lib/ingest/pipeline';
import { GeminiBudget } from '../src/lib/gemini';
import { RunLog } from '../src/lib/ingest/runlog';
import { addDays } from '../src/lib/normalize';
async function main() {
  await db().from('deals').update({ adjacency: null, watchlist_hit: null }).gte('week_start', addDays(new Date().toISOString().slice(0, 10), -56));
  const log = new RunLog(true, 'watchlist'); await log.start(); const budget = new GeminiBudget(80);
  const cfg = await loadConfig(); const w = await loadWatchlist(); console.log('watchlist:', w.map(x => `${x.name} (${x.description})`).join('; '));
  await checkWatchlist(null, w, cfg, budget, log); await rescore(cfg, 8); await log.finish('ok', budget);
  const { data } = await db().from('deals').select('company_name,week_start,watchlist_hit,adjacency').or('watchlist_hit.not.is.null,adjacency->>is_adjacent.eq.true');
  console.log('gemini calls', budget.calls, '| flagged:'); (data ?? []).forEach(d => console.log(' -', d.company_name, d.week_start, d.watchlist_hit ? 'EXACT: ' + d.watchlist_hit : `${d.adjacency.relationship} of ${d.adjacency.watchlist_company}: ${d.adjacency.reason}`));
}
main();
