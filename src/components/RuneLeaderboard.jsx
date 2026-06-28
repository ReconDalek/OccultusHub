import { useState, useEffect } from 'react'
import { useSession } from '../hooks/useSession'
import { API_BASE_URL } from '../config/api'
import { OCCULTUS_CONFIG } from '../lib/config'

const DEFAULT_AVATAR = 'https://www.torn.com/images/profile_man.jpg'

function getRankIcon(rank) {
  if (rank === 1) return { icon: 'ᛊ', color: '#fbbf24' }
  if (rank === 2) return { icon: 'ᛏ', color: '#e2e8f0' }
  if (rank === 3) return { icon: 'ᛚ', color: '#cd7f32' }
  return { icon: String(rank), color: '#6d28d9' }
}

export default function RuneLeaderboard({ open, onClose }) {
  const { user } = useSession()
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`${API_BASE_URL}/api/runes/leaderboard`)
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
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: '520px',
        background: 'rgba(6,3,18,0.98)',
        border: '1px solid rgba(109,40,217,0.25)',
        borderRadius: '20px', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, rgba(109,40,217,0.22), rgba(179,18,63,0.15))',
          borderBottom: '1px solid rgba(109,40,217,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontFamily: 'Cinzel, serif', letterSpacing: '3px', color: '#e9d5ff' }}>
              ᚠ THE RUNE SEERS
            </h2>
            <p style={{ margin: '4px 0 0', color: '#7c3aed', fontSize: '12px', letterSpacing: '0.1em' }}>
              Masters of the ancient casting
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(109,40,217,0.15)', border: '1px solid rgba(109,40,217,0.3)',
            color: '#a78bfa', borderRadius: '8px', padding: '6px 12px',
            cursor: 'pointer', fontSize: '13px',
          }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#7c3aed', fontSize: '13px', letterSpacing: '0.1em' }}>Reading the runes...</div>
          ) : leaderboard.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: "var(--text-secondary)" }}>
              <div style={{ fontSize: '40px', marginBottom: '12px', fontFamily: 'monospace', color: '#6d28d9' }}>ᚠ</div>
              <p style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', letterSpacing: '1px' }}>No runes have been cast yet.</p>
            </div>
          ) : (
            <div style={{ padding: '8px 0' }}>
              {leaderboard.map((entry, i) => {
                const rank = i + 1
                const rs = getRankIcon(rank)
                const isMe = user && entry.torn_user_id === user.tornUserId
                const factionName = OCCULTUS_CONFIG.factionNames[Number(entry.faction_id)] || ''
                return (
                  <div key={entry.torn_user_id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 24px',
                    background: isMe ? 'rgba(109,40,217,0.12)' : 'transparent',
                    borderLeft: isMe ? '3px solid #7c3aed' : '3px solid transparent',
                  }}>
                    <div style={{ minWidth: '32px', textAlign: 'center', fontSize: rank <= 3 ? '16px' : '13px', color: rs.color, fontFamily: 'monospace', fontWeight: 700 }}>
                      {rs.icon}
                    </div>
                    <img src={entry.image_url || DEFAULT_AVATAR} alt="" onError={e => (e.currentTarget.src = DEFAULT_AVATAR)}
                      style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(109,40,217,0.3)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {entry.username}
                        {isMe && <span style={{ fontSize: '10px', background: 'rgba(109,40,217,0.3)', color: '#a78bfa', padding: '1px 6px', borderRadius: '4px' }}>YOU</span>}
                      </div>
                      <div style={{ color: '#6d28d9', fontSize: '11px' }}>
                        {factionName}{entry.total_casts > 0 && ` · ${entry.total_casts} cast${entry.total_casts !== 1 ? 's' : ''}`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: '#fbbf24', fontFamily: 'Cinzel, serif' }}>
                        {entry.rune_points.toLocaleString()}
                      </div>
                      <div style={{ color: '#6d28d9', fontSize: '11px' }}>essence</div>
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
