import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from '../hooks/useSession'
import { API_BASE_URL } from '../config/api'
import FishingLeaderboard from './FishingLeaderboard'

const ENTITIES = [
  { name: 'Wisp',           rarity: 'common',    glyph: '◦', essence: 10,   weight: 28 },
  { name: 'Shade',          rarity: 'common',    glyph: '◌', essence: 12,   weight: 24 },
  { name: 'Wraith',         rarity: 'common',    glyph: '◈', essence: 15,   weight: 18 },
  { name: 'Shadow Lurker',  rarity: 'uncommon',  glyph: '⟁', essence: 50,   weight: 10 },
  { name: 'Void Walker',    rarity: 'uncommon',  glyph: '⌬', essence: 75,   weight: 8  },
  { name: 'Soul Eater',     rarity: 'uncommon',  glyph: '⟟', essence: 100,  weight: 5  },
  { name: 'Abyssal Drake',  rarity: 'rare',      glyph: '⟒', essence: 250,  weight: 3  },
  { name: 'Nightmare',      rarity: 'rare',      glyph: '⌖', essence: 350,  weight: 2  },
  { name: 'Soul Reaper',    rarity: 'rare',      glyph: '⍟', essence: 500,  weight: 1  },
  { name: 'Elder Lich',     rarity: 'legendary', glyph: '⊕', essence: 1000, weight: 0.5},
  { name: 'Void Leviathan', rarity: 'legendary', glyph: '⊗', essence: 1500, weight: 0.3},
  { name: 'The Unnamed',    rarity: 'legendary', glyph: '☽', essence: 2500, weight: 0.2},
]

const RARITY_COLORS = {
  common:    { text: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.3)' },
  uncommon:  { text: '#22c55e', bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.3)'   },
  rare:      { text: '#8b5cf6', bg: 'rgba(139,92,246,0.15)',  border: 'rgba(139,92,246,0.3)'  },
  legendary: { text: '#fbbf24', bg: 'rgba(251,191,36,0.15)',  border: 'rgba(251,191,36,0.4)'  },
}

const RARITY_WAIT  = { common: [3000,8000], uncommon: [5000,12000], rare: [8000,15000], legendary: [10000,18000] }
const REEL_WINDOW  = { common: 4500, uncommon: 3800, rare: 3200, legendary: 2600 }
const COOLDOWN_MS  = 12 * 60 * 60 * 1000

function formatCountdown(ms) {
  if (ms <= 0) return '0:00:00'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

function weightedRandom(items) {
  const total = items.reduce((s, e) => s + e.weight, 0)
  let r = Math.random() * total
  for (const e of items) { r -= e.weight; if (r <= 0) return e }
  return items[items.length - 1]
}

function Particles() {
  const pts = Array.from({ length: 14 }, (_, i) => ({
    left: `${6 + i * 7}%`, bottom: `${10 + (i % 6) * 14}%`,
    size: [2, 3, 4][i % 3], duration: 4 + i * 0.3, delay: i * 0.45,
  }))
  return (
    <>
      {pts.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', left: p.left, bottom: p.bottom,
          width: p.size, height: p.size, borderRadius: '50%',
          background: 'rgba(139,92,246,0.35)',
          boxShadow: '0 0 4px rgba(139,92,246,0.5)',
          animation: `voidParticle ${p.duration}s ease-in ${p.delay}s infinite`,
          pointerEvents: 'none',
        }} />
      ))}
    </>
  )
}

function VoidRays() {
  return (
    <>
      {[
        { left: '12%', rotate: '-15deg', delay: '0s' },
        { left: '32%', rotate: '-6deg',  delay: '1.4s' },
        { left: '58%', rotate: '5deg',   delay: '0.8s' },
        { left: '78%', rotate: '14deg',  delay: '2s' },
      ].map((r, i) => (
        <div key={i} style={{
          position: 'absolute', top: 0, left: r.left,
          width: '36px', height: '65%',
          transform: `rotate(${r.rotate})`, transformOrigin: 'center top',
          background: 'linear-gradient(rgba(109,40,217,0.08),transparent)',
          animation: `rayPulseVoid 5s ease-in-out ${r.delay} infinite`,
          pointerEvents: 'none',
        }} />
      ))}
    </>
  )
}

