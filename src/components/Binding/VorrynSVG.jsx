import { useEffect, useId } from 'react'
import { SPECIES_COLOR, NATURE_ACCENT } from './familiarColors'

// Vorryn — The Shadow Wraith
// Layer 1 (all stages): core body, haunches, limbs, glowing eyes
// Layer 2 (stage 2+):   flowing shadow mane, spectral tail wisps, shoulder markings
// Layer 3 (stage 3):    void crown, phantom wings, animated aura particles

export default function VorrynSVG({ stage = 1, nature = 'stoic', size = 200 }) {
  const id = useId().replace(/:/g, '')
  const c  = SPECIES_COLOR.vorryn
  const na = NATURE_ACCENT[nature]

  const keyframes = stage === 3 ? `
    @keyframes vorryn-breathe-${id} {
      0%,100% { transform: scaleY(1) translateY(0); }
      50%      { transform: scaleY(1.03) translateY(-2px); }
    }
    @keyframes vorryn-float-${id} {
      0%,100% { transform: translateY(0px); }
      50%      { transform: translateY(-4px); }
    }
    @keyframes vorryn-wisp-${id} {
      0%,100% { opacity: 0.15; transform: translateX(0) scaleX(1); }
      50%      { opacity: 0.55; transform: translateX(4px) scaleX(1.15); }
    }
    @keyframes vorryn-crown-${id} {
      0%,100% { opacity: 0.7; }
      50%      { opacity: 1; }
    }
    @keyframes vorryn-particle-${id} {
      0%   { opacity: 0; transform: translate(0,0) scale(0.5); }
      40%  { opacity: 0.8; }
      100% { opacity: 0; transform: translate(var(--px), var(--py)) scale(0); }
    }
  ` : stage === 2 ? `
    @keyframes vorryn-breathe-${id} {
      0%,100% { transform: scaleY(1); }
      50%      { transform: scaleY(1.02); }
    }
  ` : `
    @keyframes vorryn-breathe-${id} {
      0%,100% { transform: scaleY(1); }
      50%      { transform: scaleY(1.015); }
    }
  `

  return (
    <svg
      viewBox="0 0 160 160"
      width={size}
      height={size}
      style={{ overflow: 'visible', display: 'block' }}
      aria-label={`Vorryn familiar, stage ${stage}`}
    >
      <defs>
        <style>{keyframes}</style>
        <radialGradient id={`vg-glow-${id}`} cx="50%" cy="65%" r="48%">
          <stop offset="0%" stopColor={c.primary} stopOpacity="0.22" />
          <stop offset="100%" stopColor={c.primary} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`vg-eye-${id}`} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor={na} stopOpacity="1" />
          <stop offset="100%" stopColor={c.accent} stopOpacity="0.6" />
        </radialGradient>
        {stage >= 3 && (
          <radialGradient id={`vg-aura-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={na} stopOpacity="0.18" />
            <stop offset="100%" stopColor={na} stopOpacity="0" />
          </radialGradient>
        )}
        <filter id={`vg-blur-${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <filter id={`vg-glow-filter-${id}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="80" cy="148" rx="38" ry="7" fill={`url(#vg-glow-${id})`} />

      {/* Stage 3: aura ring */}
      {stage >= 3 && (
        <ellipse cx="80" cy="90" rx="58" ry="52" fill={`url(#vg-aura-${id})`}
          style={{ animation: `vorryn-float-${id} 3.2s ease-in-out infinite` }} />
      )}

      {/* ── Layer 1: Core body ── */}
      <g style={{ transformOrigin: '80px 120px', animation: `vorryn-breathe-${id} 3.5s ease-in-out infinite` }}>

        {/* Hindquarters */}
        <ellipse cx="80" cy="118" rx="28" ry="22" fill={c.dark} />
        <ellipse cx="80" cy="116" rx="25" ry="20" fill={c.mid} />

        {/* Haunches */}
        <ellipse cx="60" cy="124" rx="14" ry="10" fill={c.dark} transform="rotate(-10,60,124)" />
        <ellipse cx="100" cy="124" rx="14" ry="10" fill={c.dark} transform="rotate(10,100,124)" />

        {/* Front legs */}
        <rect x="65" y="130" width="9" height="18" rx="4" fill={c.dark} />
        <rect x="86" y="130" width="9" height="18" rx="4" fill={c.dark} />
        <rect x="66" y="144" width="7" height="5" rx="2" fill={c.primary} opacity="0.7" />
        <rect x="87" y="144" width="7" height="5" rx="2" fill={c.primary} opacity="0.7" />

        {/* Hind legs */}
        <rect x="50" y="128" width="8" height="16" rx="3" fill={c.mid} transform="rotate(-8,54,136)" />
        <rect x="102" y="128" width="8" height="16" rx="3" fill={c.mid} transform="rotate(8,106,136)" />

        {/* Chest */}
        <ellipse cx="80" cy="100" rx="22" ry="24" fill={c.dark} />
        <ellipse cx="80" cy="98" rx="19" ry="22" fill={c.mid} />

        {/* Neck */}
        <rect x="71" y="74" width="18" height="24" rx="8" fill={c.mid} />

        {/* Head */}
        <ellipse cx="80" cy="68" rx="20" ry="18" fill={c.dark} />
        <ellipse cx="80" cy="66" rx="17" ry="16" fill={c.mid} />

        {/* Muzzle */}
        <ellipse cx="80" cy="74" rx="10" ry="7" fill={c.dark} />
        <ellipse cx="80" cy="73" rx="8" ry="5.5" fill={c.mid} />

        {/* Ears */}
        <polygon points="65,56 60,40 72,52" fill={c.dark} />
        <polygon points="95,56 100,40 88,52" fill={c.dark} />
        <polygon points="65,55 62,44 71,52" fill={c.primary} opacity="0.6" />
        <polygon points="95,55 98,44 89,52" fill={c.primary} opacity="0.6" />

        {/* Eyes */}
        <ellipse cx="72" cy="63" rx="5.5" ry="6.5" fill="#0a0818" />
        <ellipse cx="88" cy="63" rx="5.5" ry="6.5" fill="#0a0818" />
        <ellipse cx="72" cy="62" rx="3.5" ry="4" fill={`url(#vg-eye-${id})`}
          filter={`url(#vg-glow-filter-${id})`} />
        <ellipse cx="88" cy="62" rx="3.5" ry="4" fill={`url(#vg-eye-${id})`}
          filter={`url(#vg-glow-filter-${id})`} />
        <ellipse cx="73" cy="61" rx="1.2" ry="1.6" fill="white" opacity="0.9" />
        <ellipse cx="89" cy="61" rx="1.2" ry="1.6" fill="white" opacity="0.9" />

        {/* Nose */}
        <ellipse cx="80" cy="76" rx="2.5" ry="1.8" fill={c.primary} opacity="0.7" />

        {/* Tail (stage 1 simple) */}
        {stage === 1 && (
          <path d="M 108,118 Q 126,108 122,92 Q 120,82 114,86" stroke={c.mid} strokeWidth="7" fill="none" strokeLinecap="round" />
        )}

        {/* Chest markings */}
        <path d="M 74,95 Q 80,88 86,95" stroke={c.accent} strokeWidth="1.2" fill="none" opacity="0.5" />
      </g>

      {/* ── Layer 2: Shadow mane + spectral appendages (stage 2+) ── */}
      {stage >= 2 && (
        <g style={{ animation: `vorryn-wisp-${id} 2.8s ease-in-out infinite` }}>
          {/* Shadow mane flowing back */}
          <path d="M 62,56 Q 48,48 40,36 Q 50,42 58,52" fill={c.dark} opacity="0.85" />
          <path d="M 98,56 Q 112,48 120,36 Q 110,42 102,52" fill={c.dark} opacity="0.85" />
          <path d="M 68,52 Q 56,38 50,22 Q 60,34 70,48" fill={c.primary} opacity="0.5" />
          <path d="M 92,52 Q 104,38 110,22 Q 100,34 90,48" fill={c.primary} opacity="0.5" />
          <path d="M 80,50 Q 72,32 76,14 Q 80,28 84,50" fill={c.mid} opacity="0.55" />

          {/* Spectral tail wisps */}
          <path d="M 108,118 Q 130,106 132,88 Q 128,76 120,80 Q 128,90 120,102 Q 112,114 108,118"
            fill={c.primary} opacity="0.4" />
          <path d="M 110,116 Q 136,100 138,80 Q 134,66 126,70"
            stroke={c.accent} strokeWidth="2" fill="none" opacity="0.35" strokeLinecap="round" />
          <path d="M 112,114 Q 142,96 144,72"
            stroke={c.accent} strokeWidth="1" fill="none" opacity="0.2" strokeLinecap="round" />

          {/* Shoulder void sigils */}
          <text x="57" y="100" fontSize="10" fill={na} opacity="0.55" fontFamily="serif">ᛟ</text>
          <text x="97" y="100" fontSize="10" fill={na} opacity="0.55" fontFamily="serif">ᚨ</text>
          <path d="M 68,108 L 72,102 L 68,96 L 72,90" stroke={c.accent} strokeWidth="0.8" fill="none" opacity="0.4" />
          <path d="M 88,108 L 92,102 L 88,96 L 92,90" stroke={c.accent} strokeWidth="0.8" fill="none" opacity="0.4" />
        </g>
      )}

      {/* ── Layer 3: Void crown + phantom wings + particles (stage 3) ── */}
      {stage >= 3 && (
        <>
          <g style={{ transformOrigin: '80px 50px', animation: `vorryn-float-${id} 3.2s ease-in-out infinite` }}>
            {/* Void crown */}
            <path d="M 62,50 L 58,36 L 68,46 L 80,30 L 92,46 L 102,36 L 98,50"
              fill={na} opacity="0.85" filter={`url(#vg-glow-filter-${id})`} />
            <path d="M 64,50 L 61,39 L 69,47 L 80,34 L 91,47 L 99,39 L 96,50"
              fill={c.primary} opacity="0.5" />
            {/* Crown gems */}
            <circle cx="80" cy="33" r="3.5" fill={na} filter={`url(#vg-glow-filter-${id})`} />
            <circle cx="65" cy="40" r="2.2" fill={na} opacity="0.75" />
            <circle cx="95" cy="40" r="2.2" fill={na} opacity="0.75" />
          </g>

          {/* Phantom wing left */}
          <g opacity="0.38" style={{ transformOrigin: '62px 96px',
            animation: `vorryn-wisp-${id} 4s ease-in-out infinite` }}>
            <path d="M 62,96 Q 30,72 18,50 Q 28,60 34,76 Q 22,68 20,82 Q 30,74 36,86 Q 26,82 28,94 Q 36,88 44,96"
              fill={c.dark} />
            <path d="M 62,96 Q 32,74 22,54" stroke={c.accent} strokeWidth="1.5" fill="none" opacity="0.6" />
            <path d="M 56,92 Q 30,76 24,62" stroke={c.accent} strokeWidth="0.8" fill="none" opacity="0.3" />
          </g>

          {/* Phantom wing right */}
          <g opacity="0.38" style={{ transformOrigin: '98px 96px',
            animation: `vorryn-wisp-${id} 4s ease-in-out infinite reverse` }}>
            <path d="M 98,96 Q 130,72 142,50 Q 132,60 126,76 Q 138,68 140,82 Q 130,74 124,86 Q 134,82 132,94 Q 124,88 116,96"
              fill={c.dark} />
            <path d="M 98,96 Q 128,74 138,54" stroke={c.accent} strokeWidth="1.5" fill="none" opacity="0.6" />
            <path d="M 104,92 Q 130,76 136,62" stroke={c.accent} strokeWidth="0.8" fill="none" opacity="0.3" />
          </g>

          {/* Floating void particles */}
          {[
            { x: 52, y: 78, px: -8, py: -18, delay: '0s',   dur: '3.1s' },
            { x: 110, y: 82, px: 10, py: -22, delay: '0.7s', dur: '2.8s' },
            { x: 78, y: 46, px: -4, py: -16,  delay: '1.4s', dur: '3.4s' },
            { x: 96, y: 60, px: 6,  py: -20,  delay: '0.3s', dur: '2.6s' },
            { x: 62, y: 110, px: -6, py: -14, delay: '1.8s', dur: '3.7s' },
          ].map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="2.2" fill={na}
              style={{
                '--px': `${p.px}px`, '--py': `${p.py}px`,
                animation: `vorryn-particle-${id} ${p.dur} ${p.delay} ease-out infinite`,
                filter: `url(#vg-glow-filter-${id})`,
              }} />
          ))}
        </>
      )}
    </svg>
  )
}
