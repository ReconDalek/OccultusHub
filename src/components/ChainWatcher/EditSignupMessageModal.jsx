import { useState } from 'react'
import Modal from './Modal'

export default function EditSignupMessageModal({ message, busy, onSave, onClose }) {
  const [text, setText] = useState(message)

  return (
    <Modal onClose={onClose}>
      <h3 style={{ color: '#f4f4f5', fontFamily: 'Cinzel,serif', fontSize: 16, letterSpacing: 1, margin: '0 0 6px' }}>
        Edit Sign-Up Message
      </h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 12.5, margin: '0 0 14px' }}>
        Shown to members when they confirm a watch shift. Start a line with "-" for a
        bullet point. A blank line between lines leaves a gap there.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
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
          disabled={busy || !text.trim()}
          style={{
            fontSize: 13, padding: '8px 16px', borderRadius: 7, background: '#8b5cf6', color: '#fff',
            border: 'none', cursor: 'pointer', fontWeight: 600, opacity: (busy || !text.trim()) ? 0.6 : 1,
          }}
        >
          {busy ? 'Saving…' : 'Save message'}
        </button>
      </div>
    </Modal>
  )
}
