import { useState, useEffect, useRef } from 'react'
import { useSite } from '../contexts/SiteContext'

// ── Lunar phase ──────────────────────────────────────────────────────────────
const KNOWN_FULL_MOON = new Date('2025-01-13T22:27:00Z').getTime()
const LUNAR_CYCLE_MS  = 29.53059 * 24 * 60 * 60 * 1000

function isBloodMoon() {
  const cycle = ((Date.now() - KNOWN_FULL_MOON) % LUNAR_CYCLE_MS + LUNAR_CYCLE_MS) % LUNAR_CYCLE_MS
  return cycle / LUNAR_CYCLE_MS < 0.055 || cycle / LUNAR_CYCLE_MS > 0.945
}

function inRange(m, s, e) {
  const now = new Date(); const mo = now.getMonth() + 1; const d = now.getDate()
  return mo === m && d >= s && d <= e
}

// ── Event catalogue ──────────────────────────────────────────────────────────
// bodyBg  → replaces the standard site gradient when the event is active
// vignette → fixed overlay on top of the body (additive atmosphere)
// particles / extras handled by dedicated sub-components

export const EVENT_DEFS = [
  {
    id: 'blood_moon',
    name: 'Blood Moon',       icon: '🌕', dateDesc: 'Lunar — ~3 days per full-moon cycle',
    isActive: isBloodMoon,
    bodyBg: `radial-gradient(circle at top, rgba(200,15,25,0.65), transparent 50%),
             radial-gradient(circle at bottom right, rgba(130,5,15,0.45), transparent 50%), #080203`,
    vignette: 'radial-gradient(ellipse at 50% 0%, rgba(160,10,20,0.22) 0%, rgba(100,5,12,0.1) 50%, transparent 72%)',
    pulseAnim: 'evBloodPulse 8s ease-in-out infinite',
    banner: { text: 'BLOOD MOON RISES',       color: '#fca5a5', bg: 'rgba(100,5,20,0.6)',  border: 'rgba(179,18,63,0.5)' },
    extras: 'bloodMoon',
  },
  {
    id: 'new_year',
    name: "New Year's",       icon: '✨', dateDesc: 'Dec 31 – Jan 1',
    isActive: () => { const m = new Date().getMonth()+1, d = new Date().getDate(); return (m===12&&d===31)||(m===1&&d===1) },
    bodyBg: `radial-gradient(circle at top, rgba(130,85,0,0.45), transparent 50%),
             radial-gradient(circle at bottom right, rgba(100,65,0,0.3), transparent 50%), #080705`,
    vignette: 'radial-gradient(ellipse at 50% 50%, rgba(251,191,36,0.1) 0%, transparent 70%)',
    pulseAnim: 'evGoldPulse 6s ease-in-out infinite',
    banner: { text: 'A NEW CYCLE BEGINS',      color: '#fde68a', bg: 'rgba(30,20,0,0.65)', border: 'rgba(251,191,36,0.45)' },
    particles: 'sparkles',
  },
  {
    id: 'valentines',
    name: "Valentine's Day",  icon: '🩸', dateDesc: 'Feb 13–14',
    isActive: () => inRange(2,13,14),
    bodyBg: `radial-gradient(circle at top, rgba(170,12,45,0.55), transparent 50%),
             radial-gradient(circle at bottom, rgba(110,5,35,0.4), transparent 50%), #090305`,
    vignette: 'radial-gradient(ellipse at 50% 100%, rgba(160,20,45,0.18) 0%, rgba(100,10,30,0.08) 55%, transparent 72%)',
    pulseAnim: 'evRosePulse 7s ease-in-out infinite',
    banner: { text: 'THE BLOOD PACT BINDS',    color: '#fda4af', bg: 'rgba(80,5,20,0.65)', border: 'rgba(200,30,60,0.5)' },
    particles: 'petals',
  },
  {
    id: 'st_patricks',
    name: "St. Patrick's Day", icon: '☘️', dateDesc: 'Mar 17',
    isActive: () => inRange(3,17,17),
    bodyBg: `radial-gradient(circle at top, rgba(15,140,55,0.38), transparent 50%),
             radial-gradient(circle at bottom right, rgba(10,100,40,0.22), transparent 50%), #040906`,
    vignette: 'radial-gradient(ellipse at 50% 0%, rgba(22,163,74,0.14) 0%, rgba(15,120,50,0.07) 55%, transparent 72%)',
    pulseAnim: 'evGreenShimmer 9s ease-in-out infinite',
    banner: { text: 'THE GREEN VEIL LIFTS',    color: '#a7f3d0', bg: 'rgba(5,35,12,0.65)', border: 'rgba(34,197,94,0.5)' },
  },
  {
    id: 'walpurgis',
    name: 'Walpurgis Night',  icon: '🔥', dateDesc: 'Apr 30',
    isActive: () => inRange(4,30,30),
    bodyBg: `radial-gradient(circle at top, rgba(210,65,0,0.5), transparent 50%),
             radial-gradient(circle at bottom, rgba(160,35,0,0.35), transparent 50%), #0a0502`,
    vignette: 'radial-gradient(ellipse at 50% 100%, rgba(200,60,10,0.18) 0%, rgba(150,30,5,0.09) 55%, transparent 72%)',
    pulseAnim: 'evFirePulse 5s ease-in-out infinite',
    banner: { text: 'THE WITCHES GATHER',      color: '#fdba74', bg: 'rgba(40,10,0,0.7)',  border: 'rgba(200,70,20,0.55)' },
    particles: 'embers',
  },
  {
    id: 'summer_solstice',
    name: 'Summer Solstice',  icon: '☀️', dateDesc: 'Jun 20–22',
    isActive: () => inRange(6,20,22),
    bodyBg: `radial-gradient(circle at top, rgba(190,115,0,0.42), transparent 50%),
             radial-gradient(circle at bottom right, rgba(150,85,0,0.25), transparent 50%), #090806`,
    vignette: 'radial-gradient(ellipse at 50% 0%, rgba(220,150,20,0.14) 0%, rgba(160,90,10,0.07) 55%, transparent 72%)',
    pulseAnim: 'evSolarPulse 10s ease-in-out infinite',
    banner: { text: 'THE SUN STANDS STILL',    color: '#fde68a', bg: 'rgba(40,25,0,0.65)', border: 'rgba(220,160,20,0.45)' },
  },
  {
    id: 'halloween',
    name: "All Hallows' Eve", icon: '🕷️', dateDesc: 'Oct 28–31',
    isActive: () => inRange(10,28,31),
    bodyBg: `radial-gradient(circle at top, rgba(65,5,130,0.58), transparent 50%),
             radial-gradient(circle at bottom right, rgba(25,65,5,0.32), transparent 50%), #040208`,
    vignette: 'radial-gradient(ellipse at 50% 50%, rgba(50,10,80,0.22) 0%, rgba(20,5,35,0.12) 65%, transparent 88%)',
    pulseAnim: 'evHexPulse 6s ease-in-out infinite',
    banner: { text: 'THE VEIL THINS',          color: '#d8b4fe', bg: 'rgba(20,5,35,0.7)',  border: 'rgba(109,40,217,0.6)' },
    extras: 'halloween',
  },
  {
    id: 'day_of_dead',
    name: 'Day of the Dead',  icon: '💀', dateDesc: 'Nov 1–2',
    isActive: () => inRange(11,1,2),
    bodyBg: `radial-gradient(circle at top, rgba(170,95,0,0.5), transparent 50%),
             radial-gradient(circle at bottom, rgba(210,130,0,0.3), transparent 50%), #080602`,
    vignette: 'radial-gradient(ellipse at 50% 100%, rgba(200,120,10,0.15) 0%, rgba(150,80,5,0.07) 55%, transparent 72%)',
    pulseAnim: 'evMarigoldPulse 8s ease-in-out infinite',
    banner: { text: 'LOS MUERTOS WALK',        color: '#fde68a', bg: 'rgba(40,20,0,0.7)',  border: 'rgba(220,150,20,0.5)' },
  },
  {
    id: 'winter_solstice',
    name: 'Winter Solstice',  icon: '🌑', dateDesc: 'Dec 20–22',
    isActive: () => inRange(12,20,22),
    bodyBg: `radial-gradient(circle at top, rgba(5,35,130,0.55), transparent 50%),
             radial-gradient(circle at bottom right, rgba(0,25,105,0.38), transparent 50%), #030408`,
    vignette: 'radial-gradient(ellipse at 50% 0%, rgba(30,40,120,0.18) 0%, rgba(10,15,80,0.09) 55%, transparent 72%)',
    pulseAnim: 'evFrostPulse 10s ease-in-out infinite',
    banner: { text: 'THE LONGEST NIGHT FALLS', color: '#bfdbfe', bg: 'rgba(5,10,35,0.7)',  border: 'rgba(60,80,200,0.5)' },
    particles: 'frost',
  },
  {
    id: 'yuletide',
    name: 'Yuletide',         icon: '❄️', dateDesc: 'Dec 24–26',
    isActive: () => inRange(12,24,26),
    bodyBg: `radial-gradient(circle at top, rgba(25,45,110,0.45), transparent 50%),
             radial-gradient(circle at bottom right, rgba(65,85,145,0.28), transparent 50%), #050608`,
    vignette: 'radial-gradient(ellipse at 50% 0%, rgba(180,200,240,0.09) 0%, transparent 65%)',
    pulseAnim: 'evFrostPulse 10s ease-in-out infinite',
    banner: { text: 'YULETIDE FALLS UPON US',  color: '#e2e8f0', bg: 'rgba(10,15,30,0.7)', border: 'rgba(150,170,210,0.5)' },
    particles: 'snow',
  },
]

