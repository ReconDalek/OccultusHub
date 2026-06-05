import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'
import { timeAgo, formatUTC } from '../../lib/dates'

const FACTION_NAMES = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' }
const FACTION_IDS = [33097, 9728, 9171]

export default function CacheTab() {
  const [cacheStatus,  setCacheStatus]  = useState(null)
  const [chainStatus,  setChainStatus]  = useState(null)
  const [memberStatus, setMemberStatus] = useState(null)
  const [analytics,    setAnalytics]    = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [refreshing,   setRefreshing]   = useState(null) // 'all' | 'factions' | 'companies' | 'chains' | 'members'
  const [lastResult,   setLastResult]   = useState(null)
  const [error,        setError]        = useState(null)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const token = localStorage.getItem('occultusSession')
    await Promise.all([
      fetch(`${API_BASE_URL}/api/admin/cache/status`, { headers: { Authorization: token } })
        .then((r) => r.json()).then(setCacheStatus).catch(console.error),
      fetch(`${API_BASE_URL}/api/admin/analytics`, { headers: { Authorization: token } })
        .then((r) => r.json()).then(setAnalytics).catch(console.error),
      fetch(`${API_BASE_URL}/api/admin/chains/status`, { headers: { Authorization: token } })
        .then((r) => r.json()).then((d) => setChainStatus(d.status)).catch(console.error),
      fetch(`${API_BASE_URL}/api/admin/members/status`, { headers: { Authorization: token } })
        .then((r) => r.json()).then(setMemberStatus).catch(console.error),
    ])
    setLoading(false)
  }

  const refreshChainCache = async () => {
    try {
      setRefreshing('chains')
      setError(null)
      setLastResult(null)
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/chains/refresh`, {
        method: 'POST',
        headers: { Authorization: token },
      })
      const data = await res.json()
      if (res.ok) {
        setLastResult(data)
        // Re-fetch chain status to update counts
        fetch(`${API_BASE_URL}/api/admin/chains/status`, { headers: { Authorization: token } })
          .then((r) => r.json())
          .then((d) => setChainStatus(d.status))
          .catch(console.error)
      } else {
        setError(data.error || `Error ${res.status}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(null)
    }
  }

  const syncMembers = async () => {
    try {
      setRefreshing('members')
      setError(null)
      setLastResult(null)
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/members/sync`, {
        method: 'POST',
        headers: { Authorization: token },
      })
      const data = await res.json()
      if (res.ok) {
        setLastResult(data)
        fetch(`${API_BASE_URL}/api/admin/members/status`, { headers: { Authorization: token } })
          .then((r) => r.json()).then(setMemberStatus).catch(console.error)
      } else {
        setError(data.error || `Error ${res.status}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(null)
    }
  }

  const refreshCache = async (scope) => {
    try {
      setRefreshing(scope)
      setError(null)
      setLastResult(null)
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/cache/refresh?scope=${scope}`, {
        method: 'POST',
        headers: { Authorization: token },
      })
      const data = await res.json()
      if (res.ok) {
        setLastResult(data)
        // Re-fetch cache status to update counts
        fetch(`${API_BASE_URL}/api/admin/cache/status`, { headers: { Authorization: token } })
          .then((r) => r.json())
          .then(setCacheStatus)
          .catch(console.error)
      } else {
        setError(data.error || `Error ${res.status}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(null)
    }
  }

  if (loading) return <p style={{ color: '#a1a1aa' }}>Loading cache status...</p>

  return (
    <div className="space-y-8">
      {/* Analytics */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Analytics</h3>
        {analytics ? (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {[
              { label: 'Total Users',  value: analytics.totalUsers,    color: '#ff2f6d', bg: 'rgba(179,18,63,0.1)',    border: 'rgba(179,18,63,0.3)' },
              { label: 'Admins',       value: analytics.totalAdmins,   color: '#9f67ff', bg: 'rgba(109,40,217,0.1)',   border: 'rgba(109,40,217,0.3)' },
              { label: 'Total Logins', value: analytics.totalLogins,   color: '#f4f4f5', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)' },
              { label: 'Last 7 Days',  value: analytics.loginsLastWeek,color: '#f4f4f5', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)' },
            ].map(({ label, value, color, bg, border }) => (
              <div key={label} className="p-4 rounded-lg" style={{ background: bg, border: `1px solid ${border}` }}>
                <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>{label}</p>
                <p style={{ color, fontSize: '28px', fontWeight: 'bold' }}>{value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#a1a1aa' }}>Failed to load analytics</p>
        )}
      </div>

      {/* Cache status */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Cache Status</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {[
            { key: 'factions',  label: 'Factions',  icon: '⚔️' },
            { key: 'companies', label: 'Companies', icon: '🏢' },
          ].map(({ key, label, icon }) => {
            const info = cacheStatus?.[key]
            return (
              <div
                key={key}
                className="p-5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ fontSize: '20px' }}>{icon}</span>
                  <span style={{ color: '#f4f4f5', fontWeight: 'bold' }}>{label}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span style={{ color: '#a1a1aa', fontSize: '13px' }}>Cached entries</span>
                  <span style={{ color: '#f4f4f5', fontSize: '13px' }}>{info?.count ?? '—'}</span>
                </div>
                <div className="flex justify-between mb-4">
                  <span style={{ color: '#a1a1aa', fontSize: '13px' }}>Last updated</span>
                  <span
                    style={{ color: '#a1a1aa', fontSize: '13px' }}
                    title={info?.lastUpdated ?? ''}
                  >
                    {timeAgo(info?.lastUpdated)}
                  </span>
                </div>
                <button
                  onClick={() => refreshCache(key)}
                  disabled={!!refreshing}
                  className="w-full py-2 rounded border-none cursor-pointer transition-all hover:opacity-80 text-sm font-medium"
                  style={{
                    background: 'rgba(179,18,63,0.2)',
                    color: '#ff2f6d',
                    opacity: refreshing ? 0.5 : 1,
                  }}
                >
                  {refreshing === key ? 'Refreshing...' : `Refresh ${label}`}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Chain cache status */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>⛓ Chain History Cache</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {FACTION_IDS.map((fid) => {
            const info = chainStatus?.[fid]
            return (
              <div
                key={fid}
                className="p-5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ fontSize: '18px' }}>⛓</span>
                  <span style={{ color: '#f4f4f5', fontWeight: 'bold' }}>{FACTION_NAMES[fid]}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span style={{ color: '#a1a1aa', fontSize: '13px' }}>Stored chains</span>
                  <span style={{ color: '#f4f4f5', fontSize: '13px' }}>{info?.totalChains ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: '#a1a1aa', fontSize: '13px' }}>Last updated</span>
                  <span style={{ color: '#a1a1aa', fontSize: '13px' }} title={info?.lastFetched ?? ''}>
                    {info?.lastFetched ? timeAgo(info.lastFetched) : '—'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <button
            onClick={refreshChainCache}
            disabled={!!refreshing}
            className="px-5 py-2 rounded border-none cursor-pointer transition-all hover:opacity-80 text-sm font-medium"
            style={{
              background: 'rgba(179,18,63,0.2)',
              color: '#ff2f6d',
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            {refreshing === 'chains' ? 'Refreshing…' : 'Refresh Chain Cache'}
          </button>
          <p style={{ color: '#a1a1aa', fontSize: '12px', margin: 0 }}>
            Auto-refreshes every Monday 09:00 UTC — only new chains are added.
          </p>
        </div>
      </div>

      {/* Member database status */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>⚔️ Member Database</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {[
            { label: 'Total Members',   value: memberStatus?.totalMembers  ?? '—', color: '#f4f4f5' },
            { label: 'Currently Active',value: memberStatus?.activeMembers ?? '—', color: '#4ade80' },
            { label: 'Departed',        value: memberStatus
                ? (memberStatus.totalMembers - memberStatus.activeMembers)
                : '—',                                                               color: '#a1a1aa' },
          ].map(({ label, value, color }) => (
            <div key={label} className="p-4 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>{label}</p>
              <p style={{ color, fontSize: '24px', fontWeight: 'bold' }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Per-faction breakdown */}
        {memberStatus?.factionBreakdown && (
          <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            {FACTION_IDS.map((fid) => {
              const fb = memberStatus.factionBreakdown[fid] || { total: 0, active: 0 }
              return (
                <div key={fid} className="p-3 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <p style={{ color: '#a1a1aa', fontSize: '11px', marginBottom: '3px' }}>{FACTION_NAMES[fid]}</p>
                  <p style={{ color: '#f4f4f5', fontSize: '13px', margin: 0 }}>
                    <span style={{ color: '#4ade80', fontWeight: '600' }}>{fb.active}</span>
                    <span style={{ color: '#a1a1aa' }}> / {fb.total}</span>
                    <span style={{ color: '#a1a1aa', fontSize: '11px' }}> active</span>
                  </p>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <button
            onClick={syncMembers}
            disabled={!!refreshing}
            className="px-5 py-2 rounded border-none cursor-pointer transition-all hover:opacity-80 text-sm font-medium"
            style={{
              background: 'rgba(179,18,63,0.2)',
              color: '#ff2f6d',
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            {refreshing === 'members' ? 'Syncing…' : 'Sync Member Database'}
          </button>
          <div>
            <p style={{ color: '#a1a1aa', fontSize: '12px', margin: 0 }}>
              Auto-syncs every 12 hours after faction cache refresh.
            </p>
            {memberStatus?.lastSynced && (
              <p style={{ color: '#a1a1aa', fontSize: '11px', margin: '2px 0 0 0' }}>
                Last synced: {timeAgo(memberStatus.lastSynced)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Refresh all */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '12px' }}>Refresh All</h3>
        <button
          onClick={() => refreshCache('all')}
          disabled={!!refreshing}
          className="px-6 py-3 rounded border-none cursor-pointer transition-all hover:opacity-80 font-medium"
          style={{
            background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
            color: '#f4f4f5',
            opacity: refreshing ? 0.5 : 1,
          }}
        >
          {refreshing === 'all' ? 'Refreshing...' : 'Refresh All Caches'}
        </button>
        <p style={{ color: '#a1a1aa', marginTop: '8px', fontSize: '13px' }}>
          Force refresh all faction and company data from the Torn API.
        </p>
      </div>

      {/* Last result */}
      {lastResult && (
        <div
          className="p-4 rounded-lg"
          style={{ background: 'rgba(109,40,217,0.1)', border: '1px solid rgba(109,40,217,0.3)' }}
        >
          <p style={{ color: '#9f67ff', fontSize: '13px', marginBottom: '4px', fontWeight: 'bold' }}>
            {lastResult.message}
          </p>
          <p style={{ color: '#a1a1aa', fontSize: '12px' }}>
            {formatUTC(lastResult.refreshedAt)}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="p-4 rounded-lg"
          style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.3)' }}
        >
          <p style={{ color: '#ff6b6b', fontSize: '13px' }}>{error}</p>
        </div>
      )}
    </div>
  )
}
