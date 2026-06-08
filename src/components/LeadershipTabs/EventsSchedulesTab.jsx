import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'
import EventCalendar from '../EventCalendar'

const FACTIONS = [
  { id: 33097, name: 'Occultus' },
  { id: 9728, name: 'Occul2us' },
  { id: 9171, name: 'Occul3us' },
]

// ─── Events section ──────────────────────────────────────────────────────────

const MONTHLY_PRESETS = [
  { category: 'social',  label: '🎉 Social Event',  title: 'Social Event'  },
  { category: 'faction', label: '⚔ Faction Event', title: 'Faction Event' },
]

const BLANK_FORM = { category: '', title: '', description: '', start_date: '', end_date: '', start_time: '', end_time: '', isMultiDay: false }

function fmtTime(t) {
  if (!t) return null
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  return `${hour % 12 || 12}:${m}${hour >= 12 ? 'pm' : 'am'}`
}

function EventsSection({ token }) {
  const calendarStartTime = (() => {
    try { return JSON.parse(localStorage.getItem('occultusUser'))?.calendarStartTime || null } catch { return null }
  })()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(BLANK_FORM)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [error, setError] = useState('')

  const fetchEvents = () => {
    fetch(`${API_BASE_URL}/api/events`, { headers: { Authorization: token } })
      .then((r) => r.json())
      .then((data) => { setEvents(data.events || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(fetchEvents, [])

  const applyPreset = (preset) => {
    setForm(f => ({ ...f, category: preset.category, title: preset.title }))
    setError('')
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.title || !form.start_date) { setError('Title and start date are required.'); return }
    if (form.isMultiDay && !form.end_date) { setError('End date is required for multi-day events.'); return }
    if (form.isMultiDay && form.end_date < form.start_date) { setError('End date must be after start date.'); return }
    setSaving(true)
    setError('')
    try {
      const body = {
        title: form.title,
        description: form.description,
        start_date: form.start_date,
        end_date: form.isMultiDay ? form.end_date : null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        category: form.category || null,
      }
      const res = await fetch(`${API_BASE_URL}/api/leadership/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      setForm(BLANK_FORM)
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
      category: ev.category || '',
      title: ev.title || '',
      description: ev.description || '',
      start_date: ev.start_date || '',
      end_date: ev.end_date || '',
      start_time: ev.start_time || '',
      end_time: ev.end_time || '',
      isMultiDay: !!ev.end_date,
    })
    setError('')
  }

  const handleSaveEdit = async (id) => {
    if (!editForm.title || !editForm.start_date) { setError('Title and start date are required.'); return }
    setSaving(true)
    setError('')
    try {
      const body = {
        title: editForm.title,
        description: editForm.description,
        start_date: editForm.start_date,
        end_date: editForm.isMultiDay ? editForm.end_date : null,
        start_time: editForm.start_time || null,
        end_time: editForm.end_time || null,
        category: editForm.category || null,
      }
      const res = await fetch(`${API_BASE_URL}/api/leadership/events/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(body),
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

  const formatEventLabel = (ev) => {
    const isFlexible = ev.fixed_start_time === 0
    const displayStart = isFlexible && calendarStartTime ? calendarStartTime : ev.start_time
    const displayEnd   = isFlexible ? null : ev.end_time
    const dateStr = ev.end_date && ev.end_date !== ev.start_date
      ? `${ev.start_date} → ${ev.end_date}`
      : ev.start_date
    const timeStr = displayStart
      ? ` · ${fmtTime(displayStart)}${displayEnd ? ` – ${fmtTime(displayEnd)}` : ''} TCT${isFlexible ? ' (your start)' : ''}`
      : ''
    return dateStr + timeStr
  }

  return (
    <div>
      {/* Calendar preview */}
      <div style={{ marginBottom: '28px' }}>
        <EventCalendar events={events} />
      </div>

      {/* Import from Torn + result */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          onClick={handleImportTorn}
          disabled={importing}
          style={{
            padding: '9px 18px',
            borderRadius: '8px',
            border: '1px solid rgba(159,103,255,0.4)',
            cursor: importing ? 'not-allowed' : 'pointer',
            background: 'rgba(109,40,217,0.2)',
            color: '#c4b5fd',
            fontWeight: 600,
            fontSize: '13px',
            opacity: importing ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {importing ? 'Loading…' : '⬇ Load from Torn API'}
        </button>
        {importResult && (
          <span style={{ fontSize: '13px', color: '#7fffd4' }}>
            {importResult.imported} new, {importResult.updated} updated ({importResult.total} total from Torn)
          </span>
        )}
        {error && <span style={{ fontSize: '13px', color: '#b3123f' }}>{error}</span>}
      </div>

      {/* Monthly event quick-add */}
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#a1a1aa', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>
        Monthly Events
      </h3>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {MONTHLY_PRESETS.map(p => (
          <button
            key={p.category}
            type="button"
            onClick={() => applyPreset(p)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: form.category === p.category
                ? '1px solid rgba(179,18,63,0.5)'
                : '1px solid rgba(255,255,255,0.1)',
              background: form.category === p.category
                ? 'rgba(179,18,63,0.15)'
                : 'rgba(255,255,255,0.04)',
              color: form.category === p.category ? '#f4f4f5' : '#a1a1aa',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: form.category === p.category ? 600 : 400,
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setForm(f => ({ ...f, category: '', title: '' }))}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: !form.category ? '1px solid rgba(179,18,63,0.5)' : '1px solid rgba(255,255,255,0.1)',
            background: !form.category ? 'rgba(179,18,63,0.15)' : 'rgba(255,255,255,0.04)',
            color: !form.category ? '#f4f4f5' : '#a1a1aa',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: !form.category ? 600 : 400,
          }}
        >
          ✏ Custom
        </button>
      </div>

      {/* Add event form */}
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#a1a1aa', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '14px' }}>
        Add Event
      </h3>
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '480px', marginBottom: '28px' }}>
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

        {/* Multi-day toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: '#a1a1aa' }}>
          <input
            type="checkbox"
            checked={form.isMultiDay}
            onChange={(e) => setForm({ ...form, isMultiDay: e.target.checked, end_date: '' })}
            style={{ accentColor: '#b3123f', width: '15px', height: '15px' }}
          />
          Multi-day event
        </label>

        {/* Dates */}
        <div style={{ display: 'grid', gridTemplateColumns: form.isMultiDay ? '1fr 1fr' : '1fr', gap: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '11px', color: '#a1a1aa' }}>{form.isMultiDay ? 'Start date' : 'Date'}</span>
            <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} style={inputStyle} />
          </div>
          {form.isMultiDay && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: '#a1a1aa' }}>End date</span>
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} style={inputStyle} />
            </div>
          )}
        </div>

        {/* Times */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '11px', color: '#a1a1aa' }}>Start time (TCT, optional)</span>
            <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '11px', color: '#a1a1aa' }}>End time (TCT, optional)</span>
            <input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} style={inputStyle} />
          </div>
        </div>

        <button type="submit" disabled={saving} style={submitBtn(saving)}>
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
          {events.map((ev) => {
            const preset = MONTHLY_PRESETS.find(p => p.category === ev.category)
            const isEditing = editingId === ev.id
            return (
              <div key={ev.id} style={{ borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                {isEditing ? (
                  /* Inline edit form */
                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <input type="text" placeholder="Title *" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} style={inputStyle} />
                      <input type="text" placeholder="Description" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} style={inputStyle} />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#a1a1aa' }}>
                      <input type="checkbox" checked={editForm.isMultiDay} onChange={(e) => setEditForm({ ...editForm, isMultiDay: e.target.checked, end_date: '' })} style={{ accentColor: '#b3123f' }} />
                      Multi-day event
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: editForm.isMultiDay ? '1fr 1fr' : '1fr', gap: '8px' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: '#a1a1aa' }}>{editForm.isMultiDay ? 'Start date' : 'Date'}</span>
                        <input type="date" value={editForm.start_date} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} style={inputStyle} />
                      </div>
                      {editForm.isMultiDay && (
                        <div>
                          <span style={{ fontSize: '11px', color: '#a1a1aa' }}>End date</span>
                          <input type="date" value={editForm.end_date} onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })} style={inputStyle} />
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: '#a1a1aa' }}>Start time (TCT)</span>
                        <input type="time" value={editForm.start_time} onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })} style={inputStyle} />
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#a1a1aa' }}>End time (TCT)</span>
                        <input type="time" value={editForm.end_time} onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })} style={inputStyle} />
                      </div>
                    </div>
                    {error && <p style={{ color: '#b3123f', fontSize: '12px', margin: 0 }}>{error}</p>}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleSaveEdit(ev.id)} disabled={saving} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #b3123f, #6d28d9)', color: '#f4f4f5', fontWeight: 600, fontSize: '13px' }}>
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditingId(null)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', background: 'transparent', color: '#a1a1aa', fontSize: '13px' }}>
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
                          <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '20px', background: 'rgba(109,40,217,0.25)', color: '#c4b5fd' }}>
                            Torn
                          </span>
                        )}
                        {preset && ev.source !== 'torn' && (
                          <span style={{
                            fontSize: '11px', padding: '2px 9px', borderRadius: '20px',
                            background: preset.category === 'social' ? 'rgba(14,140,100,0.25)' : 'rgba(180,130,10,0.25)',
                            color:      preset.category === 'social' ? '#80ffcc'               : '#ffe080',
                          }}>
                            {preset.label}
                          </span>
                        )}
                        {ev.end_date && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: 'rgba(109,40,217,0.25)', color: '#9f67ff' }}>
                            Multi-day
                          </span>
                        )}
                      </div>
                      {ev.description && <div style={{ color: '#a1a1aa', fontSize: '13px', marginTop: '2px' }}>{ev.description}</div>}
                      <div style={{ color: '#9f67ff', fontSize: '12px', marginTop: '4px' }}>
                        {formatEventLabel(ev)}
                        {ev.fixed_start_time === 0 && <span style={{ color: '#a1a1aa' }}> · flexible start</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button onClick={() => handleEdit(ev)} style={{ background: 'rgba(109,40,217,0.15)', border: '1px solid rgba(109,40,217,0.3)', color: '#9f67ff', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}>
                        Edit
                      </button>
                      <button onClick={() => handleDelete(ev.id)} style={deleteBtn}>Delete</button>
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

// ─── Schedules section ───────────────────────────────────────────────────────

function SchedulesSection({ token }) {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    faction_id: 33097, type: 'chain',
    stage: 'enlisting',
    enlist_date: '',
    scheduled_at: '',
    opponent_faction_id: '',
    chain_target: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [advancing, setAdvancing] = useState(null) // schedule id being advanced
  const [advanceForm, setAdvanceForm] = useState({ scheduled_at: '', opponent_faction_id: '' })
  const [advanceSaving, setAdvanceSaving] = useState(false)
  const [advanceError, setAdvanceError] = useState('')

  const isWar = form.type === 'war'
  const isActive = form.stage === 'active'

  const fetchSchedules = () => {
    fetch(`${API_BASE_URL}/api/faction-schedules`, { headers: { Authorization: token } })
      .then((r) => r.json())
      .then((data) => { setSchedules(data.schedules || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(fetchSchedules, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (isWar && !isActive && !form.enlist_date) { setError('Enlistment date is required.'); return }
    if ((!isWar || isActive) && !form.scheduled_at) { setError('Date and time are required.'); return }
    setSaving(true)
    setError('')
    try {
      // Enlisting wars use 12:00 UTC (noon) of the enlistment date
      const utcDate = isWar && !isActive
        ? new Date(form.enlist_date + 'T12:00:00Z').toISOString()
        : new Date(form.scheduled_at + 'Z').toISOString()
      const body = {
        faction_id: Number(form.faction_id),
        type: form.type,
        stage: isWar ? form.stage : 'active',
        scheduled_at: utcDate,
        opponent_faction_id: (isWar && isActive && form.opponent_faction_id) ? Number(form.opponent_faction_id) : null,
        chain_target: (!isWar && form.chain_target) ? form.chain_target : null,
      }
      const res = await fetch(`${API_BASE_URL}/api/leadership/faction-schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      setForm({ faction_id: 33097, type: 'chain', stage: 'enlisting', enlist_date: '', scheduled_at: '', opponent_faction_id: '', chain_target: '' })
      fetchSchedules()
    } catch {
      setError('Failed to create schedule.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this schedule?')) return
    await fetch(`${API_BASE_URL}/api/leadership/faction-schedules/${id}`, {
      method: 'DELETE',
      headers: { Authorization: token },
    })
    fetchSchedules()
  }

  const openAdvance = (id) => {
    setAdvancing(id)
    setAdvanceForm({ scheduled_at: '', opponent_faction_id: '' })
    setAdvanceError('')
  }

  const handleAdvance = async (id) => {
    if (!advanceForm.scheduled_at) { setAdvanceError('Start date and time are required.'); return }
    setAdvanceSaving(true)
    setAdvanceError('')
    try {
      const utcDate = new Date(advanceForm.scheduled_at + 'Z').toISOString()
      const res = await fetch(`${API_BASE_URL}/api/leadership/faction-schedules/${id}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({
          scheduled_at: utcDate,
          opponent_faction_id: advanceForm.opponent_faction_id ? Number(advanceForm.opponent_faction_id) : null,
        }),
      })
      if (!res.ok) { const d = await res.json(); setAdvanceError(d.error || 'Failed'); return }
      setAdvancing(null)
      fetchSchedules()
    } catch {
      setAdvanceError('Failed to advance schedule.')
    } finally {
      setAdvanceSaving(false)
    }
  }

  const factionName = (id) => FACTIONS.find((f) => f.id === Number(id))?.name ?? `#${id}`

  return (
    <div>
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#a1a1aa', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '14px' }}>
        Add Faction Schedule
      </h3>
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '480px', marginBottom: '28px' }}>

        {/* Faction + Type row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <select value={form.faction_id} onChange={(e) => setForm({ ...form, faction_id: e.target.value })} style={inputStyle}>
            {FACTIONS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, stage: 'enlisting', chain_target: '', opponent_faction_id: '', scheduled_at: '', enlist_date: '' })} style={inputStyle}>
            <option value="chain">⛓ Chain</option>
            <option value="war">⚔ War</option>
          </select>
        </div>

        {/* War: stage selector */}
        {isWar && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {['enlisting', 'active'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setForm({ ...form, stage: s })}
                style={{
                  padding: '9px',
                  borderRadius: '10px',
                  border: form.stage === s ? '1px solid rgba(179,18,63,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  background: form.stage === s ? 'rgba(179,18,63,0.15)' : 'rgba(255,255,255,0.04)',
                  color: form.stage === s ? '#f4f4f5' : '#a1a1aa',
                  cursor: 'pointer', fontSize: '13px', fontWeight: form.stage === s ? 600 : 400,
                  textTransform: 'capitalize',
                }}
              >
                {s === 'enlisting' ? '⏳ Enlisting' : '⚔ Active'}
              </button>
            ))}
          </div>
        )}

        {/* Chain: target */}
        {!isWar && (
          <input
            type="text"
            placeholder="Chain target (e.g. 1,000 hits)"
            value={form.chain_target}
            onChange={(e) => setForm({ ...form, chain_target: e.target.value })}
            style={inputStyle}
          />
        )}

        {/* War active: opponent faction ID */}
        {isWar && isActive && (
          <input
            type="number"
            placeholder="Opponent faction ID (optional)"
            value={form.opponent_faction_id}
            onChange={(e) => setForm({ ...form, opponent_faction_id: e.target.value })}
            style={inputStyle}
          />
        )}

        {/* Enlisting war: date only (time fixed at 00:00 UTC) */}
        {isWar && !isActive && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '11px', color: '#a1a1aa' }}>Enlistment date — starts 12:00 TCT (noon)</span>
            <input type="date" value={form.enlist_date} onChange={(e) => setForm({ ...form, enlist_date: e.target.value })} style={inputStyle} />
          </div>
        )}

        {/* Active war / chain: full datetime */}
        {(!isWar || isActive) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} style={inputStyle} />
            <span style={{ color: '#a1a1aa', fontSize: '11px' }}>Enter time in TCT (UTC)</span>
          </div>
        )}

        {error && <p style={{ color: '#b3123f', fontSize: '13px', margin: 0 }}>{error}</p>}
        <button type="submit" disabled={saving} style={submitBtn(saving)}>
          {saving ? 'Saving…' : 'Add Schedule'}
        </button>
      </form>

      {/* Schedules list */}
      {loading ? (
        <p style={{ color: '#a1a1aa', fontSize: '14px' }}>Loading…</p>
      ) : schedules.length === 0 ? (
        <p style={{ color: '#a1a1aa', fontSize: '14px' }}>No upcoming schedules.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {schedules.map((s) => {
            const isChain = s.type === 'chain'
            const isEnlisting = s.stage === 'enlisting'
            const tct = s.scheduled_at
              ? new Date(s.scheduled_at.endsWith('Z') ? s.scheduled_at : s.scheduled_at.replace(' ', 'T') + 'Z')
                  .toLocaleString('en-GB', {
                    timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  }) + ' TCT'
              : null
            const isBeingAdvanced = advancing === s.id
            return (
              <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div style={listRow}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px' }}>{factionName(s.faction_id)}</span>
                      <span style={{
                        fontSize: '11px', padding: '2px 10px', borderRadius: '20px',
                        background: isChain ? 'rgba(109,40,217,0.3)' : isEnlisting ? 'rgba(80,80,80,0.4)' : 'rgba(179,18,63,0.3)',
                        color: isChain ? '#9f67ff' : isEnlisting ? '#aaa' : '#e05577',
                        fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}>
                        {isChain ? 'Chain' : isEnlisting ? 'Enlisting' : 'War'}
                      </span>
                      {s.chain_target && (
                        <span style={{ fontSize: '12px', color: '#a1a1aa' }}>— {s.chain_target}</span>
                      )}
                      {s.opponent_faction_id && (
                        <a
                          href={`https://www.torn.com/factions.php?step=profile&ID=${s.opponent_faction_id}`}
                          target="_blank" rel="noreferrer"
                          style={{ fontSize: '12px', color: '#e05577', textDecoration: 'none' }}
                        >
                          vs {s.opponent_faction_name ? `${s.opponent_faction_name} #${s.opponent_faction_id}` : `#${s.opponent_faction_id}`}
                        </a>
                      )}
                    </div>
                    <div style={{ color: '#a1a1aa', fontSize: '13px', marginTop: '4px' }}>
                      {tct ?? 'Awaiting start time'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    {!isChain && isEnlisting && (
                      <button
                        onClick={() => isBeingAdvanced ? setAdvancing(null) : openAdvance(s.id)}
                        style={{
                          background: isBeingAdvanced ? 'rgba(109,40,217,0.25)' : 'rgba(179,18,63,0.15)',
                          border: isBeingAdvanced ? '1px solid rgba(109,40,217,0.4)' : '1px solid rgba(179,18,63,0.3)',
                          color: isBeingAdvanced ? '#9f67ff' : '#e05577',
                          borderRadius: '8px',
                          padding: '6px 14px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isBeingAdvanced ? 'Cancel' : '⚔ Go Active'}
                      </button>
                    )}
                    <button onClick={() => handleDelete(s.id)} style={deleteBtn}>Delete</button>
                  </div>
                </div>

                {/* Inline advance form */}
                {isBeingAdvanced && (
                  <div style={{
                    padding: '14px 16px',
                    background: 'rgba(109,40,217,0.08)',
                    border: '1px solid rgba(109,40,217,0.25)',
                    borderTop: 'none',
                    borderRadius: '0 0 10px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}>
                    <p style={{ margin: 0, fontSize: '12px', color: '#9f67ff', fontWeight: 600 }}>
                      Advance to Active — set war start time
                    </p>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#a1a1aa' }}>War start (TCT / UTC)</span>
                        <input
                          type="datetime-local"
                          value={advanceForm.scheduled_at}
                          onChange={(e) => setAdvanceForm(f => ({ ...f, scheduled_at: e.target.value }))}
                          style={{ ...inputStyle, width: 'auto' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#a1a1aa' }}>Opponent faction ID (optional)</span>
                        <input
                          type="number"
                          placeholder="e.g. 12345"
                          value={advanceForm.opponent_faction_id}
                          onChange={(e) => setAdvanceForm(f => ({ ...f, opponent_faction_id: e.target.value }))}
                          style={{ ...inputStyle, width: '160px' }}
                        />
                      </div>
                      <button
                        onClick={() => handleAdvance(s.id)}
                        disabled={advanceSaving}
                        style={{
                          padding: '10px 20px',
                          borderRadius: '10px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
                          color: '#f4f4f5',
                          fontWeight: 600,
                          fontSize: '13px',
                          cursor: advanceSaving ? 'not-allowed' : 'pointer',
                          opacity: advanceSaving ? 0.6 : 1,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {advanceSaving ? 'Saving…' : 'Confirm Active'}
                      </button>
                    </div>
                    {advanceError && <p style={{ margin: 0, fontSize: '12px', color: '#b3123f' }}>{advanceError}</p>}
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

// ─── Main tab ────────────────────────────────────────────────────────────────

export default function EventsSchedulesTab() {
  const token = localStorage.getItem('occultusSession')
  const [section, setSection] = useState('events')

  return (
    <div>
      <h2 className="font-cinzel mb-2" style={{ fontSize: '22px', color: '#f4f4f5' }}>
        Events & Schedules
      </h2>
      <p style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '24px' }}>
        Manage the member calendar and faction chain/war countdowns.
      </p>

      {/* Sub-navigation */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px' }}>
        {[{ id: 'events', label: 'Calendar Events' }, { id: 'schedules', label: 'Faction Schedules' }].map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            style={{
              padding: '7px 18px',
              borderRadius: '8px',
              border: section === s.id ? '1px solid rgba(179,18,63,0.5)' : '1px solid rgba(255,255,255,0.08)',
              background: section === s.id ? 'rgba(179,18,63,0.15)' : 'rgba(255,255,255,0.04)',
              color: section === s.id ? '#f4f4f5' : '#a1a1aa',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: section === s.id ? 600 : 400,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'events' && <EventsSection token={token} />}
      {section === 'schedules' && <SchedulesSection token={token} />}
    </div>
  )
}

// ─── Shared styles ───────────────────────────────────────────────────────────

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

const submitBtn = (disabled) => ({
  alignSelf: 'flex-start',
  padding: '10px 24px',
  borderRadius: '10px',
  border: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer',
  background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
  color: '#f4f4f5',
  fontWeight: 600,
  fontSize: '14px',
  opacity: disabled ? 0.6 : 1,
})

const listRow = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderRadius: '10px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.06)',
  gap: '16px',
}

const deleteBtn = {
  background: 'rgba(179,18,63,0.15)',
  border: '1px solid rgba(179,18,63,0.3)',
  color: '#b3123f',
  borderRadius: '8px',
  padding: '6px 14px',
  cursor: 'pointer',
  fontSize: '13px',
  whiteSpace: 'nowrap',
}
