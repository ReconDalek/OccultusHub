import { useEffect, useState } from 'react'
import { apiGet, sectionSub, fmtSlotDay, fmtSlotTime } from './chainWatcherUtils'
import CollapsibleCard from './CollapsibleCard'

const REFRESH_MS = 60000

// Leadership-only — totals (completed/upcoming/total hours) per member for
// whichever run of claimed shifts counts as the "current watch". A watch is
// just a contiguous run of claimed hours; 3+ days with nothing claimed marks
// the end of one, so a leader who's pre-scheduled sign-ups far in the future
// doesn't have those lumped into "current" totals.
export default function WatchTotalsCard({ factionId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null) // torn_user_id whose notes are shown

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const json = await apiGet(`/api/chain-watcher/watch-totals?faction_id=${factionId}`)
        if (!cancelled) { setData(json); setError(null) }
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    }
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => { cancelled = true; clearInterval(t) }
  }, [factionId])

  if (error) {
    return (
      <CollapsibleCard title="Watch Totals">
        <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>
      </CollapsibleCard>
    )
  }

  if (!data) {
    return (
      <CollapsibleCard title="Watch Totals">
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Loading…</p>
      </CollapsibleCard>
    )
  }

  if (!data.totalShifts) {
    return (
      <CollapsibleCard title="Watch Totals">
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No shifts signed up yet.</p>
      </CollapsibleCard>
    )
  }

  return (
    <CollapsibleCard title="Watch Totals">
      <p style={sectionSub}>
        {data.totalShifts} shift{data.totalShifts === 1 ? '' : 's'} for the current watch
        {' '}({new Date(data.watchStart * 1000).toLocaleDateString()} &ndash; {new Date(data.watchEnd * 1000).toLocaleDateString()})
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="flex items-center" style={{ gap: 10, padding: '0 10px 4px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <span style={{ flex: '1 1 auto' }}>Member</span>
          <span style={{ width: 72, textAlign: 'right' }}>Completed</span>
          <span style={{ width: 72, textAlign: 'right' }}>Upcoming</span>
          <span style={{ width: 50, textAlign: 'right' }}>Total</span>
        </div>
        {data.members.map(m => {
          const hasNotes = m.notes?.length > 0
          const isExpanded = expandedId === m.torn_user_id
          return (
            <div key={m.torn_user_id}>
              <div
                className="flex items-center"
                onClick={() => hasNotes && setExpandedId(isExpanded ? null : m.torn_user_id)}
                title={hasNotes ? 'Click to view notes on this member’s shifts' : undefined}
                style={{
                  gap: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-subtle)', cursor: hasNotes ? 'pointer' : 'default',
                }}
              >
                <span className="flex items-center" style={{ gap: 6, flex: '1 1 auto', minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.username || m.torn_user_id}
                  </span>
                  {hasNotes && (
                    <span
                      title={`${m.notes.length} note${m.notes.length === 1 ? '' : 's'}`}
                      style={{
                        flexShrink: 0, width: 16, height: 16, borderRadius: '50%', background: 'rgba(248,113,113,0.2)',
                        color: '#f87171', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {m.notes.length}
                    </span>
                  )}
                </span>
                <span style={{ width: 72, textAlign: 'right', fontSize: 13, color: 'var(--text-secondary)' }}>{m.completed}</span>
                <span style={{ width: 72, textAlign: 'right', fontSize: 13, color: 'var(--text-secondary)' }}>{m.upcoming}</span>
                <span style={{ width: 50, textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#c4b5fd' }}>{m.total}</span>
              </div>
              {isExpanded && hasNotes && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 10px 6px 16px' }}>
                  {m.notes.map((n, i) => (
                    <div key={i} style={{ fontSize: 11.5, color: '#f87171' }}>
                      <span style={{ color: 'var(--text-faint)' }}>{fmtSlotDay(n.slot_start)} {fmtSlotTime(n.slot_start)} TCT &mdash; </span>
                      {n.note}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </CollapsibleCard>
  )
}
