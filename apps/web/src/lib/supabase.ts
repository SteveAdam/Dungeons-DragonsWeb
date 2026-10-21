import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

// Values come from apps/web/.env (copy .env.example). Without them the app talks to the local
// stack from `pnpm db:start`, so a fresh checkout still starts. The publishable key (sb_publishable_…)
// is the newer name for the anon key; either works.
const env = import.meta.env;
const url = env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;

if (env.DEV && !key && env.MODE !== 'test') {
  console.warn('No Supabase key set. Copy apps/web/.env.example to apps/web/.env and fill it in.');
}

/** The one Supabase client. Only src/data, src/lib and src/auth may import it (enforced by ESLint). */
export const supabase = createClient<Database>(url, key ?? 'missing-key');
