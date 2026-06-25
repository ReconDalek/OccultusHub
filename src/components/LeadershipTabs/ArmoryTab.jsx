import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'
import ArmoryConfigTab from './ArmoryConfigTab'

const FACTIONS = [
  { id: 33097, label: 'Occultus' },
  { id: 9728,  label: 'Occul2us' },
  { id: 9171,  label: 'Occul3us' },
]

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
const WEAPON_TYPE_ORDER  = ['Primary', 'Secondary', 'Melee']

function useIsMobile() {
  const [m, setM] = useState(() => window.innerWidth < 700)
  useEffect(() => {
    const h = () => setM(window.innerWidth < 700)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return m
}

function tabStyle(active) {
  return {
    padding: '7px 16px', fontWeight: '500', border: 'none', cursor: 'pointer',
    background: 'transparent', color: active ? '#f4f4f5' : '#a1a1aa',
    borderBottom: active ? '2px solid #b3123f' : '2px solid transparent',
    fontSize: '13px', whiteSpace: 'nowrap', transition: 'color 0.15s', flexShrink: 0,
  }
}

function formatValue(n) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toLocaleString()}`
}

// Merge armory API blocks → unified item map
// item_id → { ID, name, type, category, factions: { [fid]: { quantity, available, loaned, loaned_to } } }
function buildMergedItems(armory) {
  const map = new Map()
  for (const block of armory) {
    const fid = block.faction_id
    for (const [cat, catItems] of Object.entries(block.data)) {
      if (!Array.isArray(catItems)) continue
      for (const item of catItems) {
        if (!map.has(item.ID)) {
          map.set(item.ID, { ID: item.ID, name: item.name, type: item.type ?? '', category: cat, factions: {} })
        }
        map.get(item.ID).factions[fid] = {
          quantity:  item.quantity  ?? 0,
          available: item.available ?? item.quantity ?? 0,
          loaned:    item.loaned    ?? 0,
          loaned_to: item.loaned_to ?? null,
        }
      }
    }
  }
  return [...map.values()]
}

function getCategoryItems(merged, cat) {
  return merged.filter(i => i.category === cat).sort((a, b) => a.name.localeCompare(b.name))
}

// ── Loan detail expander ──────────────────────────────────────────────────────

function LoanExpandedRow({ item, members, colTemplate, isSimple }) {
  // One sub-row per faction that has loans
  const fWithLoans = FACTIONS.filter(f => (item.factions[f.id]?.loaned ?? 0) > 0)
  if (!fWithLoans.length) return null

  return (
    <div style={{ background: 'rgba(139,92,246,0.04)', borderTop: '1px solid rgba(139,92,246,0.1)' }}>
      {fWithLoans.map(f => {
        const fd  = item.factions[f.id]
        const ids = fd.loaned_to ? String(fd.loaned_to).split(',').filter(Boolean) : []
        const counts = {}
        for (const id of ids) { const t = id.trim(); counts[t] = (counts[t] || 0) + 1 }
        return (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 14px 5px 36px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: '#71717a', minWidth: '70px' }}>{f.label}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {Object.entries(counts).map(([id, qty]) => (
                <a key={id} href={`https://www.torn.com/profiles.php?XID=${id}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '11px', color: '#a78bfa', textDecoration: 'none', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '3px', padding: '1px 6px' }}>
                  {members[id]?.username || `#${id}`}{qty > 1 ? ` ×${qty}` : ''}
                </a>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Inventory rows ────────────────────────────────────────────────────────────

const MIN_COL = { 33097: 'min_33097', 9728: 'min_9728', 9171: 'min_9171' }

function isLow(itemId, factionId, qty, minMap) {
  const m = minMap[itemId]
  if (!m) return false
  const threshold = m[MIN_COL[factionId]]
  return !!threshold && qty < threshold
}

function ItemRow({ item, isSimple, members, colTemplate, expandedLoans, onToggleLoan, minMap }) {
  const totalLoaned = FACTIONS.reduce((s, f) => s + (item.factions[f.id]?.loaned ?? 0), 0)
  const hasLoans    = totalLoaned > 0
  const isExpanded  = expandedLoans.has(item.ID)

  return (
    <div>
      <div
        style={{
          display: 'grid', gridTemplateColumns: colTemplate, gap: '8px',
          padding: '7px 14px', borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.04)',
          alignItems: 'center', cursor: hasLoans ? 'pointer' : 'default',
          background: isExpanded ? 'rgba(139,92,246,0.04)' : 'transparent',
        }}
        onClick={() => hasLoans && onToggleLoan(item.ID)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          {hasLoans && (
            <span style={{ color: '#6d28d9', fontSize: '10px', flexShrink: 0 }}>{isExpanded ? '▼' : '▶'}</span>
          )}
          <span style={{ color: '#d4d4d8', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
        </div>
        {!isSimple && (
          <span style={{ color: '#71717a', fontSize: '12px' }}>{item.type}</span>
        )}
        {FACTIONS.map(f => {
          const fd  = item.factions[f.id]
          const qty = fd?.quantity ?? 0
          const low = isLow(item.ID, f.id, qty, minMap)

          if (!fd) {
            // Not in this faction's armory at all — treat as 0
            return (
              <span key={f.id} style={{
                color: low ? '#f87171' : '#3f3f46',
                fontWeight: low ? '600' : '400',
                fontSize: '13px', textAlign: 'center',
                background: low ? 'rgba(248,113,113,0.08)' : 'transparent',
                borderRadius: '4px', padding: low ? '1px 6px' : '0',
                display: 'inline-block',
              }}>
                {low ? '0' : '—'}
              </span>
            )
          }

          if (isSimple) {
            return (
              <span key={f.id} style={{
                color: low ? '#f87171' : qty ? '#f4f4f5' : '#52525b',
                fontWeight: '600', fontSize: '13px', textAlign: 'center',
                background: low ? 'rgba(248,113,113,0.08)' : 'transparent',
                borderRadius: '4px', padding: low ? '1px 6px' : '0',
                display: 'inline-block',
              }}>
                {qty.toLocaleString()}
              </span>
            )
          }

          const availLow = isLow(item.ID, f.id, fd.available, minMap)
          return (
            <div key={f.id} style={{ textAlign: 'center' }}>
              <span style={{
                color: availLow ? '#f87171' : fd.available === 0 ? '#52525b' : '#4ade80',
                fontWeight: '600', fontSize: '13px',
                background: availLow ? 'rgba(248,113,113,0.08)' : 'transparent',
                borderRadius: '4px', padding: availLow ? '1px 6px' : '0',
                display: 'inline-block',
              }}>
                {fd.available}
              </span>
              {fd.loaned > 0 && <span style={{ color: '#52525b', fontSize: '11px' }}>/{fd.quantity}</span>}
            </div>
          )
        })}
      </div>
      {isExpanded && (
        <LoanExpandedRow item={item} members={members} colTemplate={colTemplate} isSimple={isSimple} />
      )}
      {isExpanded && <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} />}
    </div>
  )
}

// ── Sub-type group (e.g. Primary, Secondary, Melee) ──────────────────────────

function SubTypeGroup({ type, items, isSimple, members, colTemplate, expandedLoans, onToggleLoan, collapsedTypes, onToggleType, minMap }) {
  const isOpen = !collapsedTypes.has(type)
  return (
    <div>
      <button
        onClick={() => onToggleType(type)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 14px', background: 'rgba(255,255,255,0.015)',
          border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: '600', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{type}</span>
        <span style={{ fontSize: '11px', color: '#3f3f46' }}>{items.length}</span>
        <span style={{ marginLeft: 'auto', color: '#3f3f46', fontSize: '10px' }}>{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && items.map(item => (
        <ItemRow key={item.ID} item={item} isSimple={isSimple} members={members} colTemplate={colTemplate}
          expandedLoans={expandedLoans} onToggleLoan={onToggleLoan} minMap={minMap} />
      ))}
    </div>
  )
}

// ── Category content ──────────────────────────────────────────────────────────

function CategoryContent({ cat, items, members, isMobile, minMap }) {
  const [expandedLoans,  setExpandedLoans]  = useState(new Set())
  const [collapsedTypes, setCollapsedTypes] = useState(new Set())

  const onToggleLoan = (id) => setExpandedLoans(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  const onToggleType = (t) => setCollapsedTypes(prev => {
    const next = new Set(prev); next.has(t) ? next.delete(t) : next.add(t); return next
  })

  const isSimple = SIMPLE_CATEGORIES.has(cat)

  // Column template
  const colTemplate = isSimple
    ? '1fr 90px 90px 90px'
    : '1fr 80px 100px 100px 100px'

  // Table header
  const header = (
    <div style={{ display: 'grid', gridTemplateColumns: colTemplate, gap: '8px', padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
      <span style={{ fontSize: '11px', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</span>
      {!isSimple && <span style={{ fontSize: '11px', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</span>}
      {FACTIONS.map(f => (
        <span key={f.id} style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>{f.label}</span>
      ))}
    </div>
  )

  if (!items.length) return (
    <div>
      {header}
      <p style={{ color: '#52525b', fontSize: '13px', padding: '12px 14px', margin: 0 }}>No items.</p>
    </div>
  )

  if (cat === 'weapons') {
    const byType = {}
    for (const item of items) {
      const t = item.type || 'Other'
      if (!byType[t]) byType[t] = []
      byType[t].push(item)
    }
    const types = [...WEAPON_TYPE_ORDER, ...Object.keys(byType).filter(t => !WEAPON_TYPE_ORDER.includes(t))].filter(t => byType[t]?.length)
    return (
      <div>
        {header}
        {types.map(type => (
          <SubTypeGroup key={type} type={type} items={byType[type]} isSimple={false}
            members={members} colTemplate={colTemplate}
            expandedLoans={expandedLoans} onToggleLoan={onToggleLoan}
            collapsedTypes={collapsedTypes} onToggleType={onToggleType} minMap={minMap} />
        ))}
      </div>
    )
  }

  return (
    <div>
      {header}
      {items.map(item => (
        <ItemRow key={item.ID} item={item} isSimple={isSimple} members={members} colTemplate={colTemplate}
          expandedLoans={expandedLoans} onToggleLoan={onToggleLoan} minMap={minMap} />
      ))}
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function ArmoryTab() {
  const [view,       setView]      = useState('inventory')
  const [category,   setCategory]  = useState('weapons')
  const [armory,     setArmory]    = useState([])
  const [members,    setMembers]   = useState({})
  const [minMap,     setMinMap]    = useState({}) // item_id → { min_33097, min_9171, min_9728 }
  const [loading,    setLoading]   = useState(true)
  const [error,      setError]     = useState(null)
  const [fetchedAt,  setFetchedAt] = useState(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    const token = localStorage.getItem('occultusSession')
    Promise.all([
      fetch(`${API_BASE_URL}/api/leadership/armory`, { headers: { Authorization: token } }).then(r => r.json()),
      fetch(`${API_BASE_URL}/api/leadership/armory/minimums`, { headers: { Authorization: token } }).then(r => r.json()).catch(() => ({ minimums: [] })),
    ]).then(([armoryData, minData]) => {
      if (armoryData.error) { setError(armoryData.error); return }
      setArmory(armoryData.armory || [])
      setMembers(armoryData.members || {})
      if (armoryData.armory?.length) {
        const latest = armoryData.armory.reduce((a, b) => a.fetched_at > b.fetched_at ? a : b)
        setFetchedAt(latest.fetched_at)
      }
      const map = {}
      for (const m of (minData.minimums || [])) map[m.item_id] = m
      setMinMap(map)
    })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const totalValue = armory.reduce((s, b) => s + (b.totalValue ?? 0), 0)
  const merged     = buildMergedItems(armory)

  // Which category tabs actually have data
  const activeCats = CATEGORIES.filter(c => merged.some(i => i.category === c.id))

  return (
    <div>
      {/* View tabs: Inventory | Config */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '24px' }}>
        <button onClick={() => setView('inventory')} style={tabStyle(view === 'inventory')}>Inventory</button>
        <button onClick={() => setView('config')}    style={tabStyle(view === 'config')}>Config</button>
      </div>

      {view === 'config' && <ArmoryConfigTab armory={armory} />}

      {view === 'inventory' && (
        <>
          {/* Header */}
          <div style={{ marginBottom: '20px' }}>
            <h2 className="font-cinzel" style={{ fontSize: '20px', color: '#f4f4f5', marginBottom: '4px' }}>Armory</h2>
            <p style={{ color: '#a1a1aa', fontSize: '13px', margin: 0 }}>
              Faction inventory — weapons, armor, supplies, and loan status. Click a loaned row to see who has it.
            </p>
            {fetchedAt && (
              <p style={{ color: '#52525b', fontSize: '11px', margin: '4px 0 0 0' }}>
                Updated {new Date(fetchedAt + 'Z').toLocaleString()}
              </p>
            )}
          </div>

          {/* Value summary cards */}
          {!loading && !error && armory.length > 0 && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <div className="p-3 rounded-lg" style={{ background: 'rgba(179,18,63,0.08)', border: '1px solid rgba(179,18,63,0.2)', minWidth: '140px' }}>
                <p style={{ color: '#71717a', fontSize: '11px', margin: '0 0 3px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Value</p>
                <p style={{ color: '#f4f4f5', fontSize: '18px', fontWeight: '700', margin: 0 }}>{formatValue(totalValue)}</p>
              </div>
              {armory.map(b => (
                <div key={b.faction_id} className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', minWidth: '130px' }}>
                  <p style={{ color: '#71717a', fontSize: '11px', margin: '0 0 3px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {FACTIONS.find(f => f.id === b.faction_id)?.label ?? b.faction_id}
                  </p>
                  <p style={{ color: '#f4f4f5', fontSize: '16px', fontWeight: '600', margin: 0 }}>{formatValue(b.totalValue ?? 0)}</p>
                </div>
              ))}
            </div>
          )}

          {loading && <p style={{ color: '#52525b', fontSize: '13px' }}>Loading armory data…</p>}
          {!loading && error && <p style={{ color: '#f87171', fontSize: '13px' }}>Error: {error}</p>}

          {!loading && !error && (
            <>
              {/* Category tabs — scrollable */}
              <div style={{
                display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '20px',
                overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none',
              }}>
                {CATEGORIES.map(c => {
                  const hasData = merged.some(i => i.category === c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => setCategory(c.id)}
                      style={{
                        ...tabStyle(category === c.id),
                        opacity: hasData ? 1 : 0.35,
                      }}
                    >
                      {c.label}
                    </button>
                  )
                })}
              </div>

              {/* Category content */}
              <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
                <CategoryContent
                  key={category}
                  cat={category}
                  items={getCategoryItems(merged, category)}
                  members={members}
                  isMobile={isMobile}
                  minMap={minMap}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
