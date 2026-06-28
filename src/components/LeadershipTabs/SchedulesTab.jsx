import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

const FACTIONS = [
  { id: 33097, name: 'Occultus' },
  { id: 9728, name: 'Occul2us' },
  { id: 9171, name: 'Occul3us' },
]

export default function SchedulesTab() {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ faction_id: 33097, type: 'chain', scheduled_at: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const token = localStorage.getItem('occultusSession')

  const fetchSchedules = () => {
    fetch(`${API_BASE_URL}/api/faction-schedules`, { headers: { Authorization: token } })
      .then((r) => r.json())
      .then((data) => { setSchedules(data.schedules || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(fetchSchedules, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.scheduled_at) { setError('Date and time are required.'); return }
    setSaving(true)
    setError('')
    try {
      // Treat the datetime-local value as UTC
      const utcDate = new Date(form.scheduled_at + 'Z').toISOString()
      const res = await fetch(`${API_BASE_URL}/api/leadership/faction-schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ faction_id: Number(form.faction_id), type: form.type, scheduled_at: utcDate }),
      })
      if (!res.ok) throw new Error()
      setForm({ faction_id: 33097, type: 'chain', scheduled_at: '' })
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

  const factionName = (id) => FACTIONS.find((f) => f.id === Number(id))?.name ?? id

  return (
    <div>
      <h2 className="font-cinzel mb-2" style={{ fontSize: '22px', color: '#f4f4f5' }}>
        Faction Schedules
      </h2>
      <p style={{ color: "var(--text-secondary)", fontSize: '14px', marginBottom: '28px' }}>
        Schedule upcoming chain or war events per faction. The next one will display as a live countdown on the member home.
      </p>

      {/* Create form */}
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px', maxWidth: '480px' }}>
        <select
          value={form.faction_id}
          onChange={(e) => setForm({ ...form, faction_id: e.target.value })}
          style={inputStyle}
        >
          {FACTIONS.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>

        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          style={inputStyle}
        >
          <option value="chain">⛓ Chain</option>
          <option value="war">⚔ War</option>
        </select>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <input
            type="datetime-local"
            value={form.scheduled_at}
            onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
            style={inputStyle}
          />
          <span style={{ color: "var(--text-secondary)", fontSize: '11px' }}>Enter time in TCT (UTC) — your browser may display local time</span>
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
          {saving ? 'Scheduling…' : 'Add Schedule'}
        </button>
      </form>

      {/* Schedules list */}
      {loading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: '14px' }}>Loading…</p>
      ) : schedules.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", fontSize: '14px' }}>No upcoming schedules.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {schedules.map((s) => {
            const isChain = s.type === 'chain'
            const tct = new Date(s.scheduled_at).toLocaleString('en-GB', {
              timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })
            return (
              <div
                key={s.id}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{factionName(s.faction_id)}</span>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 10px',
                        borderRadius: '20px',
                        background: isChain ? 'rgba(109,40,217,0.3)' : 'rgba(179,18,63,0.3)',
                        color: isChain ? '#9f67ff' : '#b3123f',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {isChain ? 'Chain' : 'War'}
                    </span>
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontSize: '13px', marginTop: '4px' }}>{tct} TCT</div>
                </div>
                <button
                  onClick={() => handleDelete(s.id)}
                  style={{ background: 'rgba(179,18,63,0.15)', border: '1px solid rgba(179,18,63,0.3)', color: '#b3123f', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}
                >
                  Delete
                </button>
              </div>
            )
          })}
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
