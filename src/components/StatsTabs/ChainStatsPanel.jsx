import { useState, useEffect, useMemo } from 'react'
import { API_BASE_URL } from '../../config/api'

// ─── Constants ────────────────────────────────────────────────────────────────

const FACTIONS = [
  { id: 33097, label: 'Occultus' },
  { id: 9728,  label: 'Occul2us' },
  { id: 9171,  label: 'Occul3us' },
]

const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Last 18 months, most recent first — same convention as WarStatsPanel.jsx
function buildMonthOptions() {
  const now = new Date()
  const options = []
  for (let i = 0; i < 18; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    options.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() })
  }
  return options
}

function fmt(n, dp = 0) {
  const v = parseFloat(n) || 0
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

// ─── Leaderboard categories ───────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'total_respect', label: 'Most Respect Gained',   fmt: (v) => fmt(v, 2), accent: true },
  { key: 'avg_respect',   label: 'Best Avg Respect / Hit', fmt: (v) => fmt(v, 2) },
  { key: 'total_attacks', label: 'Most Attacks',          fmt: (v) => fmt(v) },
  { key: 'bonus_hits',    label: 'Most Bonus Hits',       fmt: (v) => fmt(v), accent: true },
  { key: 'chains_count',  label: 'Most Chains Participated', fmt: (v) => fmt(v) },
]

// ─── Column definitions for the full sortable table ──────────────────────────
const COLUMNS = [
  { key: 'username',        label: 'Member',        align: 'left' },
  { key: 'chains_count',    label: 'Chains' },
  { key: 'total_attacks',   label: 'Attacks' },
  { key: 'bonus_hits',      label: 'Bonuses' },
  { key: 'total_respect',   label: 'Respect',    fmt: (v) => fmt(v, 2) },
  { key: 'avg_respect',     label: 'Avg / Hit',  fmt: (v) => fmt(v, 2) },
  { key: 'xanax_used',      label: 'Xanax Used' },
  { key: 'xanax_deposited', label: 'Xanax Repaid' },
  { key: 'overdoses',       label: 'OD' },
]

// ─── Aggregate raw (member, chain) rows into one row per member ─────────────
function aggregateByMember(rows) {
  const byMember = {}
  for (const r of rows) {
    const id = r.torn_user_id
    if (!byMember[id]) {
      byMember[id] = {
        torn_user_id: id, username: r.username,
        chains_count: 0, total_attacks: 0, total_respect: 0, bonus_hits: 0,
        xanax_used: 0, xanax_deposited: 0, overdoses: 0,
      }
    }
    const m = byMember[id]
    if (r.username) m.username = r.username
    m.chains_count    += 1
    m.total_attacks   += r.total_attacks   || 0
    m.total_respect   += r.total_respect   || 0
    m.bonus_hits      += r.bonus_hits      || 0
    m.xanax_used      += r.xanax_used      || 0
    m.xanax_deposited += r.xanax_deposited || 0
    m.overdoses       += r.overdoses       || 0
  }
  return Object.values(byMember).map((m) => ({
    ...m,
    avg_respect: m.total_attacks > 0 ? m.total_respect / m.total_attacks : 0,
  }))
}

// ─── Leaderboard card ─────────────────────────────────────────────────────────

