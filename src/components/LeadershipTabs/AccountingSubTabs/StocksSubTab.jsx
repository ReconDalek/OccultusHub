import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../../config/api'

const FACTION_OPTIONS = [
  { id: 33097, label: 'Occultus' },
  { id: 9728,  label: 'Occul2us' },
  { id: 9171,  label: 'Occul3us' },
]

// Full Torn stock list — also used by the Stocks market page
export const TORN_STOCKS = [
  { id:  1, acronym: 'TSB', name: 'Torn & Shanghai Banking',   logo: 'https://www.torn.com/images/v2/stock-market/logos/TSB.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/TSB.svg', frequency: 31 },
  { id:  2, acronym: 'TCI', name: 'Torn City Investments',      logo: 'https://www.torn.com/images/v2/stock-market/logos/TCI.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/TCI.svg', frequency: 7  },
  { id:  3, acronym: 'SYS', name: 'Syscore MFG',               logo: 'https://www.torn.com/images/v2/stock-market/logos/SYS.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/SYS.svg', frequency: 7  },
  { id:  4, acronym: 'LAG', name: 'Legal Authorities Group',    logo: 'https://www.torn.com/images/v2/stock-market/logos/LAG.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/LAG.svg', frequency: 7  },
  { id:  5, acronym: 'IOU', name: 'Insured On Us',              logo: 'https://www.torn.com/images/v2/stock-market/logos/IOU.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/IOU.svg', frequency: 31 },
  { id:  6, acronym: 'GRN', name: 'Grain',                      logo: 'https://www.torn.com/images/v2/stock-market/logos/GRN.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/GRN.svg', frequency: 31 },
  { id:  7, acronym: 'THS', name: 'Torn City Health Service',   logo: 'https://www.torn.com/images/v2/stock-market/logos/THS.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/THS.svg', frequency: 7  },
  { id:  8, acronym: 'YAZ', name: 'Yazoo',                      logo: 'https://www.torn.com/images/v2/stock-market/logos/YAZ.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/YAZ.svg', frequency: 7  },
  { id:  9, acronym: 'TCT', name: 'The Torn City Times',        logo: 'https://www.torn.com/images/v2/stock-market/logos/TCT.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/TCT.svg', frequency: 31 },
  { id: 10, acronym: 'CNC', name: 'Crude & Co',                 logo: 'https://www.torn.com/images/v2/stock-market/logos/CNC.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/CNC.svg', frequency: 31 },
  { id: 11, acronym: 'MSG', name: 'Messaging Inc.',             logo: 'https://www.torn.com/images/v2/stock-market/logos/MSG.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/MSG.svg', frequency: 7  },
  { id: 12, acronym: 'TMI', name: 'TC Music Industries',        logo: 'https://www.torn.com/images/v2/stock-market/logos/TMI.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/TMI.svg', frequency: 31 },
  { id: 13, acronym: 'TCP', name: 'TC Media Productions',       logo: 'https://www.torn.com/images/v2/stock-market/logos/TCP.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/TCP.svg', frequency: 7  },
  { id: 14, acronym: 'IIL', name: 'I Industries Ltd.',          logo: 'https://www.torn.com/images/v2/stock-market/logos/IIL.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/IIL.svg', frequency: 7  },
  { id: 15, acronym: 'FHG', name: 'Feathery Hotels Group',      logo: 'https://www.torn.com/images/v2/stock-market/logos/FHG.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/FHG.svg', frequency: 7  },
  { id: 16, acronym: 'SYM', name: 'Symbiotic Ltd.',             logo: 'https://www.torn.com/images/v2/stock-market/logos/SYM.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/SYM.svg', frequency: 7  },
  { id: 17, acronym: 'LSC', name: 'Lucky Shot Casino',          logo: 'https://www.torn.com/images/v2/stock-market/logos/LSC.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/LSC.svg', frequency: 7  },
  { id: 18, acronym: 'PRN', name: 'Performance Ribaldry',       logo: 'https://www.torn.com/images/v2/stock-market/logos/PRN.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/PRN.svg', frequency: 7  },
  { id: 19, acronym: 'EWM', name: 'Eaglewood Mercenary',        logo: 'https://www.torn.com/images/v2/stock-market/logos/EWM.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/EWM.svg', frequency: 7  },
  { id: 20, acronym: 'TCM', name: 'Torn City Motors',           logo: 'https://www.torn.com/images/v2/stock-market/logos/TCM.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/TCM.svg', frequency: 7  },
  { id: 21, acronym: 'ELT', name: 'Empty Lunchbox Traders',     logo: 'https://www.torn.com/images/v2/stock-market/logos/ELT.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/ELT.svg', frequency: 7  },
  { id: 22, acronym: 'HRG', name: 'Home Retail Group',          logo: 'https://www.torn.com/images/v2/stock-market/logos/HRG.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/HRG.svg', frequency: 31 },
  { id: 23, acronym: 'TGP', name: 'Tell Group Plc.',            logo: 'https://www.torn.com/images/v2/stock-market/logos/TGP.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/TGP.svg', frequency: 7  },
  { id: 24, acronym: 'MUN', name: 'Munster Beverage Corp.',     logo: 'https://www.torn.com/images/v2/stock-market/logos/MUN.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/MUN.svg', frequency: 7  },
  { id: 25, acronym: 'WSU', name: 'West Side University',       logo: 'https://www.torn.com/images/v2/stock-market/logos/WSU.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/WSU.svg', frequency: 7  },
  { id: 26, acronym: 'IST', name: 'International School TC',    logo: 'https://www.torn.com/images/v2/stock-market/logos/IST.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/IST.svg', frequency: 7  },
  { id: 27, acronym: 'BAG', name: "Big Al's Gun Shop",          logo: 'https://www.torn.com/images/v2/stock-market/logos/BAG.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/BAG.svg', frequency: 7  },
  { id: 28, acronym: 'EVL', name: 'Evil Ducks Candy Corp',      logo: 'https://www.torn.com/images/v2/stock-market/logos/EVL.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/EVL.svg', frequency: 7  },
  { id: 29, acronym: 'MCS', name: 'Mc Smoogle Corp',            logo: 'https://www.torn.com/images/v2/stock-market/logos/MCS.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/MCS.svg', frequency: 7  },
  { id: 30, acronym: 'WLT', name: 'Wind Lines Travel',          logo: 'https://www.torn.com/images/v2/stock-market/logos/WLT.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/WLT.svg', frequency: 7  },
  { id: 31, acronym: 'TCC', name: 'Torn City Clothing',         logo: 'https://www.torn.com/images/v2/stock-market/logos/TCC.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/TCC.svg', frequency: 31 },
  { id: 32, acronym: 'ASS', name: 'Alcoholics Synonymous',      logo: 'https://www.torn.com/images/v2/stock-market/logos/ASS.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/ASS.svg', frequency: 7  },
  { id: 33, acronym: 'CBD', name: 'Herbal Releaf Co.',          logo: 'https://www.torn.com/images/v2/stock-market/logos/CBD.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/CBD.svg', frequency: 7  },
  { id: 34, acronym: 'LOS', name: 'Lo Squalo Waste',            logo: 'https://www.torn.com/images/v2/stock-market/logos/LOS.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/LOS.svg', frequency: 7  },
  { id: 35, acronym: 'PTS', name: 'PointLess',                  logo: 'https://www.torn.com/images/v2/stock-market/logos/PTS.svg', full: 'https://www.torn.com/images/v2/stock-market/portfolio/PTS.svg', frequency: 7  },
]

