/**
 * Parse a date string that may or may not carry a timezone marker.
 * D1 / SQLite returns timestamps as "YYYY-MM-DD HH:MM:SS" (no Z).
 * Treating those as local time is wrong — they are always UTC.
 */
export function parseUTC(str) {
  if (!str) return null
  // Already has timezone info
  if (str.endsWith('Z') || str.includes('+')) return new Date(str)
  // SQLite format "YYYY-MM-DD HH:MM:SS" → force UTC
  return new Date(str.replace(' ', 'T') + 'Z')
}

/**
 * Format a UTC timestamp string as a short date+time in en-GB (DD/MM/YYYY, HH:MM) UTC.
 * Returns null if the input is falsy.
 */
export function formatUTC(str) {
  const d = parseUTC(str)
  if (!d || isNaN(d)) return null
  return d.toLocaleString('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' UTC'
}

/**
 * "X ago" relative label, always treating the input as UTC.
 */
export function timeAgo(str) {
  const d = parseUTC(str)
  if (!d || isNaN(d)) return 'Unknown'
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return formatUTC(str)
}
