import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../../config/api'

const FREQ_OPTIONS = ['4-weekly', 'monthly']

const EMPTY_FORM = {
  torn_user_id: '', username: '', stock_acronym: '', stock_name: '',
  tier: '', payout_item: '', payout_frequency: '4-weekly',
  item_value: '', member_portion_pct: '100', notes: '',
}

function currentPeriodLabel() {
  const now = new Date()
  return now.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}

export default function StocksSubTab({ factionId }) {
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [collectingId, setCollectingId] = useState(null)
  const [collectForm, setCollectForm] = useState({ period_label: currentPeriodLabel(), amount_paid: '', notes: '' })

  const token = localStorage.getItem('occultusSession')

  const fetchStocks = useCallback(() => {
    setLoading(true)
    fetch(`${API_BASE_URL}/api/leadership/accounting/stocks?faction_id=${factionId}`, {
      headers: { Authorization: token },
    })
      .then(r => r.json())
      .then(d => { setStocks(d.stocks || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [factionId, token])

  useEffect(() => {
    fetchStocks()
    setShowForm(false)
    setEditingId(null)
    setExpandedId(null)
  }, [fetchStocks])

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    await fetch(`${API_BASE_URL}/api/leadership/accounting/stocks`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, faction_id: factionId }),
    })
    setSaving(false)
    setShowForm(false)
    setForm(EMPTY_FORM)
    fetchStocks()
  }

  async function handleSaveEdit(id) {
    await fetch(`${API_BASE_URL}/api/leadership/accounting/stocks/${id}`, {
      method: 'PUT',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setEditingId(null)
    fetchStocks()
  }

  async function handleArchive(id) {
    if (!confirm('Remove this stock entry?')) return
    await fetch(`${API_BASE_URL}/api/leadership/accounting/stocks/${id}`, {
      method: 'DELETE',
      headers: { Authorization: token },
    })
    fetchStocks()
  }

  async function handleLogCollection(stockId) {
    await fetch(`${API_BASE_URL}/api/leadership/accounting/stocks/${stockId}/collect`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(collectForm),
    })
    setCollectingId(null)
    setCollectForm({ period_label: currentPeriodLabel(), amount_paid: '', notes: '' })
    fetchStocks()
  }

  async function handleDeleteCollection(collId) {
    if (!confirm('Remove this collection record?')) return
    await fetch(`${API_BASE_URL}/api/leadership/accounting/collections/${collId}`, {
      method: 'DELETE',
      headers: { Authorization: token },
    })
    fetchStocks()
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#f4f4f5',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '13px',
    width: '100%',
  }

  function factionPaymentPreview() {
    const val = parseFloat(form.item_value || 0)
    const pct = parseFloat(form.member_portion_pct || 100)
    const fp = val * ((100 - pct) / 100)
    return fp > 0 ? `£${fp.toLocaleString(undefined, { maximumFractionDigits: 0 })} / period to faction` : null
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ color: '#f4f4f5', fontSize: '15px', fontWeight: '600', marginBottom: '2px' }}>Stock Scheme</h3>
          <p style={{ color: '#a1a1aa', fontSize: '12px' }}>
            Members hold Torn stocks on behalf of the faction. Track their stock, tier, payout details, and log periodic payments.
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
          {showForm ? '✕ Cancel' : '+ Add Member'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleCreate} style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '10px', padding: '16px', marginBottom: '20px',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={labelStyle}>User ID *</label>
              <input style={inputStyle} type="number" required placeholder="Torn ID" value={form.torn_user_id}
                onChange={e => setForm(f => ({ ...f, torn_user_id: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Username</label>
              <input style={inputStyle} placeholder="Display name" value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Stock *</label>
              <input style={inputStyle} placeholder="e.g. TCI" value={form.stock_acronym}
                onChange={e => setForm(f => ({ ...f, stock_acronym: e.target.value }))} required />
            </div>
            <div>
              <label style={labelStyle}>Full Name</label>
              <input style={inputStyle} placeholder="e.g. Torn City Investments" value={form.stock_name}
                onChange={e => setForm(f => ({ ...f, stock_name: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Tier</label>
              <input style={inputStyle} type="number" min="1" max="10" placeholder="1–10" value={form.tier}
                onChange={e => setForm(f => ({ ...f, tier: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Payout Item</label>
              <input style={inputStyle} placeholder="Item name" value={form.payout_item}
                onChange={e => setForm(f => ({ ...f, payout_item: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Frequency</label>
              <select style={inputStyle} value={form.payout_frequency}
                onChange={e => setForm(f => ({ ...f, payout_frequency: e.target.value }))}>
                {FREQ_OPTIONS.map(o => <option key={o} value={o} style={{ background: '#1a1a2e' }}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Item Value (£)</label>
              <input style={inputStyle} type="number" step="0.01" placeholder="0" value={form.item_value}
                onChange={e => setForm(f => ({ ...f, item_value: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Member Keeps (%)</label>
              <input style={inputStyle} type="number" min="0" max="100" step="0.01" placeholder="100" value={form.member_portion_pct}
                onChange={e => setForm(f => ({ ...f, member_portion_pct: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <input style={inputStyle} placeholder="Optional" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          {factionPaymentPreview() && (
            <p style={{ color: '#9f67ff', fontSize: '12px', marginBottom: '10px' }}>
              Faction receives: {factionPaymentPreview()}
            </p>
          )}
          <button type="submit" disabled={saving} style={{
            background: 'linear-gradient(135deg, #b3123f, #6d28d9)', border: 'none',
            borderRadius: '8px', color: '#f4f4f5', padding: '8px 20px',
            fontSize: '13px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
          }}>
            {saving ? 'Saving…' : 'Save Entry'}
          </button>
        </form>
      )}

      {/* Stock entries */}
      {loading ? (
        <p style={{ color: '#a1a1aa', fontSize: '13px' }}>Loading…</p>
      ) : stocks.length === 0 ? (
        <p style={{ color: '#a1a1aa', fontSize: '13px' }}>No stock scheme members recorded.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {stocks.map(s => {
            const isEditing = editingId === s.id
            const isExpanded = expandedId === s.id
            const isCollecting = collectingId === s.id
            const lastColl = s.collections?.[0]

            return (
              <div key={s.id} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px', overflow: 'hidden',
              }}>
                {/* Main row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px 80px 110px 110px 100px auto',
                  gap: '8px', alignItems: 'center',
                  padding: '12px 16px',
                }}>
                  {/* Member */}
                  <div>
                    {isEditing ? (
                      <input style={{ ...inputStyle, width: '120px' }} value={editForm.username ?? s.username ?? ''}
                        onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} />
                    ) : (
                      <>
                        <div style={{ color: '#f4f4f5', fontWeight: '500', fontSize: '13px' }}>{s.username || '—'}</div>
                        <div style={{ color: '#a1a1aa', fontSize: '11px' }}>#{s.torn_user_id}</div>
                      </>
                    )}
                  </div>

                  {/* Stock */}
                  <div>
                    {isEditing ? (
                      <input style={{ ...inputStyle, width: '70px' }} value={editForm.stock_acronym ?? s.stock_acronym}
                        onChange={e => setEditForm(f => ({ ...f, stock_acronym: e.target.value }))} />
                    ) : (
                      <>
                        <div style={{ color: '#9f67ff', fontWeight: '600', fontSize: '13px' }}>{s.stock_acronym}</div>
                        {s.tier && <div style={{ color: '#a1a1aa', fontSize: '11px' }}>Tier {s.tier}</div>}
                      </>
                    )}
                  </div>

                  {/* Payout item */}
                  <div style={{ color: '#a1a1aa', fontSize: '12px' }}>
                    {isEditing ? (
                      <input style={{ ...inputStyle, width: '80px' }} value={editForm.payout_item ?? s.payout_item ?? ''}
                        onChange={e => setEditForm(f => ({ ...f, payout_item: e.target.value }))} />
                    ) : (s.payout_item || '—')}
                  </div>

                  {/* Item value */}
                  <div style={{ fontSize: '12px' }}>
                    {isEditing ? (
                      <input style={{ ...inputStyle, width: '90px' }} type="number" step="0.01" value={editForm.item_value ?? s.item_value}
                        onChange={e => setEditForm(f => ({ ...f, item_value: e.target.value }))} />
                    ) : (
                      <>
                        <div style={{ color: '#f4f4f5' }}>£{s.item_value.toLocaleString()}</div>
                        <div style={{ color: '#a1a1aa' }}>{s.member_portion_pct}% kept</div>
                      </>
                    )}
                  </div>

                  {/* Faction payment */}
                  <div>
                    <div style={{ color: '#22c55e', fontSize: '13px', fontWeight: '600' }}>
                      £{Math.round(s.faction_payment).toLocaleString()}
                    </div>
                    <div style={{ color: '#a1a1aa', fontSize: '11px' }}>/ {s.payout_frequency}</div>
                  </div>

                  {/* Last collected */}
                  <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
                    {lastColl ? (
                      <>
                        <div>Last: {lastColl.period_label}</div>
                        <div>£{lastColl.amount_paid.toLocaleString()}</div>
                      </>
                    ) : <div>No payments</div>}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap' }}>
                    {isEditing ? (
                      <>
                        <ActionBtn onClick={() => handleSaveEdit(s.id)} color="#22c55e">✓</ActionBtn>
                        <ActionBtn onClick={() => setEditingId(null)} color="#a1a1aa">✕</ActionBtn>
                      </>
                    ) : (
                      <>
                        <ActionBtn onClick={() => setExpandedId(isExpanded ? null : s.id)} color="#60a5fa">
                          {isExpanded ? '▲' : '▼'}
                        </ActionBtn>
                        <ActionBtn onClick={() => { setCollectingId(isCollecting ? null : s.id); setCollectForm({ period_label: currentPeriodLabel(), amount_paid: String(Math.round(s.faction_payment)), notes: '' }) }} color="#22c55e">£</ActionBtn>
                        <ActionBtn onClick={() => { setEditingId(s.id); setEditForm({}) }} color="#6d28d9">✎</ActionBtn>
                        <ActionBtn onClick={() => handleArchive(s.id)} color="#b3123f">✕</ActionBtn>
                      </>
                    )}
                  </div>
                </div>

                {/* Log collection form */}
                {isCollecting && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px', background: 'rgba(34,197,94,0.05)' }}>
                    <p style={{ color: '#22c55e', fontSize: '12px', marginBottom: '8px', fontWeight: '600' }}>Log Payment Collection</p>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div>
                        <label style={labelStyle}>Period</label>
                        <input style={{ ...inputStyle, width: '130px' }} value={collectForm.period_label}
                          onChange={e => setCollectForm(f => ({ ...f, period_label: e.target.value }))} />
                      </div>
                      <div>
                        <label style={labelStyle}>Amount Paid (£)</label>
                        <input style={{ ...inputStyle, width: '100px' }} type="number" step="0.01" value={collectForm.amount_paid}
                          onChange={e => setCollectForm(f => ({ ...f, amount_paid: e.target.value }))} />
                      </div>
                      <div>
                        <label style={labelStyle}>Notes</label>
                        <input style={{ ...inputStyle, width: '150px' }} value={collectForm.notes}
                          onChange={e => setCollectForm(f => ({ ...f, notes: e.target.value }))} />
                      </div>
                      <button onClick={() => handleLogCollection(s.id)} style={{
                        background: '#22c55e22', border: '1px solid #22c55e44', borderRadius: '6px',
                        color: '#22c55e', padding: '6px 14px', fontSize: '12px', cursor: 'pointer',
                      }}>Record</button>
                      <button onClick={() => setCollectingId(null)} style={{
                        background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
                        color: '#a1a1aa', padding: '6px 10px', fontSize: '12px', cursor: 'pointer',
                      }}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Collections history */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px' }}>
                    <p style={{ color: '#a1a1aa', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                      Payment History
                    </p>
                    {s.stock_name && (
                      <p style={{ color: '#6d28d9', fontSize: '12px', marginBottom: '8px' }}>{s.stock_name}</p>
                    )}
                    {s.notes && (
                      <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '8px', fontStyle: 'italic' }}>{s.notes}</p>
                    )}
                    {s.collections.length === 0 ? (
                      <p style={{ color: '#a1a1aa', fontSize: '12px' }}>No payments logged yet.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {s.collections.map(c => (
                          <div key={c.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '6px 10px',
                          }}>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                              <span style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '500' }}>{c.period_label}</span>
                              <span style={{ color: '#22c55e', fontSize: '13px' }}>£{parseFloat(c.amount_paid).toLocaleString()}</span>
                              {c.notes && <span style={{ color: '#a1a1aa', fontSize: '12px' }}>{c.notes}</span>}
                            </div>
                            <button onClick={() => handleDeleteCollection(c.id)} style={{
                              background: 'transparent', border: 'none', color: '#a1a1aa',
                              cursor: 'pointer', fontSize: '12px', padding: '2px 6px',
                              borderRadius: '4px', transition: 'color 0.15s',
                            }}
                              onMouseEnter={e => e.currentTarget.style.color = '#ff6b8a'}
                              onMouseLeave={e => e.currentTarget.style.color = '#a1a1aa'}
                            >✕</button>
                          </div>
                        ))}
                      </div>
                    )}
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

const labelStyle = { color: '#a1a1aa', fontSize: '11px', display: 'block', marginBottom: '4px' }

function ActionBtn({ onClick, color, children }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', border: `1px solid ${color}44`,
      borderRadius: '5px', color, padding: '3px 7px', fontSize: '12px',
      cursor: 'pointer', transition: 'background 0.15s', whiteSpace: 'nowrap',
    }}
      onMouseEnter={e => e.currentTarget.style.background = color + '22'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >{children}</button>
  )
}
