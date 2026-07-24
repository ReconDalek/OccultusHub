import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'
import InvestmentsSubTab from './AccountingSubTabs/InvestmentsSubTab'
import StocksSubTab from './AccountingSubTabs/StocksSubTab'
import CompanySubTab from './AccountingSubTabs/CompanySubTab'

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
  { id: 'companies',   label: 'Companies' },
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
    color: activeSubTab === id ? '#f4f4f5' : "var(--text-secondary)",
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
          <p style={{ color: "var(--text-secondary)", fontSize: '13px' }}>
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
                  color: active ? '#f4f4f5' : "var(--text-secondary)",
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.color = '#f4f4f5'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' } }}
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
              onMouseLeave={e => { if (activeSubTab !== t.id) e.currentTarget.style.color = "var(--text-secondary)" }}
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
      {activeSubTab === 'companies'   && <CompanySubTab factionId={factionId} />}
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
        const cacheJson     = await cacheRes.json()
        const settingsJson  = await settingsRes.json()
        const armoryJson    = await armoryRes.json()
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
          const rackets = (faction.rackets || []).filter(r => r.faction_id === fid && r.reward?.type === 'Item')
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
          <p style={{ color: "var(--text-secondary)", fontSize: '12px', margin: 0 }}>
            Per-faction monthly financial overview.
          </p>
        </div>

        {/* Global value settings */}
        {!editSettings ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ color: "var(--text-secondary)", fontSize: '12px' }}>
              Respect: ${(settings.respect_value || 0).toLocaleString()}/pt
              &nbsp;·&nbsp;
              Points: ${(settings.points_value || 0).toLocaleString()}/pt
            </span>
            <button
              onClick={() => setEditSettings(true)}
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '6px', color: "var(--text-secondary)", padding: '5px 12px',
                fontSize: '12px', cursor: 'pointer',
              }}
            >
              Set Values
            </button>
          </div>
        ) : (
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div>
              <label style={{ color: "var(--text-secondary)", fontSize: '11px', display: 'block', marginBottom: '3px' }}>$ per Respect</label>
              <input
                style={inputStyle} type="number" step="0.01" min="0"
                value={settingsForm.respect_value}
                onChange={e => setSettingsForm(f => ({ ...f, respect_value: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ color: "var(--text-secondary)", fontSize: '11px', display: 'block', marginBottom: '3px' }}>$ per Point</label>
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
                borderRadius: '6px', color: "var(--text-secondary)", padding: '6px 12px', fontSize: '12px', cursor: 'pointer',
              }}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {loading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: '13px' }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {displayFactions.map(faction => (
            <FactionNetworthCard
              key={faction.basic?.id}
              faction={faction}
              settings={settings}
              armoryValue={armoryValues[faction.basic?.id] ?? 0}
              racketValue={racketValues[faction.basic?.id] ?? 0}
              summary={summaries[faction.basic?.id]}
            />

          ))}
          {displayFactions.length === 0 && (
            <p style={{ color: "var(--text-secondary)", fontSize: '13px' }}>No faction data available. The 12-hour cache may not have run yet.</p>
          )}

          {/* Investment summary card */}
          {displayFactions.length > 0 && (
            <InvestmentCard summaries={summaries} shownIds={displayFactions.map(f => f.basic?.id)} />
          )}

          {/* Combined networth */}
          {displayFactions.length > 1 && (() => {
            const factionSubtotal  = displayFactions.reduce((sum, f) => sum + calcFactionNetworth(f, settings, armoryValues[f.basic?.id] ?? 0), 0)
            const totalRackets     = displayFactions.reduce((s, f) => s + (racketValues[f.basic?.id] ?? 0), 0)
            const invPrincipal     = displayFactions.reduce((s, f) => s + (summaries[f.basic?.id]?.investments?.total_amount   ?? 0), 0)
            const invMonthly       = displayFactions.reduce((s, f) => s + (summaries[f.basic?.id]?.investments?.monthly_income ?? 0), 0)
            const stockInvested    = displayFactions.reduce((s, f) => s + (summaries[f.basic?.id]?.stocks?.total_invested      ?? 0), 0)
            const stockMonthly     = displayFactions.reduce((s, f) => s + (summaries[f.basic?.id]?.stocks?.monthly_income      ?? 0), 0)
            const companyPrincipal = displayFactions.reduce((s, f) => s + (summaries[f.basic?.id]?.companies?.total_principal  ?? 0), 0)
            const companyMonthly   = displayFactions.reduce((s, f) => s + (summaries[f.basic?.id]?.companies?.monthly_income   ?? 0), 0)
            const warMonthly       = displayFactions.reduce((s, f) => s + (summaries[f.basic?.id]?.wars?.monthly_income        ?? 0), 0)
            const warCount         = displayFactions.reduce((s, f) => s + (summaries[f.basic?.id]?.wars?.count                 ?? 0), 0)
            const ocMonthly        = displayFactions.reduce((s, f) => s + (summaries[f.basic?.id]?.oc?.monthly_income          ?? 0), 0)
            const totalRankPerks   = displayFactions.reduce((s, f) => s + (summaries[f.basic?.id]?.expenses?.rank_perks?.monthly_cost   ?? 0), 0)
            const totalOdInsurance = displayFactions.reduce((s, f) => s + (summaries[f.basic?.id]?.expenses?.od_insurance?.monthly_cost ?? 0), 0)
            const totalArmoryExpense = displayFactions.reduce((s, f) => s + (summaries[f.basic?.id]?.expenses?.armory?.monthly_cost     ?? 0), 0)
            const totalExpenses    = totalArmoryExpense + totalOdInsurance + totalRankPerks
            const investmentPrincipal = invPrincipal + stockInvested + companyPrincipal
            const combinedNetworth = factionSubtotal + investmentPrincipal
            const combinedProfit   = totalRackets + invMonthly + stockMonthly + companyMonthly + warMonthly + ocMonthly
            const combinedNet      = combinedProfit - totalExpenses

            return (
              <div style={{
                background: 'rgba(109,40,217,0.06)',
                border: '1px solid rgba(109,40,217,0.25)',
                borderRadius: '14px',
                overflow: 'hidden',
              }}>
                <div style={{ padding: '14px 16px 12px' }}>
                  <span className="font-cinzel" style={{ color: '#f4f4f5', fontSize: '15px', fontWeight: '600' }}>Combined Overview</span>
                  <div style={{ color: "var(--text-muted)", fontSize: '11px', marginTop: '3px' }}>
                    {displayFactions.map(f => f.basic?.name).join(' + ')}
                  </div>
                </div>

                {/* Two big figures */}
                <div style={{ padding: '0 16px 14px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Combined Networth</div>
                    <div style={{ color: '#f4f4f5', fontSize: '22px', fontWeight: '700' }}>{fmt(combinedNetworth)}</div>
                    <div style={{ color: "var(--text-faint)", fontSize: '11px', marginTop: '2px' }}>faction assets + all investment principal</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Est. Monthly Profit</div>
                    <div style={{ color: '#4ade80', fontSize: '22px', fontWeight: '700' }}>{fmt(combinedProfit)}<span style={{ color: "var(--text-faint)", fontSize: '12px', fontWeight: '400' }}>/mo</span></div>
                    <div style={{ color: "var(--text-faint)", fontSize: '11px', marginTop: '2px' }}>rackets + investments + stocks + companies + wars + OC</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Expenses</div>
                    <div style={{ color: totalExpenses > 0 ? '#f87171' : "var(--text-muted)", fontSize: '22px', fontWeight: '700' }}>{fmt(totalExpenses)}<span style={{ color: "var(--text-faint)", fontSize: '12px', fontWeight: '400' }}>/mo</span></div>
                    <div style={{ color: "var(--text-faint)", fontSize: '11px', marginTop: '2px' }}>armory + OD insurance + rank perks</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net</div>
                    <div style={{ color: combinedNet >= 0 ? '#4ade80' : '#f87171', fontSize: '22px', fontWeight: '700' }}>{fmt(combinedNet)}<span style={{ color: "var(--text-faint)", fontSize: '12px', fontWeight: '400' }}>/mo</span></div>
                    <div style={{ color: "var(--text-faint)", fontSize: '11px', marginTop: '2px' }}>profit − expenses</div>
                  </div>
                </div>

                {/* Breakdown */}
                <div style={{ borderTop: '1px solid rgba(109,40,217,0.15)', padding: '8px 16px 12px' }}>
                  <div style={{ color: "var(--text-faint)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Networth Breakdown</div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {displayFactions.map(f => (
                      <div key={f.basic?.id} style={{ fontSize: '12px' }}>
                        <span style={{ color: "var(--text-muted)" }}>{f.basic?.name}: </span>
                        <span style={{ color: '#f4f4f5', fontWeight: '600' }}>{fmt(calcFactionNetworth(f, settings, armoryValues[f.basic?.id] ?? 0))}</span>
                      </div>
                    ))}
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: "var(--text-muted)" }}>Investments: </span>
                      <span style={{ color: '#f4f4f5', fontWeight: '600' }}>{fmt(investmentPrincipal)}</span>
                    </div>
                  </div>
                  <div style={{ color: "var(--text-faint)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', marginTop: '10px' }}>Monthly Profit Breakdown</div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: "var(--text-muted)" }}>Rackets: </span>
                      <span style={{ color: '#4ade80', fontWeight: '600' }}>{fmt(totalRackets)}/mo</span>
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: "var(--text-muted)" }}>Bank investments: </span>
                      <span style={{ color: '#4ade80', fontWeight: '600' }}>{fmt(invMonthly)}/mo</span>
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: "var(--text-muted)" }}>Stocks: </span>
                      <span style={{ color: '#4ade80', fontWeight: '600' }}>{fmt(stockMonthly)}/mo</span>
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: "var(--text-muted)" }}>Companies: </span>
                      <span style={{ color: '#4ade80', fontWeight: '600' }}>{fmt(companyMonthly)}/mo</span>
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: "var(--text-muted)" }}>Wars ({warCount}): </span>
                      <span style={{ color: '#4ade80', fontWeight: '600' }}>{fmt(warMonthly)}/mo</span>
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: "var(--text-muted)" }}>Organized Crime: </span>
                      <span style={{ color: "var(--text-ghost)", fontWeight: '400', fontStyle: 'italic' }}>not yet tracked</span>
                    </div>
                  </div>
                  <div style={{ color: "var(--text-faint)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', marginTop: '10px' }}>Expense Breakdown</div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: "var(--text-muted)" }}>Armory: </span>
                      <span style={{ color: "var(--text-ghost)", fontWeight: '400', fontStyle: 'italic' }}>not yet tracked</span>
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: "var(--text-muted)" }}>OD Insurance: </span>
                      <span style={{ color: '#f87171', fontWeight: '600' }}>{fmt(totalOdInsurance)}/mo</span>
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: "var(--text-muted)" }}>Rank Perks: </span>
                      <span style={{ color: '#f87171', fontWeight: '600' }}>{fmt(totalRankPerks)}/mo</span>
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

