import { useState, useEffect } from 'react'
import { useSession } from '../hooks/useSession'
import { API_BASE_URL } from '../config/api'
import { OCCULTUS_CONFIG } from '../lib/config'
import { formatUTC } from '../lib/dates'


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
  const rackets = (faction.rackets || []).filter(r => r.faction_id === basic.id)

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

      {[
        ['Members', `${basic.members} / ${basic.capacity}`],
        ['Rank',    basic.rank?.name || 'Unknown'],
        ['Respect', basic.respect?.toLocaleString()],
      ].map(([label, val]) => (
        <div key={label} style={{ color: '#9f67ff', fontSize: '14px', marginTop: '10px' }}>
          {label}: {val}
        </div>
      ))}

      {/* Rackets (always visible if any) */}
      {rackets.length > 0 && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ color: '#a1a1aa', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>
            Rackets ({rackets.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {rackets.map((r, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'rgba(255,255,255,0.03)', borderRadius: '8px',
                padding: '8px 12px', fontSize: '13px',
              }}>
                <div>
                  <span style={{ color: '#f4f4f5', fontWeight: '500' }}>{r.name}</span>
                  <span style={{ color: '#a1a1aa', marginLeft: '8px', fontSize: '12px' }}>{r.territory}</span>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span style={{ color: '#9f67ff', fontSize: '12px' }}>Lv {r.level}</span>
                  {r.reward && (
                    <span style={{ color: '#22c55e', fontSize: '12px' }}>
                      {r.reward.quantity}× {r.reward.type}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const res  = await fetch(`${API_BASE_URL}/api/faction-cache`)
        const json = await res.json()

        if (json.data?.length) {
          setFactionCache(json.data)
          setFactions(json.data)
          setLive(true)
          setLastUpdated(json.lastUpdated || null)
          setLoading(false)
          return
        }
      } catch { /* swallow */ }

      // Fallback to localStorage cache
      const cached = getFactionCache()
      if (cached.length) {
        setFactions(cached)
        setLive(true)
      }
      setLoading(false)
    })()
  }, [])

  const FACTION_ORDER = [33097, 9728, 9171]
  const displayFactions = factions.slice().sort((a, b) => FACTION_ORDER.indexOf(a.basic?.id) - FACTION_ORDER.indexOf(b.basic?.id))

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
        {loading ? (
          <div className="flex items-center justify-center" style={{ minHeight: '200px' }}>
            <p style={{ color: '#a1a1aa', fontSize: '15px' }}>Loading faction data…</p>
          </div>
        ) : displayFactions.length === 0 ? (
          <div className="flex items-center justify-center" style={{ minHeight: '200px' }}>
            <p style={{ color: '#a1a1aa', fontSize: '15px' }}>No faction data available.</p>
          </div>
        ) : (
          <div
            className="grid gap-8 faction-grid-responsive"
            style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
          >
            {displayFactions.map((f) => {
              const factionId      = f.basic?.id
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
        )}

        {lastUpdated && (
          <div
            className="max-w-3xl mx-auto mt-8 p-5 rounded-3xl text-center text-sm"
            style={{ background: 'rgba(255,255,255,0.03)', color: '#a1a1aa' }}
          >
            Last updated: {formatUTC(lastUpdated)}
          </div>
        )}
      </section>
    </>
  )
}
