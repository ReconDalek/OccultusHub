import { useEffect, useState } from 'react'
import { apiGet, fmtDuration, card, sectionTitle } from './chainWatcherUtils'

const POLL_MS = 20000

export default function LiveChainCard({ factionId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const json = await apiGet(`/api/chain-watcher/live?faction_id=${factionId}`)
        if (!cancelled) { setData(json); setError(null) }
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    }
    load()
    const poll = setInterval(load, POLL_MS)
    return () => { cancelled = true; clearInterval(poll) }
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
      <p style={sectionTitle}>Live Chain</p>

      {data.status === 'idle' && (
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
