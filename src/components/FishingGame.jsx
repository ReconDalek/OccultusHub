import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from '../hooks/useSession'
import { API_BASE_URL } from '../config/api'
import FishingLeaderboard from './FishingLeaderboard'

const FISH_TYPES = [
  { name: 'Carp',        rarity: 'common',    emoji: '🐟', points: 10,   weight: 28 },
  { name: 'Roach',       rarity: 'common',    emoji: '🐟', points: 12,   weight: 24 },
  { name: 'Perch',       rarity: 'common',    emoji: '🐟', points: 15,   weight: 18 },
  { name: 'Bass',        rarity: 'uncommon',  emoji: '🐠', points: 50,   weight: 10 },
  { name: 'Pike',        rarity: 'uncommon',  emoji: '🐠', points: 75,   weight: 8  },
  { name: 'Salmon',      rarity: 'uncommon',  emoji: '🐠', points: 100,  weight: 5  },
  { name: 'Swordfish',   rarity: 'rare',      emoji: '🐡', points: 250,  weight: 3  },
  { name: 'Tuna',        rarity: 'rare',      emoji: '🐡', points: 350,  weight: 2  },
  { name: 'Marlin',      rarity: 'rare',      emoji: '🐡', points: 500,  weight: 1  },
  { name: 'Golden Koi',  rarity: 'legendary', emoji: '✨', points: 1000, weight: 0.5},
  { name: 'Shadow Eel',  rarity: 'legendary', emoji: '🌊', points: 1500, weight: 0.3},
  { name: 'Phantom Ray', rarity: 'legendary', emoji: '⚡', points: 2500, weight: 0.2},
]

const RARITY_COLORS = {
  common:    { text: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.3)' },
  uncommon:  { text: '#22c55e', bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.3)'   },
  rare:      { text: '#8b5cf6', bg: 'rgba(139,92,246,0.15)',  border: 'rgba(139,92,246,0.3)'  },
  legendary: { text: '#fbbf24', bg: 'rgba(251,191,36,0.15)',  border: 'rgba(251,191,36,0.4)'  },
}

const RARITY_WAIT = {
  common: [3000, 8000], uncommon: [5000, 12000], rare: [8000, 15000], legendary: [10000, 18000],
}

const REEL_WINDOW = { common: 4500, uncommon: 3800, rare: 3200, legendary: 2600 }

function weightedRandom(items) {
  const total = items.reduce((s, f) => s + f.weight, 0)
  let r = Math.random() * total
  for (const f of items) {
    r -= f.weight
    if (r <= 0) return f
  }
  return items[items.length - 1]
}

