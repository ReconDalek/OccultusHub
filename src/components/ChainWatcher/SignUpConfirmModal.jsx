import { useState } from 'react'
import Modal from './Modal'
import { fmtSlotDay, fmtClockTime, localDayDiffers, fmtSlotDayLocal } from './chainWatcherUtils'

const DEFAULT_MESSAGE =
  '- Be in Torn with enough energy to save the chain.\n' +
  '- Attack when the timer drops below 2 minutes.\n' +
  '- Near a bonus? Flag it to a leader.'

// Every line keeps the same tight spacing (bulleted or not) rather than
// bullets being one rhythm and plain lines another — a blank line in the
// source is the only thing that opens up a gap, rendered as its own empty
// line so it actually reads as a skipped line. A manual "•" (not a real
// <ul>/<li>) because the site's base CSS strips default list markers, which
// left "-" lines indented but bulletless.
const BULLET_RE = /^[-•]\s*/

export default function SignUpConfirmModal({ slotStart, busy, onConfirm, onClose, isLeader, members = [], currentUserId, use12h = false, message }) {
  const rawLines = (message || DEFAULT_MESSAGE).split('\n')
  const dayShift = localDayDiffers(slotStart)
  const [assigneeId, setAssigneeId] = useState(currentUserId ?? null)
  const assigningOther = assigneeId != null && assigneeId !== currentUserId

  return (
    <Modal onClose={onClose}>
      <h3 style={{ color: '#f4f4f5', fontFamily: 'Cinzel,serif', fontSize: 16, letterSpacing: 1, margin: '0 0 16px' }}>
        Confirm Watch Shift
      </h3>

      <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 12px' }}>
        <strong>{fmtSlotDay(slotStart)} {fmtClockTime(slotStart, { use12h })} TCT</strong>
        {' '}(<strong>{dayShift ? `${fmtSlotDayLocal(slotStart)} ` : ''}{fmtClockTime(slotStart, { local: true, use12h })}</strong> local)
      </p>

      {isLeader && members.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Assign to</label>
          <select
            value={assigneeId ?? ''}
            onChange={(e) => setAssigneeId(parseInt(e.target.value, 10))}
            style={{
              width: '100%', fontSize: 13, padding: '6px 8px', borderRadius: 6,
              background: 'rgba(255,255,255,0.04)', color: '#f4f4f5', border: '1px solid var(--border-subtle)',
            }}
          >
            <option value={currentUserId ?? ''}>Myself</option>
            {members.filter((m) => m.torn_user_id !== currentUserId).map((m) => (
              <option key={m.torn_user_id} value={m.torn_user_id}>{m.username}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{
        background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)',
        borderRadius: 10, padding: '12px 14px', marginBottom: 18,
      }}>
        <p style={{ color: '#f4f4f5', fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>What watching involves:</p>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
          {rawLines.map((raw, i) => {
            const trimmed = raw.trim()
            if (!trimmed) return <div key={i}>&nbsp;</div>
            const isBullet = BULLET_RE.test(trimmed)
            return (
              <div key={i} style={{ paddingLeft: isBullet ? 14 : 0 }}>
                {isBullet ? `• ${trimmed.replace(BULLET_RE, '')}` : trimmed}
              </div>
            )
          })}
        </div>
        <p style={{ color: '#f87171', fontSize: 12.5, margin: '10px 0 0', fontWeight: 600 }}>
          Once confirmed, only a leader can remove this shift.
        </p>
      </div>

      <div className="flex" style={{ gap: 10, justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          disabled={busy}
          style={{
            fontSize: 13, padding: '8px 16px', borderRadius: 7, background: 'rgba(255,255,255,0.05)',
            color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => onConfirm(assigneeId)}
          disabled={busy}
          style={{
            fontSize: 13, padding: '8px 16px', borderRadius: 7, background: '#8b5cf6', color: '#fff',
            border: 'none', cursor: 'pointer', fontWeight: 600, opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Signing up…' : (assigningOther ? 'Confirm assignment' : 'Confirm sign-up')}
        </button>
      </div>
    </Modal>
  )
}
