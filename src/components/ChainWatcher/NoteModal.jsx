import { useState } from 'react'
import Modal from './Modal'
import { fmtSlotDay, fmtClockTime } from './chainWatcherUtils'

export default function NoteModal({ shift, busy, onSave, onClose, use12h = false }) {
  const [text, setText] = useState(shift.note || '')

  return (
    <Modal onClose={onClose}>
      <h3 style={{ color: '#f4f4f5', fontFamily: 'Cinzel,serif', fontSize: 16, letterSpacing: 1, margin: '0 0 6px' }}>
        Shift Note
      </h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 12.5, margin: '0 0 14px' }}>
        {fmtSlotDay(shift.slot_start)} {fmtClockTime(shift.slot_start, { use12h })} TCT — {shift.username}
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. didn't show up for their shift"
        rows={4}
        style={{
          width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '10px 12px', borderRadius: 8,
          background: 'rgba(255,255,255,0.04)', color: '#f4f4f5', border: '1px solid var(--border-subtle)',
          resize: 'vertical', fontFamily: 'inherit', marginBottom: 16,
        }}
      />

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
          onClick={() => onSave(text)}
          disabled={busy}
          style={{
            fontSize: 13, padding: '8px 16px', borderRadius: 7, background: '#8b5cf6', color: '#fff',
            border: 'none', cursor: 'pointer', fontWeight: 600, opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Saving…' : 'Save note'}
        </button>
      </div>
    </Modal>
  )
}
