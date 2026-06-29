import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from '../hooks/useSession'
import { API_BASE_URL } from '../config/api'
import VorrynSVG  from '../components/Binding/VorrynSVG'
import SaelixSVG  from '../components/Binding/SaelixSVG'
import PhraelSVG  from '../components/Binding/PhraelSVG'
import {
  NATURE_ACCENT, NATURE_LABEL, SPECIES_LABEL, STAT_LABELS, STAGE_LABEL, SPECIES_COLOR,
} from '../components/Binding/familiarColors'

// ── Bond helpers ─────────────────────────────────────────────────────────────

function bondTier(bond) {
  if (bond >= 80) return { label: 'Bound',         color: '#f0abfc' }
  if (bond >= 60) return { label: 'Devoted',        color: '#6ee7b7' }
  if (bond >= 40) return { label: 'Trusted',        color: '#a78bfa' }
  if (bond >= 20) return { label: 'Acknowledged',   color: '#f59e0b' }
  return                  { label: 'Wary',           color: '#ef4444' }
}

const NATURE_PASSIVE = {
  feisty:  { name: 'Berserker Rage',       desc: '+25% strength when HP drops below 40%' },
  timid:   { name: 'Defensive Instinct',   desc: 'Dodge chance + reduced damage when HP drops below 50%' },
  cunning: { name: 'Patient Precision',    desc: '15% dodge chance, +15% damage at high HP' },
  stoic:   { name: 'Fortified Resolve',    desc: '+40% effective resistance at all times' },
  feral:   { name: 'Frenzy Burst',         desc: '+20% damage first 3 rounds, high damage variance' },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function formatCooldown(secs) {
  if (secs <= 0) return 'Ready'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function cooldownRemaining(lastAt, ms) {
  if (!lastAt) return 0
  const elapsed = Date.now() - new Date(lastAt.replace(' ', 'T') + 'Z').getTime()
  return Math.max(0, Math.ceil((ms - elapsed) / 1000))
}

function FamiliarSVG({ species, stage, nature, size }) {
  if (species === 'vorryn') return <VorrynSVG stage={stage} nature={nature} size={size} />
  if (species === 'saelix')  return <SaelixSVG  stage={stage} nature={nature} size={size} />
  if (species === 'thrael')  return <PhraelSVG  stage={stage} nature={nature} size={size} />
  return null
}

// ── Ritual vision data ───────────────────────────────────────────────────────

const VISIONS = [
  {
    scene: 'The veil thins. A crossroads materialises from the void — three paths, each swallowed by absolute dark. Something stirs beyond all three.',
    prompt: 'You step forward.',
    answers: [
      { text: 'You stride into the darkest path without hesitation.', species: 'vorryn' },
      { text: 'You study the paths, reading the arcane current flowing between them.', species: 'saelix' },
      { text: 'You plant your feet and wait. The void will reveal its intent.', species: 'thrael' },
    ],
  },
  {
    scene: 'A rival practitioner steps from the shadow ahead. They demand your grimoire. Their eyes promise they will take it either way.',
    prompt: 'You respond.',
    answers: [
      { text: 'You move first — force them to retreat before they have decided.', species: 'vorryn' },
      { text: 'You offer a trade, knowing your copy is already committed to memory.', species: 'saelix' },
      { text: 'You fold your arms. They will tire long before you do.', species: 'thrael' },
    ],
  },
  {
    scene: 'The ritual chamber ignites. Smoke thickens and the ceiling splinters. Others are still trapped inside.',
    prompt: 'You act.',
    answers: [
      { text: 'You charge through the flames and drag them out yourself.', species: 'vorryn' },
      { text: 'You find the exit the others have not seen and move them through it.', species: 'saelix' },
      { text: 'You brace against the door frame and hold it open until the last one is clear.', species: 'thrael' },
    ],
  },
  {
    scene: 'The void stills. Something immense turns its attention toward you. It does not speak in words, but in want. It asks what you seek from the binding.',
    prompt: 'You answer the void.',
    answers: [
      { text: 'Raw strength. Enough to break any chain.', species: 'vorryn' },
      { text: 'Ancient knowledge. Enough to unravel any secret.', species: 'saelix' },
      { text: 'Unbreakable resolve. Enough to outlast any storm.', species: 'thrael' },
    ],
  },
  {
    scene: 'Something followed you back through the veil. It waits at the threshold of your mind, patient. Its intent is unclear.',
    prompt: 'You respond to it.',
    answers: [
      { text: 'You turn and face it immediately, whatever it is.', species: 'vorryn' },
      { text: 'You draw it somewhere controlled and watch how it moves.', species: 'saelix' },
      { text: 'You seal the threshold and prepare for whatever comes through.', species: 'thrael' },
    ],
  },
]

const NATURE_REVELATION = {
  feisty:  'Its presence is restless — kinetic, barely contained. It regards you like a challenge it intends to win.',
  timid:   'It watches from the edge of form, cautious. It will not come forward until it trusts you.',
  cunning: 'It circles once, reading you, before it settles. Nothing about it is accidental.',
  stoic:   'It stands without urgency. Ancient. It has waited before and knows how to wait again.',
  feral:   'It tears into existence without preamble — raw and unfiltered, like something that was never meant to be contained.',
}

const EVOLUTION_LORE = {
  2: {
    name: 'Awakened',
    text: 'The bond deepens. What was nascent has stirred into something fuller — older markings surface, and the void recognises it now.',
  },
  3: {
    name: 'Ascendant',
    text: 'The final threshold. The familiar no longer merely exists in this world — it reaches through it. The binding is complete.',
  },
}

// ── Evolution overlay ─────────────────────────────────────────────────────────

function EvolutionOverlay({ species, nature, fromStage, toStage, onDismiss }) {
  const [phase, setPhase] = useState('build')   // build | flash | reveal | done

  const sc     = SPECIES_COLOR[species]
  const naColor = NATURE_ACCENT[nature]
  const lore   = EVOLUTION_LORE[toStage]

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('flash'),  1800)
    const t2 = setTimeout(() => setPhase('reveal'), 2300)
    const t3 = setTimeout(() => setPhase('done'),   3200)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: phase === 'flash'
        ? 'rgba(255,255,255,0.92)'
        : 'rgba(2,0,8,0.97)',
      transition: 'background 0.15s ease',
      padding: 40,
    }}>
      <style>{`
        @keyframes evo-glow-pulse {
          0%,100% { filter: drop-shadow(0 0 20px ${sc.primary}88); }
          50%      { filter: drop-shadow(0 0 60px ${sc.primary}cc) drop-shadow(0 0 100px ${naColor}66); }
        }
        @keyframes evo-reveal-in {
          from { opacity: 0; transform: scale(0.6); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes evo-text-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes evo-ring-expand {
          from { transform: scale(0.5); opacity: 0.8; }
          to   { transform: scale(2.2); opacity: 0; }
        }
        @keyframes evo-build-pulse {
          0%,100% { transform: scale(1); }
          50%      { transform: scale(1.05); }
        }
      `}</style>

      {/* Expanding ring on flash */}
      {phase === 'flash' && (
        <div style={{
          position: 'absolute', width: 300, height: 300, borderRadius: '50%',
          border: `3px solid ${sc.primary}`,
          animation: 'evo-ring-expand 0.5s ease-out forwards',
        }} />
      )}

      {/* Pre-flash: current stage building up with intensifying glow */}
      {(phase === 'build') && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ animation: 'evo-build-pulse 0.6s ease-in-out infinite',
            filter: `drop-shadow(0 0 40px ${sc.primary}aa)` }}>
            <FamiliarSVG species={species} stage={fromStage} nature={nature} size={200} />
          </div>
          <p style={{ marginTop: 24, fontSize: 12, letterSpacing: 3, color: sc.accent, opacity: 0.7 }}>
            SOMETHING IS HAPPENING...
          </p>
        </div>
      )}

      {/* Post-flash: new stage revealed */}
      {(phase === 'reveal' || phase === 'done') && (
        <div style={{ textAlign: 'center', maxWidth: 440 }}>
          <div style={{ animation: 'evo-reveal-in 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards',
            animationFillMode: 'both' }}>
            <div style={{ animation: 'evo-glow-pulse 2.5s ease-in-out infinite',
              filter: `drop-shadow(0 0 30px ${sc.primary}99)` }}>
              <FamiliarSVG species={species} stage={toStage} nature={nature} size={220} />
            </div>
          </div>

          <div style={{ animation: 'evo-text-in 0.5s 0.3s ease both' }}>
            <p style={{ fontSize: 11, letterSpacing: 4, color: naColor, marginTop: 24, marginBottom: 6 }}>
              EVOLVED
            </p>
            <h2 className="font-cinzel" style={{ fontSize: 28, letterSpacing: 6, color: sc.accent, marginBottom: 16 }}>
              {lore.name.toUpperCase()}
            </h2>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, fontStyle: 'italic', marginBottom: 32 }}>
              "{lore.text}"
            </p>

            {phase === 'done' && (
              <button
                onClick={onDismiss}
                className="font-cinzel"
                style={{
                  padding: '12px 32px',
                  background: `linear-gradient(135deg, ${sc.primary}cc, ${sc.mid}88)`,
                  border: `1px solid ${sc.primary}60`,
                  borderRadius: 8, color: '#f4f4f5',
                  fontSize: 12, letterSpacing: 3, cursor: 'pointer',
                  animation: 'evo-text-in 0.4s ease both',
                }}>
                CONTINUE
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Components ───────────────────────────────────────────────────────────────

function StatBar({ label, value, max = 12, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", width: 80, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, (value / max) * 100)}%`, height: '100%',
          background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#e4e4e7', width: 20, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function ActionButton({ label, sublabel, onClick, disabled, cooldownSecs, color = '#b3123f' }) {
  const [cd, setCd] = useState(cooldownSecs)
  const timerRef = useRef(null)

  useEffect(() => {
    setCd(cooldownSecs)
  }, [cooldownSecs])

  useEffect(() => {
    if (cd <= 0) { clearInterval(timerRef.current); return }
    timerRef.current = setInterval(() => setCd(p => Math.max(0, p - 1)), 1000)
    return () => clearInterval(timerRef.current)
  }, [cd])

  const ready = cd <= 0 && !disabled

  return (
    <button
      onClick={ready ? onClick : undefined}
      style={{
        padding: '14px 18px',
        background: ready ? `linear-gradient(135deg, ${color}cc, ${color}88)` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${ready ? color + '80' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 10,
        color: ready ? '#f4f4f5' : "var(--text-faint)",
        cursor: ready ? 'pointer' : 'not-allowed',
        textAlign: 'left',
        transition: 'all 0.2s',
        width: '100%',
      }}
      onMouseEnter={e => { if (ready) e.currentTarget.style.opacity = '0.85' }}
      onMouseLeave={e => { if (ready) e.currentTarget.style.opacity = '1' }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 11, marginTop: 3, opacity: 0.7 }}>
        {cd > 0 ? formatCooldown(cd) : sublabel}
      </div>
    </button>
  )
}

function EventCard({ event, onDismiss }) {
  const d = typeof event.detail_json === 'string' ? JSON.parse(event.detail_json) : event.detail_json

  const TITLES = {
    void_surge:         'Void Surge',
    shard_cache:        'Shard Cache',
    nature_revelation:  'Nature Revelation',
    omen:               'Omen Received',
    shadow_encounter:   'Shadow Encounter',
    resting_challenger: 'Resting Challenger',
    challenged:         'Challenged',
  }

  const ICONS = {
    void_surge: '⚡', shard_cache: '◆', nature_revelation: '✦',
    omen: '☽', shadow_encounter: '◈', resting_challenger: '⚔', challenged: '⚔',
  }

  return (
    <div style={{
      background: 'rgba(179,18,63,0.08)',
      border: '1px solid rgba(179,18,63,0.25)',
      borderRadius: 10,
      padding: '14px 16px',
      marginBottom: 10,
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{ICONS[event.event_type]}</span>
        <span className="font-cinzel" style={{ fontSize: 13, letterSpacing: 2, color: '#f4f4f5' }}>
          {TITLES[event.event_type]}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>{d.message}</p>
      {(d.xp || d.shards || d.bonusXp || d.bonusShards) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {(d.xp || d.bonusXp) && (
            <span style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(109,40,217,0.2)',
              border: '1px solid rgba(109,40,217,0.4)', borderRadius: 20, color: '#a78bfa' }}>
              +{d.xp || d.bonusXp} XP
            </span>
          )}
          {(d.shards || d.bonusShards) && (
            <span style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(245,158,11,0.15)',
              border: '1px solid rgba(245,158,11,0.35)', borderRadius: 20, color: '#f59e0b' }}>
              +{d.shards || d.bonusShards} Shards
            </span>
          )}
          {typeof d.won === 'boolean' && (
            <span style={{ fontSize: 11, padding: '2px 8px',
              background: d.won ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${d.won ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.3)'}`,
              borderRadius: 20, color: d.won ? '#6ee7b7' : '#fca5a5' }}>
              {d.won ? 'Victory' : 'Defeated'}
            </span>
          )}
        </div>
      )}
      <button onClick={onDismiss}
        style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none',
          color: "var(--text-faint)", cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>✕</button>
    </div>
  )
}

