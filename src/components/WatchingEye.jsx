import { useState, useEffect, useRef, useCallback } from 'react'
import { findNextGrimoirePage, getFoundPages } from './Grimoire'

function Eye({ openAmount }) {
  const h = 28
  const lidY = h / 2 - (h / 2) * openAmount
  const pupilR = 5 * openAmount
  return (
    <svg viewBox="0 0 60 30" width="60" height="30" style={{ overflow: 'visible' }}>
      {/* Glow */}
      <ellipse cx="30" cy="15" rx="28" ry={14 * openAmount + 1} fill="none" stroke="rgba(179,18,63,0.15)" strokeWidth="8" />
      {/* Iris */}
      {openAmount > 0.05 && (
        <clipPath id="eyeClip">
          <path d={`M2,15 Q30,${15 - 14 * openAmount} 58,15 Q30,${15 + 14 * openAmount} 2,15Z`} />
        </clipPath>
      )}
      <ellipse cx="30" cy="15" rx="22" ry={12 * openAmount} fill="rgba(80,10,20,0.9)" clipPath={openAmount > 0.05 ? "url(#eyeClip)" : undefined} />
      <ellipse cx="30" cy="15" rx="14" ry={9 * openAmount} fill="rgba(130,30,50,0.85)" clipPath={openAmount > 0.05 ? "url(#eyeClip)" : undefined} />
      {/* Pupil */}
      <ellipse cx="30" cy="15" rx={pupilR} ry={pupilR * 1.2} fill="rgba(8,0,4,0.95)" clipPath={openAmount > 0.05 ? "url(#eyeClip)" : undefined} />
      {/* Highlight */}
      {openAmount > 0.3 && <ellipse cx="27" cy={15 - 3 * openAmount} rx={1.5} ry={1.2 * openAmount} fill="rgba(255,200,200,0.5)" />}
      {/* Eyelids */}
      <path d={`M2,15 Q30,${15 - 14 * openAmount} 58,15`} fill="none" stroke="rgba(60,5,15,0.9)" strokeWidth="2" />
      <path d={`M2,15 Q30,${15 + 14 * openAmount} 58,15`} fill="none" stroke="rgba(60,5,15,0.9)" strokeWidth="2" />
      {/* Outline */}
      <path d={`M2,15 Q30,${15 - 14 * openAmount} 58,15 Q30,${15 + 14 * openAmount} 2,15Z`} fill="none" stroke="rgba(179,18,63,0.5)" strokeWidth="1" />
    </svg>
  )
}

export default function WatchingEye() {
  const [phase, setPhase] = useState('hidden') // hidden | opening | open | closing
  const [openAmount, setOpenAmount] = useState(0)
  const [pos, setPos] = useState({ x: 50, y: 50 })
  const [allFound, setAllFound] = useState(false)
  const scheduleRef = useRef(null)
  const animRef = useRef(null)
  const openTimerRef = useRef(null)

  function animateTo(target, duration, onDone) {
    const start = performance.now()
    const from = openAmount
    cancelAnimationFrame(animRef.current)
    function tick(now) {
      const t = Math.min(1, (now - start) / duration)
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      setOpenAmount(from + (target - from) * eased)
      if (t < 1) { animRef.current = requestAnimationFrame(tick) }
      else { setOpenAmount(target); if (onDone) onDone() }
    }
    animRef.current = requestAnimationFrame(tick)
  }

  const scheduleNext = useCallback(() => {
    const delay = 5 * 60 * 1000 + Math.random() * 10 * 60 * 1000
    scheduleRef.current = setTimeout(appear, delay)
  }, [])

  function appear() {
    const x = 15 + Math.random() * 70
    const y = 20 + Math.random() * 60
    setPos({ x, y })
    setPhase('opening')
  }

  useEffect(() => {
    if (phase !== 'opening') return
    animateTo(1, 2200, () => {
      setPhase('open')
      openTimerRef.current = setTimeout(() => setPhase('closing'), 7000)
    })
  }, [phase])

  useEffect(() => {
    if (phase !== 'closing') return
    animateTo(0, 1600, () => { setPhase('hidden'); scheduleNext() })
  }, [phase])

  useEffect(() => {
    // First appearance after 3-6 minutes
    scheduleRef.current = setTimeout(appear, 3 * 60 * 1000 + Math.random() * 3 * 60 * 1000)
    return () => { clearTimeout(scheduleRef.current); clearTimeout(openTimerRef.current); cancelAnimationFrame(animRef.current) }
  }, [])

  function handleClick() {
    if (phase === 'hidden') return
    clearTimeout(openTimerRef.current)
    setPhase('closing')

    const found = getFoundPages()
    const allPagesFound = found.length >= 20

    if (allPagesFound) {
      // Grimoire is complete — dispatch open event without a new page
      setAllFound(true)
      window.dispatchEvent(new CustomEvent('openGrimoirePage', { detail: { index: null } }))
      return
    }

    // Find and unlock a new page
    const newPageIndex = findNextGrimoirePage()
    if (newPageIndex !== null) {
      window.dispatchEvent(new CustomEvent('openGrimoirePage', { detail: { index: newPageIndex } }))
    }
  }

  return (
    <>
      {phase !== 'hidden' && (
        <div
          onClick={handleClick}
          style={{
            position: 'fixed',
            left: `${pos.x}%`, top: `${pos.y}%`,
            transform: 'translate(-50%,-50%)',
            zIndex: 9500, cursor: 'pointer',
            filter: `drop-shadow(0 0 ${Math.floor(openAmount * 16)}px rgba(179,18,63,${(openAmount * 0.7).toFixed(2)}))`,
            transition: 'filter 0.3s',
          }}
          title="The order watches..."
        >
          <Eye openAmount={openAmount} />
        </div>
      )}
    </>
  )
}
