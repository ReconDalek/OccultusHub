import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

const FACTION_OPTIONS = [
  { id: null,  label: 'All Factions' },
  { id: 33097, label: 'Occultus' },
  { id: 9728,  label: 'Occul2us' },
  { id: 9171,  label: 'Occul3us' },
]

const FACTION_LABELS = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' }

const CATEGORIES = [
  { id: 'weapons',   label: 'Weapons' },
  { id: 'armor',     label: 'Armor' },
  { id: 'temporary', label: 'Temporary' },
  { id: 'medical',   label: 'Medical' },
  { id: 'drugs',     label: 'Drugs' },
  { id: 'boosters',  label: 'Boosters' },
  { id: 'caches',    label: 'Caches' },
  { id: 'cesium',    label: 'Cesium' },
]

const SIMPLE_CATEGORIES = new Set(['medical', 'drugs', 'boosters', 'caches', 'cesium'])
const WEAPON_TYPE_ORDER = ['Primary', 'Secondary', 'Melee']

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

function pillStyle(active) {
  return {
    padding: '5px 14px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '500',
    border: active ? '1px solid #b3123f' : '1px solid rgba(255,255,255,0.1)',
    background: active ? 'rgba(179,18,63,0.15)' : 'transparent',
    color: active ? '#f4f4f5' : '#a1a1aa',
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  }
}

function categoryTabStyle(active) {
  return {
    padding: '7px 14px',
    fontWeight: '500',
    border: 'none',
    cursor: 'pointer',
    background: 'transparent',
    color: active ? '#f4f4f5' : '#a1a1aa',
    borderBottom: active ? '2px solid #b3123f' : '2px solid transparent',
    fontSize: '13px',
    whiteSpace: 'nowrap',
    transition: 'color 0.15s',
    flexShrink: 0,
  }
}

function LoanBadge({ count }) {
  if (!count) return null
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 7px',
      borderRadius: '10px',
      fontSize: '11px',
      fontWeight: '600',
      background: 'rgba(179,18,63,0.2)',
      color: '#f87171',
      border: '1px solid rgba(179,18,63,0.3)',
    }}>
      {count} out
    </span>
  )
}

