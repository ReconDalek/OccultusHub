import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

const FACTION_IDS   = [33097, 9728, 9171]
const FACTION_NAMES = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' }
const FACTION_COLORS = { 33097: '#b3123f', 9728: '#6d28d9', 9171: '#0e7490' }

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return token ? { Authorization: token } : {}
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 1 })
}

function fmtMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

function daysToReadable(days) {
  if (days == null) return null
  const months = days / 30.44
  return months >= 1 ? `${months.toFixed(1)} mo` : `${Math.round(days)} d`
}

const CARD = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '16px' }
const SECTION_TITLE = { color: '#f4f4f5', fontSize: '14px', fontWeight: '600', margin: '0 0 4px 0', fontFamily: 'Cinzel, serif', letterSpacing: '0.4px' }
const SECTION_SUB = { color: "var(--text-secondary)", fontSize: '12px', margin: '0 0 14px 0' }

// ── Toggle pill group ───────────────────────────────────────────────────────
function ToggleGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '3px' }}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: '5px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: 'none',
            background: value === o.value ? 'rgba(179,18,63,0.25)' : 'transparent',
            color: value === o.value ? '#f4f4f5' : "var(--text-secondary)",
            fontWeight: value === o.value ? '600' : '400',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Progression curve chart ─────────────────────────────────────────────────
const PAD = { top: 16, right: 16, bottom: 28, left: 48 }
const W = 760, H = 260
const INNER_W = W - PAD.left - PAD.right
const INNER_H = H - PAD.top - PAD.bottom

function ProgressionChart({ factions, months, metric, view }) {
  const [tooltip, setTooltip] = useState(null)

  const field = view === 'cumulative'
    ? (metric === 'units' ? 'cumAvgUnits' : 'cumAvgAttacks')
    : (metric === 'units' ? 'avgUnits' : 'avgAttacks')

  const series = FACTION_IDS.map(id => ({
    id, name: FACTION_NAMES[id], color: FACTION_COLORS[id],
    points: (factions[id]?.monthly || []).map(m => ({ month: m.month, value: m[field] })),
  }))

  if (!months.length) {
    return <div style={{ color: "var(--text-faint)", fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>No data yet.</div>
  }

  const allValues = series.flatMap(s => s.points.map(p => p.value))
  const maxVal = Math.max(1, ...allValues)

  function xOf(monthKey) {
    const i = months.indexOf(monthKey)
    if (months.length === 1) return INNER_W / 2
    return (i / (months.length - 1)) * INNER_W
  }
  function yOf(v) {
    return INNER_H - (v / maxVal) * INNER_H
  }

  const tickCount = 4
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => (maxVal / tickCount) * i)

  const xLabelStep = Math.max(1, Math.ceil(months.length / 8))
  const xLabels = months.filter((_, i) => i % xLabelStep === 0 || i === months.length - 1)

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }} onMouseLeave={() => setTooltip(null)}>
        {yTicks.map((tick, i) => {
          const y = yOf(tick)
          return (
            <g key={i}>
              <line x1={PAD.left} y1={PAD.top + y} x2={PAD.left + INNER_W} y2={PAD.top + y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              <text x={PAD.left - 8} y={PAD.top + y + 4} textAnchor="end" fill="#52525b" fontSize="10">
                {tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : tick.toFixed(tick < 10 ? 1 : 0)}
              </text>
            </g>
          )
        })}

        {xLabels.map(mk => (
          <text key={mk} x={PAD.left + xOf(mk)} y={PAD.top + INNER_H + 18} textAnchor="middle" fill="#52525b" fontSize="10">
            {fmtMonth(mk)}
          </text>
        ))}

        {series.map(s => {
          if (!s.points.length) return null
          const pts = s.points.map(p => `${PAD.left + xOf(p.month)},${PAD.top + yOf(p.value)}`).join(' ')
          return (
            <g key={s.id} style={{ pointerEvents: 'none' }}>
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
              {s.points.map((p, pi) => (
                <circle key={pi} cx={PAD.left + xOf(p.month)} cy={PAD.top + yOf(p.value)} r="3" fill={s.color} stroke="#0d0d14" strokeWidth="1.5" />
              ))}
            </g>
          )
        })}

        {/* Hit targets on top */}
        {series.map(s => s.points.map((p, pi) => (
          <circle
            key={`hit-${s.id}-${pi}`}
            cx={PAD.left + xOf(p.month)} cy={PAD.top + yOf(p.value)} r="7" fill="transparent"
            onMouseEnter={() => setTooltip({ x: PAD.left + xOf(p.month), y: PAD.top + yOf(p.value), month: p.month, value: p.value, name: s.name, color: s.color })}
            style={{ cursor: 'crosshair' }}
          />
        )))}

        {tooltip && (
          <line x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={PAD.top + INNER_H} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,3" style={{ pointerEvents: 'none' }} />
        )}
      </svg>

      {tooltip && (
        <div style={{
          position: 'absolute', top: `${(tooltip.y / H) * 100}%`, left: `${(tooltip.x / W) * 100}%`,
          transform: tooltip.x > W * 0.6 ? 'translate(-110%,-50%)' : 'translate(12px,-50%)',
          background: 'rgba(10,10,18,0.95)', border: `1px solid ${tooltip.color}44`, borderRadius: '8px',
          padding: '8px 12px', fontSize: '12px', pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
        }}>
          <div style={{ color: tooltip.color, fontWeight: '600', marginBottom: '4px' }}>{tooltip.name}</div>
          <div style={{ color: "var(--text-muted)", fontSize: '11px', marginBottom: '4px' }}>{fmtMonth(tooltip.month)}</div>
          <div style={{ color: '#f4f4f5', fontWeight: '600', fontSize: '12px' }}>{fmt(tooltip.value)}</div>
        </div>
      )}

      {/* Legend — text label always alongside the swatch, never color-only */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '10px', justifyContent: 'center' }}>
        {series.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <div style={{ width: '12px', height: '3px', background: s.color, borderRadius: '2px' }} />
            <span style={{ color: '#d4d4d8' }}>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Headline stat row ────────────────────────────────────────────────────────
function HeadlineRow({ factions }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '20px' }}>
      {FACTION_IDS.map(id => {
        const f = factions[id]
        const color = FACTION_COLORS[id]
        return (
          <div key={id} style={{ ...CARD, borderColor: `${color}33` }}>
            <p style={{ color, fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px 0' }}>
              {FACTION_NAMES[id]}
            </p>
            <p style={{ color: '#f4f4f5', fontSize: '22px', fontWeight: '700', margin: 0 }}>
              {fmt(f?.monthlyRate)}
            </p>
            <p style={{ color: "var(--text-faint)", fontSize: '11px', margin: '2px 0 0 0' }}>avg units / member / month</p>
          </div>
        )
      })}
    </div>
  )
}

