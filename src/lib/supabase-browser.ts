import { createClient, SupabaseClient } from '@supabase/supabase-js';
let c: SupabaseClient | null = null;
export function sb(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return (c ??= createClient(url, key, { realtime: { params: { eventsPerSecond: 5 } } }));
}