function LoanDetail({ loanedTo, members }) {
  if (!loanedTo) return null
  const ids = String(loanedTo).split(',').filter(Boolean)
  const counts = {}
  for (const id of ids) {
    const trimmed = id.trim()
    counts[trimmed] = (counts[trimmed] || 0) + 1
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
      {Object.entries(counts).map(([id, qty]) => {
        const name = members[id]?.username || `#${id}`
        return (
          <a
            key={id}
            href={`https://www.torn.com/profiles.php?XID=${id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '11px',
              color: '#a78bfa',
              textDecoration: 'none',
              background: 'rgba(139,92,246,0.1)',
              border: '1px solid rgba(139,92,246,0.2)',
              borderRadius: '4px',
              padding: '1px 6px',
            }}
          >
            {name}{qty > 1 ? ` ×${qty}` : ''}
          </a>
        )
      })}
    </div>
  )
}

// ── Desktop table views ──────────────────────────────────────────────────────

const TH = ({ children }) => (
  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#71717a', fontWeight: '500', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
    {children}
  </th>
)

function SimpleTable({ items }) {
  if (!items?.length) return <Empty />
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <TH>Name</TH><TH>Type</TH><TH>Quantity</TH>
        </tr>
      </thead>
      <tbody>
        {items.map(item => (
          <tr key={item.ID} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <td style={{ padding: '9px 12px', color: '#f4f4f5' }}>{item.name}</td>
            <td style={{ padding: '9px 12px', color: '#a1a1aa' }}>{item.type}</td>
            <td style={{ padding: '9px 12px', color: '#f4f4f5', fontWeight: '600' }}>{item.quantity.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function LoanTable({ items, members }) {
  if (!items?.length) return <Empty />
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <TH>Name</TH><TH>Type</TH><TH>Total</TH><TH>Avail.</TH><TH>Loaned</TH>
        </tr>
      </thead>
      <tbody>
        {items.map(item => (
          <tr key={item.ID} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <td style={{ padding: '9px 12px', color: '#f4f4f5' }}>{item.name}</td>
            <td style={{ padding: '9px 12px', color: '#a1a1aa' }}>{item.type}</td>
            <td style={{ padding: '9px 12px', color: '#f4f4f5', fontWeight: '600' }}>{item.quantity}</td>
            <td style={{ padding: '9px 12px', color: item.available === 0 ? '#71717a' : '#4ade80' }}>{item.available}</td>
            <td style={{ padding: '9px 12px' }}>
              <LoanBadge count={item.loaned} />
              <LoanDetail loanedTo={item.loaned_to} members={members} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Mobile card views ────────────────────────────────────────────────────────

function SimpleCards({ items }) {
  if (!items?.length) return <Empty />
  return (
    <div style={{ padding: '8px' }}>
      {items.map(item => (
        <div key={item.ID} style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 8px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          gap: '8px',
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ color: '#f4f4f5', fontSize: '13px', margin: 0, fontWeight: '500' }}>{item.name}</p>
            <p style={{ color: '#71717a', fontSize: '11px', margin: '2px 0 0 0' }}>{item.type}</p>
          </div>
          <span style={{ color: '#f4f4f5', fontWeight: '700', fontSize: '15px', flexShrink: 0 }}>
            {item.quantity.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

function LoanCards({ items, members }) {
  if (!items?.length) return <Empty />
  return (
    <div style={{ padding: '8px' }}>
      {items.map(item => (
        <div key={item.ID} style={{
          padding: '10px 8px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          {/* Row 1: name + qty badges */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: item.loaned ? '6px' : 0 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ color: '#f4f4f5', fontSize: '13px', margin: 0, fontWeight: '500' }}>{item.name}</p>
              <p style={{ color: '#71717a', fontSize: '11px', margin: '2px 0 0 0' }}>{item.type}</p>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '11px', color: '#a1a1aa' }}>
                <span style={{ color: item.available === 0 ? '#71717a' : '#4ade80', fontWeight: '600' }}>{item.available}</span>
                <span style={{ color: '#52525b' }}>/{item.quantity}</span>
              </span>
              <LoanBadge count={item.loaned} />
            </div>
          </div>
          {/* Row 2: loaned-to names */}
          {item.loaned > 0 && (
            <LoanDetail loanedTo={item.loaned_to} members={members} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Shared content blocks ────────────────────────────────────────────────────

function Empty() {
  return <p style={{ color: '#52525b', fontSize: '13px', padding: '16px 12px' }}>No items.</p>
}

function WeaponsBlock({ items, members, isMobile }) {
  if (!items?.length) return <Empty />
  const grouped = {}
  for (const item of items) {
    const t = item.type || 'Other'
    if (!grouped[t]) grouped[t] = []
    grouped[t].push(item)
  }
  const typeOrder = [...WEAPON_TYPE_ORDER, ...Object.keys(grouped).filter(t => !WEAPON_TYPE_ORDER.includes(t))]
  return (
    <div>
      {typeOrder.filter(t => grouped[t]?.length).map(type => (
        <div key={type}>
          <div style={{
            padding: '6px 12px',
            fontSize: '11px',
            fontWeight: '600',
            color: '#71717a',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            background: 'rgba(255,255,255,0.02)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            {type}
          </div>
          {isMobile
            ? <LoanCards items={grouped[type]} members={members} />
            : <LoanTable items={grouped[type]} members={members} />
          }
        </div>
      ))}
    </div>
  )
}

function FactionBlock({ factionId, data, members, category, isMobile }) {
  const items = data[category] || []
  const isSimple = SIMPLE_CATEGORIES.has(category)

  let content
  if (category === 'weapons') {
    content = <WeaponsBlock items={items} members={members} isMobile={isMobile} />
  } else if (isSimple) {
    content = isMobile ? <SimpleCards items={items} /> : <SimpleTable items={items} />
  } else {
    content = isMobile ? <LoanCards items={items} members={members} /> : <LoanTable items={items} members={members} />
  }

  const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0)
  const totalLoaned = isSimple ? 0 : items.reduce((s, i) => s + (i.loaned || 0), 0)

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '11px',
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: '#b3123f',
          borderLeft: '2px solid #b3123f',
          paddingLeft: '8px',
        }}>
          {FACTION_LABELS[factionId] || `Faction ${factionId}`}
        </span>
        <span style={{ fontSize: '11px', color: '#52525b' }}>
          {items.length} type{items.length !== 1 ? 's' : ''}
          {items.length > 0 && <> · {totalQty.toLocaleString()} total</>}
          {!isSimple && items.length > 0 && totalLoaned > 0 && <> · {totalLoaned} loaned</>}
        </span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
        {content}
      </div>
    </div>
  )
}

// ── Main tab ─────────────────────────────────────────────────────────────────

export default function ArmoryTab() {
  const [factionId, setFactionId] = useState(null)
  const [category, setCategory] = useState('weapons')
  const [armory, setArmory] = useState([])
  const [members, setMembers] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [fetchedAt, setFetchedAt] = useState(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    const params = factionId ? `?faction_id=${factionId}` : ''
    const token = localStorage.getItem('occultusSession')
    setLoading(true)
    fetch(`${API_BASE_URL}/api/leadership/armory${params}`, { headers: { Authorization: token } })
      .then(r => r.json())
      .then(({ armory, members, error }) => {
        if (error) { setError(error); return }
        setArmory(armory || [])
        setMembers(members || {})
        if (armory?.length) {
          const latest = armory.reduce((a, b) => (a.fetched_at > b.fetched_at ? a : b))
          setFetchedAt(latest.fetched_at)
        }
        setError(null)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [factionId])

  const factionBlocks = factionId
    ? armory.filter(a => a.faction_id === factionId)
    : armory

  const totalValue = factionBlocks.reduce((s, b) => s + (b.totalValue ?? 0), 0)

  function formatValue(n) {
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
    if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`
    return `$${n.toLocaleString()}`
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '20px', color: '#f4f4f5', marginBottom: '4px' }}>
            Armory
          </h2>
          <p style={{ color: '#a1a1aa', fontSize: '13px', margin: 0 }}>
            Faction inventory — weapons, armor, supplies, and loan status.
          </p>
          {fetchedAt && (
            <p style={{ color: '#52525b', fontSize: '11px', margin: '4px 0 0 0' }}>
              Updated {new Date(fetchedAt + 'Z').toLocaleString()}
            </p>
          )}
        </div>

        {/* Faction pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {FACTION_OPTIONS.map(f => (
            <button
              key={String(f.id)}
              onClick={() => setFactionId(f.id)}
              style={pillStyle(factionId === f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Armory value summary */}
      {!loading && !error && factionBlocks.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {factionBlocks.length > 1 && (
            <div className="p-3 rounded-lg" style={{ background: 'rgba(179,18,63,0.08)', border: '1px solid rgba(179,18,63,0.2)', minWidth: '140px' }}>
              <p style={{ color: '#71717a', fontSize: '11px', margin: '0 0 3px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Value</p>
              <p style={{ color: '#f4f4f5', fontSize: '18px', fontWeight: '700', margin: 0 }}>{formatValue(totalValue)}</p>
            </div>
          )}
          {factionBlocks.map(b => (
            <div key={b.faction_id} className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', minWidth: '130px' }}>
              <p style={{ color: '#71717a', fontSize: '11px', margin: '0 0 3px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{FACTION_LABELS[b.faction_id]}</p>
              <p style={{ color: '#f4f4f5', fontSize: '16px', fontWeight: '600', margin: 0 }}>{formatValue(b.totalValue ?? 0)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Category tabs — horizontally scrollable, hidden scrollbar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        marginBottom: '24px',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}>
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCategory(c.id)} style={categoryTabStyle(category === c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && (
        <p style={{ color: '#52525b', fontSize: '13px' }}>Loading armory data…</p>
      )}
      {!loading && error && (
        <p style={{ color: '#f87171', fontSize: '13px' }}>Error: {error}</p>
      )}
      {!loading && !error && !factionBlocks.length && (
        <p style={{ color: '#52525b', fontSize: '13px' }}>
          No armory data yet — cache populates on the next 6-hour cron.
        </p>
      )}
      {!loading && !error && factionBlocks.map(block => (
        <FactionBlock
          key={block.faction_id}
          factionId={block.faction_id}
          data={block.data}
          members={members}
          category={category}
          isMobile={isMobile}
        />
      ))}
    </div>
  )
}