// ── CSS keyframes ────────────────────────────────────────────────────────────
const KEYFRAMES = `
  @keyframes evBloodPulse    { 0%,100%{opacity:.8}  50%{opacity:1} }
  @keyframes evGoldPulse     { 0%,100%{opacity:.7}  50%{opacity:1} }
  @keyframes evRosePulse     { 0%,100%{opacity:.75} 50%{opacity:1} }
  @keyframes evGreenShimmer  { 0%,100%{opacity:.65} 50%{opacity:1} }
  @keyframes evFirePulse     { 0%,100%{opacity:.75} 50%{opacity:1} }
  @keyframes evSolarPulse    { 0%,100%{opacity:.7}  50%{opacity:1} }
  @keyframes evHexPulse      { 0%,100%{opacity:.8}  50%{opacity:1} }
  @keyframes evMarigoldPulse { 0%,100%{opacity:.7}  50%{opacity:1} }
  @keyframes evFrostPulse    { 0%,100%{opacity:.65} 50%{opacity:1} }
  @keyframes evMoonPulse     { 0%,100%{opacity:.82;filter:drop-shadow(0 0 24px rgba(200,30,15,0.7))} 50%{opacity:1;filter:drop-shadow(0 0 44px rgba(220,40,20,0.9))} }
  @keyframes evSnowFall  { 0%{transform:translateY(-20px);opacity:0} 8%{opacity:1} 90%{opacity:.8} 100%{transform:translateY(105vh);opacity:0} }
  @keyframes evPetalFall { 0%{transform:translateY(-20px) rotate(0deg) translateX(0);opacity:0} 8%{opacity:.9} 90%{opacity:.7} 100%{transform:translateY(105vh) rotate(540deg) translateX(50px);opacity:0} }
  @keyframes evEmberRise { 0%{transform:translateY(105vh);opacity:0} 8%{opacity:.9} 90%{opacity:.6} 100%{transform:translateY(-20px);opacity:0} }
  @keyframes evSparkle   { 0%{transform:translate(0,0) scale(0);opacity:0} 25%{opacity:1} 100%{transform:translate(var(--tx),var(--ty)) scale(1.2);opacity:0} }
  @keyframes evSpiderDrop { 0%{transform:translateY(-120px)} 100%{transform:translateY(0)} }
  @keyframes evSpiderSway { 0%,100%{transform:rotate(-8deg)} 50%{transform:rotate(8deg)} }
`

