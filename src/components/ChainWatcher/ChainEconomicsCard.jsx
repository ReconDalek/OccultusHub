import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiSend } from './chainWatcherUtils'
import CollapsibleCard from './CollapsibleCard'

const REFRESH_MS = 30000

function fmt(n, dp = 0) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

function Stat({ label, value, accent }) {
  return (
    <div style={{
      background: accent ? 'rgba(56,189,248,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${accent ? 'rgba(56,189,248,0.25)' : 'var(--border-subtle)'}`,
      borderRadius: 8, padding: '8px 12px',
    }}>
      <p style={{ color: 'var(--text-faint)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 3px' }}>{label}</p>
      <p style={{ color: accent ? '#38bdf8' : '#f4f4f5', fontSize: 15, fontWeight: 700, margin: 0 }}>{value}</p>
    </div>
  )
}

function SortArrow({ dir }) {
  if (!dir) return null
  return <span style={{ fontSize: 9, marginLeft: 3 }}>{dir === 'asc' ? '▲' : '▼'}</span>
}

const COLUMNS = [
  { key: 'username',            label: 'Member',              align: 'left' },
  { key: 'attacks',              label: 'Attacks' },
  { key: 'energy_out',           label: 'Energy Out' },
  { key: 'faction_energy_in',    label: 'Faction In' },
  { key: 'personal_energy_in',   label: 'Personal In' },
  { key: 'combined_energy_in',   label: 'Combined In' },
  { key: 'overdoses',            label: 'OD' },
]

function MemberTable({ members }) {
  const [sortKey, setSortKey] = useState('attacks')
  const [sortDir, setSortDir] = useState('desc')

  if (!members || members.length === 0) {
    return <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No tracked activity yet.</p>
  }

  const rows = [...members]
  const mul = sortDir === 'asc' ? 1 : -1
  rows.sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey]
    if (typeof av === 'string' || typeof bv === 'string') return mul * String(av ?? '').localeCompare(String(bv ?? ''))
    return mul * ((av ?? 0) - (bv ?? 0))
  })

  const toggleSort = (key) => {
    if (sortKey !== key) { setSortKey(key); setSortDir(key === 'username' ? 'asc' : 'desc'); return }
    setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
  }

  const cols = '1fr 70px 90px 90px 90px 100px 50px'

  return (
    <div className="table-scroll">
      <div style={{ minWidth: 640, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, padding: '4px 10px', gap: 8 }}>
          {COLUMNS.map(col => (
            <span
              key={col.key}
              onClick={() => toggleSort(col.key)}
              title="Click to sort"
              style={{
                color: 'var(--text-secondary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em',
                cursor: 'pointer', userSelect: 'none', textAlign: col.align === 'left' ? 'left' : 'right',
              }}
            >
              {col.label}<SortArrow dir={sortKey === col.key ? sortDir : null} />
            </span>
          ))}
        </div>
        {rows.map((m, i) => (
          <div
            key={m.torn_user_id}
            style={{
              display: 'grid', gridTemplateColumns: cols, alignItems: 'center', gap: 8,
              padding: '7px 10px', borderRadius: 7, background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
            }}
          >
            <span style={{ color: '#f4f4f5', fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.username}
            </span>
            <span style={{ color: '#f4f4f5', fontSize: 12.5, fontWeight: 700, textAlign: 'right' }}>{fmt(m.attacks)}</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12.5, textAlign: 'right' }}>{fmt(m.energy_out)}</span>
            <span style={{ color: m.faction_energy_in > 0 ? '#38bdf8' : 'var(--text-muted)', fontSize: 12.5, textAlign: 'right' }}>{fmt(m.faction_energy_in)}</span>
            <span style={{ color: m.personal_energy_in > 0 ? '#a78bfa' : 'var(--text-muted)', fontSize: 12.5, textAlign: 'right' }}>{fmt(m.personal_energy_in)}</span>
            <span style={{ color: m.combined_energy_in > 0 ? '#4ade80' : 'var(--text-muted)', fontSize: 12.5, fontWeight: 600, textAlign: 'right' }}>{fmt(m.combined_energy_in)}</span>
            <span style={{ color: m.overdoses > 0 ? '#ef4444' : 'var(--text-muted)', fontSize: 12.5, textAlign: 'right' }}>{fmt(m.overdoses)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BackfillButton({ factionId, backfillStatus, backfillNote, onDone }) {
  const [busy, setBusy] = useState(false)
  const running = busy || backfillStatus === 'running'

  const run = async () => {
    setBusy(true)
    try {
      await apiSend('/api/chain-watcher/economics/backfill', 'POST', { faction_id: factionId })
    } catch {
      // surfaced via backfillNote on the next poll either way
    } finally {
      setBusy(false)
      onDone?.()
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
      <button
        onClick={run}
        disabled={running}
        style={{
          fontSize: 12, padding: '6px 14px', borderRadius: 7, cursor: running ? 'default' : 'pointer',
          background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8',
          opacity: running ? 0.6 : 1,
        }}
      >
        {running ? 'Backfilling…' : 'Backfill from chain start'}
      </button>
      {backfillNote && (
        <span style={{ fontSize: 11.5, color: backfillStatus === 'error' ? '#f87171' : 'var(--text-faint)' }}>
          {backfillNote}
        </span>
      )}
    </div>
  )
}

function ChainEconomicsBody({ factionId, isLeader }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const json = await apiGet(`/api/chain-watcher/economics?faction_id=${factionId}`)
      setData(json)
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [factionId])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  if (error) return <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>
  if (!data) return <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Loading…</p>
  if (!data.session) return <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No chain tracked yet for this faction.</p>

  const t = data.totals || {}

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginBottom: 14 }}>
        <Stat label="Attacks" value={fmt(t.attacks)} />
        <Stat label="Energy Out" value={fmt(t.energy_out)} />
        <Stat label="Faction In" value={fmt(t.faction_energy_in)} accent />
        <Stat label="Personal In" value={fmt(t.personal_energy_in)} />
        <Stat label="Combined In" value={fmt(t.combined_energy_in)} />
        <Stat label="ODs" value={fmt(t.overdoses)} />
      </div>

      <MemberTable members={data.members} />

      <p style={{ fontSize: 10.5, color: 'var(--text-ghost)', marginTop: 10, lineHeight: 1.5 }}>
        Faction In = Xanax/energy cans withdrawn from the faction armory. Personal In = Xanax/energy drinks from each
        member's own personal stats, minus whatever's already counted as Faction In. Personal figures only update once
        a day (personal stats snapshot once daily) — a chain that starts and ends the same day may show 0 there until
        the next day's snapshot lands.
      </p>

      {isLeader && (
        <BackfillButton
          factionId={factionId}
          backfillStatus={data.backfillStatus}
          backfillNote={data.backfillNote}
          onDone={load}
        />
      )}
    </>
  )
}

export default function ChainEconomicsCard({ factionId, isLeader = false }) {
  return (
    <CollapsibleCard title="Chain Economics" defaultCollapsed>
      <ChainEconomicsBody factionId={factionId} isLeader={isLeader} />
    </CollapsibleCard>
  )
}
