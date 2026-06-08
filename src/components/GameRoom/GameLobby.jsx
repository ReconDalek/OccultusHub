import { useState } from 'react'
import { API_BASE_URL } from '../../config/api'

export default function GameLobby({ gameState, displayName, guestToken, authHeaders, roomCode, onStart, onLeave, onShowRulebook }) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const players = gameState?.players || []
  const myPlayer = gameState?.my_player
  const isHost = myPlayer?.is_host

  const handleStart = async () => {
    if (players.length < 4) { setError('Need at least 4 players to begin the rite'); return }
    setStarting(true); setError('')
    try {
      const body = guestToken ? { guest_token: guestToken } : {}
      const res = await fetch(`${API_BASE_URL}/api/game/rooms/${roomCode}/start`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to start'); setStarting(false); return }
      onStart()
    } catch (_) {
      setError('Connection error')
      setStarting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', padding: '80px 20px 60px', color: '#f4f4f5' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 }}>
          <div>
            <h2 className="font-cinzel" style={{ fontSize: 26, letterSpacing: 5, marginBottom: 4 }}>THE RITE</h2>
            <p style={{ color: '#71717a', fontSize: 12, letterSpacing: 1 }}>Lobby · Awaiting players</p>
          </div>
          <button onClick={onLeave} style={ghostBtn}>Leave</button>
        </div>

        {/* Player list */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <p style={{ fontSize: 11, color: '#71717a', letterSpacing: 2, textTransform: 'uppercase' }}>
              The Circle
            </p>
            <span style={{ fontSize: 11, color: '#52525b' }}>{players.length} / 16</span>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            {players.map(p => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  background: p.is_me ? 'rgba(109,40,217,0.1)' : 'rgba(255,255,255,0.03)',
                  borderRadius: 10,
                  border: p.is_me ? '1px solid rgba(109,40,217,0.35)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: p.is_host ? 'rgba(234,179,8,0.2)' : 'rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, flexShrink: 0,
                }}>
                  {p.is_host ? '👑' : p.display_name[0]?.toUpperCase()}
                </div>
                <span style={{ fontSize: 14, flex: 1, color: p.is_me ? '#c084fc' : '#f4f4f5' }}>
                  {p.display_name}
                </span>
                {p.is_host && <span style={{ fontSize: 10, color: '#eab308', letterSpacing: 2, textTransform: 'uppercase' }}>Host</span>}
                {p.is_me && !p.is_host && <span style={{ fontSize: 10, color: '#9f67ff', letterSpacing: 2, textTransform: 'uppercase' }}>You</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Waiting notice */}
        {players.length < 4 && (
          <div style={{ background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#ca8a04', marginBottom: 16 }}>
            Waiting for {4 - players.length} more player{4 - players.length !== 1 ? 's' : ''} · {players.length}/4 minimum required
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(179,18,63,0.15)', border: '1px solid rgba(179,18,63,0.4)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fb7185', marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {isHost ? (
            <button
              onClick={handleStart}
              disabled={starting || players.length < 4}
              style={{
                ...primaryBtn,
                opacity: (starting || players.length < 4) ? 0.45 : 1,
                cursor: (starting || players.length < 4) ? 'not-allowed' : 'pointer',
              }}
            >
              {starting ? 'Beginning the Rite...' : '⛧ Begin the Rite'}
            </button>
          ) : (
            <div style={{ textAlign: 'center', padding: '14px', color: '#71717a', fontSize: 13, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
              Waiting for the host to begin the rite...
            </div>
          )}

          <button onClick={onShowRulebook} style={codexBtn}>
            <span>📜</span>
            <span>Read the Codex</span>
          </button>
        </div>

        <RoleScaling count={players.length} />
      </div>
    </div>
  )
}

function RoleScaling({ count }) {
  const c = Math.max(count, 4)
  const cabals = Math.max(1, Math.floor(c / 4))
  const hasInq      = c >= 5
  const hasWarden   = c >= 6
  const hasApostate = c >= 8
  const hasDeceiver = c >= 9
  const hasAcolyte  = c >= 10
  const specials = cabals
    + (hasInq ? 1 : 0) + (hasWarden ? 1 : 0)
    + (hasApostate ? 1 : 0) + (hasDeceiver ? 1 : 0) + (hasAcolyte ? 1 : 0)
  const cong = c - specials

  return (
    <div style={{ marginTop: 32, padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
      <p style={{ fontSize: 11, color: '#71717a', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>
        Role Preview — {c} players
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <RolePill count={cabals} label="Cabal" color="#b3123f" />
        <RolePill count={cong} label="Congregation" color="#a1a1aa" />
        {hasInq      && <RolePill count={1} label="Inquisitor" color="#9f67ff" />}
        {hasWarden   && <RolePill count={1} label="Warden"     color="#22c55e" />}
        {hasApostate && <RolePill count={1} label="Apostate"   color="#f59e0b" />}
        {hasDeceiver && <RolePill count={1} label="Deceiver"   color="#e879f9" />}
        {hasAcolyte  && <RolePill count={1} label="Acolyte"    color="#38bdf8" />}
      </div>
    </div>
  )
}

function RolePill({ count, label, color }) {
  return (
    <span style={{ fontSize: 12, color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 20, padding: '3px 12px' }}>
      {count}× {label}
    </span>
  )
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
  border: '1px solid rgba(109,40,217,0.3)',
  borderRadius: 8,
  color: '#c084fc',
  fontSize: 13,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
}

const ghostBtn = {
  padding: '8px 18px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: '#a1a1aa',
  fontSize: 13,
  cursor: 'pointer',
}
