import { useCallback, useEffect, useState } from 'react'
import { useSession } from '../../hooks/useSession'
import { apiGet, apiSend, sectionSub, fmtLongDuration } from './chainWatcherUtils'
import CollapsibleCard from './CollapsibleCard'

const REFRESH_MS = 300000
// While a chain is actively being watched, bonus hits can now get awarded
// live (see chainWatcherController's checkBonusHitsLive) — refresh often
// enough that the ranked "who's next" list drops a freshly-awarded member
// before a leader calls on them again for the next threshold.
const ACTIVE_REFRESH_MS = 15000
const ACCENT = '#8b5cf6'

export default function MeritTracker({ factionId, sessionActive = false }) {
  const { user } = useSession()
  const isLeader = !!(user?.isLeader || user?.isAdmin || user?.isOwner)

  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [activeType, setActiveType] = useState(null)
  const [showFormula, setShowFormula] = useState(false)
  const [showAwarded, setShowAwarded] = useState(false)
  const [markingId, setMarkingId] = useState(null)
  const [revokingId, setRevokingId] = useState(null)

  const load = useCallback(async () => {
    try {
      const json = await apiGet(`/api/chain-watcher/merits?faction_id=${factionId}`)
      setData(json)
      setError(null)
      const allTypes = [...json.meritTypes, ...(json.simpleMeritTypes || [])]
      setActiveType((prev) => (prev && allTypes.includes(prev) ? prev : allTypes[0]))
    } catch (e) {
      setError(e.message)
    }
  }, [factionId])

  useEffect(() => {
    load()
    const t = setInterval(load, sessionActive ? ACTIVE_REFRESH_MS : REFRESH_MS)
    return () => clearInterval(t)
  }, [load, sessionActive])

  const markReceived = useCallback(async (tornUserId) => {
    setMarkingId(tornUserId)
    try {
      await apiSend('/api/chain-watcher/merits/award', 'POST', { torn_user_id: tornUserId, merit_type: activeType, faction_id: factionId })
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setMarkingId(null)
    }
  }, [activeType, factionId, load])

  const revokeMerit = useCallback(async (tornUserId) => {
    if (!window.confirm(`Revoke ${activeType} from this member?`)) return
    setRevokingId(tornUserId)
    try {
      await apiSend(`/api/chain-watcher/merits/award?torn_user_id=${tornUserId}&merit_type=${encodeURIComponent(activeType)}`, 'DELETE')
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setRevokingId(null)
    }
  }, [activeType, load])

  if (error) {
    return (
      <CollapsibleCard title="Merit Tracker">
        <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>
      </CollapsibleCard>
    )
  }

  if (!data) {
    return (
      <CollapsibleCard title="Merit Tracker">
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Loading…</p>
      </CollapsibleCard>
    )
  }

  const isSimple = data.simpleMeritTypes?.includes(activeType)
  const awardedCount = data.awardedCounts?.[activeType] || 0

  return (
    <CollapsibleCard title="Merit Tracker">
      {isSimple ? (
        <p style={sectionSub}>{data.simpleMeritNote}</p>
      ) : (
        <p style={sectionSub}>
          Earned by landing the {(data.thresholds?.[activeType] || []).join('th, ')}th hit in a chain.{' '}
          <button
            onClick={() => setShowFormula(s => !s)}
            style={{ background: 'none', border: 'none', color: '#8b5cf6', cursor: 'pointer', fontSize: 12, padding: 0, textDecoration: 'underline' }}
          >
            {showFormula ? 'Hide' : 'Show'} formula
          </button>
        </p>
      )}

      {!isSimple && showFormula && (
        <pre style={{
          fontSize: 12, fontFamily: 'inherit', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 10px', marginBottom: 10,
          whiteSpace: 'pre-wrap', margin: '0 0 10px',
        }}>
          {data.formula}
        </pre>
      )}

      <div className="flex" style={{ gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[...data.meritTypes, ...(data.simpleMeritTypes || [])].map((type) => (
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
        <button
          onClick={() => setShowAwarded(s => !s)}
          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}
        >
          {awardedCount} member{awardedCount === 1 ? '' : 's'} already have {activeType}
        </button>.
        {!isSimple && data.prerequisites?.[activeType]?.length > 0 && ` Requires ${data.prerequisites[activeType].join(' + ')}.`}
      </p>

      {showAwarded && (
        <AwardedMeritList
          members={data.awardedMembers?.[activeType] || []}
          isLeader={isLeader}
          revokingId={revokingId}
          onRevoke={revokeMerit}
        />
      )}

      {isSimple ? (
        <SimpleMeritList
          members={data.simpleCandidates?.[activeType] || []}
          isLeader={isLeader}
          markingId={markingId}
          onMark={markReceived}
        />
      ) : (
        <RankedMeritList
          candidates={data.candidates[activeType] || []}
          isLeader={isLeader}
          markingId={markingId}
          onMark={markReceived}
        />
      )}
    </CollapsibleCard>
  )
}

function RankedMeritList({ candidates, isLeader, markingId, onMark }) {
  if (candidates.length === 0) {
    return <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No eligible members.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {candidates.map((c, i) => (
        <div
          key={c.torn_user_id}
          className="flex items-center"
          style={{
            gap: 10, padding: '8px 10px', borderRadius: 8,
            background: c.receivedThisChain ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${c.receivedThisChain ? 'rgba(34,197,94,0.35)' : 'var(--border-subtle)'}`,
          }}
        >
          <div style={{ width: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
            {i + 1}
          </div>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.username}
              {c.receivedThisChain && (
                <span style={{
                  marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#86efac', background: 'rgba(34,197,94,0.15)',
                  borderRadius: 4, padding: '1px 6px', letterSpacing: '0.04em', textTransform: 'uppercase', verticalAlign: 'middle',
                }}>
                  Received
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {c.rank} · {c.recent_hits.toLocaleString()} hits (12mo) ·{' '}
              <span title="Hits vs. faction average + energy/presence bonus">
                {c.activity_factor.toFixed(2)}x activity
              </span>
              {c.penalty_multiplier < 1 && (
                <span style={{ color: '#f87171' }} title={`${c.warning_count} warning(s), ${c.oc_inactive_days} OC-inactive day(s) in the window`}>
                  {' '}· -{Math.round((1 - c.penalty_multiplier) * 100)}%
                </span>
              )}
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd', flexShrink: 0 }}>
            {Math.round(c.score).toLocaleString()}
          </div>
          {isLeader && !c.receivedThisChain && (
            <button
              onClick={() => onMark(c.torn_user_id)}
              disabled={markingId === c.torn_user_id}
              title="Mark as having received this on the chain currently being watched — a fallback for when live detection misses it"
              style={{
                fontSize: 11, padding: '5px 10px', borderRadius: 6, background: 'rgba(34,197,94,0.1)',
                color: '#86efac', border: '1px solid rgba(34,197,94,0.3)', cursor: 'pointer', flexShrink: 0,
                opacity: markingId === c.torn_user_id ? 0.6 : 1,
              }}
            >
              Mark
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function AwardedMeritList({ members, isLeader, revokingId, onRevoke }) {
  if (members.length === 0) {
    return <p style={{ color: 'var(--text-faint)', fontSize: 13, marginBottom: 12 }}>Nobody has this yet.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
      {members.map((m) => (
        <div
          key={m.torn_user_id}
          className="flex items-center"
          style={{ gap: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}
        >
          <div style={{ flex: '1 1 auto', minWidth: 0, fontSize: 13, fontWeight: 600, color: '#f4f4f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {m.username}
          </div>
          {isLeader && (
            <button
              onClick={() => onRevoke(m.torn_user_id)}
              disabled={revokingId === m.torn_user_id}
              style={{
                fontSize: 11, padding: '5px 10px', borderRadius: 6, background: 'rgba(248,113,113,0.1)',
                color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', cursor: 'pointer', flexShrink: 0,
                opacity: revokingId === m.torn_user_id ? 0.6 : 1,
              }}
            >
              Revoke
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function SimpleMeritList({ members, isLeader, markingId, onMark }) {
  if (members.length === 0) {
    return <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No eligible members.</p>
  }
  const now = Date.now() / 1000
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {members.map((m) => (
        <div
          key={m.torn_user_id}
          className="flex items-center"
          style={{ gap: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}
        >
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.username}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {m.last_seen_at ? `last seen ${fmtLongDuration(now - m.last_seen_at)} ago` : 'last seen —'}
            </div>
          </div>
          {isLeader && (
            <button
              onClick={() => onMark(m.torn_user_id)}
              disabled={markingId === m.torn_user_id}
              style={{
                fontSize: 11.5, padding: '5px 10px', borderRadius: 6, background: ACCENT, color: '#fff',
                border: 'none', cursor: 'pointer', fontWeight: 600, flexShrink: 0,
                opacity: markingId === m.torn_user_id ? 0.6 : 1,
              }}
            >
              Mark
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
