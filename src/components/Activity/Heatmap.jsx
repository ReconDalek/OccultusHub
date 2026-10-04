import { useMemo, useState } from 'react'
import { seqColor, divColor, textOn, useIsMobile } from './activityUtils'

// Generic heatmap. grid[r][c] = number | null. rows are days (weekdays or
// dates), columns are hour/half-hour buckets. On phones it transposes —
// buckets become rows and days become columns — so 24 rows × 7 columns fits a
// 375px screen without horizontal scrolling; longer ranges scroll sideways
// with the bucket labels pinned. Cells are tappable: the selected cell's
// details show underneath (no hover on touch).
//
// scale: 'seq' (min→max of the visible values) or 'div' (diverging around 0,
// symmetric ±max|value|).
export default function Heatmap({
  grid, rowLabels, colLabels, colFullLabels, rowFullLabels,
  scale = 'seq', format, describe, legend, highlightRows = [],
}) {
  const isMobile = useIsMobile()
  const [sel, setSel] = useState(null) // { r, c }

  const { lo, hi, maxAbs } = useMemo(() => {
    const vals = grid.flat().filter(v => v != null)
    if (!vals.length) return { lo: 0, hi: 1, maxAbs: 1 }
    return { lo: Math.min(...vals), hi: Math.max(...vals), maxAbs: Math.max(...vals.map(Math.abs)) || 1 }
  }, [grid])

  const colorFor = (v) => {
    if (v == null) return null
    if (scale === 'div') return divColor(v / maxAbs)
    return seqColor(hi > lo ? (v - lo) / (hi - lo) : 0.5)
  }

  const nRows = grid.length, nCols = grid[0]?.length || 0
  if (!nRows || !nCols) return <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No data for this period yet.</p>

  // Display orientation
  const T = isMobile
  const dRows = T ? nCols : nRows
  const dCols = T ? nRows : nCols
  const valAt = (dr, dc) => (T ? grid[dc][dr] : grid[dr][dc])
  const dRowLabel = (i) => (T ? colLabels[i] : rowLabels[i])
  const dColLabel = (i) => (T ? rowLabels[i] : colLabels[i])
  const isHighlightCol = (i) => T && highlightRows.includes(i)
  const isHighlightRow = (i) => !T && highlightRows.includes(i)

  const labelW = T ? 34 : 58
  const minCell = T ? (dCols > 8 ? 30 : 0) : (dCols > 24 ? 14 : 0)
  const showText = T ? dCols <= 8 : dCols <= 24
  const cellH = T ? 24 : (dRows > 14 ? 22 : 30)
  const gridCols = `${labelW}px repeat(${dCols}, ${minCell ? `minmax(${minCell}px, 1fr)` : 'minmax(0, 1fr)'})`
  const scroll = !!minCell

  const selVal = sel ? grid[sel.r]?.[sel.c] : null

  return (
    <div>
      <div style={{ overflowX: scroll ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 2, minWidth: scroll ? labelW + dCols * (minCell + 2) : undefined }}>
          {/* header row */}
          <div style={{ position: 'sticky', left: 0, background: 'var(--bg-primary, #0f0f12)', zIndex: 1 }} />
          {Array.from({ length: dCols }, (_, i) => (
            <div key={`h${i}`} style={{
              fontSize: 10, color: isHighlightCol(i) ? '#fbbf24' : 'var(--text-muted)', textAlign: 'center',
              padding: '2px 0', whiteSpace: 'nowrap', overflow: 'hidden',
            }}>{dColLabel(i)}</div>
          ))}
          {Array.from({ length: dRows }, (_, r) => (
            <Row key={`r${r}`}>
              <div style={{
                position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg-primary, #0f0f12)',
                fontSize: 11, color: isHighlightRow(r) ? '#fbbf24' : 'var(--text-secondary)', display: 'flex', alignItems: 'center',
                justifyContent: 'flex-end', paddingRight: 6, whiteSpace: 'nowrap', overflow: 'hidden', height: cellH,
              }}>{dRowLabel(r)}</div>
              {Array.from({ length: dCols }, (_, c) => {
                const v = valAt(r, c)
                const bg = colorFor(v)
                const gr = T ? c : r, gc = T ? r : c
                const selected = sel && sel.r === gr && sel.c === gc
                return (
                  <button key={c} onClick={() => setSel(selected ? null : { r: gr, c: gc })}
                    title={describe ? describe(gr, gc, v) : undefined}
                    style={{
                      height: cellH, padding: 0, border: selected ? '2px solid #fbbf24' : '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 3, background: bg || 'repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 3px, transparent 3px 6px)',
                      color: textOn(bg), fontSize: 10, fontWeight: 600, cursor: 'pointer', minWidth: 0, overflow: 'hidden',
                    }}>
                    {showText && v != null ? format(v) : ''}
                  </button>
                )
              })}
            </Row>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10, minHeight: 22 }}>
        {legend !== false && <Legend scale={scale} lo={lo} hi={hi} maxAbs={maxAbs} format={format} legend={legend} />}
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: '1 1 200px' }}>
          {sel
            ? <>{rowFullLabels?.[sel.r] ?? rowLabels[sel.r]} · {colFullLabels?.[sel.c] ?? colLabels[sel.c]} — <strong style={{ color: '#f4f4f5' }}>{selVal == null ? 'no data' : format(selVal)}</strong>{describe && selVal != null ? <span style={{ color: 'var(--text-muted)' }}> · {describe(sel.r, sel.c, selVal)}</span> : null}</>
            : <span style={{ color: 'var(--text-faint)' }}>{isMobile ? 'Tap' : 'Click'} a cell for details. Striped = no data.</span>}
        </span>
      </div>
    </div>
  )
}

// Fragment wrapper so row cells sit directly in the parent grid.
function Row({ children }) { return <>{children}</> }

function Legend({ scale, lo, hi, maxAbs, format, legend }) {
  const stops = Array.from({ length: 12 }, (_, i) => i / 11)
  if (scale === 'div') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
        <span>{legend?.neg || 'Them ahead'} {format(maxAbs)}</span>
        <div style={{ display: 'flex', height: 10, width: 140, borderRadius: 3, overflow: 'hidden' }}>
          {stops.map((s, i) => <div key={i} style={{ flex: 1, background: divColor(s * 2 - 1) }} />)}
        </div>
        <span>{format(maxAbs)} {legend?.pos || 'Us ahead'}</span>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
      <span>{format(lo)}</span>
      <div style={{ display: 'flex', height: 10, width: 120, borderRadius: 3, overflow: 'hidden' }}>
        {stops.map((s, i) => <div key={i} style={{ flex: 1, background: seqColor(s) }} />)}
      </div>
      <span>{format(hi)}</span>
    </div>
  )
}
