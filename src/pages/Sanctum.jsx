import { useState, useEffect, useRef } from 'react'
import { useSession } from '../hooks/useSession'
import { API_BASE_URL } from '../config/api'
import { UPGRADES, upgradeCost, formatEssence, formatTime } from '../components/Sanctum/sanctumData.js'
import SanctumStats from '../components/Sanctum/SanctumStats.jsx'
import SanctumUpgradeCard from '../components/Sanctum/SanctumUpgradeCard.jsx'

const TICK_MS     = 100
const SYNC_MS     = 45000
const CLICK_BATCH = 500

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export default function Sanctum() {
  const { user, loading: sessionLoading } = useSession()

  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [essence, setEssence]       = useState(0)
  const [totalEssence, setTotal]    = useState(0)
  const [essencePerSec, setEps]     = useState(0)
  const [clickPower, setClickPower] = useState(1)
  const [upgrades, setUpgrades]     = useState({})
  const [buying, setBuying]         = useState(false)
  const [offlineMsg, setOfflineMsg] = useState(null)

  const essenceRef = useRef(0)
  const totalRef   = useRef(0)
  const epsRef     = useRef(0)
  const clicksRef  = useRef(0)
  const clickTimer = useRef(null)
  const syncTimer  = useRef(null)
  const tickTimer  = useRef(null)

  // Load state once session is resolved
  useEffect(() => {
    if (sessionLoading) return
    if (!user) { setLoading(false); return }

    fetch(`${API_BASE_URL}/api/sanctum/state`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        essenceRef.current = data.essence
        totalRef.current   = data.totalEssence
        epsRef.current     = data.essencePerSec
        setEssence(data.essence)
        setTotal(data.totalEssence)
        setEps(data.essencePerSec)
        setClickPower(data.clickPower)
        setUpgrades(data.upgrades || {})
        if (data.offlineGained >= 1 && data.offlineSeconds >= 10) {
          setOfflineMsg({ gained: data.offlineGained, seconds: data.offlineSeconds })
        }
        setLoading(false)
      })
      .catch(() => { setError('Could not reach the Sanctum.'); setLoading(false) })
  }, [sessionLoading, user])

  // Local tick
  useEffect(() => {
    tickTimer.current = setInterval(() => {
      const gained = epsRef.current * (TICK_MS / 1000)
      essenceRef.current += gained
      totalRef.current   += gained
      setEssence(v => v + gained)
      setTotal(v => v + gained)
    }, TICK_MS)
    return () => clearInterval(tickTimer.current)
  }, [])

  // Auto-sync
  useEffect(() => {
    syncTimer.current = setInterval(() => flushClicks(true), SYNC_MS)
    return () => clearInterval(syncTimer.current)
  }, [])

  async function flushClicks(withSync = false) {
    const pending = clicksRef.current
    clicksRef.current = 0

    if (pending > 0) {
      try {
        await fetch(`${API_BASE_URL}/api/sanctum/click`, {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ clicks: pending, currentEssence: essenceRef.current, currentTotal: totalRef.current }),
        })
      } catch { /* silent */ }
    } else if (withSync) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/sanctum/sync`, {
          method: 'POST', headers: authHeaders(),
        })
        const data = await res.json()
        essenceRef.current = data.essence
        totalRef.current   = data.totalEssence
        setEssence(data.essence)
        setTotal(data.totalEssence)
      } catch { /* silent */ }
    }
  }

  function handleInvoke() {
    clicksRef.current += 1
    essenceRef.current += clickPower
    totalRef.current   += clickPower
    setEssence(essenceRef.current)
    setTotal(totalRef.current)
    clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => flushClicks(), CLICK_BATCH)
  }

  async function handleBuyUpgrade(upgradeId) {
    if (buying) return
    setBuying(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/sanctum/upgrade`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ upgradeId, currentEssence: essenceRef.current, currentTotal: totalRef.current }),
      })
      const data = await res.json()
      if (!res.ok) { setBuying(false); return }
      // Deduct cost from local value (backend value lags the local tick).
      // essencePerSec and clickPower are upgrade-derived, so trust backend for those.
      const cost = upgradeCost(upgradeId, upgrades[upgradeId] || 0)
      essenceRef.current = Math.max(0, essenceRef.current - cost)
      epsRef.current     = data.essencePerSec
      setEssence(essenceRef.current)
      // totalEssence is never decremented by purchases — leave it as-is
      setEps(data.essencePerSec)
      setClickPower(data.clickPower)
      setUpgrades(data.upgrades || {})
    } catch { /* silent */ }
    setBuying(false)
  }

  // ── Render states ────────────────────────────────────────────────
  if (!user && !sessionLoading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#94a3b8', fontFamily: 'Cinzel, serif', letterSpacing: 2 }}>
          Sign in to enter the Sanctum.
        </div>
      </div>
    )
  }

  if (sessionLoading || loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#94a3b8', fontFamily: 'Cinzel, serif', letterSpacing: 2 }}>
          Awakening the Sanctum…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#b3123f', fontFamily: 'Cinzel, serif', letterSpacing: 2 }}>{error}</div>
      </div>
    )
  }

  const visibleUpgrades = UPGRADES.filter(u =>
    (upgrades[u.id] || 0) > 0 || totalEssence >= u.unlockAt
  )

  const nextLocked = UPGRADES.find(u =>
    totalEssence < u.unlockAt && (upgrades[u.id] || 0) === 0
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 20px 80px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{
          fontFamily: 'Cinzel, serif',
          fontSize: 'clamp(28px, 5vw, 48px)',
          letterSpacing: 8,
          color: '#e2e8f0',
          margin: 0,
          textShadow: '0 0 40px rgba(179,18,63,0.5)',
        }}>
          THE SANCTUM
        </h1>
        <p style={{ color: '#64748b', marginTop: 10, fontSize: 14, letterSpacing: 2 }}>
          IDLE SORCERY
        </p>
      </div>

      {/* Offline notification */}
      {offlineMsg && (
        <div
          onClick={() => setOfflineMsg(null)}
          style={{
            background: 'linear-gradient(135deg, rgba(109,40,217,0.2), rgba(179,18,63,0.15))',
            border: '1px solid rgba(109,40,217,0.4)',
            borderRadius: 12,
            padding: '14px 20px',
            marginBottom: 28,
            textAlign: 'center',
            cursor: 'pointer',
            color: '#e2e8f0',
            fontSize: 14,
          }}
        >
          <span style={{ color: '#a78bfa', fontWeight: 700 }}>Welcome back, Sorcerer. </span>
          While you were away ({formatTime(offlineMsg.seconds)}), your Sanctum gathered{' '}
          <span style={{ color: '#f59e0b', fontWeight: 700 }}>{formatEssence(offlineMsg.gained)} essence</span>.
          <span style={{ color: '#475569', fontSize: 11, display: 'block', marginTop: 4 }}>Click to dismiss</span>
        </div>
      )}

      {/* Two-column layout */}
      <div
        className="sanctum-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 320px) 1fr',
          gap: 24,
          alignItems: 'start',
        }}
      >
        <SanctumStats
          essence={essence}
          totalEssence={totalEssence}
          essencePerSec={essencePerSec}
          clickPower={clickPower}
          onInvoke={handleInvoke}
        />

        <div>
          <div style={{ color: '#475569', fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14 }}>
            Upgrades
          </div>

          {visibleUpgrades.length === 0 ? (
            <div style={{ color: '#334155', fontSize: 13, fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }}>
              Invoke the darkness to awaken your first upgrade…
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visibleUpgrades.map(u => (
                <SanctumUpgradeCard
                  key={u.id}
                  upgradeId={u.id}
                  level={upgrades[u.id] || 0}
                  essence={essence}
                  totalEssence={totalEssence}
                  onBuy={handleBuyUpgrade}
                  buying={buying}
                />
              ))}
            </div>
          )}

          {nextLocked && (
            <div style={{
              marginTop: 12,
              padding: '12px 16px',
              borderRadius: 10,
              border: '1px dashed rgba(255,255,255,0.07)',
              color: '#334155',
              fontSize: 12,
              textAlign: 'center',
            }}>
              🔒 Next unlock at {formatEssence(nextLocked.unlockAt)} lifetime essence
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .sanctum-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
