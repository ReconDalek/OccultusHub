import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

// ─── Constants ────────────────────────────────────────────────────────────────

const FACTIONS = [
  { id: 33097, name: 'Occultus'  },
  { id: 9728,  name: 'Occul2us' },
  { id: 9171,  name: 'Occul3us' },
]

const FACTION_NAME = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' }

// Ordered highest → lowest
const RANK_TIERS = [
  { name: 'Harbinger', min: 15000, color: '#ff2f6d', bg: 'rgba(179,18,63,0.12)', border: 'rgba(179,18,63,0.3)'   },
  { name: 'Doomsayer', min: 5000,  color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.28)'  },
  { name: 'Sentinel',  min: 2500,  color: '#eab308', bg: 'rgba(234,179,8,0.1)',  border: 'rgba(234,179,8,0.28)'   },
  { name: 'Arcanist',  min: 1000,  color: '#9f67ff', bg: 'rgba(109,40,217,0.12)',border: 'rgba(109,40,217,0.3)'   },
  { name: 'Adept',     min: 500,   color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.25)'  },
  { name: 'Acolyte',   min: 0,     color: '#a1a1aa', bg: 'rgba(255,255,255,0.03)',border: 'rgba(255,255,255,0.08)' },
]

// Positions that are never flagged for a rank mismatch
const EXEMPT_POSITIONS = ['council', 'leader', 'co-leader', 'co leader', 'recruit', 'archon']

// Shared grid — headers and rows must use the same value
const GRID = '1fr 130px 110px 110px 24px'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDerivedRank(totalHits) {
  for (const tier of RANK_TIERS) {
    if (totalHits >= tier.min) return tier.name
  }
  return 'Acolyte'
}

function getRankTier(rankName) {
  return RANK_TIERS.find((t) => t.name === rankName) ?? RANK_TIERS[RANK_TIERS.length - 1]
}

function isExempt(position) {
  if (!position) return false
  const lower = position.toLowerCase()
  return EXEMPT_POSITIONS.some((e) => lower.includes(e))
}

function isMismatch(factionPosition, derivedRank) {
  if (!factionPosition) return false
  if (isExempt(factionPosition)) return false
  return factionPosition !== derivedRank
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GB')
}

// ─── Column header row (rendered once above all tiers) ────────────────────────

function ColumnHeaders() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        gap: '8px',
        padding: '6px 12px',
        marginBottom: '4px',
      }}
    >
      {['Member', 'Position', 'Chain Hits', 'Earned Rank', ''].map((h) => (
        <span
          key={h}
          style={{ color: '#a1a1aa', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          {h}
        </span>
      ))}
    </div>
  )
}

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberRow({ member, showFaction }) {
  const derived  = getDerivedRank(member.total_chain_hits)
  const tier     = getRankTier(derived)
  const mismatch = isMismatch(member.faction_position, derived)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderRadius: '8px',
        background: mismatch ? 'rgba(251,191,36,0.04)' : 'transparent',
        border: mismatch ? '1px solid rgba(251,191,36,0.12)' : '1px solid transparent',
      }}
    >
      {/* Member name + optional faction tag */}
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '500' }}>
          {member.username}
        </span>
        {member.level && (
          <span style={{ color: '#a1a1aa', fontSize: '11px' }}>Lv.{member.level}</span>
        )}
        {showFaction && member.faction_id && (
          <span
            style={{
              color: '#a1a1aa',
              fontSize: '10px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: '4px',
              padding: '1px 5px',
              lineHeight: '1.4',
            }}
          >
            {FACTION_NAME[member.faction_id] ?? member.faction_id}
          </span>
        )}
      </div>

      {/* Faction position */}
      <span style={{ color: '#a1a1aa', fontSize: '12px' }}>
        {member.faction_position || '—'}
      </span>

      {/* Total chain hits */}
      <span style={{ color: tier.color, fontSize: '13px', fontWeight: '700' }}>
        {fmt(member.total_chain_hits)}
      </span>

      {/* Derived rank badge */}
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: '5px',
          background: tier.bg,
          border: `1px solid ${tier.border}`,
          color: tier.color,
          fontSize: '11px',
          fontWeight: '600',
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}
      >
        {derived}
      </span>

      {/* Mismatch warning — ⚠ only, no text */}
      <div style={{ textAlign: 'center' }}>
        {mismatch && (
          <span
            title={`Position "${member.faction_position}" · chain hits qualify for "${derived}"`}
            style={{ color: '#fbbf24', fontSize: '13px', cursor: 'default' }}
          >
            ⚠
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Rank tier section ────────────────────────────────────────────────────────

function RankSection({ tier, members, showFaction }) {
  if (members.length === 0) return null

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Tier banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '7px 12px',
          borderRadius: '8px',
          background: tier.bg,
          border: `1px solid ${tier.border}`,
          marginBottom: '4px',
        }}
      >
        <span style={{ color: tier.color, fontWeight: '700', fontSize: '13px', fontFamily: 'Cinzel, serif', letterSpacing: '0.5px' }}>
          {tier.name.toUpperCase()}
        </span>
        <span style={{ color: tier.color, fontSize: '11px', opacity: 0.75 }}>
          {tier.min > 0 ? `≥ ${fmt(tier.min)} hits` : '0+ hits'}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            background: 'rgba(255,255,255,0.08)',
            borderRadius: '4px',
            padding: '1px 7px',
            color: '#a1a1aa',
            fontSize: '11px',
          }}
        >
          {members.length}
        </span>
      </div>

      {members.map((m) => (
        <MemberRow key={m.torn_user_id} member={m} showFaction={showFaction} />
      ))}
    </div>
  )
}

