import { useState, useEffect, useRef, useCallback } from 'react'
import FishingGame from './FishingGame'
import FishingLeaderboard from './FishingLeaderboard'
import { useSession } from '../hooks/useSession'
import { useSite } from '../contexts/SiteContext'

const COOLDOWN_MS = 12 * 60 * 60 * 1000

// Void entity shapes — wisps, wraiths, spectres, phantom eyes. Deliberately NOT fish-shaped.
const ENTITY_SHAPES = [
  // Wisp — glowing orb with three comet-like energy trails
  (color) => (
    <svg viewBox="0 0 76 40" width="100%" height="100%">
      {/* Energy trails radiating behind (right side = trailing direction) */}
      <path d="M22,20 C36,14 54,11 72,9"  stroke={color} strokeWidth="2.5" fill="none" opacity="0.5" strokeLinecap="round"/>
      <path d="M22,20 C38,20 58,20 76,20"  stroke={color} strokeWidth="3.5" fill="none" opacity="0.45" strokeLinecap="round"/>
      <path d="M22,20 C36,26 54,29 72,31"  stroke={color} strokeWidth="2"   fill="none" opacity="0.45" strokeLinecap="round"/>
      {/* Particle specks along trail */}
      <circle cx="44" cy="15" r="1.8" fill={color} opacity="0.4"/>
      <circle cx="56" cy="12" r="1.2" fill={color} opacity="0.3"/>
      <circle cx="38" cy="27" r="1.5" fill={color} opacity="0.35"/>
      {/* Main orb */}
      <circle cx="16" cy="20" r="14" fill={color} opacity="0.82"/>
      <circle cx="16" cy="20" r="8"  fill={color} opacity="0.35"/>
      <circle cx="16" cy="20" r="4"  fill="rgba(240,210,255,0.3)"/>
      {/* Glowing red eyes */}
      <circle cx="11" cy="17" r="3"  fill="rgba(230,40,60,0.9)"/>
      <circle cx="21" cy="17" r="3"  fill="rgba(230,40,60,0.9)"/>
      <circle cx="11" cy="17" r="1.2" fill="rgba(0,0,0,0.9)"/>
      <circle cx="21" cy="17" r="1.2" fill="rgba(0,0,0,0.9)"/>
    </svg>
  ),

  // Wraith — classic floating ghost silhouette, horizontal with ragged trailing hem
  (color) => (
    <svg viewBox="0 0 80 52" width="100%" height="100%">
      {/* Trailing mist body */}
      <path d="M28,26 C42,18 58,16 72,17 C76,18 78,22 76,26 C74,30 70,30 68,26 C64,22 58,24 54,30 C50,36 46,40 42,36 C38,40 34,36 30,40 C26,36 24,32 28,26Z" fill={color} opacity="0.55"/>
      {/* Rounded head/body at leading edge */}
      <ellipse cx="16" cy="22" rx="14" ry="18" fill={color} opacity="0.88"/>
      {/* Large hollow eyes */}
      <ellipse cx="11" cy="18" rx="4"   ry="5"   fill="rgba(0,0,0,0.9)"/>
      <ellipse cx="22" cy="18" rx="4"   ry="5"   fill="rgba(0,0,0,0.9)"/>
      <ellipse cx="11" cy="19" rx="2"   ry="2.5" fill="rgba(200,30,50,0.8)"/>
      <ellipse cx="22" cy="19" rx="2"   ry="2.5" fill="rgba(200,30,50,0.8)"/>
      {/* Mouth slit */}
      <path d="M10,28 Q16,32 22,28" stroke="rgba(0,0,0,0.7)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    </svg>
  ),

  // Shadow tendril entity — dense core with five writhing tentacles trailing behind
  (color) => (
    <svg viewBox="0 0 88 50" width="100%" height="100%">
      {/* Tentacles trailing to the right */}
      <path d="M28,25 C44,16 60,11 78,8"  stroke={color} strokeWidth="3"   fill="none" opacity="0.55" strokeLinecap="round"/>
      <path d="M28,25 C44,19 62,18 82,20"  stroke={color} strokeWidth="2.5" fill="none" opacity="0.5"  strokeLinecap="round"/>
      <path d="M28,25 C46,25 66,25 88,26"  stroke={color} strokeWidth="2"   fill="none" opacity="0.4"  strokeLinecap="round"/>
      <path d="M28,25 C44,31 62,32 82,30"  stroke={color} strokeWidth="2.5" fill="none" opacity="0.5"  strokeLinecap="round"/>
      <path d="M28,25 C44,34 60,39 78,42"  stroke={color} strokeWidth="3"   fill="none" opacity="0.55" strokeLinecap="round"/>
      {/* Core blob — circular, NOT lens-shaped */}
      <circle cx="18" cy="25" rx="18" fill={color} opacity="0.9" r="18"/>
      <circle cx="18" cy="25" r="10" fill={color} opacity="0.3"/>
      {/* Two vertical slit eyes */}
      <ellipse cx="13" cy="21" rx="3" ry="5" fill="rgba(230,30,50,0.9)"/>
      <ellipse cx="24" cy="21" rx="3" ry="5" fill="rgba(230,30,50,0.9)"/>
      <ellipse cx="13" cy="21" rx="1.2" ry="2.5" fill="rgba(0,0,0,0.95)"/>
      <ellipse cx="24" cy="21" rx="1.2" ry="2.5" fill="rgba(0,0,0,0.95)"/>
    </svg>
  ),

  // Phantom Eye — a single enormous drifting eye, iris and all
  (color) => (
    <svg viewBox="0 0 72 42" width="100%" height="100%">
      {/* Eyelid outline — almond shape */}
      <path d="M4,21 Q18,4 36,4 Q54,4 68,21 Q54,38 36,38 Q18,38 4,21Z" fill={color} opacity="0.78"/>
      {/* Iris ring */}
      <circle cx="36" cy="21" r="13" fill={color} opacity="0.55"/>
      <circle cx="36" cy="21" r="8"  fill="rgba(110,20,40,0.95)"/>
      {/* Pupil */}
      <ellipse cx="36" cy="21" rx="4" ry="5.5" fill="rgba(0,0,0,1)"/>
      {/* Corneal highlight */}
      <circle cx="32" cy="16" r="2.2" fill="rgba(255,200,220,0.35)"/>
      {/* Energy wisps trailing from the back of the eye */}
      <path d="M68,18 Q74,15 72,12" stroke={color} strokeWidth="2"   fill="none" opacity="0.4" strokeLinecap="round"/>
      <path d="M68,21 Q76,21 74,21" stroke={color} strokeWidth="2.5" fill="none" opacity="0.35" strokeLinecap="round"/>
      <path d="M68,24 Q74,27 72,30" stroke={color} strokeWidth="2"   fill="none" opacity="0.4" strokeLinecap="round"/>
    </svg>
  ),
]

