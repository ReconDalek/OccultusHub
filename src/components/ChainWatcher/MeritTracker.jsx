import { useCallback, useEffect, useState } from 'react'
import { useSession } from '../../hooks/useSession'
import { apiGet, apiSend, card, sectionTitle, sectionSub } from './chainWatcherUtils'

const REFRESH_MS = 60000
const ACCENT = '#8b5cf6'

function fmtPct(n) {
  return `${Math.round(n * 100)}%`
}

export default function MeritTracker({ factionId }) {
  const { user } = useSession()
  const isLeader = !!(user?.isLeader || user?.isAdmin || user?.isOwner)

  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [activeType, setActiveType] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    try {
      const json = await apiGet(`/api/chain-watcher/merits?faction_id=${factionId}`)
      setData(json)
      setError(null)
      setActiveType((prev) => (prev && json.meritTypes.includes(prev) ? prev : json.meritTypes[0]))
    } catch (e) {
      setError(e.message)
    }
  }, [factionId])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  const award = useCallback(async (tornUserId) => {
    if (!activeType) return
    setBusyId(tornUserId)
    try {
      await apiSend('/api/chain-watcher/merits/award', 'POST', { torn_user_id: tornUserId, merit_type: activeType })
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }, [activeType, load])

  if (error) {
    return (
      <div style={card}>
        <p style={sectionTitle}>Merit Tracker</p>
        <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={card}>
        <p style={sectionTitle}>Merit Tracker</p>
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Loading…</p>
      </div>
    )
  }

  const candidates = data.candidates[activeType] || []
  const awardedCount = data.awardedCounts?.[activeType] || 0

  return (
    <div style={card}>
      <p style={sectionTitle}>Merit Tracker</p>
      <p style={sectionSub}>
        Ranked by total hits, weighted by rank and how consistently they've pulled 50+ hits over the last 12 months.
        Members who already have a merit are left off its list.
      </p>

      <div className="flex" style={{ gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {data.meritTypes.map((type) => (
          <button
            key={type}
            onClick={() => setActiveType(type)}
            style={{
              fontSize: 12, padding: '6px 12px', borderRadius: 8,
              background: type === activeType ? ACCENT : 'rgba(255,255,255,0.04)',
              color: type === activeType ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)', cursor: 'pointer',
            }}
          >
            {type}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '0 0 10px' }}>
        {awardedCount} member{awardedCount === 1 ? '' : 's'} already have {activeType}.
      </p>

      {candidates.length === 0 ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No eligible members — everyone active has this merit.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {candidates.map((c, i) => (
            <div
              key={c.torn_user_id}
              className="flex items-center"
              style={{
                gap: 10, padding: '8px 10px', borderRadius: 8,
                background: i === 0 ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${i === 0 ? 'rgba(139,92,246,0.3)' : 'var(--border-subtle)'}`,
              }}
            >
              <div style={{ width: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                {i + 1}
              </div>
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.username}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {c.faction_position || '—'} · {c.total_hits.toLocaleString()} hits · {fmtPct(c.consistency)} consistency
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd', flexShrink: 0 }}>
                {Math.round(c.score).toLocaleString()}
              </div>
              {isLeader && (
                <button
                  onClick={() => award(c.torn_user_id)}
                  disabled={busyId === c.torn_user_id}
                  style={{
                    fontSize: 11.5, padding: '5px 10px', borderRadius: 6, background: ACCENT, color: '#fff',
                    border: 'none', cursor: 'pointer', fontWeight: 600, flexShrink: 0,
                    opacity: busyId === c.torn_user_id ? 0.6 : 1,
                  }}
                >
                  Award
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
