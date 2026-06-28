import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../config/api'

const FACTION_COLS = [
  { id: 33097, key: 'min_33097', label: 'Occultus' },
  { id: 9728,  key: 'min_9728',  label: 'Occul2us' },
  { id: 9171,  key: 'min_9171',  label: 'Occul3us' },
]

const CATEGORY_ORDER = ['weapons', 'armor', 'temporary', 'medical', 'drugs', 'boosters', 'caches', 'cesium']

function catLabel(id) { return id.charAt(0).toUpperCase() + id.slice(1) }

// Build the full item list for config:
// - All items currently in any faction's armory cache
// - Plus any items that have saved minimums (even if at 0 stock everywhere now)
function buildConfigItems(armory, savedMinimums) {
  const seen = new Map() // item_id → { item_id, item_name, category }

  for (const block of armory) {
    for (const [category, items] of Object.entries(block.data)) {
      if (!Array.isArray(items)) continue
      for (const item of items) {
        if (!seen.has(item.ID)) {
          seen.set(item.ID, { item_id: item.ID, item_name: item.name, category })
        }
      }
    }
  }

  // Add items from minimums that aren't in the cache (0 stock in all factions)
  for (const m of savedMinimums) {
    if (!seen.has(m.item_id)) {
      seen.set(m.item_id, { item_id: m.item_id, item_name: m.item_name, category: m.category })
    }
  }

  return [...seen.values()]
}

function groupByCategory(items) {
  const groups = {}
  for (const item of items) {
    if (!groups[item.category]) groups[item.category] = []
    groups[item.category].push(item)
  }
  for (const cat of Object.keys(groups)) {
    groups[cat].sort((a, b) => a.item_name.localeCompare(b.item_name))
  }
  return groups
}