// ── Particle generators ──────────────────────────────────────────────────────
function Particles({ type }) {
  const items = Array.from({ length: 22 }, (_, i) => {
    const left = Math.random() * 100
    const delay = Math.random() * 12
    const dur   = 7 + Math.random() * 9
    const size  = 3 + Math.random() * 7

    if (type === 'snow' || type === 'frost') {
      return <div key={i} style={{
        position:'fixed', top:0, left:`${left}%`, zIndex:2, pointerEvents:'none',
        width:size, height:size, borderRadius:'50%',
        background: type==='snow' ? 'rgba(215,225,255,0.75)' : 'rgba(140,170,255,0.7)',
        animation:`evSnowFall ${dur}s ${delay}s linear infinite`,
      }}/>
    }
    if (type === 'petals') {
      return <div key={i} style={{
        position:'fixed', top:0, left:`${left}%`, zIndex:2, pointerEvents:'none',
        width:size*1.6, height:size, borderRadius:'50% 50% 50% 0',
        background:`rgba(${175+Math.random()*45},${18+Math.random()*28},${35+Math.random()*28},0.65)`,
        animation:`evPetalFall ${dur}s ${delay}s linear infinite`,
      }}/>
    }
    if (type === 'embers') {
      return <div key={i} style={{
        position:'fixed', bottom:0, left:`${left}%`, zIndex:2, pointerEvents:'none',
        width:size*0.65, height:size*0.65, borderRadius:'50%',
        background:`rgba(${215+Math.random()*40},${55+Math.random()*85},8,0.8)`,
        animation:`evEmberRise ${dur}s ${delay}s linear infinite`,
      }}/>
    }
    if (type === 'sparkles') {
      const tx = (Math.random()-0.5)*280; const ty = (Math.random()-0.5)*280
      return <div key={i} style={{
        position:'fixed', top:`${30+Math.random()*40}%`, left:`${30+Math.random()*40}%`,
        zIndex:2, pointerEvents:'none',
        width:size, height:size, borderRadius:'50%',
        background:`rgba(251,${180+Math.random()*75},${Math.random()*40},0.9)`,
        '--tx':`${tx}px`, '--ty':`${ty}px`,
        animation:`evSparkle ${dur*0.6}s ${delay*0.4}s ease-out infinite`,
      }}/>
    }
    return null
  })
  return <>{items}</>
}

