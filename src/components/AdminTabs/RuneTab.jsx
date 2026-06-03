import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

export default function RuneTab() {
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [message, setMessage] = useState(null)

  function fetchLeaderboard() {
    setLoading(true)
    fetch(`${API_BASE_URL}/api/runes/leaderboard`)
      .then(r => r.json())
      .then(d => setLeaderboard(d.leaderboard || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchLeaderboard() }, [])

  async function resetLeaderboard() {
    if (!window.confirm('Reset all rune essence and clear the rune leaderboard? This cannot be undone.')) return
    setResetting(true)
    try {
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/runes/reset`, {
        method: 'POST', headers: { Authorization: token },
      })
      const data = await res.json()
      if (data.success) { setMessage({ type: 'success', text: 'Rune leaderboard reset.' }); setLeaderboard([]) }
      else setMessage({ type: 'error', text: data.error || 'Reset failed.' })
    } catch {
      setMessage({ type: 'error', text: 'Network error.' })
    } finally {
      setResetting(false)
    }
  }

  const totalCasts  = leaderboard.reduce((s, e) => s + (e.total_casts || 0), 0)
  const totalPoints = leaderboard.reduce((s, e) => s + (e.rune_points || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontFamily: 'Cinzel, serif', letterSpacing: '1px' }}>
            ᚠ Rune Casting Leaderboard
          </h3>
          <p style={{ margin: 0, color: '#a1a1aa', fontSize: '13px' }}>Manage the rune casting easter egg leaderboard</p>
        </div>
        <button
          onClick={resetLeaderboard} disabled={resetting}
          style={{
            padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
            background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.35)',
            color: '#f87171', cursor: resetting ? 'not-allowed' : 'pointer', opacity: resetting ? 0.6 : 1,
          }}
        >
          {resetting ? 'Resetting...' : '🗑 Reset Rune Leaderboard'}
        </button>
      </div>

      {message && (
        <div style={{
          marginBottom: '16px', padding: '10px 16px', borderRadius: '8px', fontSize: '13px',
          background: message.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          border: `1px solid ${message.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: message.type === 'success' ? '#86efac' : '#fca5a5',
        }}>{message.text}</div>
      )}

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[
          { label: 'Active Seers', value: leaderboard.length },
          { label: 'Total Casts', value: totalCasts },
          { label: 'Total Essence', value: totalPoints.toLocaleString() },
        ].map(s => (
          <div key={s.label} style={{
            flex: '1 1 120px', padding: '16px', borderRadius: '12px',
            background: 'rgba(109,40,217,0.06)', border: '1px solid rgba(109,40,217,0.15)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#fbbf24' }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#a1a1aa', textAlign: 'center', padding: '24px' }}>Consulting the runes...</div>
      ) : leaderboard.length === 0 ? (
        <div style={{ color: '#a1a1aa', textAlign: 'center', padding: '24px' }}>No rune data yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ color: '#a1a1aa', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>#</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Seer</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Casts</th>
                <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Essence</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, i) => (
                <tr key={entry.torn_user_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '10px 12px', color: i < 3 ? '#fbbf24' : '#a1a1aa' }}>{i + 1}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600 }}>{entry.username}</div>
                    <div style={{ color: '#a1a1aa', fontSize: '11px' }}>#{entry.torn_user_id}</div>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#a1a1aa' }}>{entry.total_casts}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#fbbf24', fontWeight: 700 }}>
                    {entry.rune_points.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
