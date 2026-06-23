import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'
import InvestmentsSubTab from './AccountingSubTabs/InvestmentsSubTab'
import StocksSubTab from './AccountingSubTabs/StocksSubTab'

const FACTION_OPTIONS = [
  { id: null,  label: 'All Factions' },
  { id: 33097, label: 'Occultus' },
  { id: 9728,  label: 'Occul2us' },
  { id: 9171,  label: 'Occul3us' },
]

const SUB_TABS = [
  { id: 'overview',    label: 'Overview' },
  { id: 'investments', label: 'Investments' },
  { id: 'stocks',      label: 'Stocks' },
]

export default function AccountingTab() {
  const [activeSubTab, setActiveSubTab] = useState('overview')
  const [factionId, setFactionId] = useState(null)

  const subTabStyle = (id) => ({
    padding: '8px 16px',
    fontWeight: '500',
    border: 'none',
    cursor: 'pointer',
    background: 'transparent',
    color: activeSubTab === id ? '#f4f4f5' : '#a1a1aa',
    borderBottom: activeSubTab === id ? '2px solid #b3123f' : '2px solid transparent',
    fontSize: '13px',
    whiteSpace: 'nowrap',
    transition: 'color 0.15s',
  })

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '20px', color: '#f4f4f5', marginBottom: '4px' }}>
            Accounting
          </h2>
          <p style={{ color: '#a1a1aa', fontSize: '13px' }}>
            Track faction bank and stock investment payouts.
          </p>
        </div>

        {/* Faction filter pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {FACTION_OPTIONS.map(f => {
            const active = factionId === f.id
            return (
              <button
                key={String(f.id)}
                onClick={() => setFactionId(f.id)}
                style={{
                  padding: '5px 14px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: active ? '600' : '400',
                  cursor: 'pointer',
                  border: active ? '1px solid rgba(179,18,63,0.6)' : '1px solid rgba(255,255,255,0.12)',
                  background: active ? 'rgba(179,18,63,0.18)' : 'rgba(255,255,255,0.04)',
                  color: active ? '#f4f4f5' : '#a1a1aa',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.color = '#f4f4f5'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' } }}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Sub-tab nav */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '24px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        <div style={{ display: 'flex', minWidth: 'max-content' }}>
          {SUB_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveSubTab(t.id)}
              style={subTabStyle(t.id)}
              onMouseEnter={e => { if (activeSubTab !== t.id) e.currentTarget.style.color = '#f4f4f5' }}
              onMouseLeave={e => { if (activeSubTab !== t.id) e.currentTarget.style.color = '#a1a1aa' }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-tab content */}
      {activeSubTab === 'overview'    && <OverviewSubTab factionId={factionId} onNavigate={setActiveSubTab} />}
      {activeSubTab === 'investments' && <InvestmentsSubTab factionId={factionId} />}
      {activeSubTab === 'stocks'      && <StocksSubTab factionId={factionId} />}
    </div>
  )
}

const OUR_FACTION_IDS = [33097, 9728, 9171]

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return `$${Math.round(n).toLocaleString()}`
}

