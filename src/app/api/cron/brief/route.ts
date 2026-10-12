import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/auth';
import { runJob } from '@/lib/jobs';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await runJob('brief'));
}
