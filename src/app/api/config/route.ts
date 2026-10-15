import { NextResponse, after } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { loadConfig, loadWatchlist, saveConfig } from '@/lib/config';
import { checkWatchlist } from '@/lib/ingest/persist';
import { rescore } from '@/lib/ingest/pipeline';
import { GeminiBudget } from '@/lib/gemini';
import { RunLog } from '@/lib/ingest/runlog';
import { addDays } from '@/lib/normalize';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function GET() { return NextResponse.json({ config: await loadConfig(), watchlist: await loadWatchlist() }); }

export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { config, watchlist, sources } = await req.json();
  if (config) await saveConfig(config);
  if (Array.isArray(watchlist)) {
    await db().from('watchlist').delete().neq('name', '\u0000');
    const rows = watchlist.filter((w: any) => w.name?.trim()).map((w: any) => ({ name: w.name.trim(), description: (w.description ?? '').trim(), aliases: w.aliases ?? [] }));
    if (rows.length) await db().from('watchlist').insert(rows);
    // Watchlist changed: re-evaluate recent deals right away (exact match + AI adjacency) instead of waiting for the next ingest
    const since = addDays(new Date().toISOString().slice(0, 10), -56);
    await db().from('deals').update({ adjacency: null, watchlist_hit: null }).gte('week_start', since);
    after(async () => {
      const log = new RunLog(true, 'watchlist'); await log.start();
      const budget = new GeminiBudget(60);
      try { const cfg = await loadConfig(); await checkWatchlist(null, await loadWatchlist(), cfg, budget, log); await rescore(cfg, 8); await log.log('OK', 'watchlist re-check complete'); }
      catch (e: any) { await log.log('ERR', `watchlist re-check: ${e.message}`); }
      await log.finish(log.errors.length ? 'error' : 'ok', budget);
    });
  }
  if (Array.isArray(sources)) for (const s of sources) await db().from('sources').update({ enabled: !!s.enabled }).eq('slug', s.slug);
  return NextResponse.json({ ok: true });
}
