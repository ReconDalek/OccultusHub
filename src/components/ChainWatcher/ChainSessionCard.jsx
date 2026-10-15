import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '../../hooks/useSession'
import {
  apiGet, apiSend, card, sectionTitle, fmtLongDuration, tctInputToUnix,
  fmtSlotDay, fmtSlotTime, fmtSlotTimeLocal, fmtSlotDayLocal, localDayDiffers,
  TARGET_LENGTHS,
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
export default function ChainSessionCard({ factionId, session, error: loadError, onChanged, shifts }) {
  const { user } = useSession()
  const isLeader = !!(user?.isLeader || user?.isAdmin || user?.isOwner)

  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [now, setNow] = useState(() => Date.now() / 1000)
  const [scheduleAt, setScheduleAt] = useState('')
  const [targetLength, setTargetLength] = useState('')
  const [estimate, setEstimate] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000)
    return () => clearInterval(t)
  }, [])

  // Once a session exists its own target_length wins (it's already fixed);
  // otherwise this reflects whatever the leader is currently picking before
  // starting/scheduling.
  const effectiveTarget = session?.target_length ?? (targetLength ? parseInt(targetLength, 10) : null)

  useEffect(() => {
    if (!effectiveTarget || !isLeader) { setEstimate(null); return undefined }
    let cancelled = false
    apiGet(`/api/chain-watcher/target-estimate?faction_id=${factionId}&target=${effectiveTarget}`)
      .then((json) => { if (!cancelled) setEstimate(json) })
      .catch(() => { if (!cancelled) setEstimate(null) })
    return () => { cancelled = true }
  }, [factionId, effectiveTarget, isLeader])

  const estimateLabel = useMemo(() => {
    if (!estimate) return null
    if (!estimate.sampleSize) return 'No past chains of this length yet.'
    const plural = estimate.sampleSize === 1 ? '' : 's'
    return `~${fmtLongDuration(estimate.avgSeconds)} to reach, based on ${estimate.sampleSize} past chain${plural}`
  }, [estimate])

  const startNow = useCallback(async () => {
    setBusy(true); setError(null); setInfo(null)
    try {
      const body = { faction_id: factionId }
      if (targetLength) body.target_length = parseInt(targetLength, 10)
      await apiSend('/api/chain-watcher/session', 'POST', body)
      await onChanged()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }, [factionId, targetLength, onChanged])

  const startTest = useCallback(async () => {
    setBusy(true); setError(null); setInfo(null)
    try {
      const body = { faction_id: factionId, is_test: true }
      if (targetLength) body.target_length = parseInt(targetLength, 10)
      await apiSend('/api/chain-watcher/session', 'POST', body)
      await onChanged()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }, [factionId, targetLength, onChanged])

  const scheduleFor = useCallback(async () => {
    if (!scheduleAt) return
    setBusy(true); setError(null); setInfo(null)
    try {
      const ts = tctInputToUnix(scheduleAt)
      const body = { faction_id: factionId, scheduled_start: ts }
      if (targetLength) body.target_length = parseInt(targetLength, 10)
      await apiSend('/api/chain-watcher/session', 'POST', body)
      setScheduleAt('')
      await onChanged()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }, [factionId, scheduleAt, targetLength, onChanged])

  const endWatch = useCallback(async () => {
    if (!session) return
    setBusy(true); setError(null); setInfo(null)
    try {
      const res = await apiSend(`/api/chain-watcher/session/${session.id}/end`, 'POST')
      if (res?.meritTest) {
        setInfo(`Test ended — ${res.meritTest.recorded} simulated bonus hit(s) run through the merit pipeline. Check Merit Tracker, then revoke any you don't want to keep.`)
      }
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
        <LiveChainCard factionId={factionId} target={session.target_length} shifts={shifts} />
        {isLeader && (
          <div style={{ marginTop: -8, marginBottom: 16 }}>
            <button onClick={endWatch} disabled={busy} style={dangerBtn}>
              {session.is_test ? 'End test chain' : 'End chain watch'}
            </button>
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
        {session.target_length && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Target {session.target_length.toLocaleString()} hits
            {estimateLabel ? ` — ${estimateLabel}` : ''}
          </p>
        )}
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
      {info && <p style={{ color: '#34d399', fontSize: 12.5, marginTop: 8 }}>{info}</p>}
      {displayError && <p style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>{displayError}</p>}
      {isLeader && (
        <div className="flex items-center" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>Target</span>
          <select
            value={targetLength}
            onChange={(e) => setTargetLength(e.target.value)}
            style={{
              fontSize: 13, padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)',
              color: '#f4f4f5', border: '1px solid var(--border-subtle)',
            }}
          >
            <option value="">No target</option>
            {TARGET_LENGTHS.map((t) => (
              <option key={t} value={t}>{t.toLocaleString()}</option>
            ))}
          </select>
          {estimateLabel && <span style={{ color: 'var(--text-faint)', fontSize: 11.5 }}>{estimateLabel}</span>}
        </div>
      )}
      {isLeader && (
        <div className="flex items-center" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={startNow} disabled={busy} style={primaryBtn}>Start watching now</button>
          <button
            onClick={startTest}
            disabled={busy}
            style={secondaryBtn}
            title="Simulated chain data, no real Torn chain needed — for testing the live view"
          >
            Start test chain
          </button>
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
