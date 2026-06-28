import { useId } from 'react'
import { SPECIES_COLOR, NATURE_ACCENT } from './familiarColors'

// Saelix — The Arcane Serpent
// Layer 1 (all stages): coiled serpent body, hooded head, glowing slit eyes
// Layer 2 (stage 2+):   arcane sigils along body, levitation wisps, fin-crests
// Layer 3 (stage 3):    multiple arcane eye patterns, full levitation, elemental orbit

export default function SaelixSVG({ stage = 1, nature = 'stoic', size = 200 }) {
  const id = useId().replace(/:/g, '')
  const c  = SPECIES_COLOR.saelix
  const na = NATURE_ACCENT[nature]

  const keyframes = `
    @keyframes saelix-sway-${id} {
      0%,100% { transform: rotate(-2deg) translateY(0); }
      50%      { transform: rotate(2deg) translateY(${stage >= 2 ? '-5px' : '0'}); }
    }
    @keyframes saelix-hood-${id} {
      0%,100% { transform: scaleX(1); }
      50%      { transform: scaleX(${stage >= 2 ? '1.06' : '1.02'}); }
    }
    @keyframes saelix-sigil-${id} {
      0%,100% { opacity: ${stage >= 2 ? '0.55' : '0.2'}; }
      50%      { opacity: ${stage >= 2 ? '0.85' : '0.4'}; }
    }
    @keyframes saelix-orbit-${id} {
      from { transform: rotate(0deg) translateX(44px) rotate(0deg); }
      to   { transform: rotate(360deg) translateX(44px) rotate(-360deg); }
    }
    @keyframes saelix-orbit2-${id} {
      from { transform: rotate(120deg) translateX(38px) rotate(-120deg); }
      to   { transform: rotate(480deg) translateX(38px) rotate(-480deg); }
    }
    @keyframes saelix-orbit3-${id} {
      from { transform: rotate(240deg) translateX(40px) rotate(-240deg); }
      to   { transform: rotate(600deg) translateX(40px) rotate(-600deg); }
    }
    @keyframes saelix-float-${id} {
      0%,100% { transform: translateY(0); }
      50%      { transform: translateY(-6px); }
    }
  `

  return (
    <svg
      viewBox="0 0 160 160"
      width={size}
      height={size}
      style={{ overflow: 'visible', display: 'block' }}
      aria-label={`Saelix familiar, stage ${stage}`}
    >
      <defs>
        <style>{keyframes}</style>
        <radialGradient id={`sg-glow-${id}`} cx="50%" cy="65%" r="48%">
          <stop offset="0%" stopColor={c.primary} stopOpacity="0.2" />
          <stop offset="100%" stopColor={c.primary} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`sg-eye-${id}`} cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor={na} stopOpacity="1" />
          <stop offset="100%" stopColor={c.accent} stopOpacity="0.5" />
        </radialGradient>
        <radialGradient id={`sg-scale-${id}`} cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor={c.primary} stopOpacity="0.9" />
          <stop offset="100%" stopColor={c.dark} stopOpacity="1" />
        </radialGradient>
        <filter id={`sg-glow-filter-${id}`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={`sg-soft-${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
      </defs>

      {/* Ground shadow / levitation glow */}
      <ellipse cx="80" cy={stage >= 2 ? 150 : 148} rx="32" ry="6" fill={`url(#sg-glow-${id})`} />

      {/* ── Layer 1: Coiled body ── */}
      <g style={{
        transformOrigin: '80px 100px',
        animation: `saelix-sway-${id} 4s ease-in-out infinite`
      }}>
        {/* Outer coil bottom */}
        <ellipse cx="80" cy="126" rx="36" ry="16" fill={c.dark} />
        <ellipse cx="80" cy="124" rx="32" ry="13" fill={c.mid} />

        {/* Outer coil top */}
        <ellipse cx="80" cy="104" rx="30" ry="14" fill={c.dark} />
        <ellipse cx="80" cy="102" rx="26" ry="12" fill={c.mid} />

        {/* Inner coil */}
        <ellipse cx="80" cy="116" rx="18" ry="9" fill={c.dark} />
        <ellipse cx="80" cy="114" rx="15" ry="7" fill={`url(#sg-scale-${id})`} />

        {/* Scale texture lines */}
        <path d="M 52,108 Q 66,104 80,108 Q 94,104 108,108" stroke={c.accent} strokeWidth="0.8" fill="none" opacity="0.35" />
        <path d="M 56,116 Q 68,112 80,116 Q 92,112 104,116" stroke={c.accent} strokeWidth="0.8" fill="none" opacity="0.35" />
        <path d="M 58,124 Q 68,120 80,124 Q 92,120 102,124" stroke={c.accent} strokeWidth="0.8" fill="none" opacity="0.35" />

        {/* Body rising from coil */}
        <path d="M 68,104 Q 64,88 66,72 Q 68,58 72,48" stroke={c.dark} strokeWidth="22" fill="none" strokeLinecap="round" />
        <path d="M 68,104 Q 64,88 66,72 Q 68,58 72,48" stroke={c.mid} strokeWidth="18" fill="none" strokeLinecap="round" />
        <path d="M 68,104 Q 64,88 66,72 Q 68,58 72,48" stroke={c.primary} strokeWidth="12" fill="none" strokeLinecap="round" opacity="0.5" />

        {/* Body scale marks */}
        <path d="M 63,96 Q 68,92 73,96" stroke={c.accent} strokeWidth="0.8" fill="none" opacity="0.4" />
        <path d="M 64,84 Q 68,80 72,84" stroke={c.accent} strokeWidth="0.8" fill="none" opacity="0.4" />
        <path d="M 66,72 Q 70,68 74,72" stroke={c.accent} strokeWidth="0.8" fill="none" opacity="0.4" />

        {/* Hood / head */}
        <g style={{ transformOrigin: '76px 40px', animation: `saelix-hood-${id} 3.8s ease-in-out infinite` }}>
          <ellipse cx="76" cy="40" rx="22" ry="10" fill={c.dark} />
          <ellipse cx="76" cy="38" rx="19" ry="8.5" fill={c.mid} />
          {/* Hood flare sides */}
          <path d="M 56,40 Q 48,30 52,22 Q 58,32 58,40" fill={c.dark} opacity="0.9" />
          <path d="M 96,40 Q 104,30 100,22 Q 94,32 94,40" fill={c.dark} opacity="0.9" />
          <path d="M 57,40 Q 50,32 54,24" fill={c.primary} opacity="0.45" />
          <path d="M 95,40 Q 102,32 98,24" fill={c.primary} opacity="0.45" />

          {/* Face / snout */}
          <ellipse cx="76" cy="44" rx="11" ry="7" fill={c.dark} />
          <ellipse cx="76" cy="43" rx="9" ry="5.5" fill={c.mid} />

          {/* Slit eyes */}
          <ellipse cx="70" cy="37" rx="4.5" ry="5.5" fill="#020c08" />
          <ellipse cx="82" cy="37" rx="4.5" ry="5.5" fill="#020c08" />
          <ellipse cx="70" cy="36.5" rx="2" ry="4" fill={`url(#sg-eye-${id})`}
            filter={`url(#sg-glow-filter-${id})`} />
          <ellipse cx="82" cy="36.5" rx="2" ry="4" fill={`url(#sg-eye-${id})`}
            filter={`url(#sg-glow-filter-${id})`} />
          {/* Slit pupil */}
          <rect x="69.2" y="34" width="1.6" height="5.5" rx="0.8" fill="#010804" opacity="0.9" />
          <rect x="81.2" y="34" width="1.6" height="5.5" rx="0.8" fill="#010804" opacity="0.9" />
          <ellipse cx="70.8" cy="35.5" rx="0.7" ry="1" fill="white" opacity="0.85" />
          <ellipse cx="82.8" cy="35.5" rx="0.7" ry="1" fill="white" opacity="0.85" />

          {/* Tongue */}
          <path d="M 76,47 L 74,52 M 76,47 L 78,52" stroke={na} strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.7" />
        </g>

        {/* Tail tip peeking from coil */}
        <path d="M 104,122 Q 116,116 112,104 Q 108,96 104,104 Q 108,110 100,118" fill={c.mid} opacity="0.7" />
      </g>

      {/* ── Layer 2: Arcane sigils + fin-crests (stage 2+) ── */}
      {stage >= 2 && (
        <g style={{ animation: `saelix-sigil-${id} 2.6s ease-in-out infinite` }}>
          {/* Body arcane markings */}
          <circle cx="67" cy="78" r="4.5" stroke={na} strokeWidth="1.2" fill="none" opacity="0.65" />
          <circle cx="67" cy="78" r="2.2" fill={na} opacity="0.4" />
          <path d="M 67,73 L 67,70 M 67,83 L 67,86 M 62,78 L 59,78 M 72,78 L 75,78"
            stroke={na} strokeWidth="0.9" opacity="0.5" />

          <circle cx="65" cy="96" r="3.8" stroke={na} strokeWidth="1" fill="none" opacity="0.55" />
          <circle cx="65" cy="96" r="1.6" fill={na} opacity="0.35" />

          <text x="102" y="114" fontSize="9" fill={na} opacity="0.6" fontFamily="serif">ᚱ</text>
          <text x="50" y="130" fontSize="9" fill={na} opacity="0.6" fontFamily="serif">ᚷ</text>

          {/* Fin crests on hood */}
          <path d="M 60,32 Q 54,24 58,16 Q 62,24 64,32" fill={c.primary} opacity="0.55" />
          <path d="M 92,32 Q 98,24 94,16 Q 90,24 88,32" fill={c.primary} opacity="0.55" />
          <path d="M 76,28 Q 72,20 76,12 Q 80,20 80,28" fill={c.accent} opacity="0.6" />

          {/* Levitation wisps */}
          <path d="M 50,118 Q 42,112 44,102 Q 48,110 52,116" fill={c.primary} opacity="0.25" />
          <path d="M 110,118 Q 118,112 116,102 Q 112,110 108,116" fill={c.primary} opacity="0.25" />
          <path d="M 46,122 Q 36,115 38,104" stroke={c.accent} strokeWidth="1.5" fill="none" opacity="0.3" strokeLinecap="round" />
          <path d="M 114,122 Q 124,115 122,104" stroke={c.accent} strokeWidth="1.5" fill="none" opacity="0.3" strokeLinecap="round" />
        </g>
      )}

      {/* ── Layer 3: Arcane orbit + eye patterns (stage 3) ── */}
      {stage >= 3 && (
        <>
          <g style={{ transformOrigin: '80px 90px', animation: `saelix-float-${id} 3.5s ease-in-out infinite` }}>
            {/* Arcane eye pattern on hood */}
            <circle cx="76" cy="26" r="5.5" fill={c.dark} stroke={na} strokeWidth="1.2" />
            <ellipse cx="76" cy="26" rx="1.8" ry="4" fill={na} filter={`url(#sg-glow-filter-${id})`} />
            <circle cx="76" cy="23.5" r="0.8" fill="white" opacity="0.9" />

            {/* Secondary arcane eyes floating */}
            {[{ x: 48, y: 68 }, { x: 104, y: 72 }].map((e, i) => (
              <g key={i}>
                <circle cx={e.x} cy={e.y} r="4.5" fill={c.dark} stroke={na} strokeWidth="1" opacity="0.75" />
                <ellipse cx={e.x} cy={e.y} rx="1.5" ry="3.2" fill={na} opacity="0.8"
                  filter={`url(#sg-glow-filter-${id})`} />
              </g>
            ))}
          </g>

          {/* Orbiting elemental wisps */}
          <g style={{ transformOrigin: '80px 95px' }}>
            <circle r="5" fill={na} opacity="0.55" filter={`url(#sg-glow-filter-${id})`}
              style={{ animation: `saelix-orbit-${id} 5s linear infinite`,
                transformOrigin: '80px 95px' }} />
          </g>
          <g style={{ transformOrigin: '80px 95px' }}>
            <circle r="4" fill={c.accent} opacity="0.5" filter={`url(#sg-glow-filter-${id})`}
              style={{ animation: `saelix-orbit2-${id} 5s linear infinite`,
                transformOrigin: '80px 95px' }} />
          </g>
          <g style={{ transformOrigin: '80px 95px' }}>
            <circle r="3.5" fill={c.primary} opacity="0.65" filter={`url(#sg-soft-${id})`}
              style={{ animation: `saelix-orbit3-${id} 5s linear infinite`,
                transformOrigin: '80px 95px' }} />
          </g>

          {/* Arcane circle on coil */}
          <circle cx="80" cy="114" r="14" stroke={na} strokeWidth="0.8" fill="none" opacity="0.3"
            strokeDasharray="4 3" />
          <circle cx="80" cy="114" r="10" stroke={c.accent} strokeWidth="0.6" fill="none" opacity="0.25"
            strokeDasharray="3 4" />
        </>
      )}
    </svg>
  )
}
