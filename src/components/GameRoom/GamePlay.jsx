import { useState, useEffect, useRef, useCallback } from 'react'
import { API_BASE_URL } from '../../config/api'

const ROLE_META = {
  congregation: { icon: '◌', color: '#a1a1aa', label: 'Congregation' },
  cabal:        { icon: '◈', color: '#b3123f', label: 'Cabal Agent' },
  inquisitor:   { icon: '◉', color: '#9f67ff', label: 'Inquisitor' },
  warden:       { icon: '◎', color: '#22c55e', label: 'Warden' },
  apostate:     { icon: '✦', color: '#f59e0b', label: 'The Apostate' },
  deceiver:     { icon: '◬', color: '#e879f9', label: 'Deceiver' },
  acolyte:      { icon: '✧', color: '#38bdf8', label: 'Acolyte' },
}

const CABAL_FACTION = ['cabal', 'deceiver']

const DAY_SECS        = 150
const NIGHT_SECS      = 90
const VOTE_WINDOW_SECS = 30  // last 30s of day — voting only, chat locked
const ACT_WINDOW_SECS  = 30  // last 30s of night — urgency indicator

const ANIM_CSS = `
@keyframes nightFall {
  0%   { opacity: 0; }
  30%  { opacity: 0.7; }
  100% { opacity: 0.55; }
}
@keyframes dawnBreak {
  0%   { opacity: 0.55; }
  20%  { opacity: 0.8; background: rgba(251,113,133,0.35); }
  60%  { opacity: 0.3; background: rgba(251,191,36,0.15); }
  100% { opacity: 0.12; }
}
@keyframes sacrificePulse {
  0%   { opacity: 0; }
  15%  { opacity: 0.7; }
  40%  { opacity: 0.5; }
  70%  { opacity: 0.2; }
  100% { opacity: 0; }
}
@keyframes ambientNight {
  0%, 100% { opacity: 0.35; }
  50%      { opacity: 0.5; }
}
@keyframes moonGlow {
  0%, 100% { box-shadow: 0 0 5px 1px rgba(160,20,20,0.5); }
  50%      { box-shadow: 0 0 12px 3px rgba(200,30,30,0.75); }
}
@keyframes sunGlow {
  0%, 100% { box-shadow: 0 0 5px 1px rgba(234,179,8,0.4); }
  50%      { box-shadow: 0 0 10px 2px rgba(234,179,8,0.65); }
}
@keyframes torchFlicker {
  0%, 100% { opacity: 0.85; transform: scaleY(1)   scaleX(1); }
  20%      { opacity: 1;    transform: scaleY(1.12) scaleX(0.88); }
  40%      { opacity: 0.78; transform: scaleY(0.94) scaleX(1.06); }
  60%      { opacity: 0.92; transform: scaleY(1.08) scaleX(0.93); }
  80%      { opacity: 0.72; transform: scaleY(0.97) scaleX(1.03); }
}
@keyframes moonBeam {
  0%, 100% { opacity: 0.06; }
  50%      { opacity: 0.11; }
}
@keyframes ropeWay {
  0%, 100% { transform: rotate(-1.5deg); }
  50%      { transform: rotate(1.5deg); }
}
`

function injectAnimCSS() {
  if (!document.getElementById('rite-anim-css')) {
    const s = document.createElement('style')
    s.id = 'rite-anim-css'
    s.textContent = ANIM_CSS
    document.head.appendChild(s)
  }
}

function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024)
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return width
}

