import { useEffect, useState } from 'react'
import { apiGet, apiSend, card, sectionTitle, OCC_FACTIONS } from './chainWatcherUtils'

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)',
  color: '#f4f4f5', fontSize: 13, boxSizing: 'border-box',
}
const labelStyle = { color: 'var(--text-secondary)', fontSize: 12, display: 'block', marginBottom: 4 }
const btn = { padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }
const primaryBtn = { ...btn, background: '#b3123f', color: '#fff' }

const RANGE_PRESETS = [
  { value: 'month', label: 'This Month' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'all', label: 'All Time' },
  { value: 'custom', label: 'Custom' },
]

function pillStyle(active) {
  return {
    padding: '8px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
    border: `1px solid ${active ? '#b3123f' : 'rgba(255,255,255,0.1)'}`,
    background: active ? 'rgba(179,18,63,0.15)' : 'transparent',
    color: active ? '#f4f4f5' : 'var(--text-secondary)',
  }
}

// "To" runs through the END of that calendar day (midnight of the day
// after) — so picking the same day for both From and To still covers that
// whole day. Mirrors the same logic in the Occultus Operations userscript.
function computeRange(preset, customFrom, customTo) {
  const now = new Date()
  const to = Math.floor(now.getTime() / 1000)

  if (preset === 'custom') {
    const from = customFrom ? Math.floor(new Date(`${customFrom}T00:00:00`).getTime() / 1000) : 0
    let rangeTo = to
    if (customTo) {
      const toDate = new Date(`${customTo}T00:00:00`)
      toDate.setDate(toDate.getDate() + 1)
      rangeTo = Math.floor(toDate.getTime() / 1000)
    }
    return { from, to: rangeTo }
  }

  let from = 0
  if (preset === 'month') from = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000)
  else if (preset === '7d') from = to - 7 * 86400
  else if (preset === '30d') from = to - 30 * 86400
  return { from, to }
}

export default function WatcherXanaxTab() {
  const [factionId, setFactionId] = useState('all')
  const [preset, setPreset] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [members, setMembers] = useState([])
  const [itemName, setItemName] = useState('Xanax')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const range = computeRange(preset, customFrom, customTo)

  const load = async () => {
    if (preset === 'custom' && (!customFrom || !customTo)) { setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to })
      if (factionId !== 'all') params.set('faction_id', factionId)
      const json = await apiGet(`/api/leadership/watcher-xanax?${params.toString()}`)
      setMembers(json.members || [])
      setItemName(json.settings?.item_name || 'Xanax')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [factionId, preset, customFrom, customTo])

  const markPaid = async (m) => {
    setBusyId(m.torn_user_id)
    setError('')
    try {
      await apiSend('/api/leadership/watcher-xanax', 'POST', {
        torn_user_id: m.torn_user_id, from: range.from, to: range.to,
      })
      setMembers(prev => prev.filter(x => x.torn_user_id !== m.torn_user_id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const factionLabel = (id) => OCC_FACTIONS.find(f => f.id === id)?.label || id

  return (
    <div>
      <div style={card}>
        <p style={sectionTitle}>Watcher Xanax</p>
        <p style={{ color: 'var(--text-faint)', fontSize: 12, margin: '0 0 12px' }}>
          1 {itemName} per completed Chain Watch hour, not yet paid.
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Faction</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => setFactionId('all')} style={pillStyle(factionId === 'all')}>All</button>
              {OCC_FACTIONS.map(f => (
                <button key={f.id} type="button" onClick={() => setFactionId(f.id)} style={pillStyle(factionId === f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ minWidth: 160 }}>
            <label style={labelStyle}>Range</label>
            <select value={preset} onChange={e => setPreset(e.target.value)} style={inputStyle}>
              {RANGE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {preset === 'custom' && (
            <>
              <div>
                <label style={labelStyle}>From</label>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>To</label>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={inputStyle} />
              </div>
            </>
          )}
        </div>

        {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        {preset === 'custom' && (!customFrom || !customTo) ? (
          <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Pick a From and To date.</p>
        ) : loading ? (
          <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Loading…</p>
        ) : members.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No unpaid watched hours in this range.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map(m => (
              <div key={m.torn_user_id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                background: 'rgba(255,255,255,0.03)',
              }}>
                <span style={{ fontSize: 13 }}>
                  {m.username} <span style={{ color: 'var(--text-faint)', marginLeft: 6 }}>({factionLabel(m.faction_id)})</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, color: '#f4f4f5' }}>{m.quantity}h &rarr; {m.quantity} {itemName}</span>
                  <button
                    type="button"
                    disabled={busyId === m.torn_user_id}
                    onClick={() => markPaid(m)}
                    style={{ ...primaryBtn, padding: '6px 12px', opacity: busyId === m.torn_user_id ? 0.6 : 1 }}
                  >
                    {busyId === m.torn_user_id ? '…' : 'Mark Paid'}
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
