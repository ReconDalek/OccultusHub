import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../config/api'

const FACTIONS = [
  { id: 33097, name: 'Occultus' },
  { id: 9728, name: 'Occul2us' },
  { id: 9171, name: 'Occul3us' },
]

// Ticks every 30s so a card automatically drops a passed-date event and
// moves on to the next one without needing a page reload.
function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function useCountdown(targetDate) {
  const [timeLeft, setTimeLeft] = useState(null)

  useEffect(() => {
    if (!targetDate) { setTimeLeft(null); return }
    const calc = () => {
      const diff = new Date(targetDate) - Date.now()
      if (diff <= 0) { setTimeLeft(null); return }
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      })
    }
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [targetDate])

  return timeLeft
}

function TimeUnit({ value, label }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'monospace', lineHeight: 1, color: '#f4f4f5' }}>
        {String(value).padStart(2, '0')}
      </div>
      <div style={{ fontSize: '11px', color: "var(--text-secondary)", marginTop: '3px', letterSpacing: '0.5px' }}>{label}</div>
    </div>
  )
}

function CountdownDisplay({ targetDate }) {
  const t = useCountdown(targetDate)
  if (!t) return <span style={{ color: "var(--text-secondary)", fontSize: '14px' }}>Starting soon…</span>
  return (
    <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end' }}>
      {t.days > 0 && <TimeUnit value={t.days} label="d" />}
      <TimeUnit value={t.hours} label="h" />
      <TimeUnit value={t.minutes} label="m" />
      <TimeUnit value={t.seconds} label="s" />
    </div>
  )
}

function TypeBadge({ type, stage }) {
  const isChain = type === 'chain'
  const isEnlisting = stage === 'enlisting'
  return (
    <span style={{
      display: 'inline-block',
      alignSelf: 'flex-start',
      fontSize: '11px',
      fontWeight: 700,
      padding: '3px 12px',
      borderRadius: '20px',
      background: isChain
        ? 'linear-gradient(135deg, #6d28d9, #4c1d95)'
        : isEnlisting
          ? 'linear-gradient(135deg, #555, #333)'
          : 'linear-gradient(135deg, #b3123f, #7f1d1d)',
      color: '#f4f4f5',
      textTransform: 'uppercase',
      letterSpacing: '1px',
    }}>
      {isChain ? '⛓ Chain' : isEnlisting ? '⚔ War — Enlisting' : '⚔ War'}
    </span>
  )
}

function ActiveWarBadge() {
  return (
    <span style={{
      display: 'inline-block',
      alignSelf: 'flex-start',
      fontSize: '11px',
      fontWeight: 700,
      padding: '3px 12px',
      borderRadius: '20px',
      background: 'linear-gradient(135deg, #b3123f, #7f1d1d)',
      color: '#f4f4f5',
      textTransform: 'uppercase',
      letterSpacing: '1px',
    }}>
      ⚔ War Active
    </span>
  )
}

