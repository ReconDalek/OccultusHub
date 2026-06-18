import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

const BOARDS = [
  { id: 'fishing',  label: 'Void Scrying' },
  { id: 'runes',    label: 'Rune Casting' },
  { id: 'sanctum',  label: 'The Sanctum' },
]

export default function LeaderboardsTab() {
  const [activeBoard, setActiveBoard] = useState('fishing')

  const subTabStyle = (id) => ({
    padding: '8px 18px',
    fontWeight: '500',
    border: 'none',
    cursor: 'pointer',
    background: 'transparent',
    color: activeBoard === id ? '#f4f4f5' : '#a1a1aa',
    borderBottom: activeBoard === id ? '2px solid #b3123f' : '2px solid transparent',
    fontSize: '13px',
    whiteSpace: 'nowrap',
    transition: 'color 0.15s',
  })

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontFamily: 'Cinzel, serif', letterSpacing: '1px' }}>
          Leaderboards
        </h3>
        <p style={{ margin: 0, color: '#a1a1aa', fontSize: '13px' }}>Manage and reset game leaderboards</p>
      </div>

      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '24px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        <div style={{ display: 'flex', minWidth: 'max-content' }}>
          {BOARDS.map(b => (
            <button
              key={b.id}
              onClick={() => setActiveBoard(b.id)}
              style={subTabStyle(b.id)}
              onMouseEnter={e => { if (activeBoard !== b.id) e.currentTarget.style.color = '#f4f4f5' }}
              onMouseLeave={e => { if (activeBoard !== b.id) e.currentTarget.style.color = '#a1a1aa' }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {activeBoard === 'fishing' && <FishingBoard />}
      {activeBoard === 'runes'   && <RuneBoard />}
      {activeBoard === 'sanctum' && <SanctumBoard />}
    </div>
  )
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function StatCards({ stats }) {
  return (
    <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
      {stats.map(s => (
        <div key={s.label} style={{
          flex: '1 1 120px', padding: '16px', borderRadius: '12px',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '22px', fontWeight: 800, color: s.color || '#fbbf24' }}>{s.value}</div>
          <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px', letterSpacing: '0.05em' }}>{s.label}</div>
        </div>
      ))}
    </div>
  )
}

function StatusMessage({ message }) {
  if (!message) return null
  return (
    <div style={{
      marginBottom: '16px', padding: '10px 16px', borderRadius: '8px', fontSize: '13px',
      background: message.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
      border: `1px solid ${message.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
      color: message.type === 'success' ? '#86efac' : '#fca5a5',
    }}>
      {message.text}
    </div>
  )
}

function ResetButton({ onClick, disabled, label }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
      background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.35)',
      color: '#f87171', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
    }}>
      {label}
    </button>
  )
}

function ToggleButton({ onClick, disabled, enabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
      background: enabled ? 'rgba(34,197,94,0.15)' : 'rgba(109,40,217,0.15)',
      border: `1px solid ${enabled ? 'rgba(34,197,94,0.35)' : 'rgba(109,40,217,0.35)'}`,
      color: enabled ? '#86efac' : '#a78bfa',
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
    }}>
      {disabled ? '...' : enabled ? 'Enabled' : 'Disabled'}
    </button>
  )
}

function LeaderTable({ loading, rows, columns }) {
  if (loading) return <div style={{ color: '#a1a1aa', textAlign: 'center', padding: '24px' }}>Loading...</div>
  if (!rows.length) return <div style={{ color: '#a1a1aa', textAlign: 'center', padding: '24px' }}>No data yet.</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ color: '#a1a1aa', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>#</th>
            {columns.map(c => (
              <th key={c.key} style={{ padding: '8px 12px', fontWeight: 600, textAlign: c.align || 'left' }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: '10px 12px', color: i < 3 ? '#fbbf24' : '#a1a1aa' }}>{i + 1}</td>
              {columns.map(c => (
                <td key={c.key} style={{ padding: '10px 12px', textAlign: c.align || 'left', ...(c.style?.(row, i) || {}) }}>
                  {c.render ? c.render(row, i) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Void Scrying board ─────────────────────────────────────────────────────────

function FishingBoard() {
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [message, setMessage] = useState(null)

  function fetch_() {
    setLoading(true)
    fetch(`${API_BASE_URL}/api/fishing/leaderboard`)
      .then(r => r.json())
      .then(d => setLeaderboard(d.leaderboard || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetch_()
    fetch(`${API_BASE_URL}/api/settings/public`).then(r => r.json()).then(d => setEnabled(d?.fishing_enabled !== '0')).catch(() => {})
  }, [])

  async function toggleEnabled() {
    setToggling(true)
    try {
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/settings/fishing_enabled`, {
        method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: enabled ? '0' : '1' }),
      })
      const data = await res.json()
      if (data.success) { setEnabled(e => !e); setMessage({ type: 'success', text: `Scrying the Abyss ${enabled ? 'disabled' : 'enabled'}.` }) }
      else setMessage({ type: 'error', text: data.error || 'Failed.' })
    } catch { setMessage({ type: 'error', text: 'Network error.' }) }
    finally { setToggling(false) }
  }

  async function reset() {
    if (!confirm('Reset all void essence and clear the scrying leaderboard? This cannot be undone.')) return
    setResetting(true)
    try {
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/fishing/reset`, { method: 'POST', headers: { Authorization: token } })
      const data = await res.json()
      if (data.success) { setMessage({ type: 'success', text: 'Leaderboard reset.' }); setLeaderboard([]) }
      else setMessage({ type: 'error', text: data.error || 'Reset failed.' })
    } catch { setMessage({ type: 'error', text: 'Network error.' }) }
    finally { setResetting(false) }
  }

  const totalBindings = leaderboard.reduce((s, e) => s + (e.total_catches || 0), 0)
  const totalPoints   = leaderboard.reduce((s, e) => s + (e.fishing_points || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <ToggleButton onClick={toggleEnabled} disabled={toggling} enabled={enabled} />
        <ResetButton onClick={reset} disabled={resetting} label={resetting ? 'Resetting...' : 'Reset Leaderboard'} />
      </div>
      <StatusMessage message={message} />
      <StatCards stats={[
        { label: 'Active Scriers', value: leaderboard.length },
        { label: 'Total Bindings', value: totalBindings },
        { label: 'Total Essence', value: totalPoints.toLocaleString() },
      ]} />
      <LeaderTable loading={loading} rows={leaderboard} columns={[
        { key: 'username', label: 'Scrier', render: (r) => (
          <><div style={{ fontWeight: 600 }}>{r.username}</div><div style={{ color: '#a1a1aa', fontSize: '11px' }}>#{r.torn_user_id}</div></>
        )},
        { key: 'total_catches', label: 'Bindings', style: () => ({ color: '#a1a1aa' }) },
        { key: 'fishing_points', label: 'Essence', align: 'right', style: () => ({ color: '#fbbf24', fontWeight: 700 }), render: (r) => r.fishing_points.toLocaleString() },
      ]} />
    </div>
  )
}

// ── Rune Casting board ─────────────────────────────────────────────────────────

function RuneBoard() {
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [message, setMessage] = useState(null)

  function fetch_() {
    setLoading(true)
    fetch(`${API_BASE_URL}/api/runes/leaderboard`)
      .then(r => r.json())
      .then(d => setLeaderboard(d.leaderboard || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetch_()
    fetch(`${API_BASE_URL}/api/settings/public`).then(r => r.json()).then(d => setEnabled(d?.runes_enabled !== '0')).catch(() => {})
  }, [])

  async function toggleEnabled() {
    setToggling(true)
    try {
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/settings/runes_enabled`, {
        method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: enabled ? '0' : '1' }),
      })
      const data = await res.json()
      if (data.success) { setEnabled(e => !e); setMessage({ type: 'success', text: `Rune Casting ${enabled ? 'disabled' : 'enabled'}.` }) }
      else setMessage({ type: 'error', text: data.error || 'Failed.' })
    } catch { setMessage({ type: 'error', text: 'Network error.' }) }
    finally { setToggling(false) }
  }

  async function reset() {
    if (!confirm('Reset all rune essence and clear the rune leaderboard? This cannot be undone.')) return
    setResetting(true)
    try {
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/runes/reset`, { method: 'POST', headers: { Authorization: token } })
      const data = await res.json()
      if (data.success) { setMessage({ type: 'success', text: 'Leaderboard reset.' }); setLeaderboard([]) }
      else setMessage({ type: 'error', text: data.error || 'Reset failed.' })
    } catch { setMessage({ type: 'error', text: 'Network error.' }) }
    finally { setResetting(false) }
  }

  const totalCasts  = leaderboard.reduce((s, e) => s + (e.total_casts || 0), 0)
  const totalPoints = leaderboard.reduce((s, e) => s + (e.rune_points || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <ToggleButton onClick={toggleEnabled} disabled={toggling} enabled={enabled} />
        <ResetButton onClick={reset} disabled={resetting} label={resetting ? 'Resetting...' : 'Reset Leaderboard'} />
      </div>
      <StatusMessage message={message} />
      <StatCards stats={[
        { label: 'Active Casters', value: leaderboard.length },
        { label: 'Total Casts', value: totalCasts },
        { label: 'Total Essence', value: totalPoints.toLocaleString() },
      ]} />
      <LeaderTable loading={loading} rows={leaderboard} columns={[
        { key: 'username', label: 'Caster', render: (r) => (
          <><div style={{ fontWeight: 600 }}>{r.username}</div><div style={{ color: '#a1a1aa', fontSize: '11px' }}>#{r.torn_user_id}</div></>
        )},
        { key: 'total_casts', label: 'Casts', style: () => ({ color: '#a1a1aa' }) },
        { key: 'rune_points', label: 'Essence', align: 'right', style: () => ({ color: '#a78bfa', fontWeight: 700 }), render: (r) => r.rune_points.toLocaleString() },
      ]} />
    </div>
  )
}

// ── Sanctum board ──────────────────────────────────────────────────────────────

function SanctumBoard() {
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [message, setMessage] = useState(null)

  function fetch_() {
    setLoading(true)
    fetch(`${API_BASE_URL}/api/sanctum/leaderboard`)
      .then(r => r.json())
      .then(d => setLeaderboard(d.leaderboard || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetch_() }, [])

  async function reset() {
    if (!confirm('Reset all Sanctum saves and clear the leaderboard? This cannot be undone.')) return
    setResetting(true)
    try {
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/sanctum/reset`, { method: 'POST', headers: { Authorization: token } })
      const data = await res.json()
      if (data.success) { setMessage({ type: 'success', text: 'Sanctum leaderboard reset.' }); setLeaderboard([]) }
      else setMessage({ type: 'error', text: data.error || 'Reset failed.' })
    } catch { setMessage({ type: 'error', text: 'Network error.' }) }
    finally { setResetting(false) }
  }

  const totalEssence = leaderboard.reduce((s, e) => s + (e.total_essence || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '20px' }}>
        <ResetButton onClick={reset} disabled={resetting} label={resetting ? 'Resetting...' : 'Reset Leaderboard'} />
      </div>
      <StatusMessage message={message} />
      <StatCards stats={[
        { label: 'Players', value: leaderboard.length },
        { label: 'Total Essence', value: totalEssence.toLocaleString(), color: '#9f67ff' },
      ]} />
      <LeaderTable loading={loading} rows={leaderboard} columns={[
        { key: 'username', label: 'Acolyte', render: (r) => (
          <div style={{ fontWeight: 600 }}>{r.username}</div>
        )},
        { key: 'total_essence', label: 'Essence', align: 'right', style: () => ({ color: '#9f67ff', fontWeight: 700 }), render: (r) => r.total_essence.toLocaleString() },
      ]} />
    </div>
  )
}
