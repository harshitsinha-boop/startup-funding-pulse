// DB-free dry run: live feeds → prefilter → full-text → Gemini extract → normalise. Prints the funnel.
import 'dotenv/config';
import { config as load } from 'dotenv';
load({ path: '.env.local' });
import { fetchFeed, gnewsUrl } from '../src/lib/ingest/feeds';
import { prefilter } from '../src/lib/prefilter';
import { enrichUrl } from '../src/lib/ingest/enrich';
import { extractBatch } from '../src/lib/ingest/extract';
import { keywordSector } from '../src/lib/ingest/sector';
import { GeminiBudget } from '../src/lib/gemini';
import { DEFAULT_CONFIG } from '../src/lib/config';
import { normName, toUsd, dealWeek, fmtUsd } from '../src/lib/normalize';
import { fetchRetry } from '../src/lib/util';

const LIMIT = Number(process.env.DRY_LIMIT ?? 10);
async function main() {
  const feeds = [['inc42', 'https://inc42.com/feed/', 1], ['inc42-buzz', 'https://inc42.com/buzz/feed/', 1], ['yourstory', 'https://yourstory.com/feed', 1], ['entrackr', 'https://entrackr.com/rss', 1], ['gnews', gnewsUrl('startup raises funding India'), 2]] as const;
  const res = await Promise.all(feeds.map(([s, u, t]) => fetchFeed(s, u, t, { gnews: s === 'gnews' })));
  res.forEach(r => console.log(`[${r.ok ? 'OK' : 'ERR'}] feed ${r.slug.padEnd(11)} ${r.items.length} items ${r.error ?? ''}`));
  const all = res.flatMap(r => r.items); const uniq = [...new Map(all.map(i => [i.url_hash, i])).values()];
  const passed = uniq.filter(i => prefilter(i.title, i.summary).pass);
  console.log(`[..] funnel: discovered ${all.length} → unique ${uniq.length} → prefilter ${passed.length}`);
  const sample = passed.filter(p => p.tier === 1).slice(0, LIMIT);
  let inr = 88; try { inr = (await (await fetchRetry('https://api.frankfurter.app/latest?from=USD&to=INR')).json() as any).rates.INR; } catch {}
  console.log(`[OK] fx ₹${inr}/USD; enriching ${sample.length} articles`);
  let full = 0;
  for (const a of sample) { if (!a.full_text) { const e = await enrichUrl(a.url); if (e.text) a.full_text = e.text; } if (a.full_text) full++; }
  console.log(`[OK] full-text available: ${full}/${sample.length}`);
  if (!process.env.GEMINI_API_KEY) { console.log('[WARN] GEMINI_API_KEY not set — stopping before extraction'); sample.forEach(s => console.log('  -', s.title)); return; }
  const budget = new GeminiBudget(10); let deals = 0, verified = 0;
  for (let i = 0; i < sample.length; i += 6) {
    const batch = sample.slice(i, i + 6);
    const out = await extractBatch(batch.map(a => ({ id: a.url_hash.slice(0, 8), title: a.title, text: a.full_text || a.summary || a.title, publishedAt: a.published_at })), budget, console.warn);
    for (const a of batch) {
      const r = out.get(a.url_hash.slice(0, 8)); if (!r) continue;
      r.deals.forEach((d, k) => { deals++; if (r.verifiedAll[k]) verified++;
        const usd = toUsd(d.amount_value, d.amount_currency, d.amount_unit, inr);
        console.log(`[NEW] ${d.company_name.padEnd(24)} ${(d.stage ?? '—').padEnd(13)} ${fmtUsd(usd).padEnd(10)} ${(keywordSector(d.sector, d.company_description, DEFAULT_CONFIG.taxonomy) ?? 'Other').padEnd(10)} wk ${dealWeek(d.announcement_date, a.published_at)} ${d.status} ${r.verifiedAll[k] ? '' : '(evidence failed)'}`);
        void normName; });
    }
  }
  console.log(`[OK] funnel: ${all.length} → ${uniq.length} → ${passed.length} → ${sample.length} enriched(${full} full) → ${deals} deals (${verified} evidence-verified); gemini calls ${budget.calls}, tokens in/out ${budget.tokensIn}/${budget.tokensOut}`);
}
main().catch(e => { console.error('[ERR]', e); process.exit(1); });
