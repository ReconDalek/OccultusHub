import { useEffect, useState } from 'react'
import { apiGet, fmtDuration, card, sectionTitle } from './chainWatcherUtils'

const POLL_MS = 20000
const FAST_POLL_MS = 5000
const FAST_POLL_THRESHOLD = 120 // seconds left before a chain drops — poll tighter once attacks matter most

export default function LiveChainCard({ factionId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(Date.now())

  // Self-scheduling rather than a fixed interval, so the poll rate can tighten
  // up as a chain gets close to timing out — each attack resets Torn's own
  // timeout server-side, and polling faster near zero keeps the live display
  // from lagging behind a reset by a full normal poll cycle.
  useEffect(() => {
    let cancelled = false
    let timer = null

    async function load() {
      let nextDelay = POLL_MS
      try {
        const json = await apiGet(`/api/chain-watcher/live?faction_id=${factionId}`)
        if (cancelled) return
        setData(json)
        setError(null)
        if (json.status === 'active' && json.timeout <= FAST_POLL_THRESHOLD) nextDelay = FAST_POLL_MS
      } catch (e) {
        if (cancelled) return
        setError(e.message)
      }
      if (!cancelled) timer = setTimeout(load, nextDelay)
    }

    load()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [factionId])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  if (error) {
    return (
      <div style={card}>
        <p style={sectionTitle}>Live Chain</p>
        <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={card}>
        <p style={sectionTitle}>Live Chain</p>
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Loading…</p>
      </div>
    )
  }

  const elapsedSincePoll = Math.max(0, (now - data.fetchedAt * 1000) / 1000)
  const liveTimeout = data.status === 'active' ? Math.max(0, data.timeout - elapsedSincePoll) : 0
  const liveCooldown = data.status === 'cooldown' ? Math.max(0, data.cooldown - elapsedSincePoll) : 0
  const urgent = data.status === 'active' && liveTimeout <= 90

  return (
    <div style={{ ...card, border: urgent ? '1px solid #f87171' : card.border }}>
      <p style={sectionTitle}>
        Live Chain
        {data.isTest && (
          <span style={{
            marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: '#f4f4f5', background: '#8b5cf6',
            borderRadius: 5, padding: '2px 7px', verticalAlign: 'middle', letterSpacing: '0.04em',
          }}>
            TEST
          </span>
        )}
      </p>

      {(data.status === 'idle' || data.status === 'no_session') && (
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No chain currently running.</p>
      )}

      {data.status === 'cooldown' && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Chain ended — cooldown for <strong>{fmtDuration(liveCooldown)}</strong>
        </p>
      )}

      {data.status === 'active' && (
        <div className="flex items-center" style={{ gap: 28, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hits</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#f4f4f5' }}>{data.current.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time left</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: urgent ? '#f87171' : '#f4f4f5' }}>{fmtDuration(liveTimeout)}</div>
          </div>
          {urgent && (
            <div style={{ fontSize: 13, color: '#f87171', fontWeight: 600, alignSelf: 'center' }}>
              Chain is about to drop — attack now!
            </div>
          )}
        </div>
      )}
    </div>
  )
}
