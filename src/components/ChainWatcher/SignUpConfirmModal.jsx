import Modal from './Modal'
import { fmtSlotDay, fmtSlotTime, fmtSlotTimeLocal, localDayDiffers, fmtSlotDayLocal } from './chainWatcherUtils'

export default function SignUpConfirmModal({ slotStart, busy, onConfirm, onClose }) {
  const dayShift = localDayDiffers(slotStart)

  return (
    <Modal onClose={onClose}>
      <h3 style={{ color: '#f4f4f5', fontFamily: 'Cinzel,serif', fontSize: 16, letterSpacing: 1, margin: '0 0 16px' }}>
        Confirm Watch Shift
      </h3>

      <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 12px' }}>
        <strong>{fmtSlotDay(slotStart)} {fmtSlotTime(slotStart)} TCT</strong>
        {' '}(<strong>{dayShift ? `${fmtSlotDayLocal(slotStart)} ` : ''}{fmtSlotTimeLocal(slotStart)}</strong> local)
      </p>

      <div style={{
        background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)',
        borderRadius: 10, padding: '12px 14px', marginBottom: 18,
      }}>
        <p style={{ color: '#f4f4f5', fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>What watching involves:</p>
        <ul style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>Be in Torn with enough energy to save the chain.</li>
          <li>Attack when the timer drops below 2 minutes.</li>
          <li>Near a bonus? Flag it to a leader.</li>
        </ul>
        <p style={{ color: '#f87171', fontSize: 12.5, margin: '10px 0 0', fontWeight: 600 }}>
          You can't remove yourself after confirming — only a leader can.
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
          onClick={onConfirm}
          disabled={busy}
          style={{
            fontSize: 13, padding: '8px 16px', borderRadius: 7, background: '#8b5cf6', color: '#fff',
            border: 'none', cursor: 'pointer', fontWeight: 600, opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Signing up…' : 'Confirm sign-up'}
        </button>
      </div>
    </Modal>
  )
}
