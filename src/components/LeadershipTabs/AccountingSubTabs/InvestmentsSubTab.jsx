import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../../config/api'

const DURATION_OPTIONS = [1, 2, 3]

function daysLabel(days) {
  if (days < 0) return { text: 'Ended', color: '#a1a1aa' }
  if (days === 0) return { text: 'Ends today', color: '#ff6b8a' }
  if (days <= 7) return { text: `${days}d left`, color: '#f97316' }
  return { text: `${days}d left`, color: '#a1a1aa' }
}

const FACTION_OPTIONS = [
  { id: 33097, label: 'Occultus' },
  { id: 9728,  label: 'Occul2us' },
  { id: 9171,  label: 'Occul3us' },
]

const EMPTY_FORM = { torn_user_id: '', username: '', faction_id: 33097, amount: '', duration_months: 1, start_date: '', notes: '' }

export default function InvestmentsSubTab({ factionId }) {
  const [investments, setInvestments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const token = localStorage.getItem('occultusSession')

  const fetchInvestments = useCallback(() => {
    setLoading(true)
    const qs = factionId != null ? `?faction_id=${factionId}` : ''
    fetch(`${API_BASE_URL}/api/leadership/accounting/investments${qs}`, {
      headers: { Authorization: token },
    })
      .then(r => r.json())
      .then(d => { setInvestments(d.investments || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [factionId, token])

  useEffect(() => {
    fetchInvestments()
    setShowForm(false)
    setEditingId(null)
  }, [fetchInvestments])

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    await fetch(`${API_BASE_URL}/api/leadership/accounting/investments`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, faction_id: factionId ?? form.faction_id }),
    })
    setSaving(false)
    setShowForm(false)
    setForm(EMPTY_FORM)
    fetchInvestments()
  }

  async function handleToggle(inv, field) {
    const newVal = inv[field] ? 0 : 1
    await fetch(`${API_BASE_URL}/api/leadership/accounting/investments/${inv.id}`, {
      method: 'PUT',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: newVal }),
    })
    fetchInvestments()
  }

  async function handleSaveEdit(id) {
    await fetch(`${API_BASE_URL}/api/leadership/accounting/investments/${id}`, {
      method: 'PUT',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setEditingId(null)
    fetchInvestments()
  }

  async function handleArchive(id) {
    if (!confirm('Remove this investment entry?')) return
    await fetch(`${API_BASE_URL}/api/leadership/accounting/investments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: token },
    })
    fetchInvestments()
  }

  // Sort: TCI window first, then by days remaining
  const sorted = [...investments].sort((a, b) => {
    if (a.tci_window_open !== b.tci_window_open) return b.tci_window_open - a.tci_window_open
    return a.days_until_end - b.days_until_end
  })

  const inputStyle = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#f4f4f5',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '13px',
    width: '100%',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ color: '#f4f4f5', fontSize: '15px', fontWeight: '600', marginBottom: '2px' }}>Bank Investments</h3>
          <p style={{ color: '#a1a1aa', fontSize: '12px' }}>
            Track member investments. TCI should be purchased 7 days before the investment ends to maximise payout.
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            background: showForm ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #b3123f, #6d28d9)',
            border: 'none', borderRadius: '8px', color: '#f4f4f5', padding: '8px 14px',
            fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {showForm ? '✕ Cancel' : '+ Add Investment'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleCreate} style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '10px', padding: '16px', marginBottom: '20px',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px',
        }}>
          {factionId == null && (
            <div>
              <label style={{ color: '#a1a1aa', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Faction *</label>
              <select style={inputStyle} value={form.faction_id}
                onChange={e => setForm(f => ({ ...f, faction_id: parseInt(e.target.value) }))}>
                {FACTION_OPTIONS.map(o => <option key={o.id} value={o.id} style={{ background: '#1a1a2e' }}>{o.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={{ color: '#a1a1aa', fontSize: '11px', display: 'block', marginBottom: '4px' }}>User ID *</label>
            <input style={inputStyle} type="number" required placeholder="Torn ID" value={form.torn_user_id}
              onChange={e => setForm(f => ({ ...f, torn_user_id: e.target.value }))} />
          </div>
          <div>
            <label style={{ color: '#a1a1aa', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Username</label>
            <input style={inputStyle} placeholder="Display name" value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
          </div>
          <div>
            <label style={{ color: '#a1a1aa', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Amount (£) *</label>
            <input style={inputStyle} type="number" step="0.01" required placeholder="0" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <label style={{ color: '#a1a1aa', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Duration *</label>
            <select style={inputStyle} value={form.duration_months}
              onChange={e => setForm(f => ({ ...f, duration_months: parseInt(e.target.value) }))}>
              {DURATION_OPTIONS.map(d => <option key={d} value={d} style={{ background: '#1a1a2e' }}>{d} month{d > 1 ? 's' : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: '#a1a1aa', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Start Date *</label>
            <input style={inputStyle} type="date" required value={form.start_date}
              onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
          </div>
          <div>
            <label style={{ color: '#a1a1aa', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Notes</label>
            <input style={inputStyle} placeholder="Optional" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" disabled={saving} style={{
              background: 'linear-gradient(135deg, #b3123f, #6d28d9)', border: 'none',
              borderRadius: '8px', color: '#f4f4f5', padding: '8px 16px',
              fontSize: '13px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              width: '100%',
            }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      {loading ? (
        <p style={{ color: '#a1a1aa', fontSize: '13px' }}>Loading…</p>
      ) : sorted.length === 0 ? (
        <p style={{ color: '#a1a1aa', fontSize: '13px' }}>No active investments recorded.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr>
                {['Member', 'Amount', 'Duration', 'Start', 'End', 'Days Left', 'TCI Purchased', 'TCI Received', ''].map(h => (
                  <th key={h} style={{ color: '#a1a1aa', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(inv => {
                const dl = daysLabel(inv.days_until_end)
                const isEditing = editingId === inv.id
                return (
                  <tr key={inv.id} style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: inv.tci_window_open && !inv.tci_purchased ? 'rgba(249,115,22,0.06)' : 'transparent',
                  }}>
                    <td style={{ padding: '10px', color: '#f4f4f5', fontSize: '13px' }}>
                      {isEditing ? (
                        <input style={{ ...inputStyle, width: '100px' }} value={editForm.username ?? inv.username ?? ''}
                          onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} />
                      ) : (
                        <>
                          <div style={{ fontWeight: '500' }}>{inv.username || '—'}</div>
                          <div style={{ color: '#a1a1aa', fontSize: '11px' }}>
                            #{inv.torn_user_id}
                            {factionId == null && inv.faction_id && (
                              <span style={{ marginLeft: '6px', color: '#6d28d9', fontSize: '10px' }}>
                                {FACTION_OPTIONS.find(f => f.id === inv.faction_id)?.label ?? `#${inv.faction_id}`}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </td>
                    <td style={{ padding: '10px', color: '#f4f4f5', fontSize: '13px' }}>
                      {isEditing ? (
                        <input style={{ ...inputStyle, width: '90px' }} type="number" step="0.01" value={editForm.amount ?? inv.amount}
                          onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
                      ) : `£${inv.amount.toLocaleString()}`}
                    </td>
                    <td style={{ padding: '10px', color: '#a1a1aa', fontSize: '13px' }}>
                      {isEditing ? (
                        <select style={{ ...inputStyle, width: '90px' }} value={editForm.duration_months ?? inv.duration_months}
                          onChange={e => setEditForm(f => ({ ...f, duration_months: parseInt(e.target.value) }))}>
                          {DURATION_OPTIONS.map(d => <option key={d} value={d} style={{ background: '#1a1a2e' }}>{d}mo</option>)}
                        </select>
                      ) : `${inv.duration_months} month${inv.duration_months > 1 ? 's' : ''}`}
                    </td>
                    <td style={{ padding: '10px', color: '#a1a1aa', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <input style={{ ...inputStyle, width: '120px' }} type="date" value={editForm.start_date ?? inv.start_date}
                          onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} />
                      ) : inv.start_date}
                    </td>
                    <td style={{ padding: '10px', color: '#a1a1aa', fontSize: '13px', whiteSpace: 'nowrap' }}>{inv.end_date}</td>
                    <td style={{ padding: '10px', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      <span style={{ color: dl.color, fontWeight: inv.days_until_end <= 7 && inv.days_until_end >= 0 ? '600' : '400' }}>{dl.text}</span>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <Checkbox
                        checked={!!inv.tci_purchased}
                        onChange={() => handleToggle(inv, 'tci_purchased')}
                        color="#f97316"
                        title={inv.tci_purchased && inv.tci_purchased_at ? `Purchased ${inv.tci_purchased_at}` : 'Mark TCI as purchased'}
                      />
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <Checkbox
                        checked={!!inv.tci_received}
                        onChange={() => handleToggle(inv, 'tci_received')}
                        color="#22c55e"
                        title="Mark TCI as received by member"
                      />
                    </td>
                    <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <ActionBtn onClick={() => handleSaveEdit(inv.id)} color="#22c55e">✓</ActionBtn>
                          <ActionBtn onClick={() => setEditingId(null)} color="#a1a1aa">✕</ActionBtn>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <ActionBtn onClick={() => { setEditingId(inv.id); setEditForm({}) }} color="#6d28d9">✎</ActionBtn>
                          <ActionBtn onClick={() => handleArchive(inv.id)} color="#b3123f">✕</ActionBtn>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Checkbox({ checked, onChange, color, title }) {
  return (
    <button
      onClick={onChange}
      title={title}
      style={{
        width: '22px', height: '22px', borderRadius: '4px',
        border: `2px solid ${checked ? color : 'rgba(255,255,255,0.2)'}`,
        background: checked ? color + '33' : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      {checked && <span style={{ color, fontSize: '12px', lineHeight: 1 }}>✓</span>}
    </button>
  )
}

function ActionBtn({ onClick, color, children }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', border: `1px solid ${color}44`,
      borderRadius: '5px', color, padding: '3px 8px', fontSize: '12px',
      cursor: 'pointer', transition: 'background 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.background = color + '22'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >{children}</button>
  )
}
