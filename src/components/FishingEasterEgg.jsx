import { useState, useEffect, useRef, useCallback } from 'react'
import FishingGame from './FishingGame'
import FishingLeaderboard from './FishingLeaderboard'

// Several distinct fish SVG shapes to vary the look
const FISH_VARIANTS = [
  // Classic fish (body + tail)
  (color) => (
    <svg viewBox="0 0 80 36" width="100%" height="100%">
      <path d="M12,18 C24,5 52,5 66,18 C52,31 24,31 12,18 Z" fill={color} opacity="0.85" />
      <path d="M66,18 L80,8 L76,18 L80,28 Z" fill={color} opacity="0.75" />
      <circle cx="22" cy="14" r="3" fill="rgba(255,255,255,0.5)" />
      <circle cx="21" cy="14" r="1.5" fill="rgba(0,0,0,0.6)" />
    </svg>
  ),
  // Rounder fish
  (color) => (
    <svg viewBox="0 0 80 40" width="100%" height="100%">
      <ellipse cx="36" cy="20" rx="26" ry="14" fill={color} opacity="0.85" />
      <path d="M62,20 L80,10 L74,20 L80,30 Z" fill={color} opacity="0.7" />
      <path d="M18,20 C22,26 50,26 62,20" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" fill="none" />
      <circle cx="24" cy="15" r="3.5" fill="rgba(255,255,255,0.45)" />
      <circle cx="23" cy="15" r="1.8" fill="rgba(0,0,0,0.5)" />
    </svg>
  ),
  // Thin sleek fish
  (color) => (
    <svg viewBox="0 0 88 28" width="100%" height="100%">
      <path d="M8,14 C22,6 54,6 72,14 C54,22 22,22 8,14 Z" fill={color} opacity="0.9" />
      <path d="M72,14 L88,4 L83,14 L88,24 Z" fill={color} opacity="0.65" />
      <path d="M30,10 Q50,8 68,10" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" fill="none" />
      <circle cx="18" cy="11" r="2.5" fill="rgba(255,255,255,0.5)" />
      <circle cx="17" cy="11" r="1.2" fill="rgba(0,0,0,0.7)" />
    </svg>
  ),
  // Chubby fish with fins
  (color) => (
    <svg viewBox="0 0 76 42" width="100%" height="100%">
      <path d="M10,21 C20,6 50,6 64,21 C50,36 20,36 10,21 Z" fill={color} opacity="0.88" />
      <path d="M64,21 L76,12 L71,21 L76,30 Z" fill={color} opacity="0.7" />
      <path d="M28,8 L32,2 L36,8 Z" fill={color} opacity="0.6" />
      <path d="M30,33 L34,40 L38,33 Z" fill={color} opacity="0.55" />
      <circle cx="20" cy="16" r="4" fill="rgba(255,255,255,0.45)" />
      <circle cx="19" cy="16" r="2" fill="rgba(0,0,0,0.6)" />
    </svg>
  ),
]

const FISH_COLORS = [
  'rgba(80,140,210,0.9)',    // blue
  'rgba(90,180,130,0.85)',   // teal
  'rgba(170,100,200,0.85)',  // purple
  'rgba(200,140,60,0.88)',   // orange
  'rgba(200,80,90,0.8)',     // red
  'rgba(60,160,180,0.85)',   // cyan
]

function getRandomBetween(min, max) {
  return min + Math.random() * (max - min)
}

export default function FishingEasterEgg() {
  const [visible, setVisible] = useState(false)
  const [fishProps, setFishProps] = useState(null)
  const [gameOpen, setGameOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const scheduleRef = useRef(null)

  const spawnFish = useCallback(() => {
    const goRight = Math.random() > 0.5
    const variantIdx = Math.floor(Math.random() * FISH_VARIANTS.length)
    const colorIdx = Math.floor(Math.random() * FISH_COLORS.length)
    const sizeW = Math.floor(getRandomBetween(40, 72)) // width in px
    const sizeH = Math.floor(sizeW * 0.5)
    const topPct = getRandomBetween(18, 78)
    const duration = getRandomBetween(12, 22)

    setFishProps({ goRight, variantIdx, colorIdx, sizeW, sizeH, topPct, duration, key: Date.now() })
    setVisible(true)
  }, [])

  const scheduleNext = useCallback(() => {
    const delay = getRandomBetween(30000, 90000)
    scheduleRef.current = setTimeout(() => spawnFish(), delay)
  }, [spawnFish])

  useEffect(() => {
    // First fish appears after 8-20s to let the page load
    const initial = setTimeout(() => spawnFish(), getRandomBetween(8000, 20000))
    return () => { clearTimeout(initial); clearTimeout(scheduleRef.current) }
  }, [spawnFish])

  function onAnimationEnd() {
    setVisible(false)
    scheduleNext()
  }

  function handleFishClick(e) {
    e.stopPropagation()
    setVisible(false)
    clearTimeout(scheduleRef.current)
    setGameOpen(true)
  }

  // Listen for external leaderboard open requests (from Navbar)
  useEffect(() => {
    function handler() { setLeaderboardOpen(true) }
    window.addEventListener('openFishingLeaderboard', handler)
    return () => window.removeEventListener('openFishingLeaderboard', handler)
  }, [])

  if (!fishProps) return null

  const { goRight, variantIdx, colorIdx, sizeW, sizeH, topPct, duration, key } = fishProps
  const FishShape = FISH_VARIANTS[variantIdx]
  const color = FISH_COLORS[colorIdx]

  const animName = goRight ? `eggFishR_${key}` : `eggFishL_${key}`

  return (
    <>
      <style>{`
        @keyframes ${animName} {
          0%   { transform: ${goRight ? 'scaleX(-1) translateX(0)' : 'translateX(0)'}; opacity: 0; }
          5%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { transform: ${goRight ? 'scaleX(-1) translateX(calc(-100vw - 120px))' : 'translateX(calc(-100vw - 120px))'}; opacity: 0; }
        }
      `}</style>
      {visible && (
        <div
          style={{
            position: 'fixed',
            top: `${topPct}%`,
            left: goRight ? '-8%' : '108%',
            zIndex: 9000,
            pointerEvents: 'none',
            animation: `${animName} ${duration}s linear forwards`,
          }}
          onAnimationEnd={onAnimationEnd}
        >
          <div
            onClick={handleFishClick}
            title="🎣 A wild fish! Click to fish!"
            style={{
              width: sizeW, height: sizeH,
              cursor: 'pointer',
              pointerEvents: 'auto',
              filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))',
              transition: 'filter 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'drop-shadow(0 0 12px rgba(255,255,200,0.8)) drop-shadow(0 2px 6px rgba(0,0,0,0.4))')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))')}
          >
            <FishShape color={color} />
          </div>
        </div>
      )}

      <FishingGame open={gameOpen} onClose={() => { setGameOpen(false); scheduleNext() }} />
      <FishingLeaderboard open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />
    </>
  )
}
