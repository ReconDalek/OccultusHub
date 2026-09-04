import { useState, useEffect, useRef } from 'react'
import { API_BASE_URL } from '../../config/api'
import { timeAgo, formatUTC } from '../../lib/dates'

const FACTION_NAMES = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' }
const FACTION_IDS = [33097, 9728, 9171]

const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Last 18 months (excluding the current, still-open one), most recent first
function buildPastMonthOptions() {
  const now = new Date()
  const options = []
  for (let i = 1; i <= 18; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    options.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }) // 1-indexed
  }
  return options
}

// Shared card/row/action styling so every section on this page — whether it
// has real per-faction stats or is just a description + auto-run schedule —
// presents at the same visual weight instead of some being a detailed panel
// and others a bare line of text.
function StatCard({ title, children }) {
  return (
    <div className="p-5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="mb-3">
        <span style={{ color: '#f4f4f5', fontWeight: 'bold' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function StatRow({ label, value, valueColor = '#f4f4f5', title }) {
  return (
    <div className="flex justify-between" style={{ marginBottom: '4px' }}>
      <span style={{ color: "var(--text-secondary)", fontSize: '13px' }}>{label}</span>
      <span style={{ color: valueColor, fontSize: '13px' }} title={title}>{value}</span>
    </div>
  )
}

function StatDescription({ children }) {
  return (
    <p style={{ color: "var(--text-secondary)", fontSize: '13px', margin: '0 0 8px 0', lineHeight: '1.5' }}>{children}</p>
  )
}

function ActionRow({ button, caption, subCaption }) {
  return (
    <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
      {button}
      <div>
        <p style={{ color: "var(--text-secondary)", fontSize: '12px', margin: 0 }}>{caption}</p>
        {subCaption && <p style={{ color: "var(--text-faint)", fontSize: '11px', margin: '2px 0 0 0' }}>{subCaption}</p>}
      </div>
    </div>
  )
}

export default function CacheTab() {
  const [cacheStatus,         setCacheStatus]         = useState(null)
  const [chainStatus,         setChainStatus]         = useState(null)
  const [memberStatus,        setMemberStatus]        = useState(null)
  const [analytics,           setAnalytics]           = useState(null)
  const [personalStatsStatus, setPersonalStatsStatus] = useState(null)
  const [armoryStatus,        setArmoryStatus]        = useState(null)
  const [armoryDepositsStatus,setArmoryDepositsStatus] = useState(null)
  const [ocStatus,            setOcStatus]            = useState(null)
  const [itemPricesStatus,    setItemPricesStatus]    = useState(null)
  const [companyProfitStatus, setCompanyProfitStatus] = useState(null)
  const [keySyncResult,        setKeySyncResult]       = useState(null)
  const [energySnapshotResult, setEnergySnapshotResult] = useState(null)
  const [loading,             setLoading]             = useState(true)
  const [refreshing,          setRefreshing]          = useState(null)
  const [lastResult,          setLastResult]          = useState(null)
  const [error,               setError]               = useState(null)
  const [snapshotRunning,     setSnapshotRunning]     = useState(false)
  const pastMonthOptions = buildPastMonthOptions()
  const [acctSnapshotTarget, setAcctSnapshotTarget] = useState(`${pastMonthOptions[0].year}-${pastMonthOptions[0].month}`)
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
      fetch(`${API_BASE_URL}/api/admin/armory/deposits/status`, { headers: { Authorization: token } })
        .then((r) => r.json()).then(setArmoryDepositsStatus).catch(console.error),
      fetch(`${API_BASE_URL}/api/admin/oc/status`, { headers: { Authorization: token } })
        .then((r) => r.json()).then((d) => setOcStatus(d.status)).catch(console.error),
      fetch(`${API_BASE_URL}/api/admin/item-prices/status`, { headers: { Authorization: token } })
        .then((r) => r.json()).then(setItemPricesStatus).catch(console.error),
      fetch(`${API_BASE_URL}/api/admin/company-profits/status`, { headers: { Authorization: token } })
        .then((r) => r.json()).then(setCompanyProfitStatus).catch(console.error),
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

  const checkWarMatches = async () => {
    try {
      setRefreshing('war-check')
      setError(null)
      setLastResult(null)
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/wars/check`, {
        method: 'POST',
        headers: { Authorization: token },
      })
      const data = await res.json()
      if (res.ok) setLastResult(data)
      else setError(data.error || `Error ${res.status}`)
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

  const refreshArmoryDeposits = async () => {
    try {
      setRefreshing('armory-deposits')
      setError(null)
      setLastResult(null)
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/armory/deposits/refresh`, {
        method: 'POST',
        headers: { Authorization: token },
      })
      const data = await res.json()
      if (res.ok) {
        setLastResult(data)
        fetch(`${API_BASE_URL}/api/admin/armory/deposits/status`, { headers: { Authorization: token } })
          .then((r) => r.json()).then(setArmoryDepositsStatus).catch(console.error)
      } else {
        setError(data.error || `Error ${res.status}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(null)
    }
  }

  const refreshOc = async () => {
    try {
      setRefreshing('oc')
      setError(null)
      setLastResult(null)
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/oc/refresh`, {
        method: 'POST',
        headers: { Authorization: token },
      })
      const data = await res.json()
      if (res.ok) {
        setLastResult(data)
        fetch(`${API_BASE_URL}/api/admin/oc/status`, { headers: { Authorization: token } })
          .then((r) => r.json()).then((d) => setOcStatus(d.status)).catch(console.error)
      } else {
        setError(data.error || `Error ${res.status}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(null)
    }
  }

  const refreshAccountingSnapshot = async () => {
    try {
      setRefreshing('accounting-snapshot')
      setError(null)
      setLastResult(null)
      const [year, month] = acctSnapshotTarget.split('-').map(Number)
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/accounting/snapshot`, {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      })
      const data = await res.json()
      if (res.ok) setLastResult({ message: `Snapshotted ${MONTHS_FULL[month - 1]} ${year} for ${data.snapshotted} factions` })
      else setError(data.error || `Error ${res.status}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(null)
    }
  }

  const refreshCompanyProfits = async () => {
    try {
      setRefreshing('company-profits')
      setError(null)
      setLastResult(null)
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/company-profits/refresh`, {
        method: 'POST',
        headers: { Authorization: token },
      })
      const data = await res.json()
      if (res.ok) {
        setLastResult(data)
        fetch(`${API_BASE_URL}/api/admin/company-profits/status`, { headers: { Authorization: token } })
          .then((r) => r.json()).then(setCompanyProfitStatus).catch(console.error)
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

  const syncUserKeys = async () => {
    try {
      setRefreshing('user-keys')
      setError(null)
      setLastResult(null)
      setKeySyncResult(null)
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/users/sync-keys`, {
        method: 'POST',
        headers: { Authorization: token },
      })
      const data = await res.json()
      if (res.ok) {
        setLastResult({ message: data.message })
        setKeySyncResult(data)
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

  const runEnergySnapshot = async () => {
    setError(null)
    setLastResult(null)
    setEnergySnapshotResult(null)
    setRefreshing('energy-snapshot')
    try {
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/energy/snapshot`, {
        method: 'POST',
        headers: { Authorization: token },
      })
      const data = await res.json()
      if (res.ok) {
        setLastResult({ message: data.message })
        setEnergySnapshotResult(data)
      } else {
        setError(data.error || `Error ${res.status}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(null)
    }
  }

  if (loading) return <p style={{ color: "var(--text-secondary)" }}>Loading cache status...</p>

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
                <p style={{ color: "var(--text-secondary)", fontSize: '12px', marginBottom: '4px' }}>{label}</p>
                <p style={{ color, fontSize: '28px', fontWeight: 'bold' }}>{value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--text-secondary)" }}>Failed to load analytics</p>
        )}
      </div>

      {/* Cache status */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Factions</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {(() => {
            const info = cacheStatus?.['factions']
            return (
              <StatCard title="Faction Cache">
                <StatRow label="Cached entries" value={info?.count ?? '—'} />
                <StatRow label="Last updated" value={timeAgo(info?.lastUpdated)} title={info?.lastUpdated ?? ''} valueColor="var(--text-secondary)" />
              </StatCard>
            )
          })()}
        </div>
        <ActionRow
          button={
            <button
              onClick={() => refreshCache('factions')}
              disabled={!!refreshing}
              className="px-5 py-2 rounded border-none cursor-pointer transition-all hover:opacity-80 text-sm font-medium"
              style={{ background: 'rgba(179,18,63,0.2)', color: '#ff2f6d', opacity: refreshing ? 0.5 : 1 }}
            >
              {refreshing === 'factions' ? 'Refreshing...' : 'Refresh Factions'}
            </button>
          }
          caption="Auto-refreshes every 12 hours (00:00 and 12:00 UTC/TCT). Company cache is updated by the daily director-key fetch."
        />
      </div>

      {/* Chain cache status */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Chains</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {FACTION_IDS.map((fid) => {
            const info = chainStatus?.[fid]
            return (
              <StatCard key={fid} title={FACTION_NAMES[fid]}>
                <StatRow label="Stored chains" value={info?.totalChains ?? '—'} />
                <StatRow label="Last updated" value={info?.lastFetched ? timeAgo(info.lastFetched) : '—'} title={info?.lastFetched ?? ''} valueColor="var(--text-secondary)" />
              </StatCard>
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
          <p style={{ color: "var(--text-secondary)", fontSize: '12px', margin: 0 }}>
            Auto-refreshes every Tuesday 14:00 UTC/TCT.
          </p>
        </div>
      </div>

      {/* War match check */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Ranked Wars</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <StatCard title="Check War Matches">
            <StatDescription>Scans faction news for newly announced ranked war matchups and records them for tracking.</StatDescription>
            <StatRow label="Auto-runs" value="Every 10 minutes" valueColor="var(--text-secondary)" />
          </StatCard>
        </div>
        <ActionRow
          button={
            <button
              onClick={checkWarMatches}
              disabled={!!refreshing}
              className="px-5 py-2 rounded border-none cursor-pointer transition-all hover:opacity-80 text-sm font-medium"
              style={{ background: 'rgba(179,18,63,0.2)', color: '#ff2f6d', opacity: refreshing ? 0.5 : 1 }}
            >
              {refreshing === 'war-check' ? 'Checking…' : 'Check War Matches'}
            </button>
          }
          caption="Matchups are announced at 14:00 UTC / midnight NZT on Tuesdays — the 10-minute cron already catches this almost immediately."
          subCaption="Run manually to force an immediate check rather than waiting for the next cron cycle."
        />
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
                : '—',                                                               color: "var(--text-secondary)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="p-4 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <p style={{ color: "var(--text-secondary)", fontSize: '12px', marginBottom: '4px' }}>{label}</p>
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
                  <p style={{ color: "var(--text-secondary)", fontSize: '11px', marginBottom: '3px' }}>{FACTION_NAMES[fid]}</p>
                  <p style={{ color: '#f4f4f5', fontSize: '13px', margin: 0 }}>
                    <span style={{ color: '#4ade80', fontWeight: '600' }}>{fb.active}</span>
                    <span style={{ color: "var(--text-secondary)" }}> / {fb.total}</span>
                    <span style={{ color: "var(--text-secondary)", fontSize: '11px' }}> active</span>
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
            <p style={{ color: "var(--text-secondary)", fontSize: '12px', margin: 0 }}>
              Auto-syncs every 12 hours after faction cache refresh.
            </p>
            {memberStatus?.lastSynced && (
              <p style={{ color: "var(--text-secondary)", fontSize: '11px', margin: '2px 0 0 0' }}>
                Last synced: {timeAgo(memberStatus.lastSynced)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* User key sync */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>User Keys</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <StatCard title="Sync User Keys">
            <StatDescription>Checks all stored API keys against Torn and updates username, faction, position, and avatar if changed.</StatDescription>
            <StatRow label="Auto-runs" value="Daily at 01:00 UTC" valueColor="var(--text-secondary)" />
          </StatCard>
        </div>
        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <button
            onClick={syncUserKeys}
            disabled={!!refreshing}
            className="px-5 py-2 rounded border-none cursor-pointer transition-all hover:opacity-80 text-sm font-medium"
            style={{
              background: 'rgba(179,18,63,0.2)',
              color: '#ff2f6d',
              opacity: refreshing ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            {refreshing === 'user-keys' ? 'Syncing…' : 'Sync User Keys'}
          </button>
          <div>
            <p style={{ color: "var(--text-secondary)", fontSize: '12px', margin: 0 }}>
              Run manually if a member recently switched factions and hasn't logged in yet.
            </p>
          </div>
        </div>
        {keySyncResult && (
          <div style={{
            marginTop: '12px', padding: '12px 14px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ display: 'flex', gap: '24px', marginBottom: keySyncResult.changes?.length ? '10px' : 0 }}>
              {[
                { label: 'Checked', value: keySyncResult.checked, color: '#f4f4f5' },
                { label: 'Updated', value: keySyncResult.updated, color: keySyncResult.updated > 0 ? '#fbbf24' : '#4ade80' },
                { label: 'Errors',  value: keySyncResult.errors,  color: keySyncResult.errors  > 0 ? '#f87171' : '#4ade80' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <p style={{ color: "var(--text-faint)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px 0' }}>{label}</p>
                  <p style={{ color, fontSize: '20px', fontWeight: '700', margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>
            {keySyncResult.changes?.length > 0 && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                {keySyncResult.changes.map((c, i) => (
                  <p key={i} style={{ color: '#fbbf24', fontSize: '12px', margin: '2px 0', fontFamily: 'monospace' }}>{c}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Energy snapshots */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Gym Energy Snapshots</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <StatCard title="Run Energy Snapshot">
            <StatDescription>Fetches current gym energy totals for all 3 factions and upserts today's snapshot row.</StatDescription>
            <StatRow label="Auto-runs" value="Daily at 01:00 UTC" valueColor="var(--text-secondary)" />
          </StatCard>
        </div>
        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <button
            onClick={runEnergySnapshot}
            disabled={!!refreshing}
            className="px-5 py-2 rounded border-none cursor-pointer transition-all hover:opacity-80 text-sm font-medium"
            style={{ background: 'rgba(179,18,63,0.2)', color: '#ff2f6d', opacity: refreshing ? 0.5 : 1, flexShrink: 0 }}
          >
            {refreshing === 'energy-snapshot' ? 'Running…' : 'Run Energy Snapshot'}
          </button>
          <div>
            <p style={{ color: "var(--text-secondary)", fontSize: '12px', margin: 0 }}>
              Safe to run manually — same-day rows are overwritten, not duplicated.
            </p>
          </div>
        </div>
        {energySnapshotResult && (
          <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ color: '#4ade80', fontSize: '13px', margin: 0 }}>{energySnapshotResult.message}</p>
            {energySnapshotResult.errors > 0 && (
              <p style={{ color: '#f87171', fontSize: '12px', margin: '4px 0 0 0' }}>{energySnapshotResult.errors} faction(s) failed</p>
            )}
          </div>
        )}
      </div>

      {/* Personal stats snapshots */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Personal Stats Snapshots</h3>
        <div className="grid gap-4 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {[
            { label: 'Members Tracked', value: personalStatsStatus?.members ?? '—', color: '#f4f4f5' },
            { label: 'Days of History',  value: personalStatsStatus?.days    ?? '—', color: '#22d3ee' },
          ].map(({ label, value, color }) => (
            <div key={label} className="p-4 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <p style={{ color: "var(--text-secondary)", fontSize: '12px', marginBottom: '4px' }}>{label}</p>
              <p style={{ color, fontSize: '24px', fontWeight: 'bold' }}>{value}</p>
            </div>
          ))}
          {personalStatsStatus?.earliest && (
            <div className="p-4 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <p style={{ color: "var(--text-secondary)", fontSize: '12px', marginBottom: '4px' }}>Date Range</p>
              <p style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '600', lineHeight: '1.6' }}>
                {personalStatsStatus.earliest}<br />
                <span style={{ color: "var(--text-secondary)" }}>to</span> {personalStatsStatus.latest}
              </p>
            </div>
          )}
        </div>
        {snapshotRunning && personalStatsStatus && (
          <div style={{ marginBottom: '12px', padding: '12px 16px', borderRadius: '10px', background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: '#22d3ee', fontSize: '13px', fontWeight: 600 }}>Snapshot in progress…</span>
              <span style={{ color: '#22d3ee', fontSize: '13px' }}>
                {personalStatsStatus.today} / {personalStatsStatus.members || '?'} members
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <button
            onClick={runPersonalStatsSnapshot}
            disabled={snapshotRunning}
            className="px-5 py-2 rounded border-none cursor-pointer transition-all hover:opacity-80 text-sm font-medium"
            style={{ background: 'rgba(179,18,63,0.2)', color: '#ff2f6d', opacity: snapshotRunning ? 0.5 : 1 }}
          >
            {snapshotRunning ? 'Running…' : 'Run Stats Snapshot'}
          </button>
          <div>
            <p style={{ color: "var(--text-secondary)", fontSize: '12px', margin: 0 }}>
              Auto-runs daily at 01:00 UTC — may take 3–5 minutes for all members.
            </p>
            {personalStatsStatus?.today > 0 && !snapshotRunning && (
              <p style={{ color: "var(--text-secondary)", fontSize: '11px', margin: '2px 0 0 0' }}>
                {personalStatsStatus.today} members snapshotted today ({personalStatsStatus.today_date})
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Armory cache status */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Armory</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {FACTION_IDS.map((fid) => {
            const info = armoryStatus?.[fid]
            return (
              <StatCard key={fid} title={FACTION_NAMES[fid]}>
                <StatRow label="Last updated" value={info?.fetched_at ? timeAgo(info.fetched_at) : '—'} title={info?.fetched_at ?? ''} valueColor="var(--text-secondary)" />
              </StatCard>
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
          <p style={{ color: "var(--text-secondary)", fontSize: '12px', margin: 0 }}>
            Auto-refreshes every 6 hours (00:00, 06:00, 12:00, 18:00 UTC/TCT).
          </p>
        </div>
      </div>

      {/* Armory deposit log */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Armory Deposits</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {FACTION_IDS.map((fid) => {
            const info = armoryDepositsStatus?.status?.[fid]
            return (
              <StatCard key={fid} title={FACTION_NAMES[fid]}>
                <StatRow label="Logged deposits" value={info?.count ?? 0} />
                <StatRow label="Last fetched" value={info?.fetched_at ? timeAgo(info.fetched_at) : '—'} title={info?.fetched_at ?? ''} valueColor="var(--text-secondary)" />
              </StatCard>
            )
          })}
        </div>

        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <button
            onClick={refreshArmoryDeposits}
            disabled={!!refreshing}
            className="px-5 py-2 rounded border-none cursor-pointer transition-all hover:opacity-80 text-sm font-medium"
            style={{
              background: 'rgba(179,18,63,0.2)',
              color: '#ff2f6d',
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            {refreshing === 'armory-deposits' ? 'Refreshing…' : 'Refresh Armory Deposits'}
          </button>
          <div>
            <p style={{ color: "var(--text-secondary)", fontSize: '12px', margin: 0 }}>
              Auto-refreshes every 6 hours alongside the armory cache. Fetched via each faction's leader key.
            </p>
            <p style={{ color: "var(--text-faint)", fontSize: '11px', margin: '2px 0 0 0' }}>
              Deduped by Torn's news ID — safe to run manually any time, never creates duplicate entries.
            </p>
          </div>
        </div>
      </div>

      {/* Organized Crime cache */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Organized Crime</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {FACTION_IDS.map((fid) => {
            const info = ocStatus?.[fid]
            return (
              <StatCard key={fid} title={FACTION_NAMES[fid]}>
                <StatRow label="Crimes tracked" value={info?.count ?? 0} />
                <StatRow label="Last fetched" value={info?.fetched_at ? timeAgo(info.fetched_at) : '—'} title={info?.fetched_at ?? ''} valueColor="var(--text-secondary)" />
              </StatCard>
            )
          })}
        </div>

        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <button
            onClick={refreshOc}
            disabled={!!refreshing}
            className="px-5 py-2 rounded border-none cursor-pointer transition-all hover:opacity-80 text-sm font-medium"
            style={{
              background: 'rgba(179,18,63,0.2)',
              color: '#ff2f6d',
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            {refreshing === 'oc' ? 'Refreshing…' : 'Refresh OC Crimes'}
          </button>
          <div>
            <p style={{ color: "var(--text-secondary)", fontSize: '12px', margin: 0 }}>
              Auto-refreshes daily at 01:00 UTC. Fetched via each faction's leader key (up to 500 most recent crimes per faction per run).
            </p>
            <p style={{ color: "var(--text-faint)", fontSize: '11px', margin: '2px 0 0 0' }}>
              Also updates each member's best-known checkpoint pass rate per crime/position — used by the Team Builder on the Organized Crime tab.
            </p>
          </div>
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
              <p style={{ color: "var(--text-secondary)", fontSize: '12px', marginBottom: '4px' }}>{label}</p>
              <p style={{ color, fontSize: '24px', fontWeight: 'bold' }}>{value}</p>
            </div>
          ))}
          <div className="p-4 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <p style={{ color: "var(--text-secondary)", fontSize: '12px', marginBottom: '4px' }}>Last Updated</p>
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
          <p style={{ color: "var(--text-secondary)", fontSize: '12px', margin: 0 }}>
            Auto-refreshes every 6 hours alongside armory. Used for armory valuation.
          </p>
        </div>
      </div>

      {/* Company profit snapshots */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Company Profits</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {[
            { label: 'Companies Tracked', value: companyProfitStatus?.total              ?? '—', color: '#f4f4f5' },
            { label: 'With Director Key',  value: companyProfitStatus?.with_key          ?? '—', color: companyProfitStatus?.with_key === companyProfitStatus?.total ? '#4ade80' : '#f97316' },
            { label: 'Total Snapshots',    value: companyProfitStatus?.total_snapshots   ?? '—', color: '#f4f4f5' },
            { label: "Today's Snapshots",  value: companyProfitStatus?.snapshots_today != null
                ? `${companyProfitStatus.snapshots_today} / ${companyProfitStatus.with_key ?? 0}`
                : '—',
              color: companyProfitStatus?.snapshots_today === companyProfitStatus?.with_key ? '#4ade80' : '#f97316' },
          ].map(({ label, value, color }) => (
            <div key={label} className="p-4 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <p style={{ color: "var(--text-secondary)", fontSize: '12px', marginBottom: '4px' }}>{label}</p>
              <p style={{ color, fontSize: '22px', fontWeight: 'bold' }}>{value}</p>
            </div>
          ))}
          <div className="p-4 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <p style={{ color: "var(--text-secondary)", fontSize: '12px', marginBottom: '4px' }}>Snapshot Range</p>
            <p style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '600', lineHeight: '1.7' }}>
              {companyProfitStatus?.earliest_snapshot ?? '—'}
              <br />
              <span style={{ color: "var(--text-secondary)" }}>to</span>{' '}
              {companyProfitStatus?.latest_snapshot ?? '—'}
            </p>
          </div>
          <div className="p-4 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <p style={{ color: "var(--text-secondary)", fontSize: '12px', marginBottom: '4px' }}>Last Fetched</p>
            <p style={{ color: '#f4f4f5', fontSize: '14px', fontWeight: '600' }}>
              {companyProfitStatus?.fetched_at ? timeAgo(companyProfitStatus.fetched_at) : '—'}
            </p>
          </div>
        </div>
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <button
            onClick={refreshCompanyProfits}
            disabled={!!refreshing}
            className="px-5 py-2 rounded border-none cursor-pointer transition-all hover:opacity-80 text-sm font-medium"
            style={{
              background: 'rgba(179,18,63,0.2)',
              color: '#ff2f6d',
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            {refreshing === 'company-profits' ? 'Refreshing…' : 'Run Company Snapshot'}
          </button>
          <div>
            <p style={{ color: "var(--text-secondary)", fontSize: '12px', margin: 0 }}>
              Auto-runs daily at 01:00 UTC using each director's API key. Also updates the public company cache.
            </p>
            <p style={{ color: "var(--text-faint)", fontSize: '11px', margin: '2px 0 0 0' }}>
              Manual run is safe — today's snapshot uses INSERT OR IGNORE so it won't duplicate if already run.
            </p>
          </div>
        </div>
      </div>

      {/* Accounting monthly snapshot */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Accounting Snapshot</h3>
        <StatCard title="Freeze a Month's Accounting Summary">
          <StatDescription>
            Freezes each faction's Overview figures for one completed month — armory expense, OD Insurance, and
            OC item costs all price against today's item value, so recomputing an old month later would silently
            use today's drifted prices instead of what things actually cost back then. Also backfills months from
            before this existed.
          </StatDescription>
          <StatRow label="Auto-runs" value="1st of month, 02:00 UTC (previous month)" valueColor="var(--text-secondary)" />
        </StatCard>
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <select
            value={acctSnapshotTarget}
            onChange={(e) => setAcctSnapshotTarget(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '6px', color: '#f4f4f5', padding: '7px 10px', fontSize: '13px',
            }}
          >
            {pastMonthOptions.map(({ year, month }) => (
              <option key={`${year}-${month}`} value={`${year}-${month}`}>{MONTHS_FULL[month - 1]} {year}</option>
            ))}
          </select>
          <button
            onClick={refreshAccountingSnapshot}
            disabled={!!refreshing}
            className="px-5 py-2 rounded border-none cursor-pointer transition-all hover:opacity-80 text-sm font-medium"
            style={{
              background: 'rgba(179,18,63,0.2)',
              color: '#ff2f6d',
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            {refreshing === 'accounting-snapshot' ? 'Snapshotting…' : 'Snapshot Selected Month'}
          </button>
          <p style={{ color: "var(--text-secondary)", fontSize: '12px', margin: 0 }}>
            Safe to re-run — overwrites that month's existing snapshot with freshly computed figures.
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
            <p style={{ color: "var(--text-secondary)", fontSize: '12px', marginBottom: lastResult.errors?.length ? '8px' : 0 }}>
              {formatUTC(lastResult.refreshedAt)}
            </p>
          )}
          {lastResult.errors?.length > 0 && (
            <div style={{ marginTop: '6px' }}>
              {lastResult.errors.map((e, i) => (
                <p key={i} style={{ color: '#f87171', fontSize: '12px', margin: '2px 0' }}>
                  Faction {e.factionId}: {e.error}
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
