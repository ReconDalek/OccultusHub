import { useEffect, useMemo, useRef, useState } from 'react'
import {
  WEEKDAYS, apiGet, todayStr, fmtDay, bucketsPerDay, bucketLabel, bucketShortLabel, bucketState,
  aggregateCells, calendarGrid, weekdayGrid, hourlyBreakdown, summarize, fmtPct, fmtVal, useIsMobile, rollDay,
} from './activityUtils'
import Heatmap from './Heatmap'
import { HourlyBars, ProfileLines, StateGrid, StatTile, StateLegend, card, sectionTitle, sectionSub } from './Charts'
import MemberPanel from './MemberPanel'

// Shared by the Activity page (Explorer) and the Warfare tab's per-war
// Activity view: data hook + the full single-faction / comparison body.

export const COLOR_A = '#a78bfa', COLOR_B = '#e5a57a'

// ── Data fetching with a small in-memory cache ───────────────────────────────
const dataCache = new Map()
// tick: bump it to re-check (ranges ending today refetch once their 5-minute
// cache entry is stale) — used by the live war view's auto-refresh.
export function useActivityData(factionId, from, to, tick = 0) {
  const [state, setState] = useState({ data: null, loading: false, error: null })
  const reqId = useRef(0)
  useEffect(() => {
    if (!factionId || !from || !to || from > to) { setState({ data: null, loading: false, error: null }); return }
    const key = `${factionId}|${from}|${to}`
    const cached = dataCache.get(key)
    // Ranges ending today change every 30 minutes — cache those for 5 minutes only.
    if (cached && (to < todayStr() || Date.now() - cached.at < 5 * 60000)) { setState({ data: cached.data, loading: false, error: null }); return }
    const id = ++reqId.current
    setState(s => ({ ...s, loading: true, error: null }))
    apiGet(`/api/leadership/activity/data?faction_id=${factionId}&from=${from}&to=${to}`)
      .then(d => { dataCache.set(key, { data: d, at: Date.now() }); if (id === reqId.current) setState({ data: d, loading: false, error: null }) })
      .catch(e => { if (id === reqId.current) setState({ data: null, loading: false, error: e.message }) })
  }, [factionId, from, to, tick])
  return state
}