function Bubbles() {
  const bubbles = Array.from({ length: 12 }, (_, i) => ({
    left: `${8 + i * 8}%`,
    bottom: `${15 + (i % 5) * 15}%`,
    size: [3, 5, 7][i % 3],
    duration: 3.5 + i * 0.28,
    delay: i * 0.5,
  }))
  return (
    <>
      {bubbles.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute', left: b.left, bottom: b.bottom,
            width: b.size, height: b.size,
            borderRadius: '50%',
            border: '1px solid rgba(120,200,255,0.25)',
            background: 'rgba(120,200,255,0.05)',
            animation: `fishBubble ${b.duration}s ease-in ${b.delay}s infinite`,
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  )
}

function LightRays() {
  return (
    <>
      {[
        { left: '15%', rotate: '-12deg', delay: '0s' },
        { left: '35%', rotate: '-5deg',  delay: '1.2s' },
        { left: '55%', rotate: '4deg',   delay: '0.7s' },
        { left: '75%', rotate: '11deg',  delay: '1.8s' },
      ].map((r, i) => (
        <div
          key={i}
          style={{
            position: 'absolute', top: 0, left: r.left,
            width: '40px', height: '70%',
            transform: `rotate(${r.rotate})`,
            transformOrigin: 'center top',
            background: 'linear-gradient(rgba(140,220,255,0.06),transparent)',
            animation: `rayPulse 4s ease-in-out ${r.delay} infinite`,
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  )
}

function BackgroundFish() {
  const fish = [
    { top: '55%', size: 52, opacity: 0.1, duration: '18s', delay: '0s', dir: 'r' },
    { top: '68%', size: 76, opacity: 0.07, duration: '24s', delay: '5s', dir: 'l' },
    { top: '45%', size: 36, opacity: 0.14, duration: '14s', delay: '9s', dir: 'r' },
    { top: '75%', size: 96, opacity: 0.05, duration: '30s', delay: '2s', dir: 'l' },
  ]
  return (
    <>
      {fish.map((f, i) => (
        <svg
          key={i}
          viewBox="0 0 60 28"
          width={f.size}
          height={f.size * 0.467}
          style={{
            position: 'absolute',
            top: f.top,
            left: f.dir === 'r' ? '-8%' : '108%',
            opacity: f.opacity,
            animation: `${f.dir === 'r' ? 'fishDriftR' : 'fishDriftL'} ${f.duration} linear ${f.delay} infinite`,
            pointerEvents: 'none',
          }}
        >
          <path d="M8,14 C18,4 38,4 50,14 C38,24 18,24 8,14 Z M50,14 L62,6 L58,14 L62,22 Z" fill="rgba(80,140,200,0.6)" />
        </svg>
      ))}
    </>
  )
}

const COOLDOWN_MS = 12 * 60 * 60 * 1000

function formatCountdown(ms) {
  if (ms <= 0) return '0:00:00'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function FishingGame({ open, onClose }) {
  const { user } = useSession()
  const [state, setState] = useState('idle') // idle | casting | waiting | bite | reeling | caught | escaped | noauth | cooldown
  const [fish, setFish] = useState(null)
  const [reelTimeLeft, setReelTimeLeft] = useState(100)
  const [shake, setShake] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [totalPoints, setTotalPoints] = useState(user?.fishingPoints || 0)
  const [cooldownMs, setCooldownMs] = useState(0)
  const waitTimerRef = useRef(null)
  const reelTimerRef = useRef(null)
  const reelStartRef = useRef(null)
  const animFrameRef = useRef(null)
  const countdownRef = useRef(null)
  const castTimeRef = useRef(null)

  const cleanup = useCallback(() => {
    clearTimeout(waitTimerRef.current)
    clearTimeout(reelTimerRef.current)
    clearInterval(countdownRef.current)
    cancelAnimationFrame(animFrameRef.current)
  }, [])

  useEffect(() => {
    if (!open) { cleanup(); setState('idle'); setFish(null) }
    return cleanup
  }, [open, cleanup])

  // Initialise cooldown from session data when game opens
  useEffect(() => {
    if (!open || !user?.lastFishedAt) return
    const last = new Date(user.lastFishedAt.replace(' ', 'T') + 'Z')
    const remaining = (last.getTime() + COOLDOWN_MS) - Date.now()
    if (remaining > 0) {
      setCooldownMs(remaining)
      setState('cooldown')
    }
  }, [open, user])

  // Tick the countdown every second
  useEffect(() => {
    if (state !== 'cooldown') { clearInterval(countdownRef.current); return }
    countdownRef.current = setInterval(() => {
      setCooldownMs(prev => {
        const next = prev - 1000
        if (next <= 0) { clearInterval(countdownRef.current); setState('idle'); return 0 }
        return next
      })
    }, 1000)
    return () => clearInterval(countdownRef.current)
  }, [state])

  async function castRod() {
    if (!user) { setState('noauth'); return }
    const token = localStorage.getItem('occultusSession')
    try {
      const res = await fetch(`${API_BASE_URL}/api/fishing/cast`, {
        method: 'POST',
        headers: { Authorization: token },
      })
      const data = await res.json()
      if (!data.ok) {
        setCooldownMs(data.msRemaining || 0)
        setState('cooldown')
        return
      }
    } catch {
      return
    }
    castTimeRef.current = Date.now()
    setState('casting')
    const chosenFish = weightedRandom(FISH_TYPES)
    setFish(chosenFish)
    const [min, max] = RARITY_WAIT[chosenFish.rarity]
    const wait = min + Math.random() * (max - min)
    waitTimerRef.current = setTimeout(() => {
      setState('bite')
      setShake(true)
      setTimeout(() => setShake(false), 600)
      reelTimerRef.current = setTimeout(() => {
        setState('escaped')
      }, REEL_WINDOW[chosenFish.rarity])
    }, wait)
  }

  function startReelAnimation(fish) {
    const window_ = REEL_WINDOW[fish.rarity]
    reelStartRef.current = performance.now()
    function tick(now) {
      const elapsed = now - reelStartRef.current
      const pct = Math.max(0, 100 - (elapsed / window_) * 100)
      setReelTimeLeft(pct)
      if (pct > 0) animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    if (state === 'bite' && fish) startReelAnimation(fish)
    if (state !== 'bite') { cancelAnimationFrame(animFrameRef.current); setReelTimeLeft(100) }
  }, [state, fish])

  async function reelIn() {
    if (state !== 'bite') return
    cleanup()
    setState('reeling')
    setTimeout(async () => {
      setState('caught')
      if (user) {
        try {
          const token = localStorage.getItem('occultusSession')
          const res = await fetch(`${API_BASE_URL}/api/fishing/catch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token },
            body: JSON.stringify({ fishName: fish.name, fishRarity: fish.rarity, points: fish.points }),
          })
          const data = await res.json()
          if (data.totalPoints != null) setTotalPoints(data.totalPoints)
        } catch { /* ignore */ }
      }
    }, 600)
  }

  function reset() {
    cleanup()
    setFish(null)
    setReelTimeLeft(100)
    const elapsed = castTimeRef.current ? Date.now() - castTimeRef.current : 0
    setCooldownMs(Math.max(0, COOLDOWN_MS - elapsed))
    setState('cooldown')
  }

  if (!open) return null

  const rc = fish ? RARITY_COLORS[fish.rarity] : null

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px',
        }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <style>{`
          @keyframes fishBubble {
            0%   { transform: translateY(0) scale(1); opacity: 0.5; }
            100% { transform: translateY(-160px) translateX(6px) scale(0.3); opacity: 0; }
          }
          @keyframes rayPulse {
            0%, 100% { opacity: 0; } 50% { opacity: 1; }
          }
          @keyframes fishDriftR {
            0%   { transform: scaleX(-1) translateX(0); }
            100% { transform: scaleX(-1) translateX(calc(-100vw - 120px)); }
          }
          @keyframes fishDriftL {
            0%   { transform: translateX(0); }
            100% { transform: translateX(calc(-100vw - 120px)); }
          }
          @keyframes surfaceShimmer {
            0%, 100% { opacity: 0.6; transform: scaleX(1); }
            50%       { opacity: 1;   transform: scaleX(1.02); }
          }
          @keyframes bobberIdle {
            0%, 100% { transform: translateY(0px) rotate(-1.5deg); }
            30%       { transform: translateY(-5px) rotate(1deg); }
            65%       { transform: translateY(4px) rotate(-0.5deg); }
          }
          @keyframes bobberBite {
            0%   { transform: translateY(0); }
            25%  { transform: translateY(36px) scaleY(0.75); }
            55%  { transform: translateY(30px); }
            100% { transform: translateY(34px); }
          }
          @keyframes screenShake {
            0%,100% { transform: translate(0,0); }
            15%      { transform: translate(-5px,-3px); }
            30%      { transform: translate(5px,3px); }
            45%      { transform: translate(-4px,4px); }
            60%      { transform: translate(4px,-4px); }
            75%      { transform: translate(-2px,2px); }
          }
          @keyframes catchReveal {
            0%   { transform: translateY(30px) scale(0.8); opacity: 0; }
            100% { transform: translateY(0) scale(1); opacity: 1; }
          }
          @keyframes reelPulse {
            0%,100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,0.6); }
            50%      { transform: scale(1.05); box-shadow: 0 0 0 12px rgba(239,68,68,0); }
          }
          @keyframes legendaryGlow {
            0%,100% { box-shadow: 0 0 20px rgba(251,191,36,0.4); }
            50%      { box-shadow: 0 0 50px rgba(251,191,36,0.9), 0 0 80px rgba(251,191,36,0.3); }
          }
        `}</style>

        <div
          style={{
            width: '100%', maxWidth: '520px',
            animation: shake ? 'screenShake 0.5s ease-out forwards' : 'none',
          }}
        >
          {/* Close button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
                color: '#a1a1aa', borderRadius: '8px', padding: '6px 14px',
                cursor: 'pointer', fontSize: '13px',
              }}
            >
              ✕ Close
            </button>
          </div>

          {/* Underwater scene */}
          <div
            style={{
              position: 'relative', height: '340px',
              borderRadius: '16px 16px 0 0', overflow: 'hidden',
              background: 'linear-gradient(rgba(12,28,58,0.97) 0%, rgba(8,20,52,0.99) 35%, rgb(6,18,44) 55%, rgb(4,14,36) 75%, rgb(3,10,26) 100%)',
            }}
          >
            <LightRays />
            <Bubbles />
            <BackgroundFish />

            {/* Water surface */}
            <div style={{ position: 'absolute', top: '28%', left: 0, right: 0, height: '28px', zIndex: 3, pointerEvents: 'none' }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                background: 'linear-gradient(90deg, transparent 0%, rgba(160,230,255,0.4) 20%, rgba(200,240,255,0.7) 50%, rgba(160,230,255,0.4) 80%, transparent 100%)',
                animation: 'surfaceShimmer 3s ease-in-out infinite',
              }} />
              <div style={{ position: 'absolute', top: '1px', left: 0, right: 0, height: '20px', background: 'linear-gradient(rgba(100,180,220,0.12),transparent)' }} />
            </div>

            {/* Bobber */}
            <div
              style={{
                position: 'absolute', top: '24%', left: '50%',
                transform: 'translateX(-50%)', zIndex: 5,
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  animation: state === 'bite' ? 'bobberBite 0.35s ease-out forwards' : (state === 'casting' || state === 'waiting' || state === 'reeling') ? 'bobberIdle 3.2s ease-in-out infinite' : 'none',
                }}
              >
                <svg width="20" height="32" viewBox="0 0 20 32">
                  <rect x="9" y="0" width="2" height="8" rx="1" fill="rgba(180,160,120,0.9)" />
                  <ellipse cx="10" cy="20" rx="8" ry="9" fill="#f1f5f9" />
                  <path d="M2,20 A8,9 0 0,0 18,20 Z" fill={state === 'bite' ? '#ef4444' : '#ef4444'} />
                  <rect x="2" y="18" width="16" height="3" rx="1" fill="#1e293b" />
                  <ellipse cx="6" cy="16" rx="2" ry="3" fill="rgba(255,255,255,0.35)" />
                </svg>
              </div>
            </div>

            {/* State overlay messages */}
            {state === 'waiting' && (
              <div style={{ position: 'absolute', bottom: '16px', left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: '13px', letterSpacing: '0.1em' }}>
                Waiting for a bite...
              </div>
            )}

            {state === 'bite' && (
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                textAlign: 'center', animation: 'catchReveal 0.3s ease-out forwards', zIndex: 10,
              }}>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#ef4444', letterSpacing: '2px', textShadow: '0 0 20px rgba(239,68,68,0.8)' }}>
                  FISH ON!
                </div>
                <div style={{ fontSize: '13px', color: '#fca5a5', marginTop: '4px' }}>Reel it in!</div>
              </div>
            )}

            {state === 'caught' && fish && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                animation: 'catchReveal 0.4s ease-out forwards',
                background: fish.rarity === 'legendary' ? 'rgba(0,0,0,0.5)' : 'transparent',
              }}>
                <div style={{ fontSize: '52px', marginBottom: '8px', filter: fish.rarity === 'legendary' ? 'drop-shadow(0 0 20px #fbbf24)' : 'none' }}>{fish.emoji}</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: rc.text, letterSpacing: '1px' }}>{fish.name}</div>
                <div style={{
                  marginTop: '6px', padding: '3px 12px', borderRadius: '20px',
                  background: rc.bg, border: `1px solid ${rc.border}`,
                  color: rc.text, fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase',
                  animation: fish.rarity === 'legendary' ? 'legendaryGlow 1s ease-in-out infinite' : 'none',
                }}>{fish.rarity}</div>
                <div style={{ marginTop: '10px', fontSize: '28px', fontWeight: 800, color: '#fbbf24' }}>+{fish.points} pts</div>
              </div>
            )}

            {state === 'escaped' && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                animation: 'catchReveal 0.3s ease-out forwards',
              }}>
                <div style={{ fontSize: '44px', marginBottom: '8px' }}>💨</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#f87171' }}>It got away!</div>
                <div style={{ fontSize: '13px', color: '#a1a1aa', marginTop: '4px' }}>Not fast enough this time</div>
              </div>
            )}
          </div>

          {/* Control panel */}
          <div
            style={{
              background: 'rgba(4,10,28,0.92)', borderRadius: '0 0 16px 16px',
              border: '1px solid rgba(255,255,255,0.07)', borderTop: 'none',
              padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
            }}
          >
            {/* Status text */}
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'center' }}>
              {state === 'idle' && '🎣 Your rod is ready — cast it!'}
              {state === 'casting' && '🎣 Rod cast — watch the bobber...'}
              {state === 'waiting' && '🐟 Something is circling...'}
              {state === 'bite' && '⚡ STRIKE NOW!'}
              {state === 'reeling' && '🎣 Reeling in...'}
              {state === 'caught' && fish && `✅ ${fish.name} caught! +${fish.points} pts`}
              {state === 'escaped' && '❌ The fish escaped!'}
              {state === 'noauth' && '🔒 Log in to play!'}
              {state === 'cooldown' && `⏳ Next cast available in:`}
            </div>

            {/* Reel progress bar */}
            {state === 'bite' && (
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%', borderRadius: '3px',
                    width: `${reelTimeLeft}%`,
                    background: reelTimeLeft > 60 ? '#22c55e' : reelTimeLeft > 30 ? '#fbbf24' : '#ef4444',
                    transition: 'background 0.2s',
                  }}
                />
              </div>
            )}

            {/* Action button */}
            {state === 'cooldown' && (
              <div style={{
                padding: '14px 32px', borderRadius: '12px', textAlign: 'center',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              }}>
                <div style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'monospace', color: '#fbbf24', letterSpacing: '2px' }}>
                  {formatCountdown(cooldownMs)}
                </div>
                <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px', letterSpacing: '0.1em' }}>
                  HOURS : MINS : SECS
                </div>
              </div>
            )}

            {state === 'idle' && (
              <button
                onClick={castRod}
                style={{
                  padding: '12px 40px', borderRadius: '12px', fontWeight: 800,
                  fontSize: '15px', cursor: 'pointer', letterSpacing: '0.05em',
                  background: 'linear-gradient(145deg, #1d4ed8, #1e40af)',
                  border: '1px solid rgba(59,130,246,0.5)', color: '#fff',
                  boxShadow: '0 0 20px rgba(29,78,216,0.35)',
                }}
              >
                🎣 Cast Rod
              </button>
            )}

            {state === 'bite' && (
              <button
                onClick={reelIn}
                style={{
                  padding: '14px 48px', borderRadius: '12px', fontWeight: 900,
                  fontSize: '16px', cursor: 'pointer', letterSpacing: '0.08em',
                  background: 'linear-gradient(145deg, #dc2626, #b91c1c)',
                  border: '1px solid rgba(239,68,68,0.5)', color: '#fff',
                  animation: 'reelPulse 0.6s ease-in-out infinite',
                }}
              >
                🎣 REEL IN!
              </button>
            )}

            {(state === 'caught' || state === 'escaped') && (
              <button
                onClick={reset}
                style={{
                  padding: '12px 40px', borderRadius: '12px', fontWeight: 700,
                  fontSize: '14px', cursor: 'pointer',
                  background: 'linear-gradient(145deg, #1d4ed8, #1e40af)',
                  border: '1px solid rgba(59,130,246,0.5)', color: '#fff',
                }}
              >
                🎣 Cast Again
              </button>
            )}

            {/* Points + leaderboard */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {user && (
                <span style={{ fontSize: '12px', color: '#fbbf24' }}>
                  🏆 Your total: <strong>{totalPoints.toLocaleString()} pts</strong>
                </span>
              )}
              <button
                onClick={() => setLeaderboardOpen(true)}
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#a1a1aa', borderRadius: '8px', padding: '5px 12px',
                  cursor: 'pointer', fontSize: '12px', letterSpacing: '0.05em',
                }}
              >
                📊 Leaderboard
              </button>
            </div>

            {/* Rarity legend */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {[['common','#94a3b8'],['uncommon','#22c55e'],['rare','#8b5cf6'],['legendary','#fbbf24']].map(([r, c]) => (
                <span key={r} style={{ fontSize: '11px', color: c, opacity: 0.75, letterSpacing: '0.08em' }}>● {r}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <FishingLeaderboard open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />
    </>
  )
}
