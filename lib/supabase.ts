import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    '[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY is missing. Database features will be disabled.'
  );
}

export const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
      },
    })
  : null;

export function ensureSupabase() {
  if (!supabaseAdmin) {
    throw new Error('Supabase client is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).');
  }
  return supabaseAdmin;
}
