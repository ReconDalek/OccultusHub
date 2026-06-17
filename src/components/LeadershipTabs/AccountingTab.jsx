import { useState, useEffect } from 'react'
import { useSession } from '../../hooks/useSession'
import { API_BASE_URL } from '../../config/api'
import InvestmentsSubTab from './AccountingSubTabs/InvestmentsSubTab'
import StocksSubTab from './AccountingSubTabs/StocksSubTab'

const FACTION_OPTIONS = [
  { id: 33097, label: 'Occultus' },
  { id: 9728,  label: 'Occul2us' },
  { id: 9171,  label: 'Occul3us' },
]

const SUB_TABS = [
  { id: 'investments', label: '⚑ Investments' },
  { id: 'stocks',      label: '◈ Stocks' },
]

export default function AccountingTab() {
  const { user } = useSession()
  const [activeSubTab, setActiveSubTab] = useState('investments')
  const [factionId, setFactionId] = useState(33097)
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem('occultusSession')
    fetch(`${API_BASE_URL}/api/leadership/accounting/summary?faction_id=${factionId}`, {
      headers: { Authorization: token },
    })
      .then(r => r.json())
      .then(data => setSummary(data))
      .catch(() => {})
  }, [factionId])

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
        {/* Faction selector */}
        <select
          value={factionId}
          onChange={e => setFactionId(parseInt(e.target.value))}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#f4f4f5',
            borderRadius: '8px',
            padding: '6px 12px',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          {FACTION_OPTIONS.map(f => (
            <option key={f.id} value={f.id} style={{ background: '#1a1a2e' }}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '28px' }}>
          <SummaryCard
            label="Active Investments"
            value={summary.investments.total}
            sub={summary.investments.total_amount > 0 ? `£${summary.investments.total_amount.toLocaleString()}` : null}
          />
          <SummaryCard
            label="TCI Action Required"
            value={summary.investments.tci_action_required}
            highlight={summary.investments.tci_action_required > 0}
            sub="Buy window open"
          />
          <SummaryCard
            label="Stock Members"
            value={summary.stocks.total}
            sub={summary.stocks.monthly_income > 0 ? `~£${Math.round(summary.stocks.monthly_income).toLocaleString()} / period` : null}
          />
        </div>
      )}

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
      {activeSubTab === 'investments' && <InvestmentsSubTab factionId={factionId} />}
      {activeSubTab === 'stocks'      && <StocksSubTab factionId={factionId} />}
    </div>
  )
}

function SummaryCard({ label, value, sub, highlight }) {
  return (
    <div style={{
      background: highlight ? 'rgba(179,18,63,0.12)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${highlight ? 'rgba(179,18,63,0.4)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: '10px',
      padding: '14px 16px',
    }}>
      <div style={{ color: '#a1a1aa', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>{label}</div>
      <div style={{ color: highlight ? '#ff6b8a' : '#f4f4f5', fontSize: '28px', fontWeight: '700', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: '#a1a1aa', fontSize: '12px', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}
