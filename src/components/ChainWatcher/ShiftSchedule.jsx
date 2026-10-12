import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useSession } from '../../hooks/useSession'
import {
  apiSend, card, sectionTitle, sectionSub,
  upcomingDays, dayStart, fmtSlotDay, fmtSlotTime, fmtSlotTimeLocal, fmtSlotDayLocal, localDayDiffers,
  currentHourStart, HOUR,
} from './chainWatcherUtils'
import SignUpConfirmModal from './SignUpConfirmModal'
import NoteModal from './NoteModal'

const DAYS_AHEAD = 7
const ACCENT = '#8b5cf6'

export default function ShiftSchedule({ factionId, shifts, onChanged, session }) {
  const { user } = useSession()
  const isLeader = !!(user?.isLeader || user?.isAdmin || user?.isOwner)
  const [selectedDay, setSelectedDay] = useState(() => dayStart(Math.floor(Date.now() / 1000)))
  const [busySlot, setBusySlot] = useState(null)
  const [error, setError] = useState(null)
  const [pendingSlot, setPendingSlot] = useState(null) // slot_start awaiting sign-up confirmation
  const [editingShift, setEditingShift] = useState(null) // shift object whose note is being edited
  const jumpedForRef = useRef(null)

  // Session comes from the page (shared with ChainSessionCard) so scheduling
  // or cancelling there shows up here immediately instead of waiting on a
  // separate poll.
  const scheduledStart = session?.status === 'scheduled' ? session.scheduled_start : null

  // Jump the calendar to the scheduled day once per distinct schedule (not
  // on every re-poll, so a leader browsing other days isn't yanked back) —
  // and revert back to today if that schedule is then cancelled/started/
  // ended (scheduledStart disappearing), rather than staying frozen there.
  useEffect(() => {
    if (scheduledStart != null) {
      if (jumpedForRef.current !== scheduledStart) {
        jumpedForRef.current = scheduledStart
        setSelectedDay(dayStart(scheduledStart))
      }
    } else if (jumpedForRef.current != null) {
      jumpedForRef.current = null
      setSelectedDay(dayStart(Math.floor(Date.now() / 1000)))
    }
  }, [scheduledStart])

  // The whole 7-day window starts from the scheduled day when one exists,
  // instead of always starting from today with the scheduled day spliced in.
  const days = useMemo(() => upcomingDays(DAYS_AHEAD, scheduledStart), [scheduledStart])
  const byStart = useMemo(() => new Map(shifts.map(s => [s.slot_start, s])), [shifts])
  const hoursForDay = useMemo(() => Array.from({ length: 24 }, (_, h) => selectedDay + h * HOUR), [selectedDay])
  const myShifts = useMemo(
    () => shifts.filter(s => s.torn_user_id === user?.tornUserId).sort((a, b) => a.slot_start - b.slot_start),
    [shifts, user]
  )

  const confirmSignUp = useCallback(async () => {
    const slotStart = pendingSlot
    setBusySlot(slotStart); setError(null)
    try {
      await apiSend('/api/chain-watcher/shifts', 'POST', { faction_id: factionId, slot_start: slotStart })
      setPendingSlot(null)
      onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusySlot(null)
    }
  }, [factionId, pendingSlot, onChanged])

  const handleRemove = useCallback(async (id, slotStart) => {
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

  const saveNote = useCallback(async (text) => {
    if (!editingShift) return
    setBusySlot(editingShift.slot_start); setError(null)
    try {
      await apiSend(`/api/chain-watcher/shifts/${editingShift.id}/note`, 'POST', { note: text })
      setEditingShift(null)
      onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusySlot(null)
    }
  }, [editingShift, onChanged])

  const curHour = currentHourStart()

  return (
    <div style={card}>
      <p style={sectionTitle}>Shift Sign-Ups</p>
      <p style={sectionSub}>Times in TCT, with your local time underneath.</p>

      {myShifts.length > 0 && (
        <div style={{ marginBottom: 14, padding: '8px 10px', borderRadius: 8, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Your shifts</div>
          <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
            {myShifts.map(s => (
              <span
                key={s.id}
                style={{
                  fontSize: 12, padding: '4px 10px', borderRadius: 6,
                  background: 'rgba(139,92,246,0.15)', color: '#c4b5fd',
                  border: '1px solid rgba(139,92,246,0.4)',
                }}
              >
                {fmtSlotDay(s.slot_start)} {fmtSlotTime(s.slot_start)}
              </span>
            ))}
          </div>
        </div>
      )}

      {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>{error}</p>}

      <div className="flex items-center" style={{ gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Showing {fmtSlotDay(selectedDay)}</span>
        {scheduledStart != null && dayStart(scheduledStart) !== selectedDay && (
          <button
            onClick={() => setSelectedDay(dayStart(scheduledStart))}
            style={{
              fontSize: 11.5, padding: '3px 10px', borderRadius: 6, background: 'rgba(139,92,246,0.12)',
              color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.35)', cursor: 'pointer',
            }}
          >
            Jump to scheduled day ({fmtSlotDay(dayStart(scheduledStart))})
          </button>
        )}
      </div>

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {hoursForDay.map(slot => {
          const taken = byStart.get(slot)
          const isPast = slot < curHour
          const isBeforeScheduledStart = scheduledStart != null && slot < scheduledStart
          const isDisabled = isPast || isBeforeScheduledStart
          const isMine = !!taken && taken.torn_user_id === user?.tornUserId
          const busy = busySlot === slot

          let bg = 'rgba(255,255,255,0.03)'
          let border = 'var(--border-subtle)'
          let label = 'Open'
          let labelColor = 'var(--text-faint)'

          if (isDisabled) {
            label = taken ? taken.username : '—'
            labelColor = 'var(--text-faint)'
            bg = 'rgba(255,255,255,0.015)'
          } else if (taken) {
            label = taken.username
            labelColor = isMine ? '#c4b5fd' : '#f4f4f5'
            bg = isMine ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.05)'
            border = isMine ? 'rgba(139,92,246,0.4)' : 'var(--border-subtle)'
          }

          const openAndClickable = !isDisabled && !taken
          const localTime = fmtSlotTimeLocal(slot)
          const tctTime = fmtSlotTime(slot)
          const showLocal = localTime !== tctTime
          const dayShift = showLocal && localDayDiffers(slot)

          return (
            <div
              key={slot}
              onClick={() => { if (openAndClickable && !busy) setPendingSlot(slot) }}
              style={{
                textAlign: 'left', padding: '8px 10px', borderRadius: 8,
                background: bg, border: `1px solid ${border}`,
                cursor: openAndClickable ? 'pointer' : 'default', opacity: busy ? 0.5 : 1,
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tctTime} TCT</div>
              {showLocal && (
                <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                  {localTime} local{dayShift ? ` (${fmtSlotDayLocal(slot).slice(0, 3)})` : ''}
                </div>
              )}
              <div style={{ fontSize: 13, fontWeight: 600, color: labelColor }}>
                {label}{isMine && !isDisabled ? ' (you)' : ''}
              </div>

              {!isDisabled && taken && isLeader && (
                <div className="flex" style={{ gap: 6, marginTop: 6 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingShift(taken) }}
                    disabled={busy}
                    title="Add/edit note"
                    style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.06)',
                      color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer',
                    }}
                  >
                    Note
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemove(taken.id, slot) }}
                    disabled={busy}
                    title="Remove from this shift"
                    style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 5, background: 'rgba(248,113,113,0.1)',
                      color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}

              {!isDisabled && taken && isLeader && taken.note && (
                <div style={{ fontSize: 10.5, color: '#f87171', marginTop: 5, fontStyle: 'italic' }}>
                  {taken.note}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {pendingSlot != null && (
        <SignUpConfirmModal
          slotStart={pendingSlot}
          busy={busySlot === pendingSlot}
          onConfirm={confirmSignUp}
          onClose={() => setPendingSlot(null)}
        />
      )}

      {editingShift && (
        <NoteModal
          shift={editingShift}
          busy={busySlot === editingShift.slot_start}
          onSave={saveNote}
          onClose={() => setEditingShift(null)}
        />
      )}
    </div>
  )
}
