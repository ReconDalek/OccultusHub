import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

export default function EventsTab() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ title: '', description: '', event_date: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const token = localStorage.getItem('occultusSession')

  const fetchEvents = () => {
    fetch(`${API_BASE_URL}/api/events`, { headers: { Authorization: token } })
      .then((r) => r.json())
      .then((data) => { setEvents(data.events || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(fetchEvents, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.title || !form.event_date) { setError('Title and date are required.'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ ...form, event_date: form.event_date }),
      })
      if (!res.ok) throw new Error()
      setForm({ title: '', description: '', event_date: '' })
      fetchEvents()
    } catch {
      setError('Failed to create event.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this event?')) return
    await fetch(`${API_BASE_URL}/api/leadership/events/${id}`, {
      method: 'DELETE',
      headers: { Authorization: token },
    })
    fetchEvents()
  }

  return (
    <div>
      <h2 className="font-cinzel mb-2" style={{ fontSize: '22px', color: '#f4f4f5' }}>
        Events Calendar
      </h2>
      <p style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '28px' }}>
        Add upcoming events to the member home calendar.
      </p>

      {/* Create form */}
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px', maxWidth: '480px' }}>
        <input
          type="text"
          placeholder="Event title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          style={inputStyle}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <input
            type="date"
            value={form.event_date}
            onChange={(e) => setForm({ ...form, event_date: e.target.value })}
            style={inputStyle}
          />
          <span style={{ color: '#a1a1aa', fontSize: '11px' }}>Date is in TCT (UTC)</span>
        </div>
        {error && <p style={{ color: '#b3123f', fontSize: '13px', margin: 0 }}>{error}</p>}
        <button
          type="submit"
          disabled={saving}
          style={{
            alignSelf: 'flex-start',
            padding: '10px 24px',
            borderRadius: '10px',
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
            color: '#f4f4f5',
            fontWeight: 600,
            fontSize: '14px',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Adding…' : 'Add Event'}
        </button>
      </form>

      {/* Events list */}
      {loading ? (
        <p style={{ color: '#a1a1aa', fontSize: '14px' }}>Loading…</p>
      ) : events.length === 0 ? (
        <p style={{ color: '#a1a1aa', fontSize: '14px' }}>No upcoming events.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {events.map((ev) => (
            <div
              key={ev.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                gap: '16px',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{ev.title}</div>
                {ev.description && <div style={{ color: '#a1a1aa', fontSize: '13px', marginTop: '2px' }}>{ev.description}</div>}
                <div style={{ color: '#9f67ff', fontSize: '12px', marginTop: '4px' }}>{ev.event_date}</div>
              </div>
              <button
                onClick={() => handleDelete(ev.id)}
                style={{ background: 'rgba(179,18,63,0.15)', border: '1px solid rgba(179,18,63,0.3)', color: '#b3123f', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const inputStyle = {
  padding: '10px 14px',
  borderRadius: '10px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#f4f4f5',
  fontSize: '14px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}