// Picks the next event for a faction — whichever of its scheduled chains or
// wars has the soonest still-future scheduled_at. An enlisting war with no
// scheduled_at yet (opponent/start time not known) only shows once nothing
// with an actual date is upcoming, since there's no date to compare it by.
function pickNextEvent(schedules, factionId, now) {
  const candidates = schedules.filter((s) => s.faction_id === factionId)

  const dated = candidates
    .filter((s) => s.scheduled_at && new Date(s.scheduled_at).getTime() > now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
  if (dated.length) return dated[0]

  return candidates.find((s) => s.stage === 'enlisting' && !s.scheduled_at) || null
}

function FactionCard({ faction, schedules, activeWar, now }) {
  // While Torn's own war tracking shows this faction in an active war, that
  // takes over the card entirely — the next scheduled chain/war (if any)
  // only resumes once war tracking marks the war ended.
  if (activeWar) {
    return (
      <div style={{
        padding: '24px', borderRadius: '16px', background: 'rgba(22,22,32,0.82)',
        border: '1px solid rgba(179,18,63,0.3)', display: 'flex', flexDirection: 'column', gap: '12px',
      }}>
        <div style={{ fontSize: '11px', color: "var(--text-secondary)", letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 500 }}>
          {faction.name}
        </div>
        <ActiveWarBadge />
        {activeWar.opponent_faction_id && (
          <div style={{ fontSize: '13px', color: "var(--text-secondary)" }}>
            vs{' '}
            <a
              href={`https://www.torn.com/factions.php?step=profile&ID=${activeWar.opponent_faction_id}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#e05577', fontWeight: 600, textDecoration: 'none' }}
              onMouseEnter={(e) => (e.target.style.textDecoration = 'underline')}
              onMouseLeave={(e) => (e.target.style.textDecoration = 'none')}
            >
              {activeWar.opponent_faction_name ? `${activeWar.opponent_faction_name} #${activeWar.opponent_faction_id}` : `Faction #${activeWar.opponent_faction_id}`}
            </a>
          </div>
        )}
        {(activeWar.our_score != null && activeWar.opponent_score != null) && (
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#f4f4f5', fontFamily: 'monospace' }}>
            {activeWar.our_score} <span style={{ color: "var(--text-secondary)", fontSize: '14px' }}>vs</span> {activeWar.opponent_score}
          </div>
        )}
      </div>
    )
  }

  const next = pickNextEvent(schedules, faction.id, now)

  const tct = next?.scheduled_at
    ? new Date(next.scheduled_at).toLocaleString('en-GB', {
        timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      }) + ' TCT'
    : null

  return (
    <div style={{
      padding: '24px',
      borderRadius: '16px',
      background: 'rgba(22,22,32,0.82)',
      border: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      <div style={{ fontSize: '11px', color: "var(--text-secondary)", letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 500 }}>
        {faction.name}
      </div>

      {next ? (
        <>
          <TypeBadge type={next.type} stage={next.stage} />

          {/* Chain target */}
          {next.type === 'chain' && next.chain_target && (
            <div style={{ fontSize: '13px', color: "var(--text-secondary)" }}>
              Target: <span style={{ color: '#f4f4f5', fontWeight: 600 }}>{next.chain_target}</span>
            </div>
          )}

          {/* War opponent */}
          {next.type === 'war' && next.stage === 'active' && next.opponent_faction_id && (
            <div style={{ fontSize: '13px', color: "var(--text-secondary)" }}>
              vs{' '}
              <a
                href={`https://www.torn.com/factions.php?step=profile&ID=${next.opponent_faction_id}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#e05577', fontWeight: 600, textDecoration: 'none' }}
                onMouseEnter={(e) => (e.target.style.textDecoration = 'underline')}
                onMouseLeave={(e) => (e.target.style.textDecoration = 'none')}
              >
                {next.opponent_faction_name ? `${next.opponent_faction_name} #${next.opponent_faction_id}` : `Faction #${next.opponent_faction_id}`}
              </a>
            </div>
          )}

          {/* Enlisting with no date yet — show a placeholder, no countdown */}
          {next.stage === 'enlisting' && !next.scheduled_at ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: '12px', color: "var(--text-secondary)" }}>Awaiting opponent &amp; start time.</div>
            </div>
          ) : (
            <>
              <CountdownDisplay targetDate={next.scheduled_at} />
              {tct && <div style={{ fontSize: '12px', color: "var(--text-secondary)" }}>{tct}</div>}
            </>
          )}
        </>
      ) : (
        <p style={{ color: "var(--text-secondary)", fontSize: '14px', margin: 0 }}>
          No upcoming events scheduled.
        </p>
      )}
    </div>
  )
}

export default function FactionEventCards() {
  const [schedules, setSchedules] = useState([])
  const [activeWars, setActiveWars] = useState({}) // faction_id -> ranked_wars row (status === 'active')
  const [loading, setLoading] = useState(true)
  const now = useNow()

  useEffect(() => {
    const token = localStorage.getItem('occultusSession')
    const headers = token ? { Authorization: token } : {}

    const load = () => {
      Promise.all([
        fetch(`${API_BASE_URL}/api/faction-schedules`, { headers }).then((r) => r.json()),
        fetch(`${API_BASE_URL}/api/wars/summary`, { headers }).then((r) => r.json()),
      ]).then(([scheduleData, warData]) => {
        setSchedules(scheduleData.schedules || [])
        const active = {}
        for (const faction of FACTIONS) {
          const rows = warData.summary?.[faction.id] || []
          const activeRow = rows.find((w) => w.status === 'active')
          if (activeRow) active[faction.id] = activeRow
        }
        setActiveWars(active)
        setLoading(false)
      }).catch(() => setLoading(false))
    }

    load()
    // War tracking's own cron runs every 10 minutes — poll a little faster
    // than that so "war ended" transitions show up without a page reload.
    const id = setInterval(load, 120000)
    return () => clearInterval(id)
  }, [])

  if (loading) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
      {FACTIONS.map((f) => (
        <FactionCard key={f.id} faction={f} schedules={schedules} activeWar={activeWars[f.id]} now={now} />
      ))}
    </div>
  )
}