const ENTITY_COLORS = [
  'rgba(109,40,217,0.85)',
  'rgba(139,92,246,0.8)',
  'rgba(179,18,63,0.75)',
  'rgba(80,20,120,0.88)',
  'rgba(60,10,90,0.9)',
  'rgba(150,30,100,0.82)',
]

function getRandom(min, max) { return min + Math.random() * (max - min) }

export default function FishingEasterEgg() {
  const { user } = useSession()
  const { fishingEnabled } = useSite()
  const [visible, setVisible] = useState(false)
  const [entityProps, setEntityProps] = useState(null)
  const [gameOpen, setGameOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const scheduleRef = useRef(null)

  function isInCooldown() {
    const local = localStorage.getItem('fishingLastCastAt')
    if (local && Date.now() - Number(local) < COOLDOWN_MS) return true
    if (!user?.lastFishedAt) return false
    const last = new Date(user.lastFishedAt.replace(' ', 'T') + 'Z').getTime()
    return Date.now() - last < COOLDOWN_MS
  }

  const spawnEntity = useCallback(() => {
    const goRight = Math.random() > 0.5
    const variantIdx = Math.floor(Math.random() * ENTITY_SHAPES.length)
    const colorIdx   = Math.floor(Math.random() * ENTITY_COLORS.length)
    const sizeW      = Math.floor(getRandom(52, 84))
    const sizeH      = Math.floor(sizeW * 0.52)
    const topPct     = getRandom(18, 80)
    const duration   = getRandom(14, 24)
    if (!fishingEnabled || isInCooldown()) { scheduleNext(); return }
    setEntityProps({ goRight, variantIdx, colorIdx, sizeW, sizeH, topPct, duration, key: Date.now() })
    setVisible(true)
  }, [fishingEnabled, user])

  const scheduleNext = useCallback(() => {
    scheduleRef.current = setTimeout(spawnEntity, getRandom(30000, 90000))
  }, [spawnEntity])

  useEffect(() => {
    const init = setTimeout(spawnEntity, getRandom(8000, 20000))
    return () => { clearTimeout(init); clearTimeout(scheduleRef.current) }
  }, [spawnEntity])

  useEffect(() => {
    function onCooldown() { setVisible(false); clearTimeout(scheduleRef.current) }
    window.addEventListener('fishingCooldownStart', onCooldown)
    return () => window.removeEventListener('fishingCooldownStart', onCooldown)
  }, [])

  function onAnimationEnd() { setVisible(false); scheduleNext() }

  function handleClick(e) {
    e.stopPropagation()
    setVisible(false)
    clearTimeout(scheduleRef.current)
    setGameOpen(true)
  }

  useEffect(() => {
    function handler() { setLeaderboardOpen(true) }
    window.addEventListener('openFishingLeaderboard', handler)
    return () => window.removeEventListener('openFishingLeaderboard', handler)
  }, [])

  if (!entityProps) return (
    <>
      <FishingGame open={gameOpen} onClose={() => { setGameOpen(false); scheduleNext() }} />
      <FishingLeaderboard open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />
    </>
  )

  const { goRight, variantIdx, colorIdx, sizeW, sizeH, topPct, duration, key } = entityProps
  const EntityShape = ENTITY_SHAPES[variantIdx]
  const color = ENTITY_COLORS[colorIdx]
  const animName = goRight ? `voidDriftR_${key}` : `voidDriftL_${key}`

  return (
    <>
      <style>{`
        @keyframes ${animName} {
          0%   { transform: ${goRight ? 'scaleX(-1) translateX(0)' : 'translateX(0)'}; opacity: 0; }
          6%   { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: ${goRight ? 'scaleX(-1) translateX(calc(-100vw - 140px))' : 'translateX(calc(-100vw - 140px))'}; opacity: 0; }
        }
      `}</style>
      {visible && (
        <div
          style={{
            position: 'fixed', top: `${topPct}%`,
            left: goRight ? '-8%' : '108%',
            zIndex: 9000, pointerEvents: 'none',
            animation: `${animName} ${duration}s linear forwards`,
            filter: 'blur(0.5px)',
          }}
          onAnimationEnd={onAnimationEnd}
        >
          <div
            onClick={handleClick}
            title="Something drifts through the veil..."
            style={{
              width: sizeW, height: sizeH,
              cursor: 'pointer', pointerEvents: 'auto',
              filter: 'drop-shadow(0 0 8px rgba(109,40,217,0.5))',
              transition: 'filter 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'drop-shadow(0 0 16px rgba(179,18,63,0.9)) drop-shadow(0 0 8px rgba(109,40,217,0.6))')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'drop-shadow(0 0 8px rgba(109,40,217,0.5))')}
          >
            <EntityShape color={color} />
          </div>
        </div>
      )}

      <FishingGame open={gameOpen} onClose={() => { setGameOpen(false); scheduleNext() }} />
      <FishingLeaderboard open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />
    </>
  )
}
