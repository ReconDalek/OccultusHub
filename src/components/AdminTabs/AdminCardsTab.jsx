import { useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE_URL } from '../../config/api'

const token = () => localStorage.getItem('occultusSession')
const h = () => ({ 'Content-Type': 'application/json', Authorization: token() })

// Inline edit form rendered inside the card row
function InlineEditForm({ card, type, onSave, onCancel }) {
  const [form, setForm] = useState({
    text:     card.text     ?? '',
    picks:    card.picks    ?? 1,
    is_blank: card.is_blank ?? false,
  })
  const [saving, setSaving]   = useState(false)
  const [error,  setError]    = useState('')
  const textareaRef           = useRef(null)

  // Focus textarea on mount
  useEffect(() => { textareaRef.current?.focus() }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/cards/${type}/${card.id}`, {
        method: 'PUT', headers: h(),
        body: JSON.stringify({ ...form, type }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); return }
      onSave()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      background: 'rgba(179,18,63,0.06)',
      border: '1px solid rgba(179,18,63,0.3)',
      borderRadius: 8,
      padding: '14px 16px',
    }}>
      {/* Text */}
      <textarea
        ref={textareaRef}
        value={form.text}
        onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
        rows={3}
        placeholder={type === 'shadow' ? 'Prompt text (use _______ for blanks)…' : 'Answer text…'}
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 6,
          color: '#f4f4f5',
          fontSize: 13,
          padding: '9px 12px',
          resize: 'vertical',
          outline: 'none',
          boxSizing: 'border-box',
          lineHeight: 1.55,
          marginBottom: 10,
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
        {/* Picks (shadow only) */}
        {type === 'shadow' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#a1a1aa' }}>Picks:</span>
            {[1, 2].map(n => (
              <button
                key={n}
                onClick={() => setForm(f => ({ ...f, picks: n }))}
                style={{
                  width: 32, height: 28, borderRadius: 5,
                  border: form.picks === n ? '1px solid rgba(179,18,63,0.7)' : '1px solid rgba(255,255,255,0.12)',
                  background: form.picks === n ? 'rgba(179,18,63,0.2)' : 'transparent',
                  color: '#f4f4f5', cursor: 'pointer', fontSize: 12,
                }}
              >{n}</button>
            ))}
          </div>
        )}

        {/* Blank vessel (fate only) */}
        {type === 'fate' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, color: '#d4d4d8' }}>
            <input
              type="checkbox"
              checked={form.is_blank}
              onChange={e => setForm(f => ({ ...f, is_blank: e.target.checked, text: e.target.checked ? '' : f.text }))}
              style={{ accentColor: '#b3123f', width: 14, height: 14 }}
            />
            Blank Vessel
          </label>
        )}
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '6px 18px', borderRadius: 7, border: 'none',
            background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
            color: '#f4f4f5', fontSize: 12, cursor: 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '6px 14px', borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent', color: '#a1a1aa', fontSize: 12, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// New card form (used at the top, triggered by the + button)
function NewCardForm({ defaultType, onSave, onCancel }) {
  const [form, setForm]     = useState({ type: defaultType, text: '', picks: 1, is_blank: false })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const textareaRef         = useRef(null)

  useEffect(() => { textareaRef.current?.focus() }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/cards`, {
        method: 'POST', headers: h(),
        body: JSON.stringify(form),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); return }
      onSave()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      background: 'rgba(109,40,217,0.07)',
      border: '1px solid rgba(109,40,217,0.3)',
      borderRadius: 10,
      padding: '16px 20px',
      marginBottom: 16,
    }}>
      <div style={{ fontSize: 11, letterSpacing: '1.5px', color: '#a78bfa', marginBottom: 12 }}>NEW CARD</div>

      {/* Type toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {['shadow', 'fate'].map(t => (
          <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))} style={{
            padding: '4px 14px', borderRadius: 6, fontSize: 12,
            border: form.type === t ? '1px solid rgba(179,18,63,0.6)' : '1px solid rgba(255,255,255,0.1)',
            background: form.type === t ? 'rgba(179,18,63,0.15)' : 'transparent',
            color: '#f4f4f5', cursor: 'pointer',
          }}>{t === 'shadow' ? '◼ Shadow' : '◻ Fate'}</button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        value={form.text}
        onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
        rows={3}
        placeholder={form.type === 'shadow' ? 'Prompt text (use _______ for blanks)…' : 'Answer text…'}
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 6,
          color: '#f4f4f5',
          fontSize: 13,
          padding: '9px 12px',
          resize: 'vertical',
          outline: 'none',
          boxSizing: 'border-box',
          lineHeight: 1.55,
          marginBottom: 10,
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
        {form.type === 'shadow' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#a1a1aa' }}>Picks:</span>
            {[1, 2].map(n => (
              <button key={n} onClick={() => setForm(f => ({ ...f, picks: n }))} style={{
                width: 32, height: 28, borderRadius: 5,
                border: form.picks === n ? '1px solid rgba(179,18,63,0.7)' : '1px solid rgba(255,255,255,0.12)',
                background: form.picks === n ? 'rgba(179,18,63,0.2)' : 'transparent',
                color: '#f4f4f5', cursor: 'pointer', fontSize: 12,
              }}>{n}</button>
            ))}
          </div>
        )}
        {form.type === 'fate' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, color: '#d4d4d8' }}>
            <input
              type="checkbox"
              checked={form.is_blank}
              onChange={e => setForm(f => ({ ...f, is_blank: e.target.checked, text: e.target.checked ? '' : f.text }))}
              style={{ accentColor: '#b3123f', width: 14, height: 14 }}
            />
            Blank Vessel
          </label>
        )}
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '6px 18px', borderRadius: 7, border: 'none',
            background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
            color: '#f4f4f5', fontSize: 12, cursor: 'pointer',
          }}
        >
          {saving ? 'Adding…' : 'Add Card'}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '6px 14px', borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent', color: '#a1a1aa', fontSize: 12, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function AdminCardsTab() {
  const [view, setView]           = useState('shadow')
  const [cards, setCards]         = useState({ shadow: [], fate: [] })
  const [loading, setLoading]     = useState(true)
  const [editingId, setEditingId] = useState(null) // card.id being edited inline, or null
  const [addingNew, setAddingNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/cards`, { headers: h() })
      if (res.ok) {
        const d = await res.json()
        setCards({ shadow: d.shadow || [], fate: d.fate || [] })
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleToggle(type, id) {
    await fetch(`${API_BASE_URL}/api/admin/cards/${type}/${id}/toggle`, { method: 'POST', headers: h() })
    await load()
  }

  async function handleDelete(type, id) {
    if (!window.confirm('Delete this card permanently?')) return
    if (editingId === id) setEditingId(null)
    await fetch(`${API_BASE_URL}/api/admin/cards/${type}/${id}`, { method: 'DELETE', headers: h() })
    await load()
  }

  const list        = cards[view]
  const activeCount = list.filter(c => c.is_active).length

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['shadow', 'fate'].map(t => (
          <button
            key={t}
            onClick={() => { setView(t); setEditingId(null); setAddingNew(false) }}
            style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13,
              fontFamily: 'Cinzel, serif', letterSpacing: '1px', cursor: 'pointer',
              border: view === t ? '1px solid rgba(179,18,63,0.6)' : '1px solid rgba(255,255,255,0.1)',
              background: view === t ? 'rgba(179,18,63,0.15)' : 'transparent',
              color: view === t ? '#f4f4f5' : '#a1a1aa',
            }}
          >
            {t === 'shadow' ? '◼ Shadow Cards' : '◻ Fate Cards'}
          </button>
        ))}
      </div>

      {/* Stats + add button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#a1a1aa' }}>
          {list.length} cards &nbsp;·&nbsp; {activeCount} active
        </div>
        {!addingNew && (
          <button
            onClick={() => { setAddingNew(true); setEditingId(null) }}
            style={{
              padding: '7px 18px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
              color: '#f4f4f5', fontSize: 12, cursor: 'pointer', letterSpacing: '0.5px',
            }}
          >
            + New {view === 'shadow' ? 'Shadow' : 'Fate'} Card
          </button>
        )}
      </div>

      {/* New card form — pinned near the top */}
      {addingNew && (
        <NewCardForm
          defaultType={view}
          onSave={async () => { setAddingNew(false); await load() }}
          onCancel={() => setAddingNew(false)}
        />
      )}

      {/* Card list */}
      {loading ? (
        <div style={{ color: '#a1a1aa', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.length === 0 && (
            <div style={{ color: '#a1a1aa', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>No cards yet.</div>
          )}

          {list.map(card => {
            const isEditing = editingId === card.id

            return (
              <div
                key={card.id}
                style={{
                  borderRadius: 8,
                  border: isEditing
                    ? '1px solid rgba(179,18,63,0.35)'
                    : '1px solid rgba(255,255,255,0.07)',
                  background: isEditing
                    ? 'rgba(179,18,63,0.04)'
                    : card.is_active ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
                  opacity: !isEditing && !card.is_active ? 0.45 : 1,
                  overflow: 'hidden',
                  transition: 'border 0.15s, background 0.15s',
                }}
              >
                {isEditing ? (
                  /* ── Inline edit form ── */
                  <div style={{ padding: '12px 16px' }}>
                    <InlineEditForm
                      card={card}
                      type={view}
                      onSave={async () => { setEditingId(null); await load() }}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                ) : (
                  /* ── Normal display row ── */
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 16px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#f4f4f5', lineHeight: 1.55 }}>
                        {card.is_blank
                          ? <em style={{ color: '#a1a1aa' }}>— blank vessel —</em>
                          : card.text}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                        {view === 'shadow' && card.picks > 1 && (
                          <span style={{ fontSize: 10, color: '#b3123f', background: 'rgba(179,18,63,0.1)', borderRadius: 4, padding: '1px 6px' }}>
                            ×{card.picks} picks
                          </span>
                        )}
                        {card.is_blank && (
                          <span style={{ fontSize: 10, color: '#a1a1aa', background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '1px 6px' }}>
                            blank vessel
                          </span>
                        )}
                        {!card.is_active && (
                          <span style={{ fontSize: 10, color: '#6b7280', background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: '1px 6px' }}>
                            disabled
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>#{card.id}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
                      <button
                        onClick={() => { setEditingId(card.id); setAddingNew(false) }}
                        style={{
                          padding: '4px 11px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                          border: '1px solid rgba(255,255,255,0.15)',
                          background: 'transparent', color: '#d4d4d8',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggle(view, card.id)}
                        style={{
                          padding: '4px 11px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: 'transparent',
                          color: card.is_active ? '#34d399' : '#6b7280',
                        }}
                      >
                        {card.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => handleDelete(view, card.id)}
                        style={{
                          padding: '4px 11px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                          border: '1px solid rgba(239,68,68,0.25)',
                          background: 'transparent', color: '#f87171',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
