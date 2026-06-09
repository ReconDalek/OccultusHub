import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from '../hooks/useSession'
import { API_BASE_URL } from '../config/api'
import GameLobby from '../components/GameRoom/GameLobby'
import GamePlay from '../components/GameRoom/GamePlay'
import GameEnd from '../components/GameRoom/GameEnd'
import GameRulebook from '../components/GameRoom/GameRulebook'

const POLL_INTERVAL = 2500

export default function GameRoom() {
  const { user } = useSession()
  const [screen, setScreen] = useState('landing') // landing | lobby | game | ended
  const [guestName, setGuestName] = useState('')
  const [guestToken, setGuestToken] = useState(null)
  const [roomCode, setRoomCode] = useState('')
  const [gameState, setGameState] = useState(null)
  const [lobbyPreview, setLobbyPreview] = useState(null) // public preview for landing
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showRulebook, setShowRulebook] = useState(false)
  const lastMessageId = useRef(0)
  const pollRef = useRef(null)
  const previewRef = useRef(null)

  const displayName = user?.username || guestName

  const authHeaders = useCallback(() => {
    const token = localStorage.getItem('occultusSession')
    const h = { 'Content-Type': 'application/json' }
    if (token) h['Authorization'] = token
    return h
  }, [])

  // Poll landing preview every 4s (no auth needed)
  useEffect(() => {
    if (screen !== 'landing') return
    const fetchPreview = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/game/current`)
        if (res.ok) {
          const data = await res.json()
          setLobbyPreview(data.room)
        }
      } catch (_) {}
    }
    fetchPreview()
    previewRef.current = setInterval(fetchPreview, 4000)
    return () => clearInterval(previewRef.current)
  }, [screen])

  const poll = useCallback(async (code, token) => {
    if (!code) return
    try {
      const gToken = token || guestToken
      const params = new URLSearchParams({ since: lastMessageId.current })
      if (gToken) params.set('guest_token', gToken)
      const res = await fetch(`${API_BASE_URL}/api/game/rooms/${code}?${params}`, {
        headers: authHeaders(),
      })
      if (res.status === 410) {
        clearInterval(pollRef.current)
        setScreen('landing')
        setError('The lobby expired before the rite could begin.')
        return
      }
      if (!res.ok) return
      const data = await res.json()

      setGameState(prev => {
        const prevMsgs = prev?.messages || []
        const newMsgs = data.messages || []
        const merged = [...prevMsgs, ...newMsgs]
        if (newMsgs.length > 0) {
          lastMessageId.current = newMsgs[newMsgs.length - 1].id
        }
        return { ...data, messages: merged }
      })

      if (data.room.status === 'ended') {
        setScreen('ended')
        clearInterval(pollRef.current)
      } else if (data.room.status === 'lobby') {
        setScreen('lobby')
      } else {
        setScreen('game')
      }
    } catch (_) {}
  }, [guestToken, authHeaders])

  const startPolling = useCallback((code, token) => {
    clearInterval(pollRef.current)
    poll(code, token)
    pollRef.current = setInterval(() => poll(code, token), POLL_INTERVAL)
  }, [poll])

  useEffect(() => () => clearInterval(pollRef.current), [])

  const handleEnterLobby = async () => {
    if (!displayName) { setError('Enter your name to continue'); return }
    setLoading(true); setError('')
    try {
      const body = user ? {} : { guest_name: guestName }
      const res = await fetch(`${API_BASE_URL}/api/game/current/join`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to enter lobby'); return }
      const token = data.guest_token || null
      setGuestToken(token)
      setRoomCode(data.code)
      lastMessageId.current = 0
      setGameState(null)
      clearInterval(previewRef.current)
      startPolling(data.code, token)
    } catch (_) {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }

  const handleLeave = async () => {
    clearInterval(pollRef.current)
    try {
      const body = guestToken ? { guest_token: guestToken } : {}
      await fetch(`${API_BASE_URL}/api/game/rooms/${roomCode}/leave`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      })
    } catch (_) {}
    setScreen('landing')
    setGameState(null)
    setRoomCode('')
    lastMessageId.current = 0
  }

  if (screen === 'ended') {
    return (
      <GameEnd
        gameState={gameState}
        displayName={displayName}
        onPlayAgain={() => { setScreen('landing'); setGameState(null); setRoomCode('') }}
      />
    )
  }
  if (screen === 'lobby') {
    return (
      <GameLobby
        gameState={gameState}
        displayName={displayName}
        guestToken={guestToken}
        authHeaders={authHeaders}
        roomCode={roomCode}
        user={user}
        onStart={() => startPolling(roomCode, guestToken)}
        onLeave={handleLeave}
        onShowRulebook={() => setShowRulebook(true)}
      />
    )
  }
  if (screen === 'game') {
    return (
      <>
        <GamePlay
          gameState={gameState}
          roomCode={roomCode}
          displayName={displayName}
          guestToken={guestToken}
          authHeaders={authHeaders}
          onLeave={handleLeave}
          onShowRulebook={() => setShowRulebook(true)}
        />
        {showRulebook && <GameRulebook onClose={() => setShowRulebook(false)} />}
      </>
    )
  }

  // Landing
  const inProgress = lobbyPreview && lobbyPreview.status !== 'lobby'
  const hasLobby = lobbyPreview && lobbyPreview.status === 'lobby'

  return (
    <>
      <div style={{ minHeight: '100vh', padding: '80px 20px 60px', color: '#f4f4f5' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>

          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.8 }}>⛧</div>
            <h1 className="font-cinzel" style={{ fontSize: 38, letterSpacing: 8, marginBottom: 10 }}>
              THE RITE
            </h1>
            <p style={{ color: '#a1a1aa', fontSize: 14, lineHeight: 1.6 }}>
              An occult game of deception, loyalty, and sacrifice
            </p>
          </div>

          {/* Lobby status card */}
          <div style={{ marginBottom: 28 }}>
            {inProgress ? (
              <div style={statusCard('#eab308', 'rgba(234,179,8,0.08)')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 16 }}>🌑</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#eab308' }}>A Rite Is In Progress</span>
                </div>
                <p style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 10 }}>
                  Phase {lobbyPreview.phase} · {lobbyPreview.phase_type === 'night' ? 'The Witching Hour' : 'The Reckoning'} · {lobbyPreview.player_count} players
                </p>
                <p style={{ fontSize: 11, color: '#71717a' }}>Wait for this rite to conclude before joining.</p>
              </div>
            ) : hasLobby ? (
              <div style={statusCard('#9f67ff', 'rgba(109,40,217,0.08)')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>◈</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#9f67ff' }}>Lobby Open</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#71717a' }}>{lobbyPreview.player_count} / 16</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {lobbyPreview.players?.map((p, i) => (
                    <span key={i} style={{ fontSize: 11, color: '#c084fc', background: 'rgba(109,40,217,0.15)', border: '1px solid rgba(109,40,217,0.3)', borderRadius: 20, padding: '2px 10px' }}>
                      {p.display_name}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={statusCard('#52525b', 'rgba(255,255,255,0.03)')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>◌</span>
                  <span style={{ fontSize: 13, color: '#71717a' }}>No active lobby — be the first to open one</span>
                </div>
              </div>
            )}
          </div>

          {/* Guest name input */}
          {!user && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#a1a1aa', marginBottom: 6, letterSpacing: 2, textTransform: 'uppercase' }}>
                Your Name
              </label>
              <input
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleEnterLobby()}
                placeholder="Enter your name..."
                maxLength={24}
                style={inputStyle}
              />
            </div>
          )}

          {error && (
            <div style={{ background: 'rgba(179,18,63,0.15)', border: '1px solid rgba(179,18,63,0.4)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fb7185', marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gap: 12 }}>
            <button
              onClick={handleEnterLobby}
              disabled={loading || inProgress}
              style={{
                ...primaryBtn,
                opacity: (loading || inProgress) ? 0.45 : 1,
                cursor: (loading || inProgress) ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Entering...' : hasLobby ? '⊕ Join the Lobby' : '⊕ Open the Lobby'}
            </button>

            <button
              onClick={() => setShowRulebook(true)}
              style={codexBtn}
            >
              <span style={{ fontSize: 15 }}>📜</span>
              <span>Read the Codex of the Rite</span>
            </button>
          </div>

          <RoleReference />
        </div>
      </div>
      {showRulebook && <GameRulebook onClose={() => setShowRulebook(false)} />}
    </>
  )
}

function RoleReference() {
  const roles = [
    { name: 'Congregation', icon: '◌', color: '#a1a1aa', desc: 'Discuss and vote to banish the Cabal' },
    { name: 'The Cabal', icon: '◈', color: '#b3123f', desc: 'Sacrifice the Congregation under cover of night' },
    { name: 'Inquisitor', icon: '◉', color: '#9f67ff', desc: 'Investigate one player on odd-numbered nights' },
    { name: 'Warden', icon: '◎', color: '#22c55e', desc: 'One bullet — guard yourself or shoot a suspect' },
    { name: 'Apostate', icon: '✦', color: '#f59e0b', desc: 'Neutral — wins alone if banished by the Congregation' },
    { name: 'Deceiver', icon: '◬', color: '#e879f9', desc: 'Cabal ally — corrupts the Inquisitor\'s investigations' },
    { name: 'Acolyte',  icon: '✧', color: '#38bdf8', desc: 'One blessing — shield a player from a night sacrifice' },
  ]
  return (
    <div style={{ marginTop: 48 }}>
      <p style={{ fontSize: 11, color: '#71717a', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>Roles</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {roles.map(r => (
          <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 18, color: r.color, width: 24, textAlign: 'center' }}>{r.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: r.color }}>{r.name}</div>
              <div style={{ fontSize: 12, color: '#71717a' }}>{r.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function statusCard(borderColor, bg) {
  return {
    padding: '14px 16px',
    background: bg,
    border: `1px solid ${borderColor}40`,
    borderRadius: 10,
  }
}

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#f4f4f5',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

const primaryBtn = {
  width: '100%',
  padding: '14px 20px',
  background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
  border: 'none',
  borderRadius: 8,
  color: '#f4f4f5',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  letterSpacing: 1,
}

const codexBtn = {
  width: '100%',
  padding: '13px 20px',
  background: 'rgba(109,40,217,0.1)',
  border: '1px solid rgba(109,40,217,0.35)',
  borderRadius: 8,
  color: '#c084fc',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  letterSpacing: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
}
