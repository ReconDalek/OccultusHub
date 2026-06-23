import { useState, useEffect, useRef } from 'react'
import { API_BASE_URL } from '../../config/api'
import { timeAgo, formatUTC } from '../../lib/dates'

const FACTION_NAMES = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' }
const FACTION_IDS = [33097, 9728, 9171]

export default function CacheTab() {
  const [cacheStatus,         setCacheStatus]         = useState(null)
  const [chainStatus,         setChainStatus]         = useState(null)
  const [memberStatus,        setMemberStatus]        = useState(null)
  const [analytics,           setAnalytics]           = useState(null)
  const [personalStatsStatus, setPersonalStatsStatus] = useState(null)
  const [armoryStatus,        setArmoryStatus]        = useState(null)
  const [itemPricesStatus,    setItemPricesStatus]    = useState(null)
  const [loading,             setLoading]             = useState(true)
  const [refreshing,          setRefreshing]          = useState(null)
  const [lastResult,          setLastResult]          = useState(null)
  const [error,               setError]               = useState(null)
  const [snapshotRunning,     setSnapshotRunning]     = useState(false)
  const pollRef = useRef(null)

  useEffect(() => { fetchAll() }, [])

  // Poll personal stats status every 3s while snapshot is running
  useEffect(() => {
    if (!snapshotRunning) { clearInterval(pollRef.current); return }
    const token = localStorage.getItem('occultusSession')
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/personal-stats/status`, { headers: { Authorization: token } })
        const data = await res.json()
        setPersonalStatsStatus(data)
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(pollRef.current)
  }, [snapshotRunning])

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
      fetch(`${API_BASE_URL}/api/admin/personal-stats/status`, { headers: { Authorization: token } })
        .then((r) => r.json()).then(setPersonalStatsStatus).catch(console.error),
      fetch(`${API_BASE_URL}/api/admin/armory/status`, { headers: { Authorization: token } })
        .then((r) => r.json()).then((d) => setArmoryStatus(d.status)).catch(console.error),
      fetch(`${API_BASE_URL}/api/admin/item-prices/status`, { headers: { Authorization: token } })
        .then((r) => r.json()).then(setItemPricesStatus).catch(console.error),
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

  const refreshArmory = async () => {
    try {
      setRefreshing('armory')
      setError(null)
      setLastResult(null)
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/armory/refresh`, {
        method: 'POST',
        headers: { Authorization: token },
      })
      const data = await res.json()
      if (res.ok) {
        setLastResult(data)
        fetch(`${API_BASE_URL}/api/admin/armory/status`, { headers: { Authorization: token } })
          .then((r) => r.json()).then((d) => setArmoryStatus(d.status)).catch(console.error)
      } else {
        setError(data.error || `Error ${res.status}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(null)
    }
  }

  const refreshItemPrices = async () => {
    try {
      setRefreshing('item-prices')
      setError(null)
      setLastResult(null)
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/item-prices/refresh`, {
        method: 'POST',
        headers: { Authorization: token },
      })
      const data = await res.json()
      if (res.ok) {
        setLastResult(data)
        fetch(`${API_BASE_URL}/api/admin/item-prices/status`, { headers: { Authorization: token } })
          .then((r) => r.json()).then(setItemPricesStatus).catch(console.error)
      } else {
        setError(data.error || `Error ${res.status}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(null)
    }
  }

  const runPersonalStatsSnapshot = async () => {
    setError(null)
    setLastResult(null)
    setSnapshotRunning(true) // start polling immediately — POST won't return until all members done
    try {
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/personal-stats/snapshot`, {
        method: 'POST',
        headers: { Authorization: token },
      })
      const data = await res.json()
      if (res.ok) {
        setLastResult(data)
        // Refresh status one final time to show accurate totals
        fetch(`${API_BASE_URL}/api/admin/personal-stats/status`, { headers: { Authorization: token } })
          .then(r => r.json()).then(setPersonalStatsStatus).catch(console.error)
      } else {
        setError(data.error || `Error ${res.status}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSnapshotRunning(false)
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
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>General</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {[
            { key: 'factions',  label: 'Factions',  icon: '' },
            { key: 'companies', label: 'Companies', icon: '' },
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
        <p style={{ color: '#a1a1aa', fontSize: '12px', margin: 0 }}>
            Auto-refreshes daily at 00:00 and 12:00 UTC/TCT.
          </p>
      </div>

      {/* Chain cache status */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Chains</h3>
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
                  <span style={{ fontSize: '18px' }}></span>
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
            Auto-refreshes every Tuesday 01:00 UTC/TCT.
          </p>
        </div>
      </div>

      {/* Member database status */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Members</h3>
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

      {/* Personal stats snapshots */}
      {/*<div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Personal Stats</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {[
            { label: 'Members Tracked', value: personalStatsStatus?.members ?? '—', color: '#f4f4f5' },
            { label: 'Days of History',  value: personalStatsStatus?.days    ?? '—', color: '#22d3ee' },
          ].map(({ label, value, color }) => (
            <div key={label} className="p-4 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>{label}</p>
              <p style={{ color, fontSize: '24px', fontWeight: 'bold' }}>{value}</p>
            </div>
          ))}
          {personalStatsStatus?.earliest && (
            <div className="p-4 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Date Range</p>
              <p style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '600', lineHeight: '1.6' }}>
                {personalStatsStatus.earliest}<br />
                <span style={{ color: '#a1a1aa' }}>to</span> {personalStatsStatus.latest}
              </p>
            </div>
          )}
        </div>
/*}
        {/* Live progress bar while snapshot is running */}
        {/*
        {snapshotRunning && personalStatsStatus && (
          <div style={{ marginTop: '14px', padding: '12px 16px', borderRadius: '10px', background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: '#22d3ee', fontSize: '13px', fontWeight: 600 }}>Snapshot in progress…</span>
              <span style={{ color: '#22d3ee', fontSize: '13px' }}>
                {personalStatsStatus.today} / {personalStatsStatus.members || '?'} members today
              </span>
            </div>
            <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: personalStatsStatus.members
                  ? `${Math.min(100, Math.round((personalStatsStatus.today / personalStatsStatus.members) * 100))}%`
                  : '0%',
                background: 'linear-gradient(90deg, #22d3ee, #6d28d9)',
                borderRadius: '2px',
                transition: 'width 0.6s ease',
              }} />
            </div>
          </div>
        )}

        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <button
            onClick={runPersonalStatsSnapshot}
            disabled={snapshotRunning}
            className="px-5 py-2 rounded border-none cursor-pointer transition-all hover:opacity-80 text-sm font-medium"
            style={{
              background: 'rgba(179,18,63,0.2)',
              color: '#ff2f6d',
              opacity: snapshotRunning ? 0.5 : 1,
            }}
          >
            {snapshotRunning ? 'Running…' : 'Run Snapshot Now'}
          </button>
          <div>
            <p style={{ color: '#a1a1aa', fontSize: '12px', margin: 0 }}>
              Auto-runs daily at 01:00 UTC/TCT — may take 3–5 minutes.
            </p>
            {personalStatsStatus?.today > 0 && !snapshotRunning && (
              <p style={{ color: '#a1a1aa', fontSize: '11px', margin: '2px 0 0 0' }}>
                {personalStatsStatus.today} members snapshotted for {personalStatsStatus.today_date}
              </p>
            )}
          </div>
        </div>
      </div>
      /*}

      {/* Armory cache status */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Armory</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {FACTION_IDS.map((fid) => {
            const info = armoryStatus?.[fid]
            return (
              <div
                key={fid}
                className="p-5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ fontSize: '18px' }}>🛡️</span>
                  <span style={{ color: '#f4f4f5', fontWeight: 'bold' }}>{FACTION_NAMES[fid]}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: '#a1a1aa', fontSize: '13px' }}>Last updated</span>
                  <span style={{ color: '#a1a1aa', fontSize: '13px' }} title={info?.fetched_at ?? ''}>
                    {info?.fetched_at ? timeAgo(info.fetched_at) : '—'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <button
            onClick={refreshArmory}
            disabled={!!refreshing}
            className="px-5 py-2 rounded border-none cursor-pointer transition-all hover:opacity-80 text-sm font-medium"
            style={{
              background: 'rgba(179,18,63,0.2)',
              color: '#ff2f6d',
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            {refreshing === 'armory' ? 'Refreshing…' : 'Refresh Armory Cache'}
          </button>
          <p style={{ color: '#a1a1aa', fontSize: '12px', margin: 0 }}>
            Auto-refreshes every 6 hours (00:00, 06:00, 12:00, 18:00 UTC/TCT).
          </p>
        </div>
      </div>

      {/* Item prices cache */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Item Prices</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {[
            { label: 'Items Cached', value: itemPricesStatus?.count ?? '—', color: '#f4f4f5' },
          ].map(({ label, value, color }) => (
            <div key={label} className="p-4 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>{label}</p>
              <p style={{ color, fontSize: '24px', fontWeight: 'bold' }}>{value}</p>
            </div>
          ))}
          <div className="p-4 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Last Updated</p>
            <p style={{ color: '#f4f4f5', fontSize: '14px', fontWeight: '600' }}>
              {itemPricesStatus?.fetched_at ? timeAgo(itemPricesStatus.fetched_at) : '—'}
            </p>
          </div>
        </div>
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <button
            onClick={refreshItemPrices}
            disabled={!!refreshing}
            className="px-5 py-2 rounded border-none cursor-pointer transition-all hover:opacity-80 text-sm font-medium"
            style={{
              background: 'rgba(179,18,63,0.2)',
              color: '#ff2f6d',
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            {refreshing === 'item-prices' ? 'Refreshing…' : 'Refresh Item Prices'}
          </button>
          <p style={{ color: '#a1a1aa', fontSize: '12px', margin: 0 }}>
            Auto-refreshes every 6 hours alongside armory. Used for armory valuation.
          </p>
        </div>
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
          {lastResult.refreshedAt && (
            <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: lastResult.errors?.length ? '8px' : 0 }}>
              {formatUTC(lastResult.refreshedAt)}
            </p>
          )}
          {lastResult.errors?.length > 0 && (
            <div style={{ marginTop: '6px' }}>
              {lastResult.errors.map((e, i) => (
                <p key={i} style={{ color: '#f87171', fontSize: '12px', margin: '2px 0' }}>
                  ✗ Faction {e.factionId}: {e.error}
                </p>
              ))}
            </div>
          )}
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
