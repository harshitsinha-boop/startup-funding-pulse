import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export async function GET() {
  const [sources, runs, queue, arts] = await Promise.all([
    db().from('sources').select('*').order('tier'),
    db().from('ingest_runs').select('id,kind,started_at,finished_at,status,counts,tokens_in,tokens_out,gemini_calls,errors').order('started_at', { ascending: false }).limit(15),
    db().from('raw_articles').select('id', { count: 'exact', head: true }).eq('prefilter_pass', true).eq('extract_status', 'pending'),
    db().from('raw_articles').select('id', { count: 'exact', head: true }),
  ]);
  return NextResponse.json({ sources: sources.data, runs: runs.data, queued: queue.count, articles: arts.count });
}
