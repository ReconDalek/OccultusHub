import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../../config/api'

const FACTION_OPTIONS = [
  { id: 33097, label: 'Occultus' },
  { id: 9728,  label: 'Occul2us' },
  { id: 9171,  label: 'Occul3us' },
]

const TORN_STOCKS = [
  'AAB', 'ACC', 'BAM', 'BCRX', 'BFG', 'CAP', 'CNC', 'EWM', 'FAN',
  'GRN', 'HRG', 'IIL', 'LSC', 'MCAM', 'MCS', 'MSG', 'MWM', 'OMX',
  'PRN', 'SHD', 'TCSE', 'TCTE', 'TORN', 'TRN', 'WLT', 'YAZ',
]

const TIER_OPTIONS = [1, 2, 3]
const FREQ_OPTIONS = [
  { value: '7-day',  label: '7 days' },
  { value: '28-day', label: '28 days' },
]

const EMPTY_FORM = {
  torn_user_id: '', discord_id: '', faction_id: 33097,
  stock_acronym: 'TORN', tier: 1, payout_frequency: '28-day',
  member_keeps_amount: '', notes: '',
}

function currentPeriodLabel() {
  const now = new Date()
  return now.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}

function payoutsPerMonth(freq) {
  return freq === '7-day' ? (28 / 7) : 1
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
  const [collectForm, setCollectForm] = useState({ period_label: '', amount_paid: '', notes: '' })

  const token = localStorage.getItem('occultusSession')

  const fetchStocks = useCallback(() => {
    setLoading(true)
    const qs = factionId != null ? `?faction_id=${factionId}` : ''
    fetch(`${API_BASE_URL}/api/leadership/accounting/stocks${qs}`, {
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
  }, [fetchStocks])

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    await fetch(`${API_BASE_URL}/api/leadership/accounting/stocks`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, faction_id: factionId ?? form.faction_id }),
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
    fetchStocks()
  }

  async function handleDeleteCollection(collId) {
    if (!confirm('Delete this collection record?')) return
    await fetch(`${API_BASE_URL}/api/leadership/accounting/collections/${collId}`, {
      method: 'DELETE',
      headers: { Authorization: token },
    })
    fetchStocks()
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#f4f4f5', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', width: '100%',
  }
  const labelStyle = { color: '#a1a1aa', fontSize: '11px', display: 'block', marginBottom: '4px' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ color: '#f4f4f5', fontSize: '15px', fontWeight: '600', marginBottom: '2px' }}>Stock Scheme</h3>
          <p style={{ color: '#a1a1aa', fontSize: '12px' }}>
            Track members in the stock scheme and log faction payments.
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

      {showForm && (
        <form onSubmit={handleCreate} style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '10px', padding: '16px', marginBottom: '20px',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '12px' }}>
            {factionId == null && (
              <div>
                <label style={labelStyle}>Faction *</label>
                <select style={inputStyle} value={form.faction_id}
                  onChange={e => setForm(f => ({ ...f, faction_id: parseInt(e.target.value) }))}>
                  {FACTION_OPTIONS.map(o => <option key={o.id} value={o.id} style={{ background: '#1a1a2e' }}>{o.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={labelStyle}>Torn ID *</label>
              <input style={inputStyle} type="number" required placeholder="e.g. 123456" value={form.torn_user_id}
                onChange={e => setForm(f => ({ ...f, torn_user_id: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Discord ID</label>
              <input style={inputStyle} placeholder="Optional" value={form.discord_id}
                onChange={e => setForm(f => ({ ...f, discord_id: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Stock *</label>
              <select style={inputStyle} value={form.stock_acronym}
                onChange={e => setForm(f => ({ ...f, stock_acronym: e.target.value }))}>
                {TORN_STOCKS.map(s => <option key={s} value={s} style={{ background: '#1a1a2e' }}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Tier *</label>
              <select style={inputStyle} value={form.tier}
                onChange={e => setForm(f => ({ ...f, tier: parseInt(e.target.value) }))}>
                {TIER_OPTIONS.map(t => <option key={t} value={t} style={{ background: '#1a1a2e' }}>Tier {t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Payout Frequency *</label>
              <select style={inputStyle} value={form.payout_frequency}
                onChange={e => setForm(f => ({ ...f, payout_frequency: e.target.value }))}>
                {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ background: '#1a1a2e' }}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Member Keeps ($)</label>
              <input style={inputStyle} type="number" step="0.01" min="0" placeholder="0" value={form.member_keeps_amount}
                onChange={e => setForm(f => ({ ...f, member_keeps_amount: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <input style={inputStyle} placeholder="Optional" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
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
      ) : stocks.length === 0 ? (
        <p style={{ color: '#a1a1aa', fontSize: '13px' }}>No stock scheme members recorded.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {stocks.map(s => {
            const isExpanded = expandedId === s.id
            const isEditing = editingId === s.id
            const isCollecting = collectingId === s.id
            const perMonth = payoutsPerMonth(s.payout_frequency)
            const keepPerMonth = (s.member_keeps_amount || 0) * perMonth
            const lastColl = s.collections?.[0]

            return (
              <div key={s.id} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '10px', overflow: 'hidden',
              }}>
                {/* Row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 70px 60px 90px 110px 110px auto',
                  alignItems: 'center', gap: '8px', padding: '10px 14px',
                }}>
                  {/* Member */}
                  <div>
                    {isEditing ? (
                      <input style={{ ...inputStyle, width: '100px' }} placeholder="Discord ID"
                        value={editForm.discord_id ?? s.discord_id ?? ''}
                        onChange={e => setEditForm(f => ({ ...f, discord_id: e.target.value }))} />
                    ) : (
                      <>
                        <div style={{ color: '#f4f4f5', fontWeight: '500', fontSize: '13px' }}>#{s.torn_user_id}</div>
                        {s.discord_id && <div style={{ fontSize: '11px', color: '#71717a' }}>{s.discord_id}</div>}
                        {factionId == null && s.faction_id && (
                          <span style={{ color: '#6d28d9', fontSize: '10px' }}>
                            {FACTION_OPTIONS.find(f => f.id === s.faction_id)?.label ?? `#${s.faction_id}`}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Stock */}
                  <div>
                    {isEditing ? (
                      <select style={{ ...inputStyle, width: '70px' }}
                        value={editForm.stock_acronym ?? s.stock_acronym}
                        onChange={e => setEditForm(f => ({ ...f, stock_acronym: e.target.value }))}>
                        {TORN_STOCKS.map(st => <option key={st} value={st} style={{ background: '#1a1a2e' }}>{st}</option>)}
                      </select>
                    ) : (
                      <span style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '500' }}>{s.stock_acronym}</span>
                    )}
                  </div>

                  {/* Tier */}
                  <div>
                    {isEditing ? (
                      <select style={{ ...inputStyle, width: '60px' }}
                        value={editForm.tier ?? s.tier}
                        onChange={e => setEditForm(f => ({ ...f, tier: parseInt(e.target.value) }))}>
                        {TIER_OPTIONS.map(t => <option key={t} value={t} style={{ background: '#1a1a2e' }}>T{t}</option>)}
                      </select>
                    ) : (
                      <span style={{ color: '#a1a1aa', fontSize: '12px' }}>T{s.tier}</span>
                    )}
                  </div>

                  {/* Frequency */}
                  <div>
                    {isEditing ? (
                      <select style={{ ...inputStyle, width: '90px' }}
                        value={editForm.payout_frequency ?? s.payout_frequency}
                        onChange={e => setEditForm(f => ({ ...f, payout_frequency: e.target.value }))}>
                        {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ background: '#1a1a2e' }}>{o.label}</option>)}
                      </select>
                    ) : (
                      <span style={{ color: '#a1a1aa', fontSize: '12px' }}>{s.payout_frequency}</span>
                    )}
                  </div>

                  {/* Member keeps */}
                  <div>
                    {isEditing ? (
                      <input style={{ ...inputStyle, width: '90px' }} type="number" step="0.01" min="0"
                        value={editForm.member_keeps_amount ?? s.member_keeps_amount}
                        onChange={e => setEditForm(f => ({ ...f, member_keeps_amount: e.target.value }))} />
                    ) : (
                      <>
                        <div style={{ color: '#f4f4f5', fontSize: '12px' }}>
                          ${(s.member_keeps_amount || 0).toLocaleString()} / payout
                        </div>
                        <div style={{ color: '#52525b', fontSize: '11px' }}>
                          ~${Math.round(keepPerMonth).toLocaleString()} / mo
                        </div>
                      </>
                    )}
                  </div>

                  {/* Last collection */}
                  <div>
                    {lastColl ? (
                      <>
                        <div style={{ color: '#a1a1aa', fontSize: '11px' }}>{lastColl.period_label}</div>
                        <div style={{ color: '#22c55e', fontSize: '12px' }}>${parseFloat(lastColl.amount_paid).toLocaleString()}</div>
                      </>
                    ) : (
                      <span style={{ color: '#3f3f46', fontSize: '12px' }}>No collections</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                    {isEditing ? (
                      <>
                        <ActionBtn onClick={() => handleSaveEdit(s.id)} color="#22c55e">✓</ActionBtn>
                        <ActionBtn onClick={() => setEditingId(null)} color="#a1a1aa">✕</ActionBtn>
                      </>
                    ) : (
                      <>
                        <ActionBtn onClick={() => {
                          setCollectingId(isCollecting ? null : s.id)
                          setCollectForm({ period_label: currentPeriodLabel(), amount_paid: '', notes: '' })
                        }} color="#22c55e">$</ActionBtn>
                        <ActionBtn onClick={() => { setEditingId(s.id); setEditForm({}) }} color="#6d28d9">✎</ActionBtn>
                        <ActionBtn onClick={() => setExpandedId(isExpanded ? null : s.id)} color="#a1a1aa">{isExpanded ? '▲' : '▼'}</ActionBtn>
                        <ActionBtn onClick={() => handleArchive(s.id)} color="#b3123f">✕</ActionBtn>
                      </>
                    )}
                  </div>
                </div>

                {/* Log collection form */}
                {isCollecting && (
                  <div style={{
                    padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(34,197,94,0.04)',
                    display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end',
                  }}>
                    <div>
                      <label style={labelStyle}>Period</label>
                      <input style={{ ...inputStyle, width: '130px' }} value={collectForm.period_label}
                        onChange={e => setCollectForm(f => ({ ...f, period_label: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Amount Paid to Faction ($)</label>
                      <input style={{ ...inputStyle, width: '130px' }} type="number" step="0.01" min="0"
                        placeholder="0" value={collectForm.amount_paid}
                        onChange={e => setCollectForm(f => ({ ...f, amount_paid: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Notes</label>
                      <input style={{ ...inputStyle, width: '130px' }} placeholder="Optional" value={collectForm.notes}
                        onChange={e => setCollectForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                    <button onClick={() => handleLogCollection(s.id)} style={{
                      background: 'linear-gradient(135deg, #166534, #14532d)', border: 'none',
                      borderRadius: '6px', color: '#f4f4f5', padding: '6px 14px', fontSize: '12px', cursor: 'pointer',
                    }}>Log</button>
                    <button onClick={() => setCollectingId(null)} style={{
                      background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '6px', color: '#a1a1aa', padding: '6px 10px', fontSize: '12px', cursor: 'pointer',
                    }}>Cancel</button>
                  </div>
                )}

                {/* Expanded history */}
                {isExpanded && (
                  <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {s.notes && (
                      <p style={{ color: '#71717a', fontSize: '12px', marginBottom: '10px' }}>{s.notes}</p>
                    )}
                    {s.collections.length === 0 ? (
                      <p style={{ color: '#3f3f46', fontSize: '12px' }}>No collections logged.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {s.collections.map(c => (
                          <div key={c.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '5px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: '5px',
                            fontSize: '12px',
                          }}>
                            <span style={{ color: '#a1a1aa' }}>{c.period_label}</span>
                            <span style={{ color: '#22c55e' }}>${parseFloat(c.amount_paid).toLocaleString()}</span>
                            {c.notes && <span style={{ color: '#52525b' }}>{c.notes}</span>}
                            <ActionBtn onClick={() => handleDeleteCollection(c.id)} color="#b3123f">✕</ActionBtn>
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
