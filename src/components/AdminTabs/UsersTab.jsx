import { useState, useEffect } from 'react'
import { useSession } from '../../hooks/useSession'
import { API_BASE_URL } from '../../config/api'
import { formatUTC } from '../../lib/dates'

const LEADERSHIP_POSITIONS = ['Leader', 'Co-leader', 'Archon', 'High Council', 'Council']

const DURATION_OPTIONS = [
  { label: '24 hours', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
  { label: '30 days', hours: 720 },
  { label: 'Indefinite (until revoked)', hours: null },
]

function getMemberBadge(u) {
  if (u.is_owner) return { label: 'Owner', bg: 'rgba(218,165,32,0.3)', color: '#daa520' }
  if (u.is_admin) return { label: 'Admin', bg: 'rgba(179,18,63,0.3)', color: '#ff2f6d' }
  if (LEADERSHIP_POSITIONS.includes(u.faction_position)) return { label: 'Leader', bg: 'rgba(139,92,246,0.3)', color: '#a78bfa' }
  return { label: 'Member', bg: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }
}

function overrideActive(u) {
  if (!u.access_override) return false
  if (!u.access_override_expires_at) return true
  return new Date(u.access_override_expires_at.replace(' ', 'T') + 'Z').getTime() > Date.now()
}

export default function UsersTab() {
  const { user: currentUser } = useSession()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [history, setHistory] = useState([])
  const [showingHistory, setShowingHistory] = useState(false)
  const [overrideModalUser, setOverrideModalUser] = useState(null)

  useEffect(() => {
    fetchUsers()
  }, [search])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('occultusSession')
      const params = search ? `?search=${search}` : ''
      const res = await fetch(`${API_BASE_URL}/api/admin/users${params}`, {
        headers: { Authorization: token },
      })
      const data = await res.json()
      setUsers(data.users || [])
    } catch (err) {
      console.error('Failed to fetch users:', err)
    } finally {
      setLoading(false)
    }
  }

  const grantAdmin = async (tornUserId) => {
    try {
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${tornUserId}/grant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
        },
        body: JSON.stringify({ reason: 'Granted via admin panel' }),
      })
      if (res.ok) {
        fetchUsers()
      }
    } catch (err) {
      console.error('Failed to grant admin:', err)
    }
  }

  const revokeAdmin = async (tornUserId) => {
    try {
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${tornUserId}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
        },
        body: JSON.stringify({ reason: 'Revoked via admin panel' }),
      })
      if (res.ok) {
        fetchUsers()
      }
    } catch (err) {
      console.error('Failed to revoke admin:', err)
    }
  }

  const revokeAccessOverride = async (tornUserId) => {
    try {
      const token = localStorage.getItem('occultusSession')
      await fetch(`${API_BASE_URL}/api/admin/users/${tornUserId}/access-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ level: null }),
      })
      fetchUsers()
    } catch (err) {
      console.error('Failed to revoke access override:', err)
    }
  }

  const viewHistory = async (user) => {
    try {
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${user.torn_user_id}/history`, {
        headers: { Authorization: token },
      })
      const data = await res.json()
      setSelectedUser(user)
      setHistory(data.logins || [])
      setShowingHistory(true)
    } catch (err) {
      console.error('Failed to fetch history:', err)
    }
  }

  if (showingHistory) {
    return (
      <div>
        <button
          onClick={() => setShowingHistory(false)}
          className="mb-4 px-4 py-2 rounded-lg border-none cursor-pointer transition-all hover:opacity-80"
          style={{ background: 'rgba(255,255,255,0.08)', color: '#f4f4f5' }}
        >
          ← Back to Users
        </button>

        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>
          Login History for {selectedUser?.username}
        </h3>

        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ textAlign: 'left', padding: '8px', color: "var(--text-secondary)" }}>
                  Login Time
                </th>
                <th style={{ textAlign: 'left', padding: '8px', color: "var(--text-secondary)" }}>
                  IP Address
                </th>
                <th style={{ textAlign: 'left', padding: '8px', color: "var(--text-secondary)" }}>
                  User Agent
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <td style={{ padding: '8px', color: '#f4f4f5' }}>
                    {formatUTC(entry.login_at)}
                  </td>
                  <td style={{ padding: '8px', color: "var(--text-secondary)" }}>
                    {entry.ip_address}
                  </td>
                  <td style={{ padding: '8px', color: "var(--text-secondary)", fontSize: '12px' }}>
                    {entry.user_agent?.substring(0, 50)}...
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search users by username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 rounded-lg border-none"
          style={{
            background: 'rgba(255,255,255,0.08)',
            color: '#f4f4f5',
          }}
        />
      </div>

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading users...</p>
      ) : (
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ textAlign: 'left', padding: '8px', color: "var(--text-secondary)" }}>Username</th>
                <th style={{ textAlign: 'left', padding: '8px', color: "var(--text-secondary)" }}>Torn ID</th>
                <th style={{ textAlign: 'left', padding: '8px', color: "var(--text-secondary)" }}>Faction</th>
                <th style={{ textAlign: 'left', padding: '8px', color: "var(--text-secondary)" }}>Position</th>
                <th style={{ textAlign: 'left', padding: '8px', color: "var(--text-secondary)" }}>Last Visit</th>
                <th style={{ textAlign: 'left', padding: '8px', color: "var(--text-secondary)" }}>Logins</th>
                <th style={{ textAlign: 'left', padding: '8px', color: "var(--text-secondary)" }}>Member</th>
                <th style={{ textAlign: 'left', padding: '8px', color: "var(--text-secondary)" }}>Temp Access</th>
                <th style={{ textAlign: 'left', padding: '8px', color: "var(--text-secondary)" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const badge = getMemberBadge(u)
                return (
                <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <td style={{ padding: '8px', color: '#f4f4f5' }}>{u.username}</td>
                  <td style={{ padding: '8px', color: "var(--text-secondary)" }}>{u.torn_user_id}</td>
                  <td style={{ padding: '8px', color: "var(--text-secondary)" }}>
                    {u.faction_name || (u.faction_id ? `[${u.faction_id}]` : '—')}
                  </td>
                  <td style={{ padding: '8px', color: "var(--text-secondary)" }}>
                    {u.faction_position || '—'}
                  </td>
                  <td style={{ padding: '8px', color: "var(--text-secondary)", fontSize: '13px' }}>
                    {u.last_login ? formatUTC(u.last_login) : '—'}
                  </td>
                  <td style={{ padding: '8px', color: "var(--text-secondary)" }}>{u.login_count}</td>
                  <td style={{ padding: '8px' }}>
                    <span style={{ padding: '4px 8px', borderRadius: '4px', background: badge.bg, color: badge.color, fontSize: '12px' }}>
                      {badge.label}
                    </span>
                  </td>
                  <td style={{ padding: '8px' }}>
                    {overrideActive(u) ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          padding: '4px 8px', borderRadius: '4px', fontSize: '12px',
                          background: u.access_override === 'leader' ? 'rgba(139,92,246,0.3)' : 'rgba(74,222,128,0.2)',
                          color: u.access_override === 'leader' ? '#a78bfa' : '#4ade80',
                        }}>
                          {u.access_override === 'leader' ? 'Leader' : 'Member'} · {u.access_override_expires_at ? `until ${formatUTC(u.access_override_expires_at)}` : 'indefinite'}
                        </span>
                        <button
                          onClick={() => revokeAccessOverride(u.torn_user_id)}
                          title="Revoke temporary access"
                          className="border-none cursor-pointer text-sm transition-all hover:opacity-80"
                          style={{ background: 'none', color: 'var(--text-faint)', fontSize: '14px', lineHeight: 1, padding: '2px 4px' }}
                        >✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setOverrideModalUser(u)}
                        className="px-3 py-1 rounded border-none cursor-pointer text-sm transition-all hover:opacity-80"
                        style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}
                      >
                        Grant Access
                      </button>
                    )}
                  </td>
                  <td style={{ padding: '8px' }}>
                    <button
                      onClick={() => viewHistory(u)}
                      className="px-3 py-1 rounded mr-2 border-none cursor-pointer text-sm transition-all hover:opacity-80"
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        color: '#f4f4f5',
                      }}
                    >
                      History
                    </button>
                    {currentUser?.isOwner && (
                      <>
                        {u.is_admin && u.torn_user_id !== currentUser?.tornUserId ? (
                          <button
                            onClick={() => revokeAdmin(u.torn_user_id)}
                            className="px-3 py-1 rounded border-none cursor-pointer text-sm transition-all hover:opacity-80"
                            style={{
                              background: 'rgba(255,0,0,0.2)',
                              color: '#ff6b6b',
                            }}
                          >
                            Revoke Admin
                          </button>
                        ) : !u.is_admin && !u.is_owner ? (
                          <button
                            onClick={() => grantAdmin(u.torn_user_id)}
                            className="px-3 py-1 rounded border-none cursor-pointer text-sm transition-all hover:opacity-80"
                            style={{
                              background: 'rgba(179,18,63,0.3)',
                              color: '#ff2f6d',
                            }}
                          >
                            Grant Admin
                          </button>
                        ) : null}
                      </>
                    )}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}

      {overrideModalUser && (
        <AccessOverrideModal
          user={overrideModalUser}
          onClose={() => setOverrideModalUser(null)}
          onSaved={() => { setOverrideModalUser(null); fetchUsers() }}
        />
      )}
    </div>
  )
}