function LeaderboardCard({ category, members }) {
  const top = [...members]
    .filter((m) => (m[category.key] || 0) !== 0 || category.key === 'chains_count')
    .sort((a, b) => (b[category.key] || 0) - (a[category.key] || 0))
    .slice(0, 5)

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '10px', padding: '14px',
    }}>
      <p style={{
        color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase',
        letterSpacing: '0.06em', fontWeight: '700', margin: '0 0 10px',
      }}>
        {category.label}
      </p>
      {top.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: '12px', margin: 0 }}>No data</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {top.map((m, i) => (
            <div key={m.torn_user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: "var(--text-secondary)", fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                <span style={{ color: "var(--text-muted)", fontSize: '11px', width: '14px', flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.username || `[${m.torn_user_id}]`}</span>
              </span>
              <span style={{
                color: category.accent ? '#22c55e' : category.red ? '#ef4444' : '#f4f4f5',
                fontSize: '12px', fontWeight: '700', flexShrink: 0,
              }}>
                {category.fmt(m[category.key] || 0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main panel — used on the public /stats page ─────────────────────────────

export default function ChainStatsPanel() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [factionFilter, setFactionFilter] = useState(null)
  const [monthFilter, setMonthFilter] = useState('all') // 'all' | 'YYYY-M' (0-indexed month)
  const [sortKey, setSortKey] = useState('total_respect')
  const [sortDir, setSortDir] = useState('desc')
  const monthOptions = useMemo(buildMonthOptions, [])

  useEffect(() => {
    const token = localStorage.getItem('occultusSession')
    const params = new URLSearchParams()
    if (factionFilter != null) params.set('faction_id', factionFilter)
    if (monthFilter !== 'all') {
      const [y, mo] = monthFilter.split('-').map(Number)
      params.set('year', y)
      params.set('month', mo + 1)
    }
    setLoading(true)
    fetch(`${API_BASE_URL}/api/stats/chains?${params}`, { headers: { Authorization: token } })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else { setError(null); setRows(d.rows || []) }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [factionFilter, monthFilter])

  const members = useMemo(() => aggregateByMember(rows), [rows])
  const chainsCovered = useMemo(() => new Set(rows.map((r) => r.torn_chain_id)).size, [rows])

  const sortedMembers = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...members].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === 'string' || typeof bv === 'string') {
        return dir * String(av || '').localeCompare(String(bv || ''))
      }
      return dir * ((av || 0) - (bv || 0))
    })
  }, [members, sortKey, sortDir])

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const th = (col) => ({
    padding: '8px 10px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em',
    color: sortKey === col.key ? '#f4f4f5' : "var(--text-secondary)", fontWeight: '600',
    borderBottom: '1px solid rgba(255,255,255,0.07)', textAlign: col.align || 'right',
    whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
  })
  const td = (align = 'right') => ({ padding: '8px 10px', fontSize: '12px', color: "var(--text-secondary)", textAlign: align, borderBottom: '1px solid rgba(255,255,255,0.04)' })

  const pillStyle = (active) => ({
    padding: '6px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
    border: `1px solid ${active ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
    background: active ? 'rgba(179,18,63,0.15)' : 'transparent',
    color: active ? '#f4f4f5' : "var(--text-secondary)",
  })

  return (
    <div>
      <p style={{ color: "var(--text-secondary)", fontSize: '13px', margin: '0 0 14px' }}>
        Career stats across every tracked chain (1,000+ hits) — filter by faction or a single month, sort any column.
        {!loading && ` Showing ${members.length} member${members.length === 1 ? '' : 's'} across ${chainsCovered} chain${chainsCovered === 1 ? '' : 's'}.`}
      </p>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '18px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[{ id: null, label: 'All Factions' }, ...FACTIONS].map((f) => (
            <button key={f.id ?? 'all'} onClick={() => setFactionFilter(f.id)} style={pillStyle(factionFilter === f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', color: '#f4f4f5', padding: '7px 10px', fontSize: '12px',
          }}
        >
          <option value="all">All Time</option>
          {monthOptions.map(({ year, month }) => (
            <option key={`${year}-${month}`} value={`${year}-${month}`}>{MONTHS_FULL[month]} {year}</option>
          ))}
        </select>
      </div>

      {error && <p style={{ color: '#ef4444', fontSize: '13px' }}>{error}</p>}
      {loading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: '13px', padding: '20px 0' }}>Loading chain stats…</p>
      ) : (
        <>
          {/* Leaderboard highlight cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: '10px', marginBottom: '22px' }}>
            {CATEGORIES.map((c) => (
              <LeaderboardCard key={c.key} category={c} members={members} />
            ))}
          </div>

          {/* Full sortable table */}
          <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.key} style={th(c)} onClick={() => toggleSort(c.key)}>
                      {c.label}{sortKey === c.key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map((m) => (
                  <tr key={m.torn_user_id}>
                    <td style={td('left')}>{m.username || `[${m.torn_user_id}]`}</td>
                    <td style={td()}>{fmt(m.chains_count)}</td>
                    <td style={td()}>{fmt(m.total_attacks)}</td>
                    <td style={td()}>{fmt(m.bonus_hits)}</td>
                    <td style={{ ...td(), color: '#4ade80' }}>{fmt(m.total_respect, 2)}</td>
                    <td style={td()}>{fmt(m.avg_respect, 2)}</td>
                    <td style={td()}>{fmt(m.xanax_used)}</td>
                    <td style={td()}>{fmt(m.xanax_deposited)}</td>
                    <td style={td()}>{fmt(m.overdoses)}</td>
                  </tr>
                ))}
                {sortedMembers.length === 0 && (
                  <tr><td colSpan={COLUMNS.length} style={{ ...td('left'), color: "var(--text-muted)" }}>No chain stats for this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
