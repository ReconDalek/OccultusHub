import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../../config/api'

// ── Data model (see backend factionActivityController.js) ────────────────────
// members: { id: { n: name, d: { 'YYYY-MM-DD': '48 chars' } } }
// char per 30-min slot: '.' not sampled · '0' offline · '1' idle · '2' active
// Chars sort in that order, so the "stronger" of two observations is the max.

export const OWN_FACTIONS = [
  { id: 33097, name: 'Occultus' },
  { id: 9728,  name: 'Occul2us' },
  { id: 9171,  name: 'Occul3us' },
]

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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

export function useIsMobile(breakpoint = 640) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.innerWidth < breakpoint)
  useEffect(() => {
    const h = () => setM(window.innerWidth < breakpoint)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [breakpoint])
  return m
}

// ── Dates (all UTC = Torn City Time) ─────────────────────────────────────────
export const todayStr = () => new Date().toISOString().slice(0, 10)
export const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
export const weekdayIdx = (day) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7 // Mon = 0
export function daysBetween(from, to) {
  const out = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}
export function fmtDay(day, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })
}
export const tsToDay = (ts) => new Date(ts * 1000).toISOString().slice(0, 10)

// Range for a period type around an anchor day.
export function periodRange(type, anchor) {
  if (type === 'day') return { from: anchor, to: anchor }
  if (type === 'week') {
    const from = addDays(anchor, -weekdayIdx(anchor))
    return { from, to: addDays(from, 6) }
  }
  if (type === 'month') {
    const [y, m] = anchor.split('-').map(Number)
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}` }
  }
  if (type === '28d') return { from: addDays(anchor, -27), to: anchor }
  return { from: anchor, to: anchor }
}
export function shiftAnchor(type, anchor, dir) {
  if (type === 'day') return addDays(anchor, dir)
  if (type === 'week') return addDays(anchor, 7 * dir)
  if (type === '28d') return addDays(anchor, 28 * dir)
  if (type === 'month') {
    const [y, m] = anchor.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + dir, 1))
    return d.toISOString().slice(0, 10)
  }
  return anchor
}
export function periodLabel(type, anchor) {
  const { from, to } = periodRange(type, anchor)
  if (type === 'day') return fmtDay(from, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
  if (type === 'month') return new Date(`${from}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return `${fmtDay(from, { day: 'numeric', month: 'short' })} – ${fmtDay(to, { day: 'numeric', month: 'short' })}`
}

// ── Rolling windows ──────────────────────────────────────────────────────────
const SLOT = 1800

// Blank (→ '.') every 30-min slot outside [fromTs, toTs) so a view only counts
// its own hours. fromTs/toTs should sit on slot boundaries.
export function clipToWindow(data, fromTs, toTs) {
  if (!data) return data
  const members = {}
  for (const [id, m] of Object.entries(data.members || {})) {
    const d = {}
    for (const [day, str] of Object.entries(m.d)) {
      const dayStart = Date.parse(`${day}T00:00:00Z`) / 1000
      let out = ''
      for (let i = 0; i < str.length; i++) {
        const s = dayStart + i * SLOT
        out += (s + SLOT <= fromTs || (toTs && s >= toTs)) ? '.' : str[i]
      }
      d[day] = out
    }
    members[id] = { ...m, d }
  }
  return { ...data, members }
}

// Re-cut the 48 slots starting at startTs (on the hour) into one pseudo-day
// keyed `key`, so a 24-hour window crossing midnight reads as one day.
export function rollDay(data, startTs, key) {
  if (!data) return data
  const members = {}
  for (const [id, m] of Object.entries(data.members || {})) {
    let out = '', any = false
    for (let k = 0; k < 48; k++) {
      const ts = startTs + k * SLOT
      const day = tsToDay(ts)
      const c = m.d[day]?.[Math.floor((ts - Date.parse(`${day}T00:00:00Z`) / 1000) / SLOT)] || '.'
      if (c !== '.') any = true
      out += c
    }
    if (any) members[id] = { ...m, d: { [key]: out } }
  }
  return { ...data, members }
}

