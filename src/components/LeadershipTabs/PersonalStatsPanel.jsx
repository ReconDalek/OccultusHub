import { useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE_URL } from '../../config/api'

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return { Authorization: token }
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GB')
}

function fmtTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function monthLabel(year, month) {
  return new Date(Date.UTC(year, month, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function buildMonthOptions() {
  const now = new Date()
  const options = []
  for (let i = 0; i < 18; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    options.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() })
  }
  return options
}

function buildParams(mode, selectedMonth, customFrom, customTo) {
  if (mode === 'custom') return { from: customFrom, to: customTo }
  const { year, month } = selectedMonth
  const now = new Date()
  const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth()
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const to = isCurrentMonth
    ? now.toISOString().slice(0, 10)
    : new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)
  return { from, to }
}

// ─── Category definitions ──────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'attacking', label: 'Attacking',  keys: ['atk_won','atk_lost','def_won','def_lost','war_hits','respect','raid_hits','wall_joins'] },
  { id: 'support',   label: 'Support',    keys: ['revives','hosp','busts'] },
  { id: 'crimes',    label: 'Crimes',     keys: ['crimes','oc'] },
  { id: 'activity',  label: 'Activity',   keys: ['travel','active_time','drugs'] },
  { id: 'other',     label: 'Other',      keys: ['bounties','networth'] },
]

const FACTION_NAMES = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' }
const FACTION_COLORS = { 33097: '#b3123f', 9728: '#6d28d9', 9171: '#0e7490' }

// ─── Period picker ─────────────────────────────────────────────────────────────

