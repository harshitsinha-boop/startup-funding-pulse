import { db } from './db';
import { genJSON, GeminiBudget, T } from './gemini';
import { addDays, fmtUsd } from './normalize';
import { median } from './util';
import type { Config } from './types';

type D = { id: string; company_name: string; sector: string | null; stage: string | null; amount_usd: number | null; hq_city: string | null; week_start: string; status: string; announcement_date: string | null };
export interface Agg { count: number; usd: number }
export interface WeekStats {
  week_start: string; total: Agg; prev_total: Agg; avg4_total: Agg;
  by_sector: Record<string, { cur: Agg; prev: Agg; avg4: Agg; wow_pct: number | null; vs_avg_pct: number | null; share_pct: number; trend6: number[] }>;
  by_stage: Record<string, { cur: Agg; prev: Agg; avg4: Agg; median_usd: number }>;
  accelerating: string[]; cooling: string[];
  top_investors: { name: string; deals: number }[]; new_investors: { name: string; sector: string }[];
  largest: { id: string; company: string; usd: number; stage: string | null; sector: string | null }[];
  outliers: { id: string; company: string; usd: number; stage: string; median_usd: number }[];
  cities: Record<string, number>; coverage_pct: number | null; rumoured_count: number;
}

const agg = (ds: D[]): Agg => ({ count: ds.length, usd: ds.reduce((s, d) => s + (d.amount_usd ?? 0), 0) });
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

export async function computeStats(week: string, cfg: Config): Promise<WeekStats> {
  const from = addDays(week, -7 * 7);
  const { data } = await db().from('deals').select('id,company_name,sector,stage,amount_usd,hq_city,week_start,status,announcement_date').gte('week_start', from).lte('week_start', week);
  const all = ((data ?? []) as D[]);
  const closed = all.filter(d => d.status !== 'REPORTED_IN_TALKS');
  const wk = (w: string) => closed.filter(d => d.week_start === w);
  const cur = wk(week), prev = wk(addDays(week, -7));
  const prev4 = [1, 2, 3, 4].map(i => wk(addDays(week, -7 * i)));
  const avg = (f: (ds: D[]) => Agg): Agg => { const a = prev4.map(f); return { count: +(a.reduce((s, x) => s + x.count, 0) / 4).toFixed(1), usd: Math.round(a.reduce((s, x) => s + x.usd, 0) / 4) }; };
  const sectors = [...new Set([...cfg.taxonomy.filter(s => cur.some(d => d.sector === s) || cfg.sectors.includes(s))])];
  const by_sector: WeekStats['by_sector'] = {};
  for (const s of sectors) {
    const c = agg(cur.filter(d => d.sector === s)), p = agg(prev.filter(d => d.sector === s)), a = avg(ds => agg(ds.filter(d => d.sector === s)));
    by_sector[s] = { cur: c, prev: p, avg4: a, wow_pct: pct(c.usd, p.usd), vs_avg_pct: pct(c.usd, a.usd),
      share_pct: cur.length ? Math.round((c.count / cur.length) * 100) : 0,
      trend6: [5, 4, 3, 2, 1, 0].map(i => agg(wk(addDays(week, -7 * i)).filter(d => d.sector === s)).usd) };
  }
  const stages = [...new Set(closed.map(d => d.stage).filter(Boolean))] as string[];
  const by_stage: WeekStats['by_stage'] = {};
  for (const s of stages) {
    const hist = closed.filter(d => d.stage === s && d.amount_usd).map(d => d.amount_usd!);
    by_stage[s] = { cur: agg(cur.filter(d => d.stage === s)), prev: agg(prev.filter(d => d.stage === s)), avg4: avg(ds => agg(ds.filter(d => d.stage === s))), median_usd: Math.round(median(hist)) };
  }
  const ranked = Object.entries(by_sector).filter(([, v]) => v.cur.count + v.prev.count >= 2);
  const accelerating = ranked.filter(([, v]) => (v.wow_pct ?? 0) >= 25 && (v.vs_avg_pct ?? 0) >= 0).sort((a, b) => (b[1].wow_pct ?? 0) - (a[1].wow_pct ?? 0)).map(([k]) => k).slice(0, 3);
  const cooling = ranked.filter(([, v]) => (v.wow_pct ?? 0) <= -25).sort((a, b) => (a[1].wow_pct ?? 0) - (b[1].wow_pct ?? 0)).map(([k]) => k).slice(0, 3);

  // investors
  const { data: di } = await db().from('deal_investors').select('deal_id,investors(name,id,first_seen),deals(sector,week_start,status)').gte('deals.week_start', from);
  const rows = ((di ?? []) as any[]).filter(r => r.deals && r.investors);
  const thisWeek = rows.filter(r => r.deals.week_start === week && r.deals.status !== 'REPORTED_IN_TALKS');
  const counts = new Map<string, number>();
  thisWeek.forEach(r => counts.set(r.investors.name, (counts.get(r.investors.name) ?? 0) + 1));
  const top_investors = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, deals]) => ({ name, deals }));
  const new_investors: WeekStats['new_investors'] = [];
  for (const r of thisWeek) {
    if (!cfg.sectors.includes(r.deals.sector)) continue;
    const earlier = rows.some(o => o.investors.id === r.investors.id && o.deals.sector === r.deals.sector && o.deals.week_start < week);
    if (!earlier && !new_investors.some(n => n.name === r.investors.name)) new_investors.push({ name: r.investors.name, sector: r.deals.sector });
  }
  const largest = [...cur].filter(d => d.amount_usd).sort((a, b) => b.amount_usd! - a.amount_usd!).slice(0, 5).map(d => ({ id: d.id, company: d.company_name, usd: d.amount_usd!, stage: d.stage, sector: d.sector }));
  const outliers = cur.filter(d => d.amount_usd && d.stage && by_stage[d.stage]?.median_usd && d.amount_usd > 2 * by_stage[d.stage].median_usd && by_stage[d.stage].median_usd > 0)
    .map(d => ({ id: d.id, company: d.company_name, usd: d.amount_usd!, stage: d.stage!, median_usd: by_stage[d.stage!].median_usd })).slice(0, 5);
  const cities: Record<string, number> = {};
  cur.forEach(d => { if (d.hq_city) cities[d.hq_city] = (cities[d.hq_city] ?? 0) + 1; });
  const { data: rec } = await db().from('weeks').select('coverage_pct').eq('week_start', week).maybeSingle();
  return { week_start: week, total: agg(cur), prev_total: agg(prev), avg4_total: avg(agg), by_sector, by_stage, accelerating, cooling, top_investors, new_investors, largest, outliers, cities,
    coverage_pct: rec?.coverage_pct ?? null, rumoured_count: all.filter(d => d.week_start === week && d.status === 'REPORTED_IN_TALKS').length };
}