function ShadowEntities() {
  const entities = [
    { top: '52%', size: 50, opacity: 0.1, duration: '20s', delay: '0s',  dir: 'r' },
    { top: '70%', size: 70, opacity: 0.07, duration: '28s', delay: '6s',  dir: 'l' },
    { top: '42%', size: 34, opacity: 0.13, duration: '16s', delay: '11s', dir: 'r' },
    { top: '78%', size: 88, opacity: 0.05, duration: '34s', delay: '3s',  dir: 'l' },
  ]
  return (
    <>
      {entities.map((e, i) => (
        <svg key={i} viewBox="0 0 70 40" width={e.size} height={e.size * 0.57}
          style={{
            position: 'absolute', top: e.top,
            left: e.dir === 'r' ? '-8%' : '108%',
            opacity: e.opacity,
            animation: `${e.dir === 'r' ? 'fishDriftR' : 'fishDriftL'} ${e.duration} linear ${e.delay} infinite`,
            pointerEvents: 'none', filter: 'blur(2px)',
          }}
        >
          <ellipse cx="32" cy="20" rx="24" ry="12" fill="rgba(109,40,217,0.5)" />
          <path d="M56,20 Q65,12 70,8 Q66,20 70,32 Q65,28 56,20Z" fill="rgba(109,40,217,0.4)" />
          <ellipse cx="20" cy="16" rx="4" ry="5" fill="rgba(179,18,63,0.4)" />
        </svg>
      ))}
    </>
  )
}

function Sigil({ state }) {
  const pulse = state === 'bite'
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" style={{
      filter: pulse ? 'drop-shadow(0 0 12px rgba(179,18,63,0.9)) drop-shadow(0 0 24px rgba(179,18,63,0.5))' : 'drop-shadow(0 0 6px rgba(139,92,246,0.6))',
      transition: 'filter 0.2s',
    }}>
      <circle cx="18" cy="18" r="16" fill="none" stroke={pulse ? 'rgba(179,18,63,0.7)' : 'rgba(139,92,246,0.4)'} strokeWidth="1"/>
      <circle cx="18" cy="18" r="11" fill="none" stroke={pulse ? 'rgba(179,18,63,0.4)' : 'rgba(139,92,246,0.2)'} strokeWidth="0.5"/>
      <path d="M18,2 L18,34 M2,18 L34,18 M5,5 L31,31 M31,5 L5,31" stroke={pulse ? 'rgba(179,18,63,0.4)' : 'rgba(139,92,246,0.25)'} strokeWidth="0.5"/>
      <circle cx="18" cy="18" r="5" fill={pulse ? 'rgba(179,18,63,0.2)' : 'rgba(139,92,246,0.1)'} stroke={pulse ? 'rgba(179,18,63,0.8)' : 'rgba(139,92,246,0.6)'} strokeWidth="1"/>
      <circle cx="18" cy="18" r="2.5" fill={pulse ? 'rgba(220,60,60,0.5)' : 'rgba(180,140,255,0.3)'}/>
    </svg>
  )
}

