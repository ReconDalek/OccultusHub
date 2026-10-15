import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '../hooks/useSession'
import { apiGet, OCC_FACTIONS } from '../components/ChainWatcher/chainWatcherUtils'
import ChainSessionCard from '../components/ChainWatcher/ChainSessionCard'
import WatcherBanner from '../components/ChainWatcher/WatcherBanner'
import MeritTracker from '../components/ChainWatcher/MeritTracker'
import ShiftSchedule from '../components/ChainWatcher/ShiftSchedule'

const SHIFTS_REFRESH_MS = 30000
const SESSION_REFRESH_MS = 20000
const WINDOW_SECONDS = 7 * 86400

export default function ChainWatcher() {
  const { user } = useSession()
  const [factionId, setFactionId] = useState(() =>
    OCC_FACTIONS.some(f => f.id === user?.factionId) ? user.factionId : OCC_FACTIONS[0].id
  )
  const [shifts, setShifts] = useState([])
  const [error, setError] = useState(null)
  // Single source of truth for the chain-watch session — shared by
  // ChainSessionCard and ShiftSchedule so scheduling/cancelling from one
  // shows up in the other immediately instead of waiting on separate polls.
  const [session, setSession] = useState(undefined) // undefined = still loading
  const [sessionError, setSessionError] = useState(null)

  const loadSession = useCallback(async () => {
    try {
      const json = await apiGet(`/api/chain-watcher/session?faction_id=${factionId}`)
      setSession(json.session)
      setSessionError(null)
    } catch (e) {
      setSessionError(e.message)
    }
  }, [factionId])

  // Normally we only need shifts for the week ahead of today — but a chain
  // can be scheduled further out than that, and the calendar jumps to show
  // that week instead, so the fetch window has to stretch to cover it too.
  const scheduledStart = session?.status === 'scheduled' ? session.scheduled_start : null
  const loadShifts = useCallback(async () => {
    try {
      const now = Math.floor(Date.now() / 1000)
      const to = scheduledStart != null ? Math.max(now + WINDOW_SECONDS, scheduledStart + WINDOW_SECONDS) : now + WINDOW_SECONDS
      const json = await apiGet(`/api/chain-watcher/shifts?faction_id=${factionId}&from=${now - 3600}&to=${to}`)
      setShifts(json.shifts || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [factionId, scheduledStart])

  useEffect(() => {
    loadShifts()
    const t = setInterval(loadShifts, SHIFTS_REFRESH_MS)
    return () => clearInterval(t)
  }, [loadShifts])

  useEffect(() => {
    loadSession()
    const t = setInterval(loadSession, SESSION_REFRESH_MS)
    return () => clearInterval(t)
  }, [loadSession])

  const tabs = useMemo(() => OCC_FACTIONS, [])

  return (
    <div style={{ color: '#f4f4f5', padding: '20px clamp(12px, 4vw, 20px)', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="font-cinzel" style={{ margin: 0, fontSize: 'clamp(20px, 5vw, 24px)', fontWeight: 700, letterSpacing: '1px' }}>
          Chain Watch
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '6px 0 0' }}>
          Live chain tracking, shift sign-ups, and merits. Per faction.
        </p>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 16, overflowX: 'auto' }}>
        {tabs.map(f => (
          <button
            key={f.id}
            onClick={() => setFactionId(f.id)}
            style={{
              padding: '10px 18px', background: 'transparent', border: 'none', whiteSpace: 'nowrap',
              borderBottom: factionId === f.id ? '2px solid #b3123f' : '2px solid transparent',
              color: factionId === f.id ? '#f4f4f5' : 'var(--text-secondary)',
              fontWeight: factionId === f.id ? 600 : 400, fontSize: 14, cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <ChainSessionCard factionId={factionId} session={session} error={sessionError} onChanged={loadSession} shifts={shifts} />
      <WatcherBanner shifts={shifts} />
      <ShiftSchedule factionId={factionId} shifts={shifts} onChanged={loadShifts} session={session} />
      <MeritTracker factionId={factionId} />
    </div>
  )
}