// ── Source breakdown table (chain vs war vs custom) ─────────────────────────
function BreakdownTable({ factions }) {
  const rows = [
    { key: 'chainAttacks', label: 'Chain Attacks' },
    { key: 'warAttacks',   label: 'War Attacks' },
    { key: 'customHits',   label: 'Custom Hits' },
  ]

  function totals(id) {
    const monthly = factions[id]?.monthly || []
    const sum = { chainAttacks: 0, warAttacks: 0, customHits: 0 }
    for (const m of monthly) {
      sum.chainAttacks += m.chainAttacks
      sum.warAttacks   += m.warAttacks
      sum.customHits   += m.customHits
    }
    const lastMonth = monthly[monthly.length - 1]
    const activeMembers = Math.max(1, lastMonth?.activeMembers || 1)
    return { sum, activeMembers }
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: '520px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `1fr repeat(${FACTION_IDS.length}, 1fr)`, gap: '8px', padding: '6px 12px', marginBottom: '4px' }}>
          <span />
          {FACTION_IDS.map(id => (
            <span key={id} style={{ color: FACTION_COLORS[id], fontSize: '11px', fontWeight: '700', textAlign: 'right' }}>
              {FACTION_NAMES[id]}
            </span>
          ))}
        </div>
        {rows.map(r => (
          <div key={r.key} style={{ display: 'grid', gridTemplateColumns: `1fr repeat(${FACTION_IDS.length}, 1fr)`, gap: '8px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', marginBottom: '4px' }}>
            <span style={{ color: "var(--text-secondary)", fontSize: '12px' }}>{r.label}</span>
            {FACTION_IDS.map(id => {
              const { sum, activeMembers } = totals(id)
              const total = sum[r.key]
              return (
                <span key={id} style={{ textAlign: 'right', fontSize: '12px' }}>
                  <span style={{ color: '#f4f4f5', fontWeight: '600' }}>{fmt(total)}</span>
                  <span style={{ color: "var(--text-faint)" }}> ({fmt(total / activeMembers)}/mbr)</span>
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Time to rank table ───────────────────────────────────────────────────────
function TimeToRankTable({ factions }) {
  const tiers = factions[FACTION_IDS[0]]?.rankEstimates?.map(r => r.tier) || []

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: '620px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `100px repeat(${FACTION_IDS.length}, 1fr)`, gap: '8px', padding: '6px 12px', marginBottom: '4px' }}>
          <span style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rank</span>
          {FACTION_IDS.map(id => (
            <span key={id} style={{ color: FACTION_COLORS[id], fontSize: '11px', fontWeight: '700', textAlign: 'center' }}>
              {FACTION_NAMES[id]}
            </span>
          ))}
        </div>
        {tiers.map(tierName => (
          <div key={tierName} style={{ display: 'grid', gridTemplateColumns: `100px repeat(${FACTION_IDS.length}, 1fr)`, gap: '8px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', marginBottom: '4px', alignItems: 'center' }}>
            <span style={{ color: '#f4f4f5', fontSize: '12px', fontWeight: '600' }}>{tierName}</span>
            {FACTION_IDS.map(id => {
              const est = factions[id]?.rankEstimates?.find(r => r.tier === tierName)
              if (!est) return <span key={id} />
              const empirical = daysToReadable(est.empiricalAvgDays)
              const projected = daysToReadable(est.projectedDays)
              return (
                <div key={id} style={{ textAlign: 'center', fontSize: '11px' }}>
                  <div style={{ color: '#f4f4f5', fontWeight: '600' }}>
                    {empirical ?? '—'}
                    {est.empiricalSample > 0 && (
                      <span style={{ color: "var(--text-faint)", fontWeight: '400' }}> (n={est.empiricalSample})</span>
                    )}
                  </div>
                  <div style={{ color: "var(--text-faint)" }}>
                    proj. {projected ?? '—'}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ProgressionTrendTool() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [metric, setMetric] = useState('units')
  const [view, setView] = useState('cumulative')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(null)
    fetch(`${API_BASE_URL}/api/leadership/progression`, { headers: authHeaders(), signal: controller.signal })
      .then(r => r.json().then(json => ({ r, json })))
      .then(({ r, json }) => {
        if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`)
        setData(json)
      })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  if (loading) return <p style={{ color: "var(--text-secondary)", fontSize: '13px', padding: '20px 0' }}>Loading…</p>
  if (error) return <p style={{ color: '#f87171', fontSize: '13px' }}>Error: {error}</p>
  if (!data || !data.months?.length) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{ color: "var(--text-faint)", fontSize: '14px', margin: 0 }}>No chain, war, or custom hit history yet — nothing to chart.</p>
      </div>
    )
  }

  return (
    <div>
      <p style={{ color: "var(--text-secondary)", fontSize: '13px', margin: '0 0 20px 0' }}>
        Compares how many attacks/units the average active member of each faction earns toward rank, and how long that member takes to climb the rank ladder — grounded in real chain, war, and custom hit history.
      </p>

      <HeadlineRow factions={data.factions} />

      <div style={{ ...CARD, marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
          <div>
            <p style={SECTION_TITLE}>Progression Curve</p>
            <p style={SECTION_SUB}>Average member's {view === 'cumulative' ? 'running total' : 'monthly gain'} over time — steeper/higher means faster rank progression.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <ToggleGroup value={metric} onChange={setMetric} options={[{ value: 'units', label: 'Rank Units' }, { value: 'attacks', label: 'Raw Attacks' }]} />
            <ToggleGroup value={view} onChange={setView} options={[{ value: 'cumulative', label: 'Cumulative' }, { value: 'monthly', label: 'Per Month' }]} />
          </div>
        </div>
        <ProgressionChart factions={data.factions} months={data.months} metric={metric} view={view} />
      </div>

      <div style={{ ...CARD, marginBottom: '20px' }}>
        <p style={SECTION_TITLE}>Source Breakdown</p>
        <p style={SECTION_SUB}>All-time totals per faction, with per-current-member average in parentheses.</p>
        <BreakdownTable factions={data.factions} />
      </div>

      <div style={CARD}>
        <p style={SECTION_TITLE}>Time to Rank (Average Member)</p>
        <p style={SECTION_SUB}>
          Top number = observed average across real members who reached that rank (n = sample size). "proj." = estimate from each faction's current monthly rate. Low or zero sample counts are not solid data — treat them as directional only.
        </p>
        <TimeToRankTable factions={data.factions} />
      </div>
    </div>
  )
}
