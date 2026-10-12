import type { ExtractedDeal, Stage } from './types';

const UNIT_MULT: Record<string, number> = { crore: 1e7, lakh: 1e5, million: 1e6, billion: 1e9, thousand: 1e3, unit: 1 };

/** Convert an as-written amount to USD. Conversion happens in code only. */
export function toUsd(value: number | null, currency: string | null, unit: string | null, inrPerUsd: number, eurPerUsd = 0.92): number | null {
  if (value == null || !currency) return null;
  const raw = value * (UNIT_MULT[unit ?? 'unit'] ?? 1);
  if (currency === 'USD') return Math.round(raw);
  if (currency === 'INR') return Math.round(raw / inrPerUsd);
  if (currency === 'EUR') return Math.round(raw / eurPerUsd);
  return null;
}

const SUFFIXES = /\b(pvt|private|ltd|limited|technologies|technology|tech|labs|lab|india|inc|llp|corp|co|solutions|systems)\b/g;
export function normName(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(SUFFIXES, ' ').replace(/\s+/g, ' ').trim();
}

export const normWs = (s: string) => s.replace(/\s+/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim().toLowerCase();

/** Evidence must literally appear in the article (after whitespace normalisation). */
export function verifyEvidence(evidence: string | null | undefined, articleText: string): boolean {
  if (!evidence) return true; // nothing claimed
  return normWs(articleText).includes(normWs(evidence));
}

/** Null out unverified evidence strings; returns whether everything verified. */
export function verifyDealEvidence(d: ExtractedDeal, articleText: string): { deal: ExtractedDeal; verified: boolean } {
  let verified = true;
  const ev = { ...d.evidence };
  (['amount', 'stage', 'investors'] as const).forEach(k => {
    if (ev[k] && !verifyEvidence(ev[k], articleText)) { ev[k] = null; verified = false; }
  });
  // A disclosed amount with no surviving evidence is untrustworthy
  return { deal: { ...d, evidence: ev }, verified };
}

// ---- IST weeks ----
const IST_MS = 5.5 * 3600 * 1000;
/** Monday (IST) of the week containing the instant, as YYYY-MM-DD. */
export function weekStartIST(d: Date | string): string {
  const t = new Date(typeof d === 'string' ? (d.length <= 10 ? `${d}T12:00:00+05:30` : d) : d);
  const ist = new Date(t.getTime() + IST_MS);
  const dow = (ist.getUTCDay() + 6) % 7; // Mon=0
  ist.setUTCDate(ist.getUTCDate() - dow);
  return ist.toISOString().slice(0, 10);
}
export const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekEnd = (ws: string) => addDays(ws, 6);
/** The most recent fully-completed week (the one a Monday brief covers). */
export function previousWeekStart(now = new Date()): string { return addDays(weekStartIST(now), -7); }

export function dealWeek(announcement: string | null, publishedAt: string | null): string {
  return weekStartIST(announcement ?? publishedAt ?? new Date());
}

export const STAGE_ORDER: Stage[] = ['PRE_SEED','SEED','PRE_SERIES_A','SERIES_A','SERIES_B','SERIES_C','SERIES_D','SERIES_E_PLUS','GROWTH','BRIDGE','DEBT','UNDISCLOSED'];

export function fmtUsd(n: number | null | undefined): string {
  if (n == null) return 'undisclosed';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
}
export function fmtInr(usd: number | null | undefined, inrPerUsd: number): string {
  if (usd == null) return '—';
  const inr = usd * inrPerUsd;
  if (inr >= 1e7) return `₹${(inr / 1e7).toFixed(inr >= 1e9 ? 0 : 1)} Cr`;
  if (inr >= 1e5) return `₹${(inr / 1e5).toFixed(1)} L`;
  return `₹${Math.round(inr)}`;
}
