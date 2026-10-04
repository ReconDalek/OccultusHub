import { useState } from 'react'
import { bucketLabel, bucketShortLabel, STATE_COLORS, fmtPct, useIsMobile } from './activityUtils'

export const card = {
  background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 12,
  padding: 'clamp(12px, 3vw, 18px)', marginBottom: 16,
}
export const sectionTitle = { margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#f4f4f5' }
export const sectionSub = { margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }

export function StatTile({ label, value, sub, color }) {
  return (
    <div style={{ flex: '1 1 130px', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', minWidth: 0 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || '#f4f4f5', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

const ACTIVE = '#8b5cf6', IDLE = '#eab308', OFFLINE = '#3f3f46'

export function StateLegend() {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
      <span><Dot c={ACTIVE} /> Active</span>
      <span><Dot c={IDLE} /> Idle</span>
      <span><Dot c={OFFLINE} /> Offline</span>
    </div>
  )
}
function Dot({ c }) { return <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: c, marginRight: 4, verticalAlign: 'middle' }} /> }

// Stacked active / idle / offline share per bucket. Vertical columns on
// desktop; horizontal rows on phones (24–48 columns don't fit a 375px screen).
export function HourlyBars({ breakdown, res }) {
  const isMobile = useIsMobile()
  const [sel, setSel] = useState(null)
  const n = breakdown.length
  if (!breakdown.some(Boolean)) return <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No data for this period yet.</p>

  const segs = (v) => v ? [
    { k: 'active', pct: v.active, c: ACTIVE },
    { k: 'idle', pct: v.idle, c: IDLE },
    { k: 'offline', pct: v.offline, c: OFFLINE },
  ] : []

  const info = sel != null && breakdown[sel]
    ? <>{bucketLabel(sel, res)} — <strong style={{ color: ACTIVE }}>{fmtPct(breakdown[sel].active)} active</strong> (≈{Math.round(breakdown[sel].activeCount)} members) · <span style={{ color: IDLE }}>{fmtPct(breakdown[sel].idle)} idle</span> · {fmtPct(breakdown[sel].offline)} offline</>
    : <span style={{ color: 'var(--text-faint)' }}>{isMobile ? 'Tap' : 'Click'} a bar for details.</span>

  if (isMobile) {
    return (
      <div>
        <StateLegend />
        <div style={{ display: 'grid', gap: 3, marginTop: 8 }}>
          {breakdown.map((v, b) => (
            <button key={b} onClick={() => setSel(sel === b ? null : b)} style={{
              display: 'grid', gridTemplateColumns: '38px 1fr 34px', alignItems: 'center', gap: 6,
              background: sel === b ? 'rgba(251,191,36,0.08)' : 'transparent', border: 'none', padding: 0, cursor: 'pointer',
            }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>{bucketLabel(b, res)}</span>
              <div style={{ display: 'flex', height: res === 'half' ? 8 : 12, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
                {segs(v).map(s => <div key={s.k} style={{ width: `${s.pct * 100}%`, background: s.c }} />)}
              </div>
              <span style={{ fontSize: 10, color: '#c4b5fd', textAlign: 'left' }}>{v ? fmtPct(v.active) : '—'}</span>
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 0' }}>{info}</p>
      </div>
    )
  }

  return (
    <div>
      <StateLegend />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: n > 24 ? 2 : 4, alignItems: 'end', height: 180, marginTop: 10 }}>
        {breakdown.map((v, b) => (
          <button key={b} onClick={() => setSel(sel === b ? null : b)} title={v ? `${bucketLabel(b, res)} · ${fmtPct(v.active)} active` : 'no data'} style={{
            height: '100%', display: 'flex', flexDirection: 'column-reverse', padding: 0, cursor: 'pointer', borderRadius: 3, overflow: 'hidden',
            border: sel === b ? '2px solid #fbbf24' : '1px solid transparent', background: v ? 'transparent' : 'repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 3px, transparent 3px 6px)',
          }}>
            {segs(v).map(s => (
              <div key={s.k} style={{ height: `${s.pct * 100}%`, background: s.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: s.k === 'idle' ? '#1c1917' : '#f4f4f5', overflow: 'hidden' }}>
                {n <= 24 && s.k !== 'offline' && s.pct >= 0.12 ? Math.round(s.pct * 100) : ''}
              </div>
            ))}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: n > 24 ? 2 : 4, marginTop: 4 }}>
        {breakdown.map((_, b) => <span key={b} style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>{bucketShortLabel(b, res)}</span>)}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 0' }}>{info}</p>
    </div>
  )
}

// Hour-of-day profile lines — one series per faction (active %).
export function ProfileLines({ series, res }) {
  const n = Math.max(...series.map(s => s.values.length), 0)
  if (!n) return null
  const W = 640, H = 200, P = { l: 34, r: 10, t: 10, b: 22 }
  const iw = W - P.l - P.r, ih = H - P.t - P.b
  const max = Math.max(0.05, ...series.flatMap(s => s.values.filter(v => v != null)))
  const x = (i) => P.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw)
  const y = (v) => P.t + ih - (v / max) * ih
  const ticks = [0, max / 2, max]
  const xStep = res === 'half' ? 12 : 6
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, marginBottom: 6 }}>
        {series.map(s => <span key={s.label} style={{ color: s.color }}>● {s.label}</span>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" />
            <text x={P.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#71717a">{Math.round(t * 100)}%</text>
          </g>
        ))}
        {Array.from({ length: n }, (_, i) => i).filter(i => i % xStep === 0).map(i => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#71717a">{bucketLabel(i, res)}</text>
        ))}
        {series.map(s => {
          const pts = s.values.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(' ')
          return <polyline key={s.label} points={pts} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        })}
      </svg>
    </div>
  )
}

// Rows of 3-state cells (active / idle / offline / no data). Used for the
// single-day "who was on when" grid and a member's day-by-day timeline.
export function StateGrid({ rows, nCols, colLabel, res, onRowClick, labelWidth = 110 }) {
  const isMobile = useIsMobile()
  const lw = isMobile ? Math.min(labelWidth, 84) : labelWidth
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ minWidth: lw + nCols * (res === 'half' ? 5 : 9) }}>
        <div style={{ display: 'grid', gridTemplateColumns: `${lw}px repeat(${nCols}, minmax(0, 1fr))`, gap: 1, marginBottom: 2 }}>
          <span />
          {Array.from({ length: nCols }, (_, i) => (
            <span key={i} style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', overflow: 'hidden' }}>{colLabel(i)}</span>
          ))}
        </div>
        {rows.map(row => (
          <div key={row.key} onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={{ display: 'grid', gridTemplateColumns: `${lw}px repeat(${nCols}, minmax(0, 1fr))`, gap: 1, marginBottom: 1, cursor: onRowClick ? 'pointer' : 'default' }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 6, lineHeight: '14px' }}>{row.label}</span>
            {row.states.map((s, i) => (
              <span key={i} title={`${row.label} · ${colLabel(i, true)}`} style={{
                height: 14, borderRadius: 2,
                background: s === '.' ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 4px)' : STATE_COLORS[s],
              }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
