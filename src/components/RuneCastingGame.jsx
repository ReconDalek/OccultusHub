import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from '../hooks/useSession'
import { API_BASE_URL } from '../config/api'
import RuneLeaderboard from './RuneLeaderboard'

const RUNES = [
  { symbol: 'ᚠ', name: 'Fehu',     rarity: 'common',    essence: 10, meaning: 'Wealth',    weight: 9 },
  { symbol: 'ᚢ', name: 'Uruz',     rarity: 'common',    essence: 12, meaning: 'Strength',  weight: 9 },
  { symbol: 'ᚦ', name: 'Thurisaz', rarity: 'common',    essence: 11, meaning: 'Thorn',     weight: 8 },
  { symbol: 'ᚨ', name: 'Ansuz',    rarity: 'common',    essence: 13, meaning: 'Wisdom',    weight: 8 },
  { symbol: 'ᚱ', name: 'Raido',    rarity: 'common',    essence: 10, meaning: 'Journey',   weight: 7 },
  { symbol: 'ᚲ', name: 'Kenaz',    rarity: 'common',    essence: 14, meaning: 'Beacon',    weight: 7 },
  { symbol: 'ᚷ', name: 'Gebo',     rarity: 'uncommon',  essence: 50, meaning: 'Gift',      weight: 4 },
  { symbol: 'ᚹ', name: 'Wunjo',    rarity: 'uncommon',  essence: 55, meaning: 'Joy',       weight: 4 },
  { symbol: 'ᚺ', name: 'Hagalaz',  rarity: 'uncommon',  essence: 60, meaning: 'Hail',      weight: 3 },
  { symbol: 'ᚾ', name: 'Nauthiz',  rarity: 'uncommon',  essence: 65, meaning: 'Need',      weight: 3 },
  { symbol: 'ᛊ', name: 'Sowilo',   rarity: 'rare',      essence: 200, meaning: 'Sun',      weight: 1.5 },
  { symbol: 'ᛏ', name: 'Tiwaz',    rarity: 'rare',      essence: 220, meaning: 'Victory',  weight: 1.2 },
  { symbol: 'ᛚ', name: 'Laguz',    rarity: 'rare',      essence: 250, meaning: 'The Deep', weight: 1.0 },
  { symbol: '⊕', name: 'The Void', rarity: 'legendary', essence: 800,  meaning: 'All and Nothing', weight: 0.3 },
  { symbol: '☽', name: 'Bloodmoon',rarity: 'legendary', essence: 1200, meaning: 'The Crimson Rite', weight: 0.2 },
  { symbol: '⊗', name: 'The Abyss',rarity: 'legendary', essence: 2000, meaning: 'That Which Watches', weight: 0.1 },
]

const RARITY_COLORS = {
  common:    { text: '#94a3b8', glow: 'rgba(148,163,184,0.4)', bg: 'rgba(148,163,184,0.1)' },
  uncommon:  { text: '#22c55e', glow: 'rgba(34,197,94,0.5)',   bg: 'rgba(34,197,94,0.1)'   },
  rare:      { text: '#8b5cf6', glow: 'rgba(139,92,246,0.6)',  bg: 'rgba(139,92,246,0.1)'  },
  legendary: { text: '#fbbf24', glow: 'rgba(251,191,36,0.7)',  bg: 'rgba(251,191,36,0.12)' },
}

const READINGS = {
  triple_legendary: ['The Convergence of Voids', 'Three ancient forces align. The order trembles.', 5],
  double_legendary: ['Twin Abyssal Sigils', 'Two abyssal forces mirror each other across the veil.', 3],
  triple_rare:      ['The Radiant Trifecta', 'Rare forces resonate in perfect triplicate.', 2.5],
  triple_any:       ['Perfect Resonance', 'Three voices of the same tone. Pure and undeniable.', 2],
  double_rare:      ['The Echoing Pair', 'Two rare forces speak in unison.', 1.8],
  double_any:       ['Dual Resonance', 'A harmony emerges between two forces.', 1.5],
  all_different:    ['The Wandering Path', 'Three distinct forces chart an uncertain course.', 1, 15],
}

const COOLDOWN_MS = 12 * 60 * 60 * 1000

function weightedRandom(pool) {
  const total = pool.reduce((s, r) => s + r.weight, 0)
  let rand = Math.random() * total
  for (const r of pool) { rand -= r.weight; if (rand <= 0) return r }
  return pool[pool.length - 1]
}

