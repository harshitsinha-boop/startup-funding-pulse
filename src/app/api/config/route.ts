import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { loadConfig, loadWatchlist, saveConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';
export async function GET() { return NextResponse.json({ config: await loadConfig(), watchlist: await loadWatchlist() }); }

export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { config, watchlist, sources } = await req.json();
  if (config) await saveConfig(config);
  if (Array.isArray(watchlist)) {
    await db().from('watchlist').delete().neq('name', '\u0000');
    const rows = watchlist.filter((w: any) => w.name?.trim()).map((w: any) => ({ name: w.name.trim(), description: (w.description ?? '').trim(), aliases: w.aliases ?? [] }));
    if (rows.length) await db().from('watchlist').insert(rows);
  }
  if (Array.isArray(sources)) for (const s of sources) await db().from('sources').update({ enabled: !!s.enabled }).eq('slug', s.slug);
  return NextResponse.json({ ok: true });
}
