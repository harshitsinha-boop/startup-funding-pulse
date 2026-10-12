import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { fetchRetry, UA } from '../util';

const robotsCache = new Map<string, ReturnType<typeof robotsParser> | null>();
async function allowed(url: string): Promise<boolean> {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    try {
      const r = await fetchRetry(`${u.origin}/robots.txt`, {}, 6000);
      robotsCache.set(u.origin, r.ok ? robotsParser(`${u.origin}/robots.txt`, await r.text()) : null);
    } catch { robotsCache.set(u.origin, null); }
  }
  const rp = robotsCache.get(u.origin);
  return rp ? rp.isAllowed(url, UA) !== false : true;
}

export function extractArticleText(html: string): string {
  const $ = cheerio.load(html);
  $('script,style,nav,header,footer,aside,form,noscript,iframe,figure,.related,.share,.newsletter').remove();
  // Roundups (Entrackr/Inc42) put deals in tables: turn rows into 'a | b | c' lines
  const rows = $('table tr').map((_, tr) => $(tr).find('th,td').map((__, c) => $(c).text().trim()).get().join(' | ')).get().filter(r => r.length > 10);
  if (rows.length >= 5) {
    const paras = $('p').map((_, p) => $(p).text().trim()).get().filter(t => t.length > 40);
    return [...paras, ...rows].join('\n');
  }
  const sels = ['article', '[itemprop=articleBody]', '.article-content', '.entry-content', '.story-content', 'main'];
  for (const s of sels) {
    const ps = $(s).find('p').map((_, p) => $(p).text().trim()).get().filter(t => t.length > 40);
    if (ps.join(' ').length > 500) return ps.join('\n');
  }
  return $('p').map((_, p) => $(p).text().trim()).get().filter(t => t.length > 40).join('\n');
}

export type EnrichResult = { status: 'ok' | 'failed' | 'blocked'; text: string | null; finalUrl?: string };
export async function enrichUrl(url: string): Promise<EnrichResult> {
  try {
    if (!(await allowed(url))) return { status: 'blocked', text: null };
    const r = await fetchRetry(url, { headers: { Accept: 'text/html' } });
    if (!r.ok) return { status: 'failed', text: null };
    const text = extractArticleText(await r.text());
    return text.length > 300 ? { status: 'ok', text: text.slice(0, 40000), finalUrl: r.url } : { status: 'failed', text: null };
  } catch { return { status: 'failed', text: null }; }
}
