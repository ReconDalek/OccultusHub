import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../config/api'

const FACTIONS = [
  { id: 33097, name: 'Occultus' },
  { id: 9728, name: 'Occul2us' },
  { id: 9171, name: 'Occul3us' },
]

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
      <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '3px', letterSpacing: '0.5px' }}>{label}</div>
    </div>
  )
}

function CountdownDisplay({ targetDate }) {
  const t = useCountdown(targetDate)
  if (!t) return <span style={{ color: '#a1a1aa', fontSize: '14px' }}>Starting soon…</span>
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

function FactionCard({ faction, schedules }) {
  const now = Date.now()

  // Pick the most relevant event for this faction:
  // Prefer enlisting wars first, then soonest scheduled
  const relevant = schedules
    .filter((s) => s.faction_id === faction.id)
    .filter((s) => s.stage === 'enlisting' || (s.scheduled_at && new Date(s.scheduled_at) > now))
    .sort((a, b) => {
      if (a.stage === 'enlisting' && b.stage !== 'enlisting') return -1
      if (b.stage === 'enlisting' && a.stage !== 'enlisting') return 1
      return new Date(a.scheduled_at) - new Date(b.scheduled_at)
    })

  const next = relevant[0] || null

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
      <div style={{ fontSize: '11px', color: '#a1a1aa', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 500 }}>
        {faction.name}
      </div>

      {next ? (
        <>
          <TypeBadge type={next.type} stage={next.stage} />

          {/* Chain target */}
          {next.type === 'chain' && next.chain_target && (
            <div style={{ fontSize: '13px', color: '#a1a1aa' }}>
              Target: <span style={{ color: '#f4f4f5', fontWeight: 600 }}>{next.chain_target}</span>
            </div>
          )}

          {/* War opponent */}
          {next.type === 'war' && next.stage === 'active' && next.opponent_faction_id && (
            <div style={{ fontSize: '13px', color: '#a1a1aa' }}>
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

          {/* Enlisting — show enlistment date, no countdown */}
          {next.stage === 'enlisting' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {next.scheduled_at && (
                <div style={{ fontSize: '13px', color: '#f4f4f5', fontWeight: 600 }}>
                  Enlistment:{' '}
                  {new Date(next.scheduled_at).toLocaleDateString('en-GB', {
                    timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric',
                  })}
                </div>
              )}
              <div style={{ fontSize: '12px', color: '#a1a1aa' }}>Awaiting opponent &amp; start time.</div>
            </div>
          ) : (
            <>
              <CountdownDisplay targetDate={next.scheduled_at} />
              {tct && <div style={{ fontSize: '12px', color: '#a1a1aa' }}>{tct}</div>}
            </>
          )}
        </>
      ) : (
        <p style={{ color: '#a1a1aa', fontSize: '14px', margin: 0 }}>
          No upcoming events scheduled.
        </p>
      )}
    </div>
  )
}

export default function FactionEventCards() {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('occultusSession')
    fetch(`${API_BASE_URL}/api/faction-schedules`, {
      headers: token ? { Authorization: token } : {},
    })
      .then((r) => r.json())
      .then((data) => { setSchedules(data.schedules || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
      {FACTIONS.map((f) => (
        <FactionCard key={f.id} faction={f} schedules={schedules} />
      ))}
    </div>
  )
}