// ── Explorer body ────────────────────────────────────────────────────────────
// rolling: { startTs } — a 24-hour window crossing midnight, shown as one day
// starting at startTs (data already clipped to the window). Members still use
// the real days so their usual hours stay correct.
const ROLL = 'rolling'
export function ExplorerBody({ dataA: rawA, dataB: rawB, nameA, nameB, days: rawDays, res, metric, value, layout, isDay: rawIsDay, rolling, highlightDay, membersOf, setMembersOf, loadingB }) {
  const isMobile = useIsMobile()
  const nb = bucketsPerDay(res)
  const rollStart = rolling?.startTs
  const dataA = useMemo(() => (rollStart ? rollDay(rawA, rollStart, ROLL) : rawA), [rawA, rollStart])
  const dataB = useMemo(() => (rollStart && rawB ? rollDay(rawB, rollStart, ROLL) : rawB), [rawB, rollStart])
  const days = useMemo(() => (rollStart ? [ROLL] : rawDays), [rollStart, rawDays])
  const isDay = rollStart ? true : rawIsDay
  const off = rollStart ? new Date(rollStart * 1000).getUTCHours() * (res === 'half' ? 2 : 1) : 0
  const sh = (i) => (i + off) % nb
  const cellsA = useMemo(() => aggregateCells(dataA.members, days, res), [dataA, days, res])
  const cellsB = useMemo(() => (dataB ? aggregateCells(dataB.members, days, res) : null), [dataB, days, res])

  const gridFor = (cells) => (layout === 'calendar' || isDay ? calendarGrid : weekdayGrid)(cells, days, res, metric, value)
  const gridA = useMemo(() => gridFor(cellsA), [cellsA, layout, isDay, metric, value]) // eslint-disable-line react-hooks/exhaustive-deps
  const gridB = useMemo(() => (cellsB ? gridFor(cellsB) : null), [cellsB, layout, isDay, metric, value]) // eslint-disable-line react-hooks/exhaustive-deps

  const breakdownA = useMemo(() => hourlyBreakdown(cellsA, days, res), [cellsA, days, res])
  const breakdownB = useMemo(() => (cellsB ? hourlyBreakdown(cellsB, days, res) : null), [cellsB, days, res])
  const sumA = summarize(breakdownA, res, off)
  const sumB = breakdownB ? summarize(breakdownB, res, off) : null

  const isCal = layout === 'calendar' || isDay
  const rowLabels = rollStart ? ['24h'] : isCal
    ? days.map(d => (isMobile ? fmtDay(d, { day: 'numeric' }) : fmtDay(d, { weekday: 'short', day: 'numeric', month: 'short' })))
    : WEEKDAYS
  const rowFullLabels = rollStart ? ['Last 24 hours'] : isCal ? days.map(d => fmtDay(d, { weekday: 'long', day: 'numeric', month: 'short' })) : ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
  const colLabels = Array.from({ length: nb }, (_, b) => (isMobile ? bucketLabel(b, res, off) : bucketShortLabel(b, res, off)))
  const colFullLabels = Array.from({ length: nb }, (_, b) => bucketLabel(b, res, off))
  const highlightRows = isCal && highlightDay ? [days.indexOf(highlightDay)].filter(i => i >= 0) : []
  const fmt = (v) => fmtVal(v, value)
  const metricWord = metric === 'present' ? 'active or idle' : 'active'
  const describeCal = (cells) => (r, c) => {
    const x = cells[days[r]]?.[c]
    return x ? `${x.active} active · ${x.idle} idle · ${x.offline} offline of ${x.covered}` : ''
  }

  const tracked = Object.keys(dataA.members || {}).length
  const noData = !rawA.days_with_data?.length

  const diffGrid = useMemo(() => (gridB ? gridA.map((row, r) => row.map((v, c) => (v == null || gridB[r]?.[c] == null ? null : v - gridB[r][c]))) : null), [gridA, gridB])

  return (
    <>
      {noData && (
        <div style={{ ...card, borderColor: 'rgba(251,191,36,0.3)' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#fbbf24' }}>
            No activity for {nameA} in this period.{dataA.faction?.first_day ? ` Tracking started ${fmtDay(dataA.faction.first_day, { day: 'numeric', month: 'short', year: 'numeric' })}.` : ' Data appears within 30 minutes of a faction being added.'}
          </p>
        </div>
      )}

      {/* ── Summary ── */}
      {!noData && (dataB ? (
        <div style={card}>
          <h3 style={sectionTitle}>Head to head</h3>
          <p style={sectionSub}>Averages over the period.</p>
          <CompareTable rows={[
            ['Avg active', fmtPct(sumA?.avgActive), fmtPct(sumB?.avgActive), (sumA?.avgActive ?? 0) - (sumB?.avgActive ?? 0)],
            ['Peak', sumA ? `${sumA.peak.label} · ${fmtPct(sumA.peak.pct)}` : '—', sumB ? `${sumB.peak.label} · ${fmtPct(sumB.peak.pct)}` : '—', null],
            ['Quietest', sumA ? `${sumA.low.label} · ${fmtPct(sumA.low.pct)}` : '—', sumB ? `${sumB.low.label} · ${fmtPct(sumB.low.pct)}` : '—', null],
            ['Quietest (members on)', sumA ? `≈${Math.round(sumA.low.count)}` : '—', sumB ? `≈${Math.round(sumB.low.count)}` : '—', null],
            ['Members tracked', tracked, Object.keys(dataB.members || {}).length, null],
          ]} nameA={nameA} nameB={nameB} />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <StatTile label="Avg active" value={fmtPct(sumA?.avgActive)} sub={`per ${res === 'half' ? 'half hour' : 'hour'}`} color="#c4b5fd" />
          <StatTile label="Busiest" value={sumA?.peak.label ?? '—'} sub={sumA ? `${fmtPct(sumA.peak.pct)} · ≈${Math.round(sumA.peak.count)} members` : ''} />
          <StatTile label="Quietest" value={sumA?.low.label ?? '—'} sub={sumA ? `${fmtPct(sumA.low.pct)} · ≈${Math.round(sumA.low.count)} members` : ''} />
          <StatTile label="Members" value={tracked} sub={dataA.faction?.first_day ? `tracked since ${fmtDay(dataA.faction.first_day, { day: 'numeric', month: 'short' })}` : ''} />
        </div>
      ))}

      {loadingB && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading {nameB}…</p>}

      {!noData && dataB && (
        <>
          <div style={card}>
            <h3 style={sectionTitle}>Advantage: {nameA} vs {nameB}</h3>
            <p style={sectionSub}>Purple: {nameA} has more {metricWord}. Copper: {nameB} does.</p>
            <Heatmap grid={diffGrid} rowLabels={rowLabels} rowFullLabels={rowFullLabels} colLabels={colLabels} colFullLabels={colFullLabels}
              scale="div" format={(v) => (value === 'count' ? `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}` : `${v > 0 ? '+' : ''}${Math.round(v * 100)}`)}
              legend={{ pos: `${nameA} ahead`, neg: `${nameB} ahead` }} highlightRows={highlightRows} />
          </div>
          <div style={card}>
            <h3 style={sectionTitle}>By hour of day</h3>
            <p style={sectionSub}>Average % active by time of day.</p>
            <ProfileLines res={res} off={off} series={[
              { label: nameA, color: COLOR_A, values: breakdownA.map(v => (v ? v.active : null)) },
              { label: nameB, color: COLOR_B, values: (breakdownB || []).map(v => (v ? v.active : null)) },
            ]} />
          </div>
        </>
      )}

      {/* ── Faction heatmap(s) ── */}
      {!noData && (isDay && !dataB ? (
        <>
          <div style={card}>
            <h3 style={sectionTitle}>{nameA} — {rollStart ? 'last 24 hours' : fmtDay(days[0], { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
            <p style={sectionSub}>Active, idle and offline by hour.</p>
            <HourlyBars breakdown={breakdownA} res={res} off={off} />
          </div>
          <div style={card}>
            <h3 style={sectionTitle}>Who was on</h3>
            <p style={sectionSub}>Each member through the day.</p>
            <StateLegend />
            <div style={{ marginTop: 8 }}>
              <StateGrid res={res} nCols={nb}
                rows={Object.entries(dataA.members).filter(([, m]) => m.d[days[0]]).map(([id, m]) => ({
                  key: id, label: m.n,
                  states: Array.from({ length: nb }, (_, b) => bucketState(m.d[days[0]], b, res)),
                })).sort((a, b) => b.states.filter(s => s === '2').length - a.states.filter(s => s === '2').length)}
                colLabel={(i, full) => (full ? bucketLabel(i, res, off) : (res === 'half' ? (sh(i) % 4 === 0 ? String(sh(i) / 2) : '') : (sh(i) % 3 === 0 ? String(sh(i)) : '')))} />
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={card}>
            <h3 style={sectionTitle}>{nameA}{isCal ? ' — by date' : ' — weekly pattern'}</h3>
            <p style={sectionSub}>{value === 'count' ? 'Members' : 'Share of members'} {metricWord}{isCal ? '' : ', averaged for each weekday'}.</p>
            <Heatmap grid={gridA} rowLabels={rowLabels} rowFullLabels={rowFullLabels} colLabels={colLabels} colFullLabels={colFullLabels}
              format={fmt} describe={isCal ? describeCal(cellsA) : undefined} highlightRows={highlightRows} />
          </div>
          {dataB && gridB && (
            <div style={card}>
              <h3 style={sectionTitle}>{nameB}{isCal ? ' — by date' : ' — weekly pattern'}</h3>
              <p style={sectionSub}>{value === 'count' ? 'Members' : 'Share of members'} {metricWord}.</p>
              <Heatmap grid={gridB} rowLabels={rowLabels} rowFullLabels={rowFullLabels} colLabels={colLabels} colFullLabels={colFullLabels}
                format={fmt} describe={isCal ? describeCal(cellsB) : undefined} highlightRows={highlightRows} />
            </div>
          )}
          {!dataB && (
            <div style={card}>
              <h3 style={sectionTitle}>By hour of day</h3>
              <p style={sectionSub}>Average active, idle and offline by time of day.</p>
              <HourlyBars breakdown={breakdownA} res={res} />
            </div>
          )}
        </>
      ))}

      {!noData && (
        <>
          {dataB && (
            <div style={{ marginBottom: 8 }}>
              <Segmented options={[{ k: 'A', label: `${nameA} members` }, { k: 'B', label: `${nameB} members` }]} value={membersOf} onChange={setMembersOf} />
            </div>
          )}
          <MemberPanel members={(rawB && membersOf === 'B' ? rawB : rawA).members} days={rawDays} res={res} />
        </>
      )}
    </>
  )
}

function CompareTable({ rows, nameA, nameB }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '6px 10px', fontSize: 13 }}>
      <span />
      <span style={{ color: COLOR_A, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameA}</span>
      <span style={{ color: COLOR_B, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameB}</span>
      {rows.map(([label, a, b, diff]) => (
        <Fragmentish key={label}>
          <span style={{ color: 'var(--text-muted)' }}>{label}</span>
          <span style={{ color: '#f4f4f5', fontWeight: diff != null && diff > 0 ? 700 : 400 }}>{a}</span>
          <span style={{ color: '#f4f4f5', fontWeight: diff != null && diff < 0 ? 700 : 400 }}>{b}</span>
        </Fragmentish>
      ))}
    </div>
  )
}
function Fragmentish({ children }) { return <>{children}</> }

// ── Small controls ───────────────────────────────────────────────────────────
export function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', maxWidth: '100%', overflowX: 'auto' }}>
      {options.map(o => (
        <button key={o.k} onClick={() => onChange(o.k)} style={{
          padding: '7px 12px', fontSize: 12, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
          background: value === o.k ? 'rgba(167,139,250,0.2)' : 'transparent',
          color: value === o.k ? '#f4f4f5' : 'var(--text-secondary)', fontWeight: value === o.k ? 600 : 400,
        }}>{o.label}</button>
      ))}
    </div>
  )
}

