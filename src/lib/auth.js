import { OCCULTUS_CONFIG } from './config'

const SESSION_KEY = 'occultusSession'
const USER_KEY    = 'occultusUser'
const DEV_AUTH_ENABLED = true

// API Base URL - automatically routes to dev or production
const API_BASE_URL =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8787'
    : 'https://occultushub-worker-production.rkilpatrick4221.workers.dev'

/* ── Storage helpers ─────────────────────── */

export function getSessionToken() {
  return localStorage.getItem(SESSION_KEY)
}

export function setSessionToken(token) {
  localStorage.setItem(SESSION_KEY, token)
}

export function clearSessionToken() {
  localStorage.removeItem(SESSION_KEY)
}

export function setUserSession(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function getUserSession() {
  const raw = localStorage.getItem(USER_KEY)
  return raw ? JSON.parse(raw) : null
}

export function clearUserSession() {
  localStorage.removeItem(USER_KEY)
}

/* ── Access enrichment ───────────────────── */

export function enrichUserAccess(user) {
  // Backend computes isFactionMember/isLeader itself (including any temporary
  // admin-granted access override) — fall back to client-side derivation only
  // if the backend didn't send them (e.g. dev-auth stub already sets both).
  const isFactionMember = user.isFactionMember ?? OCCULTUS_CONFIG.allowedFactionIds.includes(
    Number(user.factionId)
  )
  const isLeader = user.isLeader ?? (
    isFactionMember &&
    OCCULTUS_CONFIG.leadershipRoles.includes(user.factionPosition)
  )

  return { ...user, isFactionMember, isLeader, isAdmin: user.isAdmin || false }
}

/* ── Session validation (returns enriched user or null) ─── */

export async function checkSession() {
  const isLocalhost =
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === 'localhost'

  const token = getSessionToken()

  if (token) {
    try {
      const res  = await fetch(`${API_BASE_URL}/api/auth/session`, {
        headers: { Authorization: token },
      })
      const data = await res.json()

      if (!data.valid) {
        clearSessionToken()
        clearUserSession()
        return null
      }

      const enriched = enrichUserAccess(data.user)
      setUserSession(enriched)
      return enriched
    } catch {
      clearSessionToken()
      clearUserSession()
      return null
    }
  }

  if (isLocalhost && DEV_AUTH_ENABLED) {
    window.__devAuthAvailable = true
  }

  return null
}

/* ── Login ───────────────────────────────── */

export async function authenticateUser(apiKey, rememberMe, stayLoggedIn) {
  const isLocalhost =
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === 'localhost'

  if (isLocalhost && window.__devAuthAvailable) {
    const devUser = {
      userId: 99999999,
      username: 'Recon_Dev',
      factionId: 33097,
      factionPosition: 'Leader',
      isFactionMember: true,
      isLeader: true,
      isAdmin: true,
      image: null,
    }
    localStorage.setItem('occultusSession', 'dev-token')
    localStorage.setItem('occultusUser', JSON.stringify(devUser))
    return { success: true, user: devUser }
  }

  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, rememberMe, stayLoggedIn }),
  })

  let data
  try {
    data = await res.json()
  } catch {
    throw new Error('Invalid server response')
  }

  if (!res.ok) {
    return { success: false, error: data.error || 'Login failed.' }
  }

  setSessionToken(data.token)
  const enriched = enrichUserAccess(data.user)
  setUserSession(enriched)

  // background refresh
  fetch('/api/company-refresh').catch(() => {})
  fetch('/api/faction-cache?refresh=1').catch(() => {})

  return { success: true, user: enriched }
}

/* ── Logout ──────────────────────────────── */

export async function logout() {
  const token = getSessionToken()
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
  } catch { /* swallow */ }

  clearSessionToken()
  clearUserSession()
  window.__occultusSessionCache = null
}
