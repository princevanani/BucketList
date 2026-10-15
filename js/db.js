// Picks the data backend: Supabase when config.js has keys, otherwise the in-browser preview database.
import { createLocalDb } from './db-local.js';

let instance;
export let backendNote = '';

export async function getDb() {
  if (instance) return instance;
  const cfg = window.BUCKET_CONFIG || {};
  if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
    try {
      const { createSupabaseDb } = await import('./db-supabase.js');
      instance = await createSupabaseDb(cfg);
      return instance;
    } catch (err) {
      console.error(err);
      backendNote = `Could not reach Supabase (${err.message}). Showing preview mode instead.`;
    }
  }
  instance = await createLocalDb();
  return instance;
}
