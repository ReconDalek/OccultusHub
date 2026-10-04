import { useMemo, useState } from 'react'
import {
  memberStats, typicalHours, fmtPct, fmtDay, seqColor, bucketState, bucketLabel, bucketsPerDay,
  WEEKDAYS, weekdayIdx, useIsMobile,
} from './activityUtils'
import Heatmap from './Heatmap'
import { StateGrid, StatTile, HourlyBars, card, sectionTitle, sectionSub } from './Charts'

const SORTS = [
  { k: 'activePct', label: 'Most active' },
  { k: 'activePctAsc', label: 'Least active' },
  { k: 'activeDays', label: 'Days active' },
  { k: 'name', label: 'Name' },
]

export default function MemberPanel({ members, days, res }) {
  const isMobile = useIsMobile()
  const [sort, setSort] = useState('activePct')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null) // member id

  const stats = useMemo(() => memberStats(members, days), [members, days])
  const list = useMemo(() => {
    const f = stats.filter(m => !q || m.name.toLowerCase().includes(q.toLowerCase()) || String(m.id).includes(q))
    const by = {
      activePct: (a, b) => (b.activePct ?? -1) - (a.activePct ?? -1),
      activePctAsc: (a, b) => (a.activePct ?? 2) - (b.activePct ?? 2),
      activeDays: (a, b) => b.activeDays - a.activeDays,
      name: (a, b) => a.name.localeCompare(b.name),
    }[sort]
    return [...f].sort(by)
  }, [stats, sort, q])

  const openMember = open != null ? stats.find(m => m.id === open) : null

  return (
    <div style={card}>
      <h3 style={sectionTitle}>Members</h3>
      <p style={sectionSub}>Share of tracked hours each member was active in this period, and when they're usually on (TCT). {isMobile ? 'Tap' : 'Click'} a member for their full breakdown.</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search members…" style={{ ...input, flex: '1 1 160px' }} />
        <select value={sort} onChange={e => setSort(e.target.value)} style={{ ...input, flex: '0 1 160px' }}>
          {SORTS.map(s => <option key={s.k} value={s.k}>{s.label}</option>)}
        </select>
      </div>

      {!list.length ? <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No member data for this period.</p> : (
        <div style={{ display: 'grid', gap: 4 }}>
          {!isMobile && (
            <div style={{ ...rowGrid, padding: '0 8px', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>Member</span><span>Active</span><span>Idle</span><span>Days</span><span>Usually on</span><span>Hour profile (00 → 23)</span>
            </div>
          )}
          {list.map(m => (
            <button key={m.id} onClick={() => setOpen(m.id)} style={{
              ...(isMobile ? {} : rowGrid), textAlign: 'left', padding: isMobile ? '10px 12px' : '7px 8px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', color: '#f4f4f5', width: '100%',
            }}>
              {isMobile ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                    <span style={{ fontSize: 12, color: '#c4b5fd', whiteSpace: 'nowrap' }}>{fmtPct(m.activePct)} active</span>
                  </div>
                  <HourStrip profile={m.hourProfile} />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
                    {m.activeDays}/{days.length} days · usually {typicalHours(m.hourProfile)} · {fmtPct(m.idlePct)} idle
                  </div>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                  <span style={{ fontSize: 12, color: '#c4b5fd' }}>{fmtPct(m.activePct)}</span>
                  <span style={{ fontSize: 12, color: '#eab308' }}>{fmtPct(m.idlePct)}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.activeDays}/{days.length}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{typicalHours(m.hourProfile)}</span>
                  <HourStrip profile={m.hourProfile} />
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {openMember && (
        <MemberDetail member={openMember} raw={members[openMember.id]} days={days} res={res} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}

const input = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)', color: '#f4f4f5', fontSize: 13, minWidth: 0,
}
const rowGrid = { display: 'grid', gridTemplateColumns: 'minmax(110px, 1.2fr) 60px 50px 56px minmax(90px, 1fr) minmax(170px, 1.6fr)', alignItems: 'center', gap: 10 }

// 24 cells — how often the member is active at each hour of the day.
function HourStrip({ profile }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: 1 }}>
      {profile.map((v, h) => (
        <span key={h} title={`${String(h).padStart(2, '0')}:00 · ${v == null ? 'no data' : fmtPct(v)}`}
          style={{ height: 12, borderRadius: 2, background: v == null ? 'rgba(255,255,255,0.04)' : seqColor(v) }} />
      ))}
    </div>
  )
}

function MemberDetail({ member, raw, days, res, onClose }) {
  const isMobile = useIsMobile()
  const nb = bucketsPerDay(res)

  // Weekday × bucket: share of days the member was active in that bucket.
  const pattern = useMemo(() => {
    const sum = Array.from({ length: 7 }, () => Array(nb).fill(0))
    const cnt = Array.from({ length: 7 }, () => Array(nb).fill(0))
    for (const day of days) {
      const str = raw?.d?.[day]
      if (!str) continue
      const w = weekdayIdx(day)
      for (let b = 0; b < nb; b++) {
        const s = bucketState(str, b, res)
        if (s === '.') continue
        cnt[w][b]++
        if (s === '2') sum[w][b]++
      }
    }
    return sum.map((r, w) => r.map((s, b) => (cnt[w][b] ? s / cnt[w][b] : null)))
  }, [raw, days, res, nb])

  const breakdown = useMemo(() => Array.from({ length: nb }, (_, b) => {
    let a = 0, i = 0, o = 0, n = 0
    for (const day of days) {
      const s = bucketState(raw?.d?.[day], b, res)
      if (s === '.') continue
      n++
      if (s === '2') a++; else if (s === '1') i++; else o++
    }
    return n ? { active: a / n, idle: i / n, offline: o / n, activeCount: a / n } : null
  }), [raw, days, res, nb])

  const timeline = days.filter(d => raw?.d?.[d]).map(d => ({
    key: d, label: fmtDay(d, { weekday: 'short', day: 'numeric', month: 'short' }),
    states: Array.from({ length: nb }, (_, b) => bucketState(raw.d[d], b, res)),
  })).reverse()

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20,
    }}>
      <div style={{
        background: '#121218', border: isMobile ? 'none' : '1px solid rgba(255,255,255,0.1)', borderRadius: isMobile ? 0 : 14,
        width: '100%', maxWidth: 980, maxHeight: isMobile ? '100%' : '92vh', overflowY: 'auto', padding: 'clamp(14px, 3vw, 22px)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18, color: '#f4f4f5' }}>{member.name}</h2>
            <a href={`https://www.torn.com/profiles.php?XID=${member.id}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#a78bfa' }}>[{member.id}] profile ↗</a>
          </div>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}>✕ Close</button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <StatTile label="Active" value={fmtPct(member.activePct)} sub="of tracked hours" color="#c4b5fd" />
          <StatTile label="Idle" value={fmtPct(member.idlePct)} sub="session open, no action" color="#eab308" />
          <StatTile label="Days active" value={`${member.activeDays}/${days.length}`} sub={member.lastActiveDay ? `last ${fmtDay(member.lastActiveDay, { day: 'numeric', month: 'short' })}` : 'none'} />
          <StatTile label="Usually on" value={typicalHours(member.hourProfile)} sub="hours active ≥ half the time" />
        </div>

        <div style={card}>
          <h3 style={sectionTitle}>Weekly pattern</h3>
          <p style={sectionSub}>Share of days they were active at each time (TCT).</p>
          <Heatmap grid={pattern} rowLabels={WEEKDAYS} colLabels={Array.from({ length: nb }, (_, b) => (res === 'half' ? (b % 4 === 0 ? String(b / 2) : '') : String(b)))}
            colFullLabels={Array.from({ length: nb }, (_, b) => bucketLabel(b, res))} format={fmtPct} />
        </div>

        <div style={card}>
          <h3 style={sectionTitle}>By hour of day</h3>
          <HourlyBars breakdown={breakdown} res={res} />
        </div>

        <div style={card}>
          <h3 style={sectionTitle}>Day by day</h3>
          <p style={sectionSub}>Every tracked {res === 'half' ? 'half hour' : 'hour'} — purple active, yellow idle, grey offline.</p>
          {timeline.length ? (
            <StateGrid rows={timeline} nCols={nb} res={res} labelWidth={96}
              colLabel={(i, full) => (full ? bucketLabel(i, res) : (res === 'half' ? (i % 4 === 0 ? String(i / 2) : '') : (i % 3 === 0 ? String(i) : '')))} />
          ) : <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No days tracked.</p>}
        </div>
      </div>
    </div>
  )
}
