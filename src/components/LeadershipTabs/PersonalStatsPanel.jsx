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

function buildParams(mode, selectedMonth, customFrom, customTo, customDay) {
  if (mode === 'custom') return { from: customFrom, to: customTo }
  if (mode === 'day')    return { from: customDay, to: customDay }
  const { year, month } = selectedMonth
  const now = new Date()
  const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth()
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const to = isCurrentMonth
    ? now.toISOString().slice(0, 10)
    : new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)
  return { from, to }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'attacking', label: 'Attacking',  keys: ['atk_won','atk_lost','def_won','def_lost','war_hits','respect','raid_hits','wall_joins'] },
  { id: 'support',   label: 'Support',    keys: ['revives','hosp','busts'] },
  { id: 'crimes',    label: 'Crimes',     keys: ['crimes','oc'] },
  { id: 'activity',  label: 'Activity',   keys: ['travel','active_time','drugs'] },
  { id: 'other',     label: 'Other',      keys: ['bounties','networth'] },
]

const FACTION_NAMES  = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' }
const FACTION_COLORS = { 33097: '#b3123f', 9728: '#6d28d9', 9171: '#0e7490' }
const SERIES_COLORS  = ['#f43f5e', '#8b5cf6', '#22d3ee', '#f97316']

// ─── Period picker ─────────────────────────────────────────────────────────────

const psDateInput = {
  padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
  background: '#18181b', color: '#f4f4f5', fontSize: '13px',
}

function PeriodPicker({ mode, setMode, selectedMonth, setSelectedMonth, customFrom, setCustomFrom, customTo, setCustomTo, customDay, setCustomDay, onApply, minDate }) {
  const months = buildMonthOptions()
  const now = new Date()

  const isMonthBeforeData = (year, month) => {
    if (!minDate) return false
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)
    return lastDay < minDate
  }

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '24px' }}>
      {[['month', 'By Month'], ['day', 'Per Day'], ['custom', 'Custom Range']].map(([m, label]) => (
        <button key={m} onClick={() => setMode(m)} style={{
          padding: '7px 16px', borderRadius: '8px',
          border: `1px solid ${mode === m ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
          background: mode === m ? 'rgba(179,18,63,0.15)' : 'transparent',
          color: mode === m ? '#f4f4f5' : '#a1a1aa', fontSize: '13px',
          fontWeight: mode === m ? '600' : '400', cursor: 'pointer',
        }}>
          {label}
        </button>
      ))}

      {mode === 'month' && (
        <select
          value={`${selectedMonth.year}-${selectedMonth.month}`}
          onChange={e => { const [y, mo] = e.target.value.split('-').map(Number); setSelectedMonth({ year: y, month: mo }) }}
          style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#18181b', color: '#f4f4f5', fontSize: '13px', cursor: 'pointer' }}
        >
          {months.map(({ year, month }) => {
            const isCurrent = year === now.getUTCFullYear() && month === now.getUTCMonth()
            const noData = isMonthBeforeData(year, month)
            return (
              <option key={`${year}-${month}`} value={`${year}-${month}`} disabled={noData} style={{ color: noData ? '#52525b' : '#f4f4f5' }}>
                {monthLabel(year, month)}{isCurrent ? ' (this month)' : ''}{noData ? ' — no data' : ''}
              </option>
            )
          })}
        </select>
      )}

      {mode === 'day' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ color: '#a1a1aa', fontSize: '12px' }}>Date (UTC)</label>
          <input type="date" value={customDay} min={minDate} onChange={e => setCustomDay(e.target.value)} style={psDateInput} />
        </div>
      )}

      {mode === 'custom' && (
        <>
          {[['From', customFrom, setCustomFrom], ['To', customTo, setCustomTo]].map(([lbl, val, setter]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ color: '#a1a1aa', fontSize: '12px' }}>{lbl}</label>
              <input type="date" value={val} min={minDate} onChange={e => setter(e.target.value)} style={psDateInput} />
            </div>
          ))}
        </>
      )}

      <button onClick={onApply} style={{
        padding: '7px 16px', borderRadius: '8px', border: '1px solid rgba(179,18,63,0.4)',
        background: 'rgba(179,18,63,0.15)', color: '#f4f4f5', fontSize: '13px', cursor: 'pointer',
      }}>Apply</button>
    </div>
  )
}

// ─── Faction filter ────────────────────────────────────────────────────────────

function FactionFilter({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
      {[['all','All Factions'],['33097','Occultus'],['9728','Occul2us'],['9171','Occul3us']].map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: '5px 14px', borderRadius: '8px',
          border: `1px solid ${value === v ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
          background: value === v ? 'rgba(179,18,63,0.12)' : 'transparent',
          color: value === v ? '#f4f4f5' : '#a1a1aa', fontSize: '12px', cursor: 'pointer',
        }}>{l}</button>
      ))}
    </div>
  )
}

