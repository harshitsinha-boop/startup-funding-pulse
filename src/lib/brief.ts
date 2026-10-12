import { Resend } from 'resend';
import { db } from './db';
import { loadConfig, loadWatchlist } from './config';
import { GeminiBudget } from './gemini';
import { getInrPerUsd } from './fx';
import { computeStats, narrate, type WeekStats, type Insight } from './patterns';
import { addDays, fmtInr, fmtUsd, previousWeekStart } from './normalize';
import { bar, delta, spark } from './ascii';
import { RunLog } from './ingest/runlog';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT = "'JetBrains Mono','Fira Code',Menlo,Consolas,'Courier New',monospace";
const C = { bg: '#0a0a0a', fg: '#33ff00', amber: '#ffb000', muted: '#1f521f', err: '#ff3333', dim: '#7fbf6f' };
const APP = () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const badge = (c: string) => ({ CONFIRMED: ['CONFIRMED', C.fg], SINGLE_SOURCE: ['SINGLE', C.amber], LOW: ['LOW', C.err], RUMOURED: ['RUMOUR', C.dim] } as Record<string, [string, string]>)[c] ?? [c, C.dim];
const h = (t: string, color = C.fg) => `<tr><td style="padding:22px 0 8px 0;font:bold 14px ${FONT};color:${color};letter-spacing:1px">${esc(t)}</td></tr><tr><td style="border-top:1px dashed ${C.muted};font-size:1px;line-height:1px">&nbsp;</td></tr>`;

function dealBlock(d: any, inr: number, extra = ''): string {
  const [bt, bc] = badge(d.confidence);
  const srcs = (d.sources ?? []).slice(0, 3).map((s: any) => `<a href="${esc(s.url)}" style="color:${C.amber}">${esc(s.name)}</a>`).join(' · ');
  return `<tr><td style="padding:10px 0;border-bottom:1px solid #123312;font:13px/1.5 ${FONT};color:${C.fg}">
<span style="color:#fff;font-weight:bold">${esc(d.company_name)}</span> <span style="color:${bc}">[${bt}]</span><br>
<span style="color:${C.dim}">${esc(d.description ?? d.sector_raw ?? '')}</span><br>
${esc(fmtUsd(d.amount_usd))}${d.amount_usd ? ` / ${esc(fmtInr(d.amount_usd, inr))}` : ''} · ${esc((d.stage ?? 'STAGE n/a').replace(/_/g, ' '))} · ${esc(d.sector ?? '')}${d.hq_city ? ' · ' + esc(d.hq_city) : ''}<br>
<span style="color:${C.dim}">lead: ${esc((d.lead ?? []).join(', ') || 'n/a')}</span>${extra}<br>${srcs}</td></tr>`;
}

export interface BriefData { week: string; html: string; subject: string; stats: WeekStats; insights: Insight[] }

