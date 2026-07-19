import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

// ─── Constants ────────────────────────────────────────────────────────────────

const FACTIONS = [
  { id: 33097, name: 'Occultus'  },
  { id: 9728,  name: 'Occul2us' },
  { id: 9171,  name: 'Occul3us' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUnixDate(unix) {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC/TCT'
}

function formatUnixDateTime(unix) {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC', hour12: false,
  }) + ' UTC/TCT'
}

function parseD1DateTime(str) {
  if (!str) return null
  return Math.floor(new Date(str.replace(' ', 'T') + 'Z').getTime() / 1000)
}

function fmt(n, dp = 0) {
  if (n == null || n === 0) return dp > 0 ? '0.00' : '0'
  return Number(n).toLocaleString('en-GB', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })
}

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return token ? { Authorization: token } : {}
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, result }) {
  const cfg = {
    matched:   { label: 'MATCHED',   bg: 'rgba(234,179,8,0.15)',   border: 'rgba(234,179,8,0.4)',   color: '#eab308' },
    active:    { label: 'ACTIVE',    bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.4)',   color: '#22c55e' },
    completed: result === 'won'
      ? { label: 'WON',     bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.4)',   color: '#22c55e' }
      : { label: 'LOST',    bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.4)',   color: '#ef4444' },
  }[status] || { label: status?.toUpperCase(), bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.15)', color: "var(--text-secondary)" }

  return (
    <span style={{
      padding: '2px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
      letterSpacing: '0.08em', background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
    }}>
      {cfg.label}
    </span>
  )
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function Stat({ label, value, accent, red }) {
  const color = accent ? '#22c55e' : red ? '#ef4444' : '#f4f4f5'
  const bg    = accent ? 'rgba(34,197,94,0.07)' : red ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.03)'
  const bdr   = accent ? 'rgba(34,197,94,0.2)'  : red ? 'rgba(239,68,68,0.2)'  : 'rgba(255,255,255,0.07)'
  return (
    <div style={{ background: bg, border: `1px solid ${bdr}`, borderRadius: '8px', padding: '10px 14px' }}>
      <p style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px 0' }}>
        {label}
      </p>
      <p style={{ color, fontSize: '15px', fontWeight: '700', margin: 0 }}>{value}</p>
    </div>
  )
}

// ─── Section divider ─────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ marginTop: '20px' }}>
      <p style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)', display: 'inline-block' }} />
        {title}
        <span style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)', display: 'inline-block' }} />
      </p>
      {children}
    </div>
  )
}

// ─── Member stats table ───────────────────────────────────────────────────────

const MEMBER_STATS_COLUMNS = [
  { key: 'attacker_name',   label: 'Member',     align: 'left' },
  { key: 'war_hits',        label: 'War Hits'    },
  { key: 'war_losses',      label: 'Losses'      },
  { key: 'war_interrupted', label: 'Interrupted' },
  { key: 'gained',          label: 'Gained'      },
  { key: 'bonus',           label: 'Bonus'       },
  { key: 'respectLost',     label: 'Lost'        },
  { key: 'net',             label: 'Net'         },
  { key: 'avg_fair_fight',  label: 'Fair Fight'  },
  { key: 'defends_won',     label: 'Def Won'     },
  { key: 'defends_lost',    label: 'Def Lost'    },
  { key: 'outside_attacks', label: 'Outside'     },
  { key: 'assists',         label: 'Assists'     },
  { key: 'friendly_hits',   label: 'Friendly'    },
  { key: 'energy_used',     label: 'Energy Out'  },
  { key: 'energy_in',       label: 'Energy In'   },
  { key: 'overdoses',       label: 'OD'          },
]

function SortArrow({ dir }) {
  if (!dir) return null
  return <span style={{ fontSize: '9px', marginLeft: '3px' }}>{dir === 'asc' ? '▲' : '▼'}</span>
}

