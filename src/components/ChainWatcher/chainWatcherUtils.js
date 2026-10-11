import { API_BASE_URL } from '../../config/api'

export const card = {
  background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 12,
  padding: 'clamp(12px, 3vw, 18px)', marginBottom: 16,
}
export const sectionTitle = { margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#f4f4f5' }
export const sectionSub = { margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }

export const OCC_FACTIONS = [
  { id: 33097, label: 'Occ1', name: 'Occultus' },
  { id: 9728,  label: 'Occ2', name: 'Occul2us' },
  { id: 9171,  label: 'Occ3', name: 'Occul3us' },
]

const token = () => localStorage.getItem('occultusSession')

export async function apiGet(path) {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: token() } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

export async function apiSend(path, method, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { Authorization: token(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

export const HOUR = 3600
export const currentHourStart = () => Math.floor(Date.now() / 1000 / HOUR) * HOUR

export function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function fmtSlotTime(slotStart) {
  return new Date(slotStart * 1000).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false,
  })
}

export function fmtSlotDay(slotStart) {
  return new Date(slotStart * 1000).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

export function dayStart(ts) {
  const d = new Date(ts * 1000)
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000)
}

// Builds the list of day-start timestamps for the day picker (today + `count - 1` more).
export function upcomingDays(count = 7) {
  const start = dayStart(Math.floor(Date.now() / 1000))
  return Array.from({ length: count }, (_, i) => start + i * 86400)
}

// Given the shifts claimed for a faction (sorted by slot_start) and "now",
// works out who's watching right now and who takes over next — collapsing
// consecutive hours held by the same person so a back-to-back sign-up
// doesn't look like a "shift change" that never actually hands off.
export function computeWatcherStatus(shifts, nowSec = Date.now() / 1000) {
  const byStart = new Map(shifts.map(s => [s.slot_start, s]))
  const curSlot = Math.floor(nowSec / HOUR) * HOUR
  const current = byStart.get(curSlot) || null

  let nextSlot = curSlot + HOUR
  // Skip forward past any further hours held by the SAME current watcher.
  while (current && byStart.get(nextSlot)?.torn_user_id === current.torn_user_id) {
    nextSlot += HOUR
  }
  const next = byStart.get(nextSlot) || null

  return {
    current,
    next,
    nextChangeAt: current ? nextSlot : null, // only meaningful once someone's actually watching
  }
}
