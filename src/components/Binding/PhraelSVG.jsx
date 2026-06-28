import { useId } from 'react'
import { SPECIES_COLOR, NATURE_ACCENT } from './familiarColors'

// Thrael — The Rune Golem
// Layer 1 (all stages): angular stone body, single rune crack eye-line, heavy limbs
// Layer 2 (stage 2+):   multiple rune crack network glowing, floating stone fragments orbit body
// Layer 3 (stage 3):    rune lattice fills the whole form, fragments form shoulder armour, aura pulse

export default function PhraelSVG({ stage = 1, nature = 'stoic', size = 200 }) {
  const id = useId().replace(/:/g, '')
  const c  = SPECIES_COLOR.thrael
  const na = NATURE_ACCENT[nature]

  const keyframes = `
    @keyframes thrael-breathe-${id} {
      0%,100% { transform: scaleY(1) translateY(0); }
      50%      { transform: scaleY(1.02) translateY(-2px); }
    }
    @keyframes thrael-rune-${id} {
      0%,100% { opacity: ${stage >= 2 ? '0.7' : '0.45'}; }
      50%      { opacity: 1; }
    }
    @keyframes thrael-fragment-${id} {
      0%,100% { transform: translateY(0) rotate(0deg); }
      50%      { transform: translateY(-5px) rotate(5deg); }
    }
    @keyframes thrael-fragment2-${id} {
      0%,100% { transform: translateY(0) rotate(0deg); }
      50%      { transform: translateY(-4px) rotate(-4deg); }
    }
    @keyframes thrael-pulse-${id} {
      0%,100% { opacity: 0.12; r: 62; }
      50%      { opacity: 0.28; r: 66; }
    }
    @keyframes thrael-crack-${id} {
      0%,100% { stroke-opacity: ${stage >= 3 ? '0.85' : '0.55'}; }
      50%      { stroke-opacity: 1; }
    }
  `

  return (
    <svg
      viewBox="0 0 160 160"
      width={size}
      height={size}
      style={{ overflow: 'visible', display: 'block' }}
      aria-label={`Thrael familiar, stage ${stage}`}
    >
      <defs>
        <style>{keyframes}</style>
        <radialGradient id={`tg-glow-${id}`} cx="50%" cy="70%" r="50%">
          <stop offset="0%" stopColor={c.primary} stopOpacity="0.2" />
          <stop offset="100%" stopColor={c.primary} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`tg-crack-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={na} stopOpacity="1" />
          <stop offset="100%" stopColor={c.accent} stopOpacity="0.7" />
        </radialGradient>
        <radialGradient id={`tg-body-${id}`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor={c.mid} stopOpacity="1" />
          <stop offset="100%" stopColor={c.dark} stopOpacity="1" />
        </radialGradient>
        <filter id={`tg-glow-filter-${id}`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={`tg-soft-${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="80" cy="150" rx="36" ry="7" fill={`url(#tg-glow-${id})`} />

      {/* ── Layer 1: Stone body ── */}
      <g style={{ transformOrigin: '80px 110px', animation: `thrael-breathe-${id} 4.5s ease-in-out infinite` }}>

        {/* Legs */}
        <rect x="58" y="128" width="18" height="22" rx="5" fill={c.dark} />
        <rect x="84" y="128" width="18" height="22" rx="5" fill={c.dark} />
        <rect x="59" y="130" width="16" height="19" rx="4" fill={c.mid} />
        <rect x="85" y="130" width="16" height="19" rx="4" fill={c.mid} />
        {/* Boot-stone */}
        <rect x="56" y="145" width="22" height="8" rx="3" fill={c.dark} />
        <rect x="82" y="145" width="22" height="8" rx="3" fill={c.dark} />

        {/* Torso — wide stone block */}
        <rect x="46" y="82" width="68" height="52" rx="8" fill={c.dark} />
        <rect x="48" y="84" width="64" height="48" rx="7" fill={`url(#tg-body-${id})`} />
        {/* Torso angular edges */}
        <path d="M 46,90 L 50,84 L 110,84 L 114,90" fill={c.mid} opacity="0.5" />
        <path d="M 46,126 L 50,132 L 110,132 L 114,126" fill={c.dark} opacity="0.7" />

        {/* Arms */}
        <rect x="26" y="86" width="22" height="42" rx="7" fill={c.dark} />
        <rect x="28" y="88" width="19" height="38" rx="6" fill={c.mid} />
        <rect x="112" y="86" width="22" height="42" rx="7" fill={c.dark} />
        <rect x="112" y="88" width="19" height="38" rx="6" fill={c.mid} />
        {/* Fists */}
        <rect x="24" y="124" width="26" height="14" rx="5" fill={c.dark} />
        <rect x="110" y="124" width="26" height="14" rx="5" fill={c.dark} />

        {/* Shoulders */}
        <path d="M 46,86 L 38,78 L 54,80Z" fill={c.mid} opacity="0.8" />
        <path d="M 114,86 L 122,78 L 106,80Z" fill={c.mid} opacity="0.8" />

        {/* Neck block */}
        <rect x="66" y="64" width="28" height="22" rx="5" fill={c.dark} />
        <rect x="68" y="66" width="24" height="19" rx="4" fill={c.mid} />

        {/* Head — wide angular helmet */}
        <rect x="52" y="34" width="56" height="34" rx="7" fill={c.dark} />
        <rect x="54" y="36" width="52" height="31" rx="6" fill={`url(#tg-body-${id})`} />
        {/* Brow ridge */}
        <rect x="52" y="34" width="56" height="10" rx="5" fill={c.dark} />
        <rect x="54" y="35" width="52" height="8" rx="4" fill={c.mid} opacity="0.8" />
        {/* Chin plate */}
        <rect x="60" y="62" width="40" height="8" rx="3" fill={c.dark} />

        {/* Primary rune crack — eyes (stage 1: one bright fissure) */}
        <path d="M 62,48 L 70,44 L 72,50 L 68,54 L 62,52 Z" fill="#0c0704" />
        <path d="M 88,48 L 96,44 L 98,50 L 94,54 L 88,52 Z" fill="#0c0704" />
        {/* Eye glow fill */}
        <path d="M 63,49 L 69,45.5 L 71,49.5 L 68,53 L 63,51 Z"
          fill={`url(#tg-crack-${id})`}
          filter={`url(#tg-glow-filter-${id})`}
          style={{ animation: `thrael-rune-${id} 2.8s ease-in-out infinite` }} />
        <path d="M 89,49 L 95,45.5 L 97,49.5 L 94,53 L 89,51 Z"
          fill={`url(#tg-crack-${id})`}
          filter={`url(#tg-glow-filter-${id})`}
          style={{ animation: `thrael-rune-${id} 2.8s ease-in-out infinite` }} />

        {/* Primary torso rune crack */}
        <path d="M 80,90 L 76,100 L 84,108 L 80,118 L 76,128"
          stroke={na} strokeWidth="2.5" fill="none" strokeLinecap="round"
          filter={`url(#tg-glow-filter-${id})`}
          style={{ strokeOpacity: 0.7, animation: `thrael-crack-${id} 3s ease-in-out infinite` }} />
        <path d="M 80,90 L 76,100 L 84,108 L 80,118 L 76,128"
          stroke={c.accent} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5" />
      </g>

      {/* ── Layer 2: Rune network + floating fragments (stage 2+) ── */}
      {stage >= 2 && (
        <>
          <g style={{ animation: `thrael-rune-${id} 2.6s ease-in-out infinite` }}>
            {/* Extended rune crack network on torso */}
            <path d="M 58,94 L 66,90 L 72,96 L 68,102" stroke={na} strokeWidth="1.8" fill="none" strokeLinecap="round"
              filter={`url(#tg-glow-filter-${id})`} opacity="0.75" />
            <path d="M 102,94 L 94,90 L 88,96 L 92,102" stroke={na} strokeWidth="1.8" fill="none" strokeLinecap="round"
              filter={`url(#tg-glow-filter-${id})`} opacity="0.75" />
            <path d="M 62,112 L 70,106 L 76,112" stroke={na} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.6" />
            <path d="M 98,112 L 90,106 L 84,112" stroke={na} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.6" />

            {/* Arm rune cracks */}
            <path d="M 33,96 L 37,104 L 33,112" stroke={na} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.65" />
            <path d="M 127,96 L 123,104 L 127,112" stroke={na} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.65" />

            {/* Forehead rune */}
            <path d="M 68,40 L 72,36 L 80,40 L 88,36 L 92,40" stroke={na} strokeWidth="1.5" fill="none" opacity="0.7"
              filter={`url(#tg-glow-filter-${id})`} />
          </g>

          {/* Floating stone fragments */}
          <g style={{ animation: `thrael-fragment-${id} 3.2s ease-in-out infinite` }}>
            <rect x="18" y="78" width="12" height="10" rx="2" fill={c.mid} opacity="0.85"
              transform="rotate(-15,24,83)" />
            <rect x="20" y="80" width="10" height="8" rx="1" fill={c.dark} opacity="0.6"
              transform="rotate(-15,25,84)" />
            <path d="M 22,79 L 26,76" stroke={na} strokeWidth="1" opacity="0.5" />
          </g>
          <g style={{ animation: `thrael-fragment2-${id} 3.5s ease-in-out infinite` }}>
            <rect x="130" y="76" width="14" height="11" rx="2" fill={c.mid} opacity="0.85"
              transform="rotate(12,137,81)" />
            <rect x="131" y="78" width="12" height="9" rx="1" fill={c.dark} opacity="0.6"
              transform="rotate(12,137,82)" />
            <path d="M 138,77 L 134,74" stroke={na} strokeWidth="1" opacity="0.5" />
          </g>
          <g style={{ animation: `thrael-fragment-${id} 2.8s ease-in-out infinite reverse` }}>
            <rect x="60" y="20" width="10" height="8" rx="2" fill={c.mid} opacity="0.7"
              transform="rotate(8,65,24)" />
            <path d="M 63,22 L 67,19" stroke={na} strokeWidth="0.9" opacity="0.45" />
          </g>
          <g style={{ animation: `thrael-fragment2-${id} 4s ease-in-out infinite` }}>
            <rect x="94" y="18" width="10" height="8" rx="2" fill={c.mid} opacity="0.7"
              transform="rotate(-10,99,22)" />
            <path d="M 97,20 L 101,17" stroke={na} strokeWidth="0.9" opacity="0.45" />
          </g>
        </>
      )}

      {/* ── Layer 3: Rune lattice + armour fragments + aura (stage 3) ── */}
      {stage >= 3 && (
        <>
          {/* Aura pulse circle */}
          <circle cx="80" cy="100" r="62" fill="none" stroke={na} strokeWidth="1.5"
            style={{ animation: `thrael-pulse-${id} 3s ease-in-out infinite` }} opacity="0.2" />
          <circle cx="80" cy="100" r="54" fill="none" stroke={c.accent} strokeWidth="0.8"
            opacity="0.15" strokeDasharray="6 4" />

          {/* Dense rune lattice overlay */}
          <g style={{ animation: `thrael-rune-${id} 2s ease-in-out infinite` }}
            filter={`url(#tg-glow-filter-${id})`}>
            {/* Cross-hatched rune lines on torso */}
            <path d="M 50,92 L 58,86 M 62,130 L 70,124" stroke={na} strokeWidth="1" opacity="0.5" />
            <path d="M 110,92 L 102,86 M 98,130 L 90,124" stroke={na} strokeWidth="1" opacity="0.5" />
            <path d="M 54,108 L 62,104 L 68,110 M 92,108 L 100,104 L 106,110"
              stroke={na} strokeWidth="0.9" fill="none" opacity="0.45" />
            {/* Rune text fragments */}
            <text x="55" y="100" fontSize="8" fill={na} opacity="0.65" fontFamily="serif">ᚠ</text>
            <text x="96" y="100" fontSize="8" fill={na} opacity="0.65" fontFamily="serif">ᚢ</text>
            <text x="72" y="128" fontSize="8" fill={na} opacity="0.6" fontFamily="serif">ᛏ</text>
            <text x="80" y="58" fontSize="7" fill={na} opacity="0.55" fontFamily="serif">ᚾ</text>
          </g>

          {/* Large floating shoulder armour fragments */}
          <g style={{ animation: `thrael-fragment-${id} 3.8s ease-in-out infinite` }}>
            <path d="M 10,72 L 24,66 L 28,78 L 20,86 L 10,82 Z" fill={c.mid} opacity="0.9" />
            <path d="M 12,74 L 22,68 L 26,78 L 20,84 L 12,80 Z" fill={c.dark} opacity="0.5" />
            <path d="M 14,72 L 20,68 L 24,76" stroke={na} strokeWidth="1.2" fill="none" opacity="0.8"
              filter={`url(#tg-glow-filter-${id})`} />
          </g>
          <g style={{ animation: `thrael-fragment2-${id} 3.8s ease-in-out infinite` }}>
            <path d="M 150,72 L 136,66 L 132,78 L 140,86 L 150,82 Z" fill={c.mid} opacity="0.9" />
            <path d="M 148,74 L 138,68 L 134,78 L 140,84 L 148,80 Z" fill={c.dark} opacity="0.5" />
            <path d="M 146,72 L 140,68 L 136,76" stroke={na} strokeWidth="1.2" fill="none" opacity="0.8"
              filter={`url(#tg-glow-filter-${id})`} />
          </g>

          {/* Glowing rune diamond on chest */}
          <path d="M 80,88 L 86,96 L 80,104 L 74,96 Z"
            fill={na} opacity="0.25" filter={`url(#tg-glow-filter-${id})`} />
          <path d="M 80,90 L 84,96 L 80,102 L 76,96 Z"
            stroke={na} strokeWidth="1.2" fill="none" opacity="0.8" />

          {/* Crown stones */}
          <g style={{ animation: `thrael-fragment-${id} 2.6s ease-in-out infinite reverse` }}>
            <rect x="72" y="10" width="16" height="12" rx="3" fill={c.mid} opacity="0.85" />
            <rect x="73" y="11" width="14" height="10" rx="2" fill={c.dark} opacity="0.5" />
            <path d="M 76,13 L 80,10 L 84,13" stroke={na} strokeWidth="1.2" fill="none" opacity="0.9"
              filter={`url(#tg-glow-filter-${id})`} />
          </g>
        </>
      )}
    </svg>
  )
}
