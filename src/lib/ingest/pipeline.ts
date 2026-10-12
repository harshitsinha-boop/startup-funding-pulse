import { db } from '../db';
import { loadConfig, loadWatchlist } from '../config';
import { GeminiBudget } from '../gemini';
import { getInrPerUsd } from '../fx';
import { chunk, pMap, sha, sleep } from '../util';
import { normName, toUsd, dealWeek, addDays } from '../normalize';
import { scoreDeal } from '../rank';
import { prefilter } from '../prefilter';
import { fetchFeed, gnewsQueries, gnewsUrl, gnewsState, resolveGoogleNewsUrl, fetchNewsData, type Candidate } from './feeds';
import { enrichUrl } from './enrich';
import { extractBatch } from './extract';
import { keywordSector, mapSectorsGemini } from './sector';
import { upsertDeal, checkWatchlist } from './persist';
import { RunLog } from './runlog';
import type { Config, NormDeal } from '../types';

export const ROUNDUP_URL = /weekly-funding-report|funding-galore|indian-startups?-raised-.*this-week|this-week-(oct|sep|aug|jul|jun|may|apr|mar|feb|jan|nov|dec)/i;

export interface IngestOpts { deadlineMs?: number; maxArticles?: number; maxGeminiCalls?: number; gnewsDays?: number; skipDiscovery?: boolean }

/** Discover → prefilter → store candidates. Returns the number of new prefilter-passing articles. */
export async function discover(log: RunLog, cfg: Config, opts: IngestOpts = {}) {
  const { data: sources } = await db().from('sources').select('*').eq('enabled', true).in('tier', [1, 4]).neq('kind', 'roundup');
  const watch = await loadWatchlist();
  const feeds: { slug: string; url: string; tier: number; gnews?: boolean }[] = [];
  for (const s of sources ?? []) {
    if (cfg.disabledSources.includes(s.slug) || s.kind === 'api') continue;
    feeds.push({ slug: s.slug, url: s.url, tier: s.tier });
  }
  const { data: gn } = await db().from('sources').select('enabled').eq('slug', 'gnews').single();
  if (gn?.enabled && !cfg.disabledSources.includes('gnews'))
    for (const q of gnewsQueries(cfg, watch)) feeds.push({ slug: 'gnews', url: gnewsUrl(q, opts.gnewsDays ?? 7), tier: 2, gnews: true });

  const results = await pMap(feeds.filter(f => !f.gnews), 3, f => fetchFeed(f.slug, f.url, f.tier));
  gnewsState.blocked = false; gnewsState.resolved = 0;
  for (const f of feeds.filter(f => f.gnews)) {          // politeness: Google News sequentially, 700ms apart, stop on 429
    if (gnewsState.blocked) { results.push({ slug: 'gnews', ok: false, items: [], error: 'rate limited (429) — skipped' }); continue; }
    results.push(await fetchFeed(f.slug, f.url, f.tier, { gnews: true })); await sleep(700);
  }
  if (!cfg.disabledSources.includes('newsdata')) { const nd = await fetchNewsData(); if (nd.ok) results.push(nd); }
  // per-source health
  const health = new Map<string, { n: number; ok: boolean; err?: string }>();
  for (const r of results) {
    const h = health.get(r.slug) ?? { n: 0, ok: true }; h.n += r.items.length; h.ok = h.ok && r.ok; if (r.error) h.err = r.error; health.set(r.slug, h);
  }
  for (const [slug, h] of health) {
    await db().from('sources').update({ last_status: h.ok ? 'ok' : (h.err ?? 'error'), last_checked_at: new Date().toISOString(), last_item_count: h.n }).eq('slug', slug);
    await log.log(h.ok ? 'OK' : 'WARN', `fetched ${slug} ${h.n} items${h.ok ? '' : ' — ' + h.err}`);
  }
  const all: Candidate[] = results.flatMap(r => r.items).map(c => c.source_slug === 'gnews' ? { ...c, source_slug: `gnews:${c.publisher ?? 'unknown'}` } : c);
  // dedupe within the fetch by url and by title (GNews repeats across queries)
  const seen = new Set<string>(); const uniq = all.filter(c => { const k = c.url_hash; if (seen.has(k)) return false; seen.add(k); return true; });
  log.set('discovered', all.length); log.set('unique_urls', uniq.length);
  const have = new Set<string>();
  for (const part of chunk(uniq.map(u => u.url_hash), 80)) {
    const { data: existing } = await db().from('raw_articles').select('url_hash').in('url_hash', part);
    (existing ?? []).forEach(e => have.add(e.url_hash));
  }
  const fresh = uniq.filter(u => !have.has(u.url_hash));
  log.set('new_urls', fresh.length);
  const rows = fresh.map(c => {
    const roundup = ROUNDUP_URL.test(c.url);               // weekly roundups are verification sources, never ingest sources
    const pf = roundup ? { pass: false } : prefilter(c.title, c.summary);
    return { is_roundup: roundup, url: c.url, url_hash: c.url_hash, title: c.title, summary: c.summary, full_text: c.full_text, source_slug: c.source_slug, tier: c.tier,
      published_at: c.published_at, prefilter_pass: pf.pass, fetch_status: c.full_text ? 'ok' : 'pending', extract_status: pf.pass ? 'pending' : 'skipped' };
  });
  for (const part of chunk(rows, 200)) { const r = await db().from('raw_articles').upsert(part, { onConflict: 'url_hash', ignoreDuplicates: true }); if (r.error) await log.log('ERR', `store articles: ${r.error.message}`); }
  const passed = rows.filter(r => r.prefilter_pass).length;
  log.set('prefilter_pass', passed);
  await log.log('..', `prefilter ${rows.length}→${passed}`);
  return passed;
}

