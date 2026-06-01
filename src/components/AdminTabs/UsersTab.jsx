import { useState, useEffect } from 'react'
import { useSession } from '../../hooks/useSession'
import { API_BASE_URL } from '../../config/api'

export default function UsersTab() {
  const { user: currentUser } = useSession()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [history, setHistory] = useState([])
  const [showingHistory, setShowingHistory] = useState(false)

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
                <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>
                  Login Time
                </th>
                <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>
                  IP Address
                </th>
                <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>
                  User Agent
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <td style={{ padding: '8px', color: '#f4f4f5' }}>
                    {new Date(entry.login_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '8px', color: '#a1a1aa' }}>
                    {entry.ip_address}
                  </td>
                  <td style={{ padding: '8px', color: '#a1a1aa', fontSize: '12px' }}>
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
        <p style={{ color: '#a1a1aa' }}>Loading users...</p>
      ) : (
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>
                  Username
                </th>
                <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>
                  Torn ID
                </th>
                <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>
                  Faction
                </th>
                <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>
                  Logins
                </th>
                <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>
                  Status
                </th>
                <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <td style={{ padding: '8px', color: '#f4f4f5' }}>{u.username}</td>
                  <td style={{ padding: '8px', color: '#a1a1aa' }}>{u.torn_user_id}</td>
                  <td style={{ padding: '8px', color: '#a1a1aa' }}>
                    {u.faction_position || 'Visitor'}
                  </td>
                  <td style={{ padding: '8px', color: '#a1a1aa' }}>{u.login_count}</td>
                  <td style={{ padding: '8px' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        background: u.is_owner ? 'rgba(218,165,32,0.3)' : u.is_admin ? 'rgba(179,18,63,0.3)' : 'rgba(255,255,255,0.08)',
                        color: u.is_owner ? '#daa520' : u.is_admin ? '#ff2f6d' : '#a1a1aa',
                        fontSize: '12px',
                      }}
                    >
                      {u.is_owner ? 'Owner' : u.is_admin ? 'Admin' : 'User'}
                    </span>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
