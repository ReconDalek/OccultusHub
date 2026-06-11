import { useState, useEffect, useRef, useCallback } from 'react'
import RuneCastingGame from './RuneCastingGame'
import RuneLeaderboard from './RuneLeaderboard'
import { useSession } from '../hooks/useSession'
import { useSite } from '../contexts/SiteContext'

const COOLDOWN_MS = 12 * 60 * 60 * 1000

const RUNE_SYMBOLS = ['ᚠ','ᚢ','ᚦ','ᚨ','ᚱ','ᚲ','ᚷ','ᚹ','ᚺ','ᚾ','ᛊ','ᛏ','ᛚ','⊕','☽','⊗']
const RUNE_COLORS  = [
  'rgba(139,92,246,0.9)',
  'rgba(109,40,217,0.85)',
  'rgba(179,18,63,0.8)',
  'rgba(200,100,240,0.82)',
  'rgba(251,191,36,0.85)',
]

function getRandom(min, max) { return min + Math.random() * (max - min) }

export default function RuneEasterEgg() {
  const { user } = useSession()
  const { runesEnabled } = useSite()
  const [visible, setVisible] = useState(false)
  const [props, setProps] = useState(null)
  const [gameOpen, setGameOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const scheduleRef = useRef(null)

  function isInCooldown() {
    if (!user?.lastRuneCastAt) return false
    const last = new Date(user.lastRuneCastAt.replace(' ', 'T') + 'Z').getTime()
    return Date.now() - last < COOLDOWN_MS
  }

  const spawn = useCallback(() => {
    const goRight = Math.random() > 0.5
    const symbol = RUNE_SYMBOLS[Math.floor(Math.random() * RUNE_SYMBOLS.length)]
    const color  = RUNE_COLORS[Math.floor(Math.random() * RUNE_COLORS.length)]
    const size   = Math.floor(getRandom(22, 40))
    const topPct = getRandom(15, 82)
    const duration = getRandom(16, 28)
    const rotate = getRandom(-20, 20)
    if (!runesEnabled || isInCooldown()) { scheduleNext(); return }
    setProps({ goRight, symbol, color, size, topPct, duration, rotate, key: Date.now() })
    setVisible(true)
  }, [runesEnabled, user])

  const scheduleNext = useCallback(() => {
    scheduleRef.current = setTimeout(spawn, getRandom(45000, 100000))
  }, [spawn])

  useEffect(() => {
    const init = setTimeout(spawn, getRandom(15000, 35000))
    return () => { clearTimeout(init); clearTimeout(scheduleRef.current) }
  }, [spawn])

  function onAnimEnd() { setVisible(false); scheduleNext() }

  function handleClick(e) {
    e.stopPropagation()
    setVisible(false)
    clearTimeout(scheduleRef.current)
    setGameOpen(true)
  }

  useEffect(() => {
    function handler() { setLeaderboardOpen(true) }
    window.addEventListener('openRuneLeaderboard', handler)
    return () => window.removeEventListener('openRuneLeaderboard', handler)
  }, [])

  if (!props) return (
    <>
      <RuneCastingGame open={gameOpen} onClose={() => { setGameOpen(false); scheduleNext() }} />
      <RuneLeaderboard open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />
    </>
  )

  const { goRight, symbol, color, size, topPct, duration, rotate, key } = props
  const animName = goRight ? `runeDriftR_${key}` : `runeDriftL_${key}`

  return (
    <>
      <style>{`
        @keyframes ${animName} {
          0%   { transform: ${goRight ? `scaleX(-1) translateX(0) rotate(${rotate}deg)` : `translateX(0) rotate(${rotate}deg)`}; opacity: 0; }
          8%   { opacity: 1; }
          88%  { opacity: 1; }
          100% { transform: ${goRight ? `scaleX(-1) translateX(calc(-100vw - 100px)) rotate(${rotate + 15}deg)` : `translateX(calc(-100vw - 100px)) rotate(${rotate - 15}deg)`}; opacity: 0; }
        }
        @keyframes runeFloat_${key} {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-6px); }
        }
      `}</style>
      {visible && (
        <div
          style={{
            position: 'fixed', top: `${topPct}%`,
            left: goRight ? '-5%' : '105%',
            zIndex: 9001, pointerEvents: 'none',
            animation: `${animName} ${duration}s linear forwards`,
          }}
          onAnimationEnd={onAnimEnd}
        >
          <div
            onClick={handleClick}
            title="An ancient rune drifts past..."
            style={{
              width: size, height: size,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: size * 0.7, fontFamily: 'monospace',
              color, cursor: 'pointer', pointerEvents: 'auto',
              filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 12px ${color.replace('0.', '0.3')})`,
              animation: `runeFloat_${key} 3s ease-in-out infinite`,
              transition: 'filter 0.2s',
              userSelect: 'none',
            }}
            onMouseEnter={e => (e.currentTarget.style.filter = `drop-shadow(0 0 14px ${color}) drop-shadow(0 0 28px ${color})`)}
            onMouseLeave={e => (e.currentTarget.style.filter = `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 12px ${color.replace('0.', '0.3')})`)}
          >
            {symbol}
          </div>
        </div>
      )}

      <RuneCastingGame open={gameOpen} onClose={() => { setGameOpen(false); scheduleNext() }} />
      <RuneLeaderboard open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />
    </>
  )
}
