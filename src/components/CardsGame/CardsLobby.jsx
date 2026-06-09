import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

const OMEN_EXAMPLES = ['🌑 Blood Moon — submit 2 cards', '👁 The Veil — judge blind', '✦ The Awakening — +1 card dealt']

export default function CardsLobby({
  room,
  players = [],
  myPlayerId,
  isHost,
  user,
  authHeaders,
  roomCode,
  onStart,
  onLeave,
  settings,
  onSettingsChange,
}) {
  const [starting, setStarting] = useState(false)
  const [filling, setFilling] = useState(false)
  const [fillError, setFillError] = useState('')
  const [secsLeft, setSecsLeft] = useState(null)

  useEffect(() => {
    const expiresAt = room?.lobby_expires_at
    if (!expiresAt) { setSecsLeft(null); return }
    const tick = () => {
      const ms = new Date(expiresAt.replace(' ', 'T') + 'Z').getTime() - Date.now()
      setSecsLeft(Math.max(0, Math.floor(ms / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [room?.lobby_expires_at])

  async function handleStart() {
    setStarting(true)
    try { await onStart() } finally { setStarting(false) }
  }

  async function handleFillBots() {
    setFilling(true); setFillError('')
    try {
      const needed = Math.max(0, 3 - players.length)
      const res = await fetch(`${API_BASE_URL}/api/cards/rooms/${roomCode}/fill-bots`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ count: players.length + needed }),
      })
      const data = await res.json()
      if (!res.ok) setFillError(data.error || 'Failed to fill bots')
    } catch (_) { setFillError('Connection error') }
    setFilling(false)
  }

  const canStart = players.length >= 3

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px' }}>
      {/* Room code */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: '#a1a1aa', letterSpacing: '2px', marginBottom: 6 }}>ROOM CODE</div>
        <div style={{
          fontFamily: 'Cinzel, serif',
          fontSize: 40,
          letterSpacing: '10px',
          color: '#f4f4f5',
          textShadow: '0 0 24px rgba(179,18,63,0.4)',
        }}>
          {room.code}
        </div>
        <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 4 }}>Share this code with friends</div>
      </div>

      {/* Players */}
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 12, letterSpacing: '2px', color: '#a1a1aa', marginBottom: 16 }}>
          PLAYERS — {players.length}/20
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {players.map(p => (
            <div key={p.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: p.id === myPlayerId ? 'rgba(179,18,63,0.15)' : 'rgba(255,255,255,0.06)',
              border: p.id === myPlayerId ? '1px solid rgba(179,18,63,0.4)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 24,
              padding: '6px 14px',
              fontSize: 13,
              color: '#f4f4f5',
            }}>
              {p.is_host && <span style={{ color: '#b3123f', fontSize: 12 }}>◈</span>}
              {p.display_name}
              {p.is_bot && <span style={{ fontSize: 10, color: '#52525b', marginLeft: 2 }}>[bot]</span>}
              {p.id === myPlayerId && <span style={{ fontSize: 10, color: '#a1a1aa' }}>(you)</span>}
            </div>
          ))}
        </div>
        {players.length < 3 && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#a1a1aa' }}>
            Waiting for {3 - players.length} more player{3 - players.length !== 1 ? 's' : ''}…
          </div>
        )}
      </div>

      {/* Settings (host only) */}
      {isHost && (
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: '20px 24px',
          marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, letterSpacing: '2px', color: '#a1a1aa', marginBottom: 16 }}>
            GAME SETTINGS
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Souls to win */}
            <div>
              <label style={{ fontSize: 13, color: '#f4f4f5', display: 'block', marginBottom: 8 }}>
                Souls to Win
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <button
                    key={n}
                    onClick={() => onSettingsChange({ ...settings, souls_to_win: n })}
                    style={{
                      width: 40, height: 40,
                      borderRadius: 8,
                      border: settings.souls_to_win === n
                        ? '2px solid rgba(179,18,63,0.8)'
                        : '1px solid rgba(255,255,255,0.12)',
                      background: settings.souls_to_win === n
                        ? 'rgba(179,18,63,0.2)'
                        : 'rgba(255,255,255,0.04)',
                      color: '#f4f4f5',
                      fontSize: 14,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Omens toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                onClick={() => onSettingsChange({ ...settings, omens_enabled: !settings.omens_enabled })}
                style={{
                  width: 46, height: 26,
                  borderRadius: 13,
                  border: 'none',
                  background: settings.omens_enabled ? 'linear-gradient(135deg, #b3123f, #6d28d9)' : 'rgba(255,255,255,0.12)',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s',
                  flexShrink: 0,
                }}
              >
                <div style={{
                  width: 18, height: 18,
                  borderRadius: '50%',
                  background: '#f4f4f5',
                  position: 'absolute',
                  top: 4,
                  left: settings.omens_enabled ? 24 : 4,
                  transition: 'left 0.2s',
                }} />
              </button>
              <div>
                <div style={{ fontSize: 13, color: '#f4f4f5' }}>Omens</div>
                {settings.omens_enabled && (
                  <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 2 }}>
                    {OMEN_EXAMPLES.join(' · ')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Guest settings view */}
      {!isHost && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12,
          padding: '16px 24px',
          marginBottom: 20,
          display: 'flex',
          gap: 24,
          fontSize: 13,
          color: '#a1a1aa',
        }}>
          <span>🩸 {room.souls_to_win} souls to win</span>
          <span>{room.omens_enabled ? '✦ Omens enabled' : '○ No omens'}</span>
        </div>
      )}

      {/* Lobby expiry countdown */}
      {secsLeft !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: secsLeft < 60 ? 'rgba(179,18,63,0.08)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${secsLeft < 60 ? 'rgba(179,18,63,0.25)' : 'rgba(255,255,255,0.07)'}`,
          borderRadius: 10, padding: '10px 16px', fontSize: 12,
          color: secsLeft < 60 ? '#fb7185' : '#a1a1aa', marginBottom: 16,
        }}>
          <span>Lobby closes if no game starts</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
            {String(Math.floor(secsLeft / 60)).padStart(2, '0')}:{String(secsLeft % 60).padStart(2, '0')}
          </span>
        </div>
      )}

      {/* Fill Bots (admin only, host only, lobby not full) */}
      {user?.isAdmin && isHost && !canStart && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={handleFillBots}
            disabled={filling}
            style={{
              width: '100%',
              padding: '10px 20px',
              borderRadius: 10,
              border: '1px solid rgba(82,82,91,0.4)',
              background: 'rgba(255,255,255,0.03)',
              color: '#71717a',
              fontSize: 13,
              cursor: filling ? 'not-allowed' : 'pointer',
            }}
          >
            {filling ? 'Adding bots...' : `◈ Fill with Bots (${3 - players.length} needed)`}
          </button>
          {fillError && <div style={{ marginTop: 6, fontSize: 12, color: '#fb7185' }}>{fillError}</div>}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        {isHost && (
          <button
            onClick={handleStart}
            disabled={!canStart || starting}
            style={{
              padding: '12px 36px',
              borderRadius: 10,
              border: 'none',
              background: canStart
                ? 'linear-gradient(135deg, #b3123f, #6d28d9)'
                : 'rgba(255,255,255,0.08)',
              color: canStart ? '#f4f4f5' : '#a1a1aa',
              fontFamily: 'Cinzel, serif',
              fontSize: 14,
              letterSpacing: '1px',
              cursor: canStart ? 'pointer' : 'not-allowed',
              boxShadow: canStart ? '0 0 24px rgba(179,18,63,0.3)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            {starting ? 'Beginning...' : 'Begin the Ritual'}
          </button>
        )}
        <button
          onClick={onLeave}
          style={{
            padding: '12px 24px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent',
            color: '#a1a1aa',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Leave
        </button>
      </div>

      {!isHost && (
        <p style={{ textAlign: 'center', marginTop: 16, color: '#a1a1aa', fontSize: 12 }}>
          Waiting for the host to begin…
        </p>
      )}
    </div>
  )
}
