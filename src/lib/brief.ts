import { Resend } from 'resend';
import { db } from './db';
import { loadConfig, loadWatchlist } from './config';
import { GeminiBudget } from './gemini';
import { getInrPerUsd } from './fx';
import { computeStats, narrate, type WeekStats, type Insight } from './patterns';
import { addDays, fmtUsd, previousWeekStart } from './normalize';
import { median } from './util';
import { RunLog } from './ingest/runlog';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const APP = () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const pubName = (slug: string) => { const n = String(slug).replace(/^gnews:/, ''); return ({ inc42: 'Inc42', 'inc42-buzz': 'Inc42', yourstory: 'YourStory', entrackr: 'Entrackr', 'et-startups': 'ET Tech', 'entrackr-weekly': 'Entrackr weekly funding report', 'inc42-galore': 'Inc42 Funding Galore' } as Record<string, string>)[n] ?? n; };
const CONF: Record<string, string> = { CONFIRMED: 'confirmed by 2+ sources', SINGLE_SOURCE: 'single credible source', LOW: 'low confidence (headline-level source only)', RUMOURED: 'reported, not confirmed' };
const day = (ymd: string) => new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const stageName = (s: string | null) => (s ?? 'stage not stated').replace(/_/g, ' ').toLowerCase();

/** Amount exactly as the source wrote it, plus the code-converted USD. Never estimated. */
function amountText(d: any, inr: number): string {
  if (d.amount_usd == null && d.amount_value == null) return 'amount undisclosed';
  const unit = ({ crore: ' Cr', lakh: ' L', million: 'M', billion: 'B', thousand: 'K', unit: '' } as Record<string, string>)[d.amount_unit ?? 'unit'] ?? '';
  const sym = ({ INR: '₹', USD: '$', EUR: '€' } as Record<string, string>)[d.amount_currency ?? ''] ?? `${d.amount_currency ?? ''} `;
  const written = d.amount_value != null ? `${sym}${d.amount_value}${unit}` : '';
  return d.amount_currency === 'USD' || !written ? fmtUsd(d.amount_usd) : `${written} (≈ ${fmtUsd(d.amount_usd)} at ₹${inr}/USD)`;
}

interface Section { h: string; paras?: string[]; bullets?: string[]; deals?: DealCard[]; }
interface DealCard { name: string; line: string; facts: string; investors: string; refs: number[]; note: string }
export interface BriefData { week: string; html: string; text: string; subject: string; preheader: string; stats: WeekStats; insights: Insight[] }

