import { useState, useEffect, useRef } from 'react'

const PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
}

const BAND_COLOR = {
  'ill-fortune': '#d9484f',
  'the-turning': '#a49bbd',
  'favour': '#3fb98a',
}
const BAND_LABEL = {
  'ill-fortune': 'Ill Fortune',
  'the-turning': 'The Turning',
  'favour': 'Favour',
}

function Face({ n, color }) {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
      <rect x="4" y="4" width="92" height="92" rx="18"
        fill="#151220" stroke={color || '#302943'} strokeWidth="2" />
      {(PIPS[n] || []).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="8" fill={color || '#ece7f4'} />
      ))}
    </svg>
  )
}

/**
 * Rolls a die toward `face` (1..6) and reveals `band`. Calls onDone() when settled.
 * Pass a fresh `nonce` (e.g. the night number) to trigger a new roll.
 */
export default function PactDie({ face, band, nonce, onDone, size = 96 }) {
  const [shown, setShown] = useState(face || 1)
  const [rolling, setRolling] = useState(false)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (!face) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setShown(face); doneRef.current?.(); return }

    setRolling(true)
    let t = 0
    const iv = setInterval(() => {
      setShown(1 + Math.floor(Math.random() * 6))
      t += 80
      if (t >= 720) {
        clearInterval(iv)
        setShown(face)
        setRolling(false)
        doneRef.current?.()
      }
    }, 80)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, face])

  const color = !rolling && band ? BAND_COLOR[band] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: size, height: size,
          animation: rolling ? 'pactDieShake 0.24s linear infinite' : 'none',
          filter: color ? `drop-shadow(0 0 12px ${color}88)` : 'none',
          transition: 'filter 0.3s',
        }}
      >
        <Face n={shown} color={color} />
      </div>
      {!rolling && band && (
        <div style={{
          fontFamily: 'Cinzel, serif', letterSpacing: 2, fontSize: 13,
          textTransform: 'uppercase', color: BAND_COLOR[band],
        }}>
          {BAND_LABEL[band]}
        </div>
      )}
      <style>{`
        @keyframes pactDieShake {
          0%,100% { transform: translate(0,0) rotate(0deg); }
          25% { transform: translate(-2px,1px) rotate(-6deg); }
          50% { transform: translate(2px,-1px) rotate(5deg); }
          75% { transform: translate(-1px,-2px) rotate(-3deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes pactDieShake { from,to { transform: none; } }
        }
      `}</style>
    </div>
  )
}