export default function FishingGame({ open, onClose }) {
  const { user } = useSession()
  const [state, setState] = useState('idle')
  const [entity, setEntity] = useState(null)
  const [reelTimeLeft, setReelTimeLeft] = useState(100)
  const [shake, setShake] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [totalEssence, setTotalEssence] = useState(user?.fishingPoints || 0)
  const [cooldownMs, setCooldownMs] = useState(0)
  const waitTimerRef  = useRef(null)
  const reelTimerRef  = useRef(null)
  const reelStartRef  = useRef(null)
  const animFrameRef  = useRef(null)
  const countdownRef  = useRef(null)
  const castTimeRef   = useRef(null)

  const cleanup = useCallback(() => {
    clearTimeout(waitTimerRef.current)
    clearTimeout(reelTimerRef.current)
    clearInterval(countdownRef.current)
    cancelAnimationFrame(animFrameRef.current)
  }, [])

  useEffect(() => {
    if (!open) { cleanup(); setState('idle'); setEntity(null) }
    return cleanup
  }, [open, cleanup])

  useEffect(() => {
    if (!open || !user?.lastFishedAt) return
    const last = new Date(user.lastFishedAt.replace(' ', 'T') + 'Z')
    const remaining = (last.getTime() + COOLDOWN_MS) - Date.now()
    if (remaining > 0) { setCooldownMs(remaining); setState('cooldown') }
  }, [open, user])

  useEffect(() => {
    if (state !== 'cooldown' && state !== 'caught' && state !== 'escaped') { clearInterval(countdownRef.current); return }
    countdownRef.current = setInterval(() => {
      setCooldownMs(prev => {
        const next = prev - 1000
        if (next <= 0) { clearInterval(countdownRef.current); setState('idle'); return 0 }
        return next
      })
    }, 1000)
    return () => clearInterval(countdownRef.current)
  }, [state])

  async function lowerMirror() {
    if (!user) { setState('noauth'); return }
    const token = localStorage.getItem('occultusSession')
    try {
      const res = await fetch(`${API_BASE_URL}/api/fishing/cast`, {
        method: 'POST', headers: { Authorization: token },
      })
      const data = await res.json()
      if (!data.ok) { setCooldownMs(data.msRemaining || 0); setState('cooldown'); return }
    } catch { return }
    castTimeRef.current = Date.now()
    setState('casting')
    const chosen = weightedRandom(ENTITIES)
    setEntity(chosen)
    const [min, max] = RARITY_WAIT[chosen.rarity]
    const wait = min + Math.random() * (max - min)
    waitTimerRef.current = setTimeout(() => {
      setState('bite')
      setShake(true)
      setTimeout(() => setShake(false), 600)
      reelTimerRef.current = setTimeout(() => {
        setState('escaped')
        const elapsed = castTimeRef.current ? Date.now() - castTimeRef.current : 0
        setCooldownMs(Math.max(0, COOLDOWN_MS - elapsed))
      }, REEL_WINDOW[chosen.rarity])
    }, wait)
  }

  function startReelAnimation(ent) {
    const window_ = REEL_WINDOW[ent.rarity]
    reelStartRef.current = performance.now()
    function tick(now) {
      const pct = Math.max(0, 100 - ((now - reelStartRef.current) / window_) * 100)
      setReelTimeLeft(pct)
      if (pct > 0) animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    if (state === 'bite' && entity) startReelAnimation(entity)
    if (state !== 'bite') { cancelAnimationFrame(animFrameRef.current); setReelTimeLeft(100) }
  }, [state, entity])

  async function bindEntity() {
    if (state !== 'bite') return
    cleanup()
    setState('reeling')
    setTimeout(async () => {
      setState('caught')
      const elapsed = castTimeRef.current ? Date.now() - castTimeRef.current : 0
      setCooldownMs(Math.max(0, COOLDOWN_MS - elapsed))
      if (user) {
        try {
          const token = localStorage.getItem('occultusSession')
          const res = await fetch(`${API_BASE_URL}/api/fishing/catch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token },
            body: JSON.stringify({ fishName: entity.name, fishRarity: entity.rarity, points: entity.essence }),
          })
          const data = await res.json()
          if (data.totalPoints != null) setTotalEssence(data.totalPoints)
        } catch { /* ignore */ }
      }
    }, 600)
  }

  function reset() {
    cleanup(); setEntity(null); setReelTimeLeft(100)
    const elapsed = castTimeRef.current ? Date.now() - castTimeRef.current : 0
    setCooldownMs(Math.max(0, COOLDOWN_MS - elapsed))
    setState('cooldown')
  }

  if (!open) return null

  const rc = entity ? RARITY_COLORS[entity.rarity] : null

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px',
        }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <style>{`
          @keyframes voidParticle {
            0%   { transform: translateY(0) scale(1); opacity: 0.6; }
            100% { transform: translateY(-140px) translateX(10px) scale(0.2); opacity: 0; }
          }
          @keyframes rayPulseVoid {
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
          @keyframes voidSurface {
            0%, 100% { opacity: 0.5; transform: scaleX(1); }
            50%       { opacity: 0.9; transform: scaleX(1.015); }
          }
          @keyframes sigilIdle {
            0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.8; }
            33%       { transform: translateY(-4px) rotate(2deg); opacity: 1; }
            66%       { transform: translateY(3px) rotate(-1.5deg); opacity: 0.9; }
          }
          @keyframes sigilBite {
            0%   { transform: translateY(0) scale(1); }
            25%  { transform: translateY(30px) scale(1.3); }
            55%  { transform: translateY(24px) scale(1.15); }
            100% { transform: translateY(28px) scale(1.2); }
          }
          @keyframes voidShake {
            0%,100% { transform: translate(0,0); }
            15%      { transform: translate(-6px,-4px); }
            30%      { transform: translate(6px,4px); }
            45%      { transform: translate(-5px,5px); }
            60%      { transform: translate(5px,-5px); }
            75%      { transform: translate(-3px,3px); }
          }
          @keyframes voidReveal {
            0%   { transform: translateY(30px) scale(0.8); opacity: 0; }
            100% { transform: translateY(0) scale(1); opacity: 1; }
          }
          @keyframes bindPulse {
            0%,100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(179,18,63,0.6); }
            50%      { transform: scale(1.05); box-shadow: 0 0 0 14px rgba(179,18,63,0); }
          }
          @keyframes legendaryVoid {
            0%,100% { box-shadow: 0 0 20px rgba(251,191,36,0.4); }
            50%      { box-shadow: 0 0 55px rgba(251,191,36,0.9), 0 0 90px rgba(251,191,36,0.3); }
          }
          @media (max-width: 480px) {
            .fishing-scene   { height: 220px !important; }
            .fishing-btn     { padding: 11px 24px !important; width: 100%; }
            .fishing-btn-big { padding: 13px 24px !important; width: 100%; font-size: 15px !important; }
          }
        `}</style>

        <div style={{
          width: '100%', maxWidth: '520px',
          animation: shake ? 'voidShake 0.55s ease-out forwards' : 'none',
        }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              color: "var(--text-secondary)", borderRadius: '8px', padding: '6px 14px',
              cursor: 'pointer', fontSize: '13px',
            }}>✕ Close</button>
          </div>

          {/* Abyss scene */}
          <div className="fishing-scene" style={{
            position: 'relative', height: '340px',
            borderRadius: '16px 16px 0 0', overflow: 'hidden',
            background: 'linear-gradient(rgba(8,4,24,0.99) 0%, rgba(14,5,36,0.99) 30%, rgba(18,4,50,0.98) 55%, rgba(10,2,28,1) 75%, rgba(4,1,14,1) 100%)',
          }}>
            <VoidRays />
            <Particles />
            <ShadowEntities />

            {/* Void surface shimmer */}
            <div style={{ position: 'absolute', top: '28%', left: 0, right: 0, height: '28px', zIndex: 3, pointerEvents: 'none' }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                background: 'linear-gradient(90deg, transparent 0%, rgba(109,40,217,0.3) 20%, rgba(179,18,63,0.5) 50%, rgba(109,40,217,0.3) 80%, transparent 100%)',
                animation: 'voidSurface 3.5s ease-in-out infinite',
              }} />
              <div style={{ position: 'absolute', top: '1px', left: 0, right: 0, height: '20px', background: 'linear-gradient(rgba(109,40,217,0.08),transparent)' }} />
            </div>

            {/* Scrying sigil */}
            <div style={{ position: 'absolute', top: '22%', left: '50%', transform: 'translateX(-50%)', zIndex: 5 }}>
              <div style={{
                display: 'inline-block',
                animation: state === 'bite' ? 'sigilBite 0.35s ease-out forwards' : (state === 'casting' || state === 'waiting') ? 'sigilIdle 4s ease-in-out infinite' : 'sigilIdle 4s ease-in-out infinite',
              }}>
                <Sigil state={state} />
              </div>
            </div>

            {/* State overlays */}
            {state === 'casting' && (
              <div style={{ position: 'absolute', bottom: '16px', left: 0, right: 0, textAlign: 'center', color: 'rgba(139,92,246,0.5)', fontSize: '13px', letterSpacing: '0.12em' }}>
                The mirror descends into the void...
              </div>
            )}
            {state === 'waiting' && (
              <div style={{ position: 'absolute', bottom: '16px', left: 0, right: 0, textAlign: 'center', color: 'rgba(139,92,246,0.45)', fontSize: '13px', letterSpacing: '0.1em' }}>
                Something stirs in the darkness...
              </div>
            )}

            {state === 'bite' && (
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                textAlign: 'center', animation: 'voidReveal 0.3s ease-out forwards', zIndex: 10,
              }}>
                <div style={{ fontSize: '26px', fontWeight: 800, color: '#dc2626', letterSpacing: '3px', textShadow: '0 0 20px rgba(220,38,38,0.9)', fontFamily: 'Cinzel, serif' }}>
                  A PRESENCE STIRS
                </div>
                <div style={{ fontSize: '13px', color: '#fca5a5', marginTop: '6px', letterSpacing: '0.08em' }}>Bind it before it escapes</div>
              </div>
            )}

            {state === 'caught' && entity && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                animation: 'voidReveal 0.4s ease-out forwards',
                background: entity.rarity === 'legendary' ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.2)',
              }}>
                <div style={{ fontSize: '52px', marginBottom: '8px', fontFamily: 'monospace',
                  filter: entity.rarity === 'legendary' ? 'drop-shadow(0 0 20px #fbbf24)' : `drop-shadow(0 0 10px ${rc.text})`,
                  color: rc.text,
                }}>{entity.glyph}</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: rc.text, letterSpacing: '2px', fontFamily: 'Cinzel, serif' }}>{entity.name}</div>
                <div style={{
                  marginTop: '6px', padding: '3px 14px', borderRadius: '20px',
                  background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text,
                  fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase',
                  animation: entity.rarity === 'legendary' ? 'legendaryVoid 1s ease-in-out infinite' : 'none',
                }}>{entity.rarity}</div>
                <div style={{ marginTop: '10px', fontSize: '28px', fontWeight: 800, color: '#fbbf24', fontFamily: 'Cinzel, serif' }}>+{entity.essence} essence</div>
              </div>
            )}

            {state === 'escaped' && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                animation: 'voidReveal 0.3s ease-out forwards',
              }}>
                <div style={{ fontSize: '40px', marginBottom: '8px', color: 'rgba(139,92,246,0.6)', fontFamily: 'monospace' }}>⊘</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#f87171', fontFamily: 'Cinzel, serif' }}>It slipped back into the void</div>
                <div style={{ fontSize: '13px', color: "var(--text-secondary)", marginTop: '6px' }}>The mirror grows dark once more</div>
              </div>
            )}
          </div>

          {/* Control panel */}
          <div style={{
            background: 'rgba(4,2,14,0.95)', borderRadius: '0 0 16px 16px',
            border: '1px solid rgba(109,40,217,0.2)', borderTop: 'none',
            padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
          }}>
            <div style={{ fontSize: '12px', color: 'rgba(180,160,220,0.65)', letterSpacing: '0.14em', textTransform: 'uppercase', textAlign: 'center' }}>
              {state === 'idle'     && '🔮 The mirror awaits — peer into the void'}
              {state === 'casting'  && '🔮 Mirror descending...'}
              {state === 'waiting'  && '👁 The void is aware of you...'}
              {state === 'bite'     && '⚡ Strike now — bind the entity!'}
              {state === 'reeling'  && '🔮 Binding...'}
              {state === 'caught'   && entity && `✦ ${entity.name} bound — +${entity.essence} essence`}
              {state === 'escaped'  && '✦ The presence retreated into darkness'}
              {state === 'noauth'   && '🔒 You must be initiated to scry'}
              {(state === 'cooldown' || state === 'caught' || state === 'escaped') && '⏳ The mirror must rest — next scrying in:'}
            </div>

            {state === 'bite' && (
              <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: '3px', width: `${reelTimeLeft}%`,
                  background: reelTimeLeft > 60 ? '#7c3aed' : reelTimeLeft > 30 ? '#dc2626' : '#ff1a1a',
                  transition: 'background 0.2s',
                  boxShadow: `0 0 6px ${reelTimeLeft > 60 ? '#7c3aed' : '#dc2626'}`,
                }} />
              </div>
            )}

            {(state === 'cooldown' || state === 'caught' || state === 'escaped') && (
              <div style={{
                padding: '14px 32px', borderRadius: '12px', textAlign: 'center',
                background: 'rgba(109,40,217,0.08)', border: '1px solid rgba(109,40,217,0.2)',
              }}>
                <div style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'monospace', color: '#a78bfa', letterSpacing: '2px' }}>
                  {formatCountdown(cooldownMs)}
                </div>
                <div style={{ fontSize: '11px', color: '#6d28d9', marginTop: '4px', letterSpacing: '0.1em' }}>HOURS · MINS · SECS</div>
              </div>
            )}

            {state === 'idle' && (
              <button className="fishing-btn" onClick={lowerMirror} style={{
                padding: '12px 40px', borderRadius: '12px', fontWeight: 800,
                fontSize: '14px', cursor: 'pointer', letterSpacing: '0.08em',
                background: 'linear-gradient(145deg, rgba(109,40,217,0.6), rgba(179,18,63,0.4))',
                border: '1px solid rgba(109,40,217,0.5)', color: '#e9d5ff',
                boxShadow: '0 0 20px rgba(109,40,217,0.3)', fontFamily: 'Cinzel, serif',
              }}>
                🔮 Peer into the Void
              </button>
            )}

            {state === 'bite' && (
              <button className="fishing-btn-big" onClick={bindEntity} style={{
                padding: '14px 48px', borderRadius: '12px', fontWeight: 900,
                fontSize: '16px', cursor: 'pointer', letterSpacing: '0.1em',
                background: 'linear-gradient(145deg, #7c0d0d, #b91c1c)',
                border: '1px solid rgba(239,68,68,0.5)', color: '#fff',
                animation: 'bindPulse 0.55s ease-in-out infinite', fontFamily: 'Cinzel, serif',
              }}>
                ⊕ BIND IT
              </button>
            )}


            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {user && (
                <span style={{ fontSize: '12px', color: '#fbbf24', letterSpacing: '0.05em' }}>
                  ✦ Essence bound: <strong>{totalEssence.toLocaleString()}</strong>
                </span>
              )}
              <button onClick={() => setLeaderboardOpen(true)} style={{
                background: 'rgba(109,40,217,0.1)', border: '1px solid rgba(109,40,217,0.25)',
                color: '#a78bfa', borderRadius: '8px', padding: '5px 12px',
                cursor: 'pointer', fontSize: '12px', letterSpacing: '0.05em',
              }}>
                📜 The Void Seers
              </button>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {[['common','#94a3b8','Wisp'],['uncommon','#22c55e','Shade'],['rare','#8b5cf6','Drake'],['legendary','#fbbf24','Ancient']].map(([r,c,ex]) => (
                <span key={r} style={{ fontSize: '11px', color: c, opacity: 0.7, letterSpacing: '0.06em' }}>◈ {ex}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <FishingLeaderboard open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />
    </>
  )
}
