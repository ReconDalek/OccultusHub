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
    particles: 'sunmotes',
  },
  {
    id: 'lammas',
    name: 'Lammas',           icon: '🌾', dateDesc: 'Aug 1',
    isActive: () => inRange(8,1,1),
    bodyBg: `radial-gradient(circle at top, rgba(160,80,0,0.52), transparent 50%),
             radial-gradient(circle at bottom, rgba(120,45,0,0.35), transparent 50%), #090500`,
    vignette: 'radial-gradient(ellipse at 50% 0%, rgba(190,100,10,0.16) 0%, rgba(140,60,5,0.08) 55%, transparent 72%)',
    pulseAnim: 'evHarvestPulse 9s ease-in-out infinite',
    banner: { text: 'THE FIRST HARVEST FALLS', color: '#fcd34d', bg: 'rgba(40,18,0,0.7)',  border: 'rgba(210,140,10,0.5)' },
    particles: 'grain',
  },
  {
    id: 'autumn_equinox',
    name: 'Autumn Equinox',   icon: '🍂', dateDesc: 'Sep 20–22',
    isActive: () => inRange(9,20,22),
    bodyBg: `radial-gradient(circle at top, rgba(160,50,5,0.5), transparent 50%),
             radial-gradient(circle at bottom right, rgba(120,30,0,0.32), transparent 50%), #080402`,
    vignette: 'radial-gradient(ellipse at 50% 0%, rgba(180,70,10,0.15) 0%, rgba(120,40,5,0.08) 55%, transparent 72%)',
    pulseAnim: 'evAutumnPulse 9s ease-in-out infinite',
    banner: { text: 'THE LIGHT YIELDS TO DARK',color: '#fdba74', bg: 'rgba(38,12,0,0.7)',  border: 'rgba(200,90,20,0.5)' },
    particles: 'leaves',
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
    id: 'samhain',
    name: 'Samhain',          icon: '🕯️', dateDesc: 'Oct 31 – Nov 1',
    isActive: () => { const m=new Date().getMonth()+1,d=new Date().getDate(); return (m===10&&d===31)||(m===11&&d===1) },
    bodyBg: `radial-gradient(circle at top, rgba(20,0,50,0.7), transparent 50%),
             radial-gradient(circle at bottom, rgba(10,0,35,0.5), transparent 50%), #030008`,
    vignette: 'radial-gradient(ellipse at 50% 50%, rgba(60,10,100,0.2) 0%, rgba(20,0,45,0.1) 65%, transparent 88%)',
    pulseAnim: 'evSamhainPulse 7s ease-in-out infinite',
    banner: { text: 'THE DEAD ARE REMEMBERED', color: '#e9d5ff', bg: 'rgba(15,0,30,0.75)', border: 'rgba(130,60,200,0.55)' },
    particles: 'wisps',
    extras: 'candles',
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
    particles: 'marigolds',
  },
  {
    id: 'anniversary',
    name: 'Faction Anniversary', icon: '🩸', dateDesc: 'Nov 10',
    isActive: () => inRange(11,10,10),
    bodyBg: `radial-gradient(circle at top, rgba(120,5,30,0.6), transparent 50%),
             radial-gradient(circle at bottom right, rgba(80,5,50,0.4), transparent 50%), #060005`,
    vignette: 'radial-gradient(ellipse at 50% 50%, rgba(150,10,40,0.18) 0%, rgba(80,5,30,0.09) 65%, transparent 85%)',
    pulseAnim: 'evAnnivPulse 8s ease-in-out infinite',
    banner: { text: 'ANOTHER YEAR IN THE SHADOWS', color: '#fca5a5', bg: 'rgba(50,3,15,0.75)', border: 'rgba(180,20,50,0.55)' },
    particles: 'sparkles',
    extras: 'anniversary',
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
    extras: 'icicles',
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
  {
    id: 'spring_equinox',
    name: 'Spring Equinox',   icon: '🌿', dateDesc: 'Mar 19–21',
    isActive: () => inRange(3,19,21),
    bodyBg: `radial-gradient(circle at top, rgba(30,120,60,0.4), transparent 50%),
             radial-gradient(circle at bottom, rgba(80,160,60,0.2), transparent 50%), #040905`,
    vignette: 'radial-gradient(ellipse at 50% 50%, rgba(50,160,80,0.12) 0%, rgba(20,100,40,0.06) 65%, transparent 85%)',
    pulseAnim: 'evSpringPulse 10s ease-in-out infinite',
    banner: { text: 'THE WORLD FINDS BALANCE',  color: '#a7f3d0', bg: 'rgba(4,22,10,0.7)', border: 'rgba(52,211,153,0.45)' },
    particles: 'blossoms',
  },
  {
    id: 'beltane',
    name: 'Beltane',          icon: '🔥', dateDesc: 'May 1',
    isActive: () => inRange(5,1,1),
    bodyBg: `radial-gradient(circle at top, rgba(220,80,0,0.52), transparent 50%),
             radial-gradient(circle at bottom, rgba(160,40,0,0.35), transparent 50%), #0a0400`,
    vignette: 'radial-gradient(ellipse at 50% 100%, rgba(210,70,5,0.2) 0%, rgba(150,35,5,0.1) 55%, transparent 72%)',
    pulseAnim: 'evBeltanePulse 5s ease-in-out infinite',
    banner: { text: 'THE FIRES ARE LIT',        color: '#fed7aa', bg: 'rgba(45,12,0,0.72)', border: 'rgba(220,80,10,0.55)' },
    particles: 'embers',
    extras: 'bonfire',
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
  @keyframes evHarvestPulse  { 0%,100%{opacity:.7}  50%{opacity:1} }
  @keyframes evAutumnPulse   { 0%,100%{opacity:.72} 50%{opacity:1} }
  @keyframes evSamhainPulse  { 0%,100%{opacity:.78} 50%{opacity:1} }
  @keyframes evAnnivPulse    { 0%,100%{opacity:.78} 50%{opacity:1} }
  @keyframes evSpringPulse   { 0%,100%{opacity:.65} 50%{opacity:1} }
  @keyframes evBeltanePulse  { 0%,100%{opacity:.75} 50%{opacity:1} }
  @keyframes evMoonPulse     { 0%,100%{opacity:.82;filter:drop-shadow(0 0 24px rgba(200,30,15,0.7))} 50%{opacity:1;filter:drop-shadow(0 0 44px rgba(220,40,20,0.9))} }
  @keyframes evSnowFall  { 0%{transform:translateY(-20px);opacity:0} 8%{opacity:1} 90%{opacity:.8} 100%{transform:translateY(105vh);opacity:0} }
  @keyframes evPetalFall { 0%{transform:translateY(-20px) rotate(0deg) translateX(0);opacity:0} 8%{opacity:.9} 90%{opacity:.7} 100%{transform:translateY(105vh) rotate(540deg) translateX(50px);opacity:0} }
  @keyframes evLeafFall  { 0%{transform:translateY(-20px) rotate(0deg);opacity:0} 8%{opacity:.85} 90%{opacity:.65} 100%{transform:translateY(105vh) rotate(720deg) translateX(var(--lx));opacity:0} }
  @keyframes evBlossomFall { 0%{transform:translateY(-20px) rotate(0deg) scale(1);opacity:0} 8%{opacity:.8} 90%{opacity:.6} 100%{transform:translateY(105vh) rotate(360deg) scale(0.8) translateX(var(--lx));opacity:0} }
  @keyframes evGrainFall { 0%{transform:translateY(-10px) rotate(var(--gr));opacity:0} 10%{opacity:.7} 90%{opacity:.5} 100%{transform:translateY(105vh) rotate(calc(var(--gr) + 180deg)) translateX(var(--lx));opacity:0} }
  @keyframes evEmberRise { 0%{transform:translateY(105vh);opacity:0} 8%{opacity:.9} 90%{opacity:.6} 100%{transform:translateY(-20px);opacity:0} }
  @keyframes evWispFloat { 0%{transform:translateY(0) translateX(0) scale(1);opacity:0} 15%{opacity:.6} 50%{transform:translateY(-40px) translateX(var(--wx)) scale(1.2);opacity:.7} 85%{opacity:.4} 100%{transform:translateY(-90px) translateX(0) scale(0.7);opacity:0} }
  @keyframes evMoteFloat { 0%{transform:translateY(0) scale(0.8);opacity:0} 20%{opacity:.7} 80%{opacity:.5} 100%{transform:translateY(-60px) scale(1.1);opacity:0} }
  @keyframes evSparkle   { 0%{transform:translate(0,0) scale(0);opacity:0} 25%{opacity:1} 100%{transform:translate(var(--tx),var(--ty)) scale(1.2);opacity:0} }
  @keyframes evCandleFlicker { 0%,100%{opacity:.7;transform:scaleY(1)} 25%{opacity:.9;transform:scaleY(1.08)} 50%{opacity:.75;transform:scaleY(0.94)} 75%{opacity:.85;transform:scaleY(1.04)} }
  @keyframes evIcicleGrow  { 0%{transform:scaleY(0);opacity:0} 100%{transform:scaleY(1);opacity:0.7} }
  @keyframes evBonfireWave { 0%,100%{transform:scaleX(1) scaleY(1)} 33%{transform:scaleX(1.06) scaleY(1.1)} 66%{transform:scaleX(0.94) scaleY(0.95)} }
  @keyframes evSpiderDrop  { 0%{transform:translateY(-120px)} 100%{transform:translateY(0)} }
  @keyframes evSpiderSway  { 0%,100%{transform:rotate(-8deg)} 50%{transform:rotate(8deg)} }
  @keyframes evSpiderSwing { 0%{transform:translateX(0) rotate(-12deg)} 50%{transform:translateX(var(--swing)) rotate(12deg)} 100%{transform:translateX(0) rotate(-12deg)} }
`

// ── Particle generators ──────────────────────────────────────────────────────
function Particles({ type }) {
  const count = type === 'wisps' ? 14 : type === 'marigolds' ? 18 : 22
  const items = Array.from({ length: count }, (_, i) => {
    const left  = Math.random() * 100
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
    if (type === 'blossoms') {
      const lx = (Math.random()-0.5)*80
      return <div key={i} style={{
        position:'fixed', top:0, left:`${left}%`, zIndex:2, pointerEvents:'none',
        width:size*1.4, height:size*1.2, borderRadius:'50% 40% 50% 40%',
        background:`rgba(${210+Math.random()*40},${170+Math.random()*50},${185+Math.random()*40},0.6)`,
        '--lx':`${lx}px`,
        animation:`evBlossomFall ${dur+2}s ${delay}s linear infinite`,
      }}/>
    }
    if (type === 'leaves') {
      const lx = (Math.random()-0.5)*100
      const r  = Math.random()*360
      const hue = 15+Math.random()*25  // orange-red range
      return <div key={i} style={{
        position:'fixed', top:0, left:`${left}%`, zIndex:2, pointerEvents:'none',
        width:size*1.8, height:size*1.1,
        borderRadius:'20% 80% 20% 80%',
        background:`hsla(${hue},85%,${40+Math.random()*20}%,0.7)`,
        '--lx':`${lx}px`,
        animation:`evLeafFall ${dur+1}s ${delay}s linear infinite`,
      }}/>
    }
    if (type === 'grain') {
      const lx = (Math.random()-0.5)*60
      const gr = Math.random()*360
      return <div key={i} style={{
        position:'fixed', top:0, left:`${left}%`, zIndex:2, pointerEvents:'none',
        width:size*0.5, height:size*1.8,
        borderRadius:'40%',
        background:`rgba(${200+Math.random()*50},${150+Math.random()*60},${20+Math.random()*30},0.65)`,
        '--lx':`${lx}px`, '--gr':`${gr}deg`,
        animation:`evGrainFall ${dur+2}s ${delay}s linear infinite`,
      }}/>
    }
    if (type === 'marigolds') {
      return <div key={i} style={{
        position:'fixed', top:0, left:`${left}%`, zIndex:2, pointerEvents:'none',
        width:size*1.5, height:size*1.5, borderRadius:'50%',
        background:`rgba(${220+Math.random()*35},${120+Math.random()*60},5,0.65)`,
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
    if (type === 'wisps') {
      const wx = (Math.random()-0.5)*60
      return <div key={i} style={{
        position:'fixed', bottom:`${Math.random()*50}%`, left:`${left}%`, zIndex:2, pointerEvents:'none',
        width:size*2, height:size*3, borderRadius:'50%',
        background:`rgba(${160+Math.random()*60},${80+Math.random()*60},${220+Math.random()*35},0.35)`,
        filter:'blur(4px)',
        '--wx':`${wx}px`,
        animation:`evWispFloat ${dur+4}s ${delay}s ease-in-out infinite`,
      }}/>
    }
    if (type === 'sunmotes') {
      return <div key={i} style={{
        position:'fixed', top:`${10+Math.random()*50}%`, left:`${left}%`, zIndex:2, pointerEvents:'none',
        width:size*0.8, height:size*0.8, borderRadius:'50%',
        background:`rgba(${240+Math.random()*15},${200+Math.random()*40},${50+Math.random()*50},0.6)`,
        filter:'blur(1px)',
        animation:`evMoteFloat ${dur+3}s ${delay}s ease-in-out infinite`,
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
function Spider({ x, y, swingPx, delay, size = 1 }) {
  const s = size
  return (
    <g style={{ '--swing':`${swingPx}px`, animation:`evSpiderSwing ${5+Math.abs(swingPx)*0.04}s ${delay}s ease-in-out infinite`, transformOrigin:`${x}px 0` }}>
      <line x1={x} y1="0" x2={x} y2={y} stroke="rgba(200,180,230,0.55)" strokeWidth="0.7"/>
      <g transform={`translate(${x},${y})`} style={{ animation:'evSpiderDrop 1.4s ease-out both' }}>
        <ellipse cx="0" cy="0" rx={7*s} ry={9*s} fill="rgba(20,3,40,0.92)" stroke="rgba(160,120,200,0.5)" strokeWidth="0.5"/>
        <circle cx="0" cy={-13*s} r={5*s} fill="rgba(20,3,40,0.92)" stroke="rgba(160,120,200,0.5)" strokeWidth="0.5"/>
        <circle cx={-2*s} cy={-14*s} r={1.4*s} fill="rgba(220,30,40,0.95)"/>
        <circle cx={2*s}  cy={-14*s} r={1.4*s} fill="rgba(220,30,40,0.95)"/>
        {[-1,1].map(sd => [0,1,2,3].map(j => (
          <line key={`${sd}${j}`}
            x1={sd*2*s} y1={(-6+j*4)*s} x2={sd*20*s} y2={(-10+j*5)*s}
            stroke="rgba(160,120,200,0.75)" strokeWidth={0.9*s}/>
        )))}
      </g>
    </g>
  )
}

function SpiderWeb({ side }) {
  const flip = side === 'right' ? 'scaleX(-1)' : 'none'
  const pos  = side === 'right' ? { right: 0, top: 0 } : { left: 0, top: 0 }
  return (
    <div style={{
      position:'fixed', ...pos, zIndex:3, pointerEvents:'none',
      transform: flip,
      width:'clamp(160px,24vw,290px)', height:'clamp(160px,24vw,290px)',
    }}>
      <svg viewBox="0 0 290 290" width="100%" height="100%" opacity="0.6">
        {[0,15,30,45,60,75,90].map(angle => {
          const rad = (angle * Math.PI) / 180
          return <line key={angle} x1="0" y1="0" x2={290*Math.cos(rad)} y2={290*Math.sin(rad)}
            stroke="rgba(200,180,230,0.5)" strokeWidth="0.9"/>
        })}
        {[35,70,105,145,185,225,265].map(r => {
          const pts = [0,15,30,45,60,75,90].map(a => {
            const rad = (a * Math.PI) / 180
            return `${r*Math.cos(rad)},${r*Math.sin(rad)}`
          })
          return <polyline key={r} points={pts.join(' ')} fill="none" stroke="rgba(200,180,230,0.4)" strokeWidth="0.8"/>
        })}
        {/* Stationary sway spider near the corner */}
        <g style={{ transformOrigin:'22px 0', animation:'evSpiderSway 4.5s ease-in-out infinite' }}>
          <Spider x={22} y={58} swingPx={0} delay={0} size={1}/>
        </g>
        {/* Swinging spider travelling between webs */}
        <Spider x={80} y={105} swingPx={55} delay={1.8} size={1.25}/>
      </svg>
    </div>
  )
}

// ── Candles (Samhain) ────────────────────────────────────────────────────────
function Candles() {
  const candles = [
    { left:'8%',  height:55, delay:0   },
    { left:'14%', height:38, delay:0.7 },
    { left:'84%', height:48, delay:0.3 },
    { left:'90%', height:62, delay:1.1 },
  ]
  return (
    <>
      {candles.map((c, i) => (
        <div key={i} style={{ position:'fixed', bottom:0, left:c.left, zIndex:3, pointerEvents:'none', display:'flex', flexDirection:'column', alignItems:'center' }}>
          {/* Flame */}
          <div style={{
            width:10, height:18,
            background:'radial-gradient(ellipse at 50% 80%, rgba(255,220,40,0.95), rgba(255,120,10,0.7) 55%, transparent)',
            borderRadius:'50% 50% 20% 20%',
            marginBottom:-2,
            animation:`evCandleFlicker ${1.5+Math.random()*0.8}s ${c.delay}s ease-in-out infinite`,
          }}/>
          {/* Wax pillar */}
          <div style={{
            width:14, height:c.height,
            background:'linear-gradient(to right, rgba(200,185,220,0.6), rgba(240,230,255,0.5), rgba(180,165,200,0.55))',
            borderRadius:'3px 3px 0 0',
          }}/>
        </div>
      ))}
    </>
  )
}

// ── Anniversary gold crown flourish ─────────────────────────────────────────
function AnniversaryOrb() {
  return (
    <div style={{ position:'fixed', top:'clamp(80px,12vh,130px)', right:'clamp(12px,3vw,40px)', zIndex:3, pointerEvents:'none' }}>
      <svg viewBox="0 0 160 160" style={{ width:'clamp(60px,8vw,110px)', height:'clamp(60px,8vw,110px)', display:'block' }}>
        <defs>
          <radialGradient id="annivGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="rgba(220,30,60,0.3)"/>
            <stop offset="60%"  stopColor="rgba(150,10,35,0.15)"/>
            <stop offset="100%" stopColor="transparent"/>
          </radialGradient>
          <radialGradient id="annivCore" cx="40%" cy="35%" r="65%">
            <stop offset="0%"   stopColor="#f87171"/>
            <stop offset="40%"  stopColor="#b91c1c"/>
            <stop offset="100%" stopColor="#5a0808"/>
          </radialGradient>
        </defs>
        <circle cx="80" cy="80" r="78" fill="url(#annivGlow)"/>
        <circle cx="80" cy="80" r="52" fill="url(#annivCore)" opacity="0.9"/>
        <circle cx="80" cy="80" r="52" fill="none" stroke="rgba(255,160,160,0.2)" strokeWidth="1.5"/>
        {/* Roman numeral IV for year 4 (founded 2021, 4th anniversary 2025) */}
        <text x="80" y="88" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="28" fill="rgba(255,200,200,0.85)" letterSpacing="3">IV</text>
      </svg>
    </div>
  )
}

// ── Icicles (Winter Solstice) ─────────────────────────────────────────────────
function Icicles() {
  const icicles = Array.from({ length: 14 }, (_, i) => ({
    left: `${(i / 13) * 96 + 2}%`,
    height: 30 + Math.random() * 55,
    width:  6  + Math.random() * 9,
    delay:  Math.random() * 1.5,
  }))
  return (
    <>
      {icicles.map((ic, i) => (
        <div key={i} style={{
          position:'fixed', top:0, left:ic.left, zIndex:3, pointerEvents:'none',
          width:ic.width, height:ic.height,
          background:'linear-gradient(to bottom, rgba(180,210,255,0.65), rgba(140,180,255,0.15), transparent)',
          clipPath:'polygon(30% 0%, 70% 0%, 100% 100%, 0% 100%)',
          transformOrigin:'top center',
          animation:`evIcicleGrow 1.5s ${ic.delay}s ease-out both`,
        }}/>
      ))}
    </>
  )
}

// ── Bonfire (Beltane) ────────────────────────────────────────────────────────
function Bonfire() {
  return (
    <div style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', zIndex:3, pointerEvents:'none', display:'flex', flexDirection:'column', alignItems:'center' }}>
      {[
        { w:60, h:90, c:'rgba(255,80,10,0.55)',  delay:0   },
        { w:44, h:72, c:'rgba(255,140,20,0.6)',  delay:0.2 },
        { w:28, h:52, c:'rgba(255,210,50,0.65)', delay:0.4 },
      ].map((f, i) => (
        <div key={i} style={{
          position:'absolute', bottom:18,
          width:f.w, height:f.h,
          background:`radial-gradient(ellipse at 50% 90%, ${f.c}, transparent 75%)`,
          borderRadius:'50% 50% 20% 20%',
          animation:`evBonfireWave ${1.2+i*0.3}s ${f.delay}s ease-in-out infinite`,
        }}/>
      ))}
      {/* Log base */}
      <div style={{ width:80, height:14, background:'rgba(60,25,5,0.8)', borderRadius:'4px', marginTop:4 }}/>
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
      {ev.extras === 'bloodMoon'   && <BloodMoonOrb/>}
      {ev.extras === 'halloween'   && <><SpiderWeb side="left"/><SpiderWeb side="right"/></>}
      {ev.extras === 'candles'     && <Candles/>}
      {ev.extras === 'anniversary' && <AnniversaryOrb/>}
      {ev.extras === 'icicles'     && <Icicles/>}
      {ev.extras === 'bonfire'     && <Bonfire/>}

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
