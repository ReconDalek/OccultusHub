import { useCallback, useEffect, useState } from 'react'
import { useSession } from '../../hooks/useSession'
import {
  apiSend, card, sectionTitle, fmtLongDuration, tctInputToUnix,
  fmtSlotDay, fmtSlotTime, fmtSlotTimeLocal, fmtSlotDayLocal, localDayDiffers,
} from './chainWatcherUtils'
import LiveChainCard from './LiveChainCard'

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
export default function ChainSessionCard({ factionId, session, error: loadError, onChanged }) {
  const { user } = useSession()
  const isLeader = !!(user?.isLeader || user?.isAdmin || user?.isOwner)

  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => Date.now() / 1000)
  const [scheduleAt, setScheduleAt] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000)
    return () => clearInterval(t)
  }, [])

  const startNow = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      await apiSend('/api/chain-watcher/session', 'POST', { faction_id: factionId })
      await onChanged()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }, [factionId, onChanged])

  const scheduleFor = useCallback(async () => {
    if (!scheduleAt) return
    setBusy(true); setError(null)
    try {
      const ts = tctInputToUnix(scheduleAt)
      await apiSend('/api/chain-watcher/session', 'POST', { faction_id: factionId, scheduled_start: ts })
      setScheduleAt('')
      await onChanged()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }, [factionId, scheduleAt, onChanged])

  const endWatch = useCallback(async () => {
    if (!session) return
    setBusy(true); setError(null)
    try {
      await apiSend(`/api/chain-watcher/session/${session.id}/end`, 'POST')
      await onChanged()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }, [session, onChanged])

  const displayError = error || loadError

  if (session === undefined && !displayError) {
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
    const dayShift = localDayDiffers(session.scheduled_start)
    return (
      <div style={card}>
        <p style={sectionTitle}>Chain Watch</p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Scheduled to start in <strong>{fmtLongDuration(session.scheduled_start - now)}</strong>
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          Starts {fmtSlotDay(session.scheduled_start)} {fmtSlotTime(session.scheduled_start)} TCT
          {' '}({dayShift ? `${fmtSlotDayLocal(session.scheduled_start)} ` : ''}{fmtSlotTimeLocal(session.scheduled_start)} local)
        </p>
        {displayError && <p style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>{displayError}</p>}
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
      {displayError && <p style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>{displayError}</p>}
      {isLeader && (
        <div className="flex items-center" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={startNow} disabled={busy} style={primaryBtn}>Start watching now</button>
          <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>or schedule for (TCT)</span>
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
            style={{
              fontSize: 13, padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)',
              color: '#f4f4f5', border: '1px solid var(--border-subtle)',
            }}
          />
          {scheduleAt && (
            <span style={{ color: 'var(--text-faint)', fontSize: 11.5 }}>
              = {fmtSlotDayLocal(tctInputToUnix(scheduleAt))} {fmtSlotTimeLocal(tctInputToUnix(scheduleAt))} local
            </span>
          )}
          <button onClick={scheduleFor} disabled={busy || !scheduleAt} style={secondaryBtn}>Schedule</button>
        </div>
      )}
    </div>
  )
}
