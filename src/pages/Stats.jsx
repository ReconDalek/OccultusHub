import { useState } from 'react'
import WarStatsPanel from '../components/StatsTabs/WarStatsPanel'

const TABS = [
  { value: 'wars',   label: 'Wars' },
  { value: 'chains', label: 'Chains' },
]

export default function Stats() {
  const [tab, setTab] = useState('wars')

  return (
    <div style={{ color: '#f4f4f5', padding: '24px 20px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 className="font-cinzel" style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#f4f4f5', letterSpacing: '1px' }}>
          Faction Stats
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: '6px 0 0' }}>
          Career records for every member, across every faction.
        </p>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '20px' }}>
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            style={{
              padding: '10px 22px', background: 'transparent', border: 'none',
              borderBottom: tab === t.value ? '2px solid #b3123f' : '2px solid transparent',
              color: tab === t.value ? '#f4f4f5' : "var(--text-secondary)",
              fontWeight: tab === t.value ? '600' : '400', fontSize: '14px', cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'wars' && <WarStatsPanel />}
      {tab === 'chains' && (
        <p style={{ color: "var(--text-muted)", fontSize: '13px', padding: '20px 0' }}>
          Chain stats are coming soon.
        </p>
      )}
    </div>
  )
}