// ── Blood Moon orb ───────────────────────────────────────────────────────────
function BloodMoonOrb() {
  return (
    <div style={{
      position:'fixed', top:'clamp(80px,12vh,130px)', right:'clamp(12px,3vw,40px)',
      zIndex:3, pointerEvents:'none',
      animation:'evMoonPulse 8s ease-in-out infinite',
    }}>
      <svg
        viewBox="0 0 180 180"
        style={{ width:'clamp(70px,9vw,130px)', height:'clamp(70px,9vw,130px)', display:'block' }}
      >
        <defs>
          <radialGradient id="bmSurface" cx="38%" cy="35%" r="65%">
            <stop offset="0%"   stopColor="#f0783c"/>
            <stop offset="35%"  stopColor="#c82818"/>
            <stop offset="70%"  stopColor="#8b0e0e"/>
            <stop offset="100%" stopColor="#5a0808"/>
          </radialGradient>
          <radialGradient id="bmLimb" cx="50%" cy="50%" r="50%">
            <stop offset="60%"  stopColor="transparent"/>
            <stop offset="100%" stopColor="rgba(20,0,0,0.55)"/>
          </radialGradient>
          <radialGradient id="bmGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="rgba(220,40,20,0.18)"/>
            <stop offset="60%"  stopColor="rgba(180,15,15,0.1)"/>
            <stop offset="100%" stopColor="transparent"/>
          </radialGradient>
          <filter id="bmBlur">
            <feGaussianBlur stdDeviation="2.5"/>
          </filter>
          <clipPath id="bmClip">
            <circle cx="90" cy="90" r="68"/>
          </clipPath>
        </defs>
        {/* Outer atmospheric glow */}
        <circle cx="90" cy="90" r="88" fill="url(#bmGlow)"/>
        <circle cx="90" cy="90" r="80" fill="rgba(200,20,10,0.08)"/>
        {/* Moon surface */}
        <circle cx="90" cy="90" r="68" fill="url(#bmSurface)"/>
        {/* Maria (dark patches) — clipped to moon */}
        <g clipPath="url(#bmClip)" opacity="0.5">
          <ellipse cx="68" cy="76" rx="16" ry="12" fill="rgba(60,5,5,0.6)" filter="url(#bmBlur)"/>
          <ellipse cx="114" cy="70" rx="11" ry="8"  fill="rgba(50,4,4,0.55)" filter="url(#bmBlur)"/>
          <ellipse cx="100" cy="112" rx="14" ry="9" fill="rgba(55,5,5,0.5)" filter="url(#bmBlur)"/>
          <ellipse cx="58" cy="108" rx="9"  ry="7"  fill="rgba(50,4,4,0.5)" filter="url(#bmBlur)"/>
          <circle  cx="120" cy="98"  r="7"           fill="rgba(45,4,4,0.45)" filter="url(#bmBlur)"/>
        </g>
        {/* Limb darkening */}
        <circle cx="90" cy="90" r="68" fill="url(#bmLimb)"/>
        {/* Thin highlight rim */}
        <circle cx="90" cy="90" r="68" fill="none" stroke="rgba(255,180,140,0.12)" strokeWidth="2"/>
      </svg>
    </div>
  )
}