export async function buildBrief(week: string, budget: GeminiBudget, log?: RunLog): Promise<BriefData> {
  const cfg = await loadConfig(); const inr = await getInrPerUsd(cfg.inrPerUsdFallback); const watch = await loadWatchlist();
  const stats = await computeStats(week, cfg);
  let insights: Insight[] = [];
  try { insights = await narrate(stats, budget); } catch (e: any) { await log?.log('ERR', `narrate: ${e.message}`); }

  const { data: ds } = await db().from('deals').select('*, deal_investors(role, investors(name)), deal_sources(raw_articles(url, source_slug, title))').eq('week_start', week).order('score', { ascending: false });
  const deals = (ds ?? []).map((d: any) => ({
    ...d, lead: (d.deal_investors ?? []).filter((x: any) => x.role === 'lead').map((x: any) => x.investors?.name).filter(Boolean),
    sources: (d.deal_sources ?? []).map((s: any) => s.raw_articles).filter(Boolean).map((a: any) => ({ url: a.url, name: String(a.source_slug).replace(/^gnews:/, '') })),
  }));
  const closed = deals.filter((d: any) => d.status !== 'REPORTED_IN_TALKS'), rumoured = deals.filter((d: any) => d.status === 'REPORTED_IN_TALKS');
  const alerts = closed.filter((d: any) => d.watchlist_hit || d.adjacency?.is_adjacent);
  const isFocus = (d: any) => d.sector && cfg.sectors.includes(d.sector) && (!d.stage || cfg.stages.includes(d.stage) || d.stage === 'UNDISCLOSED');
  const focus = closed.filter((d: any) => isFocus(d) && !alerts.includes(d)).slice(0, 15);
  const rest = closed.filter((d: any) => !alerts.includes(d) && !focus.includes(d));
  const end = addDays(week, 6);
  const fmtD = (s: string) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const range = `${fmtD(week)} – ${fmtD(end)}`;
  const cov = stats.coverage_pct != null ? `${stats.coverage_pct}%` : 'pending';

  const sectorRows = Object.entries(stats.by_sector).filter(([, v]) => v.cur.count || v.prev.count).sort((a, b) => b[1].cur.usd - a[1].cur.usd).map(([k, v]) =>
    `${k.toUpperCase().padEnd(11).slice(0, 11)} ${bar(v.share_pct)} ${String(v.share_pct).padStart(3)}% ${delta(v.wow_pct)}  ${spark(v.trend6)}`).join('\n');

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;padding:0;background:${C.bg}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:16px 12px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;font-family:${FONT};color:${C.fg}">
<tr><td style="font:bold 16px ${FONT};color:${C.fg};padding-bottom:6px">$ ./pulse --week ${esc(range)}</td></tr>
<tr><td style="font:13px/1.6 ${FONT};color:${C.fg}">&gt; deals: <b>${stats.total.count}</b> (prev ${stats.prev_total.count})<br>&gt; total raised: <b>${esc(fmtUsd(stats.total.usd))}</b> / ${esc(fmtInr(stats.total.usd, inr))}<br>&gt; coverage vs entrackr: <b>${esc(cov)}</b> · rumoured (not counted): ${stats.rumoured_count}</td></tr>
${h('[!] WATCHLIST ALERTS', C.err)}
${alerts.length ? alerts.map((d: any) => dealBlock(d, inr, d.watchlist_hit ? `<br><span style="color:${C.err}">WATCHLIST HIT: ${esc(d.watchlist_hit)}</span>` : `<br><span style="color:${C.amber}">${esc(d.adjacency.relationship?.toUpperCase())} of ${esc(d.adjacency.watchlist_company)} — ${esc(d.adjacency.reason)}</span>`)).join('') : `<tr><td style="font:13px ${FONT};color:${C.dim};padding:8px 0">no watchlist hits this week (${watch.length} companies monitored)</td></tr>`}
${h('> FOCUS DEALS')}
${focus.length ? focus.map((d: any) => dealBlock(d, inr)).join('') : `<tr><td style="font:13px ${FONT};color:${C.dim};padding:8px 0">no deals matched focus sectors/stages</td></tr>`}
${h('> PATTERNS')}
<tr><td style="padding:8px 0"><pre style="margin:0;font:12px/1.5 ${FONT};color:${C.fg};white-space:pre-wrap">${esc(sectorRows || 'not enough data')}</pre></td></tr>
${insights.map(i => `<tr><td style="padding:6px 0;font:13px/1.5 ${FONT}"><span style="color:${C.amber}">// ${esc(i.headline)}</span><br><span style="color:${C.dim}">${esc(i.detail)}</span></td></tr>`).join('')}
${h('> INVESTOR MOVES')}
<tr><td style="font:13px/1.6 ${FONT};padding:8px 0;color:${C.fg}">most active: ${esc(stats.top_investors.map(i => `${i.name} (${i.deals})`).join(', ') || 'n/a')}<br>new to focus sector: ${esc(stats.new_investors.map(i => `${i.name} → ${i.sector}`).join(', ') || 'none')}</td></tr>
${h('> RUMOURED / IN TALKS', C.amber)}
${rumoured.length ? rumoured.map((d: any) => dealBlock(d, inr)).join('') : `<tr><td style="font:13px ${FONT};color:${C.dim};padding:8px 0">none reported</td></tr>`}
${h('> EVERYTHING ELSE')}
<tr><td style="font:12px/1.7 ${FONT};color:${C.dim};padding:8px 0">${rest.map((d: any) => `${esc(d.company_name)} · ${esc(fmtUsd(d.amount_usd))} · ${esc((d.stage ?? '').replace(/_/g, ' '))} · ${esc(d.sector ?? '')}`).join('<br>') || 'nothing else'}</td></tr>
<tr><td style="padding-top:24px;border-top:1px dashed ${C.muted};font:12px/1.8 ${FONT};color:${C.dim}"><a href="${esc(APP())}/?week=${week}" style="color:${C.amber}">[ open dashboard ]</a> <a href="${esc(APP())}/config" style="color:${C.amber}">[ edit config ]</a><br>generated by startup funding pulse · all amounts converted in code at ₹${inr}/USD</td></tr>
</table></td></tr></table></body></html>`;
  return { week, html, subject: `Pulse ${range}: ${stats.total.count} deals, ${fmtUsd(stats.total.usd)}${alerts.length ? ` · ${alerts.length} watchlist alert${alerts.length > 1 ? 's' : ''}` : ''}`, stats, insights };
}

export async function sendEmail(to: string[], subject: string, html: string) {
  const key = process.env.RESEND_API_KEY; if (!key) throw new Error('RESEND_API_KEY missing');
  const from = process.env.BRIEF_FROM_EMAIL || 'onboarding@resend.dev';
  const r = await new Resend(key).emails.send({ from: `Startup Funding Pulse <${from}>`, to, subject, html });
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
    await db().from('weeks').upsert({ week_start: week, stats: b.stats, insights: b.insights, brief_html: b.html, brief_subject: b.subject, generated_at: new Date().toISOString() }, { onConflict: 'week_start' });
    await log.log('OK', `brief generated for week ${week}`);
    if (opts.send || opts.test) {
      const to = await recipients(); if (!to.length) throw new Error('no recipients (set BRIEF_TO_EMAIL or config)');
      const id = await sendEmail(to, (opts.test ? '[TEST] ' : '') + b.subject, b.html);
      sent = id ?? 'sent';
      if (opts.send) await db().from('weeks').update({ sent_at: new Date().toISOString() }).eq('week_start', week);
      await log.log('OK', `email sent to ${to.length} recipient(s)`);
    }
  } catch (e: any) { error = e.message; await log.log('ERR', e.message); }
  await log.finish(error ? 'error' : 'ok', budget);
  return { week, sent, error };
}