export async function buildBrief(week: string, budget: GeminiBudget, log?: RunLog): Promise<BriefData> {
  const cfg = await loadConfig(); const inr = await getInrPerUsd(cfg.inrPerUsdFallback); const watch = await loadWatchlist();
  const stats = await computeStats(week, cfg);
  let insights: Insight[] = [];
  try { insights = await narrate(stats, budget); } catch (e: any) { await log?.log('ERR', `narrate: ${e.message}`); }

  const { data: ds } = await db().from('deals').select('*, deal_investors(role, investors(name)), deal_sources(raw_articles(url, source_slug, title))').eq('week_start', week).order('score', { ascending: false });
  const deals = (ds ?? []).map((d: any) => ({
    ...d, lead: (d.deal_investors ?? []).filter((x: any) => x.role === 'lead').map((x: any) => x.investors?.name).filter(Boolean),
    other: (d.deal_investors ?? []).filter((x: any) => x.role !== 'lead').map((x: any) => x.investors?.name).filter(Boolean),
    sources: (d.deal_sources ?? []).map((s: any) => s.raw_articles).filter(Boolean).filter((a: any) => /^https?:/.test(a.url)).map((a: any) => ({ url: a.url, name: pubName(a.source_slug), title: a.title })),
  }));
  const closed = deals.filter((d: any) => d.status !== 'REPORTED_IN_TALKS'), rumoured = deals.filter((d: any) => d.status === 'REPORTED_IN_TALKS');
  const alerts = closed.filter((d: any) => d.watchlist_hit || d.adjacency?.is_adjacent);
  const isFocus = (d: any) => d.sector && cfg.sectors.includes(d.sector) && (!d.stage || cfg.stages.includes(d.stage));
  const notable = closed.filter((d: any) => !alerts.includes(d)).slice(0, 6);

  // numbered references, shared across the whole email
  const refs: { url: string; label: string }[] = [];
  const refOf = (src: { url: string; name: string; title: string }) => { let i = refs.findIndex(r => r.url === src.url); if (i < 0) { refs.push({ url: src.url, label: `${src.name} — ${src.title}` }); i = refs.length - 1; } return i + 1; };
  const card = (d: any, note = ''): DealCard => ({
    name: d.company_name, line: d.description ?? d.sector_raw ?? 'description not stated in source',
    facts: [amountText(d, inr), stageName(d.stage), d.announcement_date ? `announced ${day(d.announcement_date)}` : `reported week of ${day(week)}`, d.hq_city ?? null, d.sector ? `sector: ${d.sector}` : null].filter(Boolean).join(' · '),
    investors: d.lead.length || d.other.length ? `${d.lead.length ? 'Lead: ' + d.lead.join(', ') : 'Lead not stated'}${d.other.length ? '; also ' + d.other.slice(0, 4).join(', ') : ''}` : 'Investors not stated in source',
    refs: [...d.sources].sort((a: any, b: any) => Number(a.url.includes('news.google.com')) - Number(b.url.includes('news.google.com'))).slice(0, 2).map(refOf), note: [note, `Evidence: ${CONF[d.confidence] ?? d.confidence}`, isFocus(d) ? 'matches your focus sector/stage' : ''].filter(Boolean).join(' · '),
  });

  // ---- snapshot (all numbers computed in code) ----
  const disclosed = closed.filter((d: any) => d.amount_usd != null);
  const total = disclosed.reduce((s: number, d: any) => s + d.amount_usd, 0);
  const med = disclosed.length >= 5 ? median(disclosed.map((d: any) => d.amount_usd)) : null;
  const bySector = Object.entries(closed.reduce((m: Record<string, number>, d: any) => (m[d.sector ?? 'Other'] = (m[d.sector ?? 'Other'] ?? 0) + 1, m), {})).sort((a, b) => b[1] - a[1]);
  const byStage = Object.entries(closed.reduce((m: Record<string, number>, d: any) => (m[d.stage ?? 'NOT STATED'] = (m[d.stage ?? 'NOT STATED'] ?? 0) + 1, m), {})).sort((a, b) => b[1] - a[1]);
  const largest = [...disclosed].sort((a: any, b: any) => b.amount_usd - a.amount_usd)[0];
  const range = `${day(week)} – ${day(addDays(week, 6))}`;
  const comparable = stats.prev_total.count >= 5 && closed.length >= 5;
  const cutoff = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) + ' IST';

  const topSector = bySector[0]?.[0];
  const subject = `Funding digest ${range}: ${closed.length} deals, ${fmtUsd(total)} disclosed`.slice(0, 70);
  const preheader = `${topSector ? `${topSector} led by deal count. ` : ''}${alerts.length ? `${alerts.length} watchlist/adjacent alert${alerts.length > 1 ? 's' : ''} inside.` : 'No watchlist alerts this week.'}`;
  const exec = [
    `During ${range}, we found ${closed.length} in-scope Indian startup funding deals, with ${fmtUsd(total)} disclosed across ${disclosed.length} of them${largest ? `; the largest was ${largest.company_name} at ${fmtUsd(largest.amount_usd)}` : ''}.`,
    alerts.length ? `${alerts.length} deal${alerts.length > 1 ? 's' : ''} touch your watchlist (exact or adjacent) and ${notable.filter(isFocus).length} of the top ranked match your focus sectors and stages.` : `None of this week's deals touched your watchlist; ${notable.filter(isFocus).length} of the top ranked match your focus sectors and stages.`,
  ];

  const sections: Section[] = [];
  if (alerts.length || watch.length) sections.push({ h: 'Watchlist alerts', paras: alerts.length ? undefined : [`No hits this week across ${watch.length} monitored companies.`],
    deals: alerts.slice(0, 4).map((d: any) => card(d, d.watchlist_hit ? `Exact watchlist match: ${d.watchlist_hit}` : `${d.adjacency.relationship} of ${d.adjacency.watchlist_company} — ${d.adjacency.reason} (AI-assessed from company descriptions)`)) });
  if (insights.length) sections.push({ h: 'Key takeaways', bullets: insights.slice(0, 5).map(i => `${i.headline}. ${i.detail}`) });
  const acc = stats.accelerating[0] ? stats.by_sector[stats.accelerating[0]] : null;
  const why = acc && comparable ? `${stats.accelerating[0]} disclosed funding rose from ${fmtUsd(acc.prev.usd)} to ${fmtUsd(acc.cur.usd)} week on week${(acc.wow_pct ?? 0) > 300 ? ' — a very small prior-week base, so the jump overstates momentum' : ''}. This compares our own tracked deals, so treat it as directional.` : 'Weekly funding data is incomplete and timing-sensitive; read these totals as a floor, not a market census.';
  sections.push({ h: 'Weekly snapshot', bullets: [
    `Deals in scope: ${closed.length} (${closed.filter((d: any) => d.confidence === 'CONFIRMED').length} confirmed by 2+ sources, ${closed.filter((d: any) => d.confidence === 'SINGLE_SOURCE').length} single-source, ${closed.filter((d: any) => d.confidence === 'LOW').length} low-confidence).`,
    `Disclosed funding: ${fmtUsd(total)} across ${disclosed.length} deals; ${closed.length - disclosed.length} deals did not disclose an amount and are excluded from totals.`,
    `Median disclosed deal: ${med != null ? fmtUsd(med) : 'unavailable (fewer than 5 disclosed amounts)'}.`,
    `Leading sectors by deal count: ${bySector.slice(0, 3).map(([k, n]) => `${k} (${n})`).join(', ') || 'n/a'}.`,
    `Stage mix: ${byStage.slice(0, 5).map(([k, n]) => `${stageName(k)} ${n}`).join(', ') || 'n/a'}.`,
    comparable ? `Previous week (${day(addDays(week, -7))} – ${day(addDays(week, -1))}): ${stats.prev_total.count} deals, ${fmtUsd(stats.prev_total.usd)} disclosed.` : `Week-on-week comparison: not shown — the prior week has fewer than 5 tracked deals, so it would not be like-for-like.`,
    stats.coverage_pct != null ? `Coverage check: ${stats.coverage_pct}% of the deals in the published Entrackr weekly roundup were already captured independently.` : `Coverage check: the weekly roundup has not been reconciled yet.`,
    ...(rumoured.length ? [`Excluded from all figures: ${rumoured.length} reported-but-unconfirmed deals (“in talks”).`] : []),
  ], paras: [`Why it matters (analysis): ${why}`] });
  sections.push({ h: 'Notable deals', deals: notable.map(d => card(d)) });
  const signals: string[] = [];
  if (stats.accelerating.length && comparable) signals.push(`Accelerating sectors versus last week: ${stats.accelerating.join(', ')}.`);
  if (stats.cooling.length && comparable) signals.push(`Cooling sectors versus last week: ${stats.cooling.join(', ')}.`);
  if (stats.new_investors.length) signals.push(`New to your focus sectors this week: ${stats.new_investors.slice(0, 4).map(i => `${i.name} (${i.sector})`).join(', ')}.`);
  if (stats.top_investors.length && stats.top_investors[0].deals > 1) signals.push(`Most active investors: ${stats.top_investors.slice(0, 3).map(i => `${i.name} (${i.deals} deals)`).join(', ')}.`);
  if (stats.outliers.length) signals.push(`Rounds above 2× their stage median: ${stats.outliers.slice(0, 3).map(o => `${o.company} (${fmtUsd(o.usd)} vs ${fmtUsd(o.median_usd)})`).join(', ')}.`);
  if (rumoured.length) signals.push(`In talks, unconfirmed: ${rumoured.slice(0, 4).map((d: any) => `${d.company_name}${d.amount_usd ? ' (' + fmtUsd(d.amount_usd) + ')' : ''}`).join(', ')}.`);
  sections.push({ h: 'Signals to watch', paras: ['These are analysis based on this week\'s tracked deals, not reported facts.'], bullets: signals.length ? signals : ['No supportable signal this week — the sample is too small to say more.'] });

  const cta = `Is anyone missing from your watchlist? Add companies and descriptions at ${APP()}/config — adjacency detection gets sharper with each entry.`;
  const methodology = [`Research cutoff: ${cutoff}.`, `Inclusion: Indian startup funding rounds extracted from Inc42, YourStory, Entrackr, ET Tech and Google News discovery; weekly roundups (Entrackr, Inc42) are used only to verify. Week = Monday 00:00 to Sunday 23:59 IST by announcement date, falling back to first publication date.`, `Amounts are shown as written by the source; USD is converted in code at ₹${inr}/USD (Frankfurter daily rate). Undisclosed amounts and unconfirmed “in talks” reports are excluded from totals.`, `Limits: coverage depends on public Indian startup media; announcement date is not necessarily closing date; headline-only items are marked low confidence.`];

  // ---- render: one model, two outputs ----
  const refSup = (r: number[]) => r.map(n => `[${n}]`).join('');
  const dealHtml = (c: DealCard) => `<div style="margin:0 0 14px 0;padding:0 0 12px 0;border-bottom:1px solid #e5e5e0"><div style="font-size:16px;font-weight:bold;color:#111">${esc(c.name)} <span style="font-weight:normal;color:#555;font-size:13px">${esc(refSup(c.refs))}</span></div><div style="color:#333">${esc(c.line)}</div><div style="color:#111;margin-top:3px">${esc(c.facts)}</div><div style="color:#444">${esc(c.investors)}</div>${c.note ? `<div style="color:#666;font-size:13px;margin-top:2px">${esc(c.note)}</div>` : ''}</div>`;
  const dealText = (c: DealCard) => `* ${c.name} ${refSup(c.refs)}\n  ${c.line}\n  ${c.facts}\n  ${c.investors}${c.note ? '\n  ' + c.note : ''}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f0"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f4f0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f0"><tr><td align="center" style="padding:16px 10px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e0e0da"><tr><td style="padding:22px 22px 8px 22px;font-family:${SANS};font-size:15px;line-height:1.55;color:#222">
<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#2a7a14;font-weight:bold">Startup Funding Pulse · ${esc(range)}</div>
<h1 style="font-size:22px;line-height:1.25;margin:6px 0 12px 0;color:#111">${esc(subject)}</h1>
${exec.map(p => `<p style="margin:0 0 10px 0">${esc(p)}</p>`).join('')}
${sections.map(sec => `<h2 style="font-size:17px;margin:24px 0 8px 0;padding-top:12px;border-top:2px solid #111;color:#111">${esc(sec.h)}</h2>${(sec.paras ?? []).map(p => `<p style="margin:0 0 8px 0">${esc(p)}</p>`).join('')}${sec.bullets ? `<ul style="margin:0 0 8px 0;padding-left:20px">${sec.bullets.map(b => `<li style="margin:0 0 5px 0">${esc(b)}</li>`).join('')}</ul>` : ''}${(sec.deals ?? []).map(dealHtml).join('')}`).join('')}
<p style="margin:22px 0 8px 0;padding:12px;background:#f4f9f1;border-left:3px solid #2a7a14">${esc(cta)}</p>
<p style="margin:0 0 6px 0"><a href="${esc(APP())}/?week=${week}" style="color:#1a5fb4">Open the full interactive dashboard</a> · <a href="${esc(APP())}/config" style="color:#1a5fb4">Edit your focus and watchlist</a></p>
<h2 style="font-size:15px;margin:22px 0 6px 0;padding-top:10px;border-top:1px solid #ccc;color:#333">Sources</h2>
<ol style="margin:0 0 10px 0;padding-left:22px;font-size:13px;color:#444">${refs.map(r => `<li style="margin:0 0 3px 0"><a href="${esc(r.url)}" style="color:#1a5fb4">${esc(r.label)}</a></li>`).join('')}</ol>
<h2 style="font-size:15px;margin:14px 0 6px 0;color:#333">Methodology</h2>${methodology.map(m => `<p style="margin:0 0 5px 0;font-size:12px;color:#666">${esc(m)}</p>`).join('')}
</td></tr></table></td></tr></table></body></html>`;
  const text = [subject, preheader, '', ...exec, '',
    ...sections.flatMap(sec => [sec.h.toUpperCase(), ...(sec.paras ?? []), ...(sec.bullets ?? []).map(b => `- ${b}`), ...(sec.deals ?? []).map(dealText), '']),
    cta, `Dashboard: ${APP()}/?week=${week}`, `Config: ${APP()}/config`, '', 'SOURCES', ...refs.map((r, i) => `[${i + 1}] ${r.label} — ${r.url}`), '', 'METHODOLOGY', ...methodology].join('\n');
  return { week, html, text, subject, preheader, stats, insights };
}

