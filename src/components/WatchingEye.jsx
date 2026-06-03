import { useState, useEffect, useRef, useCallback } from 'react'

const MESSAGES = [
  { title: 'The Veil Speaks',         body: 'Three circles bind the one. The one dissolves the three. Neither begins. Neither ends. You were observed before you arrived.' },
  { title: 'A Warning Carved in Shadow', body: 'The rite was performed at midnight. The name was not spoken. It did not need to be. It already knew.' },
  { title: 'On Loyalty',              body: 'Loyalty is not a virtue in the order. It is a requirement. Air is not called noble merely because you breathe it.' },
  { title: 'The Silence Rule',        body: 'There are things discussed within these walls that have no equivalent in language. For these things, silence is not an absence. It is the message itself.' },
  { title: 'The Watchers',            body: 'There are members who are never seen at the front. They do not strike. They observe. What they record is held in a place only the order can access.' },
  { title: 'The Trial',               body: 'Those who seek to rise undergo no formal test. The trial is ongoing. It began the day you joined. It does not end.' },
  { title: 'The Mark',                body: 'You carry it without knowing what it looks like. Others within the order recognise it. Outsiders cannot see it. This is by design.' },
  { title: 'On Strength',             body: 'Strength within the order is not measured in victories. It is measured in endurance. The one who outlasts is the one who understands.' },
  { title: 'That Which Watches',      body: 'The eye does not judge. It catalogues. Everything you have done within these walls has been noted. Some of it has been useful.' },
  { title: 'The Archive',             body: 'Records go back further than the order\'s official founding. This discrepancy is not an error. It is intentional.' },
  { title: 'The Unnamed Hour',        body: 'There is an hour between the second toll and the third that has no name. The order has always known what happens within it.' },
  { title: 'On Absence',              body: 'Those who leave are not forgotten. They are archived. Their knowledge remains useful. Their absence is noted in every record that bears their name.' },
  { title: 'The City Beneath',        body: 'Torn is a city of surfaces. What the order operates beneath those surfaces cannot be mapped. The map exists only in collective memory.' },
  { title: 'The Directive',           body: 'The directive was never written down. It does not need to be. Those who have heard it understand. Those who have not — will, in time.' },
  { title: 'The Mirror Doctrine',     body: 'What you see in the abyss is not the abyss. It is a reflection of what the abyss has already seen in you.' },
]

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
  const [message, setMessage] = useState(null)
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
    const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)]
    setMessage(msg)
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

      {message && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10002,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setMessage(null)}
        >
          <div
            style={{
              maxWidth: '420px', width: '100%',
              background: 'rgba(6,2,12,0.98)',
              border: '1px solid rgba(179,18,63,0.3)',
              borderRadius: '16px', padding: '32px',
              boxShadow: '0 0 60px rgba(179,18,63,0.12)',
              textAlign: 'center',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: '32px', marginBottom: '16px', color: 'rgba(179,18,63,0.7)', fontFamily: 'monospace' }}>👁</div>
            <h3 style={{ margin: '0 0 16px', fontFamily: 'Cinzel, serif', letterSpacing: '2px', fontSize: '16px', color: '#fca5a5' }}>
              {message.title}
            </h3>
            <p style={{ color: '#a1a1aa', lineHeight: 1.8, fontSize: '14px', margin: '0 0 24px' }}>
              {message.body}
            </p>
            <button
              onClick={() => setMessage(null)}
              style={{
                background: 'rgba(179,18,63,0.15)', border: '1px solid rgba(179,18,63,0.3)',
                color: '#fca5a5', padding: '8px 24px', borderRadius: '8px',
                cursor: 'pointer', fontSize: '13px', letterSpacing: '0.1em',
                fontFamily: 'Cinzel, serif',
              }}
            >
              Close the eye
            </button>
          </div>
        </div>
      )}
    </>
  )
}