const TIER_OPTIONS = [1, 2, 3]
const FREQ_OPTIONS = [
  { value: '7-day',  label: '7 days'  },
  { value: '31-day', label: '31 days' },
]

const EMPTY_FORM = {
  torn_user_id: '', discord_id: '', faction_id: 33097,
  stock_acronym: 'TSB', tier: 1, payout_frequency: '7-day',
  stock_cost: '', member_keeps_amount: '', notes: '',
}

// faction income per payout = base_payment × tier
function calcFactionIncome(basePayment, tier) {
  return (basePayment || 0) * (tier || 1)
}

function payoutsPerMonth(freq) {
  return freq === '7-day' ? 4 : 1
}

function currentPeriodLabel() {
  const now = new Date()
  return now.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}

function fmt(n) {
  if (!n) return '$0'
  return '$' + Math.round(n).toLocaleString()
}

export default function StocksSubTab({ factionId }) {
  const [stocks, setStocks] = useState([])
  const [memberNames, setMemberNames] = useState({}) // torn_user_id → username
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [expandedIds, setExpandedIds] = useState(new Set())
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

  // Load member name lookup once
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/leadership/members`, { headers: { Authorization: token } })
      .then(r => r.json())
      .then(d => {
        const map = {}
        for (const m of (d.members || [])) {
          map[String(m.torn_user_id)] = m.username
        }
        setMemberNames(map)
      })
      .catch(() => {})
  }, [token])

  useEffect(() => {
    fetchStocks()
    setShowForm(false)
    setEditingId(null)
  }, [fetchStocks])

  function memberLabel(tornId) {
    const name = memberNames[String(tornId)]
    return name || `#${tornId}`
  }

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
    setEditForm({})
    fetchStocks()
  }

  function startEdit(s) {
    setEditingId(s.id)
    setEditForm({
      discord_id: s.discord_id ?? '',
      stock_acronym: s.stock_acronym,
      tier: s.tier,
      payout_frequency: s.payout_frequency,
      stock_cost: s.stock_cost ?? 0,
      member_keeps_amount: s.member_keeps_amount ?? 0,
      notes: s.notes ?? '',
    })
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

  function toggleExpand(id) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Group stocks by torn_user_id
  const grouped = []
  const seen = {}
  for (const s of stocks) {
    const key = String(s.torn_user_id)
    if (!seen[key]) {
      seen[key] = { torn_user_id: s.torn_user_id, discord_id: s.discord_id, faction_id: s.faction_id, entries: [] }
      grouped.push(seen[key])
    }
    seen[key].entries.push(s)
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
            Track members in the stock scheme. Member Payment is what the member pays the faction per payout (base for Tier 1 — multiplied by tier level).
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
                {TORN_STOCKS.map(s => <option key={s.acronym} value={s.acronym} style={{ background: '#1a1a2e' }}>{s.acronym} — {s.name}</option>)}
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
              <label style={labelStyle}>Stock Cost ($)</label>
              <input style={inputStyle} type="number" step="0.01" min="0" placeholder="Total cost" value={form.stock_cost}
                onChange={e => setForm(f => ({ ...f, stock_cost: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Member Payment — T1 ($)</label>
              <input style={inputStyle} type="number" step="0.01" min="0" placeholder="Blank = use item value" value={form.member_keeps_amount}
                onChange={e => setForm(f => ({ ...f, member_keeps_amount: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <input style={inputStyle} placeholder="Optional" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          {form.member_keeps_amount && form.tier > 1 && (
            <div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '10px' }}>
              Tier {form.tier} payment: {fmt(calcFactionIncome(parseFloat(form.member_keeps_amount), parseInt(form.tier)))} / payout
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
      ) : grouped.length === 0 ? (
        <p style={{ color: '#a1a1aa', fontSize: '13px' }}>No stock scheme members recorded.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {grouped.map(group => {
            const isGroupExpanded = expandedIds.has(`group-${group.torn_user_id}`)
            const groupMonthlyTotal = group.entries.reduce((sum, s) => {
              const income = calcFactionIncome(s.member_keeps_amount, s.tier)
              return sum + income * payoutsPerMonth(s.payout_frequency)
            }, 0)

            return (
              <div key={group.torn_user_id} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '10px', overflow: 'hidden',
              }}>
                {/* Group header */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                  background: 'rgba(255,255,255,0.02)',
                }}>
                  <div>
                    <span style={{ color: '#f4f4f5', fontWeight: '600', fontSize: '14px' }}>
                      {memberLabel(group.torn_user_id)}
                    </span>
                    {group.discord_id && (
                      <span style={{ color: '#52525b', fontSize: '11px', marginLeft: '8px' }}>{group.discord_id}</span>
                    )}
                    {factionId == null && (
                      <span style={{ color: '#6d28d9', fontSize: '10px', marginLeft: '8px' }}>
                        {FACTION_OPTIONS.find(f => f.id === group.faction_id)?.label}
                      </span>
                    )}
                    <span style={{ color: '#52525b', fontSize: '11px', marginLeft: '8px' }}>
                      #{group.torn_user_id} · {group.entries.length} stock{group.entries.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ color: '#22c55e', fontSize: '13px', fontWeight: '600' }}>
                      {fmt(groupMonthlyTotal)} / mo
                    </span>
                    <ActionBtn onClick={() => toggleExpand(`group-${group.torn_user_id}`)} color="#a1a1aa">
                      {isGroupExpanded ? '▲' : '▼'}
                    </ActionBtn>
                  </div>
                </div>

                {/* Stock entries */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {group.entries.map((s, idx) => {
                    const isEditing = editingId === s.id
                    const isCollecting = collectingId === s.id
                    const isExpanded = expandedIds.has(`coll-${s.id}`)

                    const basePayment = isEditing
                      ? (parseFloat(editForm.member_keeps_amount) || 0)
                      : (s.member_keeps_amount || 0)
                    const tier = isEditing ? (parseInt(editForm.tier) || s.tier) : s.tier
                    const freq = isEditing ? (editForm.payout_frequency || s.payout_frequency) : s.payout_frequency
                    const factionIncomePerPayout = calcFactionIncome(basePayment, tier)
                    const factionIncomePerMonth = factionIncomePerPayout * payoutsPerMonth(freq)
                    const lastColl = s.collections?.[0]
                    const hasPayment = basePayment > 0

                    return (
                      <div key={s.id} style={{
                        borderBottom: idx < group.entries.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      }}>
                        {/* Stock row */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '80px 50px 90px 110px 110px 120px 110px auto',
                          alignItems: 'center', gap: '8px', padding: '10px 14px',
                        }}>
                          {/* Stock */}
                          <div>
                            {isEditing ? (
                              <select style={{ ...inputStyle, padding: '4px 6px' }}
                                value={editForm.stock_acronym}
                                onChange={e => setEditForm(f => ({ ...f, stock_acronym: e.target.value }))}>
                                {TORN_STOCKS.map(st => (
                                  <option key={st.acronym} value={st.acronym} style={{ background: '#1a1a2e' }}>
                                    {st.acronym}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '600' }}>{s.stock_acronym}</span>
                            )}
                          </div>

                          {/* Tier */}
                          <div>
                            {isEditing ? (
                              <select style={{ ...inputStyle, padding: '4px 6px' }}
                                value={editForm.tier}
                                onChange={e => setEditForm(f => ({ ...f, tier: parseInt(e.target.value) }))}>
                                {TIER_OPTIONS.map(t => (
                                  <option key={t} value={t} style={{ background: '#1a1a2e' }}>T{t}</option>
                                ))}
                              </select>
                            ) : (
                              <span style={{ color: '#a1a1aa', fontSize: '12px' }}>T{s.tier}</span>
                            )}
                          </div>

                          {/* Frequency */}
                          <div>
                            {isEditing ? (
                              <select style={{ ...inputStyle, padding: '4px 6px' }}
                                value={editForm.payout_frequency}
                                onChange={e => setEditForm(f => ({ ...f, payout_frequency: e.target.value }))}>
                                {FREQ_OPTIONS.map(o => (
                                  <option key={o.value} value={o.value} style={{ background: '#1a1a2e' }}>{o.label}</option>
                                ))}
                              </select>
                            ) : (
                              <span style={{ color: '#71717a', fontSize: '12px' }}>{s.payout_frequency}</span>
                            )}
                          </div>

                          {/* Stock cost */}
                          <div>
                            {isEditing ? (
                              <input style={{ ...inputStyle, padding: '4px 6px' }} type="number" step="0.01" min="0"
                                placeholder="Stock cost"
                                value={editForm.stock_cost}
                                onChange={e => setEditForm(f => ({ ...f, stock_cost: e.target.value }))} />
                            ) : (
                              <div style={{ color: '#71717a', fontSize: '12px' }}>
                                {s.stock_cost ? fmt(s.stock_cost) : <span style={{ color: '#3f3f46' }}>—</span>}
                              </div>
                            )}
                          </div>

                          {/* Member payment (base T1) */}
                          <div>
                            {isEditing ? (
                              <input style={{ ...inputStyle, padding: '4px 6px' }} type="number" step="0.01" min="0"
                                placeholder="T1 base payment"
                                value={editForm.member_keeps_amount}
                                onChange={e => setEditForm(f => ({ ...f, member_keeps_amount: e.target.value }))} />
                            ) : (
                              <div>
                                {hasPayment ? (
                                  <div style={{ color: '#f4f4f5', fontSize: '12px' }}>
                                    {fmt(s.member_keeps_amount)}
                                    {s.tier > 1 && <span style={{ color: '#52525b', fontSize: '10px' }}> ×T{s.tier}</span>}
                                  </div>
                                ) : (
                                  <span style={{ color: '#3f3f46', fontSize: '11px', fontStyle: 'italic' }}>item value</span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Faction income per payout + month */}
                          <div>
                            {hasPayment ? (
                              <>
                                <div style={{ color: '#22c55e', fontSize: '12px' }}>{fmt(factionIncomePerPayout)} / payout</div>
                                <div style={{ color: '#52525b', fontSize: '11px' }}>{fmt(factionIncomePerMonth)} / mo</div>
                              </>
                            ) : (
                              <span style={{ color: '#3f3f46', fontSize: '11px', fontStyle: 'italic' }}>pending armory</span>
                            )}
                          </div>

                          {/* Last collection */}
                          <div>
                            {lastColl ? (
                              <>
                                <div style={{ color: '#a1a1aa', fontSize: '11px' }}>{lastColl.period_label}</div>
                                <div style={{ color: '#22c55e', fontSize: '12px' }}>{fmt(lastColl.amount_paid)}</div>
                              </>
                            ) : (
                              <span style={{ color: '#3f3f46', fontSize: '11px' }}>No collections</span>
                            )}
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            {isEditing ? (
                              <>
                                <ActionBtn onClick={() => handleSaveEdit(s.id)} color="#22c55e">✓</ActionBtn>
                                <ActionBtn onClick={() => { setEditingId(null); setEditForm({}) }} color="#a1a1aa">✕</ActionBtn>
                              </>
                            ) : (
                              <>
                                <ActionBtn onClick={() => {
                                  setCollectingId(isCollecting ? null : s.id)
                                  setCollectForm({ period_label: currentPeriodLabel(), amount_paid: '', notes: '' })
                                }} color="#22c55e">$</ActionBtn>
                                <ActionBtn onClick={() => startEdit(s)} color="#6d28d9">✎</ActionBtn>
                                <ActionBtn onClick={() => toggleExpand(`coll-${s.id}`)} color="#a1a1aa">
                                  {isExpanded ? '▲' : '▼'}
                                </ActionBtn>
                                <ActionBtn onClick={() => handleArchive(s.id)} color="#b3123f">✕</ActionBtn>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Notes in edit mode */}
                        {isEditing && (
                          <div style={{ padding: '0 14px 10px' }}>
                            <input style={{ ...inputStyle, padding: '4px 8px' }} placeholder="Notes"
                              value={editForm.notes}
                              onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                          </div>
                        )}

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

                        {/* Collection history */}
                        {isExpanded && (
                          <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.1)' }}>
                            {s.notes && (
                              <p style={{ color: '#71717a', fontSize: '12px', marginBottom: '8px' }}>{s.notes}</p>
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
                                    <span style={{ color: '#22c55e' }}>{fmt(c.amount_paid)}</span>
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