function calcFactionNetworth(faction, settings, armoryValue = 0) {
  const basic = faction.basic || {}
  const balanceFaction = faction.balance?.faction || {}
  const balanceMembers = faction.balance?.members || []
  const respect = basic.respect || 0
  const vaultMoney = balanceFaction.money || 0
  const points = balanceFaction.points || 0
  const memberTotal = balanceMembers.reduce((sum, m) => sum + (m.money || 0), 0)
  const factionNet = vaultMoney - memberTotal
  const respectEst = respect * (settings.respect_value || 0)
  const pointsEst = points * (settings.points_value || 0)
  return respectEst + pointsEst + factionNet + armoryValue
}

// Group-owned assets — not tied to any one faction (unlike wars, OC, and
// expenses, which now live in each FactionNetworthCard instead).
function InvestmentCard({ summaries, shownIds }) {
  const [collapsed, setCollapsed] = useState(false)

  const invMonthly     = shownIds.reduce((s, id) => s + (summaries[id]?.investments?.monthly_income ?? 0), 0)
  const invPrincipal   = shownIds.reduce((s, id) => s + (summaries[id]?.investments?.total_amount   ?? 0), 0)
  const stockMonthly   = shownIds.reduce((s, id) => s + (summaries[id]?.stocks?.monthly_income      ?? 0), 0)
  const stockInvested  = shownIds.reduce((s, id) => s + (summaries[id]?.stocks?.total_invested      ?? 0), 0)
  const companyMonthly = shownIds.reduce((s, id) => s + (summaries[id]?.companies?.monthly_income   ?? 0), 0)
  const companyPrincipal = shownIds.reduce((s, id) => s + (summaries[id]?.companies?.total_principal ?? 0), 0)
  const companyTotal   = shownIds.reduce((s, id) => s + (summaries[id]?.companies?.total            ?? 0), 0)
  const companyWithKey = shownIds.reduce((s, id) => s + (summaries[id]?.companies?.with_key         ?? 0), 0)

  const totalInvested = invPrincipal + stockInvested + companyPrincipal
  const totalMonthly  = invMonthly + stockMonthly + companyMonthly

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
    {
      label: 'Companies',
      sub: `${companyTotal} companies, ${companyWithKey} with API key — 30% of monthly profit`,
      principal: companyPrincipal,
      monthly: companyMonthly,
      partial: companyWithKey < companyTotal,
    },
  ]

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', overflow: 'hidden' }}>
      {/* Header */}
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
        <span style={{ color: "var(--text-faint)", fontSize: '12px', transition: 'transform 0.2s', display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
      </div>

      {!collapsed && (
        <div style={{ padding: '0 4px' }}>
          {rows.map((row, i) => (
            <div key={row.label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
              padding: '10px 16px',
              borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}>
              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                <div style={{ color: "var(--text-secondary)", fontSize: '13px' }}>{row.label}</div>
                <div style={{ color: "var(--text-faint)", fontSize: '11px', marginTop: '2px' }}>{row.sub}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ color: row.partial ? '#f97316' : '#f4f4f5', fontSize: '14px', fontWeight: '600' }}>
                  {fmt(row.monthly)}<span style={{ color: "var(--text-faint)", fontSize: '11px', fontWeight: '400' }}>/mo</span>
                  {row.partial && <span style={{ color: '#f97316', fontSize: '10px', marginLeft: '4px' }}>partial</span>}
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: '11px' }}>principal {fmt(row.principal)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer — split networth / monthly */}
      <div style={{
        padding: '12px 16px',
        background: 'rgba(255,255,255,0.02)',
        borderTop: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px',
      }}>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Principal</div>
            <div style={{ color: '#f4f4f5', fontSize: '16px', fontWeight: '700' }}>{fmt(totalInvested)}</div>
          </div>
          <div>
            <div style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Est. Monthly Profit</div>
            <div style={{ color: '#4ade80', fontSize: '16px', fontWeight: '700' }}>{fmt(totalMonthly)}<span style={{ color: "var(--text-faint)", fontSize: '11px', fontWeight: '400' }}>/mo</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FactionNetworthCard({ faction, settings, armoryValue = 0, racketValue = 0, summary }) {
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

  // Networth uses faction balance (vault − members) — can be negative, which is intentional
  const totalNetworth = respectEst + pointsEst + factionNet + armoryValue

  // Profit/expense streams that belong to this specific faction (unlike bank
  // investments/stocks/companies, which are owned by Occultus as a whole and
  // live in the separate Investments card below)
  const warMonthly     = summary?.wars?.monthly_income ?? 0
  const warCount       = summary?.wars?.count ?? 0
  const ocMonthly       = summary?.oc?.monthly_income ?? 0
  const ocConfigured    = summary?.oc?.configured ?? false
  const armoryExpense   = summary?.expenses?.armory?.monthly_cost ?? 0
  const armoryConfigured = summary?.expenses?.armory?.configured ?? false
  const odExpense       = summary?.expenses?.od_insurance?.monthly_cost ?? 0
  const odConfigured    = summary?.expenses?.od_insurance?.configured ?? false
  const odMembersWithOD = summary?.expenses?.od_insurance?.members_with_overdoses ?? 0
  const odOverdoses     = summary?.expenses?.od_insurance?.total_overdoses ?? 0
  const odUnitPrice     = summary?.expenses?.od_insurance?.unit_price ?? 0
  const perksExpense    = summary?.expenses?.rank_perks?.monthly_cost ?? 0
  const perksConfigured = summary?.expenses?.rank_perks?.configured ?? false
  const perksMembers    = summary?.expenses?.rank_perks?.eligible_members ?? 0
  const perksXanax      = summary?.expenses?.rank_perks?.total_xanax ?? 0
  const perksUnitPrice  = summary?.expenses?.rank_perks?.unit_price ?? 0

  const totalProfit   = racketValue + warMonthly + ocMonthly
  const totalExpenses = armoryExpense + odExpense + perksExpense
  const netMonthly     = totalProfit - totalExpenses

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

  const incomeRows = [
    {
      label: 'Rackets',
      sub: racketSub,
      value: racketValue,
      placeholder: racketValue === 0,
    },
    {
      label: 'Wars',
      sub: `${warCount} war${warCount !== 1 ? 's' : ''} paid out this month — faction's cut of the payout`,
      value: warMonthly,
    },
    {
      label: 'Organized Crime',
      sub: 'Not yet tracked',
      value: ocMonthly,
      placeholder: !ocConfigured,
    },
  ]

  const expenseRows = [
    { label: 'Armory Spend', sub: 'Not yet tracked', value: armoryExpense, configured: armoryConfigured },
    {
      label: 'OD Insurance',
      sub: odConfigured
        ? `${odMembersWithOD} member${odMembersWithOD !== 1 ? 's' : ''} overdosed this month — ${odOverdoses.toLocaleString()} xanax replaced @ $${odUnitPrice.toLocaleString()} each`
        : 'Not yet tracked',
      value: odExpense,
      configured: odConfigured,
    },
    {
      label: 'Rank Perks',
      sub: perksConfigured
        ? `${perksMembers} eligible member${perksMembers !== 1 ? 's' : ''} — ${perksXanax.toLocaleString()} xanax @ $${perksUnitPrice.toLocaleString()} each`
        : 'Not yet tracked',
      value: perksExpense,
      configured: perksConfigured,
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
          <span style={{ color: "var(--text-secondary)", fontSize: '12px', whiteSpace: 'nowrap' }}>ID: {basic.id}</span>
          <span style={{ color: "var(--text-faint)", fontSize: '12px', transition: 'transform 0.2s', display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
      </div>

      {/* Networth rows */}
      {!collapsed && <div style={{ padding: '0 4px' }}>
        {rows.map((row, i) => (
          <div key={row.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
            padding: '10px 16px',
            borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            background: row.derived ? 'rgba(255,255,255,0.015)' : 'transparent',
          }}>
            <div style={{ flex: '1 1 0', minWidth: 0, paddingRight: '8px' }}>
              <div style={{ color: row.derived ? "var(--text-muted)" : "var(--text-secondary)", fontSize: '13px' }}>{row.label}</div>
              {row.sub && (
                <div style={{ color: "var(--text-faint)", fontSize: '11px', marginTop: '2px', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{row.sub}</div>
              )}
            </div>
            <div style={{
              color: row.placeholder ? "var(--text-ghost)" : (row.color || '#f4f4f5'),
              fontSize: '14px', fontWeight: row.placeholder ? '400' : '600',
              fontStyle: row.placeholder ? 'italic' : 'normal',
              textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap',
            }}>
              {row.placeholder ? '—' : fmt(row.value)}
            </div>
          </div>
        ))}

        {/* Income — faction-specific profit streams */}
        <div style={{ padding: '10px 16px 4px', color: "var(--text-faint)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Income
        </div>
        {incomeRows.map((row, i) => (
          <div key={row.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
            padding: '10px 16px',
            borderBottom: i < incomeRows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
          }}>
            <div style={{ flex: '1 1 0', minWidth: 0, paddingRight: '8px' }}>
              <div style={{ color: "var(--text-secondary)", fontSize: '13px' }}>{row.label}</div>
              <div style={{ color: "var(--text-faint)", fontSize: '11px', marginTop: '2px' }}>{row.sub}</div>
            </div>
            <div style={{
              color: row.placeholder ? "var(--text-ghost)" : '#4ade80',
              fontSize: '14px', fontWeight: row.placeholder ? '400' : '600',
              fontStyle: row.placeholder ? 'italic' : 'normal',
              textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap',
            }}>
              {row.placeholder ? '—' : <>{fmt(row.value)}<span style={{ color: "var(--text-faint)", fontSize: '11px', fontWeight: '400' }}>/mo</span></>}
            </div>
          </div>
        ))}

        {/* Expenses — faction-specific costs */}
        <div style={{ padding: '10px 16px 4px', color: "var(--text-faint)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(248,113,113,0.03)' }}>
          Expenses
        </div>
        {expenseRows.map((row, i) => (
          <div key={row.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
            padding: '10px 16px',
            borderBottom: i < expenseRows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            background: 'rgba(248,113,113,0.03)',
          }}>
            <div style={{ flex: '1 1 0', minWidth: 0, paddingRight: '8px' }}>
              <div style={{ color: "var(--text-secondary)", fontSize: '13px' }}>{row.label}</div>
              <div style={{ color: "var(--text-faint)", fontSize: '11px', marginTop: '2px' }}>{row.sub}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {row.configured ? (
                <div style={{ color: '#f87171', fontSize: '14px', fontWeight: '600' }}>
                  −{fmt(row.value)}<span style={{ color: "var(--text-faint)", fontSize: '11px', fontWeight: '400' }}>/mo</span>
                </div>
              ) : (
                <div style={{ color: "var(--text-ghost)", fontSize: '14px', fontWeight: '400', fontStyle: 'italic' }}>—</div>
              )}
            </div>
          </div>
        ))}
      </div>}

      {/* Footer — networth / profit / expenses / net */}
      <div style={{
        padding: '12px 16px',
        background: 'rgba(255,255,255,0.02)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <div>
          <div style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Networth</div>
          <div style={{ color: '#f4f4f5', fontSize: '16px', fontWeight: '700' }}>{fmt(totalNetworth)}</div>
        </div>
        <div>
          <div style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Profit</div>
          <div style={{ color: '#4ade80', fontSize: '16px', fontWeight: '700' }}>
            {fmt(totalProfit)}<span style={{ color: "var(--text-faint)", fontSize: '11px', fontWeight: '400' }}>/mo</span>
          </div>
        </div>
        <div>
          <div style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Expenses</div>
          <div style={{ color: totalExpenses > 0 ? '#f87171' : "var(--text-muted)", fontSize: '16px', fontWeight: '700' }}>
            {fmt(totalExpenses)}<span style={{ color: "var(--text-faint)", fontSize: '11px', fontWeight: '400' }}>/mo</span>
          </div>
        </div>
        <div>
          <div style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net</div>
          <div style={{ color: netMonthly >= 0 ? '#4ade80' : '#f87171', fontSize: '16px', fontWeight: '700' }}>
            {fmt(netMonthly)}<span style={{ color: "var(--text-faint)", fontSize: '11px', fontWeight: '400' }}>/mo</span>
          </div>
        </div>
      </div>
    </div>
  )
}