// ── Ritual intro ─────────────────────────────────────────────────────────────

function RitualIntro({ onComplete }) {
  const [phase, setPhase]           = useState('intro')      // intro | visions | summoning | reveal
  const [visionIdx, setVisionIdx]   = useState(0)
  const [selected, setSelected]     = useState(null)
  const [scores, setScores]         = useState({ vorryn: 0, saelix: 0, thrael: 0 })
  const [fadingOut, setFadingOut]   = useState(false)
  const [species, setSpecies]       = useState(null)
  const [nature, setNature]         = useState(null)
  const [summoning, setSummoning]   = useState(false)
  const [revealed, setRevealed]     = useState(false)
  const [creating, setCreating]     = useState(false)
  const [familiarName, setFamiliarName] = useState('')

  const fadeTransition = (cb) => {
    setFadingOut(true)
    setTimeout(() => { setFadingOut(false); cb() }, 500)
  }

  const chooseAnswer = (ans) => {
    if (selected !== null) return
    setSelected(ans.species)
    const newScores = { ...scores, [ans.species]: scores[ans.species] + 1 }
    setScores(newScores)

    setTimeout(() => {
      if (visionIdx < VISIONS.length - 1) {
        fadeTransition(() => { setVisionIdx(v => v + 1); setSelected(null) })
      } else {
        // Tally
        const winner = Object.entries(newScores).reduce((a, b) => b[1] > a[1] ? b : a)[0]
        const picks  = Object.entries(newScores).filter(([, v]) => v === newScores[winner]).map(([k]) => k)
        const finalSpecies = picks[Math.floor(Math.random() * picks.length)]
        const natures = ['feisty', 'timid', 'cunning', 'stoic', 'feral']
        const finalNature = natures[Math.floor(Math.random() * natures.length)]
        setSpecies(finalSpecies)
        setNature(finalNature)
        fadeTransition(() => { setPhase('summoning'); setSummoning(true) })
      }
    }, 600)
  }

  useEffect(() => {
    if (phase === 'summoning') {
      setTimeout(() => { fadeTransition(() => { setPhase('reveal'); setRevealed(true) }) }, 3000)
    }
  }, [phase])

  const confirmBinding = async () => {
    setCreating(true)
    try {
      const name = familiarName.trim().slice(0, 24)
      const res = await fetch(`${API_BASE_URL}/api/binding/create`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ species, ...(name.length >= 2 ? { name } : {}) }),
      })
      const data = await res.json()
      if (res.ok) onComplete(data.familiar)
    } catch (e) {
      console.error(e)
    } finally {
      setCreating(false)
    }
  }

  const sc  = species ? SPECIES_COLOR[species] : null
  const naColor = nature ? NATURE_ACCENT[nature] : '#b3123f'

  const containerStyle = {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    color: '#f4f4f5',
    transition: 'opacity 0.5s ease',
    opacity: fadingOut ? 0 : 1,
  }

  // Ritual sigil progress
  const progress = phase === 'visions' ? (visionIdx / VISIONS.length) : phase === 'summoning' || phase === 'reveal' ? 1 : 0
  const circumference = 2 * Math.PI * 28
  const dashoffset = circumference * (1 - progress)

  const RitualSigil = () => (
    <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 32px', opacity: phase === 'intro' ? 0.3 : 0.7 }}>
      <svg viewBox="0 0 64 64" width="64" height="64">
        <circle cx="32" cy="32" r="28" stroke="rgba(255,255,255,0.08)" strokeWidth="2" fill="none" />
        <circle cx="32" cy="32" r="28" stroke={naColor} strokeWidth="2" fill="none"
          strokeDasharray={circumference} strokeDashoffset={dashoffset}
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
          transform="rotate(-90 32 32)" />
        <text x="32" y="37" textAnchor="middle" fontSize="18" fill="rgba(255,255,255,0.4)">⛧</text>
      </svg>
    </div>
  )

  if (phase === 'intro') return (
    <div style={containerStyle}>
      <div style={{ maxWidth: 560, textAlign: 'center' }}>
        <RitualSigil />
        <h1 className="font-cinzel" style={{ fontSize: 'clamp(22px,5vw,36px)', letterSpacing: 8, marginBottom: 20, color: '#f4f4f5' }}>
          THE BINDING
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", letterSpacing: 2, marginBottom: 32 }}>A RITE OF SUMMONING</p>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          The veil between this world and the void has grown thin. Something stirs beyond it — ancient, powerful, and waiting for one who can carry its nature.
        </p>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 40 }}>
          You will perform the Binding. The being that answers will be yours to tend, train, and command. What comes depends entirely on what you are.
        </p>
        <button
          onClick={() => fadeTransition(() => setPhase('visions'))}
          className="font-cinzel"
          style={{
            padding: '14px 40px',
            background: 'linear-gradient(135deg, #b3123fcc, #6d28d988)',
            border: '1px solid rgba(179,18,63,0.5)',
            borderRadius: 8,
            color: '#f4f4f5',
            fontSize: 13,
            letterSpacing: 3,
            cursor: 'pointer',
          }}
        >
          BEGIN THE RITE
        </button>
      </div>
    </div>
  )

  if (phase === 'visions') {
    const vision = VISIONS[visionIdx]
    return (
      <div style={containerStyle}>
        <div style={{ maxWidth: 600, width: '100%' }}>
          <RitualSigil />

          <p style={{ fontSize: 11, color: "var(--text-faint)", letterSpacing: 3, textAlign: 'center', marginBottom: 28 }}>
            VISION {visionIdx + 1} OF {VISIONS.length}
          </p>

          <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.85, marginBottom: 8, fontStyle: 'italic',
            textAlign: 'center', maxWidth: 480, margin: '0 auto 24px' }}>
            "{vision.scene}"
          </p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", letterSpacing: 1, textAlign: 'center', marginBottom: 28 }}>
            {vision.prompt}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {vision.answers.map((ans, i) => {
              const isSelected = selected === ans.species
              const isOther    = selected !== null && selected !== ans.species
              return (
                <button
                  key={i}
                  onClick={() => chooseAnswer(ans)}
                  style={{
                    padding: '16px 20px',
                    background: isSelected ? 'rgba(179,18,63,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isSelected ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 10,
                    color: isOther ? "var(--text-ghost)" : '#d4d4d8',
                    cursor: selected !== null ? 'default' : 'pointer',
                    textAlign: 'left',
                    fontSize: 14,
                    lineHeight: 1.65,
                    transition: 'all 0.25s',
                    opacity: isOther ? 0.4 : 1,
                  }}
                  onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'rgba(179,18,63,0.3)' }}
                  onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                >
                  {ans.text}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'summoning') return (
    <div style={containerStyle}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <p style={{ fontSize: 12, color: "var(--text-faint)", letterSpacing: 3, marginBottom: 40 }}>THE VEIL ANSWERS</p>
        <div style={{
          animation: 'fadeInScale 1s ease forwards',
          opacity: summoning ? 1 : 0,
        }}>
          <style>{`@keyframes fadeInScale { from { opacity:0; transform:scale(0.7); } to { opacity:1; transform:scale(1); } }`}</style>
          <div style={{ filter: `drop-shadow(0 0 30px ${sc.primary}88)` }}>
            <FamiliarSVG species={species} stage={1} nature={nature} size={200} />
          </div>
        </div>
        <p className="font-cinzel" style={{ fontSize: 18, letterSpacing: 4, marginTop: 24, color: sc.accent }}>
          {SPECIES_LABEL[species].toUpperCase()}
        </p>
      </div>
    </div>
  )

  if (phase === 'reveal') return (
    <div style={containerStyle}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <div style={{ filter: `drop-shadow(0 0 20px ${sc.primary}66)`, marginBottom: 24 }}>
          <FamiliarSVG species={species} stage={1} nature={nature} size={160} />
        </div>

        <p className="font-cinzel" style={{ fontSize: 20, letterSpacing: 5, color: sc.accent, marginBottom: 8 }}>
          {SPECIES_LABEL[species].toUpperCase()}
        </p>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20,
          padding: '4px 14px', border: `1px solid ${naColor}44`,
          borderRadius: 20, background: `${naColor}12` }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: naColor, display: 'inline-block' }} />
          <span style={{ fontSize: 12, letterSpacing: 2, color: naColor }}>{NATURE_LABEL[nature].toUpperCase()}</span>
        </div>

        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 32, fontStyle: 'italic' }}>
          "{NATURE_REVELATION[nature]}"
        </p>

        <p style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 20, letterSpacing: 1 }}>
          The bond is formed. What happens next is yours to write.
        </p>

        <div style={{ marginBottom: 28, textAlign: 'left' }}>
          <p style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: 2, marginBottom: 10, textAlign: 'center' }}>
            BESTOW A NAME <span style={{ color: "var(--text-ghost)" }}>— OPTIONAL</span>
          </p>
          <input
            type="text"
            value={familiarName}
            onChange={e => setFamiliarName(e.target.value)}
            maxLength={24}
            placeholder="Leave empty to name later..."
            style={{
              width: '100%', padding: '11px 14px',
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${sc.primary}30`,
              borderRadius: 8, color: '#f4f4f5', fontSize: 14,
              outline: 'none', textAlign: 'center',
              boxSizing: 'border-box',
            }}
          />
          {familiarName.trim().length === 1 && (
            <p style={{ fontSize: 11, color: '#f59e0b', marginTop: 6, textAlign: 'center' }}>
              Name must be at least 2 characters
            </p>
          )}
        </div>

        <button
          onClick={confirmBinding}
          disabled={creating || familiarName.trim().length === 1}
          className="font-cinzel"
          style={{
            padding: '14px 36px',
            background: `linear-gradient(135deg, ${sc.primary}cc, ${sc.mid}88)`,
            border: `1px solid ${sc.primary}60`,
            borderRadius: 8,
            color: '#f4f4f5',
            fontSize: 13,
            letterSpacing: 3,
            cursor: creating || familiarName.trim().length === 1 ? 'not-allowed' : 'pointer',
            opacity: creating || familiarName.trim().length === 1 ? 0.6 : 1,
          }}
        >
          {creating ? 'SEALING THE BOND...' : 'ENTER THE BINDING'}
        </button>
      </div>
    </div>
  )

  return null
}

// ── Main dashboard ────────────────────────────────────────────────────────────

// ── Action result overlay ─────────────────────────────────────────────────────

const DISMISS_MS = 6000

function ActionResultOverlay({ result, onDismiss }) {
  const { type, data } = result
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const start = Date.now()
    const tick = setInterval(() => {
      const elapsed = Date.now() - start
      const pct = Math.max(0, 100 - (elapsed / DISMISS_MS) * 100)
      setProgress(pct)
      if (pct === 0) { clearInterval(tick); onDismiss() }
    }, 40)
    return () => clearInterval(tick)
  }, [])

  const GRADE_COLOR = {
    Excellent: '#6ee7b7', Good: '#a78bfa', Fair: '#f59e0b', Poor: '#fb923c', Critical: '#ef4444',
  }
  const gradeColor = GRADE_COLOR[data.grade] || "var(--text-secondary)"
  const isTrain = type === 'train'
  const isRest  = type === 'rest'
  const accent  = isTrain ? '#a78bfa' : isRest ? '#6ee7b7' : '#f59e0b'
  const title   = isTrain ? 'TRAINING REPORT' : isRest ? 'REST COMPLETE' : 'HUNT REPORT'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 16px',
      pointerEvents: 'none',
    }}>
      <div style={{
        width: '100%', maxWidth: 420,
        background: 'rgba(10,8,18,0.96)',
        border: `1px solid ${accent}40`,
        borderRadius: 16,
        boxShadow: `0 8px 48px rgba(0,0,0,0.7), 0 0 0 1px ${accent}18`,
        overflow: 'hidden',
        pointerEvents: 'all',
        animation: 'bindResultIn 0.25s ease-out both',
      }}>
        <style>{`
          @keyframes bindResultIn {
            from { opacity: 0; transform: translateY(18px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0)    scale(1); }
          }
        `}</style>

        {/* Countdown bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
          <div style={{
            height: '100%', background: accent,
            width: `${progress}%`, transition: 'width 0.04s linear',
            borderRadius: 3,
          }} />
        </div>

        <div style={{ padding: '18px 20px', position: 'relative' }}>
          <button onClick={onDismiss}
            style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none',
              color: "var(--text-faint)", cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>✕</button>

          <div className="font-cinzel" style={{ fontSize: 11, letterSpacing: 3, color: accent, marginBottom: 14 }}>
            {title}
          </div>

          {isRest ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>HP Restored</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#6ee7b7' }}>
                  {data.hpRestored > 0 ? `+${data.hpRestored}` : 'Full'} · {data.newHp}/{data.maxHp}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Happiness</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#6ee7b7' }}>
                  {data.happinessGained > 0 ? `+${data.happinessGained}` : 'Already at max'} · {data.newHappiness}/100
                </span>
              </div>
              {data.bondGain > 0 && (() => {
                const bt = bondTier(data.newBond)
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Bond</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: bt.color }}>
                      +{data.bondGain} · {bt.label} ({data.newBond}/100)
                    </span>
                  </div>
                )
              })()}
            </div>
          ) : data.failed ? (
            <div>
              <p style={{ fontSize: 14, color: '#ef4444', marginBottom: 10 }}>
                Your familiar was too weary to respond. The attempt was wasted.
              </p>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Condition: <span style={{ color: '#ef4444' }}>{data.grade}</span>
                {data.condition && <>{' · '}HP {data.condition.hp}/{data.condition.max_hp}{' · '}Happiness {data.condition.happiness}/100</>}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Experience</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {data.lvMult > 100 && (
                    <span style={{ fontSize: 10, color: '#6ee7b7', background: 'rgba(16,185,129,0.1)',
                      border: '1px solid rgba(16,185,129,0.25)', borderRadius: 20, padding: '1px 7px' }}>
                      Lv ×{(data.lvMult / 100).toFixed(2)}
                    </span>
                  )}
                  {data.efficiency < 100 && (
                    <span style={{ fontSize: 10, color: gradeColor, background: `${gradeColor}18`,
                      border: `1px solid ${gradeColor}35`, borderRadius: 20, padding: '1px 7px' }}>
                      {data.grade} {data.efficiency}%
                    </span>
                  )}
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#a78bfa' }}>+{data.xp} XP</span>
                </div>
              </div>

              {!isTrain && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Shards</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#f59e0b' }}>+{data.shards} ◆</span>
                </div>
              )}

              {data.levelsGained > 0 && (
                <div style={{ padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(109,40,217,0.12)', border: '1px solid rgba(109,40,217,0.3)',
                  fontSize: 13, color: '#c4b5fd', textAlign: 'center' }}>
                  ✦ Level up — now level {data.newLevel}
                </div>
              )}

              {data.encounter && (
                <div style={{ padding: '10px 14px', borderRadius: 8,
                  background: data.encounter.won ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)',
                  border: `1px solid ${data.encounter.won ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4,
                    color: data.encounter.won ? '#6ee7b7' : '#fca5a5' }}>
                    {data.encounter.won ? 'Encounter — Victory' : 'Encounter — Defeated'}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Wild {data.encounter.wildSpecies} ({data.encounter.wildNature})
                    {data.encounter.bonusXp > 0 && <> · +{data.encounter.bonusXp} XP</>}
                    {data.encounter.bonusShards > 0 && <> · +{data.encounter.bonusShards} ◆</>}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 11, color: "var(--text-muted)", borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
                Condition: <span style={{ color: gradeColor }}>{data.grade}</span>
                {data.condition && <>{' · '}HP {data.condition.hp}/{data.condition.max_hp}{' · '}Happiness {data.condition.happiness}/100</>}
                {data.bondGain > 0 && (() => {
                  const bt = bondTier(data.newBond)
                  return <span style={{ color: bt.color }}>{' · '}+{data.bondGain} bond ({bt.label})</span>
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FamiliarDashboard({ familiar: initFamiliar, events: initEvents, onRefresh }) {
  const { user }                        = useSession()
  const [familiar, setFamiliar]         = useState(initFamiliar)
  const [events, setEvents]             = useState(initEvents)
  const [others, setOthers]             = useState([])
  const [battles, setBattles]           = useState([])
  const [leaderboard, setLeaderboard]   = useState([])
  const [expandedBattle, setExpandedBattle] = useState(null)  // battle index expanded for round view
  const [tab, setTab]                   = useState('home')
  const [actionMsg, setActionMsg]       = useState(null)
  const [actionResult, setActionResult] = useState(null)  // rich result panel for train/hunt
  const [loading, setLoading]           = useState(false)
  const [shopMsg, setShopMsg]           = useState(null)
  const [evolutionPending, setEvoPending] = useState(null)  // { fromStage, toStage, species, nature }
  const [reviving, setReviving]         = useState(false)
  const [nameModal, setNameModal]       = useState(false)
  const [nameInput, setNameInput]       = useState('')
  const [nameSaving, setNameSaving]     = useState(false)

  const sc = SPECIES_COLOR[familiar.species]
  const naColor = NATURE_ACCENT[familiar.nature]

  const COOLDOWNS_MS = {
    train: 6 * 3600000,
    hunt:  familiar.omen_active ? 2 * 3600000 : 4 * 3600000,
    rest:  12 * 3600000,
  }

  const cdTrain = cooldownRemaining(familiar.last_trained_at, COOLDOWNS_MS.train)
  const cdHunt  = cooldownRemaining(familiar.last_hunted_at,  COOLDOWNS_MS.hunt)
  const cdRest  = cooldownRemaining(familiar.last_rested_at,  COOLDOWNS_MS.rest)

  const showMsg = (msg, color = "var(--text-secondary)") => {
    setActionMsg({ text: msg, color })
    setTimeout(() => setActionMsg(null), 4000)
  }

  async function doAction(endpoint) {
    if (loading) return
    setLoading(true)
    setActionResult(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/binding/${endpoint}`, {
        method: 'POST', headers: authHeaders(),
      })
      const data = await res.json()
      if (!res.ok) {
        showMsg(data.error || 'Something went wrong.', '#ef4444')
        return
      }
      const fresh = await fetch(`${API_BASE_URL}/api/binding/familiar`, { headers: authHeaders() })
      const freshData = await fresh.json()
      const prevStage = familiar.stage
      setFamiliar(freshData.familiar)
      if (freshData.events?.length) setEvents(e => [...freshData.events, ...e])

      if (data.evolved && data.newStage > prevStage) {
        setEvoPending({ fromStage: prevStage, toStage: data.newStage, species: familiar.species, nature: familiar.nature })
        return
      }

      if (endpoint === 'train' || endpoint === 'hunt' || endpoint === 'rest') {
        setActionResult({ type: endpoint, data })
      }
    } catch {
      showMsg('Connection error.', '#ef4444')
    } finally {
      setLoading(false)
    }
  }

  async function doDuel(targetUserId) {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/binding/duel`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ targetUserId }),
      })
      const data = await res.json()
      if (!res.ok) { showMsg(data.error || 'Duel failed.', '#ef4444'); return }

      const fresh = await fetch(`${API_BASE_URL}/api/binding/familiar`, { headers: authHeaders() })
      const freshData = await fresh.json()
      const prevStage = familiar.stage
      setFamiliar(freshData.familiar)

      if (data.evolved && data.newStage > prevStage) {
        setEvoPending({ fromStage: prevStage, toStage: data.newStage, species: familiar.species, nature: familiar.nature })
      } else {
        showMsg(
          data.won
            ? `Victory! Defeated ${data.opponent.username}'s ${data.opponent.species}. +${data.shards} Shards, +${data.xp} XP.`
            : `Defeated by ${data.opponent.username}'s ${data.opponent.species}. +${data.xp} XP consolation.`,
          data.won ? '#6ee7b7' : '#fca5a5'
        )
      }
      setBattles(b => [data, ...b])
    } catch (e) {
      showMsg('Connection error.', '#ef4444')
    } finally {
      setLoading(false)
    }
  }

  async function allocate(stat) {
    if (familiar.stat_points < 1 || loading) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/binding/allocate`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ stat }),
      })
      const data = await res.json()
      if (res.ok) setFamiliar(data.familiar)
    } catch (e) {}
    finally { setLoading(false) }
  }

  async function dismissEvent(eventId) {
    setEvents(ev => ev.filter(e => e.id !== eventId))
    await fetch(`${API_BASE_URL}/api/binding/events/${eventId}/seen`, {
      method: 'POST', headers: authHeaders(),
    })
  }

  useEffect(() => {
    if (tab === 'duel') {
      fetch(`${API_BASE_URL}/api/binding/others`, { headers: authHeaders() })
        .then(r => r.json()).then(d => setOthers(d.familiars || []))
    }
    if (tab === 'history') {
      setExpandedBattle(null)
      fetch(`${API_BASE_URL}/api/binding/battles`, { headers: authHeaders() })
        .then(r => r.json()).then(d => setBattles(d.battles || []))
    }
    if (tab === 'leaderboard') {
      fetch(`${API_BASE_URL}/api/binding/leaderboard`, { headers: authHeaders() })
        .then(r => r.json()).then(d => setLeaderboard(d.leaderboard || []))
    }
  }, [tab])

  async function doRevive() {
    if (reviving) return
    setReviving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/binding/revive`, {
        method: 'POST', headers: authHeaders(),
      })
      const data = await res.json()
      if (!res.ok) {
        showMsg(data.error || 'The rite failed.', '#ef4444')
        return
      }
      setFamiliar(data.familiar)
      showMsg('The rite is complete. Your familiar stirs back into form.', '#6ee7b7')
    } catch {
      showMsg('Connection error.', '#ef4444')
    } finally {
      setReviving(false)
    }
  }

  async function buyShopItem(item) {
    if (loading) return
    setLoading(true)
    setShopMsg(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/binding/shop/buy`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ item }),
      })
      const data = await res.json()
      if (!res.ok) {
        setShopMsg({ text: data.error || 'Purchase failed.', color: '#ef4444' })
        return
      }
      setFamiliar(data.familiar)
      if (data.effect?.type === 'name_scroll') {
        setNameInput(data.familiar.name || '')
        setNameModal(true)
      } else if (data.effect?.evolved && data.effect.newStage > familiar.stage) {
        setEvoPending({ fromStage: familiar.stage, toStage: data.effect.newStage, species: familiar.species, nature: familiar.nature })
      } else {
        const ITEM_NAMES = { feast: 'Void Feast', elixir: 'Growth Elixir', shadow_charm: 'Shadow Charm', tonic: 'Binding Tonic' }
        setShopMsg({ text: `${ITEM_NAMES[item]} used.`, color: '#6ee7b7' })
        setTimeout(() => setShopMsg(null), 3500)
      }
    } catch (e) {
      setShopMsg({ text: 'Connection error.', color: '#ef4444' })
    } finally {
      setLoading(false)
    }
  }

  async function doRename() {
    const name = nameInput.trim()
    if (name.length < 2 || nameSaving) return
    setNameSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/binding/rename`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (res.ok) {
        setFamiliar(data.familiar)
        setNameModal(false)
        setNameInput('')
        showMsg(`Your familiar is now known as ${data.familiar.name}.`, '#a78bfa')
      } else {
        showMsg(data.error || 'Rename failed.', '#ef4444')
      }
    } catch {
      showMsg('Connection error.', '#ef4444')
    } finally {
      setNameSaving(false)
    }
  }

  const STATS = [
    ['stat_str', sc.primary],
    ['stat_agi', '#3b82f6'],
    ['stat_vit', '#10b981'],
    ['stat_arc', '#a78bfa'],
    ['stat_res', '#f59e0b'],
    ['stat_ess', '#ec4899'],
  ]

  const TABS = [
    { key: 'home',        label: 'Familiar' },
    { key: 'duel',        label: 'Duel' },
    { key: 'history',     label: 'Battles' },
    { key: 'shop',        label: 'Shop' },
    { key: 'leaderboard', label: 'Rankings' },
  ]

  return (
    <>
    {evolutionPending && (
      <EvolutionOverlay
        species={evolutionPending.species}
        nature={evolutionPending.nature}
        fromStage={evolutionPending.fromStage}
        toStage={evolutionPending.toStage}
        onDismiss={() => setEvoPending(null)}
      />
    )}
    {nameModal && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1300,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(2,0,8,0.88)', padding: '0 20px',
      }}>
        <div style={{
          width: '100%', maxWidth: 400,
          background: 'rgba(10,8,20,0.98)',
          border: `1px solid ${naColor}30`,
          borderRadius: 16, padding: '28px 24px',
          boxShadow: `0 8px 48px rgba(0,0,0,0.7)`,
        }}>
          <h3 className="font-cinzel" style={{ fontSize: 15, letterSpacing: 4, color: naColor, marginBottom: 8 }}>
            NAME YOUR FAMILIAR
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 20 }}>
            The scroll burns away as the name is spoken into the bond. This cannot be undone without another scroll.
          </p>
          <input
            type="text"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            maxLength={24}
            placeholder="Enter a name..."
            autoFocus
            style={{
              width: '100%', padding: '11px 14px',
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${naColor}30`,
              borderRadius: 8, color: '#f4f4f5', fontSize: 14,
              outline: 'none', marginBottom: 16, boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => { setNameModal(false); setNameInput('') }}
              style={{
                flex: 1, padding: '11px', borderRadius: 8,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                color: "var(--text-muted)", fontSize: 13, cursor: 'pointer',
              }}>
              Cancel
            </button>
            <button
              onClick={doRename}
              disabled={nameInput.trim().length < 2 || nameSaving}
              style={{
                flex: 2, padding: '11px', borderRadius: 8,
                background: nameInput.trim().length >= 2 ? `linear-gradient(135deg, ${naColor}cc, ${naColor}66)` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${nameInput.trim().length >= 2 ? naColor + '60' : 'rgba(255,255,255,0.07)'}`,
                color: nameInput.trim().length >= 2 ? '#f4f4f5' : "var(--text-ghost)",
                fontSize: 13, letterSpacing: 2, cursor: nameInput.trim().length >= 2 ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}>
              {nameSaving ? 'BINDING...' : 'BESTOW NAME'}
            </button>
          </div>
        </div>
      </div>
    )}
    <style>{`
      .binding-tabs button { font-size: 11px; padding: 7px 6px; letter-spacing: 0; }
      .binding-fam-card    { padding: 24px 18px !important; }
      .binding-fam-svg     { }
      .binding-actions     { gap: 8px !important; }
      .binding-shop-item   { flex-wrap: wrap; gap: 10px !important; }
      .binding-shop-price  { display: flex; align-items: center; gap: 10px; }
      .binding-lb-row      { padding: 10px 12px !important; gap: 10px !important; }
      .binding-duel-row    { padding: 12px 14px !important; gap: 10px !important; }
      .binding-battle-row  { }
      .binding-round-log   { max-height: 260px !important; }
      @media (max-width: 480px) {
        .binding-tabs button            { font-size: 10px; padding: 7px 4px; }
        .binding-fam-card               { padding: 18px 14px !important; }
        .binding-actions                { grid-template-columns: 1fr !important; }
        .binding-stat-label             { width: 60px !important; font-size: 10px !important; }
        .binding-shop-item              { flex-direction: column; align-items: flex-start !important; }
        .binding-shop-price             { width: 100%; justify-content: space-between; }
        .binding-lb-row                 { padding: 10px 10px !important; gap: 8px !important; }
        .binding-lb-level               { display: none; }
        .binding-duel-row               { padding: 10px 12px !important; }
        .binding-battle-header          { gap: 10px !important; padding: 12px 12px !important; }
        .binding-battle-svgs            { display: none !important; }
        .binding-round-log              { max-height: 220px !important; }
        .binding-round-bar              { width: 60px !important; }
        .binding-happiness-shards span  { font-size: 11px !important; }
      }
      @media (max-width: 360px) {
        .binding-tabs button { font-size: 9px; padding: 6px 2px; }
      }
    `}</style>
    <div style={{ minHeight: '100vh', padding: '60px 16px 80px', color: '#f4f4f5' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Events */}
        {events.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p className="font-cinzel" style={{ fontSize: 11, letterSpacing: 3, color: "var(--text-faint)", marginBottom: 10 }}>
              EVENTS WHILE YOU WERE AWAY
            </p>
            {events.map(ev => (
              <EventCard key={ev.id} event={ev} onDismiss={() => dismissEvent(ev.id)} />
            ))}
          </div>
        )}

        {/* Action message (rest / errors) */}
        {actionMsg && (
          <div style={{ padding: '12px 16px', borderRadius: 8, marginBottom: 16,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            fontSize: 13, color: actionMsg.color }}>
            {actionMsg.text}
          </div>
        )}

        {/* Rich action result — fixed centered overlay */}
        {actionResult && <ActionResultOverlay result={actionResult} onDismiss={() => setActionResult(null)} />}

        {/* Tabs */}
        <div className="binding-tabs" style={{ display: 'flex', gap: 2, marginBottom: 24, background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 4 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 7, border: 'none',
                background: tab === t.key ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: tab === t.key ? '#f4f4f5' : "var(--text-muted)",
                fontSize: 12, letterSpacing: 1, cursor: 'pointer', transition: 'all 0.15s',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Home tab ── */}
        {tab === 'home' && !!familiar.dormant && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(30,5,5,0.97), rgba(10,5,15,0.98))',
            border: '1px solid rgba(179,18,63,0.25)',
            borderRadius: 16, padding: '40px 28px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 64, marginBottom: 20, filter: 'grayscale(1) opacity(0.4)' }}>
              <FamiliarSVG species={familiar.species} stage={familiar.stage} nature={familiar.nature} size={140} />
            </div>
            <h2 className="font-cinzel" style={{ fontSize: 18, letterSpacing: 5, color: '#7a3040', marginBottom: 12 }}>
              DORMANT
            </h2>
            <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.8, maxWidth: 360, margin: '0 auto 28px' }}>
              The bond has grown cold. Your familiar has retreated into silence — its form dim,
              its presence barely felt. Only a rite of revival can draw it back.
            </p>
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 24 }}>
              Cost: <span style={{ color: '#f59e0b' }}>500 Shards</span>
              &nbsp;·&nbsp; Balance: <span style={{ color: familiar.shards >= 500 ? '#f59e0b' : '#ef4444' }}>{familiar.shards} Shards</span>
            </div>
            <button
              onClick={doRevive}
              disabled={reviving || familiar.shards < 500}
              style={{
                padding: '13px 32px',
                background: familiar.shards >= 500 ? 'linear-gradient(135deg, rgba(179,18,63,0.8), rgba(100,10,40,0.9))' : 'rgba(60,20,25,0.5)',
                border: `1px solid ${familiar.shards >= 500 ? 'rgba(179,18,63,0.6)' : 'rgba(100,40,50,0.3)'}`,
                borderRadius: 10, color: familiar.shards >= 500 ? '#f4f4f5' : "var(--text-ghost)",
                fontSize: 13, letterSpacing: 2, cursor: familiar.shards >= 500 ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}>
              {reviving ? 'PERFORMING RITE...' : 'PERFORM REVIVAL RITE'}
            </button>
            {familiar.shards < 500 && (
              <p style={{ fontSize: 11, color: '#ef4444', marginTop: 12 }}>
                Insufficient shards. Hunt to accumulate more — but first, another must revive your familiar, or it remains dormant.
              </p>
            )}
          </div>
        )}

        {tab === 'home' && !familiar.dormant && (
          <>
            {/* Familiar card */}
            <div className="binding-fam-card" style={{
              background: `linear-gradient(135deg, ${sc.dark}40, rgba(5,5,10,0.95))`,
              border: `1px solid ${sc.primary}30`,
              borderRadius: 16,
              padding: '32px 28px',
              marginBottom: 16,
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Background glow */}
              <div style={{ position: 'absolute', inset: 0, background:
                `radial-gradient(ellipse at 50% 60%, ${sc.primary}18 0%, transparent 70%)`,
                pointerEvents: 'none' }} />

              <div style={{ position: 'relative', zIndex: 1 }}>
                {/* Stage badge */}
                <div style={{ position: 'absolute', top: 0, right: 0, fontSize: 10,
                  letterSpacing: 2, color: naColor, padding: '4px 10px',
                  border: `1px solid ${naColor}30`, borderRadius: 20, background: `${naColor}10` }}>
                  {STAGE_LABEL[familiar.stage].toUpperCase()}
                </div>

                <div style={{ filter: `drop-shadow(0 0 24px ${sc.primary}55)` }}>
                  <FamiliarSVG species={familiar.species} stage={familiar.stage} nature={familiar.nature} size={180} />
                </div>

                {familiar.name ? (
                  <>
                    <h2 className="font-cinzel"
                      style={{ fontSize: 22, letterSpacing: 5, color: sc.accent, margin: '16px 0 2px' }}>
                      {familiar.name.toUpperCase()}
                    </h2>
                    <p style={{ fontSize: 12, letterSpacing: 2, color: "var(--text-muted)", marginBottom: 4 }}>
                      {SPECIES_LABEL[familiar.species].toUpperCase()}
                    </p>
                  </>
                ) : (
                  <h2 className="font-cinzel"
                    style={{ fontSize: 22, letterSpacing: 5, color: sc.accent, margin: '16px 0 4px' }}>
                    {SPECIES_LABEL[familiar.species].toUpperCase()}
                  </h2>
                )}

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: naColor }} />
                  <span style={{ fontSize: 11, letterSpacing: 2, color: naColor }}>
                    {NATURE_LABEL[familiar.nature].toUpperCase()}
                  </span>
                  <span style={{ color: "var(--text-ghost)", margin: '0 4px' }}>·</span>
                  <span style={{ fontSize: 11, letterSpacing: 1, color: "var(--text-muted)" }}>
                    LVL {familiar.level}
                  </span>
                  <span style={{ color: "var(--text-ghost)", margin: '0 4px' }}>·</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {familiar.wins}W / {familiar.losses}L
                  </span>
                </div>

                {/* XP bar */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10,
                    color: "var(--text-faint)", marginBottom: 4 }}>
                    <span>XP</span>
                    <span>{familiar.xp} / {familiar.xp_to_next}</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{ height: '100%', borderRadius: 2,
                      width: `${(familiar.xp / familiar.xp_to_next) * 100}%`,
                      background: `linear-gradient(90deg, ${sc.primary}, ${sc.primary}99)`,
                      transition: 'width 0.4s ease' }} />
                  </div>
                </div>

                {/* HP bar */}
                <div style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10,
                    color: "var(--text-faint)", marginBottom: 4 }}>
                    <span>HP</span>
                    <span>{familiar.hp} / {familiar.max_hp}</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{ height: '100%', borderRadius: 2,
                      width: `${(familiar.hp / familiar.max_hp) * 100}%`,
                      background: 'linear-gradient(90deg, #10b981, #10b98199)',
                      transition: 'width 0.4s ease' }} />
                  </div>
                </div>

                {/* Happiness + shards + bond tier row */}
                <div className="binding-happiness-shards" style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
                  <span>☽ {familiar.happiness}/100 Happiness</span>
                  <span>◆ {familiar.shards} Shards</span>
                  <span style={{ color: bondTier(familiar.bond || 0).color }}>
                    ♥ {bondTier(familiar.bond || 0).label}
                  </span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 12, padding: '20px 20px 16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 11, letterSpacing: 2, color: "var(--text-faint)" }}>STATS</span>
                {familiar.stat_points > 0 && (
                  <span style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(109,40,217,0.2)',
                    border: '1px solid rgba(109,40,217,0.4)', borderRadius: 20, color: '#a78bfa' }}>
                    {familiar.stat_points} point{familiar.stat_points > 1 ? 's' : ''} to spend
                  </span>
                )}
              </div>
              {STATS.map(([key, color]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span className="binding-stat-label" style={{ fontSize: 11, color: "var(--text-muted)", width: 80, flexShrink: 0 }}>{STAT_LABELS[key]}</span>
                  <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, (familiar[key] / 14) * 100)}%`, height: '100%',
                      background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#e4e4e7', width: 20, textAlign: 'right' }}>
                    {familiar[key]}
                  </span>
                  {familiar.stat_points > 0 && (
                    <button onClick={() => allocate(key.replace('stat_', ''))}
                      style={{ width: 20, height: 20, borderRadius: '50%', border: `1px solid ${color}60`,
                        background: `${color}20`, color, fontSize: 12, lineHeight: 1, cursor: 'pointer',
                        padding: 0, flexShrink: 0 }}>+</button>
                  )}
                </div>
              ))}
            </div>

            {/* Nature passive */}
            {(() => {
              const p = NATURE_PASSIVE[familiar.nature]
              const nc = NATURE_ACCENT[familiar.nature]
              return p ? (
                <div style={{ background: `${nc}0a`, border: `1px solid ${nc}22`,
                  borderRadius: 10, padding: '12px 16px', marginBottom: 16,
                  display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 16, marginTop: 1 }}>✦</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: nc, marginBottom: 3 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{p.desc}</div>
                  </div>
                </div>
              ) : null
            })()}

            {/* Actions */}
            <div className="binding-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <ActionButton label="Train" sublabel="6h cooldown"
                onClick={() => doAction('train')} cooldownSecs={cdTrain} disabled={loading} color="#6d28d9" />
              <ActionButton label="Hunt" sublabel={familiar.omen_active ? '2h cooldown (omen)' : '4h cooldown'}
                onClick={() => doAction('hunt')} cooldownSecs={cdHunt} disabled={loading} color="#f59e0b" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <ActionButton label="Rest" sublabel="12h cooldown — restores HP and happiness"
                onClick={() => doAction('rest')} cooldownSecs={cdRest} disabled={loading} color="#10b981" />
            </div>
          </>
        )}

        {/* ── Duel tab ── */}
        {tab === 'duel' && (
          <div>
            {others.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", textAlign: 'center', padding: '40px 0', fontSize: 14 }}>
                No other familiars have been bound yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {others.map(f => {
                  const fsc = SPECIES_COLOR[f.species]
                  const levelGap = Math.abs(familiar.level - f.level)
                  const eligible = levelGap <= 10
                  const gapReason = familiar.level > f.level
                    ? `${levelGap} levels above range`
                    : `${levelGap} levels below range`
                  return (
                    <div key={f.user_id} className="binding-duel-row" style={{
                      display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px',
                      background: eligible ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
                      border: `1px solid ${eligible ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)'}`,
                      borderRadius: 12,
                      opacity: eligible ? 1 : 0.45,
                    }}>
                      <div style={{ filter: `drop-shadow(0 0 8px ${fsc.primary}44)`, flexShrink: 0 }}>
                        <FamiliarSVG species={f.species} stage={f.stage} nature={f.nature} size={56} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: eligible ? '#e4e4e7' : "var(--text-muted)", marginBottom: 2 }}>
                          {f.name ? <>{f.name} <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>({f.username})</span></> : f.username}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {SPECIES_LABEL[f.species]} · {NATURE_LABEL[f.nature]} · Lvl {f.level} · {f.wins}W {f.losses}L
                        </div>
                        {!eligible && (
                          <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 3, letterSpacing: 0.5 }}>
                            Out of range — {gapReason}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => eligible && doDuel(f.user_id)}
                        disabled={loading || !eligible}
                        title={!eligible ? `Level gap too large (${levelGap}) — duels limited to ±10 levels` : undefined}
                        style={{
                          padding: '8px 16px', borderRadius: 8,
                          background: !eligible ? 'rgba(255,255,255,0.02)' : loading ? 'rgba(255,255,255,0.04)' : 'rgba(179,18,63,0.2)',
                          border: `1px solid ${eligible ? 'rgba(179,18,63,0.35)' : 'rgba(255,255,255,0.05)'}`,
                          color: !eligible ? "var(--text-ghost)" : loading ? "var(--text-faint)" : '#fca5a5',
                          fontSize: 12, cursor: eligible && !loading ? 'pointer' : 'not-allowed',
                        }}>
                        {eligible ? 'Duel' : 'Locked'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Battle history tab ── */}
        {tab === 'history' && (
          <div>
            {battles.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", textAlign: 'center', padding: '40px 0', fontSize: 14 }}>
                No battles recorded yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {battles.map((b, i) => {
                  const myFamiliarId = initFamiliar.id
                  const isChal = b.challenger_id === myFamiliarId
                  const mySpecies  = isChal ? b.challenger_species : b.defender_species
                  const opSpecies  = isChal ? b.defender_species   : b.challenger_species
                  const opponent   = isChal ? b.defender_username  : b.challenger_username
                  const myId       = isChal ? b.challenger_id      : b.defender_id
                  const won        = b.winner_id === myFamiliarId
                  const expanded   = expandedBattle === i
                  const rounds     = b.rounds_json ? JSON.parse(b.rounds_json) : []
                  const myColor    = SPECIES_COLOR[mySpecies]?.primary || '#6d28d9'
                  const opColor    = SPECIES_COLOR[opSpecies]?.primary || '#b3123f'

                  return (
                    <div key={i} style={{
                      background: 'rgba(255,255,255,0.03)', border: `1px solid ${won ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.15)'}`,
                      borderRadius: 12, overflow: 'hidden',
                    }}>
                      {/* Battle row header */}
                      <div className="binding-battle-header"
                        onClick={() => setExpandedBattle(expanded ? null : i)}
                        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer' }}>
                        <div className="binding-battle-svgs" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <FamiliarSVG species={mySpecies} stage={familiar.stage} nature={familiar.nature} size={36} />
                          <span style={{ fontSize: 16, color: "var(--text-faint)" }}>⚔</span>
                          <FamiliarSVG species={opSpecies} stage={1} nature="stoic" size={36} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: '#d4d4d8', marginBottom: 2 }}>
                            vs. <span style={{ fontWeight: 600 }}>{opponent}</span>'s {SPECIES_LABEL[opSpecies] || opSpecies}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                            {new Date(b.battled_at?.replace(' ', 'T') + 'Z').toLocaleDateString()}
                            {b.trigger && b.trigger !== 'manual' && ` · ${b.trigger.replace('_', ' ')}`}
                            {' · '}{rounds.length} rounds
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20,
                            background: won ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
                            border: `1px solid ${won ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.25)'}`,
                            color: won ? '#6ee7b7' : '#fca5a5' }}>
                            {won ? 'Victory' : 'Defeat'}
                          </span>
                          <span style={{ color: "var(--text-faint)", fontSize: 12, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                        </div>
                      </div>

                      {/* Expanded round log */}
                      {expanded && rounds.length > 0 && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px' }}>
                          {/* Legend */}
                          <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 10, height: 10, borderRadius: 2, background: myColor }} />
                              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>You ({SPECIES_LABEL[mySpecies]})</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 10, height: 10, borderRadius: 2, background: opColor }} />
                              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{opponent} ({SPECIES_LABEL[opSpecies]})</span>
                            </div>
                          </div>

                          {/* Round rows */}
                          <div className="binding-round-log" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                            {rounds.map((r, ri) => {
                              const isMyAttack = r.attacker === myId
                              const attColor   = isMyAttack ? myColor : opColor
                              const attLabel   = isMyAttack ? SPECIES_LABEL[mySpecies] : SPECIES_LABEL[opSpecies]
                              const tarHp      = r.targetHp ?? 0
                              const tarMax     = r.targetMaxHp || 1
                              const tarColor   = isMyAttack ? opColor : myColor
                              return (
                                <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                                  <span style={{ color: "var(--text-faint)", width: 26, flexShrink: 0, textAlign: 'right' }}>{r.turn}</span>
                                  <div style={{ width: 3, height: 3, borderRadius: '50%', background: attColor, flexShrink: 0 }} />
                                  {r.type === 'dodge' ? (
                                    <span style={{ color: "var(--text-muted)", fontStyle: 'italic', flex: 1 }}>
                                      {attLabel} dodged
                                    </span>
                                  ) : (
                                    <span style={{ flex: 1, color: "var(--text-secondary)" }}>
                                      <span style={{ color: attColor }}>{attLabel}</span>
                                      {' dealt '}
                                      <span style={{ color: '#f4f4f5', fontWeight: 600 }}>{r.damage}</span>
                                      {' dmg'}
                                    </span>
                                  )}
                                  {/* Target HP bar */}
                                  {r.type !== 'dodge' && (
                                    <div className="binding-round-bar" style={{ width: 80, flexShrink: 0 }}>
                                      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                                        <div style={{ width: `${Math.max(0, (tarHp / tarMax) * 100)}%`, height: '100%',
                                          background: tarColor, borderRadius: 2, transition: 'width 0.3s' }} />
                                      </div>
                                      <div style={{ fontSize: 10, color: "var(--text-faint)", textAlign: 'right', marginTop: 1 }}>
                                        {tarHp}/{tarMax}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8,
                            background: won ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.07)',
                            border: `1px solid ${won ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.18)'}`,
                            fontSize: 12, color: won ? '#6ee7b7' : '#fca5a5', textAlign: 'center' }}>
                            {won ? `Victory — ${opponent}'s ${SPECIES_LABEL[opSpecies]} was defeated after ${rounds.length} rounds.`
                                 : `Defeat — ${SPECIES_LABEL[mySpecies]} fell after ${rounds.length} rounds.`}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Shop tab ── */}
        {tab === 'shop' && (() => {
          const ITEMS = [
            { key: 'feast',             name: 'Void Feast',          cost: 200, icon: '◈', color: '#10b981',
              desc: 'Restores your familiar to full HP and raises happiness by 15.' },
            { key: 'tonic',             name: 'Binding Tonic',       cost: 150, icon: '◇', color: '#6ee7b7',
              desc: 'Restores 20 HP and raises happiness by 10.' },
            { key: 'elixir',            name: 'Growth Elixir',       cost: 300, icon: '✦', color: '#a78bfa',
              desc: 'Infuses your familiar with raw essence, granting 150 XP instantly.' },
            { key: 'shadow_charm',      name: 'Shadow Charm',        cost: 400, icon: '⛧', color: '#f59e0b',
              desc: 'Activates the omen — halves your hunt cooldown until next hunt.' },
            { key: 'scroll_of_binding', name: 'Scroll of Binding',   cost: 400, icon: '📜', color: '#f0abfc',
              desc: 'Bestow a name upon your familiar, or change the one already given.',
              requireLevel: 5, requireBond: 40 },
          ]
          return (
            <div>
              {/* Shard balance */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 18px', marginBottom: 20,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
                <span className="font-cinzel" style={{ fontSize: 11, letterSpacing: 3, color: "var(--text-faint)" }}>SHARDS</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b',
                  textShadow: '0 0 12px rgba(245,158,11,0.5)' }}>
                  {familiar.shards.toLocaleString()}
                </span>
              </div>

              {shopMsg && (
                <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 13, color: shopMsg.color }}>
                  {shopMsg.text}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ITEMS.map(item => {
                  const canAfford = familiar.shards >= item.cost
                  const meetsLevel = !item.requireLevel || familiar.level >= item.requireLevel
                  const meetsBond  = !item.requireBond  || (familiar.bond || 0) >= item.requireBond
                  const meetsReqs  = meetsLevel && meetsBond
                  const canBuy     = canAfford && meetsReqs
                  const lockReason = !meetsLevel
                    ? `Requires level ${item.requireLevel}`
                    : !meetsBond
                    ? `Requires ${bondTier(item.requireBond).label} bond (${item.requireBond}/100)`
                    : null
                  return (
                    <div key={item.key} className="binding-shop-item" style={{
                      display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px',
                      background: 'rgba(255,255,255,0.03)',
                      border: `1px solid ${canBuy ? `${item.color}28` : 'rgba(255,255,255,0.05)'}`,
                      borderRadius: 12, opacity: canBuy ? 1 : 0.5,
                    }}>
                      <span style={{ fontSize: 28, color: item.color, flexShrink: 0,
                        filter: canBuy ? `drop-shadow(0 0 8px ${item.color}66)` : 'none' }}>
                        {item.icon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e4e4e7', marginBottom: 3 }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                          {item.desc}
                        </div>
                        {lockReason && (
                          <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>⚠ {lockReason}</div>
                        )}
                      </div>
                      <div className="binding-shop-price" style={{ flexShrink: 0, textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b', marginBottom: 6 }}>
                          {item.cost.toLocaleString()} ◆
                        </div>
                        <button
                          onClick={() => canBuy && buyShopItem(item.key)}
                          disabled={!canBuy || loading}
                          style={{
                            padding: '7px 16px', borderRadius: 8, fontSize: 12, letterSpacing: 1,
                            background: canBuy ? `${item.color}22` : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${canBuy ? `${item.color}50` : 'rgba(255,255,255,0.08)'}`,
                            color: canBuy ? item.color : "var(--text-faint)",
                            cursor: canBuy && !loading ? 'pointer' : 'not-allowed',
                            transition: 'all 0.15s',
                          }}>
                          {loading ? '...' : 'Buy'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* ── Leaderboard tab ── */}
        {tab === 'leaderboard' && (
          <div>
            {leaderboard.length === 0 ? (
              <p style={{ color: "var(--text-faint)", textAlign: 'center', padding: '40px 0', fontSize: 14 }}>
                No familiars bound yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {leaderboard.map((f, i) => {
                  const fsc = SPECIES_COLOR[f.species]
                  const winRate = f.wins + f.losses > 0
                    ? Math.round((f.wins / (f.wins + f.losses)) * 100) : 0
                  const isMe = user && f.username === user.username
                  return (
                    <div key={i} className="binding-lb-row" style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                      background: isMe ? `${sc.primary}14` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isMe ? `${sc.primary}40` : 'rgba(255,255,255,0.07)'}`,
                      borderRadius: 12,
                    }}>
                      {/* Rank */}
                      <div style={{ width: 28, flexShrink: 0, textAlign: 'center' }}>
                        {i === 0
                          ? <span style={{ fontSize: 18, filter: 'drop-shadow(0 0 6px #f59e0b88)' }}>⛧</span>
                          : <span className="font-cinzel" style={{ fontSize: 12, color: i < 3 ? '#f59e0b' : "var(--text-faint)" }}>
                              {i + 1}
                            </span>
                        }
                      </div>
                      {/* Familiar art */}
                      <div style={{ filter: `drop-shadow(0 0 8px ${fsc?.primary ?? '#6d28d9'}44)`, flexShrink: 0 }}>
                        <FamiliarSVG species={f.species} stage={f.stage} nature={f.nature} size={48} />
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e4e4e7', marginBottom: 2 }}>
                          {f.name || f.username}
                          {isMe && <span style={{ marginLeft: 8, fontSize: 10, color: sc.accent, letterSpacing: 1 }}>YOU</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {f.name ? `${f.username} · ` : ''}{SPECIES_LABEL[f.species]} · {STAGE_LABEL[f.stage]} · {NATURE_LABEL[f.nature]}
                        </div>
                      </div>
                      {/* Stats */}
                      <div className="binding-lb-level" style={{ flexShrink: 0, textAlign: 'right' }}>
                        <div style={{ fontSize: 12, color: '#d4d4d8', marginBottom: 2 }}>
                          Lvl <span style={{ fontWeight: 700, color: fsc?.accent ?? '#a78bfa' }}>{f.level}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {f.wins}W {f.losses}L
                          <span style={{ marginLeft: 6, color: winRate >= 60 ? '#6ee7b7' : winRate >= 40 ? "var(--text-secondary)" : '#fca5a5' }}>
                            {winRate}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
    </>
  )
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function Binding() {
  const { user, loading: sessionLoading } = useSession()
  const [state, setState]   = useState('loading')   // loading | gate | ritual | dashboard
  const [familiar, setFamiliar] = useState(null)
  const [events, setEvents]     = useState([])

  useEffect(() => {
    if (sessionLoading) return
    if (!user) { setState('gate'); return }

    fetch(`${API_BASE_URL}/api/binding/familiar`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        if (data.familiar) {
          setFamiliar(data.familiar)
          setEvents(data.events || [])
          setState('dashboard')
        } else {
          setState('ritual')
        }
      })
      .catch(() => setState('ritual'))
  }, [user, sessionLoading])

  if (state === 'loading') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: "var(--text-ghost)" }}>
      <p style={{ fontSize: 12, letterSpacing: 3 }}>CONSULTING THE VOID...</p>
    </div>
  )

  if (state === 'gate') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16, color: '#f4f4f5', padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 32, opacity: 0.3 }}>⛧</div>
      <h1 className="font-cinzel" style={{ fontSize: 28, letterSpacing: 8 }}>THE BINDING</h1>
      <p style={{ fontSize: 14, color: "var(--text-muted)", maxWidth: 360, lineHeight: 1.75 }}>
        You must be signed in to perform the Binding rite and claim a familiar.
      </p>
    </div>
  )

  if (state === 'ritual') return (
    <RitualIntro onComplete={(f) => { setFamiliar(f); setState('dashboard') }} />
  )

  if (state === 'dashboard') return (
    <FamiliarDashboard
      familiar={familiar}
      events={events}
      onRefresh={() => {
        fetch(`${API_BASE_URL}/api/binding/familiar`, { headers: authHeaders() })
          .then(r => r.json()).then(d => { setFamiliar(d.familiar); setEvents(d.events || []) })
      }}
    />
  )

  return null
}
