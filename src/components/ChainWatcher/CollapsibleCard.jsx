import { useState } from 'react'
import { card, sectionTitle } from './chainWatcherUtils'

// Shared card shell for Chain Watch's panels (Shift Sign-Ups, Merit Tracker,
// Watch Totals) — collapses down to just the title. Expanded by default on
// every load unless defaultCollapsed is set (e.g. Chain Economics, which has
// enough columns/rows that starting collapsed is the better default) — not
// persisted either way, a fresh page load always starts at its default.
export default function CollapsibleCard({ title, headerExtra, children, defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  return (
    <div style={card}>
      <div className="flex items-center" style={{ justifyContent: 'space-between' }}>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
            cursor: 'pointer', padding: 0, color: 'inherit',
          }}
        >
          <span style={{
            fontSize: 10, color: 'var(--text-faint)', display: 'inline-block',
            transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s',
          }}>
            &#9662;
          </span>
          <span style={{ ...sectionTitle, margin: 0 }}>{title}</span>
        </button>
        {headerExtra}
      </div>
      {!collapsed && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  )
}
