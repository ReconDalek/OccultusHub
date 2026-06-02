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

function TimeUnit({ value, label }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '30px', fontWeight: 700, fontFamily: 'monospace', lineHeight: 1, color: '#f4f4f5' }}>
        {String(value).padStart(2, '0')}
      </div>
      <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '3px', letterSpacing: '0.5px' }}>{label}</div>
    </div>
  )
}

function FactionCard({ faction, schedules }) {
  const now = Date.now()
  const next = schedules
    .filter((s) => s.faction_id === faction.id && new Date(s.scheduled_at) > now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0] || null

  const isChain = next?.type === 'chain'

  return (
    <div
      style={{
        padding: '24px',
        borderRadius: '16px',
        background: 'rgba(22,22,32,0.82)',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div style={{ fontSize: '11px', color: '#a1a1aa', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 500 }}>
        {faction.name}
      </div>

      {next ? (
        <>
          <span
            style={{
              display: 'inline-block',
              alignSelf: 'flex-start',
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 12px',
              borderRadius: '20px',
              background: isChain
                ? 'linear-gradient(135deg, #6d28d9, #4c1d95)'
                : 'linear-gradient(135deg, #b3123f, #7f1d1d)',
              color: '#f4f4f5',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            {isChain ? '⛓ Chain' : '⚔ War'}
          </span>

          <CountdownDisplay targetDate={next.scheduled_at} />

          <div style={{ fontSize: '12px', color: '#a1a1aa' }}>
            {new Date(next.scheduled_at).toLocaleString('en-GB', {
              timeZone: 'UTC',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            TCT
          </div>
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