function OverviewSubTab({ factionId, onNavigate }) {
  const [factionData, setFactionData] = useState([])
  const [settings, setSettings] = useState({ respect_value: 0, points_value: 0 })
  const [editSettings, setEditSettings] = useState(false)
  const [settingsForm, setSettingsForm] = useState({ respect_value: '', points_value: '' })
  const [summaries, setSummaries] = useState({})
  const [armoryValues, setArmoryValues] = useState({})
  const [racketValues, setRacketValues] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const token = localStorage.getItem('occultusSession')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cacheRes, settingsRes, armoryRes, itemPricesRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/faction-cache`),
          fetch(`${API_BASE_URL}/api/leadership/accounting/settings`, { headers: { Authorization: token } }),
          fetch(`${API_BASE_URL}/api/leadership/armory`, { headers: { Authorization: token } }),
          fetch(`${API_BASE_URL}/api/leadership/item-prices`, { headers: { Authorization: token } }),
        ])
        const cacheJson = await cacheRes.json()
        const settingsJson = await settingsRes.json()
        const armoryJson = await armoryRes.json()
        const itemPricesJson = await itemPricesRes.json()

        const factions = (cacheJson.data || []).filter(f => OUR_FACTION_IDS.includes(f.basic?.id))
        setFactionData(factions)
        setSettings(settingsJson)
        setSettingsForm({ respect_value: settingsJson.respect_value, points_value: settingsJson.points_value })

        const armoryMap = {}
        for (const entry of (armoryJson.armory || [])) {
          armoryMap[entry.faction_id] = entry.totalValue ?? 0
        }
        setArmoryValues(armoryMap)

        // Compute monthly racket income per faction from item prices
        const prices = itemPricesJson.prices || {}
        const racketMap = {}
        for (const faction of factions) {
          const fid = faction.basic?.id
          if (!fid) continue
          const rackets = (faction.rackets || []).filter(r => r.reward?.type === 'Item')
          const monthlyIncome = rackets.reduce((sum, r) => {
            const price = prices[r.reward.id] ?? 0
            return sum + r.reward.quantity * price * 30
          }, 0)
          racketMap[fid] = monthlyIncome
        }
        setRacketValues(racketMap)

        const ids = factionId != null ? [factionId] : OUR_FACTION_IDS
        const results = await Promise.all(
          ids.map(id =>
            fetch(`${API_BASE_URL}/api/leadership/accounting/summary?faction_id=${id}`, {
              headers: { Authorization: token },
            }).then(r => r.json())
          )
        )
        const map = {}
        ids.forEach((id, i) => { map[id] = results[i] })
        setSummaries(map)
      } catch (e) {
        console.error(e)
      }
      setLoading(false)
    }
    load()
  }, [factionId, token])

  async function handleSaveSettings(e) {
    e.preventDefault()
    setSaving(true)
    await Promise.all([
      fetch(`${API_BASE_URL}/api/leadership/accounting/settings`, {
        method: 'PUT',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'accounting_respect_value', value: settingsForm.respect_value }),
      }),
      fetch(`${API_BASE_URL}/api/leadership/accounting/settings`, {
        method: 'PUT',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'accounting_points_value', value: settingsForm.points_value }),
      }),
    ])
    const updated = { respect_value: parseFloat(settingsForm.respect_value) || 0, points_value: parseFloat(settingsForm.points_value) || 0 }
    setSettings(updated)
    setEditSettings(false)
    setSaving(false)
  }

  const FACTION_ORDER = [33097, 9728, 9171]
  const displayFactions = factionData
    .filter(f => factionId == null || f.basic?.id === factionId)
    .sort((a, b) => FACTION_ORDER.indexOf(a.basic?.id) - FACTION_ORDER.indexOf(b.basic?.id))

  const inputStyle = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#f4f4f5', borderRadius: '6px', padding: '5px 10px', fontSize: '13px', width: '120px',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ color: '#f4f4f5', fontSize: '15px', fontWeight: '600', margin: 0, marginBottom: '2px' }}>Faction Networth Overview</h3>
          <p style={{ color: '#a1a1aa', fontSize: '12px', margin: 0 }}>
            Per-faction monthly financial overview.
          </p>
        </div>

        {/* Global value settings */}
        {!editSettings ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ color: '#a1a1aa', fontSize: '12px' }}>
              Respect: ${(settings.respect_value || 0).toLocaleString()}/pt
              &nbsp;·&nbsp;
              Points: ${(settings.points_value || 0).toLocaleString()}/pt
            </span>
            <button
              onClick={() => setEditSettings(true)}
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '6px', color: '#a1a1aa', padding: '5px 12px',
                fontSize: '12px', cursor: 'pointer',
              }}
            >
              Set Values
            </button>
          </div>
        ) : (
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div>
              <label style={{ color: '#a1a1aa', fontSize: '11px', display: 'block', marginBottom: '3px' }}>$ per Respect</label>
              <input
                style={inputStyle} type="number" step="0.01" min="0"
                value={settingsForm.respect_value}
                onChange={e => setSettingsForm(f => ({ ...f, respect_value: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ color: '#a1a1aa', fontSize: '11px', display: 'block', marginBottom: '3px' }}>$ per Point</label>
              <input
                style={inputStyle} type="number" step="0.01" min="0"
                value={settingsForm.points_value}
                onChange={e => setSettingsForm(f => ({ ...f, points_value: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', paddingBottom: '1px' }}>
              <button type="submit" disabled={saving} style={{
                background: 'linear-gradient(135deg, #b3123f, #6d28d9)', border: 'none',
                borderRadius: '6px', color: '#f4f4f5', padding: '6px 14px', fontSize: '12px',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditSettings(false)} style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '6px', color: '#a1a1aa', padding: '6px 12px', fontSize: '12px', cursor: 'pointer',
              }}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {loading ? (
        <p style={{ color: '#a1a1aa', fontSize: '13px' }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {displayFactions.map(faction => (
            <FactionNetworthCard
              key={faction.basic?.id}
              faction={faction}
              settings={settings}
              armoryValue={armoryValues[faction.basic?.id] ?? 0}
              racketValue={racketValues[faction.basic?.id] ?? 0}
            />
          ))}
          {displayFactions.length === 0 && (
            <p style={{ color: '#a1a1aa', fontSize: '13px' }}>No faction data available. The 12-hour cache may not have run yet.</p>
          )}

          {/* Investment summary card */}
          {displayFactions.length > 0 && (
            <InvestmentCard summaries={summaries} shownIds={displayFactions.map(f => f.basic?.id)} />
          )}

          {/* Combined networth */}
          {displayFactions.length > 1 && (() => {
            const factionSubtotal = displayFactions.reduce(
              (sum, faction) => sum + calcFactionNetworth(faction, settings, armoryValues[faction.basic?.id] ?? 0, racketValues[faction.basic?.id] ?? 0),
              0
            )
            const invPrincipal = displayFactions.reduce((s, f) => s + (summaries[f.basic?.id]?.investments?.total_amount ?? 0), 0)
            const invMonthly = displayFactions.reduce((s, f) => s + (summaries[f.basic?.id]?.investments?.monthly_income ?? 0), 0)
            const stockInvested = displayFactions.reduce((s, f) => s + (summaries[f.basic?.id]?.stocks?.total_invested ?? 0), 0)
            const stockMonthly = displayFactions.reduce((s, f) => s + (summaries[f.basic?.id]?.stocks?.monthly_income ?? 0), 0)
            const investmentNetworth = invPrincipal + stockInvested + invMonthly + stockMonthly
            const combinedTotal = factionSubtotal + investmentNetworth

            return (
              <div style={{
                background: 'rgba(109,40,217,0.06)',
                border: '1px solid rgba(109,40,217,0.25)',
                borderRadius: '14px',
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '14px 16px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px',
                }}>
                  <div style={{ flex: '1 1 0', minWidth: 0 }}>
                    <span className="font-cinzel" style={{ color: '#f4f4f5', fontSize: '15px', fontWeight: '600' }}>Combined Networth</span>
                    <div style={{ color: '#71717a', fontSize: '11px', marginTop: '3px', overflowWrap: 'break-word' }}>
                      {displayFactions.map(f => f.basic?.name).join(' + ')}
                    </div>
                    <div style={{ color: '#52525b', fontSize: '11px', marginTop: '2px' }}>incl. investment principal, investment profits, armory and rackets</div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ color: '#f4f4f5', fontSize: '22px', fontWeight: '700', whiteSpace: 'nowrap' }}>{fmt(combinedTotal)}</div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid rgba(109,40,217,0.15)', padding: '8px 20px 12px' }}>
                  <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                    {displayFactions.map(faction => (
                      <div key={faction.basic?.id} style={{ fontSize: '12px' }}>
                        <span style={{ color: '#71717a' }}>{faction.basic?.name}: </span>
                        <span style={{ color: '#f4f4f5', fontWeight: '600' }}>
                          {fmt(calcFactionNetworth(faction, settings, armoryValues[faction.basic?.id] ?? 0, racketValues[faction.basic?.id] ?? 0))}
                        </span>
                      </div>
                    ))}
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: '#71717a' }}>Investments: </span>
                      <span style={{ color: '#f4f4f5', fontWeight: '600' }}>{fmt(investmentNetworth)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

function calcFactionNetworth(faction, settings, armoryValue = 0, racketValue = 0) {
  const basic = faction.basic || {}
  const balanceFaction = faction.balance?.faction || {}
  const balanceMembers = faction.balance?.members || []
  const respect = basic.respect || 0
  const vaultMoney = balanceFaction.money || 0
  const points = balanceFaction.points || 0
  const memberTotal = balanceMembers.reduce((sum, m) => sum + (m.money || 0), 0)
  const respectEst = respect * (settings.respect_value || 0)
  const pointsEst = points * (settings.points_value || 0)
  return respectEst + pointsEst + vaultMoney + memberTotal + armoryValue + racketValue
}

function InvestmentCard({ summaries, shownIds }) {
  const [collapsed, setCollapsed] = useState(false)

  const invMonthly   = shownIds.reduce((s, id) => s + (summaries[id]?.investments?.monthly_income ?? 0), 0)
  const invPrincipal = shownIds.reduce((s, id) => s + (summaries[id]?.investments?.total_amount   ?? 0), 0)
  const stockMonthly  = shownIds.reduce((s, id) => s + (summaries[id]?.stocks?.monthly_income    ?? 0), 0)
  const stockInvested = shownIds.reduce((s, id) => s + (summaries[id]?.stocks?.total_invested    ?? 0), 0)
  const totalInvested = invPrincipal + stockInvested
  const totalMonthly  = invMonthly + stockMonthly

  const rows = [
    {
      label: 'Bank Investments',
      sub: `${shownIds.reduce((s, id) => s + (summaries[id]?.investments?.total ?? 0), 0)} active — est. monthly faction income`,
      principal: invPrincipal,
      monthly: invMonthly,
    },
    {
      label: 'Stocks',
      sub: `${shownIds.reduce((s, id) => s + (summaries[id]?.stocks?.total ?? 0), 0)} schemes — est. monthly faction income`,
      principal: stockInvested,
      monthly: stockMonthly,
    },
  ]

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', overflow: 'hidden' }}>
      {/* Header — clickable to collapse */}
      <div
        onClick={() => setCollapsed(v => !v)}
        style={{
          padding: '12px 16px',
          background: 'rgba(255,255,255,0.02)',
          borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span className="font-cinzel" style={{ color: '#f4f4f5', fontSize: '15px', fontWeight: '600' }}>Investments</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {collapsed && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#a1a1aa', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Principal</div>
              <div style={{ color: '#f4f4f5', fontSize: '16px', fontWeight: '700' }}>{fmt(totalInvested)}</div>
            </div>
          )}
          <span style={{ color: '#52525b', fontSize: '12px', transition: 'transform 0.2s', display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Header principal (visible when expanded) */}
          <div style={{ padding: '8px 16px 0', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#a1a1aa', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Principal</div>
              <div style={{ color: '#f4f4f5', fontSize: '16px', fontWeight: '700' }}>{fmt(totalInvested)}</div>
            </div>
          </div>

          {/* Rows */}
          <div style={{ padding: '0 4px' }}>
            {rows.map((row, i) => (
              <div key={row.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
                padding: '10px 16px',
                borderBottom: i === 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              }}>
                <div style={{ flex: '1 1 0', minWidth: 0 }}>
                  <div style={{ color: '#a1a1aa', fontSize: '13px' }}>{row.label}</div>
                  <div style={{ color: '#52525b', fontSize: '11px', marginTop: '2px' }}>{row.sub}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ color: '#f4f4f5', fontSize: '14px', fontWeight: '600' }}>
                    {fmt(row.monthly)}<span style={{ color: '#52525b', fontSize: '11px', fontWeight: '400' }}>/mo</span>
                  </div>
                  <div style={{ color: '#71717a', fontSize: '11px' }}>principal {fmt(row.principal)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Footer — always visible */}
      <div style={{
        padding: '12px 16px',
        background: 'rgba(255,255,255,0.02)',
        borderTop: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ color: '#f4f4f5', fontSize: '14px', fontWeight: '600' }}>Total Networth</div>
          {!collapsed && <div style={{ color: '#52525b', fontSize: '11px', marginTop: '2px' }}>principal + est. monthly profit</div>}
        </div>
        <div style={{ color: '#f4f4f5', fontSize: '18px', fontWeight: '700' }}>{fmt(totalInvested + totalMonthly)}</div>
      </div>
    </div>
  )
}

function FactionNetworthCard({ faction, settings, armoryValue = 0, racketValue = 0 }) {
  const [collapsed, setCollapsed] = useState(false)
  const basic = faction.basic || {}
  const balanceFaction = faction.balance?.faction || {}
  const balanceMembers = faction.balance?.members || []
  const rackets = (faction.rackets || []).filter(r => r.faction_id === basic.id)

  const respect = basic.respect || 0
  const vaultMoney = balanceFaction.money || 0
  const points = balanceFaction.points || 0
  const memberTotal = balanceMembers.reduce((sum, m) => sum + (m.money || 0), 0)
  const factionNet = vaultMoney - memberTotal

  const respectEst = respect * (settings.respect_value || 0)
  const pointsEst = points * (settings.points_value || 0)

  const totalNetworth = respectEst + pointsEst + vaultMoney + memberTotal + armoryValue + racketValue

  const itemRackets = rackets.filter(r => r.reward?.type === 'Item')
  const racketSub = itemRackets.length > 0
    ? `${itemRackets.length} racket${itemRackets.length !== 1 ? 's' : ''} — est. 30-day item income`
    : rackets.length > 0 ? `${rackets.length} racket${rackets.length !== 1 ? 's' : ''} — non-item rewards` : 'None owned'

  const rows = [
    {
      label: 'Respect',
      sub: `${respect.toLocaleString()} × $${(settings.respect_value || 0).toLocaleString()}/pt`,
      value: respectEst,
    },
    {
      label: 'Armory',
      sub: armoryValue > 0 ? 'item qty × market/sell price' : 'cache not yet populated',
      value: armoryValue > 0 ? armoryValue : null,
      placeholder: armoryValue === 0,
    },
    {
      label: 'Rackets',
      sub: racketSub,
      value: racketValue > 0 ? racketValue : null,
      placeholder: racketValue === 0,
    },
    {
      label: 'Points',
      sub: `${points.toLocaleString()} × $${(settings.points_value || 0).toLocaleString()}/pt`,
      value: pointsEst,
    },
    { label: 'Vault Balance', value: vaultMoney },
    {
      label: 'Member Balance',
      sub: `${balanceMembers.length} members`,
      value: memberTotal,
    },
    {
      label: 'Faction Balance',
      sub: 'vault − member total',
      value: factionNet,
      color: factionNet >= 0 ? '#22c55e' : '#ff6b8a',
      derived: true,
    },
  ]

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '14px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(v => !v)}
        style={{
          padding: '12px 16px',
          background: 'rgba(255,255,255,0.02)',
          borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer', userSelect: 'none', gap: '8px',
        }}
      >
        <span className="font-cinzel" style={{
          color: '#f4f4f5', fontSize: '15px', fontWeight: '600',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 0', minWidth: 0,
        }}>{basic.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ color: '#a1a1aa', fontSize: '12px', whiteSpace: 'nowrap' }}>ID: {basic.id}</span>
          <span style={{ color: '#52525b', fontSize: '12px', transition: 'transform 0.2s', display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
      </div>

      {/* Rows */}
      {!collapsed && <div style={{ padding: '0 4px' }}>
        {rows.map((row, i) => (
          <div key={row.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
            padding: '10px 16px',
            borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            background: row.derived ? 'rgba(255,255,255,0.015)' : 'transparent',
          }}>
            <div style={{ flex: '1 1 0', minWidth: 0, paddingRight: '8px' }}>
              <div style={{ color: row.derived ? '#71717a' : '#a1a1aa', fontSize: '13px' }}>{row.label}</div>
              {row.sub && (
                <div style={{
                  color: '#52525b', fontSize: '11px', marginTop: '2px',
                  overflowWrap: 'break-word', wordBreak: 'break-word',
                }}>{row.sub}</div>
              )}
            </div>
            <div style={{
              color: row.placeholder ? '#3f3f46' : (row.color || '#f4f4f5'),
              fontSize: '14px', fontWeight: row.placeholder ? '400' : '600',
              fontStyle: row.placeholder ? 'italic' : 'normal',
              textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap',
            }}>
              {row.placeholder ? '—' : fmt(row.value)}
            </div>
          </div>
        ))}
      </div>}

      {/* Total */}
      <div style={{
        padding: '12px 16px',
        background: 'rgba(255,255,255,0.02)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
      }}>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <div style={{ color: '#f4f4f5', fontSize: '14px', fontWeight: '600' }}>Total Networth</div>
          {!collapsed && <div style={{ color: '#52525b', fontSize: '11px', marginTop: '2px' }}></div>}
        </div>
        <span style={{ color: '#f4f4f5', fontSize: '18px', fontWeight: '700', flexShrink: 0, whiteSpace: 'nowrap' }}>{fmt(totalNetworth)}</span>
      </div>
    </div>
  )
}