async function enrichPending(log: RunLog, limit: number, deadline: number) {
  const { data: arts } = await db().from('raw_articles').select('id,url,source_slug,tier').eq('prefilter_pass', true).eq('extract_status', 'pending').is('full_text', null).eq('fetch_status', 'pending').order('tier').limit(limit);
  if (!arts?.length) return;
  let ok = 0, fail = 0;
  await pMap(arts, 3, async a => {
    if (Date.now() > deadline) return;
    let url = a.url;
    if (new URL(url).hostname === 'news.google.com') {
      const r = await resolveGoogleNewsUrl(url); await sleep(600);
      if (!r) { await db().from('raw_articles').update({ fetch_status: 'failed' }).eq('id', a.id); fail++; return; }   // stays title-only → LOW confidence
      url = r;
    }
    const e = await enrichUrl(url);
    await db().from('raw_articles').update({ fetch_status: e.status, full_text: e.text, ...(url !== a.url ? { url: url } : {}) }).eq('id', a.id);
    e.status === 'ok' ? ok++ : fail++;
  });
  log.inc('enriched_ok', ok); log.inc('enrich_failed', fail);
  await log.log('OK', `enriched ${ok}/${arts.length} full-text (${fail} failed→low-confidence)`);
}

function sanitizeDate(ann: string | null, published: string | null): string | null {
  if (!ann || !/^\d{4}-\d{2}-\d{2}$/.test(ann)) return null;
  if (!published) return ann;
  const diff = Math.abs(new Date(ann).getTime() - new Date(published).getTime()) / 86400000;
  return diff > 45 ? null : ann;
}

