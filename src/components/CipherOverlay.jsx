import { useEffect, useRef } from 'react'
import { useCipher } from '../contexts/CipherContext'

// Pool of glyphs: Elder Futhark, alchemical symbols, occult marks, Latin letters
const GLYPHS =
  'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ' +
  '☽☿♄♃♂♀☊☋⊕⊗◈◇△▽⬡⬟✦✧⁕⁂' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  '0123456789'

const GLYPH_ARR = [...GLYPHS]

function rand(min, max) { return min + Math.random() * (max - min) }

function createGlyph(W, H) {
  return {
    x:       rand(0, W),
    y:       rand(0, H),
    vy:      rand(-0.18, -0.06),           // drift upward slowly
    vx:      rand(-0.04, 0.04),
    alpha:   0,
    maxAlpha: rand(0.04, 0.09),            // stays very subtle (4–9%)
    phase:   rand(0, Math.PI * 2),         // sine phase offset for flickering
    speed:   rand(0.004, 0.010),           // flicker speed
    size:    rand(11, 22),
    char:    GLYPH_ARR[Math.floor(Math.random() * GLYPH_ARR.length)],
    ttl:     rand(180, 420),               // frames before respawn
    age:     0,
    fadeIn:  rand(40, 80),
    fadeOut: rand(40, 80),
  }
}

const GLYPH_COUNT = 55

export default function CipherOverlay() {
  const { cipherActive } = useCipher()
  const canvasRef  = useRef(null)
  const stateRef   = useRef({ glyphs: [], raf: null, active: false })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const state = stateRef.current

    function resize() {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    function init() {
      state.glyphs = Array.from({ length: GLYPH_COUNT }, () =>
        createGlyph(canvas.width, canvas.height)
      )
      // Stagger initial ages so they don't all appear at once
      state.glyphs.forEach((g) => { g.age = Math.floor(rand(0, g.ttl)) })
    }

    function draw() {
      if (!state.active) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const g of state.glyphs) {
        g.age++
        g.x += g.vx
        g.y += g.vy

        // Fade in
        if (g.age < g.fadeIn) {
          g.alpha = (g.age / g.fadeIn) * g.maxAlpha
        }
        // Fade out near end of life
        else if (g.age > g.ttl - g.fadeOut) {
          g.alpha = Math.max(0, ((g.ttl - g.age) / g.fadeOut) * g.maxAlpha)
        }
        // Mid-life: gentle sine flicker
        else {
          g.phase += g.speed
          g.alpha = g.maxAlpha * (0.6 + 0.4 * Math.sin(g.phase))
        }

        // Respawn when life ends or drifts off screen
        if (
          g.age >= g.ttl ||
          g.x < -30 || g.x > canvas.width + 30 ||
          g.y < -30 || g.y > canvas.height + 30
        ) {
          Object.assign(g, createGlyph(canvas.width, canvas.height))
          g.age = 0
          g.alpha = 0
        }

        ctx.save()
        ctx.globalAlpha = Math.max(0, Math.min(1, g.alpha))
        ctx.font = `${g.size}px 'Cinzel', serif`
        ctx.fillStyle = '#c084fc'           // soft purple matches the site palette
        ctx.fillText(g.char, g.x, g.y)
        ctx.restore()
      }

      state.raf = requestAnimationFrame(draw)
    }

    if (cipherActive) {
      state.active = true
      init()
      draw()
    } else {
      state.active = false
      cancelAnimationFrame(state.raf)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    return () => {
      state.active = false
      cancelAnimationFrame(state.raf)
      window.removeEventListener('resize', resize)
    }
  }, [cipherActive])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 9990,
        opacity: cipherActive ? 1 : 0,
        transition: 'opacity 1.2s ease',
      }}
    />
  )
}