// ── Halloween cobwebs ────────────────────────────────────────────────────────
function SpiderWeb({ side }) {
  // side = 'left' | 'right'
  const flip = side === 'right' ? 'scaleX(-1)' : 'none'
  const pos  = side === 'right' ? { right: 0, top: 0 } : { left: 0, top: 0 }
  return (
    <div style={{
      position:'fixed', ...pos, zIndex:3, pointerEvents:'none',
      transform: flip,
      width:'clamp(110px,18vw,210px)', height:'clamp(110px,18vw,210px)',
    }}>
      <svg viewBox="0 0 210 210" width="100%" height="100%" opacity="0.55">
        {/* Radial threads from corner */}
        {[0,18,36,54,72,90].map(angle => {
          const rad = (angle * Math.PI) / 180
          const x2  = 210 * Math.cos(rad)
          const y2  = 210 * Math.sin(rad)
          return <line key={angle} x1="0" y1="0" x2={x2} y2={y2} stroke="rgba(200,180,230,0.55)" strokeWidth="0.8"/>
        })}
        {/* Concentric spiral arcs */}
        {[30,60,90,120,150,175].map((r,i) => {
          const pts = [0,18,36,54,72,90].map(a => {
            const rad = (a * Math.PI) / 180
            return `${r*Math.cos(rad)},${r*Math.sin(rad)}`
          })
          return <polyline key={r} points={pts.join(' ')} fill="none" stroke="rgba(200,180,230,0.45)" strokeWidth="0.7"/>
        })}
        {/* Spider body hanging from a thread */}
        <g style={{ transformOrigin:'20px 0', animation:'evSpiderSway 4s ease-in-out infinite', animationDelay:`${side==='right'?'1.5':'0'}s` }}>
          <line x1="20" y1="0" x2="20" y2="52" stroke="rgba(200,180,230,0.6)" strokeWidth="0.7"/>
          <g transform="translate(20,52)" style={{ animation:'evSpiderDrop 1.2s ease-out both' }}>
            {/* Abdomen */}
            <ellipse cx="0" cy="0" rx="7" ry="9" fill="rgba(30,5,50,0.9)" stroke="rgba(160,120,200,0.5)" strokeWidth="0.5"/>
            {/* Head */}
            <circle cx="0" cy="-12" r="5" fill="rgba(30,5,50,0.9)" stroke="rgba(160,120,200,0.5)" strokeWidth="0.5"/>
            {/* Eyes */}
            <circle cx="-2" cy="-13" r="1.2" fill="rgba(200,30,40,0.9)"/>
            <circle cx="2"  cy="-13" r="1.2" fill="rgba(200,30,40,0.9)"/>
            {/* Legs */}
            {[-1,1].map(side => [-24,-16,-8,0].map((yo,j) => (
              <line key={`${side}${j}`}
                x1={side*2} y1={yo+(-24+j*8)*0+(-4+j*3)} x2={side*18} y2={yo+(-24+j*8)*0+(-4+j*3)-4}
                stroke="rgba(160,120,200,0.7)" strokeWidth="0.9"/>
            )))}
          </g>
        </g>
      </svg>
    </div>
  )
}

// ── Preview localStorage key ─────────────────────────────────────────────────
export const PREVIEW_KEY = 'occultus_event_preview'

