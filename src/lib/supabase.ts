import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Helper to create client safely
const createSupabaseClient = () => {
  if (!supabaseUrl || !supabaseKey) {
    console.warn('Missing Supabase environment variables. Using fallback for build/dev.');
    // Return a dummy client or one with empty strings if it allows, 
    // but createClient throws on empty URL.
    // We use a dummy valid URL to pass build-time initialization.
    return createClient('https://placeholder.supabase.co', 'placeholder');
  }
  return createClient(supabaseUrl, supabaseKey);
};

export const supabase = createSupabaseClient();
