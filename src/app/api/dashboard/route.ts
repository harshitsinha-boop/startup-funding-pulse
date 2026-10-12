import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { loadConfig, loadWatchlist } from '@/lib/config';
import { getInrPerUsd } from '@/lib/fx';
import { computeStats } from '@/lib/patterns';
import { previousWeekStart, weekStartIST } from '@/lib/normalize';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const cfg = await loadConfig();
    const { data: wk } = await db().from('deals').select('week_start').order('week_start', { ascending: false }).limit(500);
    const weeks = [...new Set([weekStartIST(new Date()), ...(wk ?? []).map(w => w.week_start)])].sort().reverse();
    // default: the in-progress week once it has ≥5 deals, otherwise the last completed week
    const cur = weekStartIST(new Date());
    const curCount = (wk ?? []).filter(w => w.week_start === cur).length;
    const week = url.searchParams.get('week') ?? (curCount >= 5 ? cur : (weeks.find(w => w <= previousWeekStart() && (wk ?? []).some(x => x.week_start === w)) ?? cur));
    const [deals, stats, wrow, feed, lastRun, watch, inr] = await Promise.all([
      db().from('deals').select('*, deal_investors(role, investors(name)), deal_sources(raw_articles(url, source_slug, title))').eq('week_start', week).order('score', { ascending: false }).limit(500),
      computeStats(week, cfg),
      db().from('weeks').select('insights,coverage_pct,sent_at,generated_at').eq('week_start', week).maybeSingle(),
      db().from('feed_events').select('*').order('id', { ascending: false }).limit(60),
      db().from('ingest_runs').select('*').eq('kind', 'ingest').order('started_at', { ascending: false }).limit(1).maybeSingle(),
      loadWatchlist(), getInrPerUsd(cfg.inrPerUsdFallback),
    ]);
    const mapped = (deals.data ?? []).map((d: any) => ({
      ...d, deal_investors: undefined, deal_sources: undefined,
      investors: (d.deal_investors ?? []).map((x: any) => ({ name: x.investors?.name, role: x.role })).filter((x: any) => x.name),
      sources: (d.deal_sources ?? []).map((s: any) => s.raw_articles).filter(Boolean).map((a: any) => ({ url: a.url, name: String(a.source_slug).replace(/^gnews:/, 'gnews/'), title: a.title })),
    }));
    const now = new Date(); const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 30));
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return NextResponse.json({ week, weeks, deals: mapped, stats, insights: wrow.data?.insights ?? [], coverage: wrow.data?.coverage_pct ?? stats.coverage_pct,
      briefSentAt: wrow.data?.sent_at ?? null, feed: (feed.data ?? []).reverse(), lastRun: lastRun.data, nextRun: next.toISOString(), inr,
      config: { sectors: cfg.sectors, stages: cfg.stages }, watchlist: watch });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
