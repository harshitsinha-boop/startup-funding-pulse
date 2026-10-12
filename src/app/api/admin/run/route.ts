import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { runJob } from '@/lib/jobs';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';
const JOBS = ['ingest', 'reconcile', 'brief', 'test-email'];

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized — enter passcode' }, { status: 401 });
  const { job, week } = await req.json().catch(() => ({}));
  if (!JOBS.includes(job)) return NextResponse.json({ error: 'unknown job' }, { status: 400 });
  // "generate brief now" builds + stores the brief (no email); the test job also emails it
  const res = await runJob(job === 'brief' ? 'build-brief' : job, { week });
  return NextResponse.json(res);
}
