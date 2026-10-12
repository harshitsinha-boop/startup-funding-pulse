import { db } from './db';
import { fetchRetry } from './util';

/** INR per USD. Cached per day in fx_rates; falls back to latest cached, then config value. */
export async function getInrPerUsd(fallback: number): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data } = await db().from('fx_rates').select('usd_inr').eq('day', today).maybeSingle();
    if (data) return Number(data.usd_inr);
    const r = await fetchRetry('https://api.frankfurter.app/latest?from=USD&to=INR');
    const j: any = await r.json();
    const rate = Number(j?.rates?.INR);
    if (rate > 0) { await db().from('fx_rates').upsert({ day: today, usd_inr: rate, source: 'frankfurter' }); return rate; }
  } catch { /* fall through */ }
  try {
    const { data } = await db().from('fx_rates').select('usd_inr').order('day', { ascending: false }).limit(1).maybeSingle();
    if (data) return Number(data.usd_inr);
  } catch { /* ignore */ }
  return fallback;
}
