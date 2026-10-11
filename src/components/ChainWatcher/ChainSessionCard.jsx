import { useCallback, useEffect, useState } from 'react'
import { useSession } from '../../hooks/useSession'
import { apiGet, apiSend, card, sectionTitle, fmtDuration } from './chainWatcherUtils'
import LiveChainCard from './LiveChainCard'

const SESSION_POLL_MS = 20000
const ACCENT = '#8b5cf6'

const primaryBtn = {
  fontSize: 13, padding: '7px 14px', borderRadius: 7, background: ACCENT, color: '#fff',
  border: 'none', cursor: 'pointer', fontWeight: 600,
}
const secondaryBtn = {
  fontSize: 13, padding: '7px 14px', borderRadius: 7, background: 'rgba(255,255,255,0.05)',
  color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer',
}
const dangerBtn = {
  fontSize: 12, padding: '5px 12px', borderRadius: 6, background: 'rgba(248,113,113,0.12)',
  color: '#f87171', border: '1px solid rgba(248,113,113,0.35)', cursor: 'pointer',
}

// Owns the leader-controlled watch window: nothing polls Torn's live chain
// endpoint at all unless a session here is 'active'. We may only run a chain
// once a month, so there's no reason to hammer Torn's API the rest of the
// time — LiveChainCard is only ever mounted (and so only ever polling) while
// that's true.
export default function ChainSessionCard({ factionId }) {
  const { user } = useSession()
  const isLeader = !!(user?.isLeader || user?.isAdmin || user?.isOwner)

  const [session, setSession] = useState(undefined) // undefined = still loading
  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => Date.now() / 1000)
  const [scheduleAt, setScheduleAt] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const json = await apiGet(`/api/chain-watcher/session?faction_id=${factionId}`)
      setSession(json.session)
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [factionId])

  useEffect(() => {
    load()
    const t = setInterval(load, SESSION_POLL_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000)
    return () => clearInterval(t)
  }, [])

  const startNow = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      await apiSend('/api/chain-watcher/session', 'POST', { faction_id: factionId })
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }, [factionId, load])

  const scheduleFor = useCallback(async () => {
    if (!scheduleAt) return
    setBusy(true); setError(null)
    try {
      const ts = Math.floor(new Date(scheduleAt).getTime() / 1000)
      await apiSend('/api/chain-watcher/session', 'POST', { faction_id: factionId, scheduled_start: ts })
      setScheduleAt('')
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }, [factionId, scheduleAt, load])

  const endWatch = useCallback(async () => {
    if (!session) return
    setBusy(true); setError(null)
    try {
      await apiSend(`/api/chain-watcher/session/${session.id}/end`, 'POST')
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }, [session, load])

  if (session === undefined && !error) {
    return (
      <div style={card}>
        <p style={sectionTitle}>Chain Watch</p>
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Loading…</p>
      </div>
    )
  }

  if (session?.status === 'active') {
    return (
      <>
        <LiveChainCard factionId={factionId} />
        {isLeader && (
          <div style={{ marginTop: -8, marginBottom: 16 }}>
            <button onClick={endWatch} disabled={busy} style={dangerBtn}>End chain watch</button>
          </div>
        )}
      </>
    )
  }

  if (session?.status === 'scheduled') {
    return (
      <div style={card}>
        <p style={sectionTitle}>Chain Watch</p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Scheduled to start in <strong>{fmtDuration(session.scheduled_start - now)}</strong>
        </p>
        {error && <p style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>{error}</p>}
        {isLeader && (
          <div className="flex" style={{ gap: 8, marginTop: 10 }}>
            <button onClick={startNow} disabled={busy} style={primaryBtn}>Start now</button>
            <button onClick={endWatch} disabled={busy} style={secondaryBtn}>Cancel</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={card}>
      <p style={sectionTitle}>Chain Watch</p>
      <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>No chain watch scheduled.</p>
      {error && <p style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>{error}</p>}
      {isLeader && (
        <div className="flex items-center" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={startNow} disabled={busy} style={primaryBtn}>Start watching now</button>
          <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>or schedule for</span>
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
            style={{
              fontSize: 13, padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)',
              color: '#f4f4f5', border: '1px solid var(--border-subtle)',
            }}
          />
          <button onClick={scheduleFor} disabled={busy || !scheduleAt} style={secondaryBtn}>Schedule</button>
        </div>
      )}
    </div>
  )
}
