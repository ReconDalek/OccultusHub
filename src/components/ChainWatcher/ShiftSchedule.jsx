import { useMemo, useState, useCallback } from 'react'
import { useSession } from '../../hooks/useSession'
import {
  apiSend, card, sectionTitle, sectionSub,
  upcomingDays, dayStart, fmtSlotDay, fmtSlotTime, currentHourStart, HOUR,
} from './chainWatcherUtils'

const DAYS_AHEAD = 7
const ACCENT = '#8b5cf6'

export default function ShiftSchedule({ factionId, shifts, onChanged }) {
  const { user } = useSession()
  const [selectedDay, setSelectedDay] = useState(() => dayStart(Math.floor(Date.now() / 1000)))
  const [busySlot, setBusySlot] = useState(null)
  const [error, setError] = useState(null)

  const days = useMemo(() => upcomingDays(DAYS_AHEAD), [])
  const byStart = useMemo(() => new Map(shifts.map(s => [s.slot_start, s])), [shifts])
  const hoursForDay = useMemo(() => Array.from({ length: 24 }, (_, h) => selectedDay + h * HOUR), [selectedDay])
  const myShifts = useMemo(
    () => shifts.filter(s => s.torn_user_id === user?.tornUserId).sort((a, b) => a.slot_start - b.slot_start),
    [shifts, user]
  )

  const handleSignUp = useCallback(async (slotStart) => {
    setBusySlot(slotStart); setError(null)
    try {
      await apiSend('/api/chain-watcher/shifts', 'POST', { faction_id: factionId, slot_start: slotStart })
      onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusySlot(null)
    }
  }, [factionId, onChanged])

  const handleCancel = useCallback(async (id, slotStart) => {
    setBusySlot(slotStart); setError(null)
    try {
      await apiSend(`/api/chain-watcher/shifts/${id}`, 'DELETE')
      onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusySlot(null)
    }
  }, [onChanged])

  const curHour = currentHourStart()

  return (
    <div style={card}>
      <p style={sectionTitle}>Shift Sign-Ups</p>
      <p style={sectionSub}>Times shown are TCT (UTC).</p>

      {myShifts.length > 0 && (
        <div style={{ marginBottom: 14, padding: '8px 10px', borderRadius: 8, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Your shifts</div>
          <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
            {myShifts.map(s => (
              <button
                key={s.id}
                onClick={() => handleCancel(s.id, s.slot_start)}
                disabled={busySlot === s.slot_start}
                style={{
                  fontSize: 12, padding: '4px 10px', borderRadius: 6,
                  background: 'rgba(139,92,246,0.15)', color: '#c4b5fd',
                  border: '1px solid rgba(139,92,246,0.4)', cursor: 'pointer',
                }}
                title="Click to cancel"
              >
                {fmtSlotDay(s.slot_start)} {fmtSlotTime(s.slot_start)} ✕
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>{error}</p>}

      <div className="flex" style={{ gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 10 }}>
        {days.map(d => (
          <button
            key={d}
            onClick={() => setSelectedDay(d)}
            style={{
              flex: '0 0 auto', fontSize: 12, padding: '6px 12px', borderRadius: 8, whiteSpace: 'nowrap',
              background: d === selectedDay ? ACCENT : 'rgba(255,255,255,0.04)',
              color: d === selectedDay ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)', cursor: 'pointer',
            }}
          >
            {fmtSlotDay(d)}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
        {hoursForDay.map(slot => {
          const taken = byStart.get(slot)
          const isPast = slot < curHour
          const isMine = !!taken && taken.torn_user_id === user?.tornUserId
          const busy = busySlot === slot

          let bg = 'rgba(255,255,255,0.03)'
          let border = 'var(--border-subtle)'
          let label = 'Open'
          let labelColor = 'var(--text-faint)'

          if (isPast) {
            label = taken ? taken.username : '—'
            labelColor = 'var(--text-faint)'
            bg = 'rgba(255,255,255,0.015)'
          } else if (taken) {
            label = taken.username
            labelColor = isMine ? '#c4b5fd' : '#f4f4f5'
            bg = isMine ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.05)'
            border = isMine ? 'rgba(139,92,246,0.4)' : 'var(--border-subtle)'
          }

          const clickable = !isPast && (!taken || isMine)

          return (
            <button
              key={slot}
              disabled={!clickable || busy}
              onClick={() => {
                if (isMine) handleCancel(taken.id, slot)
                else if (!taken) handleSignUp(slot)
              }}
              style={{
                textAlign: 'left', padding: '8px 10px', borderRadius: 8,
                background: bg, border: `1px solid ${border}`,
                cursor: clickable ? 'pointer' : 'default', opacity: busy ? 0.5 : 1,
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtSlotTime(slot)}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: labelColor }}>
                {label}{isMine && !isPast ? ' (you)' : ''}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
