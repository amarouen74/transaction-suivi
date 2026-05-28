import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string;
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string;

export const supabaseReady = !!(supabaseUrl && supabaseAnonKey);

let _supabase: SupabaseClient | null = null;

if (supabaseReady) {
  _supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = _supabase;