// armory prop passed down from ArmoryTab (already fetched)
export default function ArmoryConfigTab({ armory = [] }) {
  const [minimums, setMinimums]   = useState({}) // item_id → { min_33097, min_9171, min_9728 }
  const [savedRows, setSavedRows] = useState([]) // raw array from DB (needed for buildConfigItems)
  const [dirty, setDirty]         = useState({})
  const [collapsed, setCollapsed] = useState({})
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState(null)
  const [saveMsg, setSaveMsg]     = useState(null)

  const token = localStorage.getItem('occultusSession')

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/armory/minimums`, { headers: { Authorization: token } })
      .then(r => r.json())
      .then(({ minimums: rows, error }) => {
        if (error) throw new Error(error)
        setSavedRows(rows || [])
        const map = {}
        for (const m of (rows || [])) {
          map[m.item_id] = { min_33097: m.min_33097 ?? '', min_9171: m.min_9171 ?? '', min_9728: m.min_9728 ?? '' }
        }
        setMinimums(map)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleChange = useCallback((itemId, key, value) => {
    setDirty(prev => ({ ...prev, [itemId]: { ...(prev[itemId] || {}), [key]: value } }))
  }, [])

  const getValue = (itemId, key) => {
    if (dirty[itemId]?.[key] !== undefined) return dirty[itemId][key]
    return minimums[itemId]?.[key] ?? ''
  }

  const toggleCollapse = (cat) => setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }))

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)

    const allItems = buildConfigItems(armory, savedRows)
    const items = allItems.map(item => {
      const base  = minimums[item.item_id] || {}
      const delta = dirty[item.item_id]    || {}
      const merged = { ...base, ...delta }
      return {
        item_id:   item.item_id,
        item_name: item.item_name,
        category:  item.category,
        min_33097: Number(merged.min_33097) || null,
        min_9171:  Number(merged.min_9171)  || null,
        min_9728:  Number(merged.min_9728)  || null,
      }
    })

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/armory/minimums`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Save failed')

      // Re-fetch to sync savedRows (needed for zero-stock item persistence)
      const fresh = await fetch(`${API_BASE_URL}/api/admin/armory/minimums`, { headers: { Authorization: token } }).then(r => r.json())
      setSavedRows(fresh.minimums || [])
      const map = {}
      for (const m of (fresh.minimums || [])) {
        map[m.item_id] = { min_33097: m.min_33097 ?? '', min_9171: m.min_9171 ?? '', min_9728: m.min_9728 ?? '' }
      }
      setMinimums(map)
      setDirty({})
      setSaveMsg(`Saved — ${data.saved} minimums set, ${data.cleared} cleared`)
      setTimeout(() => setSaveMsg(null), 4000)
    } catch (e) {
      setSaveMsg(`Error: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const hasDirty = Object.keys(dirty).length > 0

  if (loading) return <p style={{ color: "var(--text-faint)", fontSize: '13px', padding: '16px 0' }}>Loading…</p>
  if (error)   return <p style={{ color: '#f87171', fontSize: '13px' }}>Error: {error}</p>

  const allItems    = buildConfigItems(armory, savedRows)
  const grouped     = groupByCategory(allItems)
  const orderedCats = [
    ...CATEGORY_ORDER.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c)),
  ]

  const configuredCount = Object.values(minimums).filter(m => m.min_33097 || m.min_9171 || m.min_9728).length

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '20px', color: '#f4f4f5', marginBottom: '4px' }}>Armory Minimums</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: '13px', margin: 0 }}>
            Set per-faction minimum quantities. Daily webhook alerts when items fall below threshold.
          </p>
          {configuredCount > 0 && (
            <p style={{ color: "var(--text-faint)", fontSize: '11px', margin: '4px 0 0 0' }}>
              {configuredCount} item{configuredCount !== 1 ? 's' : ''} with minimums configured
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {saveMsg && (
            <span style={{ fontSize: '12px', color: saveMsg.startsWith('Error') ? '#f87171' : '#4ade80' }}>{saveMsg}</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasDirty}
            style={{
              padding: '7px 18px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', border: 'none',
              cursor: saving || !hasDirty ? 'default' : 'pointer',
              background: saving || !hasDirty ? 'rgba(255,255,255,0.06)' : '#b3123f',
              color: saving || !hasDirty ? "var(--text-faint)" : '#f4f4f5',
              transition: 'all 0.15s',
            }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Column header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px', gap: '8px', padding: '6px 12px', marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize: '11px', color: "var(--text-faint)", textTransform: 'uppercase', letterSpacing: '0.05em' }}>Item</span>
        {FACTION_COLS.map(f => (
          <span key={f.id} style={{ fontSize: '11px', color: "var(--text-muted)", textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>{f.label}</span>
        ))}
      </div>

      {/* Categories */}
      {orderedCats.map(cat => {
        const items  = grouped[cat]
        const isOpen = !collapsed[cat]
        const catConfigured = items.filter(i =>
          getValue(i.item_id, 'min_33097') || getValue(i.item_id, 'min_9171') || getValue(i.item_id, 'min_9728')
        ).length

        return (
          <div key={cat} style={{ marginBottom: '8px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', overflow: 'hidden' }}>
            <button
              onClick={() => toggleCollapse(cat)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
              <span style={{ fontSize: '13px', fontWeight: '600', color: isOpen ? '#f4f4f5' : "var(--text-secondary)", transition: 'color 0.15s' }}>{catLabel(cat)}</span>
              <span style={{ fontSize: '11px', color: "var(--text-faint)" }}>
                {items.length} item{items.length !== 1 ? 's' : ''}
                {catConfigured > 0 && <> · <span style={{ color: '#b3123f' }}>{catConfigured} with min</span></>}
              </span>
              <span style={{ marginLeft: 'auto', color: "var(--text-faint)", fontSize: '11px' }}>{isOpen ? '▲' : '▼'}</span>
            </button>

            {isOpen && items.map(item => (
              <div
                key={item.item_id}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px', gap: '8px',
                  padding: '7px 12px', alignItems: 'center',
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                  background: dirty[item.item_id] ? 'rgba(179,18,63,0.04)' : 'transparent',
                }}
              >
                <span style={{ fontSize: '13px', color: '#d4d4d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.item_name}
                </span>
                {FACTION_COLS.map(f => (
                  <input
                    key={f.key}
                    type="number"
                    min="0"
                    placeholder="—"
                    value={getValue(item.item_id, f.key)}
                    onChange={e => handleChange(item.item_id, f.key, e.target.value)}
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '4px', color: '#f4f4f5', fontSize: '13px', padding: '4px 6px',
                      textAlign: 'center', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )
      })}

      {orderedCats.length === 0 && (
        <p style={{ color: "var(--text-faint)", fontSize: '13px', padding: '16px 0' }}>
          No armory data yet — cache populates on the next 6-hour cron.
        </p>
      )}
    </div>
  )
}
