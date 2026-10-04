import { useEffect, useMemo, useState } from 'react'
import { todayStr, addDays, daysBetween, tsToDay, fmtDay } from './activityUtils'
import { ExplorerBody, useActivityData, Segmented } from './ExplorerBody'
import { card } from './Charts'
import { timeAgo } from '../../lib/dates'

// Warfare tab → a war → Activity. Compares our faction with the opponent using
// the faction activity tracker's data (factionActivityController.js):
//   Past week / Past month — the period leading up to the war (ending today
//     while matched, or the day before the war started once it has).
//   Since war start — the war itself, from its exact start time (earlier
//     hours of the start day are blanked) to its end, refreshing every 5
//     minutes while the war is active.
const FACTION_NAMES = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' }
const SLOT = 1800
const REFRESH_MS = 5 * 60000

// Blank (→ '.') every 30-min slot outside [fromTs, toTs) so the war view only
// counts the war's own hours. Wars start on the hour, so this aligns exactly.
function clipToWindow(data, fromTs, toTs) {
  if (!data) return data
  const members = {}
  for (const [id, m] of Object.entries(data.members || {})) {
    const d = {}
    for (const [day, str] of Object.entries(m.d)) {
      const dayStart = Date.parse(`${day}T00:00:00Z`) / 1000
      let out = ''
      for (let i = 0; i < str.length; i++) {
        const s = dayStart + i * SLOT
        out += (s + SLOT <= fromTs || (toTs && s >= toTs)) ? '.' : str[i]
      }
      d[day] = out
    }
    members[id] = { ...m, d }
  }
  return { ...data, members }
}

export default function WarActivityTab({ war }) {
  const startTs = war.started_at || null
  const started = !!startTs && startTs <= Math.floor(Date.now() / 1000)
  const live = war.status === 'active'
  const [view, setView] = useState(started ? 'war' : 'week')
  const [res, setRes] = useState('hour')
  const [metric, setMetric] = useState('active')
  const [value, setValue] = useState('pct')
  const [membersOf, setMembersOf] = useState('B')
  const [tick, setTick] = useState(0)

  // Live wars: re-check every 5 minutes (samples land every 30).
  useEffect(() => {
    if (!live || view !== 'war') return
    const t = setInterval(() => setTick(x => x + 1), REFRESH_MS)
    return () => clearInterval(t)
  }, [live, view])

  const range = useMemo(() => {
    const today = todayStr()
    if (view === 'war' && started) {
      const end = war.ended_at ? tsToDay(war.ended_at) : today
      return { from: tsToDay(startTs), to: end > today ? today : end }
    }
    const end = started ? addDays(tsToDay(startTs), -1) : today
    return { from: addDays(end, view === 'month' ? -29 : -6), to: end }
  }, [view, started, startTs, war.ended_at])
  const days = useMemo(() => daysBetween(range.from, range.to), [range])

  const ourId = war.faction_id, oppId = war.opponent_faction_id
  const ourName = FACTION_NAMES[ourId] || `Faction ${ourId}`
  const oppName = war.opponent_faction_name || `Faction ${oppId}`

  const { data: rawA, loading: loadingA, error: errA } = useActivityData(ourId, range.from, range.to, tick)
  const { data: rawB, loading: loadingB, error: errB } = useActivityData(oppId, range.from, range.to, tick)

  const isWarView = view === 'war' && started
  const dataA = useMemo(() => (isWarView ? clipToWindow(rawA, startTs, war.ended_at) : rawA), [rawA, isWarView, startTs, war.ended_at])
  const dataB = useMemo(() => (isWarView ? clipToWindow(rawB, startTs, war.ended_at) : rawB), [rawB, isWarView, startTs, war.ended_at])

  const views = [
    { k: 'week', label: started ? 'Week before war' : 'Past week' },
    { k: 'month', label: started ? 'Month before war' : 'Past month' },
    ...(started ? [{ k: 'war', label: live ? '● Since war start (live)' : 'During war' }] : []),
  ]

  const oppNoData = rawB && !rawB.days_with_data?.length
  const lastSample = rawB?.faction?.last_sampled_at

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ ...card, padding: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Segmented options={views} value={view} onChange={setView} />
          <Segmented options={[{ k: 'hour', label: 'Hourly' }, { k: 'half', label: '30 min' }]} value={res} onChange={setRes} />
          <Segmented options={[{ k: 'active', label: 'Active' }, { k: 'present', label: 'Active + idle' }]} value={metric} onChange={setMetric} />
          <Segmented options={[{ k: 'pct', label: '%' }, { k: 'count', label: 'Members' }]} value={value} onChange={setValue} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '10px 0 0' }}>
          {fmtDay(range.from, { day: 'numeric', month: 'short' })} – {fmtDay(range.to, { day: 'numeric', month: 'short' })}
          {isWarView ? ` · from ${new Date(startTs * 1000).toISOString().slice(11, 16)} TCT on the start day` : ''}
          {isWarView && live ? ' · refreshes every 5 min' : ''}
          {lastSample ? ` · last sample ${timeAgo(new Date(lastSample * 1000).toISOString())}` : ''}
          {' · '}full views on the <a href="/activity" style={{ color: '#a78bfa' }}>Activity page</a>
        </p>
      </div>

      {(errA || errB) && <p style={{ color: '#f87171', fontSize: 13 }}>{errA || errB}</p>}
      {(loadingA || loadingB) && !(dataA && dataB) && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading activity…</p>}

      {oppNoData && (
        <div style={{ ...card, borderColor: 'rgba(251,191,36,0.3)' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#fbbf24' }}>
            No activity recorded for {oppName} in this period
            {rawB.faction?.first_day
              ? ` — tracking started ${fmtDay(rawB.faction.first_day, { day: 'numeric', month: 'short' })}, so earlier days have no data.`
              : rawB.faction?.is_active ? ' yet — they\'re sampled every 30 minutes from when the war was matched.' : ' — they aren\'t being tracked (add them on the Activity page → Manage).'}
          </p>
        </div>
      )}

      {dataA && dataB && !oppNoData && (
        <ExplorerBody
          dataA={dataA} dataB={dataB} nameA={ourName} nameB={oppName}
          days={days} res={res} metric={metric} value={value}
          layout={view === 'month' ? 'pattern' : 'calendar'} isDay={false}
          highlightDay={isWarView ? range.from : null}
          membersOf={membersOf} setMembersOf={setMembersOf} loadingB={loadingB}
        />
      )}
    </div>
  )
}
