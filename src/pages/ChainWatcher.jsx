import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '../hooks/useSession'
import { apiGet, OCC_FACTIONS } from '../components/ChainWatcher/chainWatcherUtils'
import ChainSessionCard from '../components/ChainWatcher/ChainSessionCard'
import WatcherBanner from '../components/ChainWatcher/WatcherBanner'
import MeritTracker from '../components/ChainWatcher/MeritTracker'
import ShiftSchedule from '../components/ChainWatcher/ShiftSchedule'

const SHIFTS_REFRESH_MS = 30000
const WINDOW_SECONDS = 7 * 86400

export default function ChainWatcher() {
  const { user } = useSession()
  const [factionId, setFactionId] = useState(() =>
    OCC_FACTIONS.some(f => f.id === user?.factionId) ? user.factionId : OCC_FACTIONS[0].id
  )
  const [shifts, setShifts] = useState([])
  const [error, setError] = useState(null)

  const loadShifts = useCallback(async () => {
    try {
      const now = Math.floor(Date.now() / 1000)
      const json = await apiGet(`/api/chain-watcher/shifts?faction_id=${factionId}&from=${now - 3600}&to=${now + WINDOW_SECONDS}`)
      setShifts(json.shifts || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [factionId])

  useEffect(() => {
    loadShifts()
    const t = setInterval(loadShifts, SHIFTS_REFRESH_MS)
    return () => clearInterval(t)
  }, [loadShifts])

  const tabs = useMemo(() => OCC_FACTIONS, [])

  return (
    <div style={{ color: '#f4f4f5', padding: '20px clamp(12px, 4vw, 20px)', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="font-cinzel" style={{ margin: 0, fontSize: 'clamp(20px, 5vw, 24px)', fontWeight: 700, letterSpacing: '1px' }}>
          Chain Watch
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '6px 0 0' }}>
          Sign up for a watch shift, see who's on now, and track the live chain. Each faction runs its own chain and schedule.
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

      <ChainSessionCard factionId={factionId} />
      <WatcherBanner shifts={shifts} />
      <ShiftSchedule factionId={factionId} shifts={shifts} onChanged={loadShifts} />
      <MeritTracker factionId={factionId} />
    </div>
  )
}
