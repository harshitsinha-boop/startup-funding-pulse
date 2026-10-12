import { NextResponse } from 'next/server';
import { COOKIE, isAdmin, passcodeOk, sessionToken } from '@/lib/auth';

export async function GET() { return NextResponse.json({ admin: await isAdmin() }); }
export async function POST(req: Request) {
  const { passcode } = await req.json().catch(() => ({ passcode: '' }));
  if (!passcodeOk(String(passcode ?? ''))) return NextResponse.json({ error: 'access denied' }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, sessionToken(), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 7 });
  return res;
}
export async function DELETE() { const r = NextResponse.json({ ok: true }); r.cookies.delete(COOKIE); return r; }