// ─── Grant temporary access modal ──────────────────────────────────────────────

function AccessOverrideModal({ user, onClose, onSaved }) {
  const [level, setLevel] = useState('member')
  const [duration, setDuration] = useState(DURATION_OPTIONS[2]) // 7 days default
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)',
    color: '#f4f4f5', fontSize: '13px', boxSizing: 'border-box',
  }
  const labelStyle = { color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${user.torn_user_id}/access-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ level, durationHours: duration.hours, note: note || null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to grant access')
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', padding: '16px',
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#12121a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px',
        padding: '28px', width: '100%', maxWidth: '440px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ color: '#f4f4f5', fontFamily: 'Cinzel,serif', fontSize: '16px', letterSpacing: '1px', margin: 0 }}>
            Grant Temporary Access
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 16px' }}>
          Grants <strong style={{ color: '#f4f4f5' }}>{user.username}</strong> member or leader access regardless of their
          actual Torn faction — for members visiting another faction. Their API key is never used for faction data
          while this is active.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Access Level</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['member', 'leader'].map(l => (
                <button key={l} type="button" onClick={() => setLevel(l)}
                  style={{
                    flex: 1, padding: '8px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
                    border: `1px solid ${level === l ? '#a78bfa' : 'rgba(255,255,255,0.1)'}`,
                    background: level === l ? 'rgba(139,92,246,0.15)' : 'transparent',
                    color: level === l ? '#a78bfa' : 'var(--text-secondary)',
                    textTransform: 'capitalize',
                  }}
                >{l === 'leader' ? 'Member + Leader' : 'Member'}</button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Duration</label>
            <select
              value={duration.label}
              onChange={e => setDuration(DURATION_OPTIONS.find(d => d.label === e.target.value))}
              style={inputStyle}
            >
              {DURATION_OPTIONS.map(d => <option key={d.label} value={d.label}>{d.label}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Note (optional)</label>
            <input style={inputStyle} placeholder="e.g. Visiting from Occul2us"
              value={note} onChange={e => setNote(e.target.value)} />
          </div>

          {error && <p style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button type="button" onClick={onClose}
              style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', background: 'rgba(139,92,246,0.8)', color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: '13px', opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Granting…' : 'Grant Access'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