/** Human-readable fact lines. Gemini may only use numbers from here. */
export function factsFrom(s: WeekStats): string[] {
  const f: string[] = [];
  f.push(`TOTAL: ${s.total.count} deals, ${fmtUsd(s.total.usd)} this week; previous week ${s.prev_total.count} deals, ${fmtUsd(s.prev_total.usd)}; 4-week average ${s.avg4_total.count} deals, ${fmtUsd(s.avg4_total.usd)}.`);
  for (const [k, v] of Object.entries(s.by_sector)) if (v.cur.count || v.prev.count)
    f.push(`SECTOR ${k}: ${v.cur.count} deals, ${fmtUsd(v.cur.usd)} (${v.share_pct}% of deals); previous week ${v.prev.count} deals, ${fmtUsd(v.prev.usd)}; WoW ${v.wow_pct ?? 'n/a'}%; vs 4-wk avg ${v.vs_avg_pct ?? 'n/a'}%.`);
  for (const [k, v] of Object.entries(s.by_stage)) if (v.cur.count) f.push(`STAGE ${k}: ${v.cur.count} deals, ${fmtUsd(v.cur.usd)}; median round ${fmtUsd(v.median_usd)}.`);
  if (s.accelerating.length) f.push(`ACCELERATING: ${s.accelerating.join(', ')}.`);
  if (s.cooling.length) f.push(`COOLING: ${s.cooling.join(', ')}.`);
  if (s.top_investors.length) f.push(`MOST ACTIVE INVESTORS: ${s.top_investors.map(i => `${i.name} (${i.deals} deals)`).join('; ')}.`);
  if (s.new_investors.length) f.push(`NEW-TO-SECTOR INVESTORS: ${s.new_investors.map(i => `${i.name} in ${i.sector}`).join('; ')}.`);
  if (s.largest.length) f.push(`LARGEST ROUNDS: ${s.largest.map(l => `${l.company} ${fmtUsd(l.usd)} (${l.stage ?? 'n/a'})`).join('; ')}.`);
  if (s.outliers.length) f.push(`OUTLIERS (>2x stage median): ${s.outliers.map(o => `${o.company} ${fmtUsd(o.usd)} vs ${o.stage} median ${fmtUsd(o.median_usd)}`).join('; ')}.`);
  if (Object.keys(s.cities).length) f.push(`CITIES: ${Object.entries(s.cities).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ')}.`);
  if (s.coverage_pct != null) f.push(`COVERAGE vs Entrackr roundup: ${s.coverage_pct}%.`);
  return f;
}

export const numbersIn = (t: string) => (t.replace(/,/g, '').match(/\d+(\.\d+)?/g) ?? []).map(n => String(parseFloat(n)));
/** Reject any insight whose numbers don't appear in the provided facts. */
export function insightIsGrounded(text: string, facts: string): boolean {
  const allowed = new Set(numbersIn(facts));
  return numbersIn(text).every(n => allowed.has(n));
}

export interface Insight { headline: string; detail: string; supporting_deal_ids: string[]; type: string }
export async function narrate(stats: WeekStats, budget: GeminiBudget): Promise<Insight[]> {
  const facts = factsFrom(stats); const factText = facts.join('\n');
  if (stats.total.count === 0) return [];
  const raw = await genJSON<Insight[]>({
    system: 'You are an analyst writing 3-6 concise insights for a venture scout about one week of Indian startup funding. Use ONLY facts and numbers given; never invent, round differently, or compute new numbers. Each insight: short headline, 1-2 sentence detail, type (sector_trend|stage|investor|outlier|geography|coverage). supporting_deal_ids may be empty.',
    prompt: `FACTS:\n${factText}\n\nKNOWN DEAL IDS:\n${[...stats.largest, ...stats.outliers].map(d => `${d.id} = ${d.company}`).join('\n')}`,
    schema: { type: T.A, items: { type: T.O, properties: { headline: { type: T.S }, detail: { type: T.S }, supporting_deal_ids: { type: T.A, items: { type: T.S } }, type: { type: T.S } }, required: ['headline', 'detail', 'supporting_deal_ids', 'type'] } },
    budget,
  });
  return raw.filter(i => insightIsGrounded(`${i.headline} ${i.detail}`, factText)).slice(0, 6);
}
