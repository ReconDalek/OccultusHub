import { useState, useEffect } from 'react'
import { useSession } from '../hooks/useSession'
import { API_BASE_URL } from '../config/api'
import { OCCULTUS_CONFIG } from '../lib/config'

const DEFAULT_AVATAR = 'https://www.torn.com/images/profile_man.jpg'

const RARITY_COLORS = {
  common: '#94a3b8',
  uncommon: '#22c55e',
  rare: '#8b5cf6',
  legendary: '#fbbf24',
}

function getRankStyle(rank) {
  if (rank === 1) return { color: '#fbbf24', icon: '🥇' }
  if (rank === 2) return { color: '#e2e8f0', icon: '🥈' }
  if (rank === 3) return { color: '#cd7f32', icon: '🥉' }
  return { color: '#a1a1aa', icon: `#${rank}` }
}

export default function FishingLeaderboard({ open, onClose }) {
  const { user } = useSession()
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`${API_BASE_URL}/api/fishing/leaderboard`)
      .then(r => r.json())
      .then(d => setLeaderboard(d.leaderboard || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10001,
        background: 'rgba(0,0,0,0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: '100%', maxWidth: '520px',
          background: 'rgba(8,12,28,0.98)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            background: 'linear-gradient(135deg, rgba(29,78,216,0.3), rgba(109,40,217,0.3))',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontFamily: 'Cinzel, serif', letterSpacing: '2px' }}>
              🎣 FISHING LEADERBOARD
            </h2>
            <p style={{ margin: '4px 0 0', color: '#a1a1aa', fontSize: '12px' }}>
              Top anglers of the order
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#a1a1aa', borderRadius: '8px', padding: '6px 12px',
              cursor: 'pointer', fontSize: '13px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Legend */}
        <div style={{ padding: '10px 24px', display: 'flex', gap: '16px', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {Object.entries(RARITY_COLORS).map(([rarity, color]) => (
            <span key={rarity} style={{ fontSize: '11px', color, letterSpacing: '0.05em' }}>
              ● {rarity.charAt(0).toUpperCase() + rarity.slice(1)}
            </span>
          ))}
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#a1a1aa' }}>Loading...</div>
          ) : leaderboard.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#a1a1aa' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎣</div>
              <p>No catches yet. Be the first to reel one in!</p>
            </div>
          ) : (
            <div style={{ padding: '8px 0' }}>
              {leaderboard.map((entry, i) => {
                const rank = i + 1
                const rankStyle = getRankStyle(rank)
                const isMe = user && entry.torn_user_id === user.tornUserId
                const factionName = OCCULTUS_CONFIG.factionNames[Number(entry.faction_id)] || ''

                return (
                  <div
                    key={entry.torn_user_id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 24px',
                      background: isMe ? 'rgba(109,40,217,0.12)' : 'transparent',
                      borderLeft: isMe ? '3px solid #7c3aed' : '3px solid transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    {/* Rank */}
                    <div style={{ minWidth: '32px', textAlign: 'center', fontSize: rank <= 3 ? '20px' : '13px', color: rankStyle.color, fontWeight: 700 }}>
                      {rankStyle.icon}
                    </div>

                    {/* Avatar */}
                    <img
                      src={entry.image_url || DEFAULT_AVATAR}
                      alt=""
                      onError={e => (e.currentTarget.src = DEFAULT_AVATAR)}
                      style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.1)', flexShrink: 0 }}
                    />

                    {/* Name + faction */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {entry.username}
                        {isMe && <span style={{ fontSize: '10px', background: 'rgba(109,40,217,0.3)', color: '#a78bfa', padding: '1px 6px', borderRadius: '4px' }}>YOU</span>}
                      </div>
                      <div style={{ color: '#a1a1aa', fontSize: '11px' }}>
                        {factionName}{entry.total_catches > 0 && ` · ${entry.total_catches} catch${entry.total_catches !== 1 ? 'es' : ''}`}
                      </div>
                    </div>

                    {/* Points */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: '#fbbf24' }}>
                        {entry.fishing_points.toLocaleString()}
                      </div>
                      <div style={{ color: '#a1a1aa', fontSize: '11px' }}>pts</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
