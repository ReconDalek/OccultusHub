import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../../config/api'

const DURATION_OPTIONS = [1, 2, 3]

const FACTION_OPTIONS = [
  { id: 33097, label: 'Occultus' },
  { id: 9728,  label: 'Occul2us' },
  { id: 9171,  label: 'Occul3us' },
]

const EMPTY_FORM = {
  torn_user_id: '', discord_id: '', faction_id: 33097,
  amount: '', rate: '', duration_months: 1, member_profit_pct: '100',
  start_date: '', notes: '',
}

function daysLabel(days) {
  if (days < 0) return { text: 'Ended', color: '#a1a1aa' }
  if (days === 0) return { text: 'Ends today', color: '#ff6b8a' }
  if (days <= 7) return { text: `${days}d left`, color: '#f97316' }
  return { text: `${days}d left`, color: '#a1a1aa' }
}

function calcProfit(amount, rate, durationMonths) {
  return parseFloat(amount || 0) * (parseFloat(rate || 0) / 100) * (parseInt(durationMonths || 1) / 12)
}

function fmt(n) {
  if (!n && n !== 0) return '—'
  return `$${Math.round(n).toLocaleString()}`
}

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

  const sorted = [...investments].sort((a, b) => {
    if (a.tci_window_open !== b.tci_window_open) return b.tci_window_open - a.tci_window_open
    return a.days_until_end - b.days_until_end
  })

  const inputStyle = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#f4f4f5', borderRadius: '6px',
    padding: '6px 10px', fontSize: '13px', width: '100%',
  }

  // Live profit preview in form
  const formProfit = calcProfit(form.amount, form.rate, form.duration_months)
  const formMemberKeeps = formProfit * (parseFloat(form.member_profit_pct || 0) / 100)
  const formFactionIncome = formProfit - formMemberKeeps

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ color: '#f4f4f5', fontSize: '15px', fontWeight: '600', marginBottom: '2px' }}>Bank Investments</h3>
          <p style={{ color: '#a1a1aa', fontSize: '12px' }}>
            Track member bank investments. TCI should be purchased 7 days before the investment ends.
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

      {showForm && (
        <form onSubmit={handleCreate} style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '10px', padding: '16px', marginBottom: '20px',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', marginBottom: '12px' }}>
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
              <label style={{ color: '#a1a1aa', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Torn ID *</label>
              <input style={inputStyle} type="number" required placeholder="e.g. 123456" value={form.torn_user_id}
                onChange={e => setForm(f => ({ ...f, torn_user_id: e.target.value }))} />
            </div>
            <div>
              <label style={{ color: '#a1a1aa', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Discord ID</label>
              <input style={inputStyle} placeholder="Optional" value={form.discord_id}
                onChange={e => setForm(f => ({ ...f, discord_id: e.target.value }))} />
            </div>
            <div>
              <label style={{ color: '#a1a1aa', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Principal ($) *</label>
              <input style={inputStyle} type="number" step="0.01" required placeholder="0" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label style={{ color: '#a1a1aa', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Annual Rate (%) *</label>
              <input style={inputStyle} type="number" step="0.01" required placeholder="e.g. 10.5" value={form.rate}
                onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} />
            </div>
            <div>
              <label style={{ color: '#a1a1aa', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Duration *</label>
              <select style={inputStyle} value={form.duration_months}
                onChange={e => setForm(f => ({ ...f, duration_months: parseInt(e.target.value) }))}>
                {DURATION_OPTIONS.map(d => <option key={d} value={d} style={{ background: '#1a1a2e' }}>{d} month{d > 1 ? 's' : ''}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: '#a1a1aa', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Member Keeps (%) *</label>
              <input style={inputStyle} type="number" step="0.01" min="0" max="100" required placeholder="100" value={form.member_profit_pct}
                onChange={e => setForm(f => ({ ...f, member_profit_pct: e.target.value }))} />
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
          </div>

          {/* Profit preview */}
          {form.amount && form.rate && (
            <div style={{
              display: 'flex', gap: '16px', flexWrap: 'wrap',
              background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px 14px',
              marginBottom: '12px', fontSize: '12px',
            }}>
              <span style={{ color: '#a1a1aa' }}>Est. Profit: <span style={{ color: '#f4f4f5', fontWeight: '600' }}>{fmt(formProfit)}</span></span>
              <span style={{ color: '#a1a1aa' }}>Member keeps: <span style={{ color: '#f4f4f5', fontWeight: '600' }}>{fmt(formMemberKeeps)}</span></span>
              <span style={{ color: '#a1a1aa' }}>Faction income: <span style={{ color: '#f4f4f5', fontWeight: '600' }}>{fmt(formFactionIncome)}</span></span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" disabled={saving} style={{
              background: 'linear-gradient(135deg, #b3123f, #6d28d9)', border: 'none',
              borderRadius: '8px', color: '#f4f4f5', padding: '8px 20px',
              fontSize: '13px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p style={{ color: '#a1a1aa', fontSize: '13px' }}>Loading…</p>
      ) : sorted.length === 0 ? (
        <p style={{ color: '#a1a1aa', fontSize: '13px' }}>No active investments recorded.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr>
                {['Member', 'Principal', 'Rate', 'Duration', 'Profit', 'Member Keeps', 'Faction Income', 'End', 'Days Left', 'TCI Purchased', 'TCI Received', ''].map(h => (
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
                    {/* Member */}
                    <td style={{ padding: '10px', color: '#f4f4f5', fontSize: '13px' }}>
                      {isEditing ? (
                        <input style={{ ...inputStyle, width: '100px' }} placeholder="Discord ID"
                          value={editForm.discord_id ?? inv.discord_id ?? ''}
                          onChange={e => setEditForm(f => ({ ...f, discord_id: e.target.value }))} />
                      ) : (
                        <>
                          <div style={{ fontWeight: '500', color: '#a1a1aa', fontSize: '11px' }}>#{inv.torn_user_id}</div>
                          {inv.discord_id && <div style={{ fontSize: '11px', color: '#71717a' }}>{inv.discord_id}</div>}
                          {factionId == null && inv.faction_id && (
                            <div style={{ color: '#6d28d9', fontSize: '10px', marginTop: '2px' }}>
                              {FACTION_OPTIONS.find(f => f.id === inv.faction_id)?.label ?? `#${inv.faction_id}`}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    {/* Principal */}
                    <td style={{ padding: '10px', color: '#f4f4f5', fontSize: '13px' }}>
                      {isEditing ? (
                        <input style={{ ...inputStyle, width: '90px' }} type="number" step="0.01"
                          value={editForm.amount ?? inv.amount}
                          onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
                      ) : fmt(inv.amount)}
                    </td>
                    {/* Rate */}
                    <td style={{ padding: '10px', color: '#a1a1aa', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <input style={{ ...inputStyle, width: '70px' }} type="number" step="0.01"
                          value={editForm.rate ?? inv.rate}
                          onChange={e => setEditForm(f => ({ ...f, rate: e.target.value }))} />
                      ) : `${inv.rate}%`}
                    </td>
                    {/* Duration */}
                    <td style={{ padding: '10px', color: '#a1a1aa', fontSize: '13px' }}>
                      {isEditing ? (
                        <select style={{ ...inputStyle, width: '80px' }}
                          value={editForm.duration_months ?? inv.duration_months}
                          onChange={e => setEditForm(f => ({ ...f, duration_months: parseInt(e.target.value) }))}>
                          {DURATION_OPTIONS.map(d => <option key={d} value={d} style={{ background: '#1a1a2e' }}>{d}mo</option>)}
                        </select>
                      ) : `${inv.duration_months}mo`}
                    </td>
                    {/* Profit */}
                    <td style={{ padding: '10px', color: '#f4f4f5', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {fmt(inv.profit)}
                    </td>
                    {/* Member keeps */}
                    <td style={{ padding: '10px', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <input style={{ ...inputStyle, width: '60px' }} type="number" step="0.01" min="0" max="100"
                          value={editForm.member_profit_pct ?? inv.member_profit_pct}
                          onChange={e => setEditForm(f => ({ ...f, member_profit_pct: e.target.value }))} />
                      ) : (
                        <span style={{ color: '#f4f4f5' }}>
                          {fmt(inv.member_keeps)}
                          <span style={{ color: '#52525b', fontSize: '10px', marginLeft: '4px' }}>{inv.member_profit_pct}%</span>
                        </span>
                      )}
                    </td>
                    {/* Faction income */}
                    <td style={{ padding: '10px', color: '#f4f4f5', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {fmt(inv.faction_income)}
                    </td>
                    {/* End */}
                    <td style={{ padding: '10px', color: '#a1a1aa', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <input style={{ ...inputStyle, width: '120px' }} type="date"
                          value={editForm.start_date ?? inv.start_date}
                          onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} />
                      ) : inv.end_date}
                    </td>
                    {/* Days left */}
                    <td style={{ padding: '10px', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      <span style={{ color: dl.color, fontWeight: inv.days_until_end <= 7 && inv.days_until_end >= 0 ? '600' : '400' }}>{dl.text}</span>
                    </td>
                    {/* TCI purchased */}
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <Checkbox checked={!!inv.tci_purchased} onChange={() => handleToggle(inv, 'tci_purchased')} color="#f97316"
                        title={inv.tci_purchased && inv.tci_purchased_at ? `Purchased ${inv.tci_purchased_at}` : 'Mark TCI as purchased'} />
                    </td>
                    {/* TCI received */}
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <Checkbox checked={!!inv.tci_received} onChange={() => handleToggle(inv, 'tci_received')} color="#22c55e"
                        title="Mark TCI as received by member" />
                    </td>
                    {/* Actions */}
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
    <button onClick={onChange} title={title} style={{
      width: '22px', height: '22px', borderRadius: '4px',
      border: `2px solid ${checked ? color : 'rgba(255,255,255,0.2)'}`,
      background: checked ? color + '33' : 'transparent',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s',
    }}>
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