function calculateReading(runes) {
  const base = runes.reduce((s, r) => s + r.essence, 0)
  const counts = {}
  runes.forEach(r => { counts[r.rarity] = (counts[r.rarity] || 0) + 1 })
  const lCount = counts.legendary || 0
  const rCount = counts.rare || 0
  const maxSame = Math.max(...Object.values(counts))
  const allDiff = Object.keys(counts).length === 3

  let key, bonus = 0
  if (lCount === 3)       key = 'triple_legendary'
  else if (lCount === 2)  key = 'double_legendary'
  else if (rCount === 3)  key = 'triple_rare'
  else if (maxSame === 3) key = 'triple_any'
  else if (rCount === 2)  key = 'double_rare'
  else if (maxSame === 2) key = 'double_any'
  else                    key = 'all_different'

  const [name, flavour, mult, flat = 0] = READINGS[key]
  const total = Math.floor(base * mult) + flat
  return { name, flavour, mult, bonus: flat, total, key }
}

function formatCountdown(ms) {
  if (ms <= 0) return '0:00:00'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

function RuneStone({ rune, revealed, delay }) {
  const rc = rune ? RARITY_COLORS[rune.rarity] : null
  return (
    <div className="rune-stone" style={{
      width: '90px', height: '120px',
      perspective: '600px',
      flexShrink: 0,
    }}>
      <div style={{
        width: '100%', height: '100%',
        position: 'relative',
        transformStyle: 'preserve-3d',
        transition: `transform 0.7s cubic-bezier(0.4,0,0.2,1) ${delay}ms`,
        transform: revealed ? 'rotateY(180deg)' : 'rotateY(0deg)',
      }}>
        {/* Back face */}
        <div style={{
          position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
          borderRadius: '10px',
          background: 'linear-gradient(145deg, rgba(20,8,40,0.95), rgba(10,4,24,0.98))',
          border: '1px solid rgba(109,40,217,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
        }}>
          <span style={{ fontSize: '28px', color: 'rgba(109,40,217,0.4)', fontFamily: 'monospace' }}>⊕</span>
        </div>
        {/* Front face */}
        <div style={{
          position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          borderRadius: '10px',
          background: rune ? `linear-gradient(145deg, ${rc.bg}, rgba(6,2,16,0.95))` : 'rgba(6,2,16,0.95)',
          border: `1px solid ${rune ? rc.glow.replace('0.', '0.4') : 'rgba(109,40,217,0.3)'}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px',
          boxShadow: rune ? `0 0 16px ${rc.glow}` : 'none',
          padding: '8px',
        }}>
          <span style={{ fontSize: '32px', color: rune ? rc.text : '#7c3aed', fontFamily: 'monospace', lineHeight: 1 }}>
            {rune?.symbol || '?'}
          </span>
          <span style={{ fontSize: '11px', fontFamily: 'Cinzel, serif', letterSpacing: '1px', color: rune ? rc.text : '#7c3aed', textAlign: 'center' }}>
            {rune?.name || ''}
          </span>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textAlign: 'center' }}>
            {rune?.meaning || ''}
          </span>
          {rune && (
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#fbbf24', fontFamily: 'Cinzel, serif' }}>
              {rune.essence}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function RuneCastingGame({ open, onClose }) {
  const { user } = useSession()
  const [state, setState] = useState('idle') // idle | casting | revealing | result | cooldown
  const [drawnRunes, setDrawnRunes] = useState([null, null, null])
  const [revealed, setRevealed] = useState([false, false, false])
  const [reading, setReading] = useState(null)
  const [totalPoints, setTotalPoints] = useState(user?.runePoints || 0)
  const [cooldownMs, setCooldownMs] = useState(0)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const countdownRef = useRef(null)
  const castTimeRef = useRef(null)

  const cleanup = useCallback(() => { clearInterval(countdownRef.current) }, [])

  useEffect(() => {
    if (!open) { cleanup(); setState('idle'); setDrawnRunes([null,null,null]); setRevealed([false,false,false]); setReading(null) }
    return cleanup
  }, [open, cleanup])

  useEffect(() => {
    if (!open || !user?.lastRuneCastAt) return
    const last = new Date(user.lastRuneCastAt.replace(' ', 'T') + 'Z')
    const remaining = (last.getTime() + COOLDOWN_MS) - Date.now()
    if (remaining > 0) { setCooldownMs(remaining); setState('cooldown') }
  }, [open, user])

  useEffect(() => {
    if (state !== 'cooldown' && state !== 'result') { clearInterval(countdownRef.current); return }
    countdownRef.current = setInterval(() => {
      setCooldownMs(prev => {
        const next = prev - 1000
        if (next <= 0) { clearInterval(countdownRef.current); setState('idle'); return 0 }
        return next
      })
    }, 1000)
    return () => clearInterval(countdownRef.current)
  }, [state])

  async function castRunes() {
    if (!user) return
    const token = localStorage.getItem('occultusSession')
    try {
      const res = await fetch(`${API_BASE_URL}/api/runes/cast`, {
        method: 'POST', headers: { Authorization: token },
      })
      const data = await res.json()
      if (!data.ok) { setCooldownMs(data.msRemaining || 0); setState('cooldown'); return }
    } catch { return }

    castTimeRef.current = Date.now()
    localStorage.setItem('runeLastCastAt', castTimeRef.current)
    window.dispatchEvent(new CustomEvent('runeCooldownStart'))
    const r1 = weightedRandom(RUNES)
    const r2 = weightedRandom(RUNES)
    const r3 = weightedRandom(RUNES)
    const runes = [r1, r2, r3]
    setDrawnRunes(runes)
    setRevealed([false, false, false])
    setState('revealing')

    // Reveal one by one with delays
    setTimeout(() => setRevealed([true, false, false]), 400)
    setTimeout(() => setRevealed([true, true, false]), 1200)
    setTimeout(() => setRevealed([true, true, true]), 2000)

    setTimeout(async () => {
      const read = calculateReading(runes)
      setReading(read)
      setState('result')
      const elapsed = castTimeRef.current ? Date.now() - castTimeRef.current : 0
      setCooldownMs(Math.max(0, COOLDOWN_MS - elapsed))
      // Record server-side
      try {
        const res2 = await fetch(`${API_BASE_URL}/api/runes/record`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: JSON.stringify({ rune1: r1.name, rune2: r2.name, rune3: r3.name, bonusType: read.key, points: read.total }),
        })
        const d2 = await res2.json()
        if (d2.totalPoints != null) setTotalPoints(d2.totalPoints)
      } catch { /* ignore */ }
    }, 2800)
  }

  function reset() {
    cleanup()
    setDrawnRunes([null,null,null]); setRevealed([false,false,false]); setReading(null)
    const elapsed = castTimeRef.current ? Date.now() - castTimeRef.current : 0
    setCooldownMs(Math.max(0, COOLDOWN_MS - elapsed))
    setState('cooldown')
  }

  if (!open) return null

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px',
        }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <style>{`
          @keyframes castCircle {
            0%   { transform: rotate(0deg); opacity: 0.4; }
            100% { transform: rotate(360deg); opacity: 0.4; }
          }
          @keyframes runeReveal {
            0%   { transform: translateY(20px); opacity: 0; }
            100% { transform: translateY(0); opacity: 1; }
          }
          @keyframes readingGlow {
            0%,100% { box-shadow: 0 0 20px rgba(109,40,217,0.3); }
            50%      { box-shadow: 0 0 40px rgba(109,40,217,0.6), 0 0 60px rgba(179,18,63,0.2); }
          }
          @media (max-width: 400px) {
            .rune-stone       { width: 70px !important; height: 96px !important; }
            .rune-stones-row  { gap: 8px !important; }
            .rune-cast-btn    { padding: 11px 24px !important; width: 100%; }
          }
          @media (max-width: 480px) {
            .rune-cast-btn    { padding: 11px 28px !important; }
          }
        `}</style>

        <div style={{ width: '100%', maxWidth: '520px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              color: "var(--text-secondary)", borderRadius: '8px', padding: '6px 14px',
              cursor: 'pointer', fontSize: '13px',
            }}>✕ Close</button>
          </div>

          <div style={{
            background: 'rgba(6,3,18,0.98)',
            border: '1px solid rgba(109,40,217,0.25)',
            borderRadius: '16px', overflow: 'hidden',
            boxShadow: '0 0 60px rgba(109,40,217,0.08)',
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              background: 'linear-gradient(135deg, rgba(109,40,217,0.2), rgba(179,18,63,0.15))',
              borderBottom: '1px solid rgba(109,40,217,0.2)',
            }}>
              <h2 style={{ margin: 0, fontFamily: 'Cinzel, serif', fontSize: '18px', letterSpacing: '3px', color: '#e9d5ff' }}>
                ᚠ THE RUNE CASTING
              </h2>
              <p style={{ margin: '4px 0 0', color: '#7c3aed', fontSize: '12px', letterSpacing: '0.08em' }}>
                Draw three runes from the void — their resonance determines your reading
              </p>
            </div>

            {/* Casting circle + rune stones */}
            <div style={{
              padding: '32px 24px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px',
              position: 'relative', minHeight: '220px',
            }}>
              {/* Decorative circle */}
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '280px', height: '280px',
                borderRadius: '50%', border: '1px solid rgba(109,40,217,0.12)',
                pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '220px', height: '220px',
                borderRadius: '50%', border: '1px solid rgba(179,18,63,0.08)',
                pointerEvents: 'none',
                animation: (state === 'revealing' || state === 'result') ? 'castCircle 12s linear infinite' : 'none',
              }} />

              {/* Rune stones row */}
              <div className="rune-stones-row" style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {[0,1,2].map(i => (
                  <RuneStone
                    key={i}
                    rune={drawnRunes[i]}
                    revealed={revealed[i]}
                    delay={0}
                  />
                ))}
              </div>

              {/* Reading result */}
              {state === 'result' && reading && (
                <div style={{
                  textAlign: 'center', padding: '16px 20px', borderRadius: '12px',
                  background: 'rgba(109,40,217,0.08)', border: '1px solid rgba(109,40,217,0.2)',
                  animation: 'readingGlow 2s ease-in-out infinite',
                  width: '100%', maxWidth: '340px',
                }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '15px', color: '#e9d5ff', letterSpacing: '1px', marginBottom: '6px' }}>
                    {reading.name}
                  </div>
                  <div style={{ fontSize: '12px', color: "var(--text-secondary)", fontStyle: 'italic', marginBottom: '10px' }}>
                    {reading.flavour}
                  </div>
                  <div style={{ fontSize: '13px', color: '#7c3aed', marginBottom: '4px' }}>
                    Base: {drawnRunes.reduce((s,r) => s + (r?.essence||0), 0)} essence
                    {reading.mult > 1 && ` × ${reading.mult}`}
                    {reading.bonus > 0 && ` + ${reading.bonus}`}
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: '#fbbf24', fontFamily: 'Cinzel, serif' }}>
                    +{reading.total} essence
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div style={{
              padding: '16px 24px 20px',
              borderTop: '1px solid rgba(109,40,217,0.12)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
            }}>
              <div style={{ fontSize: '12px', color: 'rgba(180,160,220,0.6)', letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'center' }}>
                {state === 'idle'      && 'ᚠ Cast the runes and receive your reading'}
                {state === 'casting'   && 'ᚠ Consulting the void...'}
                {state === 'revealing' && 'ᚠ The runes reveal themselves...'}
                {state === 'result'    && '⏳ The runes must rest — next casting in:'}
                {state === 'cooldown'  && '⏳ The runes must rest — next casting in:'}
              </div>

              {(state === 'result' || state === 'cooldown') && (
                <div style={{
                  padding: '12px 28px', borderRadius: '10px', textAlign: 'center',
                  background: 'rgba(109,40,217,0.08)', border: '1px solid rgba(109,40,217,0.2)',
                }}>
                  <div style={{ fontSize: '26px', fontWeight: 800, fontFamily: 'monospace', color: '#a78bfa', letterSpacing: '2px' }}>
                    {formatCountdown(cooldownMs)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#4c1d95', marginTop: '4px', letterSpacing: '0.1em' }}>HOURS · MINS · SECS</div>
                </div>
              )}

              {!user && (
                <div style={{ fontSize: '13px', color: '#f87171' }}>You must be initiated to cast the runes.</div>
              )}

              {state === 'idle' && user && (
                <button className="rune-cast-btn" onClick={castRunes} style={{
                  padding: '12px 40px', borderRadius: '12px', fontWeight: 800,
                  fontSize: '14px', cursor: 'pointer', letterSpacing: '0.08em',
                  background: 'linear-gradient(145deg, rgba(109,40,217,0.5), rgba(179,18,63,0.35))',
                  border: '1px solid rgba(109,40,217,0.45)', color: '#e9d5ff',
                  boxShadow: '0 0 20px rgba(109,40,217,0.25)', fontFamily: 'Cinzel, serif',
                }}>
                  ᚠ Cast the Runes
                </button>
              )}


              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
                {user && (
                  <span style={{ fontSize: '12px', color: '#fbbf24' }}>
                    ✦ Rune essence: <strong>{totalPoints.toLocaleString()}</strong>
                  </span>
                )}
                <button onClick={() => setLeaderboardOpen(true)} style={{
                  background: 'rgba(109,40,217,0.1)', border: '1px solid rgba(109,40,217,0.25)',
                  color: '#a78bfa', borderRadius: '8px', padding: '5px 12px',
                  cursor: 'pointer', fontSize: '12px', letterSpacing: '0.05em',
                }}>
                  📜 Rune Seers
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <RuneLeaderboard open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />
    </>
  )
}
