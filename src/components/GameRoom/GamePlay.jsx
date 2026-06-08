import { useState, useEffect, useRef, useCallback } from 'react'
import { API_BASE_URL } from '../../config/api'

const ROLE_META = {
  congregation: { icon: '◌', color: '#a1a1aa', label: 'Congregation' },
  cabal:        { icon: '◈', color: '#b3123f', label: 'Cabal Agent' },
  inquisitor:   { icon: '◉', color: '#9f67ff', label: 'Inquisitor' },
  warden:       { icon: '◎', color: '#22c55e', label: 'Warden' },
}

const DAY_SECS   = 240
const NIGHT_SECS = 120

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

  // Role ability states from server
  const bulletSpent        = myPlayer?.bullet_spent
  const canInvestigateNow  = myPlayer?.can_investigate_now // null when not night

  const roleMeta = ROLE_META[myRole] || ROLE_META.congregation

  // Whether this player has an actionable night ability right now
  const hasNightAction = isNight && isAlive && (
    myRole === 'cabal' ||
    (myRole === 'inquisitor' && canInvestigateNow === true) ||
    (myRole === 'warden' && !bulletSpent)
  )

  const hasPendingAction = isAlive && (
    (isDay && !myVote) ||
    (isNight && hasNightAction && !myAction)
  )

  // ── Phase timer countdown ──────────────────────────────────────────
  useEffect(() => {
    if (!room?.phase_ends_at) { setTimeLeft(null); return }
    const update = () => {
      const endsAt = new Date(room.phase_ends_at.replace(' ', 'T') + 'Z')
      const diff = Math.max(0, Math.floor((endsAt.getTime() - Date.now()) / 1000))
      setTimeLeft(diff)
    }
    update()
    const iv = setInterval(update, 1000)
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
      const channel = isNight && myRole === 'cabal' ? 'cabal' : 'public'
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
      if (myRole === 'cabal')      action_type = 'kill'
      else if (myRole === 'inquisitor') action_type = 'investigate'
      else if (myRole === 'warden') action_type = isGuard ? 'guard' : 'shoot'

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
  const displayMessages = isNight && myRole === 'cabal' ? cabalMessages : publicMessages

  const maxSecs  = isNight ? NIGHT_SECS : DAY_SECS
  const timerPct = timeLeft !== null ? Math.max(0, (timeLeft / maxSecs) * 100) : null

  // Player list: can the caller select this player?
  // Guard mode: no target selection; others: can't self-target
  const needsTargetSelection = isNight && (myRole !== 'warden' || wardenMode === 'shoot')
  const getCanSelect = (p) => {
    if (!p.is_alive || !isAlive) return false
    if (p.is_me) return false
    if (isDay) return !myVote
    return isNight && hasNightAction && !myAction && needsTargetSelection
  }

  // ─── CirclePanel ─────────────────────────────────────────────────
  const circlePanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: isMobile ? '14px' : '14px 12px', overflowY: 'auto', flex: isMobile ? 1 : undefined }}>

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
                <span style={{ fontSize: 11, color: '#fb923c', fontWeight: 700, flexShrink: 0 }}>{voteCount}▲</span>
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

      {/* Day vote */}
      {isAlive && isDay && !myVote && (
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
      {isAlive && isDay && myVote && <DonePanel color="#4ade80" text="Vote cast" sub="Awaiting others..." />}

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

      {/* Submitted */}
      {isAlive && isNight && hasNightAction && myAction && <DonePanel color="#4ade80" text="Action submitted" sub="Awaiting dawn..." />}

      {/* No night action (congregation or spent) */}
      {isNight && isAlive && !hasNightAction && myRole === 'congregation' && (
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
      {isNight && myRole === 'cabal' && (
        <div style={{ padding: '7px 16px', background: 'rgba(179,18,63,0.1)', borderBottom: '1px solid rgba(179,18,63,0.22)', fontSize: 11, color: '#fb7185', letterSpacing: 2, flexShrink: 0 }}>
          ◈ CABAL CHANNEL — private
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
        {displayMessages.map(m => (
          <ChatMessage key={m.id} msg={m} isOracle={!m.player_id || m.display_name === 'The Oracle'} isNight={isNight} />
        ))}
        <div ref={chatEndRef} />
      </div>
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${isNight ? 'rgba(109,40,217,0.2)' : 'rgba(255,255,255,0.07)'}`, flexShrink: 0, transition: 'border-color 2s ease' }}>
        {(!isNight || myRole === 'cabal') && isAlive ? (
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
          <div style={{ textAlign: 'center', fontSize: 12, color: '#52525b', padding: '6px 0' }}>
            {!isAlive ? 'The sacrificed observe in silence' : 'The Congregation sleeps — silence until dawn'}
          </div>
        )}
      </div>
    </div>
  )

  const effectStyle = getEffectStyle(effect, isNight)

  return (
    <div style={{ height: 'calc(100vh - 72px)', color: '#f4f4f5', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

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
            {myRole === 'cabal' && (
              <div style={{ marginBottom: 18, padding: '10px 12px', background: 'rgba(179,18,63,0.1)', borderRadius: 8 }}>
                <p style={{ fontSize: 11, color: '#b3123f', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>Your Cabal</p>
                {players.filter(p => p.role === 'cabal' && !p.is_me).map(p => (
                  <div key={p.id} style={{ fontSize: 13, color: '#f87171' }}>{p.display_name}</div>
                ))}
                {players.filter(p => p.role === 'cabal' && !p.is_me).length === 0 && (
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
          <PhaseRing isNight={isNight} timerPct={timerPct} isUrgent={timeLeft !== null && timeLeft <= 30} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={onShowRulebook} style={iconBtn} title="Codex">📜</button>
          <button onClick={onLeave} style={{ ...iconBtn, color: '#fb7185', borderColor: 'rgba(248,113,133,0.2)' }} title="Leave">⊗</button>
        </div>
      </div>

      {/* Body */}
      {isMobile ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {mobileTab === 'circle' ? (
            <div style={{ flex: 1, overflowY: 'auto' }}>{circlePanel}</div>
          ) : (
            {chatPanel}
          )}
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
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{
            width: 220, flexShrink: 0,
            borderRight: `1px solid ${isNight ? 'rgba(109,40,217,0.2)' : 'rgba(255,255,255,0.07)'}`,
            overflowY: 'auto',
            background: isNight ? 'rgba(3,0,10,0.4)' : 'transparent',
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
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
      <div style={{
        minWidth: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: isOracle ? 'rgba(109,40,217,0.3)' : isNight ? 'rgba(109,40,217,0.12)' : 'rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: isOracle ? 13 : 11, color: isOracle ? '#9f67ff' : '#71717a',
      }}>
        {isOracle ? '◈' : msg.display_name[0]?.toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: isOracle ? '#a78bfa' : '#c084fc', marginRight: 6 }}>
          {msg.display_name}
        </span>
        <span style={{ fontSize: 14, color: isOracle ? '#e9d5ff' : '#d4d4d8', lineHeight: 1.55, wordBreak: 'break-word' }}>
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
