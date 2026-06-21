import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../config/api'

const FACTION_NAMES = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' }

function fmt(n, dp = 0) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

function formatDuration(startUnix) {
  const secs = Math.floor(Date.now() / 1000) - startUnix
  const h    = Math.floor(secs / 3600)
  const m    = Math.floor((secs % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export default function ActiveChainCard() {
  const [chains, setChains]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('occultusSession')
    fetch(`${API_BASE_URL}/api/chain/active`, {
      headers: token ? { Authorization: token } : {},
    })
      .then(r => r.json())
      .then(data => { setChains(data.chains || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading || !chains.length) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {chains.map(chain => (
        <ChainSession key={chain.faction_id} chain={chain} />
      ))}
    </div>
  )
}

function ChainSession({ chain }) {
  const [expanded, setExpanded] = useState(false)

  const factionName = FACTION_NAMES[chain.faction_id] ?? `Faction ${chain.faction_id}`
  const top5        = (chain.members || []).slice(0, 5)
  const totalMembers = chain.members?.length ?? 0

  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: 'rgba(22,22,32,0.82)', border: '1px solid rgba(179,18,63,0.35)' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            background: 'rgba(179,18,63,0.18)',
            border: '1px solid rgba(179,18,63,0.4)',
            color: '#ef4444',
            borderRadius: '6px',
            padding: '2px 10px',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}>
            ⛓ CHAIN ACTIVE
          </span>
          <span className="font-cinzel" style={{ color: '#f4f4f5', fontSize: '15px', letterSpacing: '1px' }}>
            {factionName}
          </span>
        </div>
        <span style={{ color: '#71717a', fontSize: '12px' }}>
          {formatDuration(chain.chain_start_at)} ago
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <StatPill label="Hits" value={fmt(chain.current_length)} accent />
        <StatPill label="Members hitting" value={fmt(totalMembers)} />
        <StatPill label="Armory items" value={fmt(chain.armory?.length ?? 0)} />
        {chain.timeout > 0 && (
          <StatPill label="Timeout" value={`${Math.ceil(chain.timeout / 60)}m`} warn />
        )}
      </div>

      {/* Top hitters */}
      {top5.length > 0 && (
        <div>
          <div style={{ color: '#71717a', fontSize: '11px', letterSpacing: '1px', marginBottom: '8px' }}>
            TOP HITTERS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {top5.map((m, i) => (
              <div key={m.torn_user_id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#52525b', fontSize: '12px', width: '16px', textAlign: 'right' }}>{i + 1}</span>
                <span style={{ color: '#a1a1aa', fontSize: '13px', flex: 1 }}>
                  {m.username ?? `[${m.torn_user_id}]`}
                </span>
                <span style={{ color: '#f4f4f5', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(m.total_attacks)} hits
                </span>
                {m.bonus_hits > 0 && (
                  <span style={{ color: '#a78bfa', fontSize: '11px' }}>+{m.bonus_hits}B</span>
                )}
              </div>
            ))}
            {totalMembers > 5 && (
              <button
                onClick={() => setExpanded(e => !e)}
                style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '12px', cursor: 'pointer', textAlign: 'left', padding: '4px 0' }}
              >
                {expanded ? '▲ show less' : `▼ +${totalMembers - 5} more`}
              </button>
            )}
            {expanded && chain.members.slice(5).map((m, i) => (
              <div key={m.torn_user_id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#52525b', fontSize: '12px', width: '16px', textAlign: 'right' }}>{i + 6}</span>
                <span style={{ color: '#a1a1aa', fontSize: '13px', flex: 1 }}>
                  {m.username ?? `[${m.torn_user_id}]`}
                </span>
                <span style={{ color: '#f4f4f5', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(m.total_attacks)} hits
                </span>
                {m.bonus_hits > 0 && (
                  <span style={{ color: '#a78bfa', fontSize: '11px' }}>+{m.bonus_hits}B</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatPill({ label, value, accent, warn }) {
  return (
    <div style={{
      background: accent ? 'rgba(179,18,63,0.08)' : warn ? 'rgba(234,179,8,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${accent ? 'rgba(179,18,63,0.25)' : warn ? 'rgba(234,179,8,0.25)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: '8px',
      padding: '8px 14px',
    }}>
      <div style={{ color: accent ? '#f87171' : warn ? '#eab308' : '#71717a', fontSize: '10px', letterSpacing: '1px', marginBottom: '2px' }}>
        {label.toUpperCase()}
      </div>
      <div style={{ color: accent ? '#fca5a5' : warn ? '#fde047' : '#f4f4f5', fontSize: '18px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}
