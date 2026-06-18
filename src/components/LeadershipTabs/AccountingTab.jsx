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
            Track investments and stock scheme payouts across the faction
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const token = localStorage.getItem('occultusSession')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cacheRes, settingsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/faction-cache`),
          fetch(`${API_BASE_URL}/api/leadership/accounting/settings`, { headers: { Authorization: token } }),
        ])
        const cacheJson = await cacheRes.json()
        const settingsJson = await settingsRes.json()

        const factions = (cacheJson.data || []).filter(f => OUR_FACTION_IDS.includes(f.basic?.id))
        setFactionData(factions)
        setSettings(settingsJson)
        setSettingsForm({ respect_value: settingsJson.respect_value, points_value: settingsJson.points_value })

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
            Per-faction financial snapshot. Armory and racket values are placeholders pending configuration.
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
              summary={summaries[faction.basic?.id]}
            />
          ))}
          {displayFactions.length === 0 && (
            <p style={{ color: '#a1a1aa', fontSize: '13px' }}>No faction data available. The 12-hour cache may not have run yet.</p>
          )}
          {displayFactions.length > 1 && (() => {
            const combinedTotal = displayFactions.reduce(
              (sum, faction) => sum + calcFactionNetworth(faction, settings, summaries[faction.basic?.id]),
              0
            )
            return (
              <div style={{
                background: 'rgba(109,40,217,0.06)',
                border: '1px solid rgba(109,40,217,0.25)',
                borderRadius: '14px',
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '14px 20px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <span className="font-cinzel" style={{ color: '#f4f4f5', fontSize: '15px', fontWeight: '600' }}>Combined Networth</span>
                    <div style={{ color: '#71717a', fontSize: '11px', marginTop: '2px' }}>
                      {displayFactions.map(f => f.basic?.name).join(' + ')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#f4f4f5', fontSize: '22px', fontWeight: '700' }}>{fmt(combinedTotal)}</div>
                    <div style={{ color: '#52525b', fontSize: '11px' }}>excl. armory & racket estimates</div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid rgba(109,40,217,0.15)', padding: '8px 20px 12px' }}>
                  <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                    {displayFactions.map(faction => (
                      <div key={faction.basic?.id} style={{ fontSize: '12px' }}>
                        <span style={{ color: '#71717a' }}>{faction.basic?.name}: </span>
                        <span style={{ color: '#f4f4f5', fontWeight: '600' }}>
                          {fmt(calcFactionNetworth(faction, settings, summaries[faction.basic?.id]))}
                        </span>
                      </div>
                    ))}
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

function calcFactionNetworth(faction, settings, summary) {
  const basic = faction.basic || {}
  const balanceFaction = faction.balance?.faction || {}
  const balanceMembers = faction.balance?.members || []
  const respect = basic.respect || 0
  const vaultMoney = balanceFaction.money || 0
  const points = balanceFaction.points || 0
  const memberTotal = balanceMembers.reduce((sum, m) => sum + (m.money || 0), 0)
  const respectEst = respect * (settings.respect_value || 0)
  const pointsEst = points * (settings.points_value || 0)
  const investmentTotal = summary?.investments?.total_amount || 0
  const stockIncome = summary?.stocks?.monthly_income || 0
  return respectEst + pointsEst + vaultMoney + memberTotal + investmentTotal + stockIncome
}

function FactionNetworthCard({ faction, settings, summary }) {
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
  const investmentTotal = summary?.investments?.total_amount || 0
  const stockIncome = summary?.stocks?.monthly_income || 0

  const totalNetworth = respectEst + pointsEst + vaultMoney + memberTotal + investmentTotal + stockIncome

  const rows = [
    {
      label: 'Respect',
      sub: `${respect.toLocaleString()} × $${(settings.respect_value || 0).toLocaleString()}/pt`,
      value: respectEst,
    },
    { label: 'Armory', sub: 'Coming soon', value: null, placeholder: true },
    {
      label: 'Rackets',
      sub: rackets.length > 0 ? `${rackets.length} owned — daily value TBD` : 'None owned',
      value: null,
      placeholder: true,
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
    {
      label: 'Investments',
      sub: `${summary?.investments?.total || 0} active`,
      value: investmentTotal,
    },
    {
      label: 'Stocks',
      sub: 'est. income / period',
      value: stockIncome,
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
          padding: '14px 20px',
          background: 'rgba(255,255,255,0.02)',
          borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span className="font-cinzel" style={{ color: '#f4f4f5', fontSize: '15px', fontWeight: '600' }}>{basic.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#a1a1aa', fontSize: '12px' }}>ID: {basic.id}</span>
          <span style={{ color: '#52525b', fontSize: '12px', transition: 'transform 0.2s', display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
      </div>

      {/* Rows */}
      {!collapsed && <div style={{ padding: '0 4px' }}>
        {rows.map((row, i) => (
          <div key={row.label} style={{
            display: 'grid', gridTemplateColumns: '160px 1fr auto',
            alignItems: 'center', gap: '12px',
            padding: '10px 16px',
            borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            background: row.derived ? 'rgba(255,255,255,0.015)' : 'transparent',
          }}>
            <div>
              <div style={{ color: row.derived ? '#71717a' : '#a1a1aa', fontSize: '13px' }}>{row.label}</div>
              {row.sub && <div style={{ color: '#52525b', fontSize: '11px', marginTop: '1px' }}>{row.sub}</div>}
            </div>
            <div />
            <div style={{
              color: row.placeholder ? '#3f3f46' : (row.color || '#f4f4f5'),
              fontSize: '14px', fontWeight: row.placeholder ? '400' : '600',
              fontStyle: row.placeholder ? 'italic' : 'normal',
              textAlign: 'right',
            }}>
              {row.placeholder ? '—' : fmt(row.value)}
            </div>
          </div>
        ))}
      </div>}

      {/* Total */}
      <div style={{
        padding: '14px 20px',
        background: 'rgba(255,255,255,0.02)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <span style={{ color: '#f4f4f5', fontSize: '14px', fontWeight: '600' }}>Total Networth</span>
          {!collapsed && <span style={{ color: '#52525b', fontSize: '11px', marginLeft: '8px' }}>excl. armory & racket estimates</span>}
        </div>
        <span style={{ color: '#f4f4f5', fontSize: '18px', fontWeight: '700' }}>{fmt(totalNetworth)}</span>
      </div>
    </div>
  )
}
