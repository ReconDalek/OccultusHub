import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

export default function CacheTab() {
  const [cacheStatus, setCacheStatus] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [analytics, setAnalytics] = useState(null)

  useEffect(() => {
    fetchCacheStatus()
    fetchAnalytics()
  }, [])

  const fetchCacheStatus = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/cache/status`, {
        headers: { Authorization: token },
      })
      const data = await res.json()
      setCacheStatus(data)
    } catch (err) {
      console.error('Failed to fetch cache status:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchAnalytics = async () => {
    try {
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/analytics`, {
        headers: { Authorization: token },
      })
      const data = await res.json()
      setAnalytics(data)
    } catch (err) {
      console.error('Failed to fetch analytics:', err)
    }
  }

  const refreshCache = async () => {
    try {
      setRefreshing(true)
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/cache/refresh`, {
        method: 'POST',
        headers: { Authorization: token },
      })
      if (res.ok) {
        fetchCacheStatus()
        setTimeout(() => setRefreshing(false), 1000)
      }
    } catch (err) {
      console.error('Failed to refresh cache:', err)
      setRefreshing(false)
    }
  }

  if (loading) {
    return <p style={{ color: '#a1a1aa' }}>Loading cache status...</p>
  }

  return (
    <div>
      <div className="mb-8">
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Analytics</h3>
        {analytics ? (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div
              className="p-4 rounded-lg"
              style={{
                background: 'rgba(179,18,63,0.1)',
                border: '1px solid rgba(179,18,63,0.3)',
              }}
            >
              <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>
                Total Users
              </p>
              <p style={{ color: '#ff2f6d', fontSize: '28px', fontWeight: 'bold' }}>
                {analytics.totalUsers}
              </p>
            </div>
            <div
              className="p-4 rounded-lg"
              style={{
                background: 'rgba(109,40,217,0.1)',
                border: '1px solid rgba(109,40,217,0.3)',
              }}
            >
              <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>
                Admins
              </p>
              <p style={{ color: '#9f67ff', fontSize: '28px', fontWeight: 'bold' }}>
                {analytics.totalAdmins}
              </p>
            </div>
            <div
              className="p-4 rounded-lg"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>
                Total Logins
              </p>
              <p style={{ color: '#f4f4f5', fontSize: '28px', fontWeight: 'bold' }}>
                {analytics.totalLogins}
              </p>
            </div>
            <div
              className="p-4 rounded-lg"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>
                Last 7 Days
              </p>
              <p style={{ color: '#f4f4f5', fontSize: '28px', fontWeight: 'bold' }}>
                {analytics.loginsLastWeek}
              </p>
            </div>
          </div>
        ) : (
          <p style={{ color: '#a1a1aa' }}>Failed to load analytics</p>
        )}
      </div>

      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Cache Management</h3>
        <button
          onClick={refreshCache}
          disabled={refreshing}
          className="px-6 py-3 rounded border-none cursor-pointer transition-all hover:opacity-80 font-medium"
          style={{
            background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
            color: '#f4f4f5',
            opacity: refreshing ? 0.5 : 1,
          }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh Cache'}
        </button>
        <p style={{ color: '#a1a1aa', marginTop: '12px', fontSize: '14px' }}>
          Force refresh faction and company data from external sources.
        </p>
      </div>
    </div>
  )
}
