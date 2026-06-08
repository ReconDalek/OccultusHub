import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../config/api'

const FACTIONS = [
  { id: 33097, name: 'Occultus'  },
  { id: 9728,  name: 'Occul2us' },
  { id: 9171,  name: 'Occul3us' },
]

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return token ? { Authorization: token } : {}
}

function fmt(v, dec = 0) {
  const n = parseFloat(v) || 0
  return dec > 0 ? n.toFixed(dec) : n.toLocaleString('en-GB')
}

function formatDate(unix) {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

// ─── Scoreboard ───────────────────────────────────────────────────────────────

function ScoreBoard({ war, ourFactionName }) {
  const { our_score = 0, opponent_score = 0, target = 0, our_chain = 0, opponent_chain = 0,
          opponent_faction_name, started_at } = war

  const weWinning = our_score >= opponent_score
  const ourPct    = target > 0 ? Math.min((our_score  / target) * 100, 100) : 0
  const oppPct    = target > 0 ? Math.min((opponent_score / target) * 100, 100) : 0

  const elapsed = started_at ? Math.floor(Date.now() / 1000) - started_at : 0
  const elH = Math.floor(elapsed / 3600)
  const elM = Math.floor((elapsed % 3600) / 60)

  const scoreStyle = (winning) => ({
    fontSize: '24px', fontWeight: '800', fontFamily: 'Cinzel, serif',
    color: winning ? '#22c55e' : '#f4f4f5',
    textShadow: winning ? '0 0 20px rgba(34,197,94,0.4)' : 'none',
    lineHeight: 1,
  })

  return (
    <div style={{ padding: '14px 16px 16px', borderTop: '1px solid rgba(34,197,94,0.12)', background: 'rgba(34,197,94,0.03)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <div style={{ textAlign: 'left' }}>
          <p style={{ color: '#a1a1aa', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px 0' }}>
            {opponent_faction_name || 'Opponent'}
          </p>
          <span style={scoreStyle(!weWinning)}>{(opponent_score || 0).toLocaleString('en-GB')}</span>
          {opponent_chain > 0 && <p style={{ color: '#f97316', fontSize: '10px', margin: '3px 0 0 0' }}>⛓ chain ×{opponent_chain}</p>}
        </div>
        <div style={{ textAlign: 'center', padding: '0 8px' }}>
          <p style={{ color: '#71717a', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px 0' }}>target</p>
          <p style={{ color: '#a1a1aa', fontSize: '13px', fontWeight: '600', margin: 0 }}>
            {target > 0 ? target.toLocaleString('en-GB') : '—'}
          </p>
          {elapsed > 0 && (
            <p style={{ color: '#52525b', fontSize: '9px', margin: '4px 0 0 0' }}>{elH}h {elM}m elapsed</p>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ color: '#a1a1aa', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px 0' }}>
            {ourFactionName}
          </p>
          <span style={scoreStyle(weWinning)}>{(our_score || 0).toLocaleString('en-GB')}</span>
          {our_chain > 0 && <p style={{ color: '#f97316', fontSize: '10px', margin: '3px 0 0 0' }}>⛓ chain ×{our_chain}</p>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '12px' }}>
        <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px 0 0 4px', overflow: 'hidden', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: `${oppPct}%`, height: '100%', borderRadius: '4px 0 0 4px', background: !weWinning ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.5)', transition: 'width 0.6s ease' }} />
        </div>
        <div style={{ width: '2px', height: '14px', background: 'rgba(255,255,255,0.15)', borderRadius: '1px', flexShrink: 0 }} />
        <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '0 4px 4px 0', overflow: 'hidden' }}>
          <div style={{ width: `${ourPct}%`, height: '100%', borderRadius: '0 4px 4px 0', background: weWinning ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.5)', transition: 'width 0.6s ease' }} />
        </div>
      </div>

      {(our_score + opponent_score) > 0 && (
        <p style={{ textAlign: 'center', color: '#52525b', fontSize: '10px', margin: '6px 0 0 0' }}>
          {weWinning
            ? `+${(our_score - opponent_score).toLocaleString('en-GB')} lead — need ${Math.max(0, target - our_score).toLocaleString('en-GB')} more`
            : `${(opponent_score - our_score).toLocaleString('en-GB')} behind — need ${Math.max(0, target - our_score).toLocaleString('en-GB')} more`}
        </p>
      )}
    </div>
  )
}

// ─── Member stats ─────────────────────────────────────────────────────────────

function MemberStatsTable({ attackerStats, defendStats }) {
  if (!attackerStats?.length && !defendStats?.length) {
    return <p style={{ color: '#a1a1aa', fontSize: '12px', textAlign: 'center', padding: '16px 0' }}>No attack data recorded yet.</p>
  }

  const defendMap = {}
  for (const d of (defendStats || [])) defendMap[d.defender_id] = d

  const rows = [...(attackerStats || [])]
  const attackerIds = new Set(rows.map(r => r.attacker_id))
  for (const d of (defendStats || [])) {
    if (!attackerIds.has(d.defender_id)) {
      rows.push({ attacker_id: d.defender_id, attacker_name: d.defender_name,
        war_hits: 0, war_losses: 0, war_interrupted: 0,
        war_respect_gained: 0, war_respect_lost: 0, avg_fair_fight: 0,
        outside_attacks: 0, energy_used: 0 })
    }
  }

  const th = { padding: '7px 8px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a1a1aa', fontWeight: '600', borderBottom: '1px solid rgba(255,255,255,0.07)', textAlign: 'right', whiteSpace: 'nowrap' }
  const td = { padding: '7px 8px', fontSize: '11px', color: '#f4f4f5', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)' }

  return (
    <div style={{ overflowX: 'auto', marginTop: '12px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Member</th>
            <th style={th}>Hits</th>
            <th style={th}>Losses</th>
            <th style={th}>Gained</th>
            <th style={th}>Lost</th>
            <th style={th}>Net</th>
            <th style={th}>Def Won</th>
            <th style={th}>Def Lost</th>
            <th style={th}>Outside</th>
            <th style={th}>Assists</th>
            <th style={th}>Energy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const def = defendMap[r.attacker_id] || {}
            const net = (r.war_respect_gained || 0) - (r.war_respect_lost || 0)
            return (
              <tr key={r.attacker_id}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <td style={{ ...td, textAlign: 'left', color: '#e4e4e7' }}>{r.attacker_name || `[${r.attacker_id}]`}</td>
                <td style={{ ...td, color: r.war_hits > 0 ? '#22c55e' : '#71717a' }}>{fmt(r.war_hits)}</td>
                <td style={{ ...td, color: r.war_losses > 0 ? '#ef4444' : '#71717a' }}>{fmt(r.war_losses)}</td>
                <td style={{ ...td, color: '#22c55e' }}>{fmt(r.war_respect_gained, 2)}</td>
                <td style={{ ...td, color: '#ef4444' }}>{fmt(r.war_respect_lost, 2)}</td>
                <td style={{ ...td, color: net >= 0 ? '#22c55e' : '#ef4444', fontWeight: '600' }}>
                  {net >= 0 ? '+' : ''}{fmt(net, 2)}
                </td>
                <td style={{ ...td, color: def.defends_won > 0 ? '#22c55e' : '#71717a' }}>{fmt(def.defends_won)}</td>
                <td style={{ ...td, color: def.defends_lost > 0 ? '#ef4444' : '#71717a' }}>{fmt(def.defends_lost)}</td>
                <td style={td}>{fmt(r.outside_attacks)}</td>
                <td style={{ ...td, color: r.assists > 0 ? '#a78bfa' : '#71717a' }}>{fmt(r.assists)}</td>
                <td style={{ ...td, color: '#a1a1aa' }}>{fmt(r.energy_used)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── War card ─────────────────────────────────────────────────────────────────

function WarCard({ war, factionName }) {
  const [expanded, setExpanded] = useState(false)
  const [detail,   setDetail]   = useState(null)
  const [loading,  setLoading]  = useState(false)

  const isActive  = war.status === 'active'
  const isMatched = war.status === 'matched'

  const dateLabel = isActive
    ? `Started ${formatDate(war.started_at)}`
    : `Scheduled ${formatDate(war.scheduled_start)}`

  const toggle = useCallback(() => {
    setExpanded((e) => {
      if (!e && !detail && !loading) {
        setLoading(true)
        fetch(`${API_BASE_URL}/api/leadership/war/${war.id}`, { headers: authHeaders() })
          .then((r) => r.json())
          .then((d) => setDetail(d))
          .catch(() => setDetail({ error: true }))
          .finally(() => setLoading(false))
      }
      return !e
    })
  }, [war.id, detail, loading])

  const statusCfg = isActive
    ? { label: 'ACTIVE',   color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.35)'  }
    : { label: 'MATCHED',  color: '#eab308', bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.35)' }

  return (
    <div style={{
      borderRadius: '12px',
      border: `1px solid ${isActive ? 'rgba(34,197,94,0.3)' : 'rgba(234,179,8,0.2)'}`,
      background: isActive ? 'rgba(34,197,94,0.02)' : 'rgba(234,179,8,0.02)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <button onClick={toggle} style={{
        width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <span style={{ fontSize: '18px', flexShrink: 0 }}>⚔️</span>
        <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          <p style={{ color: '#f4f4f5', fontWeight: '600', fontSize: '14px', margin: '0 0 2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            vs {war.opponent_faction_name || `Faction #${war.opponent_faction_id}`}
          </p>
          <p style={{ color: '#71717a', fontSize: '11px', margin: 0 }}>{dateLabel}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <span style={{
            padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
            letterSpacing: '0.08em', background: statusCfg.bg, border: `1px solid ${statusCfg.border}`, color: statusCfg.color,
          }}>{statusCfg.label}</span>
          <span style={{ color: '#a1a1aa', fontSize: '14px' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Scoreboard — always visible for active wars */}
      {isActive && <ScoreBoard war={war} ourFactionName={factionName} />}

      {/* Expanded member stats */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {loading && <p style={{ color: '#a1a1aa', fontSize: '12px', padding: '16px 0', textAlign: 'center' }}>Loading stats…</p>}
          {detail?.error && <p style={{ color: '#ef4444', fontSize: '12px', padding: '16px 0' }}>Failed to load stats.</p>}
          {detail && !detail.error && (
            <MemberStatsTable
              attackerStats={detail.attackerStats}
              defendStats={detail.defendStats}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function WarSummary() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState(33097)

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/wars/summary`)
      .then((r) => r.json())
      .then((d) => setSummary(d.summary || {}))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading || !summary) return null

  // Filter each faction to only active/matched
  const filtered = {}
  for (const f of FACTIONS) {
    filtered[f.id] = (summary[f.id] || []).filter(w => w.status === 'active' || w.status === 'matched')
  }

  // If no faction has any active/matched wars, hide the widget entirely
  const hasAny = FACTIONS.some(f => filtered[f.id].length > 0)
  if (!hasAny) return null

  const currentFactionName = FACTIONS.find(f => f.id === activeId)?.name || 'Us'
  const currentWars = filtered[activeId] || []

  return (
    <div
      className="rounded-2xl p-8"
      style={{ background: 'rgba(22,22,32,0.82)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <h2 className="font-cinzel mb-6" style={{ fontSize: '16px', letterSpacing: '2px', color: '#a1a1aa' }}>
        ACTIVE WARS
      </h2>

      {/* Faction tabs — only show factions that have active/matched wars */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
        {FACTIONS.filter(f => filtered[f.id].length > 0).map((f) => (
          <button key={f.id} onClick={() => setActiveId(f.id)}
            style={{
              padding: '5px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s',
              border: `1px solid ${activeId === f.id ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
              background: activeId === f.id ? 'rgba(179,18,63,0.15)' : 'transparent',
              color: activeId === f.id ? '#f4f4f5' : '#a1a1aa',
              fontWeight: activeId === f.id ? '600' : '400',
            }}
            onMouseEnter={(e) => { if (activeId !== f.id) e.currentTarget.style.color = '#f4f4f5' }}
            onMouseLeave={(e) => { if (activeId !== f.id) e.currentTarget.style.color = '#a1a1aa' }}
          >
            {f.name}
            {filtered[f.id].some(w => w.status === 'active') && (
              <span style={{ marginLeft: '6px', width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', verticalAlign: 'middle', boxShadow: '0 0 6px rgba(34,197,94,0.6)' }} />
            )}
          </button>
        ))}
      </div>

      {currentWars.length === 0 ? (
        <p style={{ color: '#71717a', fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>No active wars for this faction.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {currentWars.map((war) => (
            <WarCard key={war.id} war={war} factionName={currentFactionName} />
          ))}
        </div>
      )}
    </div>
  )
}
