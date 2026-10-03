import { supabase } from './supabase'

export type RyokoSession = { tripId: string; code: string; role: 'owner' | 'editor' | 'viewer'; displayName: string; color: string }

export async function createTrip(name: string, start: string, end: string, ownerName: string): Promise<RyokoSession> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('ryoko_create_trip', { p_name: name, p_start: start, p_end: end, p_owner_name: ownerName })
  if (error) throw error
  const session = { tripId: data.trip_id, code: data.code, role: data.role, displayName: ownerName, color: '#735fa6' } as RyokoSession
  localStorage.setItem('ryoko_session', JSON.stringify(session)); return session
}

export async function joinTrip(code: string, displayName: string, color = '#df8f9b'): Promise<RyokoSession> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('ryoko_join_trip', { p_code: code.trim().toLowerCase(), p_display_name: displayName, p_color: color })
  if (error) throw error
  const session = { tripId: data.trip_id, code: code.trim().toLowerCase(), role: data.role, displayName: data.display_name, color: data.color } as RyokoSession
  localStorage.setItem('ryoko_session', JSON.stringify(session)); return session
}

export async function listDays(session: RyokoSession) {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('ryoko_list_days', { p_code: session.code, p_trip: session.tripId })
  if (error) throw error; return data ?? []
}

export function subscribeToTripPresence(session: RyokoSession, onSync: (members: unknown[]) => void) {
  if (!supabase) return () => undefined
  const channel = supabase.channel(`ryoko:${session.tripId}`, { config: { presence: { key: session.code } } })
  channel.on('presence', { event: 'sync' }, () => onSync(Object.values(channel.presenceState()).flat()))
    .subscribe(async status => { if (status === 'SUBSCRIBED') await channel.track({ name: session.displayName, color: session.color, role: session.role }) })
  return () => { void supabase.removeChannel(channel) }
}
