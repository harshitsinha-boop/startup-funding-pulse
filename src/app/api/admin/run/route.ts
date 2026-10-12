import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runJob } from '@/lib/jobs';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Public manual triggers. Abuse protection: one run of a kind at a time + a cooldown between runs
// (protects Gemini quota and the recipient's inbox).
const JOBS: Record<string, { kind: string; cooldownSec: number }> = {
  ingest: { kind: 'ingest', cooldownSec: 300 },
  reconcile: { kind: 'reconcile', cooldownSec: 600 },
  brief: { kind: 'brief', cooldownSec: 120 },
  'test-email': { kind: 'brief', cooldownSec: 300 },
};

export async function POST(req: Request) {
  const { job, week } = await req.json().catch(() => ({}));
  const spec = JOBS[job];
  if (!spec) return NextResponse.json({ error: 'unknown job' }, { status: 400 });
  const { data: last } = await db().from('ingest_runs').select('started_at,status').eq('kind', spec.kind).order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (last) {
    const age = (Date.now() - new Date(last.started_at).getTime()) / 1000;
    if (last.status === 'running' && age < 330) return NextResponse.json({ error: `${spec.kind} already running — try again shortly` }, { status: 429 });
    if (age < spec.cooldownSec) return NextResponse.json({ error: `cooldown: ${job} can run again in ${Math.ceil(spec.cooldownSec - age)}s` }, { status: 429 });
  }
  // "generate brief now" builds + stores the brief (no email); the test job also emails it
  const res = await runJob(job === 'brief' ? 'build-brief' : job, { week });
  return NextResponse.json(res);
}