export async function runIngest(opts: IngestOpts = {}) {
  const deadline = Date.now() + (opts.deadlineMs ?? 240_000);
  const budget = new GeminiBudget(opts.maxGeminiCalls ?? 60);
  const log = new RunLog(true, 'ingest'); await log.start();
  let status = 'ok';
  try {
    const cfg = await loadConfig(); const watch = await loadWatchlist();
    const inr = await getInrPerUsd(cfg.inrPerUsdFallback);
    await log.log('OK', `boot: model=${process.env.GEMINI_MODEL ?? 'gemini-3.6-flash'} fx=₹${inr}/USD`);
    if (!opts.skipDiscovery) await discover(log, cfg, opts);

    let processed = 0;
    while (Date.now() < deadline - 20_000 && !budget.exhausted && processed < (opts.maxArticles ?? 400)) {
      await enrichPending(log, 24, deadline - 15_000);
      const { data: pending } = await db().from('raw_articles').select('*').eq('prefilter_pass', true).eq('extract_status', 'pending').neq('fetch_status', 'pending').order('tier').order('published_at', { ascending: false }).limit(24);
      if (!pending?.length) break;
      const batches = chunk(pending, 5).filter(() => !budget.exhausted);
      await log.log('..', `gemini extracting ${pending.length} items in ${batches.length} batches`);
      // extraction calls run 3-wide; persistence stays sequential so dedupe/merge can't race
      const results = await pMap(batches, 3, async batch => {
        if (Date.now() > deadline - 15_000) return { batch, err: 'deadline' as string | null, res: null };
        try { return { batch, err: null, res: await extractBatch(batch.map(a => ({ id: a.id, title: a.title, text: a.full_text || a.summary || a.title, publishedAt: a.published_at })), budget, m => { void log.log('WARN', m); }) }; }
        catch (e: any) { return { batch, err: String(e.message), res: null }; }
      });
      for (const { batch, res, err } of results) {
        if (err || !res) { if (err !== 'deadline') { await log.log('ERR', `extract: ${err}`); log.inc('extract_errors'); if (/budget|API key|PERMISSION|403|401/.test(err ?? '')) status = 'partial'; } continue; }
        try {
          const allDeals = batch.flatMap(a => (res.get(a.id)?.deals ?? []).map(d => ({ a, d })));
          const unmapped = allDeals.filter(x => !keywordSector(x.d.sector, x.d.company_description, cfg.taxonomy));
          const gmap = unmapped.length && !budget.exhausted ? await mapSectorsGemini(unmapped.map((x, i) => ({ key: String(i), raw: x.d.sector, desc: x.d.company_description })), cfg.taxonomy, budget).catch(() => ({} as Record<string, string>)) : {};
          let nDeals = 0;
          for (const a of batch) {
            const r = res.get(a.id);
            if (!r) { await db().from('raw_articles').update({ extract_status: 'failed' }).eq('id', a.id); continue; }
            for (const d of r.deals) {
              const idx = unmapped.findIndex(u => u.d === d);
              const sector_mapped = keywordSector(d.sector, d.company_description, cfg.taxonomy) ?? (idx >= 0 ? gmap[String(idx)] : null) ?? 'Other';
              const ann = sanitizeDate(d.announcement_date, a.published_at);
              const nd: NormDeal = { ...d, announcement_date: ann, company_norm: normName(d.company_name), sector_mapped,
                amount_usd: toUsd(d.amount_value, d.amount_currency, d.amount_unit, inr), week_start: dealWeek(ann, a.published_at),
                evidence_verified: r.verifiedAll[r.deals.indexOf(d)] ?? true, article_id: a.id, source_slug: a.source_slug, source_tier: a.tier, published_at: a.published_at };
              if (!nd.company_norm) continue;
              const out = await upsertDeal(nd, cfg, log, budget);
              if (out?.isNew) { nDeals++; await log.log('NEW', `${nd.company_name} ${nd.stage ?? '—'} ${nd.amount_usd ? '$' + Math.round(nd.amount_usd / 1e5) / 10 + 'M' : 'undisclosed'}`); }
            }
            await db().from('raw_articles').update({ extract_status: r.is_funding_announcement ? 'done' : 'skipped' }).eq('id', a.id);
            processed++;
          }
          log.inc('deals_new', nDeals); log.inc('articles_extracted', batch.length);
          await log.log('OK', `gemini extracted ${res.size}/${batch.length} articles → ${allDeals.length} deal records`);
        } catch (e: any) { await log.log('ERR', `persist: ${e.message}`); log.inc('extract_errors'); }
      }
    }
    const { count } = await db().from('raw_articles').select('id', { count: 'exact', head: true }).eq('prefilter_pass', true).eq('extract_status', 'pending');
    log.set('queue_remaining', count ?? 0);
    if ((count ?? 0) > 0) { status = 'partial'; await log.log('WARN', `${count} articles still queued — will resume next run`); }
    await checkWatchlist(null, watch, cfg, budget, log);
    await rescore(cfg);
    await log.log('OK', `run complete: ${log.counts.deals_new ?? 0} new deals, ${budget.calls} gemini calls`);
  } catch (e: any) { status = 'error'; await log.log('ERR', e.message); }
  await log.finish(status, budget);
  return { status, counts: log.counts, gemini: { calls: budget.calls, in: budget.tokensIn, out: budget.tokensOut }, errors: log.errors };
}

export async function rescore(cfg: Config, weeksBack = 3) {
  const from = addDays(new Date().toISOString().slice(0, 10), -7 * weeksBack);
  const { data } = await db().from('deals').select('id,sector,stage,amount_usd,watchlist_hit,adjacency,confidence').gte('week_start', from);
  for (const d of data ?? []) await db().from('deals').update({ score: scoreDeal(d as any, cfg) }).eq('id', d.id);
}