// ─── Summary stats bar ────────────────────────────────────────────────────────

function SummaryBar({ members }) {
  const totalHits  = members.reduce((s, m) => s + (m.total_chain_hits || 0), 0)
  const withHits   = members.filter((m) => m.total_chain_hits > 0).length
  const mismatches = members.filter((m) => isMismatch(m.faction_position, getDerivedRank(m.total_chain_hits))).length

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '8px',
        marginBottom: '20px',
      }}
    >
      {[
        { label: 'Members',        value: members.length,  color: '#f4f4f5'  },
        { label: 'With Hits',      value: withHits,        color: '#9f67ff'  },
        { label: 'Total Hits',     value: fmt(totalHits),  color: '#ff2f6d'  },
        { label: 'Rank Mismatches',value: mismatches,      color: mismatches > 0 ? '#fbbf24' : '#f4f4f5' },
      ].map(({ label, value, color }) => (
        <div
          key={label}
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <p style={{ color: '#a1a1aa', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px 0' }}>
            {label}
          </p>
          <p style={{ color, fontSize: '18px', fontWeight: '700', margin: 0 }}>{value}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Ranks view (used by both faction and all-factions panels) ────────────────

function RanksView({ members, loading, error, showFaction }) {
  if (loading) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center' }}>
        <p style={{ color: '#a1a1aa', fontSize: '14px' }}>Loading member data…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(255,0,0,0.08)', border: '1px solid rgba(255,0,0,0.2)', marginTop: '16px' }}>
        <p style={{ color: '#ff6b6b', fontSize: '13px', margin: 0 }}>Error: {error}</p>
      </div>
    )
  }

  if (!members || members.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', marginTop: '16px' }}>
        <p style={{ color: '#a1a1aa', fontSize: '14px', margin: 0 }}>
          No member data yet — run{' '}
          <strong style={{ color: '#f4f4f5' }}>Sync Member Database</strong>
          {' '}from Admin › Cache, or wait for the next automatic 12-hour refresh.
        </p>
      </div>
    )
  }

  // Group by derived rank, maintaining sort order within each group (already sorted by hits DESC from API)
  const grouped = Object.fromEntries(RANK_TIERS.map((t) => [t.name, []]))
  for (const m of members) {
    grouped[getDerivedRank(m.total_chain_hits)].push(m)
  }

  return (
    <div style={{ marginTop: '16px' }}>
      <SummaryBar members={members} />

      {/* Scrollable table area — prevents layout break on narrow screens */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: '560px' }}>
          <ColumnHeaders />
          {RANK_TIERS.map((tier) => (
            <RankSection
              key={tier.name}
              tier={tier}
              members={grouped[tier.name]}
              showFaction={showFaction}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Single-faction panel ─────────────────────────────────────────────────────

function FactionPanel({ factionId }) {
  const [members, setMembers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setMembers(null)

    const token = localStorage.getItem('occultusSession')
    fetch(`${API_BASE_URL}/api/leadership/members?faction_id=${factionId}`, {
      headers: { Authorization: token },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.error) setError(data.error)
        else setMembers(data.members || [])
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [factionId])

  return <RanksView members={members} loading={loading} error={error} showFaction={false} />
}

// ─── All-factions panel ───────────────────────────────────────────────────────

function AllFactionsPanel() {
  const [members, setMembers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setMembers(null)

    const token = localStorage.getItem('occultusSession')

    Promise.all(
      FACTIONS.map((f) =>
        fetch(`${API_BASE_URL}/api/leadership/members?faction_id=${f.id}`, {
          headers: { Authorization: token },
        }).then((r) => r.json())
      )
    )
      .then((results) => {
        if (cancelled) return
        const allErr = results.find((r) => r.error)
        if (allErr) { setError(allErr.error); return }

        // Merge all 3 factions and sort by total_chain_hits DESC
        const combined = results
          .flatMap((r) => r.members || [])
          .sort((a, b) => (b.total_chain_hits || 0) - (a.total_chain_hits || 0))

        setMembers(combined)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [])

  return <RanksView members={members} loading={loading} error={error} showFaction={true} />
}

// ─── Sub-tab bar ──────────────────────────────────────────────────────────────

function SubTabs({ options, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '7px 18px',
            borderRadius: '8px',
            border: `1px solid ${active === opt.value ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
            background: active === opt.value ? 'rgba(179,18,63,0.15)' : 'transparent',
            color: active === opt.value ? '#f4f4f5' : '#a1a1aa',
            fontSize: '13px',
            fontWeight: active === opt.value ? '600' : '400',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { if (active !== opt.value) e.currentTarget.style.color = '#f4f4f5' }}
          onMouseLeave={(e) => { if (active !== opt.value) e.currentTarget.style.color = '#a1a1aa' }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MemberRanksTab() {
  const [activeTab, setActiveTab] = useState('all')

  const tabs = [
    { value: 'all',   label: 'All Factions' },
    ...FACTIONS.map((f) => ({ value: String(f.id), label: f.name })),
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2
          style={{
            fontFamily: 'Cinzel, serif',
            color: '#f4f4f5',
            fontSize: '20px',
            letterSpacing: '1px',
            marginBottom: '4px',
          }}
        >
          Member Ranks
        </h2>
        <p style={{ color: '#a1a1aa', fontSize: '13px', margin: 0 }}>
          Active members ranked by total chain hits. ⚠ indicates a member whose chain hits
          qualify for a higher rank than their current position.
        </p>
      </div>

      {/* Rank reference strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
        {RANK_TIERS.map((tier) => (
          <div
            key={tier.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              background: tier.bg,
              border: `1px solid ${tier.border}`,
            }}
          >
            <span style={{ color: tier.color, fontSize: '12px', fontWeight: '700' }}>{tier.name}</span>
            <span style={{ color: tier.color, fontSize: '11px', opacity: 0.7 }}>
              {tier.min > 0 ? `${(tier.min / 1000).toFixed(tier.min % 1000 === 0 ? 0 : 1)}k` : '0'}+
            </span>
          </div>
        ))}
      </div>

      {/* Faction sub-tabs */}
      <SubTabs options={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Panel — keyed so switching tabs remounts and re-fetches */}
      {activeTab === 'all'
        ? <AllFactionsPanel key="all" />
        : <FactionPanel key={activeTab} factionId={Number(activeTab)} />
      }
    </div>
  )
}
