import { useState, useEffect } from 'react'
import { useSession } from '../hooks/useSession'
import { API_BASE_URL } from '../config/api'
import { OCCULTUS_CONFIG } from '../lib/config'
import QuoteBox from '../components/QuoteBox'

const STATIC_FACTIONS = [
  {
    id: 33097,
    name: 'Occultus',
    description:
      'The first circle. The head of the sacred order, where loyalty is proven, strength is forged, and the directive is carried from the shadows.',
  },
  {
    id: 9728,
    name: 'Occul2us',
    description:
      'The war division. Few in number yet relentless, devoted to conflict, ritualistic bloodshed, and answering the call when war awakens.',
  },
  {
    id: 9171,
    name: 'Occul3us',
    description:
      'The growing circle. A rising extension of the order, following the same directive while nurturing those yet to ascend.',
  },
]

function getFactionCache() {
  const raw = localStorage.getItem('occultusFactions')
  if (!raw) return []
  return JSON.parse(raw).data || []
}

function setFactionCache(data) {
  localStorage.setItem(
    'occultusFactions',
    JSON.stringify({ data, updatedAt: Date.now() })
  )
}

const DIRECTOR_POSITIONS = ['Leader', 'Co-leader']

function getMembershipTier(user, factionId) {
  if (!user || Number(user.factionId) !== Number(factionId)) return null
  const pos = user.factionPosition
  if (DIRECTOR_POSITIONS.includes(pos)) return 'director'
  if (OCCULTUS_CONFIG.leadershipRoles.includes(pos)) return 'leadership'
  return 'member'
}

function tierClass(tier) {
  if (tier === 'director')  return 'faction-director'
  if (tier === 'leadership') return 'faction-leadership'
  if (tier === 'member')    return 'faction-member'
  return ''
}

function FactionCard({ faction, membershipTier, isLive }) {
  const [expanded, setExpanded] = useState(false)
  const highlight = tierClass(membershipTier)

  if (!isLive) {
    return (
      <div
        data-faction={faction.id}
        className={`relative rounded-3xl transition-all duration-300 hover:-translate-y-1.5 ${highlight}`}
        style={{
          background: 'rgba(22,22,32,0.82)',
          border: highlight ? undefined : '1px solid rgba(255,255,255,0.05)',
          padding: '40px',
          backdropFilter: 'blur(12px)',
        }}
      >
        <h3 className="font-cinzel" style={{ fontSize: '30px', marginBottom: '20px' }}>
          {faction.name}
        </h3>
        <p style={{ color: '#a1a1aa', lineHeight: 1.7, marginBottom: '24px' }}>
          {faction.description}
        </p>
        <div style={{ color: '#9f67ff', fontSize: '14px' }}>Faction ID: {faction.id}</div>
      </div>
    )
  }

  // Live data card
  const basic   = faction.basic   || {}
  const members = faction.members || []

  return (
    <div
      data-faction={basic.id}
      className={`relative rounded-3xl transition-all duration-300 cursor-pointer ${highlight || 'hover:-translate-y-1.5'} ${expanded ? 'expanded' : ''}`}
      style={{
        background: 'rgba(22,22,32,0.82)',
        border: highlight
          ? undefined
          : expanded
            ? '1px solid rgba(255,255,255,0.2)'
            : '1px solid rgba(255,255,255,0.05)',
        padding: '40px',
        backdropFilter: 'blur(12px)',
      }}
      onClick={() => setExpanded((v) => !v)}
    >
      <h3 className="font-cinzel" style={{ fontSize: '30px', marginBottom: '20px' }}>
        {basic.name}
      </h3>

      <p style={{ fontWeight: 'bold', color: basic.is_enlisted ? 'green' : 'red', marginBottom: '12px' }}>
        {basic.is_enlisted ? 'Enlisted' : 'Not Enlisted'}
      </p>

      {[
        ['Members', `${basic.members} / ${basic.capacity}`],
        ['Rank',    basic.rank?.name || 'Unknown'],
        ['Respect', basic.respect?.toLocaleString()],
      ].map(([label, val]) => (
        <div key={label} style={{ color: '#9f67ff', fontSize: '14px', marginTop: '10px' }}>
          {label}: {val}
        </div>
      ))}

      {/* Expanded member list */}
      {expanded && (
        <div className="mt-6">
          <h4 className="mb-3" style={{ fontSize: '18px' }}>Members</h4>
          <div className="flex flex-col gap-1.5">
            {members.map((m) => (
              <div
                key={m.id}
                className="grid gap-3 py-3"
                style={{
                  gridTemplateColumns: '1.5fr 1fr 1fr',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  fontSize: '14px',
                }}
              >
                <a
                  href={`https://www.torn.com/profiles.php?XID=${m.id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#9f67ff', textDecoration: 'none' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {m.name}
                </a>
                <span>{m.position}</span>
                <span>{m.last_action?.relative || ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Factions() {
  const { user }         = useSession()
  const [factions, setFactions] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res  = await fetch(`${API_BASE_URL}/api/faction-cache`)
        const json = await res.json()

        if (json.data?.length) {
          setFactionCache(json.data)
          setFactions(json.data)
          setLive(true)

          const cached = localStorage.getItem('occultusFactions')
          if (cached) {
            const parsed = JSON.parse(cached)
            setLastUpdated(parsed.updatedAt)
          }
          return
        }
      } catch { /* swallow */ }

      // Fallback to cache
      const cached = getFactionCache()
      if (cached.length) {
        setFactions(cached)
        setLive(true)
      }
    })()
  }, [])

  const displayFactions = (live ? factions : STATIC_FACTIONS).slice().reverse()

  return (
    <>
      {/* HERO */}
      <section
        className="flex items-center justify-center text-center"
        style={{ minHeight: '40vh', padding: '80px 24px' }}
      >
        <div>
          <h1
            className="font-cinzel animate-fade-up"
            style={{ fontSize: 'clamp(42px, 8vw, 68px)', lineHeight: 1.1, marginBottom: '28px' }}
          >
            The Three Circles
          </h1>
          <p
            className="animate-fade-up-slow"
            style={{ color: '#a1a1aa', fontSize: '20px', lineHeight: 1.8 }}
          >
            Occultus stands beyond the shadows of Torn.<br />
            Three circles, One sacred order.<br />
            Strength through unity, and loyalty through blood.
          </p>
        </div>
      </section>

      {/* FACTION GRID */}
      <section style={{ padding: '60px 48px' }}>
        <div
          className="grid gap-8 faction-grid-responsive"
          style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
        >
          {displayFactions.map((f) => {
            const factionId      = live ? f.basic?.id : f.id
            const membershipTier = getMembershipTier(user, factionId)
            return (
              <FactionCard
                key={factionId}
                faction={f}
                membershipTier={membershipTier}
                isLive={live}
              />
            )
          })}
        </div>

        {lastUpdated && (
          <div
            className="max-w-3xl mx-auto mt-8 p-5 rounded-3xl text-center text-sm"
            style={{ background: 'rgba(255,255,255,0.03)', color: '#a1a1aa' }}
          >
            Last updated: {new Date(lastUpdated).toLocaleString()}
          </div>
        )}
      </section>

      <QuoteBox />
    </>
  )
}
