import { useState } from 'react'
import Modal from './Modal'
import { fmtSlotDay, fmtSlotTime } from './chainWatcherUtils'

// Leadership-only — changes who gets credit for an already-completed shift
// (e.g. the signed-up member never showed, someone else covered it
// manually). A reason is mandatory, since it's the only record of why a
// finished shift's watcher changed.
export default function ReassignShiftModal({ shift, members = [], busy, onSave, onClose }) {
  const [newUserId, setNewUserId] = useState(() => {
    const first = members.find((m) => m.torn_user_id !== shift.torn_user_id)
    return first?.torn_user_id ?? null
  })
  const [reason, setReason] = useState('')

  const canSave = newUserId != null && reason.trim().length > 0

  return (
    <Modal onClose={onClose}>
      <h3 style={{ color: '#f4f4f5', fontFamily: 'Cinzel,serif', fontSize: 16, letterSpacing: 1, margin: '0 0 6px' }}>
        Reassign Completed Shift
      </h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 12.5, margin: '0 0 14px' }}>
        {fmtSlotDay(shift.slot_start)} {fmtSlotTime(shift.slot_start)} TCT — currently credited to {shift.username}
      </p>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Actually watched by</label>
        <select
          value={newUserId ?? ''}
          onChange={(e) => setNewUserId(parseInt(e.target.value, 10))}
          style={{
            width: '100%', fontSize: 13, padding: '6px 8px', borderRadius: 6,
            background: 'rgba(255,255,255,0.04)', color: '#f4f4f5', border: '1px solid var(--border-subtle)',
          }}
        >
          {members.map((m) => (
            <option key={m.torn_user_id} value={m.torn_user_id}>{m.username}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
          Reason <span style={{ color: '#f87171' }}>(required)</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. never showed up — Maliblo covered it instead"
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '10px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', color: '#f4f4f5', border: '1px solid var(--border-subtle)',
            resize: 'vertical', fontFamily: 'inherit',
          }}
        />
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
          onClick={() => onSave(newUserId, reason.trim())}
          disabled={busy || !canSave}
          style={{
            fontSize: 13, padding: '8px 16px', borderRadius: 7, background: '#8b5cf6', color: '#fff',
            border: 'none', cursor: 'pointer', fontWeight: 600, opacity: (busy || !canSave) ? 0.6 : 1,
          }}
        >
          {busy ? 'Saving…' : 'Reassign'}
        </button>
      </div>
    </Modal>
  )
}
