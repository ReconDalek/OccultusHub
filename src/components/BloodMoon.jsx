import { useState, useEffect } from 'react'

const KNOWN_FULL_MOON = new Date('2025-01-13T22:27:00Z').getTime()
const LUNAR_CYCLE_MS  = 29.53059 * 24 * 60 * 60 * 1000

function getLunarPhase() {
  const elapsed = Date.now() - KNOWN_FULL_MOON
  const cycle = ((elapsed % LUNAR_CYCLE_MS) + LUNAR_CYCLE_MS) % LUNAR_CYCLE_MS
  return cycle / LUNAR_CYCLE_MS
}

function isFullMoon() {
  const phase = getLunarPhase()
  return phase < 0.055 || phase > 0.945
}

export default function BloodMoon() {
  const [active, setActive] = useState(false)
  const [bannerVisible, setBannerVisible] = useState(false)

  useEffect(() => {
    if (!isFullMoon()) return
    setActive(true)
    setBannerVisible(true)
    const t = setTimeout(() => setBannerVisible(false), 8000)
    return () => clearTimeout(t)
  }, [])

  if (!active) return null

  return (
    <>
      {/* Subtle blood-red vignette overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(140,10,30,0.14) 0%, rgba(100,5,20,0.06) 45%, transparent 70%)',
        pointerEvents: 'none',
        animation: 'bloodPulse 8s ease-in-out infinite',
      }} />

      {/* Moon indicator top-center */}
      <div style={{
        position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
        zIndex: 999, pointerEvents: 'none',
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '6px 14px', borderRadius: '20px',
        background: 'rgba(100,5,20,0.45)', border: '1px solid rgba(179,18,63,0.4)',
        backdropFilter: 'blur(8px)',
        opacity: bannerVisible ? 1 : 0,
        transition: 'opacity 2s ease',
      }}>
        <span style={{ fontSize: '14px' }}>🌕</span>
        <span style={{ fontSize: '11px', color: '#fca5a5', letterSpacing: '0.2em', fontFamily: 'Cinzel, serif' }}>
          BLOOD MOON RISES
        </span>
      </div>

      <style>{`
        @keyframes bloodPulse {
          0%, 100% { opacity: 0.7; }
          50%       { opacity: 1; }
        }
      `}</style>
    </>
  )
}
