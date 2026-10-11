import { useCallback, useEffect, useState } from 'react'
import { useSession } from '../../hooks/useSession'
import { apiGet, card, sectionTitle, sectionSub } from './chainWatcherUtils'

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
  const [showFormula, setShowFormula] = useState(false)

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
  const thresholds = data.thresholds?.[activeType] || []

  return (
    <div style={card}>
      <p style={sectionTitle}>Merit Tracker</p>
      <p style={sectionSub}>
        Tracked automatically from bonus hits during a chain — landing the {thresholds.join('th, ')}th hit earns it.
        Already-received members drop off that merit's list.{' '}
        <button
          onClick={() => setShowFormula(s => !s)}
          style={{ background: 'none', border: 'none', color: '#8b5cf6', cursor: 'pointer', fontSize: 12, padding: 0, textDecoration: 'underline' }}
        >
          {showFormula ? 'Hide' : 'Show'} how ranking works
        </button>
      </p>

      {showFormula && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
          {data.formula}
        </p>
      )}

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
                  {c.rank} · {c.recent_hits.toLocaleString()} hits (12mo) · {fmtPct(c.consistency)} consistency
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd', flexShrink: 0 }}>
                {Math.round(c.score).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {isLeader && awardedCount > 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 10 }}>
          Need to correct a wrongly-attributed {activeType}? Let me know who and I'll remove it.
        </p>
      )}
    </div>
  )
}
