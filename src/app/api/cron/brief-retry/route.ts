import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/auth';
import { runJob } from '@/lib/jobs';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** Monday safety net (07:00 IST): sends last week's brief only if the 06:00 run did not. Does nothing on other days. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (new Date().getUTCDay() !== 1) return NextResponse.json({ skipped: 'not Monday' });
  return NextResponse.json(await runJob('brief-retry'));
}
