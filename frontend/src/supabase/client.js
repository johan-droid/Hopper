import { createClient } from '@supabase/supabase-js'

// Get Supabase URL and anon key from environment variables
// These should be set in the .env file and never committed to version control
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL and anon key must be set in environment variables')
  process.exit(1)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoSignIn: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})