import { db } from '../db';
import { genJSON, GeminiBudget, T } from '../gemini';
import { matchDeals, mergeField, type Mergeable } from '../dedupe';
import { normName, addDays } from '../normalize';
import { scoreDeal } from '../rank';
import type { Config, Confidence, NormDeal } from '../types';
import type { RunLog } from './runlog';
import type { WatchItem } from '../config';

export const pubKey = (slug: string | null | undefined) =>
  (slug ?? '').replace(/^gnews:/, '').toLowerCase().replace(/(buzz|galore|weekly|startups?|media)/g, '').replace(/[^a-z0-9]/g, '');

export async function computeConfidence(dealId: string): Promise<Confidence> {
  const { data: deal } = await db().from('deals').select('status,evidence_verified').eq('id', dealId).single();
  if (deal?.status === 'REPORTED_IN_TALKS') return 'RUMOURED';
  const { data: srcs } = await db().from('deal_sources').select('raw_articles(source_slug,tier,full_text)').eq('deal_id', dealId);
  const arts = (srcs ?? []).map((s: any) => s.raw_articles).filter(Boolean);
  const pubs = new Set(arts.map((a: any) => pubKey(a.source_slug)));
  if (arts.some((a: any) => a.tier === 3) || pubs.size >= 2) return 'CONFIRMED';
  if (!deal?.evidence_verified) return 'LOW';
  if (arts.some((a: any) => a.full_text && a.tier !== 2) || arts.some((a: any) => a.tier === 2 && a.full_text)) return 'SINGLE_SOURCE';
  return 'LOW';
}

async function gptSameDeal(a: any, b: NormDeal, budget: GeminiBudget): Promise<boolean> {
  try {
    const r = await genJSON<{ same: boolean; reasoning: string }>({
      system: 'Decide whether two extracted records describe the SAME funding round of the SAME company. Different rounds (e.g. seed vs Series A months apart) are NOT the same. Return JSON.',
      prompt: `A: ${JSON.stringify({ company: a.company_name, stage: a.stage, amount_usd: a.amount_usd, date: a.announcement_date, investors: a.lead_investors })}\nB: ${JSON.stringify({ company: b.company_name, stage: b.stage, amount_usd: b.amount_usd, date: b.announcement_date, investors: b.lead_investors })}`,
      schema: { type: T.O, properties: { same: { type: T.B }, reasoning: { type: T.S } }, required: ['same', 'reasoning'] }, budget,
    });
    return r.same;
  } catch { return false; }
}

async function linkInvestors(dealId: string, d: NormDeal) {
  const rows: { name: string; role: string }[] = [
    ...d.lead_investors.map(name => ({ name, role: 'lead' })), ...d.other_investors.map(name => ({ name, role: 'participant' }))];
  for (const r of rows) {
    const norm = normName(r.name); if (!norm) continue;
    let { data: inv } = await db().from('investors').select('id').eq('name_norm', norm).maybeSingle();
    if (!inv) { const ins = await db().from('investors').insert({ name: r.name.trim(), name_norm: norm }).select('id').single(); inv = ins.data; }
    if (inv) await db().from('deal_investors').upsert({ deal_id: dealId, investor_id: inv.id, role: r.role }, { onConflict: 'deal_id,investor_id' });
  }
}

/** Dedupe + merge a normalised deal into the deals table. Returns the deal id & whether it was new. */
export async function upsertDeal(d: NormDeal, cfg: Config, log: RunLog, budget: GeminiBudget): Promise<{ id: string; isNew: boolean } | null> {
  const names = [...new Set([d.company_norm, ...d.company_aliases.map(normName)].filter(Boolean))];
  const { data: cands } = await db().from('deals').select('*').in('company_norm', names)
    .gte('week_start', addDays(d.week_start, -14)).lte('week_start', addDays(d.week_start, 14));
  const mine: Mergeable = { company_norm: d.company_norm, aliases: d.company_aliases, amount_usd: d.amount_usd, announcement_date: d.announcement_date, published_at: d.published_at, week_start: d.week_start };
  let target: any = null;
  for (const c of cands ?? []) {
    const v = matchDeals({ company_norm: c.company_norm, aliases: c.aliases, amount_usd: c.amount_usd, announcement_date: c.announcement_date, week_start: c.week_start }, mine);
    if (v === 'SAME') { target = c; break; }
    if (v === 'AMBIGUOUS' && !budget.exhausted && await gptSameDeal(c, d, budget)) { target = c; break; }
  }
  const evidenceJson = { ...d.evidence, source: d.source_slug };
  let id: string, isNew = false;
  if (target) {
    id = target.id;
    const stage = target.stage && target.stage !== 'UNDISCLOSED' ? target.stage : (d.stage ?? target.stage);
    const useNewAmount = target.amount_usd == null && d.amount_usd != null;
    await db().from('deals').update({
      aliases: mergeField(target.aliases, d.company_aliases) ?? [],
      description: mergeField(target.description, d.company_description),
      hq_city: mergeField(target.hq_city, d.hq_city),
      sector_raw: mergeField(target.sector_raw, d.sector), sector: target.sector ?? d.sector_mapped,
      ...(useNewAmount ? { amount_value: d.amount_value, amount_currency: d.amount_currency, amount_unit: d.amount_unit, amount_usd: d.amount_usd, amount_disclosed: true } : {}),
      stage, instrument: target.instrument === 'UNKNOWN' ? d.instrument : target.instrument,
      status: target.status === 'CLOSED' || d.status === 'CLOSED' ? 'CLOSED' : 'REPORTED_IN_TALKS',
      announcement_date: target.announcement_date ?? d.announcement_date,
      evidence: { ...(target.evidence ?? {}), ...Object.fromEntries(Object.entries(d.evidence).filter(([, v]) => v)) },
      evidence_verified: target.evidence_verified && d.evidence_verified,
      last_updated: new Date().toISOString(),
    }).eq('id', id);
    await log.log('MERGE', `${d.company_name} ← +1 source (${d.source_slug})`);
  } else {
    isNew = true;
    const ins = await db().from('deals').insert({
      company_name: d.company_name, company_norm: d.company_norm, aliases: d.company_aliases, description: d.company_description,
      hq_city: d.hq_city, sector_raw: d.sector, sector: d.sector_mapped, amount_value: d.amount_value, amount_currency: d.amount_currency,
      amount_unit: d.amount_unit, amount_disclosed: d.amount_disclosed, amount_usd: d.amount_usd, stage: d.stage, instrument: d.instrument,
      status: d.status, announcement_date: d.announcement_date, week_start: d.week_start, evidence: evidenceJson, evidence_verified: d.evidence_verified,
    }).select('id').single();
    if (ins.error || !ins.data) { await log.log('ERR', `insert ${d.company_name}: ${ins.error?.message}`); return null; }
    id = ins.data.id;
  }
  if (d.article_id) await db().from('deal_sources').upsert({ deal_id: id, article_id: d.article_id, evidence: d.evidence }, { onConflict: 'deal_id,article_id' });
  await linkInvestors(id, d);
  const confidence = await computeConfidence(id);
  const { data: row } = await db().from('deals').select('sector,stage,amount_usd,watchlist_hit,adjacency').eq('id', id).single();
  await db().from('deals').update({ confidence, score: scoreDeal({ ...(row as any), confidence }, cfg) }).eq('id', id);
  return { id, isNew };
}