export default function GamePlay({ gameState, roomCode, displayName, guestToken, authHeaders, onLeave, onShowRulebook }) {
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [actionTarget, setActionTarget] = useState(null)
  const [voteTarget, setVoteTarget] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [showRoleModal, setShowRoleModal] = useState(true)
  const [inquisitorMsgs, setInquisitorMsgs] = useState([])
  const [mobileTab, setMobileTab] = useState('chat')
  const [wardenMode, setWardenMode] = useState('guard') // 'shoot' | 'guard'
  const [timeLeft, setTimeLeft] = useState(null)

  const [effect, setEffect] = useState(null)
  const prevPhaseRef = useRef(null)
  const prevStatusRef = useRef(null)
  const chatEndRef = useRef(null)
  const windowWidth = useWindowWidth()
  const isMobile = windowWidth < 640

  useEffect(() => { injectAnimCSS() }, [])

  const room     = gameState?.room
  const players  = gameState?.players || []
  const messages = gameState?.messages || []
  const myPlayer = gameState?.my_player
  const voteCounts      = gameState?.vote_counts || []
  const cabalVoteCounts = gameState?.cabal_vote_counts || []
  const myAction = gameState?.my_action
  const myVote   = gameState?.my_vote
  const isNight  = room?.status === 'night'
  const isDay    = room?.status === 'day'
  const myRole   = myPlayer?.role
  const isAlive  = myPlayer?.is_alive

  const isDay1         = isDay && room?.phase === 1
  const isVotingWindow = isDay && !isDay1 && timeLeft !== null && timeLeft <= VOTE_WINDOW_SECS
  const isDiscussion   = isDay && !isVotingWindow
  const isActWindow    = isNight && timeLeft !== null && timeLeft <= ACT_WINDOW_SECS

  // Role ability states from server
  const bulletSpent        = myPlayer?.bullet_spent
  const canInvestigateNow  = myPlayer?.can_investigate_now // null when not night
  const anointSpent        = myPlayer?.anoint_spent

  const roleMeta = ROLE_META[myRole] || ROLE_META.congregation

  // Whether this player has an actionable night ability right now
  const hasNightAction = isNight && isAlive && (
    myRole === 'cabal' ||
    myRole === 'deceiver' ||
    (myRole === 'inquisitor' && canInvestigateNow === true) ||
    (myRole === 'warden' && !bulletSpent) ||
    (myRole === 'acolyte' && !anointSpent)
  )

  const hasPendingAction = isAlive && (
    (isVotingWindow && !myVote) ||
    (isNight && hasNightAction && !myAction)
  )

  // ── Phase timer countdown ──────────────────────────────────────────
  // Initialise from server's computed secs_remaining to avoid client/server clock skew,
  // then tick down locally every second.
  useEffect(() => {
    if (!room?.phase_ends_at) { setTimeLeft(null); return }
    // Use the server-supplied value as the authoritative starting point
    const serverSecs = room?.phase_secs_remaining
    if (serverSecs !== null && serverSecs !== undefined) {
      setTimeLeft(serverSecs)
    }
    const iv = setInterval(() => {
      setTimeLeft(prev => (prev !== null && prev > 0) ? prev - 1 : 0)
    }, 1000)
    return () => clearInterval(iv)
  }, [room?.phase_ends_at])

  // ── Phase transition effects ───────────────────────────────────────
  useEffect(() => {
    if (!room) return
    const prevStatus = prevStatusRef.current
    if (prevStatus !== null && prevStatus !== room.status) {
      if (room.status === 'night') {
        setEffect('nightFall')
        setTimeout(() => setEffect('ambientNight'), 1800)
      } else if (room.status === 'day') {
        const prevNightPhase = room.phase - 1
        const sacrificed = messages.some(
          m => m.display_name === 'The Oracle' && m.phase === prevNightPhase && m.message.includes('sacrificed in the night')
        )
        if (sacrificed) {
          setEffect('sacrificePulse')
          setTimeout(() => setEffect('dawnBreak'), 1400)
          setTimeout(() => setEffect(null), 4000)
        } else {
          setEffect('dawnBreak')
          setTimeout(() => setEffect(null), 3500)
        }
      }
    }
    prevStatusRef.current = room.status
    prevPhaseRef.current = room.phase
  }, [room?.status, room?.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (room?.phase && room.phase > 1) setShowRoleModal(false)
  }, [room?.phase])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    if (isMobile && messages.length > 0) setMobileTab('chat')
  }, [messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (myRole !== 'inquisitor') return
    const fetchInq = async () => {
      const params = guestToken ? `?guest_token=${guestToken}` : ''
      const token = localStorage.getItem('occultusSession')
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = token
      try {
        const res = await fetch(`${API_BASE_URL}/api/game/rooms/${roomCode}/inquisitor-messages${params}`, { headers })
        if (res.ok) {
          const data = await res.json()
          setInquisitorMsgs(data.messages || [])
        }
      } catch (_) {}
    }
    fetchInq()
  }, [myRole, room?.phase, roomCode, guestToken])

  const sendChat = useCallback(async () => {
    const msg = chatInput.trim()
    if (!msg || sending) return
    setSending(true)
    try {
      const channel = isNight && isCabalFaction ? 'cabal' : 'public'
      const body = { message: msg, channel, ...(guestToken ? { guest_token: guestToken } : {}) }
      const res = await fetch(`${API_BASE_URL}/api/game/rooms/${roomCode}/message`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
      })
      if (res.ok) setChatInput('')
    } catch (_) {}
    setSending(false)
  }, [chatInput, sending, isNight, myRole, guestToken, roomCode, authHeaders])

  const submitVote = useCallback(async () => {
    if (!voteTarget || submitting) return
    setSubmitting(true)
    try {
      const body = { target_player_id: voteTarget, ...(guestToken ? { guest_token: guestToken } : {}) }
      await fetch(`${API_BASE_URL}/api/game/rooms/${roomCode}/vote`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
      })
    } catch (_) {}
    setSubmitting(false)
  }, [voteTarget, submitting, guestToken, roomCode, authHeaders])

  const submitAction = useCallback(async (overrideType) => {
    const isGuard = (overrideType || myRole === 'warden') && (overrideType === 'guard' || (myRole === 'warden' && wardenMode === 'guard'))
    if (!isGuard && !actionTarget) return
    if (submitting) return
    setSubmitting(true)
    try {
      let action_type
      if (myRole === 'cabal')           action_type = 'kill'
      else if (myRole === 'deceiver')   action_type = 'deceive'
      else if (myRole === 'inquisitor') action_type = 'investigate'
      else if (myRole === 'acolyte')    action_type = 'anoint'
      else if (myRole === 'warden')     action_type = isGuard ? 'guard' : 'shoot'

      const body = {
        action_type,
        ...(isGuard ? {} : { target_player_id: actionTarget }),
        ...(guestToken ? { guest_token: guestToken } : {}),
      }
      await fetch(`${API_BASE_URL}/api/game/rooms/${roomCode}/action`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
      })
    } catch (_) {}
    setSubmitting(false)
  }, [actionTarget, submitting, myRole, wardenMode, guestToken, roomCode, authHeaders])

  const voteCountMap = {}
  voteCounts.forEach(v => { voteCountMap[v.target_player_id] = v.cnt })

  const cabalVoteMap = {}
  cabalVoteCounts.forEach(v => { cabalVoteMap[v.target_player_id] = v.cnt })
  const totalCabalVotes = cabalVoteCounts.reduce((s, v) => s + v.cnt, 0)

  const publicMessages = messages.filter(m => m.channel === 'public')
  const cabalMessages  = messages.filter(m => m.channel === 'cabal')
  const isCabalFaction = CABAL_FACTION.includes(myRole)
  const currentPhase   = room?.phase ?? 0
  // Show current-phase messages + Oracle messages from the previous phase
  // (so banishment/sacrifice announcements aren't instantly cleared on transition)
  const displayMessages = (isNight && isCabalFaction ? cabalMessages : publicMessages)
    .filter(m =>
      m.phase === currentPhase ||
      (m.phase === currentPhase - 1 && m.display_name === 'The Oracle')
    )

  const maxSecs  = isNight ? NIGHT_SECS : (isDay1 ? 120 : DAY_SECS)
  const timerPct = timeLeft !== null ? Math.max(0, (timeLeft / maxSecs) * 100) : null

  // Player list: can the caller select this player?
  // Guard mode: no target selection; others: can't self-target
  const needsTargetSelection = isNight && (myRole !== 'warden' || wardenMode === 'shoot')
  const getCanSelect = (p) => {
    if (!p.is_alive || !isAlive) return false
    if (p.is_me) return false
    if (isDay) return isVotingWindow && !myVote
    return isNight && hasNightAction && !myAction && needsTargetSelection
  }

  // ─── CirclePanel ─────────────────────────────────────────────────
  const circlePanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: isMobile ? '14px' : '14px 12px', overflowY: 'auto', flex: isMobile ? 1 : undefined }}>

      {/* Phase directive banner */}
      <div style={{
        padding: '10px 12px',
        background: isNight
          ? (isActWindow ? 'rgba(179,18,63,0.12)' : 'rgba(109,40,217,0.08)')
          : isVotingWindow ? 'rgba(234,179,8,0.14)' : isDay1 ? 'rgba(234,179,8,0.06)' : 'rgba(234,179,8,0.08)',
        border: `1px solid ${isNight
          ? (isActWindow ? 'rgba(179,18,63,0.35)' : 'rgba(109,40,217,0.22)')
          : isVotingWindow ? 'rgba(234,179,8,0.45)' : 'rgba(234,179,8,0.22)'}`,
        borderRadius: 8,
        transition: 'background 0.5s, border-color 0.5s',
      }}>
        <p style={{ fontSize: 10, color: isNight ? (isActWindow ? '#fb7185' : '#a78bfa') : '#eab308', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
          {isNight
            ? (isActWindow ? '⚠ Last chance — act now' : '🌑 The Witching Hour')
            : isVotingWindow ? `⚖ Voting — ${timeLeft}s remaining`
            : isDay1 ? '☀️ Day 1 — Introduction'
            : `☀️ Day ${Math.ceil(room.phase / 2)} — Discussion`}
        </p>
        <p style={{ fontSize: 12, color: '#a1a1aa', lineHeight: 1.55 }}>
          {isNight
            ? (hasNightAction
                ? (isActWindow ? 'Dawn approaches — submit your action now or it will be lost.' : 'Use your ability before dawn. Others sleep.')
                : 'The circle sleeps. You watch the darkness pass.')
            : isVotingWindow
            ? 'Chat is locked. Select a player and cast your banishment vote.'
            : isDay1
            ? 'Today is a day of introduction — no banishment. Speak, suspect, and prepare.'
            : 'Discuss and identify the Cabal. Voting opens in the final 30 seconds.'}
        </p>
      </div>

      {/* Role badge */}
      <div style={{ padding: '10px 12px', background: `${roleMeta.color}15`, border: `1px solid ${roleMeta.color}35`, borderRadius: 8 }}>
        <p style={{ fontSize: 10, color: roleMeta.color, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Your Role</p>
        <p style={{ fontSize: 13, fontWeight: 600, color: roleMeta.color }}>{roleMeta.icon} {roleMeta.label}</p>
        {!isAlive && <p style={{ fontSize: 11, color: '#71717a', marginTop: 4 }}>Sacrificed — spectating</p>}
      </div>

      {/* Cabal vote summary (only Cabal members see this at night) */}
      {isNight && myRole === 'cabal' && (
        <div style={{ padding: '8px 12px', background: 'rgba(179,18,63,0.08)', border: '1px solid rgba(179,18,63,0.22)', borderRadius: 8 }}>
          <p style={{ fontSize: 10, color: '#b3123f', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
            Cabal Vote · {totalCabalVotes} submitted
          </p>
          {totalCabalVotes === 0 ? (
            <p style={{ fontSize: 11, color: '#71717a' }}>No votes cast yet</p>
          ) : (
            cabalVoteCounts.map(v => {
              const p = players.find(pl => pl.id === v.target_player_id)
              return (
                <div key={v.target_player_id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#f87171', fontWeight: 600, minWidth: 14 }}>{v.cnt}◈</span>
                  <span style={{ fontSize: 12, color: '#fca5a5' }}>{p?.display_name || '?'}</span>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Player list */}
      <div>
        <p style={{ fontSize: 10, color: '#71717a', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
          The Circle · {players.filter(p => p.is_alive).length} alive
        </p>
        {players.map(p => {
          const pRole = p.role ? ROLE_META[p.role] : null
          const voteCount = voteCountMap[p.id] || 0
          const cabalVoteCount = cabalVoteMap[p.id] || 0
          const isSelected = isDay ? voteTarget === p.id : actionTarget === p.id
          const canSelect = getCanSelect(p)
          return (
            <div
              key={p.id}
              onClick={() => {
                if (!canSelect) return
                if (isDay) setVoteTarget(p.id === voteTarget ? null : p.id)
                if (isNight) setActionTarget(p.id === actionTarget ? null : p.id)
              }}
              style={{
                padding: isMobile ? '10px 12px' : '7px 10px',
                borderRadius: 6, marginBottom: 3,
                cursor: canSelect ? 'pointer' : 'default',
                background: isSelected ? 'rgba(109,40,217,0.22)' : 'transparent',
                border: isSelected ? '1px solid rgba(109,40,217,0.45)' : '1px solid transparent',
                opacity: p.is_alive ? 1 : 0.38,
                display: 'flex', alignItems: 'center', gap: 8,
                transition: 'background 0.15s, border-color 0.15s',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ fontSize: 13, color: pRole?.color || '#52525b', flexShrink: 0 }}>
                {p.is_alive ? (pRole?.icon || '◌') : '✕'}
              </span>
              <span style={{ fontSize: isMobile ? 14 : 12, flex: 1, color: p.is_me ? '#c084fc' : p.is_alive ? '#f4f4f5' : '#52525b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.display_name}{p.is_me ? ' (you)' : ''}
              </span>
              {voteCount > 0 && isDay && (
                <span title={`${voteCount} vote${voteCount !== 1 ? 's' : ''} to banish`} style={{ fontSize: 11, color: '#fb923c', fontWeight: 700, flexShrink: 0 }}>{voteCount} ⚖</span>
              )}
              {cabalVoteCount > 0 && isNight && myRole === 'cabal' && (
                <span style={{ fontSize: 11, color: '#f87171', fontWeight: 700, flexShrink: 0 }}>{cabalVoteCount}◈</span>
              )}
              {p.role && !p.is_alive && (
                <span style={{ fontSize: 10, color: pRole?.color, flexShrink: 0 }}>{pRole?.icon}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Action panels ── */}

      {/* Day vote — only during voting window */}
      {isAlive && isVotingWindow && !myVote && (
        <ActionPanel color="#eab308" title="Cast Your Judgment">
          <p style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 10 }}>
            {voteTarget ? `Banish: ${players.find(p => p.id === voteTarget)?.display_name}` : 'Select a player above'}
          </p>
          <button onClick={submitVote} disabled={!voteTarget || submitting}
            style={{ ...compactBtn('#eab308'), opacity: voteTarget ? 1 : 0.4 }}>
            ⚖ Banish
          </button>
        </ActionPanel>
      )}
      {isAlive && isVotingWindow && myVote && <DonePanel color="#4ade80" text="Vote cast" sub="Awaiting others..." />}

      {/* Cabal kill */}
      {isAlive && isNight && myRole === 'cabal' && !myAction && (
        <ActionPanel color="#b3123f" title="Choose a Sacrifice">
          <p style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 10 }}>
            {actionTarget ? `Target: ${players.find(p => p.id === actionTarget)?.display_name}` : 'Select a player above'}
          </p>
          <button onClick={() => submitAction()} disabled={!actionTarget || submitting}
            style={{ ...compactBtn('#b3123f'), opacity: actionTarget ? 1 : 0.4 }}>
            ◈ Sacrifice
          </button>
        </ActionPanel>
      )}

      {/* Inquisitor investigate */}
      {isAlive && isNight && myRole === 'inquisitor' && canInvestigateNow && !myAction && (
        <ActionPanel color="#9f67ff" title="Investigate">
          <p style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 10 }}>
            {actionTarget ? `Investigate: ${players.find(p => p.id === actionTarget)?.display_name}` : 'Select a player above'}
          </p>
          <button onClick={() => submitAction()} disabled={!actionTarget || submitting}
            style={{ ...compactBtn('#9f67ff'), opacity: actionTarget ? 1 : 0.4 }}>
            ◉ Reveal
          </button>
        </ActionPanel>
      )}
      {isAlive && isNight && myRole === 'inquisitor' && canInvestigateNow === false && (
        <div style={{ padding: '10px 12px', background: 'rgba(109,40,217,0.05)', border: '1px solid rgba(109,40,217,0.18)', borderRadius: 8 }}>
          <p style={{ fontSize: 12, color: '#71717a' }}>◉ Your sight rests this night.</p>
          <p style={{ fontSize: 11, color: '#52525b', marginTop: 4 }}>You may investigate next night.</p>
        </div>
      )}

      {/* Warden actions */}
      {isAlive && isNight && myRole === 'warden' && !bulletSpent && !myAction && (
        <ActionPanel color="#22c55e" title="The Warden's Stand — 1 bullet">
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button
              onClick={() => { setWardenMode('guard'); setActionTarget(null) }}
              style={{
                flex: 1, padding: '7px 8px', fontSize: 12, fontWeight: 600,
                borderRadius: 6,
                border: `1px solid ${wardenMode === 'guard' ? '#22c55e' : 'rgba(34,197,94,0.25)'}`,
                background: wardenMode === 'guard' ? 'rgba(34,197,94,0.18)' : 'transparent',
                color: wardenMode === 'guard' ? '#4ade80' : '#71717a',
                cursor: 'pointer',
              }}>
              🛡 Guard Self
            </button>
            <button
              onClick={() => setWardenMode('shoot')}
              style={{
                flex: 1, padding: '7px 8px', fontSize: 12, fontWeight: 600,
                borderRadius: 6,
                border: `1px solid ${wardenMode === 'shoot' ? '#f97316' : 'rgba(249,115,22,0.25)'}`,
                background: wardenMode === 'shoot' ? 'rgba(249,115,22,0.18)' : 'transparent',
                color: wardenMode === 'shoot' ? '#fb923c' : '#71717a',
                cursor: 'pointer',
              }}>
              🔫 Shoot
            </button>
          </div>

          {wardenMode === 'guard' ? (
            <>
              <p style={{ fontSize: 11, color: '#71717a', lineHeight: 1.55, marginBottom: 10 }}>
                Stand your ground. If the Cabal targets you tonight, your bullet fires back — one attacker falls.
              </p>
              <button onClick={() => submitAction('guard')} disabled={submitting}
                style={{ ...compactBtn('#22c55e') }}>
                🛡 Guard Myself
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 11, color: '#71717a', lineHeight: 1.55, marginBottom: 8 }}>
                Fire now. Your target always dies — but if they are innocent, the congregation loses one of their own.
              </p>
              <p style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 10 }}>
                {actionTarget ? `Target: ${players.find(p => p.id === actionTarget)?.display_name}` : 'Select a player above'}
              </p>
              <button onClick={() => submitAction()} disabled={!actionTarget || submitting}
                style={{ ...compactBtn('#f97316'), opacity: actionTarget ? 1 : 0.4 }}>
                🔫 Shoot
              </button>
            </>
          )}
        </ActionPanel>
      )}
      {isAlive && isNight && myRole === 'warden' && bulletSpent && (
        <div style={{ padding: '10px 12px', background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 8 }}>
          <p style={{ fontSize: 12, color: '#52525b' }}>◎ Your bullet has been spent.</p>
          <p style={{ fontSize: 11, color: '#3f3f46', marginTop: 4 }}>You observe the night.</p>
        </div>
      )}

      {/* Deceiver corrupt */}
      {isAlive && isNight && myRole === 'deceiver' && !myAction && (
        <ActionPanel color="#e879f9" title="Corrupt an Investigation">
          <p style={{ fontSize: 11, color: '#71717a', lineHeight: 1.55, marginBottom: 8 }}>
            Choose a target. If the Inquisitor investigates them tonight, the result will be inverted.
          </p>
          <p style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 10 }}>
            {actionTarget ? `Target: ${players.find(p => p.id === actionTarget)?.display_name}` : 'Select a player above'}
          </p>
          <button onClick={() => submitAction()} disabled={!actionTarget || submitting}
            style={{ ...compactBtn('#e879f9'), opacity: actionTarget ? 1 : 0.4 }}>
            ◬ Corrupt
          </button>
        </ActionPanel>
      )}

      {/* Acolyte anoint */}
      {isAlive && isNight && myRole === 'acolyte' && !anointSpent && !myAction && (
        <ActionPanel color="#38bdf8" title="Bestow Your Blessing — 1 use">
          <p style={{ fontSize: 11, color: '#71717a', lineHeight: 1.55, marginBottom: 8 }}>
            Anoint a player. If the Cabal targets them tonight, the sacrifice is turned away. Your blessing is spent on use.
          </p>
          <p style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 10 }}>
            {actionTarget ? `Anoint: ${players.find(p => p.id === actionTarget)?.display_name}` : 'Select a player above'}
          </p>
          <button onClick={() => submitAction()} disabled={!actionTarget || submitting}
            style={{ ...compactBtn('#38bdf8'), opacity: actionTarget ? 1 : 0.4 }}>
            ✧ Anoint
          </button>
        </ActionPanel>
      )}
      {isAlive && isNight && myRole === 'acolyte' && anointSpent && (
        <div style={{ padding: '10px 12px', background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.15)', borderRadius: 8 }}>
          <p style={{ fontSize: 12, color: '#52525b' }}>✧ Your blessing has been bestowed.</p>
          <p style={{ fontSize: 11, color: '#3f3f46', marginTop: 4 }}>You observe the night.</p>
        </div>
      )}

      {/* Submitted */}
      {isAlive && isNight && hasNightAction && myAction && <DonePanel color="#4ade80" text="Action submitted" sub="Awaiting dawn..." />}

      {/* No night action (congregation, apostate, or spent) */}
      {isNight && isAlive && !hasNightAction && (myRole === 'congregation' || myRole === 'apostate') && (
        <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ fontSize: 12, color: '#52525b', lineHeight: 1.5 }}>You sleep through the Witching Hour.</p>
        </div>
      )}

      {/* Inquisitor vision log */}
      {myRole === 'inquisitor' && inquisitorMsgs.length > 0 && (
        <div style={{ padding: '10px 12px', background: 'rgba(109,40,217,0.07)', border: '1px solid rgba(109,40,217,0.2)', borderRadius: 8 }}>
          <p style={{ fontSize: 10, color: '#9f67ff', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Vision Log</p>
          {inquisitorMsgs.map((m, i) => (
            <p key={i} style={{ fontSize: 11, color: '#c084fc', marginBottom: 5, lineHeight: 1.55 }}>
              <span style={{ color: '#52525b' }}>Phase {m.phase}: </span>{m.message}
            </p>
          ))}
        </div>
      )}
    </div>
  )

  // ─── ChatPanel ───────────────────────────────────────────────────
  const chatPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>
      <div style={{
        padding: '7px 16px', flexShrink: 0,
        borderBottom: `1px solid ${isNight && isCabalFaction ? 'rgba(179,18,63,0.22)' : isNight ? 'rgba(109,40,217,0.18)' : 'rgba(255,255,255,0.07)'}`,
        background: isNight && isCabalFaction ? 'rgba(179,18,63,0.1)' : 'transparent',
        fontSize: 11, letterSpacing: 2,
        color: isNight && isCabalFaction ? '#fb7185' : '#52525b',
        transition: 'all 1.5s ease',
      }}>
        {isNight && isCabalFaction ? '◈ CABAL CHANNEL — private' : isNight ? '— silence until dawn —' : '◌ PUBLIC CHAT'}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, background: isNight ? 'rgba(2,0,8,0.5)' : 'rgba(4,3,8,0.42)' }}>
        {displayMessages.map(m => (
          <ChatMessage key={m.id} msg={m} isOracle={m.display_name === 'The Oracle'} isNight={isNight} />
        ))}
        <div ref={chatEndRef} />
      </div>
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${isNight ? 'rgba(109,40,217,0.2)' : 'rgba(255,255,255,0.07)'}`, flexShrink: 0, transition: 'border-color 2s ease' }}>
        {(!isNight || isCabalFaction) && isAlive && !isVotingWindow && !isActWindow ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
              placeholder={isNight ? 'Speak to your Cabal...' : 'Speak to the circle...'}
              maxLength={500}
              style={{
                flex: 1, padding: '10px 12px',
                background: isNight ? 'rgba(30,0,40,0.6)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${isNight ? 'rgba(109,40,217,0.3)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 8, color: '#f4f4f5', fontSize: 14, outline: 'none',
                transition: 'background 2s ease, border-color 2s ease',
                minWidth: 0,
              }}
            />
            <button
              onClick={sendChat}
              disabled={sending || !chatInput.trim()}
              style={{ flexShrink: 0, padding: '0 16px', background: 'linear-gradient(135deg, #b3123f, #6d28d9)', border: 'none', borderRadius: 8, color: '#f4f4f5', fontSize: 18, cursor: chatInput.trim() ? 'pointer' : 'default', opacity: chatInput.trim() ? 1 : 0.4 }}
            >
              ↑
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', fontSize: 12, padding: '6px 0',
            color: isVotingWindow ? '#eab308' : isActWindow ? '#fb7185' : '#52525b' }}>
            {!isAlive
              ? 'The sacrificed observe in silence'
              : isVotingWindow ? '⚖ Voting is open — cast your judgment'
              : isActWindow   ? '⚠ Submit your action — chat is sealed'
              : 'The Congregation sleeps — silence until dawn'}
          </div>
        )}
      </div>
    </div>
  )

  const effectStyle = getEffectStyle(effect, isNight)

  return (
    <div style={{ height: 'calc(100vh - 72px)', color: '#f4f4f5', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

      <PhaseBackground isNight={isNight} isCabalFaction={isCabalFaction} />

      {effectStyle && (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50, ...effectStyle }} />
      )}

      {/* Role reveal modal */}
      {showRoleModal && myRole && (
        <div style={modalOverlay} onClick={() => setShowRoleModal(false)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 11, color: '#71717a', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14 }}>Your Role</p>
            <div style={{ fontSize: 48, marginBottom: 10 }}>{roleMeta.icon}</div>
            <h2 className="font-cinzel" style={{ fontSize: isMobile ? 22 : 28, color: roleMeta.color, letterSpacing: 4, marginBottom: 10 }}>
              {roleMeta.label}
            </h2>
            <p style={{ fontSize: 13, color: '#a1a1aa', maxWidth: 280, margin: '0 auto 20px', lineHeight: 1.7 }}>
              {roleFlavorText[myRole]}
            </p>
            {isCabalFaction && (
              <div style={{ marginBottom: 18, padding: '10px 12px', background: 'rgba(179,18,63,0.1)', borderRadius: 8 }}>
                <p style={{ fontSize: 11, color: '#b3123f', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
                  {myRole === 'deceiver' ? 'Your Allies' : 'Your Cabal'}
                </p>
                {players.filter(p => CABAL_FACTION.includes(p.role) && !p.is_me).map(p => (
                  <div key={p.id} style={{ fontSize: 13, color: '#f87171' }}>
                    {p.display_name}
                    <span style={{ fontSize: 11, color: '#71717a', marginLeft: 6 }}>
                      ({ROLE_META[p.role]?.label})
                    </span>
                  </div>
                ))}
                {players.filter(p => CABAL_FACTION.includes(p.role) && !p.is_me).length === 0 && (
                  <div style={{ fontSize: 12, color: '#71717a' }}>You act alone</div>
                )}
              </div>
            )}
            <button onClick={() => setShowRoleModal(false)} style={{ width: '100%', padding: '13px', background: 'linear-gradient(135deg, #b3123f, #6d28d9)', border: 'none', borderRadius: 8, color: '#f4f4f5', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Enter the Rite
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{
        padding: isMobile ? '10px 14px' : '10px 18px',
        background: isNight ? 'rgba(3,3,8,0.95)' : 'rgba(5,5,10,0.88)',
        borderBottom: `1px solid ${isNight ? 'rgba(109,40,217,0.25)' : 'rgba(255,255,255,0.08)'}`,
        display: 'flex', alignItems: 'center', gap: 10,
        flexShrink: 0, position: 'relative', zIndex: 10,
        transition: 'background 1.5s ease, border-color 1.5s ease',
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span className="font-cinzel" style={{ fontSize: 12, letterSpacing: 3, color: isNight ? '#a78bfa' : '#f4f4f5', flexShrink: 0, transition: 'color 1.5s ease' }}>
            THE RITE
          </span>
          <span style={{
            fontSize: 11, flexShrink: 1, minWidth: 0,
            color: isNight ? '#a78bfa' : '#eab308',
            padding: '2px 8px',
            background: isNight ? 'rgba(109,40,217,0.18)' : 'rgba(234,179,8,0.1)',
            borderRadius: 20,
            border: `1px solid ${isNight ? 'rgba(109,40,217,0.35)' : 'rgba(234,179,8,0.25)'}`,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            transition: 'all 1.5s ease',
          }}>
            {isNight ? '🌑 Witching Hour' : '☀️ Reckoning'} · P{room?.phase}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <PhaseRing isNight={isNight} timerPct={timerPct} isUrgent={timeLeft !== null && timeLeft <= 30} />
            {timeLeft !== null && (
              <span style={{
                fontSize: 11, fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                color: timeLeft <= 30 ? '#fb7185' : isNight ? '#a78bfa' : '#eab308',
                minWidth: 32, letterSpacing: '0.5px',
              }}>
                {String(Math.floor(timeLeft / 60)).padStart(2,'0')}:{String(timeLeft % 60).padStart(2,'0')}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={onShowRulebook} style={iconBtn} title="Codex">📜</button>
          <button onClick={onLeave} style={{ ...iconBtn, color: '#fb7185', borderColor: 'rgba(248,113,133,0.2)' }} title="Leave">⊗</button>
        </div>
      </div>

      {/* Body — position:relative + zIndex:1 ensures it renders ABOVE the absolute PhaseBackground (z:0) */}
      {isMobile ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', zIndex: 1 }}>
          {mobileTab === 'circle' ? (
            <div style={{ flex: 1, overflowY: 'auto' }}>{circlePanel}</div>
          ) : chatPanel}
          <div style={{
            display: 'flex', flexShrink: 0,
            borderTop: `1px solid ${isNight ? 'rgba(109,40,217,0.25)' : 'rgba(255,255,255,0.1)'}`,
            background: isNight ? 'rgba(3,0,10,0.95)' : 'rgba(5,5,10,0.95)',
          }}>
            <TabBtn active={mobileTab === 'circle'} label="The Circle" badge={hasPendingAction && mobileTab !== 'circle'} onClick={() => setMobileTab('circle')} />
            <TabBtn active={mobileTab === 'chat'} label="Chat" onClick={() => setMobileTab('chat')} />
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative', zIndex: 1 }}>
          <div style={{
            width: 220, flexShrink: 0,
            borderRight: `1px solid ${isNight ? 'rgba(109,40,217,0.2)' : 'rgba(255,255,255,0.07)'}`,
            overflowY: 'auto',
            background: isNight ? 'rgba(3,0,10,0.55)' : 'rgba(5,4,8,0.45)',
            transition: 'background 2s ease, border-color 2s ease',
          }}>
            {circlePanel}
          </div>
          {chatPanel}
        </div>
      )}
    </div>
  )
}

// ─── Phase Backgrounds ───────────────────────────────────────────────────────

function PhaseBackground({ isNight, isCabalFaction }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: isNight ? 0 : 1, transition: 'opacity 2.5s ease' }}>
        <TownSquareBg />
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: isNight && !isCabalFaction ? 1 : 0, transition: 'opacity 2.5s ease' }}>
        <DarkRoomBg />
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: isNight && isCabalFaction ? 1 : 0, transition: 'opacity 2.5s ease' }}>
        <CabalChamberBg />
      </div>
    </div>
  )
}

function TownSquareBg() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMax slice"
      xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="sq-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c2530" />
          <stop offset="60%" stopColor="#2e3d4f" />
          <stop offset="100%" stopColor="#3d4e5e" />
        </linearGradient>
        <linearGradient id="sq-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2e2418" />
          <stop offset="100%" stopColor="#1a140d" />
        </linearGradient>
        <linearGradient id="sq-platform" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e1710" />
          <stop offset="100%" stopColor="#120e09" />
        </linearGradient>
      </defs>

      {/* Sky */}
      <rect x="0" y="0" width="1200" height="520" fill="url(#sq-sky)" />
      {/* Cloud wisps */}
      <ellipse cx="200"  cy="120" rx="140" ry="30" fill="rgba(255,255,255,0.025)" />
      <ellipse cx="160"  cy="105" rx="90"  ry="20" fill="rgba(255,255,255,0.02)" />
      <ellipse cx="750"  cy="90"  rx="180" ry="35" fill="rgba(255,255,255,0.02)" />
      <ellipse cx="1050" cy="140" rx="120" ry="28" fill="rgba(255,255,255,0.025)" />

      {/* Distant fog band */}
      <rect x="0" y="460" width="1200" height="60" fill="rgba(180,180,200,0.04)" />

      {/* ── Left building cluster ── */}
      <rect x="0"   y="180" width="160" height="340" fill="#0f0c09" />
      <rect x="0"   y="150" width="110" height="80"  fill="#0f0c09" />
      <rect x="60"  y="220" width="80"  height="300" fill="#12100d" />
      {/* Chimney */}
      <rect x="25"  y="130" width="18"  height="40"  fill="#0d0b08" />
      {/* Windows */}
      {[[15,200],[55,200],[15,265],[55,265],[70,240],[115,240]].map(([x,y],i) => (
        <rect key={i} x={x} y={y} width="22" height="28" rx="2"
          fill={i%3===0 ? 'rgba(180,130,50,0.07)' : '#07060a'} />
      ))}
      {/* Door arch */}
      <rect x="30" y="430" width="40" height="90" fill="#070605" rx="3" />
      <ellipse cx="50" cy="430" rx="20" ry="10" fill="#070605" />

      {/* ── Right building cluster ── */}
      <rect x="1020" y="200" width="180" height="320" fill="#0f0c09" />
      <rect x="1060" y="160" width="100" height="360" fill="#12100d" />
      <rect x="1100" y="130" width="60"  height="390" fill="#100e0b" />
      {/* Windows */}
      {[[1030,220],[1030,280],[1065,185],[1065,240],[1065,295],[1110,150],[1110,205],[1110,260]].map(([x,y],i) => (
        <rect key={i} x={x} y={y} width="22" height="28" rx="2"
          fill={i%4===0 ? 'rgba(180,130,50,0.06)' : '#07060a'} />
      ))}

      {/* ── Ground ── */}
      <rect x="0" y="510" width="1200" height="290" fill="url(#sq-ground)" />
      {/* Cobblestone grid */}
      {[520,535,550,567,585,605,628,655,685,720,760].map((y,i) => (
        <line key={i} x1="0" y1={y} x2="1200" y2={y}
          stroke="rgba(0,0,0,0.35)" strokeWidth={i===0?2:1.5} />
      ))}
      {[100,200,300,380,450,510,570,630,690,750,820,900,1000,1100].map((x,i) => (
        <line key={i} x1={x} y1="510" x2={x + (i%2===0?30:-30)} y2="800"
          stroke="rgba(0,0,0,0.25)" strokeWidth="1.2" />
      ))}

      {/* ── Crowd silhouettes ── */}
      {[
        [155,490,0.82],[195,495,0.78],[230,488,0.85],[270,492,0.80],[310,487,0.83],
        [850,490,0.81],[895,494,0.79],[935,488,0.84],[975,492,0.77],[1010,487,0.82],
      ].map(([x,y,op],i) => (
        <g key={i} style={{ opacity: op }}>
          <ellipse cx={x} cy={y-18} rx={7+i%2} ry={8+i%3} fill="#0a0806" />
          <path d={`M${x-9},${y-10} L${x-12},${y+20} L${x+12},${y+20} L${x+9},${y-10} Z`}
            fill="#0c0a07" />
        </g>
      ))}

      {/* ── Gallows ── centre-right ── */}
      {/* Platform base */}
      <rect x="540" y="360" width="220" height="16" fill="url(#sq-platform)" rx="2" />
      <rect x="550" y="376" width="200" height="10" fill="#150f08" rx="1" />
      <rect x="560" y="386" width="180" height="10" fill="#130d07" rx="1" />
      {/* Platform legs */}
      <rect x="560" y="396" width="16" height="120" fill="#110d07" />
      <rect x="726" y="396" width="16" height="120" fill="#110d07" />
      <rect x="630" y="396" width="14" height="120" fill="#110d07" />
      {/* Trapdoor outline */}
      <rect x="612" y="360" width="76" height="16" fill="#1c1510"
        stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
      <line x1="650" y1="360" x2="650" y2="376" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" />

      {/* Main vertical post */}
      <rect x="658" y="170" width="14" height="195" fill="#110d07" />
      {/* Horizontal arm */}
      <rect x="658" y="170" width="120" height="12" fill="#110d07" />
      {/* Diagonal brace */}
      <line x1="658" y1="200" x2="730" y2="170" stroke="#110d07" strokeWidth="10" strokeLinecap="round" />

      {/* Rope + noose (swinging) */}
      <g style={{ transformOrigin: '775px 182px', animation: 'ropeWay 4s ease-in-out infinite' }}>
        <line x1="775" y1="182" x2="775" y2="310" stroke="#221a10" strokeWidth="3.5" />
        <ellipse cx="775" cy="318" rx="10" ry="8" fill="none"
          stroke="#221a10" strokeWidth="3.5" />
        <line x1="775" y1="326" x2="775" y2="340" stroke="#221a10" strokeWidth="3.5" />
      </g>

      {/* Torch on post */}
      <rect x="646" y="225" width="10" height="4" fill="#2a1a08" />
      <rect x="636" y="210" width="8" height="18" rx="1" fill="#1a1208" />
      <ellipse cx="640" cy="208" rx="5" ry="7" fill="rgba(220,120,20,0.6)" />

      {/* Ground shadows under platform */}
      <ellipse cx="650" cy="516" rx="100" ry="12" fill="rgba(0,0,0,0.35)" />
    </svg>
  )
}

function DarkRoomBg() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="dr-room" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#030208" />
          <stop offset="100%" stopColor="#050310" />
        </linearGradient>
        <linearGradient id="dr-nightsky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#020510" />
          <stop offset="100%" stopColor="#050d20" />
        </linearGradient>
        <radialGradient id="dr-moon" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#f8f4ec" />
          <stop offset="70%"  stopColor="#e8e0cc" />
          <stop offset="100%" stopColor="#c8bea8" />
        </radialGradient>
        <radialGradient id="dr-moonglow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(240,230,200,0.18)" />
          <stop offset="100%" stopColor="rgba(240,230,200,0)" />
        </radialGradient>
        <linearGradient id="dr-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgba(200,210,230,0.08)" />
          <stop offset="100%" stopColor="rgba(200,210,230,0)" />
        </linearGradient>
        <clipPath id="dr-window-clip">
          <path d="M490,80 L490,350 L710,350 L710,80 Q600,20 490,80 Z" />
        </clipPath>
      </defs>

      {/* Room walls */}
      <rect x="0" y="0" width="1200" height="800" fill="url(#dr-room)" />

      {/* Stone texture suggestion — very subtle horizontal bands */}
      {[80,160,240,320,400,480,560,640,720].map((y,i) => (
        <rect key={i} x="0" y={y} width="1200" height="2"
          fill="rgba(255,255,255,0.012)" />
      ))}

      {/* Moonbeam shaft through window */}
      <polygon points="490,80 710,80 780,800 420,800"
        fill="url(#dr-beam)"
        style={{ animation: 'moonBeam 5s ease-in-out infinite' }} />

      {/* Window arch opening — night sky inside */}
      <path d="M490,80 L490,350 L710,350 L710,80 Q600,20 490,80 Z"
        fill="url(#dr-nightsky)" />

      {/* Moon glow halo */}
      <ellipse cx="600" cy="155" rx="80" ry="80"
        fill="url(#dr-moonglow)" />

      {/* Moon */}
      <circle cx="600" cy="155" r="38" fill="url(#dr-moon)" />
      {/* Moon surface craters (very subtle) */}
      <circle cx="588" cy="145" r="8"  fill="rgba(180,165,140,0.25)" />
      <circle cx="615" cy="165" r="5"  fill="rgba(180,165,140,0.2)" />
      <circle cx="600" cy="170" r="4"  fill="rgba(180,165,140,0.15)" />

      {/* Stars */}
      {[
        [510,95],[530,110],[555,90],[570,105],[620,92],[650,108],
        [675,95],[690,115],[700,100],[520,130],[535,145],[688,130],
      ].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r={i%3===0?1.2:0.8}
          fill={`rgba(255,255,255,${0.4+i%3*0.15})`} />
      ))}

      {/* Window frame — stone surround */}
      <path d="M480,75 L480,360 L720,360 L720,75 Q600,10 480,75 Z"
        fill="none" stroke="#0f0c09" strokeWidth="20" />
      {/* Inner frame */}
      <path d="M490,80 L490,350 L710,350 L710,80 Q600,20 490,80 Z"
        fill="none" stroke="#1a1510" strokeWidth="6" />
      {/* Window cross-bar */}
      <line x1="490" y1="220" x2="710" y2="220" stroke="#1a1510" strokeWidth="5" />
      <line x1="600" y1="80"  x2="600" y2="350" stroke="#1a1510" strokeWidth="5" />

      {/* Window sill */}
      <rect x="468" y="350" width="264" height="18" fill="#0f0c09" rx="2" />

      {/* Floor — faint moonlit cobblestones */}
      <rect x="0" y="680" width="1200" height="120" fill="rgba(10,8,20,0.6)" />
      {[685,700,718,740].map((y,i) => (
        <line key={i} x1="0" y1={y} x2="1200" y2={y}
          stroke="rgba(255,255,255,0.03)" strokeWidth="1.5" />
      ))}

      {/* Dim vignette corners */}
      <radialGradient id="dr-vignette" cx="50%" cy="50%" r="70%">
        <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
        <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
      </radialGradient>
      <rect x="0" y="0" width="1200" height="800" fill="url(#dr-vignette)" />
    </svg>
  )
}

function CabalChamberBg() {
  // Single hooded figure silhouette path (points facing up)
  const figPath = (cx, scale) => {
    const s = scale
    const x = cx
    return `
      M${x},${290-80*s}
      C${x-12*s},${290-90*s} ${x-22*s},${290-70*s} ${x-26*s},${290-50*s}
      L${x-32*s},${290-20*s}
      C${x-22*s},${290-28*s} ${x-14*s},${290-18*s} ${x},${290-18*s}
      C${x+14*s},${290-18*s} ${x+22*s},${290-28*s} ${x+32*s},${290-20*s}
      L${x+26*s},${290-50*s}
      C${x+22*s},${290-70*s} ${x+12*s},${290-90*s} ${x},${290-80*s}
      Z
      M${x-32*s},${290-20*s}
      L${x-48*s},${290+100*s}
      L${x+48*s},${290+100*s}
      L${x+32*s},${290-20*s}
      C${x+22*s},${290-28*s} ${x+14*s},${290-18*s} ${x},${290-18*s}
      C${x-14*s},${290-18*s} ${x-22*s},${290-28*s} ${x-32*s},${290-20*s}
      Z
    `
  }

  return (
    <svg width="100%" height="100%" viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMax slice"
      xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="cc-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#0a0404" />
          <stop offset="100%" stopColor="#140808" />
        </linearGradient>
        <radialGradient id="cc-torch-l" cx="0%" cy="50%" r="100%">
          <stop offset="0%"   stopColor="rgba(200,90,10,0.28)" />
          <stop offset="100%" stopColor="rgba(200,90,10,0)" />
        </radialGradient>
        <radialGradient id="cc-torch-r" cx="100%" cy="50%" r="100%">
          <stop offset="0%"   stopColor="rgba(200,90,10,0.28)" />
          <stop offset="100%" stopColor="rgba(200,90,10,0)" />
        </radialGradient>
        <radialGradient id="cc-floor-glow" cx="50%" cy="100%" r="60%">
          <stop offset="0%"   stopColor="rgba(160,60,10,0.12)" />
          <stop offset="100%" stopColor="rgba(160,60,10,0)" />
        </radialGradient>
        <radialGradient id="cc-vignette" cx="50%" cy="50%" r="70%">
          <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.75)" />
        </radialGradient>
      </defs>

      {/* Stone walls */}
      <rect x="0" y="0" width="1200" height="800" fill="url(#cc-wall)" />

      {/* Stone block lines */}
      {[100,200,300,400,500,600,700].map((y,i) => (
        <line key={i} x1="0" y1={y} x2="1200" y2={y}
          stroke="rgba(255,255,255,0.018)" strokeWidth="2" />
      ))}
      {[150,300,450,600,750,900,1050].map((x,i) => (
        <line key={i} x1={x} y1={0} x2={x} y2={800}
          stroke="rgba(255,255,255,0.012)" strokeWidth="1.5" />
      ))}

      {/* Torch glow pools */}
      <rect x="0"    y="0" width="600" height="800" fill="url(#cc-torch-l)" />
      <rect x="600"  y="0" width="600" height="800" fill="url(#cc-torch-r)" />

      {/* Floor glow */}
      <rect x="0" y="0" width="1200" height="800" fill="url(#cc-floor-glow)" />

      {/* ── Left torch ── */}
      <rect x="90" y="195" width="12" height="45" rx="2" fill="#1e1008" />
      <rect x="85" y="186" width="22" height="12" rx="2" fill="#251508" />
      <g style={{ transformOrigin: '96px 185px', animation: 'torchFlicker 1.8s ease-in-out infinite' }}>
        <ellipse cx="96" cy="175" rx="9"  ry="14" fill="rgba(230,100,10,0.85)" />
        <ellipse cx="96" cy="168" rx="6"  ry="9"  fill="rgba(255,180,40,0.9)" />
        <ellipse cx="96" cy="163" rx="3.5" ry="5" fill="rgba(255,240,180,0.95)" />
      </g>

      {/* ── Right torch ── */}
      <rect x="1098" y="195" width="12" height="45" rx="2" fill="#1e1008" />
      <rect x="1093" y="186" width="22" height="12" rx="2" fill="#251508" />
      <g style={{ transformOrigin: '1104px 185px', animation: 'torchFlicker 2.1s ease-in-out infinite 0.4s' }}>
        <ellipse cx="1104" cy="175" rx="9"  ry="14" fill="rgba(230,100,10,0.85)" />
        <ellipse cx="1104" cy="168" rx="6"  ry="9"  fill="rgba(255,180,40,0.9)" />
        <ellipse cx="1104" cy="163" rx="3.5" ry="5" fill="rgba(255,240,180,0.95)" />
      </g>

      {/* ── Ritual circle on floor (very faint) ── */}
      <ellipse cx="600" cy="700" rx="280" ry="60"
        fill="none" stroke="rgba(160,40,10,0.12)" strokeWidth="2" />
      <ellipse cx="600" cy="700" rx="220" ry="46"
        fill="none" stroke="rgba(160,40,10,0.08)" strokeWidth="1.5" />
      {/* Triangle inside circle */}
      <polygon points="600,645 370,745 830,745"
        fill="none" stroke="rgba(160,40,10,0.09)" strokeWidth="1.5" />

      {/* ── Three cloaked figures ── */}
      {/* Left figure (smaller — further back) */}
      <path d={figPath(340, 0.78)} fill="#0d0505" />
      <ellipse cx="340" cy="226" rx="16" ry="14" fill="#080202" />

      {/* Centre figure (largest — closest) */}
      <path d={figPath(600, 1.0)} fill="#0e0606" />
      <ellipse cx="600" cy="210" rx="20" ry="18" fill="#090202" />

      {/* Right figure (smaller — further back) */}
      <path d={figPath(860, 0.78)} fill="#0d0505" />
      <ellipse cx="860" cy="226" rx="16" ry="14" fill="#080202" />

      {/* Deep vignette */}
      <rect x="0" y="0" width="1200" height="800" fill="url(#cc-vignette)" />
    </svg>
  )
}

function PhaseRing({ isNight, timerPct, isUrgent }) {
  const size = 34
  const r    = 13
  const circ = 2 * Math.PI * r
  const offset = timerPct !== null ? circ - (timerPct / 100) * circ : 0

  const trackColor = isNight ? 'rgba(120,20,20,0.25)' : 'rgba(234,179,8,0.15)'
  const arcColor   = isUrgent ? '#fb7185' : (isNight ? '#b3123f' : '#eab308')

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={trackColor} strokeWidth={2.5} />
        {timerPct !== null && (
          <circle
            cx={size/2} cy={size/2} r={r}
            fill="none"
            stroke={arcColor}
            strokeWidth={2.5}
            strokeDasharray={`${circ}`}
            strokeDashoffset={`${offset}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.4s' }}
          />
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isNight ? (
          <div style={{
            width: 15, height: 15, borderRadius: '50%',
            background: 'radial-gradient(circle at 40% 35%, #7f1d1d 0%, #450a0a 100%)',
            animation: 'moonGlow 4s ease-in-out infinite',
            transition: 'all 0.4s',
          }} />
        ) : (
          <div style={{
            width: 14, height: 14, borderRadius: '50%',
            background: 'radial-gradient(circle at 40% 35%, #fde68a 0%, #d97706 100%)',
            animation: 'sunGlow 4s ease-in-out infinite',
            transition: 'all 0.4s',
          }} />
        )}
      </div>
    </div>
  )
}

function TabBtn({ active, label, badge, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '13px 8px',
      background: 'none', border: 'none',
      color: active ? '#c084fc' : '#71717a',
      fontSize: 13, fontWeight: active ? 600 : 400,
      cursor: 'pointer', position: 'relative',
      borderBottom: active ? '2px solid #9f67ff' : '2px solid transparent',
      transition: 'color 0.15s, border-color 0.15s',
      WebkitTapHighlightColor: 'transparent',
    }}>
      {label}
      {badge && <span style={{ position: 'absolute', top: 8, right: '25%', width: 8, height: 8, borderRadius: '50%', background: '#b3123f' }} />}
    </button>
  )
}

function ActionPanel({ color, title, children }) {
  return (
    <div style={{ padding: '10px 12px', background: `${color}08`, border: `1px solid ${color}25`, borderRadius: 8 }}>
      <p style={{ fontSize: 10, color, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>{title}</p>
      {children}
    </div>
  )
}

function DonePanel({ color, text, sub }) {
  return (
    <div style={{ padding: '10px 12px', background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 8 }}>
      <p style={{ fontSize: 12, color }}>✓ {text}</p>
      {sub && <p style={{ fontSize: 11, color: '#71717a', marginTop: 4 }}>{sub}</p>}
    </div>
  )
}

function ChatMessage({ msg, isOracle, isNight }) {
  if (isOracle) {
    return (
      <div style={{
        width: '100%',
        padding: '10px 14px',
        background: 'linear-gradient(135deg, rgba(109,40,217,0.12), rgba(179,18,63,0.08))',
        border: '1px solid rgba(167,139,250,0.25)',
        borderLeft: '3px solid #9f67ff',
        borderRadius: 6,
        boxShadow: '0 0 12px rgba(109,40,217,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#a78bfa' }}>◈</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#9f67ff', letterSpacing: 2, textTransform: 'uppercase' }}>
            The Oracle
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#e9d5ff', lineHeight: 1.7, wordBreak: 'break-word', fontStyle: 'italic' }}>
          {msg.message}
        </p>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
      <div style={{
        minWidth: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: isNight ? 'rgba(109,40,217,0.12)' : 'rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, color: '#71717a',
      }}>
        {msg.display_name[0]?.toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#c084fc', marginRight: 6 }}>
          {msg.display_name}
        </span>
        <span style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.55, wordBreak: 'break-word' }}>
          {msg.message}
        </span>
      </div>
    </div>
  )
}

function getEffectStyle(effect, isNight) {
  if (!effect) {
    if (isNight) return { background: 'rgba(5,0,20,0.3)', animation: 'ambientNight 6s ease-in-out infinite' }
    return null
  }
  switch (effect) {
    case 'nightFall':
      return { background: 'radial-gradient(ellipse at center, rgba(30,0,60,0.9) 0%, rgba(3,0,10,0.95) 100%)', animation: 'nightFall 1.8s ease-in forwards' }
    case 'ambientNight':
      return { background: 'rgba(5,0,20,0.3)', animation: 'ambientNight 6s ease-in-out infinite' }
    case 'dawnBreak':
      return { background: 'radial-gradient(ellipse at top, rgba(251,191,36,0.2) 0%, transparent 70%)', animation: 'dawnBreak 3.5s ease-out forwards' }
    case 'sacrificePulse':
      return { background: 'radial-gradient(ellipse at center, rgba(220,0,30,0.6) 0%, rgba(100,0,10,0.4) 50%, transparent 80%)', animation: 'sacrificePulse 1.4s ease-out forwards' }
    default:
      return null
  }
}

const roleFlavorText = {
  congregation: 'You are one of the faithful. Discuss, deliberate, and banish the Cabal before they sacrifice you all.',
  cabal: 'You serve the darkness. Each night, choose a member of the Congregation to sacrifice. Stay hidden. Sow doubt.',
  inquisitor: 'The Oracle grants you sight — but only on odd-numbered nights. Use your investigation wisely.',
  warden: 'You carry one bullet. Guard yourself and fire back if targeted, or shoot a suspect — your shot always kills, but choose wisely.',
  apostate: 'You seek the void. You win if the Congregation banishes you during a day vote. Act suspicious enough to be voted out — but not so obvious they suspect your true motive.',
  deceiver: 'You are the Cabal\'s shadow hand. Each night, choose one player to corrupt their aura. If the Inquisitor investigates them tonight, what they see will be inverted.',
  acolyte: 'You carry the Congregation\'s last hope. Once per game, anoint a player at night. If the Cabal would sacrifice them, your blessing turns the attack away.',
}

function compactBtn(color) {
  return {
    width: '100%', padding: '9px 10px',
    background: `${color}18`, border: `1px solid ${color}40`,
    borderRadius: 6, color, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  }
}

const iconBtn = {
  padding: '7px 10px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6, color: '#a1a1aa', fontSize: 14, cursor: 'pointer',
}

const modalOverlay = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.9)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 9999, padding: 16, overflowY: 'auto',
}

const modalBox = {
  background: '#0a0a12',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 14, padding: '28px 22px',
  textAlign: 'center', maxWidth: 340, width: '100%',
}
