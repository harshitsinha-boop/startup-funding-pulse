import { createClient, SupabaseClient } from '@supabase/supabase-js';

let admin: SupabaseClient | null = null;
/** Service-role client — server only. */
export function db(): SupabaseClient {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
    admin = createClient(url, key, { auth: { persistSession: false } });
  }
  return admin;
}
export function must<T>(r: { data: T | null; error: { message: string } | null }, ctx: string): T {
  if (r.error) throw new Error(`${ctx}: ${r.error.message}`);
  return r.data as T;
}