/** Exact watchlist matches + Gemini adjacency check, for deals not yet checked. */
export async function checkWatchlist(week: string | null, watch: WatchItem[], cfg: Config, budget: GeminiBudget, log: RunLog) {
  if (!watch.length) return;
  let q = db().from('deals').select('*').is('adjacency', null);
  if (week) q = q.gte('week_start', addDays(week, -7));
  const { data: deals } = await q.limit(200);
  if (!deals?.length) return;
  const wNorm = watch.map(w => ({ w, names: [w.name, ...(w.aliases ?? [])].map(normName) }));
  const todo: any[] = [];
  for (const d of deals) {
    const hit = wNorm.find(x => x.names.includes(d.company_norm) || (d.aliases ?? []).some((a: string) => x.names.includes(normName(a))));
    if (hit) { await db().from('deals').update({ watchlist_hit: hit.w.name, adjacency: { is_adjacent: false, exact: true } }).eq('id', d.id); await log.log('WARN', `WATCHLIST HIT: ${d.company_name}`); }
    else todo.push(d);
  }
  const { keywordSector } = await import('./sector');
  const wSectors = new Set(watch.map(w => keywordSector(null, `${w.name} ${w.description}`, cfg.taxonomy)).filter(Boolean));
  const eligible = todo.filter(d => !d.sector || wSectors.size === 0 || wSectors.has(d.sector) || cfg.sectors.includes(d.sector));
  const skipped = todo.filter(d => !eligible.includes(d));
  for (const d of skipped) await db().from('deals').update({ adjacency: { is_adjacent: false, skipped: 'sector' } }).eq('id', d.id);
  for (let i = 0; i < eligible.length && !budget.exhausted; i += 8) {
    const batch = eligible.slice(i, i + 8);
    try {
      const res = await genJSON<{ deal_id: string; matches: { watchlist_company: string; is_adjacent: boolean; relationship: string; reason: string }[] }[]>({
        system: 'You compare newly funded companies to a watchlist of portfolio companies. A match means competitor, adjacent (same customer/problem space), supplier, or customer of the watchlist company. Be strict: being in the same broad sector (e.g. both are fintech) is NOT enough. Only is_adjacent=true when the products or target customers concretely overlap (competitor), or one clearly sells to/buys from the other; give a one-sentence reason naming the overlap. Use only the supplied descriptions; do not invent facts.',
        prompt: `WATCHLIST:\n${watch.map(w => `- ${w.name}: ${w.description}`).join('\n')}\n\nDEALS:\n${batch.map((d, bi) => `id=D${bi} | ${d.company_name} | sector=${d.sector} | ${d.description ?? 'no description'}`).join('\n')}`,
        schema: { type: T.A, items: { type: T.O, properties: { deal_id: { type: T.S }, matches: { type: T.A, items: { type: T.O, properties: {
          watchlist_company: { type: T.S }, is_adjacent: { type: T.B }, relationship: { type: T.S, enum: ['competitor', 'adjacent', 'supplier', 'customer'] }, reason: { type: T.S } },
          required: ['watchlist_company', 'is_adjacent', 'relationship', 'reason'] } } }, required: ['deal_id', 'matches'] } },
        budget,
      });
      for (const [bi, d] of batch.entries()) {
        const m = res.find(r => r.deal_id === `D${bi}`)?.matches.find(x => x.is_adjacent && watch.some(w => w.name === x.watchlist_company));
        const adj = m ? { is_adjacent: true, watchlist_company: m.watchlist_company, relationship: m.relationship, reason: m.reason } : { is_adjacent: false };
        const { data: row } = await db().from('deals').select('sector,stage,amount_usd,watchlist_hit,confidence').eq('id', d.id).single();
        await db().from('deals').update({ adjacency: adj, score: scoreDeal({ ...(row as any), adjacency: adj }, cfg) }).eq('id', d.id);
        if (m) await log.log('WARN', `ADJACENT: ${d.company_name} ~ ${m.watchlist_company} (${m.relationship})`);
      }
    } catch (e: any) { await log.log('ERR', `adjacency: ${e.message}`); }
  }
}