// ── Buckets: 'hour' (24/day) or 'half' (48/day) ──────────────────────────────
export const bucketsPerDay = (res) => (res === 'half' ? 48 : 24)
// off: buckets to shift by, for views that start mid-day (rolling 24 hours).
export function bucketLabel(b, res, off = 0) {
  b = (b + off) % bucketsPerDay(res)
  const mins = res === 'half' ? b * 30 : b * 60
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}
export function bucketShortLabel(b, res, off = 0) {
  b = (b + off) % bucketsPerDay(res)
  return res === 'half' ? (b % 2 === 0 ? String(b / 2) : '') : String(b)
}
// State of one member in one bucket from their 48-char day string.
export function bucketState(str, b, res) {
  if (!str) return '.'
  if (res === 'half') return str[b] || '.'
  const a = str[b * 2] || '.', c = str[b * 2 + 1] || '.'
  return a > c ? a : c
}

// ── Faction aggregation ──────────────────────────────────────────────────────
// Per (day, bucket): { active, idle, offline, covered }
export function aggregateCells(members, days, res) {
  const nb = bucketsPerDay(res)
  const cells = {}
  for (const day of days) cells[day] = Array.from({ length: nb }, () => ({ active: 0, idle: 0, offline: 0, covered: 0 }))
  for (const m of Object.values(members || {})) {
    for (const day of days) {
      const str = m.d[day]
      if (!str) continue
      const row = cells[day]
      for (let b = 0; b < nb; b++) {
        const s = bucketState(str, b, res)
        if (s === '.') continue
        const c = row[b]
        c.covered++
        if (s === '2') c.active++
        else if (s === '1') c.idle++
        else c.offline++
      }
    }
  }
  return cells
}

// Peak member coverage across the range — cells sampled for under half of it
// (tracking just started, a failed sample) are treated as no data.
export function coverageFloor(cells) {
  let max = 0
  for (const row of Object.values(cells)) for (const c of row) if (c.covered > max) max = c.covered
  return Math.max(1, Math.ceil(max * 0.5))
}

// metric: 'active' | 'present' (active + idle); value: 'pct' | 'count'
export function cellValue(c, metric, value, floor) {
  if (!c || c.covered < floor) return null
  const n = metric === 'present' ? c.active + c.idle : c.active
  return value === 'count' ? n : n / c.covered
}

// Calendar grid: one row per day.
export function calendarGrid(cells, days, res, metric, value) {
  const floor = coverageFloor(cells)
  const nb = bucketsPerDay(res)
  return days.map(day => Array.from({ length: nb }, (_, b) => cellValue(cells[day]?.[b], metric, value, floor)))
}

// Pattern grid: one row per weekday (Mon..Sun), averaged over matching days.
export function weekdayGrid(cells, days, res, metric, value) {
  const floor = coverageFloor(cells)
  const nb = bucketsPerDay(res)
  const sum = Array.from({ length: 7 }, () => Array(nb).fill(0))
  const cnt = Array.from({ length: 7 }, () => Array(nb).fill(0))
  for (const day of days) {
    const w = weekdayIdx(day)
    for (let b = 0; b < nb; b++) {
      const v = cellValue(cells[day]?.[b], metric, value, floor)
      if (v == null) continue
      sum[w][b] += v
      cnt[w][b]++
    }
  }
  return sum.map((row, w) => row.map((s, b) => (cnt[w][b] ? s / cnt[w][b] : null)))
}

// Hour-of-day breakdown across the whole range: avg share active/idle/offline,
// plus avg member counts.
export function hourlyBreakdown(cells, days, res) {
  const floor = coverageFloor(cells)
  const nb = bucketsPerDay(res)
  return Array.from({ length: nb }, (_, b) => {
    let a = 0, i = 0, o = 0, n = 0, ac = 0
    for (const day of days) {
      const c = cells[day]?.[b]
      if (!c || c.covered < floor) continue
      a += c.active / c.covered; i += c.idle / c.covered; o += c.offline / c.covered; ac += c.active; n++
    }
    return n ? { active: a / n, idle: i / n, offline: o / n, activeCount: ac / n, samples: n } : null
  })
}

