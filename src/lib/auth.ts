import crypto from 'crypto';
import { cookies } from 'next/headers';

const secret = () => process.env.ADMIN_PASSCODE ?? '';
const token = () => crypto.createHmac('sha256', secret()).update('pulse-admin-session').digest('hex');
export const COOKIE = 'pulse_admin';

export function passcodeOk(input: string): boolean {
  const a = Buffer.from(input), b = Buffer.from(secret());
  return !!secret() && a.length === b.length && crypto.timingSafeEqual(a, b);
}
export async function isAdmin(): Promise<boolean> {
  if (!secret()) return false;
  const c = (await cookies()).get(COOKIE)?.value;
  return !!c && c.length === token().length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(token()));
}
export const sessionToken = token;

export function cronAuthorized(req: Request): boolean {
  const s = process.env.CRON_SECRET;
  return !!s && req.headers.get('authorization') === `Bearer ${s}`;
}
