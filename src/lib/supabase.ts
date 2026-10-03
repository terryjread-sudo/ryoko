import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && key ? createClient(url, key) : null

export async function checkRyokoConnection() {
  if (!supabase) return { configured: false, error: null }
  const { error } = await supabase.from('ryoko_trips').select('id').limit(1)
  return { configured: true, error }
}