function PeriodPicker({ mode, setMode, selectedMonth, setSelectedMonth, customFrom, setCustomFrom, customTo, setCustomTo, onApply }) {
  const months = buildMonthOptions()
  const now = new Date()

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '24px' }}>
      {['month', 'custom'].map(m => (
        <button
          key={m}
          onClick={() => setMode(m)}
          style={{
            padding: '7px 16px',
            borderRadius: '8px',
            border: `1px solid ${mode === m ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
            background: mode === m ? 'rgba(179,18,63,0.15)' : 'transparent',
            color: mode === m ? '#f4f4f5' : '#a1a1aa',
            fontSize: '13px',
            fontWeight: mode === m ? '600' : '400',
            cursor: 'pointer',
          }}
        >
          {m === 'month' ? 'By Month' : 'Custom Range'}
        </button>
      ))}

      {mode === 'month' && (
        <select
          value={`${selectedMonth.year}-${selectedMonth.month}`}
          onChange={e => {
            const [y, mo] = e.target.value.split('-').map(Number)
            setSelectedMonth({ year: y, month: mo })
          }}
          style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#18181b', color: '#f4f4f5', fontSize: '13px', cursor: 'pointer' }}
        >
          {months.map(({ year, month }) => (
            <option key={`${year}-${month}`} value={`${year}-${month}`}>
              {monthLabel(year, month)}
              {year === now.getUTCFullYear() && month === now.getUTCMonth() ? ' (this month)' : ''}
            </option>
          ))}
        </select>
      )}

      {mode === 'custom' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ color: '#a1a1aa', fontSize: '12px' }}>From</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#18181b', color: '#f4f4f5', fontSize: '13px' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ color: '#a1a1aa', fontSize: '12px' }}>To</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#18181b', color: '#f4f4f5', fontSize: '13px' }} />
          </div>
          <button
            onClick={onApply}
            style={{ padding: '7px 16px', borderRadius: '8px', border: '1px solid rgba(179,18,63,0.4)', background: 'rgba(179,18,63,0.15)', color: '#f4f4f5', fontSize: '13px', cursor: 'pointer' }}
          >
            Apply
          </button>
        </>
      )}
    </div>
  )
}

// ─── Faction filter ────────────────────────────────────────────────────────────

function FactionFilter({ value, onChange }) {
  const options = [
    { value: 'all', label: 'All Factions' },
    { value: '33097', label: 'Occultus' },
    { value: '9728',  label: 'Occul2us' },
    { value: '9171',  label: 'Occul3us' },
  ]
  return (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: '5px 14px',
            borderRadius: '8px',
            border: `1px solid ${value === o.value ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
            background: value === o.value ? 'rgba(179,18,63,0.12)' : 'transparent',
            color: value === o.value ? '#f4f4f5' : '#a1a1aa',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── Category tabs ─────────────────────────────────────────────────────────────

function CategoryTabs({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap' }}>
      {CATEGORIES.map(c => (
        <button
          key={c.id}
          onClick={() => onChange(c.id)}
          style={{
            padding: '5px 14px',
            borderRadius: '8px',
            border: `1px solid ${active === c.id ? 'rgba(109,40,217,0.5)' : 'rgba(255,255,255,0.08)'}`,
            background: active === c.id ? 'rgba(109,40,217,0.15)' : 'transparent',
            color: active === c.id ? '#f4f4f5' : '#a1a1aa',
            fontSize: '12px',
            fontWeight: active === c.id ? '600' : '400',
            cursor: 'pointer',
          }}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}

// ─── Stats table ───────────────────────────────────────────────────────────────

function StatsTable({ members, fields, categoryKeys, sortKey, setSortKey, sortDir, setSortDir }) {
  const visibleFields = fields.filter(f => categoryKeys.includes(f.key))

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...members].sort((a, b) => {
    const av = a.stats[sortKey] ?? 0
    const bv = b.stats[sortKey] ?? 0
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const maxVal = {}
  for (const f of visibleFields) {
    maxVal[f.key] = Math.max(1, ...members.map(m => m.stats[f.key] ?? 0))
  }

  const primaryKey = visibleFields[0]?.key

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '500px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <th style={{ textAlign: 'left', padding: '8px 12px', color: '#71717a', fontWeight: '500', width: '32px' }}>#</th>
            <th style={{ textAlign: 'left', padding: '8px 12px', color: '#71717a', fontWeight: '500' }}>Member</th>
            {visibleFields.map(f => (
              <th
                key={f.key}
                onClick={() => handleSort(f.key)}
                style={{
                  textAlign: 'right',
                  padding: '8px 12px',
                  color: sortKey === f.key ? '#c084fc' : '#71717a',
                  fontWeight: sortKey === f.key ? '600' : '500',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                }}
              >
                {f.label} {sortKey === f.key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, i) => {
            const pct = primaryKey ? Math.round(((m.stats[primaryKey] ?? 0) / maxVal[primaryKey]) * 100) : 0
            return (
              <tr
                key={m.id}
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                }}
              >
                <td style={{ padding: '8px 12px', color: '#52525b', fontSize: '11px' }}>{i + 1}</td>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div>
                      <div style={{ color: '#f4f4f5', fontWeight: '500' }}>{m.username}</div>
                      {m.faction_id && (
                        <div style={{ fontSize: '10px', color: FACTION_COLORS[m.faction_id] ?? '#52525b', marginTop: '1px' }}>
                          {FACTION_NAMES[m.faction_id] ?? `Faction ${m.faction_id}`}
                        </div>
                      )}
                    </div>
                    {primaryKey && (
                      <div style={{ flex: 1, maxWidth: '80px', height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#b3123f,#6d28d9)', borderRadius: '2px' }} />
                      </div>
                    )}
                  </div>
                </td>
                {visibleFields.map(f => (
                  <td
                    key={f.key}
                    style={{
                      padding: '8px 12px',
                      textAlign: 'right',
                      color: (m.stats[f.key] ?? 0) > 0 ? '#f4f4f5' : '#3f3f46',
                      fontWeight: sortKey === f.key ? '600' : '400',
                    }}
                  >
                    {f.key === 'active_time'
                      ? fmtTime(m.stats[f.key] ?? 0)
                      : fmt(m.stats[f.key] ?? 0)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ members, period, coverage }) {
  const activeCount = members.filter(m => Object.values(m.stats).some(v => v > 0)).length
  const totalWarHits = members.reduce((s, m) => s + (m.stats.war_hits ?? 0), 0)
  const totalRevives = members.reduce((s, m) => s + (m.stats.revives ?? 0), 0)
  const totalCrimes  = members.reduce((s, m) => s + (m.stats.crimes ?? 0), 0)

  const stats = [
    { label: 'Active Members', value: activeCount },
    { label: 'Total War Hits', value: fmt(totalWarHits) },
    { label: 'Total Revives',  value: fmt(totalRevives) },
    { label: 'Total Crimes',   value: fmt(totalCrimes) },
    { label: 'Days Covered',   value: coverage?.days_covered ?? 0 },
  ]

  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
      {stats.map(s => (
        <div key={s.label} style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '10px',
          padding: '10px 16px',
          minWidth: '110px',
        }}>
          <div style={{ color: '#a1a1aa', fontSize: '11px', marginBottom: '4px' }}>{s.label}</div>
          <div style={{ color: '#f4f4f5', fontSize: '18px', fontWeight: '600' }}>{s.value}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function PersonalStatsPanel() {
  const now = new Date()
  const [mode, setMode]                   = useState('month')
  const [selectedMonth, setSelectedMonth] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() })
  const [customFrom, setCustomFrom]       = useState('')
  const [customTo, setCustomTo]           = useState('')
  const [factionFilter, setFactionFilter] = useState('all')
  const [category, setCategory]           = useState('attacking')
  const [sortKey, setSortKey]             = useState('war_hits')
  const [sortDir, setSortDir]             = useState('desc')

  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [data, setData]         = useState(null)

  const abortRef = useRef(null)

  const fetchData = useCallback(async (params) => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams(params).toString()
      const res = await fetch(`${API_BASE_URL}/api/leadership/personal-stats?${qs}`, {
        headers: authHeaders(),
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const params = buildParams(mode, selectedMonth, customFrom, customTo)
    if (params.from && params.to) fetchData(params)
    return () => abortRef.current?.abort()
  }, [mode, selectedMonth, fetchData])

  useEffect(() => {
    // Reset sort to primary stat of category on category change
    const cat = CATEGORIES.find(c => c.id === category)
    if (cat) setSortKey(cat.keys[0])
  }, [category])

  const handleApply = () => {
    const params = buildParams('custom', selectedMonth, customFrom, customTo)
    if (params.from && params.to) fetchData(params)
  }

  const members = (data?.members ?? []).filter(m =>
    factionFilter === 'all' || String(m.faction_id) === factionFilter
  )

  const currentCat = CATEGORIES.find(c => c.id === category) ?? CATEGORIES[0]

  return (
    <div>
      <PeriodPicker
        mode={mode} setMode={setMode}
        selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth}
        customFrom={customFrom} setCustomFrom={setCustomFrom}
        customTo={customTo} setCustomTo={setCustomTo}
        onApply={handleApply}
      />

      <FactionFilter value={factionFilter} onChange={setFactionFilter} />

      {loading && (
        <div style={{ color: '#a1a1aa', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>
          Loading personal stats…
        </div>
      )}

      {error && (
        <div style={{ color: '#f87171', fontSize: '13px', padding: '16px', background: 'rgba(248,113,113,0.06)', borderRadius: '8px', marginBottom: '16px' }}>
          Failed to load: {error}
        </div>
      )}

      {!loading && data && (
        <>
          {data.coverage?.days_covered === 0 ? (
            <div style={{
              padding: '32px',
              textAlign: 'center',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              background: 'rgba(22,22,32,0.6)',
            }}>
              <div style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '8px' }}>No snapshot data for this period.</div>
              <div style={{ color: '#52525b', fontSize: '12px' }}>
                Personal stats are snapshotted daily at 03:00 UTC. Data will appear from the next cron run.
              </div>
            </div>
          ) : (
            <>
              <SummaryBar members={members} period={data.period} coverage={data.coverage} />
              {data.coverage && (
                <div style={{ color: '#52525b', fontSize: '11px', marginBottom: '12px' }}>
                  Snapshots: {data.coverage.earliest} → {data.coverage.latest} ({data.coverage.days_covered} day{data.coverage.days_covered !== 1 ? 's' : ''})
                </div>
              )}
              <CategoryTabs active={category} onChange={setCategory} />
              {members.length === 0 ? (
                <div style={{ color: '#a1a1aa', fontSize: '13px', padding: '24px 0', textAlign: 'center' }}>
                  No members match the current filter.
                </div>
              ) : (
                <StatsTable
                  members={members}
                  fields={data.fields ?? []}
                  categoryKeys={currentCat.keys}
                  sortKey={sortKey}
                  setSortKey={setSortKey}
                  sortDir={sortDir}
                  setSortDir={setSortDir}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