// ─── Category tabs ─────────────────────────────────────────────────────────────

function CategoryTabs({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap' }}>
      {CATEGORIES.map(c => (
        <button key={c.id} onClick={() => onChange(c.id)} style={{
          padding: '5px 14px', borderRadius: '8px',
          border: `1px solid ${active === c.id ? 'rgba(109,40,217,0.5)' : 'rgba(255,255,255,0.08)'}`,
          background: active === c.id ? 'rgba(109,40,217,0.15)' : 'transparent',
          color: active === c.id ? '#f4f4f5' : '#a1a1aa', fontSize: '12px',
          fontWeight: active === c.id ? '600' : '400', cursor: 'pointer',
        }}>{c.label}</button>
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
    const av = a.stats[sortKey] ?? 0; const bv = b.stats[sortKey] ?? 0
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const maxVal = {}
  for (const f of visibleFields) maxVal[f.key] = Math.max(1, ...members.map(m => m.stats[f.key] ?? 0))
  const primaryKey = visibleFields[0]?.key

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '500px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <th style={{ textAlign: 'left', padding: '8px 12px', color: '#71717a', fontWeight: '500', width: '32px' }}>#</th>
            <th style={{ textAlign: 'left', padding: '8px 12px', color: '#71717a', fontWeight: '500' }}>Member</th>
            {visibleFields.map(f => (
              <th key={f.key} onClick={() => handleSort(f.key)} style={{
                textAlign: 'right', padding: '8px 12px',
                color: sortKey === f.key ? '#c084fc' : '#71717a',
                fontWeight: sortKey === f.key ? '600' : '500',
                cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
              }}>
                {f.label} {sortKey === f.key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, i) => {
            const pct = primaryKey ? Math.round(((m.stats[primaryKey] ?? 0) / maxVal[primaryKey]) * 100) : 0
            return (
              <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
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
                  <td key={f.key} style={{
                    padding: '8px 12px', textAlign: 'right',
                    color: (m.stats[f.key] ?? 0) > 0 ? '#f4f4f5' : '#3f3f46',
                    fontWeight: sortKey === f.key ? '600' : '400',
                  }}>
                    {f.key === 'active_time' ? fmtTime(m.stats[f.key] ?? 0) : fmt(m.stats[f.key] ?? 0)}
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

function SummaryBar({ members, coverage }) {
  const activeCount    = members.filter(m => Object.values(m.stats).some(v => v > 0)).length
  const totalWarHits   = members.reduce((s, m) => s + (m.stats.war_hits ?? 0), 0)
  const totalRevives   = members.reduce((s, m) => s + (m.stats.revives ?? 0), 0)
  const totalCrimes    = members.reduce((s, m) => s + (m.stats.crimes ?? 0), 0)

  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
      {[
        ['Active Members', activeCount],
        ['Total War Hits', fmt(totalWarHits)],
        ['Total Revives',  fmt(totalRevives)],
        ['Total Crimes',   fmt(totalCrimes)],
        ['Days Covered',   coverage?.days_covered ?? 0],
      ].map(([l, v]) => (
        <div key={l} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '10px 16px', minWidth: '110px' }}>
          <div style={{ color: '#a1a1aa', fontSize: '11px', marginBottom: '4px' }}>{l}</div>
          <div style={{ color: '#f4f4f5', fontSize: '18px', fontWeight: '600' }}>{v}</div>
        </div>
      ))}
    </div>
  )
}

// ─── SVG Line Chart ────────────────────────────────────────────────────────────

const PAD = { top: 24, right: 24, bottom: 56, left: 62 }
const W = 760, H = 280
const INNER_W = W - PAD.left - PAD.right
const INNER_H = H - PAD.top  - PAD.bottom

function LineChart({ series, statLabel }) {
  const [tooltip, setTooltip] = useState(null)

  // Collect all dates across all series
  const allDates = [...new Set(series.flatMap(s => s.points.map(p => p.date)))].sort()
  if (!allDates.length) return (
    <div style={{ color: '#52525b', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>
      No data points in range.
    </div>
  )

  const maxDelta = Math.max(1, ...series.flatMap(s => s.points.map(p => p.delta)))

  function xOf(date) {
    const i = allDates.indexOf(date)
    if (allDates.length === 1) return INNER_W / 2
    return (i / (allDates.length - 1)) * INNER_W
  }
  function yOf(delta) {
    return INNER_H - (delta / maxDelta) * INNER_H
  }

  // Y axis ticks — up to 5
  const tickCount = Math.min(5, maxDelta)
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((maxDelta / tickCount) * i))

  // X axis labels — show at most 8 evenly spaced
  const xLabelStep = Math.max(1, Math.ceil(allDates.length / 8))
  const xLabels = allDates.filter((_, i) => i % xLabelStep === 0 || i === allDates.length - 1)

  function fmtDate(d) {
    const [, m, day] = d.split('-')
    return `${day}/${m}`
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', overflow: 'visible' }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Grid lines */}
        {yTicks.map(tick => {
          const y = yOf(tick)
          return (
            <g key={tick}>
              <line
                x1={PAD.left} y1={PAD.top + y}
                x2={PAD.left + INNER_W} y2={PAD.top + y}
                stroke="rgba(255,255,255,0.06)" strokeWidth="1"
              />
              <text
                x={PAD.left - 8} y={PAD.top + y + 4}
                textAnchor="end" fill="#52525b" fontSize="10"
              >
                {tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : tick}
              </text>
            </g>
          )
        })}

        {/* X axis labels */}
        {xLabels.map(date => (
          <text
            key={date}
            x={PAD.left + xOf(date)} y={PAD.top + INNER_H + 18}
            textAnchor="middle" fill="#52525b" fontSize="10"
          >
            {fmtDate(date)}
          </text>
        ))}

        {/* Y axis label */}
        <text
          x={14} y={PAD.top + INNER_H / 2}
          textAnchor="middle" fill="#71717a" fontSize="10"
          transform={`rotate(-90, 14, ${PAD.top + INNER_H / 2})`}
        >
          {statLabel}
        </text>

        {/* Series lines */}
        {series.map((s, si) => {
          const color = SERIES_COLORS[si % SERIES_COLORS.length]
          if (!s.points.length) return null
          const pts = s.points.map(p => `${PAD.left + xOf(p.date)},${PAD.top + yOf(p.delta)}`).join(' ')
          return (
            <g key={s.id}>
              <polyline
                points={pts}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.9"
              />
              {/* Area fill */}
              <polygon
                points={`${PAD.left + xOf(s.points[0].date)},${PAD.top + INNER_H} ${pts} ${PAD.left + xOf(s.points[s.points.length - 1].date)},${PAD.top + INNER_H}`}
                fill={color}
                opacity="0.06"
              />
              {/* Data points — hit targets */}
              {s.points.map((p, pi) => (
                <circle
                  key={pi}
                  cx={PAD.left + xOf(p.date)} cy={PAD.top + yOf(p.delta)}
                  r="5"
                  fill="transparent"
                  stroke="transparent"
                  onMouseEnter={() => setTooltip({ x: PAD.left + xOf(p.date), y: PAD.top + yOf(p.delta), date: p.date, delta: p.delta, username: s.username, color })}
                  style={{ cursor: 'crosshair' }}
                />
              ))}
              {/* Visible dots */}
              {s.points.map((p, pi) => (
                <circle
                  key={`dot-${pi}`}
                  cx={PAD.left + xOf(p.date)} cy={PAD.top + yOf(p.delta)}
                  r="3" fill={color} stroke="#0d0d14" strokeWidth="1.5"
                  style={{ pointerEvents: 'none' }}
                />
              ))}
            </g>
          )
        })}

        {/* Tooltip vertical line */}
        {tooltip && (
          <line
            x1={tooltip.x} y1={PAD.top}
            x2={tooltip.x} y2={PAD.top + INNER_H}
            stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,3"
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>

      {/* Floating tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          top: `${(tooltip.y / H) * 100}%`,
          left: `${(tooltip.x / W) * 100}%`,
          transform: tooltip.x > W * 0.6 ? 'translate(-110%,-50%)' : 'translate(12px,-50%)',
          background: 'rgba(10,10,18,0.95)',
          border: `1px solid ${tooltip.color}44`,
          borderRadius: '8px',
          padding: '8px 12px',
          fontSize: '12px',
          pointerEvents: 'none',
          zIndex: 10,
          whiteSpace: 'nowrap',
        }}>
          <div style={{ color: tooltip.color, fontWeight: '600', marginBottom: '2px' }}>{tooltip.username}</div>
          <div style={{ color: '#a1a1aa' }}>{tooltip.date}</div>
          <div style={{ color: '#f4f4f5', fontWeight: '600', marginTop: '2px' }}>+{fmt(tooltip.delta)}</div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '8px', justifyContent: 'center' }}>
        {series.map((s, si) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <div style={{ width: '12px', height: '3px', background: SERIES_COLORS[si % SERIES_COLORS.length], borderRadius: '2px' }} />
            <span style={{ color: '#d4d4d8' }}>{s.username ?? `ID ${s.id}`}</span>
            {s.faction_id && (
              <span style={{ color: FACTION_COLORS[s.faction_id] ?? '#52525b', fontSize: '10px' }}>
                {FACTION_NAMES[s.faction_id] ?? ''}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Compare panel ─────────────────────────────────────────────────────────────

function ComparePanel({ allMembers, allFields, minDate }) {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const [mode, setMode]                   = useState('month')
  const [selectedMonth, setSelectedMonth] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() })
  const [customFrom, setCustomFrom]       = useState('')
  const [customTo, setCustomTo]           = useState('')
  const [customDay, setCustomDay]         = useState(todayStr)
  const [selectedStat, setSelectedStat]   = useState('war_hits')
  const [pickedMembers, setPickedMembers] = useState([])
  const [search, setSearch]               = useState('')
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)
  const [chartData, setChartData]         = useState(null)
  const abortRef = useRef(null)

  const filtered = allMembers
    .filter(m => !pickedMembers.find(p => p.id === m.id))
    .filter(m => m.username?.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 20)

  function addMember(m) {
    if (pickedMembers.length >= 4) return
    setPickedMembers(prev => [...prev, { id: m.id, username: m.username, faction_id: m.faction_id }])
    setSearch('')
  }

  function removeMember(id) {
    setPickedMembers(prev => prev.filter(m => m.id !== id))
    setChartData(null)
  }

  const fetchCompare = useCallback(async (params) => {
    if (pickedMembers.length < 2) return
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams({
        members: pickedMembers.map(m => m.id).join(','),
        stat: selectedStat,
        ...params,
      }).toString()
      const res = await fetch(`${API_BASE_URL}/api/leadership/personal-stats/compare?${qs}`, {
        headers: authHeaders(), signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setChartData(await res.json())
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally { setLoading(false) }
  }, [pickedMembers, selectedStat])

  function handleApply() {
    const params = buildParams(mode, selectedMonth, customFrom, customTo, customDay)
    if (params.from && params.to) fetchCompare(params)
  }

  useEffect(() => {
    if (pickedMembers.length >= 2) {
      const params = buildParams(mode, selectedMonth, customFrom, customTo, customDay)
      if (params.from && params.to) fetchCompare(params)
    } else {
      setChartData(null)
    }
    return () => abortRef.current?.abort()
  }, [pickedMembers, selectedStat, mode, selectedMonth, fetchCompare])

  const statField = allFields.find(f => f.key === selectedStat)

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '20px', background: 'rgba(14,14,22,0.6)' }}>
      <h3 style={{ fontFamily: 'Cinzel, serif', color: '#c084fc', fontSize: '15px', letterSpacing: '0.5px', margin: '0 0 20px' }}>
        Compare Members
      </h3>

      {/* Controls row */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'flex-start' }}>

        {/* Member search + chips */}
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ color: '#71717a', fontSize: '11px', marginBottom: '6px' }}>
            Members ({pickedMembers.length}/4)
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {pickedMembers.map((m, i) => (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '4px 10px', borderRadius: '20px',
                background: `${SERIES_COLORS[i]}22`,
                border: `1px solid ${SERIES_COLORS[i]}55`,
                fontSize: '12px', color: '#f4f4f5',
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: SERIES_COLORS[i], flexShrink: 0 }} />
                {m.username}
                <button onClick={() => removeMember(m.id)} style={{
                  background: 'none', border: 'none', color: '#71717a',
                  cursor: 'pointer', padding: '0', lineHeight: 1, fontSize: '13px',
                }}>×</button>
              </div>
            ))}
          </div>
          {pickedMembers.length < 4 && (
            <div style={{ position: 'relative' }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search member…"
                style={{
                  width: '100%', padding: '7px 12px', borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)', background: '#18181b',
                  color: '#f4f4f5', fontSize: '13px', boxSizing: 'border-box',
                }}
              />
              {search && filtered.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                  background: '#18181b', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px', marginTop: '4px', maxHeight: '180px', overflowY: 'auto',
                }}>
                  {filtered.map(m => (
                    <div key={m.id} onClick={() => addMember(m)} style={{
                      padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                      color: '#d4d4d8', display: 'flex', justifyContent: 'space-between',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span>{m.username}</span>
                      {m.faction_id && (
                        <span style={{ color: FACTION_COLORS[m.faction_id] ?? '#52525b', fontSize: '11px' }}>
                          {FACTION_NAMES[m.faction_id]}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stat selector */}
        <div style={{ flex: '1 1 180px' }}>
          <div style={{ color: '#71717a', fontSize: '11px', marginBottom: '6px' }}>Stat</div>
          <select
            value={selectedStat}
            onChange={e => setSelectedStat(e.target.value)}
            style={{ width: '100%', padding: '7px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#18181b', color: '#f4f4f5', fontSize: '13px', cursor: 'pointer' }}
          >
            {CATEGORIES.map(cat => (
              <optgroup key={cat.id} label={cat.label}>
                {allFields.filter(f => cat.keys.includes(f.key)).map(f => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Period */}
        <div style={{ flex: '2 1 300px' }}>
          <div style={{ color: '#71717a', fontSize: '11px', marginBottom: '6px' }}>Period</div>
          <PeriodPicker
            mode={mode} setMode={setMode}
            selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth}
            customFrom={customFrom} setCustomFrom={setCustomFrom}
            customTo={customTo} setCustomTo={setCustomTo}
            customDay={customDay} setCustomDay={setCustomDay}
            onApply={handleApply}
            minDate={minDate}
          />
        </div>
      </div>

      {/* Chart area */}
      {pickedMembers.length < 2 && (
        <div style={{ color: '#52525b', fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>
          Select at least 2 members to compare.
        </div>
      )}
      {pickedMembers.length >= 2 && loading && (
        <div style={{ color: '#a1a1aa', fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>Loading…</div>
      )}
      {error && (
        <div style={{ color: '#f87171', fontSize: '13px', padding: '12px', background: 'rgba(248,113,113,0.06)', borderRadius: '8px' }}>
          {error}
        </div>
      )}
      {!loading && chartData && (
        <div style={{ marginTop: '8px' }}>
          {chartData.series.every(s => !s.points.length) ? (
            <div style={{ color: '#52525b', fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>
              No snapshot data for these members in this period.
            </div>
          ) : (
            <LineChart series={chartData.series} statLabel={statField?.label ?? selectedStat} />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function PersonalStatsPanel() {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const [mode, setMode]                   = useState('month')
  const [selectedMonth, setSelectedMonth] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() })
  const [customFrom, setCustomFrom]       = useState('')
  const [customTo, setCustomTo]           = useState('')
  const [customDay, setCustomDay]         = useState(todayStr)
  const [factionFilter, setFactionFilter] = useState('all')
  const [category, setCategory]           = useState('attacking')
  const [sortKey, setSortKey]             = useState('war_hits')
  const [sortDir, setSortDir]             = useState('desc')
  const [showCompare, setShowCompare]     = useState(false)

  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [data, setData]         = useState(null)
  const abortRef = useRef(null)

  const minDate = data?.coverage?.earliest || todayStr

  const fetchData = useCallback(async (params) => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams(params).toString()
      const res = await fetch(`${API_BASE_URL}/api/leadership/personal-stats?${qs}`, {
        headers: authHeaders(), signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const params = buildParams(mode, selectedMonth, customFrom, customTo, customDay)
    if (params.from && params.to) fetchData(params)
    return () => abortRef.current?.abort()
  }, [mode, selectedMonth, fetchData])

  useEffect(() => {
    const cat = CATEGORIES.find(c => c.id === category)
    if (cat) setSortKey(cat.keys[0])
  }, [category])

  const handleApply = () => {
    const params = buildParams(mode, selectedMonth, customFrom, customTo, customDay)
    if (params.from && params.to) fetchData(params)
  }

  const members = (data?.members ?? []).filter(m =>
    factionFilter === 'all' || String(m.faction_id) === factionFilter
  )

  const currentCat = CATEGORIES.find(c => c.id === category) ?? CATEGORIES[0]

  return (
    <div>
      {/* Period picker */}
      <PeriodPicker
        mode={mode} setMode={setMode}
        selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth}
        customFrom={customFrom} setCustomFrom={setCustomFrom}
        customTo={customTo} setCustomTo={setCustomTo}
        customDay={customDay} setCustomDay={setCustomDay}
        onApply={handleApply}
        minDate={minDate}
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
            <div style={{ padding: '32px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', background: 'rgba(22,22,32,0.6)' }}>
              <div style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '8px' }}>No snapshot data for this period.</div>
              <div style={{ color: '#52525b', fontSize: '12px' }}>Personal stats are snapshotted daily at 01:00 UTC. Data will appear from the next cron run.</div>
            </div>
          ) : (
            <>
              <SummaryBar members={members} coverage={data.coverage} />
              {data.coverage && (
                <div style={{ color: '#52525b', fontSize: '11px', marginBottom: '12px' }}>
                  Snapshots: {data.coverage.earliest} → {data.coverage.latest} ({data.coverage.days_covered} day{data.coverage.days_covered !== 1 ? 's' : ''})
                </div>
              )}

              <CategoryTabs active={category} onChange={setCategory} />

              {members.length === 0 ? (
                <div style={{ color: '#a1a1aa', fontSize: '13px', padding: '24px 0', textAlign: 'center' }}>No members match the current filter.</div>
              ) : (
                <StatsTable
                  members={members}
                  fields={data.fields ?? []}
                  categoryKeys={currentCat.keys}
                  sortKey={sortKey} setSortKey={setSortKey}
                  sortDir={sortDir} setSortDir={setSortDir}
                />
              )}

              {/* Compare toggle */}
              <div style={{ marginTop: '28px' }}>
                <button
                  onClick={() => setShowCompare(v => !v)}
                  style={{
                    padding: '8px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
                    border: `1px solid ${showCompare ? 'rgba(192,132,252,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    background: showCompare ? 'rgba(192,132,252,0.1)' : 'transparent',
                    color: showCompare ? '#c084fc' : '#a1a1aa',
                    transition: 'all 0.15s',
                  }}
                >
                  {showCompare ? '▲ Hide Compare' : '⟺ Compare Members'}
                </button>
              </div>

              {showCompare && (
                <div style={{ marginTop: '16px' }}>
                  <ComparePanel allMembers={data.members ?? []} allFields={data.fields ?? []} minDate={minDate} />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
