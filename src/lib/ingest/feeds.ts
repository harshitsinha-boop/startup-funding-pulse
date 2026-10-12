import Parser from 'rss-parser';
import { fetchRetry, sha } from '../util';
import type { Config } from '../types';
import type { WatchItem } from '../config';

export interface Candidate {
  url: string; url_hash: string; title: string; summary: string; full_text: string | null;
  published_at: string | null; source_slug: string; tier: number; publisher?: string; is_roundup?: boolean;
}
const parser = new Parser({ customFields: { item: [['content:encoded', 'contentEncoded']] } });

const stripHtml = (h: string) => h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim();

export interface FeedResult { slug: string; ok: boolean; items: Candidate[]; error?: string; status?: number }

export async function fetchFeed(slug: string, url: string, tier: number, opts: { gnews?: boolean } = {}): Promise<FeedResult> {
  try {
    const res = await fetchRetry(url, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (res.status === 429 && opts.gnews) gnewsState.blocked = true;
    if (!res.ok) return { slug, ok: false, items: [], status: res.status, error: `HTTP ${res.status}` };
    const xml = await res.text();
    if (!/<(rss|feed)\b/i.test(xml.slice(0, 2000))) return { slug, ok: false, items: [], status: res.status, error: 'not valid RSS/Atom XML' };
    const feed = await parser.parseString(xml);
    const items: Candidate[] = (feed.items ?? []).filter(i => i.link && i.title).map(i => {
      const rawBody = (i as any).contentEncoded ?? i.content ?? '';
      const body = stripHtml(rawBody);
      let title = i.title!.trim(), publisher: string | undefined;
      if (opts.gnews) { const m = title.match(/^(.*) - ([^-]+)$/); if (m) { title = m[1].trim(); publisher = m[2].trim(); } publisher ??= (i as any).source?.title; }
      const summary = stripHtml(i.contentSnippet ?? i.summary ?? rawBody).slice(0, 600);
      return {
        url: i.link!, url_hash: sha(i.link!), title, summary: opts.gnews ? '' : summary, // GNews snippets are just the headline repeated
        full_text: !opts.gnews && body.length > 900 ? body : null,
        published_at: i.isoDate ?? (i.pubDate ? new Date(i.pubDate).toISOString() : null),
        source_slug: opts.gnews ? 'gnews' : slug, tier, publisher,
      };
    });
    return { slug, ok: true, items, status: res.status };
  } catch (e: any) { return { slug, ok: false, items: [], error: String(e?.message ?? e) }; }
}

export function gnewsUrl(q: string, days = 7) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${days}d`)}&hl=en-IN&gl=IN&ceid=IN:en`;
}
/** Tier-2 queries, generated from Aarav's config. */
export function gnewsQueries(cfg: Config, watch: WatchItem[]): string[] {
  const base = ['startup raises funding India', 'Series A India startup', 'seed round India startup', 'crore funding startup'];
  const sectors = cfg.sectors.map(s => `${s} startup raises funding India`);
  const wl = watch.flatMap(w => [`"${w.name}" funding`]);
  return [...new Set([...base, ...sectors, ...wl])];
}

/** Circuit breaker: once Google answers 429 we stop calling it for this process / run. */
export const gnewsState = { blocked: false, resolved: 0, resolveCap: 15 };

/** Resolve a news.google.com/rss/articles/<id> link to the publisher URL. Best-effort. */
export async function resolveGoogleNewsUrl(link: string): Promise<string | null> {
  if (gnewsState.blocked || gnewsState.resolved >= gnewsState.resolveCap) return null;
  gnewsState.resolved++;
  try {
    const id = new URL(link).pathname.split('/').pop()!;
    const page = await fetchRetry(`https://news.google.com/articles/${id}?hl=en-IN&gl=IN&ceid=IN:en`);
    if (page.status === 429) { gnewsState.blocked = true; return null; }
    const html = await page.text();
    const sig = html.match(/data-n-a-sg="([^"]+)"/)?.[1], ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!sig || !ts) return null;
    const inner = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sig}"]`;
    const body = new URLSearchParams({ 'f.req': JSON.stringify([[['Fbv4je', inner, null, 'generic']]]) });
    const r = await fetchRetry('https://news.google.com/_/DotsSplashUi/data/batchexecute', { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } });
    if (r.status === 429) { gnewsState.blocked = true; return null; }
    const txt = await r.text();
    const m = txt.match(/\\"(https?:[^"\\]+)\\"/);
    return m ? m[1].replace(/\\u003d/g, '=').replace(/\\u0026/g, '&') : null;
  } catch { return null; }
}

/** NewsData.io (optional tier 4). */
export async function fetchNewsData(): Promise<FeedResult> {
  const key = process.env.NEWSDATA_API_KEY;
  if (!key) return { slug: 'newsdata', ok: false, items: [], error: 'NEWSDATA_API_KEY not set (optional)' };
  try {
    const r = await fetchRetry(`https://newsdata.io/api/1/latest?apikey=${key}&country=in&category=business,technology&q=${encodeURIComponent('startup funding raises')}&language=en`);
    const j: any = await r.json();
    const items: Candidate[] = (j.results ?? []).map((a: any) => ({
      url: a.link, url_hash: sha(a.link), title: a.title, summary: a.description ?? '', full_text: null,
      published_at: a.pubDate ? new Date(a.pubDate.replace(' ', 'T') + 'Z').toISOString() : null,
      source_slug: 'newsdata', tier: 4, publisher: a.source_name,
    }));
    return { slug: 'newsdata', ok: r.ok, items, status: r.status };
  } catch (e: any) { return { slug: 'newsdata', ok: false, items: [], error: String(e?.message ?? e) }; }
}