export function summarize(breakdown, res, off = 0) {
  const valid = breakdown.map((v, b) => ({ v, b })).filter(x => x.v)
  if (!valid.length) return null
  const avg = valid.reduce((s, x) => s + x.v.active, 0) / valid.length
  const peak = valid.reduce((p, x) => (x.v.active > p.v.active ? x : p))
  const low  = valid.reduce((p, x) => (x.v.active < p.v.active ? x : p))
  return {
    avgActive: avg,
    peak: { label: bucketLabel(peak.b, res, off), pct: peak.v.active, count: peak.v.activeCount },
    low:  { label: bucketLabel(low.b, res, off),  pct: low.v.active,  count: low.v.activeCount },
  }
}

// ── Members ──────────────────────────────────────────────────────────────────
export function memberStats(members, days) {
  return Object.entries(members || {}).map(([id, m]) => {
    let sampled = 0, active = 0, idle = 0, activeDays = 0, lastActiveDay = null
    const hourActive = Array(24).fill(0), hourSampled = Array(24).fill(0)
    for (const day of days) {
      const str = m.d[day]
      if (!str) continue
      let any = false
      for (let h = 0; h < 24; h++) {
        const s = bucketState(str, h, 'hour')
        if (s === '.') continue
        sampled++; hourSampled[h]++
        if (s === '2') { active++; hourActive[h]++; any = true }
        else if (s === '1') idle++
      }
      if (any) { activeDays++; lastActiveDay = day }
    }
    return {
      id: Number(id), name: m.n || `[${id}]`,
      sampled, active, idle,
      activePct: sampled ? active / sampled : null,
      idlePct: sampled ? idle / sampled : null,
      activeDays, lastActiveDay,
      hourProfile: hourActive.map((a, h) => (hourSampled[h] ? a / hourSampled[h] : null)),
    }
  }).filter(m => m.sampled > 0)
}

// Top N hours a member is usually active, as a compact label ("19–22, 08").
export function typicalHours(profile, threshold = 0.5) {
  const hours = profile.map((v, h) => (v != null && v >= threshold ? h : null)).filter(h => h != null)
  if (!hours.length) return '—'
  const runs = []
  let start = hours[0], prev = hours[0]
  for (const h of hours.slice(1)) {
    if (h === prev + 1) { prev = h; continue }
    runs.push([start, prev]); start = prev = h
  }
  runs.push([start, prev])
  return runs.map(([a, b]) => (a === b ? `${String(a).padStart(2, '0')}` : `${String(a).padStart(2, '0')}–${String(b + 1).padStart(2, '0')}`)).join(', ')
}

// ── Colour scales ────────────────────────────────────────────────────────────
const SEQ = ['#16121f', '#2e1a4f', '#5b21b6', '#8b5cf6', '#a5b4fc', '#a5f3fc']
const DIV_NEG = ['#2a1d1a', '#6b3a2c', '#b8734f', '#e5a57a']   // them ahead
const DIV_POS = ['#221a33', '#4c2a85', '#7c3aed', '#a5f3fc']   // us ahead

function lerpHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16)
  const ch = (s) => [(s >> 16) & 255, (s >> 8) & 255, s & 255]
  const [r1, g1, b1] = ch(pa), [r2, g2, b2] = ch(pb)
  const r = Math.round(r1 + (r2 - r1) * t), g = Math.round(g1 + (g2 - g1) * t), bl = Math.round(b1 + (b2 - b1) * t)
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`
}
function ramp(stops, t) {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  return lerpHex(stops[i], stops[i + 1], x - i)
}
export const seqColor = (t) => ramp(SEQ, t)
export function divColor(t) { // t in [-1, 1]
  if (t == null) return null
  if (Math.abs(t) < 0.04) return '#1c1c22'
  return t > 0 ? ramp(DIV_POS, t) : ramp(DIV_NEG, -t)
}
// Text colour for a background (light cells get dark text).
export function textOn(hex) {
  if (!hex) return 'var(--text-faint)'
  const n = parseInt(hex.slice(1), 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.55 ? '#0b0b10' : '#f4f4f5'
}

export const STATE_COLORS = { '2': '#8b5cf6', '1': '#eab308', '0': '#27272a', '.': 'transparent' }

export function fmtPct(v) { return v == null ? '—' : `${Math.round(v * 100)}%` }
export function fmtVal(v, value) {
  if (v == null) return '—'
  return value === 'count' ? (Math.round(v * 10) / 10).toString() : `${Math.round(v * 100)}%`
}
