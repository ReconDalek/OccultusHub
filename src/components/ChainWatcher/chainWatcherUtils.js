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

// Full breakdown for a long wait (a scheduled chain watch can be days or
// weeks out) — fmtDuration above stays short-form (h/m or mm:ss) for the
// live chain timer, which never runs anywhere near this long.
export function fmtLongDuration(totalSeconds) {
  let s = Math.max(0, Math.floor(totalSeconds))
  const MONTH = 30 * 86400, WEEK = 7 * 86400, DAY = 86400
  const months = Math.floor(s / MONTH); s -= months * MONTH
  const weeks = Math.floor(s / WEEK); s -= weeks * WEEK
  const days = Math.floor(s / DAY); s -= days * DAY
  const hours = Math.floor(s / 3600); s -= hours * 3600
  const minutes = Math.floor(s / 60)

  const parts = []
  if (months) parts.push(`${months}mo`)
  if (weeks) parts.push(`${weeks}w`)
  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  if (minutes || parts.length === 0) parts.push(`${minutes}m`)
  return parts.join(' ')
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

// Viewer's own local time/day for a slot — browser default timezone, no override.
export function fmtSlotTimeLocal(slotStart) {
  return new Date(slotStart * 1000).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function fmtSlotDayLocal(slotStart) {
  return new Date(slotStart * 1000).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

// True when the viewer's local calendar day differs from the TCT (UTC) day —
// worth calling out since a slot can cross midnight in one tz but not the other.
export function localDayDiffers(slotStart) {
  return fmtSlotDayLocal(slotStart) !== fmtSlotDay(slotStart)
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
