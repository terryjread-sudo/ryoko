export type ActivityCategory = 'attraction' | 'food' | 'shopping' | 'transport' | 'stay' | 'custom'

export type Destination = { id: string; name: string; latitude?: number; longitude?: number; sortOrder: number }

export type Activity = {
  id: string
  dayId: string
  destinationId?: string
  title: string
  category: ActivityCategory
  startsAt?: string
  durationMinutes?: number
  notes?: string
  bookingUrl?: string
  instagramUrl?: string
  completed: boolean
  sortOrder: number
}

export type Comment = { id: string; activityId: string; memberId?: string; body: string; createdAt: string }

export const activityCategories: Array<{ value: ActivityCategory; label: string; emoji: string }> = [
  { value: 'attraction', label: 'Attraction', emoji: '🎟️' },
  { value: 'food', label: 'Food', emoji: '🍜' },
  { value: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { value: 'transport', label: 'Transport', emoji: '🚆' },
  { value: 'stay', label: 'Stay', emoji: '🏨' },
  { value: 'custom', label: 'Custom', emoji: '✦' },
]