function MemberStatsTable({ attackerStats, defendStats }) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('desc')

  // Merge defend stats into a map keyed by member ID
  const defendMap = {}
  for (const d of defendStats || []) {
    defendMap[d.defender_id] = d
  }

  // Build combined rows: all attackers + any defenders not already in attacker list
  const rawRows = [...(attackerStats || [])]
  const attackerIds = new Set(rawRows.map((r) => r.attacker_id))
  for (const d of defendStats || []) {
    if (!attackerIds.has(d.defender_id)) {
      rawRows.push({
        attacker_id: d.defender_id,
        attacker_name: d.defender_name,
        war_hits: 0, war_losses: 0, war_interrupted: 0,
        war_respect_gained: 0, bonus_respect: 0, avg_fair_fight: 0,
        outside_attacks: 0, outside_respect: 0, energy_used: 0,
        energy_in: 0, overdoses: 0,
      })
    }
  }

  if (!rawRows.length) {
    return <p style={{ color: "var(--text-secondary)", fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>No attack data recorded yet.</p>
  }

  // Pre-compute derived fields so they're available to sort on
  const rows = rawRows.map((r) => {
    const def         = defendMap[r.attacker_id] || {}
    const respectLost = def.respect_lost_defending || 0
    const bonus       = r.bonus_respect || 0
    const gained      = (r.war_respect_gained || 0) - bonus
    const net         = (r.war_respect_gained || 0) - respectLost
    return {
      ...r, respectLost, bonus, gained, net,
      defends_won: def.defends_won || 0, defends_lost: def.defends_lost || 0,
    }
  })

  if (sortKey) {
    const mul = sortDir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === 'string' || typeof bv === 'string') {
        return mul * String(av ?? '').localeCompare(String(bv ?? ''))
      }
      return mul * ((av ?? 0) - (bv ?? 0))
    })
  }

  const toggleSort = (key) => {
    if (sortKey !== key) { setSortKey(key); setSortDir(key === 'attacker_name' ? 'asc' : 'desc'); return }
    setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
  }

  const STICKY_BG = '#141414'
  const th = {
    padding: '8px 10px', fontSize: '10px', textTransform: 'uppercase',
    letterSpacing: '0.06em', color: "var(--text-secondary)", fontWeight: '600',
    borderBottom: '1px solid rgba(255,255,255,0.07)', textAlign: 'right', whiteSpace: 'nowrap',
    cursor: 'pointer', userSelect: 'none',
  }
  const thL = { ...th, textAlign: 'left' }
  const thSticky = { ...thL, position: 'sticky', left: 0, zIndex: 2, background: STICKY_BG }
  const td  = { padding: '8px 10px', fontSize: '12px', color: '#f4f4f5', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)' }
  const tdL = { ...td, textAlign: 'left', color: '#e4e4e7' }
  const tdSticky = { ...tdL, position: 'sticky', left: 0, zIndex: 1, background: STICKY_BG }

  const headerCell = (col) => (
    <th
      key={col.key}
      style={col.align === 'left' ? thSticky : th}
      onClick={() => toggleSort(col.key)}
      title="Click to sort"
    >
      {col.label}<SortArrow dir={sortKey === col.key ? sortDir : null} />
    </th>
  )

  return (
    <div style={{ overflowX: 'auto', marginTop: '8px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '940px' }}>
        <thead>
          <tr>
            {MEMBER_STATS_COLUMNS.map(headerCell)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const netPos = r.net >= 0
            return (
              <tr key={r.attacker_id}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <td style={tdSticky}>{r.attacker_name || `[${r.attacker_id}]`}</td>
                <td style={{ ...td, color: r.war_hits > 0 ? '#22c55e' : "var(--text-muted)" }}>{fmt(r.war_hits)}</td>
                <td style={{ ...td, color: r.war_losses > 0 ? '#ef4444' : "var(--text-muted)" }}>{fmt(r.war_losses)}</td>
                <td style={{ ...td, color: r.war_interrupted > 0 ? '#f97316' : "var(--text-muted)" }}>{fmt(r.war_interrupted)}</td>
                <td style={{ ...td, color: '#22c55e' }}>{fmt(r.gained, 2)}</td>
                <td style={{ ...td, color: r.bonus > 0 ? '#f59e0b' : "var(--text-muted)" }}>{fmt(r.bonus, 2)}</td>
                <td style={{ ...td, color: r.respectLost > 0 ? '#ef4444' : "var(--text-muted)" }}>{fmt(r.respectLost, 2)}</td>
                <td style={{ ...td, color: netPos ? '#22c55e' : '#ef4444', fontWeight: '600' }}>
                  {netPos ? '+' : ''}{fmt(r.net, 2)}
                </td>
                <td style={td}>{fmt(r.avg_fair_fight, 2)}</td>
                <td style={{ ...td, color: r.defends_won > 0 ? '#22c55e' : "var(--text-muted)" }}>{fmt(r.defends_won)}</td>
                <td style={{ ...td, color: r.defends_lost > 0 ? '#ef4444' : "var(--text-muted)" }}>{fmt(r.defends_lost)}</td>
                <td style={td}>{fmt(r.outside_attacks)}</td>
                <td style={{ ...td, color: r.assists > 0 ? '#a78bfa' : "var(--text-muted)" }}>{fmt(r.assists)}</td>
                <td style={{ ...td, color: (r.friendly_hits || 0) > 0 ? '#fb923c' : "var(--text-muted)" }}>{fmt(r.friendly_hits || 0)}</td>
                <td style={{ ...td, color: "var(--text-secondary)" }}>{fmt(r.energy_used)}</td>
                <td style={{ ...td, color: (r.energy_in || 0) > 0 ? '#38bdf8' : "var(--text-muted)" }}>{fmt(r.energy_in || 0)}</td>
                <td style={{ ...td, color: (r.overdoses || 0) > 0 ? '#ef4444' : "var(--text-muted)" }}>{fmt(r.overdoses || 0)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Armory table ─────────────────────────────────────────────────────────────

const BADGE_STACK = { bg: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', color: '#fcd34d' }
const BADGE_WAR   = { bg: 'rgba(159,103,255,0.12)', border: '1px solid rgba(159,103,255,0.3)',  color: '#c4b5fd' }

function ItemBadge({ name, count, style: s }) {
  return (
    <span style={{
      padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '500',
      background: s.bg, border: s.border, color: s.color, whiteSpace: 'nowrap',
    }}>
      {name}{count > 1 ? ` ×${count}` : ''}
    </span>
  )
}

function ArmoryTable({ armory }) {
  if (!armory?.length) {
    return <p style={{ color: "var(--text-secondary)", fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>No armory data recorded.</p>
  }

  const hasSplit = armory.some(r => (r.stacking_count ?? 0) > 0)

  // Group by member
  const byMember = {}
  for (const row of armory) {
    const key = row.torn_user_id || row.username
    if (!byMember[key]) byMember[key] = { username: row.username, torn_user_id: row.torn_user_id, items: [] }
    byMember[key].items.push(row)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
      {hasSplit && (
        <div style={{ display: 'flex', gap: '14px', padding: '4px 2px', fontSize: '11px', color: "var(--text-secondary)" }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
            Stacking period
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#9f67ff', display: 'inline-block' }} />
            War period
          </span>
        </div>
      )}
      {Object.values(byMember).map((member) => {
        const stackItems = member.items.filter(it => (it.stacking_count ?? 0) > 0)
        const warItems   = member.items.filter(it => (it.war_count ?? 0) > 0)
        return (
          <div key={member.torn_user_id || member.username}
            style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px 14px', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p style={{ color: '#e4e4e7', fontWeight: '600', fontSize: '13px', margin: '0 0 6px 0' }}>
              {member.username || `[${member.torn_user_id}]`}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {stackItems.map((item, i) => (
                <ItemBadge key={`s${i}`} name={item.item_name} count={item.stacking_count} style={BADGE_STACK} />
              ))}
              {warItems.map((item, i) => (
                <ItemBadge key={`w${i}`} name={item.item_name} count={item.war_count} style={BADGE_WAR} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Payout calculator ────────────────────────────────────────────────────────

const PCT_OPTIONS = [0, 25, 50, 75, 100]

function PctToggle({ label, value, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', opacity: disabled ? 0.4 : 1 }}>
      <span style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <div style={{ display: 'flex', gap: '3px' }}>
        {PCT_OPTIONS.map(p => (
          <button key={p} onClick={() => !disabled && onChange(p)} style={{
            padding: '4px 8px', borderRadius: '6px', fontSize: '11px', cursor: disabled ? 'default' : 'pointer',
            border: `1px solid ${value === p ? 'rgba(179,18,63,0.6)' : 'rgba(255,255,255,0.08)'}`,
            background: value === p ? 'rgba(179,18,63,0.2)' : 'transparent',
            color: value === p ? '#f4f4f5' : "var(--text-muted)", fontWeight: value === p ? '600' : '400',
          }}>{p}%</button>
        ))}
      </div>
    </div>
  )
}

// Strips a formatted money string back to a clean digit-only string (no decimals allowed)
function parseMoneyInput(value) {
  return value.replace(/\D/g, '')
}

// Formats a clean digit string with thousands separators for display
function formatMoneyDisplay(raw) {
  if (!raw) return ''
  return Number(raw).toLocaleString('en-US')
}

function computePayouts(attackerStats, { warPct, outsidePct, assistPct, friendlyPct, capEnabled, capType, capValue, includeBonusRespect }) {
  // When cap is off, always use attack-based formula regardless of capType
  const useRespect = capEnabled && capType === 'respect'
  const cap        = capEnabled && capValue > 0 ? capValue : Infinity

  return attackerStats
    .filter(r => (r.war_hits || 0) + (r.outside_attacks || 0) + (r.assists || 0) + (r.friendly_hits || 0) + (r.war_respect_gained || 0) > 0)
    .map(r => {
      const respectForPayout = (parseFloat(r.war_respect_gained) || 0) - (includeBonusRespect ? 0 : (parseFloat(r.bonus_respect) || 0))
      const rawUnits = useRespect
        ? respectForPayout
        : (r.war_hits        || 0) * warPct      / 100
        + (r.outside_attacks || 0) * outsidePct  / 100
        + (r.assists         || 0) * assistPct   / 100
        + (r.friendly_hits   || 0) * (friendlyPct ?? 0) / 100
      const units = Math.min(rawUnits, cap)
      return { ...r, rawUnits, units }
    })
    .filter(r => r.units > 0)
}

function EditAttacksModal({ row, onSave, onClose }) {
  const [vals, setVals] = useState({
    war_hits:           row.war_hits            ?? 0,
    outside_attacks:    row.outside_attacks      ?? 0,
    assists:            row.assists              ?? 0,
    friendly_hits:      row.friendly_hits        ?? 0,
    war_respect_gained: parseFloat(row.war_respect_gained) || 0,
  })
  const set = (k, v) => setVals(prev => ({ ...prev, [k]: v }))
  const inp = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '7px', color: '#f4f4f5', padding: '7px 10px', fontSize: '13px', width: '100%' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px', width: '320px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        <p style={{ color: '#e4e4e7', fontWeight: '600', fontSize: '14px', margin: '0 0 4px 0' }}>Edit Attack Data</p>
        <p style={{ color: "var(--text-muted)", fontSize: '12px', margin: '0 0 18px 0' }}>{row.attacker_name || `[${row.attacker_id}]`}</p>
        {[
          ['War Hits',       'war_hits',           0],
          ['Outside / Chain','outside_attacks',     0],
          ['Assists',        'assists',             0],
          ['Friendly Hits',  'friendly_hits',       0],
          ['Respect Gained', 'war_respect_gained',  2],
        ].map(([label, key, decimals]) => (
          <div key={key} style={{ marginBottom: '12px' }}>
            <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>{label}</label>
            <input type="number" min="0" step={decimals ? '0.01' : '1'}
              value={vals[key]}
              onChange={e => set(key, decimals ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0)}
              style={inp} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
          <button onClick={() => onSave(vals)} style={{
            flex: 1, padding: '8px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            background: 'rgba(159,103,255,0.15)', border: '1px solid rgba(159,103,255,0.4)', color: '#c4b5fd',
          }}>Save</button>
          <button onClick={onClose} style={{
            flex: 1, padding: '8px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: "var(--text-muted)",
          }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function PayoutCalculator({ warId, attackerStats, initialHitsSaved, onPayoutSaved, payoutVerified, payoutProcessedBy, payoutProcessedAt }) {
  const [warPct,      setWarPct]      = useState(100)
  const [outsidePct,  setOutsidePct]  = useState(0)
  const [assistPct,   setAssistPct]   = useState(0)
  const [friendlyPct, setFriendlyPct] = useState(0)
  const [totalAmount, setTotalAmount] = useState('')
  const [factionShare,setFactionShare]= useState(10)
  const [capEnabled,  setCapEnabled]  = useState(false)
  const [capType,     setCapType]     = useState('attacks')
  const [capValue,    setCapValue]    = useState('')
  const [includeBonusRespect, setIncludeBonusRespect] = useState(false)
  const [paidSet,     setPaidSet]     = useState(new Set())
  const [hitsSaved,   setHitsSaved]   = useState(!!initialHitsSaved)
  const [saving,      setSaving]      = useState(false)
  const [rankSaving,  setRankSaving]  = useState(false)
  const [saveMsg,     setSaveMsg]     = useState(null)
  const [overrides,   setOverrides]   = useState({})   // { [attacker_id]: { war_hits, outside_attacks, assists, war_respect_gained } }
  const [editingRow,  setEditingRow]  = useState(null) // row object currently being edited

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_BASE_URL}/api/leadership/war/${warId}/payout`, { headers: authHeaders(), signal: controller.signal })
      .then(r => r.json())
      .then(d => {
        setHitsSaved(!!d.is_paid && !!initialHitsSaved)
        if (!d.payout) return
        const p = d.payout
        if (p.settings) {
          setWarPct(p.settings.warPct ?? 100);    setOutsidePct(p.settings.outsidePct ?? 0)
          setAssistPct(p.settings.assistPct ?? 0); setFriendlyPct(p.settings.friendlyPct ?? 0)
          setTotalAmount(p.settings.totalAmount ?? '')
          setFactionShare(p.settings.factionShare ?? 10); setCapEnabled(p.settings.capEnabled ?? false)
          setCapType(p.settings.capType ?? 'attacks'); setCapValue(p.settings.capValue ?? '')
          setIncludeBonusRespect(p.settings.includeBonusRespect ?? false)
        }
        if (p.paid)      setPaidSet(new Set(Object.keys(p.paid).map(Number)))
        if (p.overrides) setOverrides(p.overrides)
      })
      .catch((e) => { if (e.name !== 'AbortError') console.error('payout fetch failed', e) })
    return () => controller.abort()
  }, [warId])

  // Merge overrides into attackerStats before computing payouts
  const mergedStats = attackerStats.map(r => {
    const ov = overrides[r.attacker_id]
    return ov ? { ...r, ...ov } : r
  })

  const settings = { warPct, outsidePct, assistPct, friendlyPct, capEnabled, capType, capValue: parseFloat(capValue) || 0, totalAmount, factionShare, includeBonusRespect }
  const rows         = computePayouts(mergedStats, settings)
  const totalUnits   = rows.reduce((s, r) => s + r.units, 0)
  const amount       = parseFloat(totalAmount) || 0
  const available    = amount * (1 - factionShare / 100)
  const factionCut   = amount - available
  const perUnit      = totalUnits > 0 ? available / totalUnits : 0
  rows.forEach(r => { r.payout = Math.floor(r.units * perUnit) })
  const totalRemaining = rows.reduce((s, r) => s + (!paidSet.has(r.attacker_id) ? r.payout : 0), 0)
  const allPaid        = rows.length > 0 && rows.every(r => paidSet.has(r.attacker_id))
  const useRespect     = capEnabled && capType === 'respect'

  const togglePaid = (id) => {
    if (hitsSaved) return  // locked after saving to rankings
    setPaidSet(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const flash = (msg) => { setSaveMsg(msg); setTimeout(() => setSaveMsg(null), 3000) }

  const applyEdit = (vals) => {
    setOverrides(prev => ({ ...prev, [editingRow.attacker_id]: vals }))
    setEditingRow(null)
  }

  const clearOverride = (id) => setOverrides(prev => { const n = { ...prev }; delete n[id]; return n })

  // Save draft: payout_json + paid state + overrides (no war_hits write)
  const saveDraft = async () => {
    setSaving(true)
    try {
      const paid = {}; rows.forEach(r => { if (paidSet.has(r.attacker_id)) paid[r.attacker_id] = r.payout })
      await fetch(`${API_BASE_URL}/api/leadership/war/${warId}/payout`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ payout: { settings, paid, overrides }, is_paid: allPaid }),
      })
      flash('Draft saved')
      onPayoutSaved?.(allPaid)
    } catch { flash('Error saving') }
    finally { setSaving(false) }
  }

  // Save to rankings: writes war_hits permanently then locks
  const saveToRankings = async () => {
    if (!allPaid || hitsSaved) return
    setRankSaving(true)
    try {
      const paid = {}; rows.forEach(r => { if (paidSet.has(r.attacker_id)) paid[r.attacker_id] = r.payout })
      // First persist payout + is_paid + overrides
      await fetch(`${API_BASE_URL}/api/leadership/war/${warId}/payout`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ payout: { settings, paid, overrides }, is_paid: true }),
      })
      // Then write permanent war_hits
      const members = rows.map(r => ({
        torn_user_id:   r.attacker_id,
        username:       r.attacker_name,
        war_hits:       r.war_hits       || 0,
        outside_hits:   r.outside_attacks || 0,
        assists:        r.assists         || 0,
        respect_gained: r.war_respect_gained || 0,
        payout_amount:  r.payout,
        units:          r.units,
      }))
      const res = await fetch(`${API_BASE_URL}/api/leadership/war/${warId}/save-hits`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ members }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Save failed') }
      setHitsSaved(true); flash('✓ Saved to rankings')
      onPayoutSaved?.(true)
    } catch (e) { flash(e.message || 'Error saving') }
    finally { setRankSaving(false) }
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', color: '#f4f4f5', padding: '7px 10px', fontSize: '13px', width: '100%',
  }
  const th = (align = 'right') => ({ padding: '8px 10px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: "var(--text-secondary)", fontWeight: '600', borderBottom: '1px solid rgba(255,255,255,0.07)', textAlign: align, whiteSpace: 'nowrap' })
  const td = (align = 'right') => ({ padding: '8px 10px', fontSize: '12px', color: "var(--text-secondary)", textAlign: align, borderBottom: '1px solid rgba(255,255,255,0.04)' })

  return (
    <div style={{ marginTop: '8px' }}>
      {hitsSaved && (
        <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', marginBottom: '14px' }}>
          <p style={{ color: '#4ade80', fontSize: '12px', margin: 0 }}>✓ Payout saved to member rankings — results are locked</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '11px', margin: '6px 0 0' }}>
            {payoutVerified
              ? <span style={{ color: '#4ade80' }}>✔ Live-tracked data was verified before payout</span>
              : <span style={{ color: '#eab308' }}>⚠ Live-tracked data was not verified before payout</span>}
            {payoutProcessedBy && <> · Processed by <strong style={{ color: '#f4f4f5' }}>{payoutProcessedBy}</strong></>}
            {payoutProcessedAt && ` on ${formatUnixDate(parseD1DateTime(payoutProcessedAt))}`}
          </p>
        </div>
      )}

      {/* ── Settings ── */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '16px', marginBottom: '16px', opacity: hitsSaved ? 0.6 : 1, pointerEvents: hitsSaved ? 'none' : 'auto' }}>
        <p style={{ color: "var(--text-secondary)", fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px 0' }}>Payout Settings</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
          <PctToggle label="War Hits"        value={warPct}      onChange={setWarPct}      disabled={useRespect} />
          <PctToggle label="Chain / Outside" value={outsidePct}  onChange={setOutsidePct}  disabled={useRespect} />
          <PctToggle label="Assists"         value={assistPct}   onChange={setAssistPct}   disabled={useRespect} />
          <PctToggle label="Friendly Hits"   value={friendlyPct} onChange={setFriendlyPct} disabled={useRespect} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>Total Payout ($)</label>
            <input type="text" inputMode="numeric" value={formatMoneyDisplay(totalAmount)} onChange={e => setTotalAmount(parseMoneyInput(e.target.value))} placeholder="e.g. 500,000,000" style={inputStyle} />
          </div>
          <div>
            <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>Faction Share ({factionShare}%)</label>
            <input type="range" min="0" max="50" step="1" value={factionShare} onChange={e => setFactionShare(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#b3123f', marginTop: '6px' }} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={() => { setCapEnabled(e => !e) }} style={{
            padding: '5px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
            border: `1px solid ${capEnabled ? 'rgba(234,179,8,0.5)' : 'rgba(255,255,255,0.1)'}`,
            background: capEnabled ? 'rgba(234,179,8,0.1)' : 'transparent',
            color: capEnabled ? '#eab308' : "var(--text-muted)",
          }}>{capEnabled ? '⚡ Cap ON' : 'Cap OFF'}</button>

          {capEnabled && <>
            <div style={{ display: 'flex', gap: '4px' }}>
              {['attacks', 'respect'].map(t => (
                <button key={t} onClick={() => setCapType(t)} style={{
                  padding: '5px 12px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer',
                  border: `1px solid ${capType === t ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  background: capType === t ? 'rgba(179,18,63,0.15)' : 'transparent',
                  color: capType === t ? '#f4f4f5' : "var(--text-muted)",
                }}>{t === 'attacks' ? 'Attack Cap' : 'Respect Cap'}</button>
              ))}
            </div>
            <input type="number" min="0" value={capValue} onChange={e => setCapValue(e.target.value)}
              placeholder={capType === 'attacks' ? 'Max units' : 'Max respect'}
              style={{ ...inputStyle, width: '130px' }} />

            {capType === 'respect' && (
              <button onClick={() => setIncludeBonusRespect(v => !v)} title="Chain-milestone bonus respect (10x, 25x, 50x hits, etc.) is excluded from payout respect by default" style={{
                padding: '5px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                border: `1px solid ${includeBonusRespect ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)'}`,
                background: includeBonusRespect ? 'rgba(245,158,11,0.1)' : 'transparent',
                color: includeBonusRespect ? '#f59e0b' : "var(--text-muted)",
              }}>{includeBonusRespect ? '✓ Bonus Respect Included' : 'Bonus Respect Excluded'}</button>
            )}
          </>}
        </div>

        {amount > 0 && (
          <div style={{ marginTop: '14px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
            {[['Faction cut', `$${factionCut.toLocaleString('en-GB')}`, '#f4f4f5'],
              ['Available',   `$${available.toLocaleString('en-GB')}`,  '#22c55e'],
              ['Per unit',    `$${Math.floor(perUnit).toLocaleString('en-GB')}`, '#f4f4f5'],
              ['Remaining',   `$${totalRemaining.toLocaleString('en-GB')}`, totalRemaining > 0 ? '#eab308' : '#22c55e'],
            ].map(([l, v, c]) => (
              <span key={l} style={{ fontSize: '11px', color: "var(--text-secondary)" }}>{l}: <strong style={{ color: c }}>{v}</strong></span>
            ))}
          </div>
        )}
      </div>

      {/* ── Member table ── */}
      {rows.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>No members with qualifying attacks — adjust percentages above.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
            <thead>
              <tr>
                <th style={th('left')}>Member</th>
                <th style={th()}>War Hits</th>
                <th style={th()}>Outside</th>
                <th style={th()}>Assists</th>
                <th style={th()}>Friendly</th>
                <th style={th()}>Gained</th>
                <th style={th()}>Bonus</th>
                <th style={th()}>Units</th>
                <th style={th()}>Payout</th>
                <th style={th('center')}>Pay</th>
                <th style={th('center')}>Paid</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const paid       = paidSet.has(r.attacker_id)
                const hasOverride = !!overrides[r.attacker_id]
                return (
                  <tr key={r.attacker_id}
                    style={{ opacity: paid ? 0.5 : 1 }}
                    onMouseEnter={e => { if (!paid) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ ...td('left'), color: '#e4e4e7', textDecoration: paid ? 'line-through' : 'none' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {r.attacker_name || `[${r.attacker_id}]`}
                        {!hitsSaved && (
                          <span style={{ display: 'flex', gap: '3px' }}>
                            <button onClick={() => setEditingRow(r)} title="Edit attack data" style={{
                              padding: '1px 5px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', lineHeight: 1,
                              background: hasOverride ? 'rgba(159,103,255,0.15)' : 'transparent',
                              border: `1px solid ${hasOverride ? 'rgba(159,103,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                              color: hasOverride ? '#c4b5fd' : "var(--text-faint)",
                            }}>✎</button>
                            {hasOverride && (
                              <button onClick={() => clearOverride(r.attacker_id)} title="Clear overrides" style={{
                                padding: '1px 5px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', lineHeight: 1,
                                background: 'transparent', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171',
                              }}>×</button>
                            )}
                          </span>
                        )}
                      </span>
                    </td>
                    <td style={td()}>{r.war_hits || 0}</td>
                    <td style={td()}>{r.outside_attacks || 0}</td>
                    <td style={td()}>{r.assists || 0}</td>
                    <td style={{ ...td(), color: (r.friendly_hits || 0) > 0 ? '#fb923c' : "var(--text-faint)" }}>{r.friendly_hits || 0}</td>
                    <td style={{ ...td(), color: '#22c55e' }}>{((parseFloat(r.war_respect_gained) || 0) - (parseFloat(r.bonus_respect) || 0)).toFixed(2)}</td>
                    <td style={{ ...td(), color: (parseFloat(r.bonus_respect) || 0) > 0 ? '#f59e0b' : "var(--text-faint)" }}>{(parseFloat(r.bonus_respect) || 0).toFixed(2)}</td>
                    <td style={{ ...td(), color: '#f4f4f5', fontWeight: '600' }}>{r.units.toFixed(useRespect ? 2 : 1)}</td>
                    <td style={{ ...td(), color: '#22c55e', fontWeight: '700', fontSize: '13px' }}>
                      ${r.payout.toLocaleString('en-GB')}
                    </td>
                    <td style={{ ...td('center') }}>
                      {paid || hitsSaved ? (
                        <span style={{ fontSize: '10px', color: "var(--text-faint)", padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>Paid</span>
                      ) : (
                        <a href={`https://www.torn.com/factions.php?step=your#/tab=controls&addMoneyTo=${r.attacker_id}&money=${r.payout}`}
                          target="_blank" rel="noreferrer"
                          style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          Pay ↗
                        </a>
                      )}
                    </td>
                    <td style={{ ...td('center') }}>
                      <button onClick={() => togglePaid(r.attacker_id)} disabled={hitsSaved} style={{
                        width: '22px', height: '22px', borderRadius: '6px',
                        cursor: hitsSaved ? 'default' : 'pointer',
                        border: `1px solid ${paid ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.15)'}`,
                        background: paid ? 'rgba(34,197,94,0.2)' : 'transparent',
                        color: paid ? '#4ade80' : "var(--text-faint)", fontSize: '13px', lineHeight: 1,
                      }}>{paid ? '✓' : ''}</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="7" style={{ padding: '10px', fontSize: '11px', color: "var(--text-secondary)", borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  {paidSet.size} of {rows.length} paid
                </td>
                <td style={{ padding: '10px', fontSize: '12px', fontWeight: '700', color: '#f4f4f5', textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{totalUnits.toFixed(1)}</td>
                <td style={{ padding: '10px', fontSize: '13px', fontWeight: '700', color: '#22c55e', textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  ${rows.reduce((s, r) => s + r.payout, 0).toLocaleString('en-GB')}
                </td>
                <td colSpan="2" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Action buttons ── */}
      {!hitsSaved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
          <button onClick={saveDraft} disabled={saving} style={{
            padding: '7px 18px', borderRadius: '8px', fontSize: '12px', cursor: saving ? 'not-allowed' : 'pointer',
            background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: "var(--text-secondary)",
            opacity: saving ? 0.6 : 1,
          }}>{saving ? 'Saving…' : 'Save Draft'}</button>

          <button onClick={saveToRankings} disabled={!allPaid || rankSaving} style={{
            padding: '7px 20px', borderRadius: '8px', fontSize: '13px',
            cursor: (!allPaid || rankSaving) ? 'not-allowed' : 'pointer',
            background: allPaid ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${allPaid ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: allPaid ? '#4ade80' : "var(--text-faint)", fontWeight: '600',
            opacity: rankSaving ? 0.6 : 1,
          }}>
            {rankSaving ? 'Saving…' : allPaid ? '✓ Save to Rankings' : `Save to Rankings (${paidSet.size}/${rows.length} paid)`}
          </button>

          {saveMsg && <span style={{ fontSize: '12px', color: saveMsg.startsWith('✓') ? '#4ade80' : '#f87171' }}>{saveMsg}</span>}
        </div>
      )}

      {editingRow && <EditAttacksModal row={editingRow} onSave={applyEdit} onClose={() => setEditingRow(null)} />}
    </div>
  )
}

// ─── Attack log (debug) ───────────────────────────────────────────────────────

const TYPE_LABELS = {
  war_attack:     { label: 'War Hit',     color: '#22c55e' },
  war_defend:     { label: 'Defend',      color: '#f97316' },
  outside_attack: { label: 'Outside',     color: '#a78bfa' },
  outside_defend: { label: 'Ext. Defend', color: "var(--text-muted)" },
  friendly_hit:   { label: 'Friendly',    color: '#fb923c' },
  assist:         { label: 'Assist',      color: '#60a5fa' },
}

function relativeTime(unix) {
  const secs = Math.floor(Date.now() / 1000) - unix
  if (secs < 60)   return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m ago`
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  return `${d}d ${h}h ago`
}

function AttackLogTab({ warId }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('all')

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_BASE_URL}/api/leadership/war/${warId}/attacks`, { headers: authHeaders(), signal: controller.signal })
      .then(r => r.json())
      .then(d => setData(d))
      .catch(e => { if (e.name !== 'AbortError') console.error('attack log fetch failed', e) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [warId])

  if (loading) return <p style={{ color: "var(--text-secondary)", fontSize: '13px', padding: '20px 0' }}>Loading attack log…</p>
  if (!data)   return <p style={{ color: '#ef4444', fontSize: '13px', padding: '20px 0' }}>Failed to load attack log.</p>

  const { war, attacks = [] } = data
  const warStartedAt = war?.started_at ?? null

  if (!attacks.length) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
        No raw attack rows available — this war's data has been archived into a summary (attacks are purged after completion).
      </p>
    )
  }

  const types = ['all', 'war_attack', 'war_defend', 'outside_attack', 'assist', 'friendly_hit']
  const filtered = filter === 'all' ? attacks : attacks.filter(a => a.attack_type === filter)

  const STICKY_BG = '#141414'
  const th = { padding: '7px 10px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: "var(--text-secondary)", fontWeight: '600', borderBottom: '1px solid rgba(255,255,255,0.07)', textAlign: 'left', whiteSpace: 'nowrap', background: STICKY_BG }
  const thR = { ...th, textAlign: 'right' }
  const td  = { padding: '6px 10px', fontSize: '11px', color: '#d4d4d8', borderBottom: '1px solid rgba(255,255,255,0.03)', whiteSpace: 'nowrap', textAlign: 'left' }
  const tdR = { ...td, textAlign: 'right' }

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: "var(--text-faint)", fontSize: '11px' }}>{attacks.length} total rows — filter:</span>
        {types.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            padding: '3px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
            border: `1px solid ${filter === t ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
            background: filter === t ? 'rgba(179,18,63,0.15)' : 'transparent',
            color: filter === t ? '#f4f4f5' : "var(--text-muted)",
          }}>
            {t === 'all' ? 'All' : (TYPE_LABELS[t]?.label ?? t)}
          </button>
        ))}
        {warStartedAt && (
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: "var(--text-faint)" }}>
            War started: {formatUnixDateTime(warStartedAt)}
          </span>
        )}
      </div>

      {!filtered.length ? (
        <p style={{ color: "var(--text-muted)", fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>No attacks match this filter.</p>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: '900px', width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
              <tr>
                <th style={th}>Time (UTC/TCT)</th>
                <th style={th}>Relative</th>
                <th style={th}>Type</th>
                <th style={th}>Attacker</th>
                <th style={th}>Defender</th>
                <th style={th}>Result</th>
                <th style={{ ...th, textAlign: 'center' }}>Int.</th>
                <th style={thR}>FF</th>
                <th style={thR}>Respect +</th>
                <th style={thR}>Respect −</th>
                <th style={thR}>Chain</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => {
                const isWarStart = warStartedAt && a.started_at === warStartedAt
                const beforeWar  = warStartedAt && a.started_at < warStartedAt
                const typeInfo   = TYPE_LABELS[a.attack_type] || { label: a.attack_type, color: "var(--text-secondary)" }
                const rowBg      = beforeWar ? 'rgba(245,158,11,0.04)' : 'transparent'
                return (
                  <>
                    {isWarStart && (
                      <tr key={`sep-${i}`}>
                        <td colSpan={11} style={{ padding: '4px 10px', fontSize: '10px', color: '#eab308', background: 'rgba(234,179,8,0.08)', borderTop: '1px solid rgba(234,179,8,0.25)', borderBottom: '1px solid rgba(234,179,8,0.25)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                          ↑ Stacking period &nbsp;·&nbsp; War start: {formatUnixDateTime(warStartedAt)} &nbsp;↓ War period
                        </td>
                      </tr>
                    )}
                    <tr key={a.torn_attack_id} style={{ background: rowBg }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = rowBg }}
                    >
                      <td style={td}>{formatUnixDateTime(a.started_at)}</td>
                      <td style={{ ...td, color: "var(--text-faint)" }}>{relativeTime(a.started_at)}</td>
                      <td style={td}>
                        <span style={{ color: typeInfo.color, fontWeight: '600' }}>{typeInfo.label}</span>
                      </td>
                      <td style={td}>{a.attacker_name || (a.attacker_id ? `[${a.attacker_id}]` : '—')}</td>
                      <td style={{ ...td, color: "var(--text-secondary)" }}>{a.defender_name || (a.defender_id ? `[${a.defender_id}]` : '—')}</td>
                      <td style={{ ...td, color: a.result === 'Attacked' ? '#22c55e' : a.result === 'Lost' ? '#ef4444' : "var(--text-secondary)" }}>
                        {a.result || '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'center', color: a.is_interrupted ? '#f97316' : "var(--text-ghost)" }}>
                        {a.is_interrupted ? '✓' : '·'}
                      </td>
                      <td style={tdR}>{(a.fair_fight ?? 1).toFixed(2)}</td>
                      <td style={{ ...tdR, color: a.respect_gain > 0 ? '#4ade80' : "var(--text-ghost)" }}>
                        {a.respect_gain > 0 ? `+${(a.respect_gain).toFixed(2)}` : '—'}
                      </td>
                      <td style={{ ...tdR, color: a.respect_loss > 0 ? '#f87171' : "var(--text-ghost)" }}>
                        {a.respect_loss > 0 ? `−${(a.respect_loss).toFixed(2)}` : '—'}
                      </td>
                      <td style={{ ...tdR, color: a.chain_count > 0 ? '#f59e0b' : "var(--text-ghost)" }}>
                        {a.chain_count > 0 ? a.chain_count : '—'}
                      </td>
                    </tr>
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ color: "var(--text-faint)", fontSize: '10px', marginTop: '10px' }}>
        Debug view — raw war_attacks rows as stored. Use to verify column counts against the Member Stats table.
        Orange-tinted rows are pre-war (stacking period).
      </p>
    </div>
  )
}

// ─── Verify data tab ──────────────────────────────────────────────────────────

function unixToInput(unix) {
  if (!unix) return ''
  return new Date(unix * 1000).toISOString().slice(0, 16) // UTC datetime string
}
function inputToUnix(val) {
  if (!val) return null
  return Math.floor(new Date(val + ':00Z').getTime() / 1000)
}

function VerifyDataTab({ warId, war, oldSummary, onApplied }) {
  const [startInput, setStartInput] = useState(() => unixToInput(war?.started_at))
  const [endInput,   setEndInput]   = useState(() => unixToInput(war?.ended_at))
  const [running,    setRunning]    = useState(false)
  const [result,     setResult]     = useState(null)
  const [applying,   setApplying]   = useState(false)
  const [msg,        setMsg]        = useState(null)
  const [error,      setError]      = useState(null)

  const runVerification = async () => {
    const start_at = inputToUnix(startInput)
    const end_at   = inputToUnix(endInput)
    if (!start_at || !end_at) { setError('Both timestamps are required'); return }
    if (end_at <= start_at)   { setError('End must be after start'); return }

    setRunning(true); setError(null); setResult(null); setMsg(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/war/${warId}/verify`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_at, end_at }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Verification failed')
      setResult(d)
    } catch (e) { setError(e.message) }
    finally { setRunning(false) }
  }

  const applyVerified = async () => {
    if (!result) return
    setApplying(true); setMsg(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/war/${warId}/verify/apply`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ attackerStats: result.attackerStats, defendStats: result.defendStats, totals: result.totals, attacks: result.attacks }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Apply failed')
      setMsg('✓ Verified data applied.')
      onApplied?.()
    } catch (e) { setMsg('Error: ' + e.message) }
    finally { setApplying(false) }
  }

  const inp = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', color: '#f4f4f5', padding: '7px 10px', fontSize: '13px',
  }

  // Summary stat comparison rows
  const STAT_ROWS = [
    ['War Hits',       'total_war_hits',       false],
    ['Defends Won',    'total_defends_won',     false],
    ['Enemy Hits',     'total_enemy_hits',      true],
    ['Outside Atks',   'total_outside_attacks', false],
    ['Assists',        'total_assists',         false],
    ['Friendly Hits',  'total_friendly_hits',   true],
    ['Respect Gained', 'total_respect_gained',  false],
    ['Respect Lost',   'total_respect_lost',    true],
    ['Net Respect',    'total_net_respect',     false],
  ]

  return (
    <div style={{ marginTop: '8px' }}>
      {/* Timestamp inputs */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '16px', marginBottom: '14px' }}>
        <p style={{ color: "var(--text-secondary)", fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px 0' }}>
          Verification Range <span style={{ color: "var(--text-faint)", fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>— times are UTC/TCT</span>
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>War Start</label>
            <input type="datetime-local" value={startInput} onChange={e => setStartInput(e.target.value)} style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>War End</label>
            <input type="datetime-local" value={endInput} onChange={e => setEndInput(e.target.value)} style={{ ...inp, width: '100%' }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={runVerification} disabled={running} style={{
            padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: running ? 'not-allowed' : 'pointer',
            background: running ? 'rgba(255,255,255,0.04)' : 'rgba(99,102,241,0.15)',
            border: `1px solid ${running ? 'rgba(255,255,255,0.08)' : 'rgba(99,102,241,0.4)'}`,
            color: running ? "var(--text-muted)" : '#a5b4fc', opacity: running ? 0.7 : 1,
          }}>
            {running ? 'Fetching from Torn API…' : 'Run Verification'}
          </button>
          {running && <span style={{ color: "var(--text-faint)", fontSize: '12px' }}>Paginating attack history — this may take 10–30 seconds</span>}
          {error && <span style={{ color: '#f87171', fontSize: '12px' }}>{error}</span>}
        </div>
      </div>

      {/* Results */}
      {result && (
        <div>
          {/* Fetch summary */}
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '14px', padding: '10px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', alignItems: 'center' }}>
            <span style={{ color: '#a5b4fc', fontSize: '12px', fontWeight: '600' }}>{result.attack_count} attacks fetched</span>
            <span style={{ color: "var(--text-faint)", fontSize: '11px' }}>via {result.key_user}</span>
            <span style={{ color: "var(--text-faint)", fontSize: '11px' }}>·</span>
            <span style={{ color: "var(--text-faint)", fontSize: '11px' }}>{formatUnixDateTime(result.range?.start_at)} → {formatUnixDateTime(result.range?.end_at)}</span>
            {result.truncated && <span style={{ color: '#f59e0b', fontSize: '11px' }}>⚠ Page limit reached — range may be incomplete</span>}
          </div>

          {/* Summary comparison */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
            <p style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px 0' }}>Summary Comparison</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    {['Stat', 'Current (stored)', 'Verified (new)', 'Diff'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: "var(--text-faint)", textAlign: h === 'Stat' ? 'left' : 'right', borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {STAT_ROWS.map(([label, key, lowerIsBetter]) => {
                    const oldVal = oldSummary?.[key] ?? '—'
                    const newVal = result.totals?.[key] ?? 0
                    const diff   = typeof oldVal === 'number' ? newVal - oldVal : null
                    const diffColor = diff === null ? "var(--text-faint)" : diff === 0 ? "var(--text-faint)" : (lowerIsBetter ? (diff < 0 ? '#4ade80' : '#f87171') : (diff > 0 ? '#4ade80' : '#f87171'))
                    const isDecimal = key.includes('respect')
                    const fmtV = (v) => typeof v === 'number' ? fmt(v, isDecimal ? 2 : 0) : v
                    return (
                      <tr key={key}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <td style={{ padding: '6px 10px', fontSize: '12px', color: '#e4e4e7' }}>{label}</td>
                        <td style={{ padding: '6px 10px', fontSize: '12px', color: "var(--text-muted)", textAlign: 'right' }}>{fmtV(oldVal)}</td>
                        <td style={{ padding: '6px 10px', fontSize: '12px', color: '#f4f4f5', textAlign: 'right', fontWeight: '600' }}>{fmtV(newVal)}</td>
                        <td style={{ padding: '6px 10px', fontSize: '12px', color: diffColor, textAlign: 'right' }}>
                          {diff === null ? '—' : diff === 0 ? '=' : (diff > 0 ? '+' : '') + fmtV(diff)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* New member stats */}
          <div style={{ marginBottom: '14px' }}>
            <p style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Verified Member Stats</p>
            <MemberStatsTable attackerStats={result.attackerStats} defendStats={result.defendStats} />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={applyVerified} disabled={applying || !!msg} style={{
              padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
              cursor: applying || !!msg ? 'not-allowed' : 'pointer',
              background: msg?.startsWith('✓') ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.12)',
              border: `1px solid ${msg?.startsWith('✓') ? 'rgba(34,197,94,0.25)' : 'rgba(34,197,94,0.4)'}`,
              color: '#4ade80', opacity: applying ? 0.6 : 1,
            }}>
              {applying ? 'Applying…' : 'Apply Verified Data'}
            </button>
            <button onClick={() => setResult(null)} style={{
              padding: '8px 18px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: "var(--text-muted)",
            }}>
              Discard
            </button>
            {msg && <span style={{ fontSize: '12px', color: msg.startsWith('✓') ? '#4ade80' : '#f87171' }}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Expanded war detail ──────────────────────────────────────────────────────

function WarDetail({ warId, onPayoutSaved }) {
  const [data,      setData]      = useState(null)
  const [armory,    setArmory]    = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [activeSection, setActiveSection] = useState('stats')

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    setLoading(true)
    Promise.all([
      fetch(`${API_BASE_URL}/api/leadership/war/${warId}`,        { headers: authHeaders(), signal }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/leadership/war/${warId}/armory`, { headers: authHeaders(), signal }).then((r) => r.json()),
    ]).then(([detail, arm]) => {
      setData(detail)
      setArmory(arm.armory || [])
    }).catch((e) => { if (e.name !== 'AbortError') console.error('war detail fetch failed', e) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [warId, reloadKey])

  if (loading) return <p style={{ color: "var(--text-secondary)", fontSize: '13px', padding: '20px 0' }}>Loading war details…</p>
  if (!data?.war) return <p style={{ color: '#ef4444', fontSize: '13px', padding: '20px 0' }}>Failed to load war details.</p>

  const { war, summary, attackerStats, defendStats } = data
  const isCompleted = war.status === 'completed' || war.status === 'manual'

  const sectionBtns = [
    { value: 'stats',  label: 'Member Stats' },
    { value: 'armory', label: `Armory (${armory?.length ?? 0} entries)` },
    { value: 'payout', label: '💰 Payout' },
    { value: 'debug',  label: '🔍 Attack Log' },
    ...(isCompleted ? [{ value: 'verify', label: '✔ Verify Data' }] : []),
  ]

  return (
    <div>
      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px,1fr))', gap: '8px', marginBottom: '16px' }}>
        <Stat label="War Hits"      value={fmt(summary.total_war_hits)}       accent />
        <Stat label="Defends Won"   value={fmt(summary.total_defends_won)}    accent />
        <Stat label="Enemy Hits"    value={fmt(summary.total_enemy_hits)}     red />
        <Stat label="Outside Atks"  value={fmt(summary.total_outside_attacks)} />
        <Stat label="Assists"       value={fmt(summary.total_assists)} />
        <Stat label="Friendly Hits" value={fmt(summary.total_friendly_hits ?? 0)} />
        <Stat label="Respect Gained" value={fmt(summary.total_respect_gained, 2)} accent />
        <Stat label="Respect Lost"   value={fmt(summary.total_respect_lost,   2)} red />
        <Stat label="Net Respect"
              value={(summary.total_net_respect >= 0 ? '+' : '') + fmt(summary.total_net_respect, 2)}
              accent={summary.total_net_respect >= 0} red={summary.total_net_respect < 0} />
      </div>

      {/* Section selector */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {sectionBtns.map((s) => (
          <button key={s.value} onClick={() => setActiveSection(s.value)}
            style={{
              padding: '6px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
              border: `1px solid ${activeSection === s.value ? (s.value === 'verify' ? 'rgba(99,102,241,0.5)' : 'rgba(179,18,63,0.5)') : 'rgba(255,255,255,0.08)'}`,
              background: activeSection === s.value ? (s.value === 'verify' ? 'rgba(99,102,241,0.15)' : 'rgba(179,18,63,0.15)') : 'transparent',
              color: activeSection === s.value ? '#f4f4f5' : "var(--text-secondary)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {activeSection === 'stats'  && <MemberStatsTable attackerStats={attackerStats} defendStats={defendStats} />}
      {activeSection === 'armory' && <ArmoryTable armory={armory} />}
      {activeSection === 'debug'  && <AttackLogTab warId={warId} />}
      {activeSection === 'verify' && (
        <VerifyDataTab
          warId={warId}
          war={war}
          oldSummary={summary}
          onApplied={() => setReloadKey(k => k + 1)}
        />
      )}
      {activeSection === 'payout' && (
        <PayoutCalculator warId={warId} attackerStats={attackerStats} initialHitsSaved={!!war?.hits_saved} onPayoutSaved={onPayoutSaved}
          payoutVerified={!!war?.payout_verified} payoutProcessedBy={war?.payout_processed_by_username} payoutProcessedAt={war?.payout_processed_at} />
      )}
    </div>
  )
}

// ─── War card ─────────────────────────────────────────────────────────────────

// ─── Active/matched war scoreboard ───────────────────────────────────────────

function useCountdown(targetUnix) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (!targetUnix) return
    const update = () => {
      const secs = targetUnix - Math.floor(Date.now() / 1000)
      if (secs <= 0) { setLabel('starting…'); return }
      const d = Math.floor(secs / 86400)
      const h = Math.floor((secs % 86400) / 3600)
      const m = Math.floor((secs % 3600) / 60)
      const s = secs % 60
      setLabel(d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [targetUnix])
  return label
}

function ScoreBoard({ war, ourFactionName }) {
  const { our_score = 0, opponent_score = 0, target = 0, our_chain = 0, opponent_chain = 0,
          opponent_faction_name, started_at, status, scheduled_start } = war

  const isMatched = status === 'matched'
  const total     = our_score + opponent_score
  const weWinning = our_score >= opponent_score

  // The war ENDS when the lead (score differential) reaches target — used
  // below for the "need X more to win" text — but the bars themselves show
  // each side's share of total points, so both stay visible as points come in.
  const leadDiff  = Math.abs(our_score - opponent_score)
  const ourPct    = total > 0 ? (our_score / total) * 100 : 0
  const oppPct    = total > 0 ? (opponent_score / total) * 100 : 0

  const countdown = useCountdown(isMatched ? scheduled_start : null)

  // How long the war has been running
  const elapsed = started_at ? Math.floor(Date.now() / 1000) - started_at : 0
  const elH = Math.floor(elapsed / 3600)
  const elM = Math.floor((elapsed % 3600) / 60)

  const scoreStyle = (winning) => ({
    fontSize: '26px', fontWeight: '800', fontFamily: 'Cinzel, serif',
    color: isMatched ? "var(--text-faint)" : (winning ? '#22c55e' : '#f4f4f5'),
    textShadow: !isMatched && winning ? '0 0 20px rgba(34,197,94,0.4)' : 'none',
    lineHeight: 1,
  })

  const borderColor = isMatched ? 'rgba(234,179,8,0.12)' : 'rgba(34,197,94,0.12)'
  const bgColor     = isMatched ? 'rgba(234,179,8,0.02)'  : 'rgba(34,197,94,0.03)'

  return (
    <div style={{
      padding: '16px 18px 18px',
      borderTop: `1px solid ${borderColor}`,
      background: bgColor,
    }}>
      {/* Names + scores */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        {/* Opponent side */}
        <div style={{ textAlign: 'left' }}>
          <p style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px 0' }}>
            {opponent_faction_name || 'Opponent'}
          </p>
          <span style={scoreStyle(!weWinning)}>{(opponent_score || 0).toLocaleString('en-GB')}</span>
          {opponent_chain > 0 && (
            <p style={{ color: '#f97316', fontSize: '10px', margin: '3px 0 0 0' }}>⛓ chain ×{opponent_chain}</p>
          )}
        </div>

        {/* Centre: target */}
        <div style={{ textAlign: 'center', padding: '0 8px' }}>
          <p style={{ color: "var(--text-muted)", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px 0' }}>target</p>
          <p style={{ color: "var(--text-secondary)", fontSize: '13px', fontWeight: '600', margin: 0 }}>
            {isMatched ? '—' : (target > 0 ? target.toLocaleString('en-GB') : '—')}
          </p>
          {isMatched && countdown && (
            <p style={{ color: '#eab308', fontSize: '12px', margin: '4px 0 0 0', fontVariantNumeric: 'tabular-nums' }}>
              {countdown}
            </p>
          )}
          {!isMatched && elapsed > 0 && (
            <p style={{ color: "var(--text-faint)", fontSize: '9px', margin: '4px 0 0 0' }}>
              {elH}h {elM}m elapsed
            </p>
          )}
        </div>

        {/* Our side */}
        <div style={{ textAlign: 'right' }}>
          <p style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px 0' }}>
            {ourFactionName}
          </p>
          <span style={scoreStyle(weWinning)}>{(our_score || 0).toLocaleString('en-GB')}</span>
          {our_chain > 0 && (
            <p style={{ color: '#f97316', fontSize: '10px', margin: '3px 0 0 0' }}>⛓ chain ×{our_chain}</p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '12px', opacity: isMatched ? 0.25 : 1 }}>
        {/* Opponent bar — fills left-to-right */}
        <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px 0 0 4px', overflow: 'hidden', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{
            width: `${oppPct}%`, height: '100%', borderRadius: '4px 0 0 4px',
            background: !weWinning ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.5)',
            transition: 'width 0.6s ease',
          }} />
        </div>

        {/* Centre divider */}
        <div style={{ width: '2px', height: '14px', background: 'rgba(255,255,255,0.15)', borderRadius: '1px', flexShrink: 0 }} />

        {/* Our bar — fills right-to-left */}
        <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '0 4px 4px 0', overflow: 'hidden', display: 'flex', justifyContent: 'flex-start' }}>
          <div style={{
            width: `${ourPct}%`, height: '100%', borderRadius: '0 4px 4px 0',
            background: weWinning ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.5)',
            transition: 'width 0.6s ease',
          }} />
        </div>
      </div>

      {/* Lead indicator */}
      {total > 0 && (
        <p style={{ textAlign: 'center', color: "var(--text-faint)", fontSize: '10px', margin: '6px 0 0 0' }}>
          {weWinning
            ? `+${leadDiff.toLocaleString('en-GB')} lead — need ${Math.max(0, target - leadDiff).toLocaleString('en-GB')} more lead to win`
            : `${leadDiff.toLocaleString('en-GB')} behind — opponent needs ${Math.max(0, target - leadDiff).toLocaleString('en-GB')} more lead to win`}
        </p>
      )}
    </div>
  )
}

// ─── War card ─────────────────────────────────────────────────────────────────

function WarCard({ war, factionName }) {
  const [expanded, setExpanded] = useState(false)
  const [isPaid,   setIsPaid]   = useState(!!war.is_paid)

  const dateLabel = war.status === 'completed'
    ? formatUnixDate(war.ended_at || war.started_at)
    : war.status === 'active'
    ? `Started ${formatUnixDate(war.started_at)}`
    : `Scheduled ${formatUnixDate(war.scheduled_start)}`

  const lastCheckedUnix  = parseD1DateTime(war.last_checked_at)
  const lastUpdatedLabel = lastCheckedUnix ? `Updated ${formatUnixDateTime(lastCheckedUnix)}` : null

  const isActive  = war.status === 'active'
  const isMatched = war.status === 'matched'

  return (
    <div style={{
      borderRadius: '12px',
      border: `1px solid ${isActive ? 'rgba(34,197,94,0.3)' : isMatched ? 'rgba(234,179,8,0.3)' : isPaid ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.07)'}`,
      background: isActive ? 'rgba(34,197,94,0.02)' : 'rgba(255,255,255,0.02)',
      overflow: 'hidden',
    }}>
      {/* Card header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px',
        }}
      >
        <span style={{ fontSize: '18px' }}>{war.result === 'won' ? '🏆' : war.result === 'lost' ? '💀' : '⚔️'}</span>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <p style={{ color: '#f4f4f5', fontWeight: '600', fontSize: '14px', margin: '0 0 2px 0' }}>
            vs {war.opponent_faction_name || `Faction #${war.opponent_faction_id}`}
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: '11px', margin: '0 0 1px 0' }}>{dateLabel}</p>
          {lastUpdatedLabel && <p style={{ color: "var(--text-faint)", fontSize: '10px', margin: 0 }}>{lastUpdatedLabel}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isPaid && (
            <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80' }}>
              PAID
            </span>
          )}
          {war.status === 'completed' && war.our_score > 0 && (
            <span style={{ color: "var(--text-muted)", fontSize: '11px' }}>
              {(war.our_score || 0).toLocaleString('en-GB')} — {(war.opponent_score || 0).toLocaleString('en-GB')}
            </span>
          )}
          <StatusBadge status={war.status} result={war.result} />
          <span style={{ color: "var(--text-secondary)", fontSize: '16px', lineHeight: 1 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Scoreboard — always visible for active and matched wars */}
      {(isActive || isMatched) && <ScoreBoard war={war} ourFactionName={factionName} />}

      {/* Rank change banner */}
      {war.rank_change && (() => {
        const isUp     = war.rank_change.toLowerCase().includes('ranked up')
        const rewards  = war.rewards_json ? (() => { try { return JSON.parse(war.rewards_json) } catch { return [] } })() : []
        const bg       = isUp ? 'rgba(34,197,94,0.08)'  : 'rgba(179,18,63,0.08)'
        const border   = isUp ? 'rgba(34,197,94,0.2)'   : 'rgba(179,18,63,0.15)'
        const color    = isUp ? '#4ade80'                : '#f87171'
        return (
          <div style={{ padding: '8px 18px', background: bg, borderTop: `1px solid ${border}` }}>
            <p style={{ color, fontSize: '11px', margin: '0 0 4px 0', fontWeight: '500' }}>
              {isUp ? '▲' : '▼'} {war.rank_change}
            </p>
            {(war.bonus_respect || rewards.length > 0) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                {war.bonus_respect > 0 && (
                  <span style={{ color: "var(--text-secondary)", fontSize: '10px' }}>
                    +{war.bonus_respect.toLocaleString('en-GB')} bonus respect
                  </span>
                )}
                {rewards.map((item, i) => (
                  <span key={i} style={{
                    background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)',
                    color: '#c4b5fd', fontSize: '10px', borderRadius: '4px', padding: '1px 6px',
                  }}>{item}</span>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <WarDetail warId={war.id} onPayoutSaved={(paid) => setIsPaid(paid)} />
        </div>
      )}
    </div>
  )
}

// ─── Faction war list ─────────────────────────────────────────────────────────

function FactionWars({ factionId }) {
  const [wars,    setWars]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`${API_BASE_URL}/api/leadership/wars?faction_id=${factionId}`, { headers: authHeaders(), signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setWars(d.wars || []))
      .catch((e) => { if (e.name !== 'AbortError') setError('Failed to load wars') })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [factionId])

  if (loading) return <p style={{ color: "var(--text-secondary)", fontSize: '13px', padding: '20px 0' }}>Loading wars…</p>
  if (error)   return <p style={{ color: '#ef4444', fontSize: '13px', padding: '20px 0' }}>{error}</p>
  if (!wars.length) return (
    <p style={{ color: "var(--text-muted)", fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>
      No ranked wars tracked yet. Wars are detected automatically on Tuesdays at 01:00 UTC.
    </p>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
      {wars.map((war) => <WarCard key={war.id} war={war} factionName={FACTIONS.find(f => f.id === factionId)?.name || 'Us'} />)}
    </div>
  )
}

// ─── Manual war entry ────────────────────────────────────────────────────────

function ManualWarEntry({ onClose, onSaved }) {
  const [factionId,    setFactionId]    = useState(33097)
  const [date,         setDate]         = useState('')
  const [opponentName, setOpponentName] = useState('')
  const [members,      setMembers]      = useState([{ name: '', hits: '' }])
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState(null)

  const addRow    = () => setMembers(m => [...m, { id: '', name: '', hits: '' }])
  const removeRow = (i) => setMembers(m => m.filter((_, idx) => idx !== i))
  const updateRow = (i, field, val) => setMembers(m => m.map((r, idx) => idx === i ? { ...r, [field]: val } : r))

  const submit = async () => {
    setError(null)
    const validMembers = members.filter(r => parseInt(r.id, 10) > 0 && parseInt(r.hits, 10) > 0)
    if (!date) return setError('Date is required')
    if (!validMembers.length) return setError('At least one member with a User ID and hits is required')
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/wars/manual`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faction_id:    factionId,
          started_at:    Math.floor(new Date(date).getTime() / 1000),
          opponent_name: opponentName.trim() || null,
          members:       validMembers.map(r => ({ torn_user_id: parseInt(r.id, 10), username: r.name.trim() || null, war_hits: parseInt(r.hits, 10) })),
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Save failed') }
      onSaved?.()
      onClose()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', color: '#f4f4f5', padding: '7px 10px', fontSize: '13px',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      <div style={{
        background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px',
        padding: '24px', width: '100%', maxWidth: '600px', maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ color: '#f4f4f5', fontSize: '16px', fontWeight: '600', margin: 0 }}>Add Historic War</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: "var(--text-muted)", fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Faction + Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>Faction</label>
            <select value={factionId} onChange={e => setFactionId(Number(e.target.value))} style={{ ...inputStyle, width: '100%' }}>
              {FACTIONS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>War Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </div>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>Opponent Name (optional)</label>
          <input type="text" value={opponentName} onChange={e => setOpponentName(e.target.value)} placeholder="e.g. Enemy Faction" style={{ ...inputStyle, width: '100%' }} />
        </div>

        {/* Member rows */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Members &amp; War Hits</label>
            <button onClick={addRow} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: "var(--text-secondary)", borderRadius: '6px', padding: '3px 12px', fontSize: '12px', cursor: 'pointer',
            }}>+ Add Row</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px 32px', gap: '6px', marginBottom: '4px' }}>
            {['User ID', 'Name (optional)', 'War Hits', ''].map(h => (
              <span key={h} style={{ fontSize: '10px', color: "var(--text-faint)", textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '2px' }}>{h}</span>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {members.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px 32px', gap: '6px', alignItems: 'center' }}>
                <input type="number" min="1" value={r.id} onChange={e => updateRow(i, 'id', e.target.value)}
                  placeholder="e.g. 2741093" style={{ ...inputStyle, textAlign: 'center' }} />
                <input type="text" value={r.name} onChange={e => updateRow(i, 'name', e.target.value)}
                  placeholder="Username" style={inputStyle} />
                <input type="number" min="0" value={r.hits} onChange={e => updateRow(i, 'hits', e.target.value)}
                  placeholder="Hits" style={{ ...inputStyle, textAlign: 'center' }} />
                <button onClick={() => removeRow(i)} disabled={members.length === 1} style={{
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: "var(--text-faint)",
                  borderRadius: '6px', cursor: members.length === 1 ? 'default' : 'pointer',
                  fontSize: '14px', lineHeight: 1, padding: '6px',
                }}>✕</button>
              </div>
            ))}
          </div>
        </div>

        {error && <p style={{ color: '#f87171', fontSize: '12px', marginBottom: '10px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 18px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: "var(--text-secondary)",
          }}>Cancel</button>
          <button onClick={submit} disabled={saving} style={{
            padding: '8px 20px', borderRadius: '8px', fontSize: '13px', cursor: saving ? 'not-allowed' : 'pointer',
            background: 'rgba(179,18,63,0.15)', border: '1px solid rgba(179,18,63,0.4)', color: '#f4f4f5', fontWeight: '600',
            opacity: saving ? 0.6 : 1,
          }}>{saving ? 'Saving…' : 'Save War'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-tab bar ──────────────────────────────────────────────────────────────

function SubTabs({ options, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' }}>
      {options.map((opt) => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          style={{
            padding: '7px 18px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s',
            border: `1px solid ${active === opt.value ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
            background: active === opt.value ? 'rgba(179,18,63,0.15)' : 'transparent',
            color: active === opt.value ? '#f4f4f5' : "var(--text-secondary)",
            fontWeight: active === opt.value ? '600' : '400',
          }}
          onMouseEnter={(e) => { if (active !== opt.value) e.currentTarget.style.color = '#f4f4f5' }}
          onMouseLeave={(e) => { if (active !== opt.value) e.currentTarget.style.color = "var(--text-secondary)" }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function WarTrackingTab() {
  const [factionId,  setFactionId]  = useState(33097)
  const [showManual, setShowManual] = useState(false)
  const [reloadKey,  setReloadKey]  = useState(0)
  const factionTabs = FACTIONS.map((f) => ({ value: f.id, label: f.name }))

  return (
    <div>
      {showManual && (
        <ManualWarEntry
          onClose={() => setShowManual(false)}
          onSaved={() => setReloadKey(k => k + 1)}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
        <p style={{ color: "var(--text-secondary)", fontSize: '13px', margin: 0 }}>
          Wars are auto-detected weekly and attack data
          is tracked every 10 minutes during active wars.
        </p>
        <button onClick={() => setShowManual(true)} style={{
          padding: '7px 16px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: "var(--text-secondary)",
        }}>+ Add Historic War</button>
      </div>
      <SubTabs options={factionTabs} active={factionId} onChange={setFactionId} />
      <FactionWars key={`${factionId}-${reloadKey}`} factionId={factionId} />
    </div>
  )
}