export async function sendEmail(to: string[], subject: string, html: string, text?: string) {
  const key = process.env.RESEND_API_KEY; if (!key) throw new Error('RESEND_API_KEY missing');
  const from = process.env.BRIEF_FROM_EMAIL || 'onboarding@resend.dev';
  const r = await new Resend(key).emails.send({ from: `Startup Funding Pulse <${from}>`, to, subject, html, text });
  if (r.error) throw new Error(r.error.message);
  return r.data?.id;
}

export async function recipients(): Promise<string[]> {
  const cfg = await loadConfig();
  return [...new Set([...(cfg.emailRecipients ?? []), ...(process.env.BRIEF_TO_EMAIL ? process.env.BRIEF_TO_EMAIL.split(',') : [])].map(s => s.trim()).filter(Boolean))];
}

export async function generateBrief(opts: { week?: string; send?: boolean; test?: boolean } = {}) {
  const week = opts.week ?? previousWeekStart(); const budget = new GeminiBudget(10);
  const log = new RunLog(true, 'brief'); await log.start();
  let sent: string | null = null, error: string | null = null;
  try {
    const b = await buildBrief(week, budget, log);
    await db().from('weeks').upsert({ week_start: week, stats: b.stats, insights: b.insights, brief_html: b.html, brief_text: b.text, brief_preheader: b.preheader, brief_subject: b.subject, generated_at: new Date().toISOString() }, { onConflict: 'week_start' });
    await log.log('OK', `brief generated for week ${week}`);
    if (opts.send || opts.test) {
      const to = await recipients(); if (!to.length) throw new Error('no recipients (set BRIEF_TO_EMAIL or config)');
      const id = await sendEmail(to, (opts.test ? '[TEST] ' : '') + b.subject, b.html, b.text);
      sent = id ?? 'sent';
      if (opts.send) await db().from('weeks').update({ sent_at: new Date().toISOString() }).eq('week_start', week);
      await log.log('OK', `email sent to ${to.length} recipient(s)`);
    }
  } catch (e: any) { error = e.message; await log.log('ERR', e.message); }
  await log.finish(error ? 'error' : 'ok', budget);
  return { week, sent, error };
}
