import Parser from 'rss-parser';
import { db } from './db';
import { loadConfig } from './config';
import { GeminiBudget } from './gemini';
import { getInrPerUsd } from './fx';
import { fetchRetry, sha } from './util';
import { normName, toUsd, weekStartIST, addDays, dealWeek } from './normalize';
import { matchDeals } from './dedupe';
import { enrichUrl } from './ingest/enrich';
import { extractBatch } from './ingest/extract';
import { keywordSector, mapSectorsGemini } from './ingest/sector';
import { upsertDeal } from './ingest/persist';
import { RunLog } from './ingest/runlog';
import type { NormDeal } from './types';

interface Roundup { source: 'entrackr-weekly' | 'inc42-galore'; url: string; title: string; published: string; week: string }

export async function findRoundups(): Promise<Roundup[]> {
  const parser = new Parser(); const out: Roundup[] = [];
  const get = async (u: string) => { try { return await parser.parseString(await (await fetchRetry(u)).text()); } catch { return null; } };
  const er = await get('https://entrackr.com/rss');
  for (const i of er?.items ?? []) if (i.link && /weekly-funding-report/.test(i.link)) {
    const pub = i.isoDate ?? new Date().toISOString();
    out.push({ source: 'entrackr-weekly', url: i.link, title: i.title ?? 'Entrackr weekly funding report', published: pub, week: weekStartIST(new Date(new Date(pub).getTime() - 86400000)) });
  }
  const ig = await get('https://inc42.com/tag/funding-galore/feed/');
  for (const i of ig?.items ?? []) if (i.link && /this-week/.test(i.link)) {
    const pub = i.isoDate ?? new Date().toISOString();
    out.push({ source: 'inc42-galore', url: i.link, title: i.title ?? 'Funding Galore', published: pub, week: weekStartIST(new Date(new Date(pub).getTime() - 86400000)) });
  }
  return out.sort((a, b) => b.published.localeCompare(a.published));
}

/** Reconcile one roundup against our deals for its week. */
export async function reconcileRoundup(r: Roundup, log: RunLog, budget: GeminiBudget) {
  const cfg = await loadConfig(); const inr = await getInrPerUsd(cfg.inrPerUsdFallback);
  await log.log('..', `reconcile ${r.source}: ${r.title.slice(0, 70)}`);
  const e = await enrichUrl(r.url);
  if (!e.text) { await log.log('ERR', `roundup fetch failed (${e.status}): ${r.url}`); return null; }
  const hash = sha(r.url);
  const ins = await db().from('raw_articles').upsert({ url: r.url, url_hash: hash, title: r.title, full_text: e.text, source_slug: r.source, tier: 3, published_at: r.published, fetch_status: 'ok', prefilter_pass: false, extract_status: 'done', is_roundup: true }, { onConflict: 'url_hash' }).select('id').single();
  const artId = ins.data?.id;
  const res = await extractBatch([{ id: artId ?? 'r', title: r.title, text: e.text, publishedAt: r.published }], budget, m => void log.log('WARN', m), 40000);
  const deals = [...res.values()][0]?.deals.filter(d => d.status === 'CLOSED') ?? [];
  await log.log('OK', `roundup parsed: ${deals.length} deals`);
  if (!deals.length) return null;

  const gm = await mapSectorsGemini(deals.filter(d => !keywordSector(d.sector, d.company_description, cfg.taxonomy)).map((d, i) => ({ key: String(i), raw: d.sector, desc: d.company_description })), cfg.taxonomy, budget).catch(() => ({} as Record<string, string>));
  let matched = 0, missed = 0, ui = 0; const mismatched: any[] = [];
  for (const d of deals) {
    const week = r.week;
    const usd = toUsd(d.amount_value, d.amount_currency, d.amount_unit, inr);
    const norm = normName(d.company_name);
    const mine = { company_norm: norm, aliases: d.company_aliases, amount_usd: usd, announcement_date: d.announcement_date, week_start: week };
    const { data: cands } = await db().from('deals').select('*').in('company_norm', [norm, ...d.company_aliases.map(normName)]).gte('week_start', addDays(week, -7)).lte('week_start', addDays(week, 7));
    // A deal counts as covered only if one of its sources is NOT a roundup (otherwise we'd match the roundup against itself)
    const indep = new Set<string>();
    if (cands?.length) {
      const { data: ss } = await db().from('deal_sources').select('deal_id, raw_articles(is_roundup,tier)').in('deal_id', cands.map(c => c.id));
      (ss ?? []).forEach((x: any) => { if (x.raw_articles && !x.raw_articles.is_roundup && x.raw_articles.tier !== 3) indep.add(x.deal_id); });
    }
    const hit = (cands ?? []).filter(c => indep.has(c.id)).find(c => matchDeals({ company_norm: c.company_norm, aliases: c.aliases, amount_usd: c.amount_usd, announcement_date: c.announcement_date, week_start: c.week_start }, mine) !== 'DIFFERENT');
    if (hit) {
      matched++;
      const amtOff = hit.amount_usd && usd && Math.abs(hit.amount_usd - usd) / Math.max(hit.amount_usd, usd) > 0.1;
      const stageOff = hit.stage && d.stage && hit.stage !== d.stage && d.stage !== 'UNDISCLOSED';
      if (amtOff || stageOff) mismatched.push({ company: d.company_name, ours: { amount_usd: hit.amount_usd, stage: hit.stage }, roundup: { amount_usd: usd, stage: d.stage } });
    } else missed++;
    const sector_mapped = keywordSector(d.sector, d.company_description, cfg.taxonomy) ?? gm[String(ui++)] ?? 'Other';
    const nd: NormDeal = { ...d, company_norm: norm, amount_usd: usd, sector_mapped, week_start: week, evidence_verified: true, article_id: artId, source_slug: r.source, source_tier: 3, published_at: r.published };
    await upsertDeal(nd, cfg, log, budget);
  }
  const coverage = Math.round((matched / deals.length) * 1000) / 10;
  await db().from('reconciliations').insert({ week_start: r.week, source: r.source, report_url: r.url, matched, missed, mismatched, total: deals.length });
  if (r.source === 'entrackr-weekly' || !(await db().from('weeks').select('coverage_pct').eq('week_start', r.week).maybeSingle()).data?.coverage_pct)
    await db().from('weeks').upsert({ week_start: r.week, coverage_pct: coverage }, { onConflict: 'week_start' });
  await log.log('OK', `coverage vs ${r.source}: ${coverage}% (${matched}/${deals.length}), ${missed} missed→added, ${mismatched.length} mismatched`);
  return { week: r.week, matched, missed, total: deals.length, coverage, mismatched };
}

export async function runReconcile(opts: { weeks?: number } = {}) {
  const budget = new GeminiBudget(20); const log = new RunLog(true, 'reconcile'); await log.start();
  const results: any[] = [];
  try {
    const all = await findRoundups();
    const latest = new Map<string, Roundup>();
    for (const r of all) if (!latest.has(`${r.source}:${r.week}`)) latest.set(`${r.source}:${r.week}`, r);
    const picks = [...latest.values()].slice(0, (opts.weeks ?? 1) * 2);
    await log.log('OK', `found ${all.length} roundups; reconciling ${picks.length}`);
    for (const r of picks) { const x = await reconcileRoundup(r, log, budget).catch(async e => { await log.log('ERR', e.message); return null; }); if (x) results.push(x); }
  } catch (e: any) { await log.log('ERR', e.message); }
  await log.finish(log.errors.length ? 'partial' : 'ok', budget);
  return results;
}
