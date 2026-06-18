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
  { id: 'overview',    label: 'Overview' },
  { id: 'investments', label: 'Investments' },
  { id: 'stocks',      label: 'Stocks' },
]

export default function AccountingTab() {
  const { user } = useSession()
  const [activeSubTab, setActiveSubTab] = useState('overview')
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
      {activeSubTab === 'overview'    && <OverviewSubTab summary={summary} factionId={factionId} onNavigate={setActiveSubTab} />}
      {activeSubTab === 'investments' && <InvestmentsSubTab factionId={factionId} />}
      {activeSubTab === 'stocks'      && <StocksSubTab factionId={factionId} />}
    </div>
  )
}

function OverviewSubTab({ summary, factionId, onNavigate }) {
  const inv = summary?.investments
  const stk = summary?.stocks

  return (
    <div>
      <h3 style={{ color: '#f4f4f5', fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>Accounting Overview</h3>
      <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '24px' }}>
        A first-glance summary of all accounting activity for the selected faction.
      </p>

      {!summary ? (
        <p style={{ color: '#a1a1aa', fontSize: '13px' }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Investments overview */}
          <OverviewSection
            title="Bank Investments"
            onNavigate={() => onNavigate('investments')}
            stats={[
              { label: 'Active Investments', value: inv.total },
              { label: 'Total Capital', value: inv.total_amount > 0 ? `£${inv.total_amount.toLocaleString()}` : '—' },
              { label: 'TCI Purchases Due', value: inv.tci_action_required, highlight: inv.tci_action_required > 0 },
            ]}
            note={
              inv.tci_action_required > 0
                ? `${inv.tci_action_required} investment${inv.tci_action_required > 1 ? 's have' : ' has'} a TCI purchase window open — action required.`
                : inv.total > 0
                ? 'All investments are within their holding period. No TCI action needed.'
                : 'No active investments recorded.'
            }
            noteHighlight={inv.tci_action_required > 0}
          />

          {/* Stocks overview */}
          <OverviewSection
            title="Stock Scheme"
            onNavigate={() => onNavigate('stocks')}
            stats={[
              { label: 'Members in Scheme', value: stk.total },
              { label: 'Est. Income / Period', value: stk.monthly_income > 0 ? `£${Math.round(stk.monthly_income).toLocaleString()}` : '—' },
            ]}
            note={
              stk.total > 0
                ? `${stk.total} member${stk.total > 1 ? 's are' : ' is'} contributing to the stock scheme.`
                : 'No stock scheme members recorded.'
            }
          />
        </div>
      )}
    </div>
  )
}

function OverviewSection({ title, stats, note, noteHighlight, onNavigate }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h4 style={{ color: '#f4f4f5', fontSize: '14px', fontWeight: '600', margin: 0 }}>{title}</h4>
        <button onClick={onNavigate} style={{
          background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '6px', color: '#a1a1aa', padding: '4px 12px',
          fontSize: '11px', cursor: 'pointer', transition: 'color 0.15s, border-color 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = '#f4f4f5'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
        >
          View
        </button>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {stats.map(s => (
          <div key={s.label} style={{
            flex: '1 1 120px',
            background: s.highlight ? 'rgba(179,18,63,0.10)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${s.highlight ? 'rgba(179,18,63,0.35)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: '8px', padding: '10px 14px',
          }}>
            <div style={{ color: '#a1a1aa', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ color: s.highlight ? '#ff6b8a' : '#f4f4f5', fontSize: '22px', fontWeight: '700', lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {note && (
        <p style={{
          margin: 0, fontSize: '12px',
          color: noteHighlight ? '#fca5a5' : '#a1a1aa',
          background: noteHighlight ? 'rgba(179,18,63,0.06)' : 'transparent',
          borderRadius: '6px', padding: noteHighlight ? '6px 10px' : '0',
        }}>{note}</p>
      )}
    </div>
  )
}
