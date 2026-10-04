import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  OWN_FACTIONS, WEEKDAYS, apiGet, todayStr, addDays, daysBetween, fmtDay, tsToDay,
  periodRange, shiftAnchor, periodLabel, bucketsPerDay, bucketLabel, bucketShortLabel, bucketState,
  aggregateCells, calendarGrid, weekdayGrid, hourlyBreakdown, summarize, fmtPct, fmtVal, useIsMobile,
} from '../components/Activity/activityUtils'
import Heatmap from '../components/Activity/Heatmap'
import { HourlyBars, ProfileLines, StateGrid, StatTile, StateLegend, card, sectionTitle, sectionSub } from '../components/Activity/Charts'
import MemberPanel from '../components/Activity/MemberPanel'
import ManagePanel from '../components/Activity/ManagePanel'

const TABS = [
  { k: 'explorer', label: 'Explorer' },
  { k: 'wars', label: 'Wars' },
  { k: 'manage', label: 'Manage' },
]
const PERIODS = [
  { k: 'day', label: 'Day' },
  { k: 'week', label: 'Week' },
  { k: 'month', label: 'Month' },
  { k: '28d', label: '28 days' },
]
const COLOR_A = '#a78bfa', COLOR_B = '#e5a57a'

export default function Activity() {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('explorer')
  const [factions, setFactions] = useState([])
  const [factionsErr, setFactionsErr] = useState(null)

  // Explorer state
  const [factionA, setFactionA] = useState(33097)
  const [factionB, setFactionB] = useState(null)
  const [periodType, setPeriodType] = useState('week')
  const [anchor, setAnchor] = useState(todayStr())
  const [custom, setCustom] = useState(null) // { from, to, label, highlightDay }
  const [res, setRes] = useState('hour')
  const [metric, setMetric] = useState('active')
  const [value, setValue] = useState('pct')
  const [layout, setLayout] = useState(null) // null = auto
  const [membersOf, setMembersOf] = useState('A')

  const loadFactions = useCallback(() => {
    apiGet('/api/leadership/activity/factions')
      .then(j => { setFactions(j.factions || []); setFactionsErr(null) })
      .catch(e => setFactionsErr(e.message))
  }, [])
  useEffect(() => { loadFactions() }, [loadFactions])

  const range = useMemo(() => {
    const r = custom ? { from: custom.from, to: custom.to } : periodRange(periodType, anchor)
    const today = todayStr()
    return { from: r.from, to: r.to > today ? today : r.to, fullTo: r.to }
  }, [custom, periodType, anchor])
  const days = useMemo(() => (range.from <= range.to ? daysBetween(range.from, range.to) : []), [range])
  const isDay = days.length === 1
  const effLayout = layout || (custom ? 'calendar' : periodType === 'week' ? 'calendar' : 'pattern')

  const { data: dataA, loading: loadingA, error: errA } = useActivityData(factionA, range.from, range.to)
  const { data: dataB, loading: loadingB, error: errB } = useActivityData(factionB, range.from, range.to)

  const nameOf = useCallback((id) => {
    if (!id) return ''
    const f = factions.find(x => x.faction_id === id)
    return f?.name || OWN_FACTIONS.find(o => o.id === id)?.name || `Faction ${id}`
  }, [factions])

  function viewFaction(id) { setFactionA(id); setFactionB(null); setCustom(null); setTab('explorer') }

  function openWar(w, mode) {
    setFactionA(w.faction_id)
    setFactionB(w.opponent_faction_id)
    setRes('hour')
    if (mode === 'pre') {
      const end = w.started_at ? addDays(tsToDay(w.started_at), -1) : todayStr()
      setCustom({ from: addDays(end, -27), to: end, label: `Pre-war: 28 days before vs ${w.opponent_faction_name || 'opponent'}` })
      setLayout('pattern')
    } else {
      const start = tsToDay(w.started_at || w.scheduled_start)
      const end = w.ended_at ? tsToDay(w.ended_at) : todayStr()
      setCustom({ from: start, to: end, label: `During war vs ${w.opponent_faction_name || 'opponent'}`, highlightDay: start })
      setLayout('calendar')
    }
    setTab('explorer')
  }

  return (
    <div style={{ color: '#f4f4f5', padding: '20px clamp(12px, 4vw, 20px)', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="font-cinzel" style={{ margin: 0, fontSize: 'clamp(20px, 5vw, 24px)', fontWeight: 700, letterSpacing: '1px' }}>Faction Activity</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '6px 0 0' }}>
          When members are active, sampled every 30 minutes. Times are TCT (UTC).
        </p>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 16, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: '10px 18px', background: 'transparent', border: 'none', whiteSpace: 'nowrap',
            borderBottom: tab === t.k ? '2px solid #b3123f' : '2px solid transparent',
            color: tab === t.k ? '#f4f4f5' : 'var(--text-secondary)', fontWeight: tab === t.k ? 600 : 400, fontSize: 14, cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      {factionsErr && <p style={{ color: '#f87171', fontSize: 13 }}>{factionsErr}</p>}

      {tab === 'manage' && <ManagePanel factions={factions} onChanged={loadFactions} onView={viewFaction} />}
      {tab === 'wars' && <WarsPanel nameOf={nameOf} onOpen={openWar} />}

      {tab === 'explorer' && (
        <>
          {/* ── Controls ── */}
          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <FactionSelect label="Faction" factions={factions} value={factionA} onChange={v => setFactionA(v)} />
              <FactionSelect label="Compare with" factions={factions} value={factionB} onChange={setFactionB} allowNone exclude={factionA} />
            </div>

            {custom ? (
              <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#fbbf24', flex: '1 1 200px' }}>
                  {custom.label} · {fmtDay(custom.from, { day: 'numeric', month: 'short' })} – {fmtDay(custom.to, { day: 'numeric', month: 'short' })}
                </span>
                <button onClick={() => { setCustom(null); setLayout(null) }} style={ghost}>Back to normal periods</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
                <Segmented options={PERIODS} value={periodType} onChange={k => { setPeriodType(k); setLayout(null) }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 240px' }}>
                  <button onClick={() => setAnchor(a => shiftAnchor(periodType, a, -1))} style={navBtn} aria-label="Previous">‹</button>
                  <span style={{ fontSize: 13, color: '#f4f4f5', flex: 1, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{periodLabel(periodType, anchor)}</span>
                  <button onClick={() => setAnchor(a => shiftAnchor(periodType, a, 1))} disabled={periodRange(periodType, anchor).to >= todayStr()} style={{ ...navBtn, opacity: periodRange(periodType, anchor).to >= todayStr() ? 0.3 : 1 }} aria-label="Next">›</button>
                  <input type="date" value={anchor} max={todayStr()} onChange={e => e.target.value && setAnchor(e.target.value)} style={{ ...inputS, width: 140, padding: '6px 8px' }} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
              <Segmented options={[{ k: 'hour', label: 'Hourly' }, { k: 'half', label: '30 min' }]} value={res} onChange={setRes} />
              <Segmented options={[{ k: 'active', label: 'Active' }, { k: 'present', label: 'Active + idle' }]} value={metric} onChange={setMetric} />
              <Segmented options={[{ k: 'pct', label: '%' }, { k: 'count', label: 'Members' }]} value={value} onChange={setValue} />
              {!isDay && <Segmented options={[{ k: 'pattern', label: 'By weekday' }, { k: 'calendar', label: 'By date' }]} value={effLayout} onChange={setLayout} />}
            </div>
          </div>

          {(errA || errB) && <p style={{ color: '#f87171', fontSize: 13 }}>{errA || errB}</p>}
          {(loadingA || loadingB) && !dataA && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading activity…</p>}

          {dataA && (
            <ExplorerBody
              dataA={dataA} dataB={factionB ? dataB : null}
              nameA={nameOf(factionA)} nameB={nameOf(factionB)}
              days={days} res={res} metric={metric} value={value} layout={effLayout} isDay={isDay}
              highlightDay={custom?.highlightDay} membersOf={membersOf} setMembersOf={setMembersOf}
              loadingB={factionB && loadingB}
            />
          )}
        </>
      )}
    </div>
  )
}

// ── Data fetching with a small in-memory cache ───────────────────────────────
const dataCache = new Map()
function useActivityData(factionId, from, to) {
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
  }, [factionId, from, to])
  return state
}

// ── Explorer body ────────────────────────────────────────────────────────────
function ExplorerBody({ dataA, dataB, nameA, nameB, days, res, metric, value, layout, isDay, highlightDay, membersOf, setMembersOf, loadingB }) {
  const isMobile = useIsMobile()
  const nb = bucketsPerDay(res)
  const cellsA = useMemo(() => aggregateCells(dataA.members, days, res), [dataA, days, res])
  const cellsB = useMemo(() => (dataB ? aggregateCells(dataB.members, days, res) : null), [dataB, days, res])

  const gridFor = (cells) => (layout === 'calendar' || isDay ? calendarGrid : weekdayGrid)(cells, days, res, metric, value)
  const gridA = useMemo(() => gridFor(cellsA), [cellsA, layout, isDay, metric, value]) // eslint-disable-line react-hooks/exhaustive-deps
  const gridB = useMemo(() => (cellsB ? gridFor(cellsB) : null), [cellsB, layout, isDay, metric, value]) // eslint-disable-line react-hooks/exhaustive-deps

  const breakdownA = useMemo(() => hourlyBreakdown(cellsA, days, res), [cellsA, days, res])
  const breakdownB = useMemo(() => (cellsB ? hourlyBreakdown(cellsB, days, res) : null), [cellsB, days, res])
  const sumA = summarize(breakdownA, res)
  const sumB = breakdownB ? summarize(breakdownB, res) : null

  const isCal = layout === 'calendar' || isDay
  const rowLabels = isCal
    ? days.map(d => (isMobile ? fmtDay(d, { day: 'numeric' }) : fmtDay(d, { weekday: 'short', day: 'numeric', month: 'short' })))
    : WEEKDAYS
  const rowFullLabels = isCal ? days.map(d => fmtDay(d, { weekday: 'long', day: 'numeric', month: 'short' })) : ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
  const colLabels = Array.from({ length: nb }, (_, b) => (isMobile ? bucketLabel(b, res) : bucketShortLabel(b, res)))
  const colFullLabels = Array.from({ length: nb }, (_, b) => bucketLabel(b, res))
  const highlightRows = isCal && highlightDay ? [days.indexOf(highlightDay)].filter(i => i >= 0) : []
  const fmt = (v) => fmtVal(v, value)
  const metricWord = metric === 'present' ? 'active or idle' : 'active'
  const describeCal = (cells) => (r, c) => {
    const x = cells[days[r]]?.[c]
    return x ? `${x.active} active · ${x.idle} idle · ${x.offline} offline of ${x.covered}` : ''
  }

  const tracked = Object.keys(dataA.members || {}).length
  const noData = !dataA.days_with_data?.length

  const diffGrid = useMemo(() => (gridB ? gridA.map((row, r) => row.map((v, c) => (v == null || gridB[r]?.[c] == null ? null : v - gridB[r][c]))) : null), [gridA, gridB])

  return (
    <>
      {noData && (
        <div style={{ ...card, borderColor: 'rgba(251,191,36,0.3)' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#fbbf24' }}>
            No activity recorded for {nameA} in this period{dataA.faction?.first_day ? ` — tracking started ${fmtDay(dataA.faction.first_day, { day: 'numeric', month: 'short', year: 'numeric' })}` : ' yet — it\'s sampled every 30 minutes from when it was added'}.
          </p>
        </div>
      )}

      {/* ── Summary ── */}
      {!noData && (dataB ? (
        <div style={card}>
          <h3 style={sectionTitle}>Head to head</h3>
          <p style={sectionSub}>Averages across every tracked {res === 'half' ? 'half hour' : 'hour'} in the period.</p>
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
            <p style={sectionSub}>Difference in {value === 'count' ? 'members' : 'share of members'} {metricWord}. Purple = {nameA} ahead, copper = {nameB} ahead.</p>
            <Heatmap grid={diffGrid} rowLabels={rowLabels} rowFullLabels={rowFullLabels} colLabels={colLabels} colFullLabels={colFullLabels}
              scale="div" format={(v) => (value === 'count' ? `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}` : `${v > 0 ? '+' : ''}${Math.round(v * 100)}`)}
              legend={{ pos: `${nameA} ahead`, neg: `${nameB} ahead` }} highlightRows={highlightRows} />
          </div>
          <div style={card}>
            <h3 style={sectionTitle}>By hour of day</h3>
            <p style={sectionSub}>Average share active at each time across the period.</p>
            <ProfileLines res={res} series={[
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
            <h3 style={sectionTitle}>{nameA} — {fmtDay(days[0], { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
            <p style={sectionSub}>Share of members active, idle and offline at each time.</p>
            <HourlyBars breakdown={breakdownA} res={res} />
          </div>
          <div style={card}>
            <h3 style={sectionTitle}>Who was on</h3>
            <p style={sectionSub}>Every member, every {res === 'half' ? 'half hour' : 'hour'} of the day.</p>
            <StateLegend />
            <div style={{ marginTop: 8 }}>
              <StateGrid res={res} nCols={nb}
                rows={Object.entries(dataA.members).filter(([, m]) => m.d[days[0]]).map(([id, m]) => ({
                  key: id, label: m.n,
                  states: Array.from({ length: nb }, (_, b) => bucketState(m.d[days[0]], b, res)),
                })).sort((a, b) => b.states.filter(s => s === '2').length - a.states.filter(s => s === '2').length)}
                colLabel={(i, full) => (full ? bucketLabel(i, res) : (res === 'half' ? (i % 4 === 0 ? String(i / 2) : '') : (i % 3 === 0 ? String(i) : '')))} />
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
              <p style={sectionSub}>Average share of members active, idle and offline at each time across the period.</p>
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
          <MemberPanel members={(dataB && membersOf === 'B' ? dataB : dataA).members} days={days} res={res} />
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

// ── Wars ─────────────────────────────────────────────────────────────────────
function WarsPanel({ nameOf, onOpen }) {
  const [wars, setWars] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { apiGet('/api/leadership/activity/wars').then(j => setWars(j.wars || [])).catch(e => setErr(e.message)) }, [])
  if (err) return <p style={{ color: '#f87171', fontSize: 13 }}>{err}</p>
  if (!wars) return <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading wars…</p>
  return (
    <div style={card}>
      <h3 style={sectionTitle}>Ranked wars</h3>
      <p style={sectionSub}>Opponents are tracked automatically from the moment a war is matched. <strong>Pre-war pattern</strong> compares the 28 days before the war (only what's been tracked — usually from match day, more if the faction was already on the list); <strong>During war</strong> shows both factions hour by hour since the war started.</p>
      {!wars.length && <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No recent or upcoming wars.</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {wars.map(w => {
          const started = !!w.started_at || w.status === 'active' || w.status === 'completed'
          const statusColor = w.status === 'active' ? '#4ade80' : w.status === 'matched' ? '#fbbf24' : 'var(--text-muted)'
          return (
            <div key={w.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{nameOf(w.faction_id)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>vs</span> {w.opponent_faction_name || `Faction ${w.opponent_faction_id}`}</span>
                <span style={{ fontSize: 11, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{w.status}{w.result ? ` · ${w.result}` : ''}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 8px' }}>
                {w.started_at ? `Started ${fmtDay(tsToDay(w.started_at), { weekday: 'short', day: 'numeric', month: 'short' })}` : w.scheduled_start ? `Starts ${new Date(w.scheduled_start * 1000).toUTCString().slice(0, 22)} TCT` : ''}
                {w.ended_at ? ` · ended ${fmtDay(tsToDay(w.ended_at), { day: 'numeric', month: 'short' })}` : ''}
                {' · '}{w.opponent_first_day ? `opponent tracked since ${fmtDay(w.opponent_first_day, { day: 'numeric', month: 'short' })}` : w.opponent_tracked ? 'opponent tracking starts within 30 min' : 'opponent not tracked'}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => onOpen(w, 'pre')} style={ghost}>Pre-war pattern</button>
                <button onClick={() => onOpen(w, 'war')} disabled={!started} style={{ ...ghost, opacity: started ? 1 : 0.4, cursor: started ? 'pointer' : 'default' }}>During war</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Small controls ───────────────────────────────────────────────────────────
function Segmented({ options, value, onChange }) {
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

// Native <select> (best on phones) with a filter box for long lists.
function FactionSelect({ label, factions, value, onChange, allowNone, exclude }) {
  const [q, setQ] = useState('')
  const usable = factions.filter(f => f.faction_id !== exclude && (f.days_stored > 0 || f.is_active))
  const matches = (f) => !q || `${f.name || ''} ${f.tag || ''} ${f.faction_id}`.toLowerCase().includes(q.toLowerCase())
  const own = usable.filter(f => f.source === 'own')
  const war = usable.filter(f => f.source === 'war' && matches(f))
  const others = usable.filter(f => f.source === 'manual' && matches(f))
  const opt = (f) => <option key={f.faction_id} value={f.faction_id}>{f.name || `Faction ${f.faction_id}`}{f.tag ? ` [${f.tag}]` : ''}{f.days_stored ? '' : ' (no data yet)'}</option>
  const showFilter = usable.length > 12
  return (
    <div style={{ minWidth: 0 }}>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        {showFilter && <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter…" style={{ ...inputS, width: 90, flex: '0 0 auto' }} />}
        <select value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)} style={{ ...inputS, flex: 1, minWidth: 0 }}>
          {allowNone && <option value="">— none —</option>}
          {own.length > 0 && <optgroup label="Our factions">{own.map(opt)}</optgroup>}
          {war.length > 0 && <optgroup label="War opponents">{war.map(opt)}</optgroup>}
          {others.length > 0 && <optgroup label={`Tracked (${others.length})`}>{others.map(opt)}</optgroup>}
          {value && !usable.some(f => f.faction_id === value) && <option value={value}>Faction {value}</option>}
        </select>
      </div>
    </div>
  )
}

const inputS = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)', color: '#f4f4f5', fontSize: 13, minWidth: 0, boxSizing: 'border-box',
}
const navBtn = {
  width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
  color: '#f4f4f5', fontSize: 18, cursor: 'pointer', flex: '0 0 auto',
}
const ghost = {
  padding: '7px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-secondary)',
}
