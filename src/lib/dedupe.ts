import { normName } from './normalize';

export interface Mergeable {
  company_norm: string; aliases?: string[]; amount_usd: number | null; amount_disclosed?: boolean;
  announcement_date?: string | null; published_at?: string | null; week_start: string;
}

const dayMs = 86400000;
const ts = (d: Mergeable) => new Date(d.announcement_date ?? d.published_at ?? d.week_start).getTime();

export function namesMatch(a: Mergeable, b: Mergeable): boolean {
  const an = new Set([a.company_norm, ...(a.aliases ?? []).map(normName)].filter(Boolean));
  return [b.company_norm, ...(b.aliases ?? []).map(normName)].some(n => n && an.has(n));
}
export function amountsCompatible(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return true;
  return Math.abs(a - b) / Math.max(a, b) <= 0.10;
}
export function datesClose(a: Mergeable, b: Mergeable): boolean { return Math.abs(ts(a) - ts(b)) <= 7 * dayMs; }

export type MatchVerdict = 'SAME' | 'DIFFERENT' | 'AMBIGUOUS';
/** Rule: name/alias match AND amounts ±10% (or either undisclosed) AND dates within 7 days.
 *  Name match but amounts/dates clash => AMBIGUOUS (ask Gemini). No name match => DIFFERENT. */
export function matchDeals(a: Mergeable, b: Mergeable): MatchVerdict {
  if (!namesMatch(a, b)) return 'DIFFERENT';
  const am = amountsCompatible(a.amount_usd, b.amount_usd), dt = datesClose(a, b);
  if (am && dt) return 'SAME';
  // same company, genuinely different round far apart in time or size
  if (!dt && !am) return 'DIFFERENT';
  return 'AMBIGUOUS';
}

/** Keep the most specific value per field. */
export function mergeField<T>(a: T | null | undefined, b: T | null | undefined): T | null {
  const empty = (x: unknown) => x == null || x === '' || (Array.isArray(x) && !x.length);
  if (empty(a)) return (b ?? null) as T | null;
  if (empty(b)) return a as T;
  if (Array.isArray(a) && Array.isArray(b)) return [...new Set([...a, ...b])] as unknown as T;
  if (typeof a === 'string' && typeof b === 'string') return (b.length > a.length ? b : a) as T;
  return a as T;
}
