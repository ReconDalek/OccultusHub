import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from '../hooks/useSession'
import { API_BASE_URL } from '../config/api'
import CardsLobby from '../components/CardsGame/CardsLobby'
import CardsPlay from '../components/CardsGame/CardsPlay'
import CardsEnd from '../components/CardsGame/CardsEnd'
import CardsRulebook from '../components/CardsGame/CardsRulebook'
import ShadowCard from '../components/CardsGame/ShadowCard'

const POLL_MS = 2500

const SAMPLE_SHADOW = {
  text: 'When Occultus needs to win a war, leadership\'s secret weapon is _______.',
  picks: 1,
}

export default function CardsGame() {
  const { user } = useSession()
  const [screen, setScreen] = useState('landing') // landing | lobby | game | ended
  const [guestName, setGuestName] = useState('')
  const [guestToken, setGuestToken] = useState(null)
  const [roomCode, setRoomCode] = useState(null)
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [gameData, setGameData] = useState(null)
  const [lobbyPreview, setLobbyPreview] = useState(null)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [lobbySettings, setLobbySettings] = useState({ souls_to_win: 5, omens_enabled: true })

  const lastMsgId = useRef(0)
  const pollRef = useRef(null)
  const previewRef = useRef(null)

  const displayName = user?.username || guestName

  const authHeaders = useCallback(() => {
    const token = localStorage.getItem('occultusSession')
    const h = { 'Content-Type': 'application/json' }
    if (token) h['Authorization'] = token
    return h
  }, [])

  // Poll landing preview
  useEffect(() => {
    if (screen !== 'landing') return
    const fetch_ = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/cards/current`)
        if (res.ok) {
          const d = await res.json()
          setLobbyPreview(d.room)
        }
      } catch (_) {}
    }
    fetch_()
    previewRef.current = setInterval(fetch_, 5000)
    return () => clearInterval(previewRef.current)
  }, [screen])

  // Poll game state
  const poll = useCallback(async (code, token) => {
    if (!code) return
    try {
      const gTok = token ?? guestToken
      const params = new URLSearchParams({ since: lastMsgId.current })
      if (gTok) params.set('guest_token', gTok)
      const res = await fetch(`${API_BASE_URL}/api/cards/rooms/${code}?${params}`, {
        headers: authHeaders(),
      })
      if (res.status === 410) {
        clearInterval(pollRef.current)
        setScreen('landing')
        setError('The lobby expired before the ritual could begin.')
        return
      }
      if (!res.ok) return
      const data = await res.json()

      if (data.messages?.length) {
        lastMsgId.current = data.messages[data.messages.length - 1].id
      }
      setGameData(data)

      if (data.room.status === 'ended' && screen !== 'ended') {
        setScreen('ended')
        clearInterval(pollRef.current)
      } else if (data.room.status === 'playing' && screen === 'lobby') {
        setScreen('game')
      }
    } catch (_) {}
  }, [guestToken, authHeaders, screen])

  useEffect(() => {
    if (screen !== 'lobby' && screen !== 'game') return
    poll(roomCode, guestToken)
    pollRef.current = setInterval(() => poll(roomCode, guestToken), POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [screen, roomCode, guestToken, poll])

  // Update lobby settings on server when host changes them
  const handleSettingsChange = useCallback(async (newSettings) => {
    setLobbySettings(newSettings)
    if (!roomCode) return
    try {
      await fetch(`${API_BASE_URL}/api/cards/rooms/${roomCode}/settings`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ...newSettings, guest_token: guestToken }),
      })
    } catch (_) {}
  }, [roomCode, guestToken, authHeaders])

  async function handleJoin() {
    if (!user && !guestName.trim()) {
      setError('Enter a name to join')
      return
    }
    setJoining(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/cards/current/join`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          guest_name: guestName.trim(),
          souls_to_win: lobbySettings.souls_to_win,
          omens_enabled: lobbySettings.omens_enabled,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to join'); return }
      setRoomCode(data.code)
      setMyPlayerId(data.playerId)
      if (data.guestToken) setGuestToken(data.guestToken)
      lastMsgId.current = 0
      setScreen('lobby')
    } finally {
      setJoining(false)
    }
  }

  async function handleStart() {
    await fetch(`${API_BASE_URL}/api/cards/rooms/${roomCode}/start`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        guest_token: guestToken,
        souls_to_win: lobbySettings.souls_to_win,
        omens_enabled: lobbySettings.omens_enabled,
      }),
    })
  }

  async function handleLeave() {
    if (roomCode) {
      try {
        await fetch(`${API_BASE_URL}/api/cards/rooms/${roomCode}/leave`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ guest_token: guestToken }),
        })
      } catch (_) {}
    }
    clearInterval(pollRef.current)
    setScreen('landing')
    setRoomCode(null)
    setGameData(null)
    setMyPlayerId(null)
    setGuestToken(null)
    lastMsgId.current = 0
  }

  const isHost = gameData?.players?.find(p => p.id === myPlayerId)?.is_host || false

  // ─── Landing ──────────────────────────────────────────────────────────────
  if (screen === 'landing') {
    return (
      <div style={{ minHeight: '100vh', color: '#f4f4f5' }}>
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '48px 24px' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{
              fontFamily: 'Cinzel, serif',
              fontSize: 11,
              letterSpacing: '5px',
              color: '#a1a1aa',
              marginBottom: 12,
            }}>
              GAME ROOM
            </div>
            <h1 style={{
              fontFamily: 'Cinzel, serif',
              fontSize: 'clamp(28px, 5vw, 46px)',
              fontWeight: 400,
              color: '#f4f4f5',
              letterSpacing: '3px',
              margin: '0 0 10px',
            }}>
              Cards Against Occultus
            </h1>
            <p style={{ color: '#a1a1aa', fontSize: 14, maxWidth: 440, margin: '0 auto 20px' }}>
              A dark card game of prompts, fates, and poor decisions. For 3–20 players.
            </p>
            <button
              onClick={() => setShowRules(true)}
              style={{
                background: 'none', border: '1px solid rgba(255,255,255,0.15)',
                color: '#a1a1aa', borderRadius: 8, padding: '6px 16px',
                fontSize: 12, cursor: 'pointer', letterSpacing: '1px',
              }}
            >
              How to Play
            </button>
          </div>

          {/* Two-column: sample card + join */}
          <div style={{ display: 'flex', gap: 40, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* Sample shadow card */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <ShadowCard card={SAMPLE_SHADOW} large />
              <div style={{ fontSize: 11, color: 'rgba(244,244,245,0.25)', letterSpacing: '1px' }}>
                EXAMPLE SHADOW CARD
              </div>
            </div>

            {/* Join panel */}
            <div style={{ flex: 1, minWidth: 280, maxWidth: 380 }}>
              {!user && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, color: '#a1a1aa', display: 'block', marginBottom: 8, letterSpacing: '1px' }}>
                    YOUR NAME
                  </label>
                  <input
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                    placeholder="Enter your name…"
                    maxLength={24}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.04)',
                      color: '#f4f4f5',
                      fontSize: 14,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {user && (
                <div style={{
                  marginBottom: 20,
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(179,18,63,0.3)',
                  background: 'rgba(179,18,63,0.08)',
                  fontSize: 13,
                  color: '#f4f4f5',
                }}>
                  Playing as <strong>{user.username}</strong>
                </div>
              )}

              {/* Lobby preview */}
              {lobbyPreview && (
                <div style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: '1px solid rgba(109,40,217,0.3)',
                  background: 'rgba(109,40,217,0.07)',
                  marginBottom: 20,
                  fontSize: 13,
                  color: '#d4d4d8',
                }}>
                  <div style={{ color: '#a78bfa', fontSize: 11, letterSpacing: '1px', marginBottom: 4 }}>
                    OPEN LOBBY
                  </div>
                  <strong>{lobbyPreview.host_name}</strong>'s room — {lobbyPreview.playerCount} player{lobbyPreview.playerCount !== 1 ? 's' : ''} waiting
                </div>
              )}

              {error && (
                <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</div>
              )}

              <button
                onClick={handleJoin}
                disabled={joining || (!user && !guestName.trim())}
                style={{
                  width: '100%',
                  padding: '13px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
                  color: '#f4f4f5',
                  fontFamily: 'Cinzel, serif',
                  fontSize: 15,
                  letterSpacing: '1.5px',
                  cursor: joining ? 'wait' : 'pointer',
                  boxShadow: '0 0 28px rgba(179,18,63,0.3)',
                  opacity: (!user && !guestName.trim()) ? 0.5 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {joining ? 'Entering…' : lobbyPreview ? 'Join Lobby' : 'Create Lobby'}
              </button>
            </div>
          </div>
        </div>

        {showRules && <CardsRulebook onClose={() => setShowRules(false)} />}
      </div>
    )
  }

  // ─── Lobby ────────────────────────────────────────────────────────────────
  if (screen === 'lobby' && gameData) {
    return (
      <div style={{ minHeight: '100vh', color: '#f4f4f5' }}>
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '40px 16px' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: 24, letterSpacing: '3px', marginBottom: 6 }}>
              Cards Against Occultus
            </div>
            <button
              onClick={() => setShowRules(true)}
              style={{ background: 'none', border: 'none', color: '#6d28d9', fontSize: 12, cursor: 'pointer' }}
            >
              Rules ↗
            </button>
          </div>
          <CardsLobby
            room={{ ...gameData.room, code: roomCode }}
            players={gameData.players}
            myPlayerId={myPlayerId}
            isHost={isHost}
            user={user}
            authHeaders={authHeaders}
            roomCode={roomCode}
            onStart={handleStart}
            onLeave={handleLeave}
            settings={lobbySettings}
            onSettingsChange={handleSettingsChange}
          />
        </div>
        {showRules && <CardsRulebook onClose={() => setShowRules(false)} />}
      </div>
    )
  }

  // ─── Game ─────────────────────────────────────────────────────────────────
  if (screen === 'game' && gameData) {
    return (
      <div style={{ minHeight: '100vh', color: '#f4f4f5' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 48px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: 18, letterSpacing: '2px' }}>
              Cards Against Occultus
            </div>
            <button
              onClick={() => setShowRules(true)}
              style={{ background: 'none', border: 'none', color: '#6d28d9', fontSize: 12, cursor: 'pointer' }}
            >
              Rules ↗
            </button>
          </div>
          <CardsPlay
            room={gameData.room}
            players={gameData.players}
            round={gameData.round}
            submissions={gameData.submissions}
            myHand={gameData.myHand}
            mySubmission={gameData.mySubmission}
            myPlayerId={myPlayerId}
            authHeaders={authHeaders}
            guestToken={guestToken}
            code={roomCode}
            onLeave={handleLeave}
          />
        </div>
        {showRules && <CardsRulebook onClose={() => setShowRules(false)} />}
      </div>
    )
  }

  // ─── Ended ────────────────────────────────────────────────────────────────
  if (screen === 'ended' && gameData) {
    return (
      <div style={{ minHeight: '100vh', color: '#f4f4f5' }}>
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '48px 16px' }}>
          <CardsEnd
            room={gameData.room}
            players={gameData.players}
            myPlayerId={myPlayerId}
            onLeave={handleLeave}
          />
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa' }}>
      Loading…
    </div>
  )
}