// ── Main component ───────────────────────────────────────────────────────────
export default function SeasonalEvents() {
  const { seasonalEvents } = useSite()
  const [previewId, setPreviewId]         = useState(() => localStorage.getItem(PREVIEW_KEY))
  const [shownBanners, setShownBanners]   = useState(new Set())
  const [visibleBanners, setVisibleBanners] = useState(new Set())
  const bannerTimers = useRef({})

  // Sync preview from admin tab (same window)
  useEffect(() => {
    function sync() { setPreviewId(localStorage.getItem(PREVIEW_KEY)) }
    window.addEventListener('storage', sync)
    window.addEventListener('occultus_preview_change', sync)
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('occultus_preview_change', sync) }
  }, [])

  const activeEvents = EVENT_DEFS.filter(ev =>
    ev.id === previewId || (seasonalEvents[ev.id] !== false && ev.isActive())
  )

  // Inject / remove body background theme
  useEffect(() => {
    const tag = document.getElementById('occultus-event-bg')
    if (activeEvents.length === 0) { tag?.remove(); return }
    const ev = activeEvents[0]
    const el = tag || Object.assign(document.createElement('style'), { id: 'occultus-event-bg' })
    if (!tag) document.head.appendChild(el)
    el.textContent = `body { background: ${ev.bodyBg} !important; }`
    return () => { document.getElementById('occultus-event-bg')?.remove() }
  }, [activeEvents.map(e => e.id).join(',')])

  // Banner show / hide
  useEffect(() => {
    activeEvents.forEach(ev => {
      if (shownBanners.has(ev.id)) return
      setShownBanners(prev => new Set([...prev, ev.id]))
      setVisibleBanners(prev => new Set([...prev, ev.id]))
      bannerTimers.current[ev.id] = setTimeout(() =>
        setVisibleBanners(prev => { const s = new Set(prev); s.delete(ev.id); return s }), 8000)
    })
  }, [activeEvents.map(e => e.id).join(',')])

  useEffect(() => () => Object.values(bannerTimers.current).forEach(clearTimeout), [])

  if (activeEvents.length === 0) return null

  return (
    <>
      <style>{KEYFRAMES}</style>
      {activeEvents.map(ev => (
        <EventLayer key={ev.id} ev={ev} bannerVisible={visibleBanners.has(ev.id)} isPreview={ev.id === previewId}/>
      ))}
    </>
  )
}

function EventLayer({ ev, bannerVisible, isPreview }) {
  return (
    <>
      {/* Atmospheric vignette overlay */}
      <div style={{
        position:'fixed', inset:0, zIndex:2, pointerEvents:'none',
        background: ev.vignette,
        animation: ev.pulseAnim,
      }}/>

      {/* Particles */}
      {ev.particles && <Particles type={ev.particles}/>}

      {/* Extra visual elements */}
      {ev.extras === 'bloodMoon'  && <BloodMoonOrb/>}
      {ev.extras === 'halloween'  && <><SpiderWeb side="left"/><SpiderWeb side="right"/></>}

      {/* Banner — fixed bottom, above footer, below nothing that matters */}
      <div style={{
        position:'fixed',
        bottom:'clamp(72px,10vh,96px)',
        left:'50%',
        transform:'translateX(-50%)',
        zIndex:1001,
        pointerEvents:'none',
        display:'flex', alignItems:'center', gap:'8px',
        padding:'7px 16px', borderRadius:'20px',
        background: ev.banner.bg,
        border:`1px solid ${ev.banner.border}`,
        backdropFilter:'blur(10px)',
        opacity: bannerVisible ? 1 : 0,
        transition:'opacity 2s ease',
        whiteSpace:'nowrap',
        maxWidth:'calc(100vw - 32px)',
        boxSizing:'border-box',
      }}>
        <span style={{ fontSize:'clamp(12px,2vw,15px)' }}>{ev.icon}</span>
        <span style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'2px' }}>
          <span style={{
            fontSize:'clamp(9px,1.4vw,12px)',
            color: ev.banner.color,
            letterSpacing:'0.18em',
            fontFamily:'Cinzel, serif',
          }}>
            {ev.banner.text}
          </span>
          <span style={{
            fontSize:'clamp(7px,1vw,9px)',
            color: ev.banner.color,
            opacity: 0.6,
            letterSpacing:'0.12em',
            fontFamily:'Cinzel, serif',
          }}>
            {ev.name.toUpperCase()}
          </span>
        </span>
        {isPreview && (
          <span style={{
            fontSize:'8px', color: ev.banner.color, opacity:0.7, letterSpacing:'0.15em',
            borderLeft:`1px solid ${ev.banner.border}`, paddingLeft:'8px',
          }}>PREVIEW</span>
        )}
      </div>
    </>
  )
}
