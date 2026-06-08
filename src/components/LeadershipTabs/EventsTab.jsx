import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

const EMPTY_FORM = { title: '', description: '', start_date: '', end_date: '', start_time: '', end_time: '', category: '' }

export default function EventsTab() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
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
    if (!form.title || !form.start_date) { setError('Title and start date are required.'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      setForm(EMPTY_FORM)
      fetchEvents()
    } catch {
      setError('Failed to create event.')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (ev) => {
    setEditingId(ev.id)
    setEditForm({
      title: ev.title || '',
      description: ev.description || '',
      start_date: ev.start_date || '',
      end_date: ev.end_date || '',
      start_time: ev.start_time || '',
      end_time: ev.end_time || '',
      category: ev.category || '',
    })
  }

  const handleSaveEdit = async (id) => {
    if (!editForm.title || !editForm.start_date) return
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/events/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) throw new Error()
      setEditingId(null)
      fetchEvents()
    } catch {
      setError('Failed to update event.')
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
    if (editingId === id) setEditingId(null)
    fetchEvents()
  }

  const handleImportTorn = async () => {
    if (!window.confirm('Load events from the Torn API? Existing Torn events will be updated.')) return
    setImporting(true)
    setImportResult(null)
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/events/import-torn`, {
        method: 'POST',
        headers: { Authorization: token },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Import failed')
      setImportResult(data)
      fetchEvents()
    } catch (e) {
      setError(e.message || 'Failed to import Torn events.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '22px', color: '#f4f4f5', margin: 0 }}>
            Events Calendar
          </h2>
          <p style={{ color: '#a1a1aa', fontSize: '14px', marginTop: '6px', marginBottom: 0 }}>
            Add upcoming events to the member home calendar.
          </p>
        </div>
        <button
          onClick={handleImportTorn}
          disabled={importing}
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            border: '1px solid rgba(159,103,255,0.4)',
            cursor: importing ? 'not-allowed' : 'pointer',
            background: 'rgba(109,40,217,0.2)',
            color: '#c4b5fd',
            fontWeight: 600,
            fontSize: '13px',
            opacity: importing ? 0.6 : 1,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {importing ? 'Loading…' : '⬇ Load from Torn API'}
        </button>
      </div>

      {importResult && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(14,140,100,0.15)', border: '1px solid rgba(14,140,100,0.3)', color: '#7fffd4', fontSize: '13px', marginBottom: '20px' }}>
          Imported {importResult.imported} new event{importResult.imported !== 1 ? 's' : ''}, updated {importResult.updated} existing ({importResult.total} total from Torn).
        </div>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px', maxWidth: '520px', marginTop: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <input
            type="text"
            placeholder="Event title *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Category (e.g. faction)"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            style={inputStyle}
          />
        </div>
        <input
          type="text"
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          style={inputStyle}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} style={inputStyle} />
            <span style={{ color: '#a1a1aa', fontSize: '11px' }}>Start date (TCT/UTC) *</span>
          </div>
          <div>
            <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} style={inputStyle} />
            <span style={{ color: '#a1a1aa', fontSize: '11px' }}>End date (optional)</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} style={inputStyle} />
            <span style={{ color: '#a1a1aa', fontSize: '11px' }}>Start time TCT (optional)</span>
          </div>
          <div>
            <input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} style={inputStyle} />
            <span style={{ color: '#a1a1aa', fontSize: '11px' }}>End time TCT (optional)</span>
          </div>
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
            <div key={ev.id} style={{ borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              {editingId === ev.id ? (
                /* Inline edit form */
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input type="text" placeholder="Title *" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} style={inputStyle} />
                    <input type="text" placeholder="Category" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} style={inputStyle} />
                  </div>
                  <input type="text" placeholder="Description" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} style={inputStyle} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <input type="date" value={editForm.start_date} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} style={inputStyle} />
                      <span style={{ color: '#a1a1aa', fontSize: '11px' }}>Start date *</span>
                    </div>
                    <div>
                      <input type="date" value={editForm.end_date} onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })} style={inputStyle} />
                      <span style={{ color: '#a1a1aa', fontSize: '11px' }}>End date</span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <input type="time" value={editForm.start_time} onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })} style={inputStyle} />
                      <span style={{ color: '#a1a1aa', fontSize: '11px' }}>Start time TCT</span>
                    </div>
                    <div>
                      <input type="time" value={editForm.end_time} onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })} style={inputStyle} />
                      <span style={{ color: '#a1a1aa', fontSize: '11px' }}>End time TCT</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleSaveEdit(ev.id)}
                      disabled={saving}
                      style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #b3123f, #6d28d9)', color: '#f4f4f5', fontWeight: 600, fontSize: '13px' }}
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', background: 'transparent', color: '#a1a1aa', fontSize: '13px' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* Read view */
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', gap: '16px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px' }}>{ev.title}</span>
                      {ev.source === 'torn' && (
                        <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '20px', background: 'rgba(109,40,217,0.25)', color: '#c4b5fd', whiteSpace: 'nowrap' }}>
                          Torn
                        </span>
                      )}
                      {ev.category && ev.source !== 'torn' && (
                        <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '20px', background: 'rgba(255,255,255,0.08)', color: '#a1a1aa', whiteSpace: 'nowrap' }}>
                          {ev.category}
                        </span>
                      )}
                    </div>
                    {ev.description && <div style={{ color: '#a1a1aa', fontSize: '13px', marginTop: '2px' }}>{ev.description}</div>}
                    <div style={{ color: '#9f67ff', fontSize: '12px', marginTop: '4px' }}>
                      {ev.start_date}{ev.end_date && ev.end_date !== ev.start_date ? ` → ${ev.end_date}` : ''}
                      {ev.start_time ? ` · ${ev.start_time} TCT` : ''}
                      {ev.fixed_start_time === 0 ? ' · flexible start' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button
                      onClick={() => handleEdit(ev)}
                      style={{ background: 'rgba(109,40,217,0.15)', border: '1px solid rgba(109,40,217,0.3)', color: '#9f67ff', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(ev.id)}
                      style={{ background: 'rgba(179,18,63,0.15)', border: '1px solid rgba(179,18,63,0.3)', color: '#b3123f', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
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
