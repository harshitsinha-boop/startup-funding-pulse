import crypto from 'crypto';

export const UA = 'StartupFundingPulse/1.0 (+https://github.com/startup-funding-pulse; research bot)';
export const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** fetch with 10s timeout + one retry with backoff. */
export async function fetchRetry(url: string, init: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctl.signal, redirect: 'follow',
        headers: { 'User-Agent': UA, Accept: '*/*', ...(init.headers || {}) } });
      clearTimeout(t);
      if (res.status >= 500 || res.status === 429) { lastErr = new Error(`HTTP ${res.status}`); await sleep(800 * (attempt + 1)); continue; }
      return res;
    } catch (e) { clearTimeout(t); lastErr = e; await sleep(800 * (attempt + 1)); }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Run async fn over items with bounded concurrency. */
export async function pMap<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}
export const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
export const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
