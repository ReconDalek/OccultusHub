import { useEffect, useState } from 'react'
import { computeWatcherStatus, fmtDuration, card, sectionTitle } from './chainWatcherUtils'

export default function WatcherBanner({ shifts }) {
  const [now, setNow] = useState(() => Date.now() / 1000)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000)
    return () => clearInterval(t)
  }, [])

  const { current, next, nextChangeAt } = computeWatcherStatus(shifts, now)

  return (
    <div style={card}>
      <p style={sectionTitle}>Watch Shift</p>
      <div className="flex items-center" style={{ gap: 28, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Currently watching
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: current ? '#f4f4f5' : 'var(--text-faint)' }}>
            {current ? current.username : 'Unassigned'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Next watcher
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: next ? '#f4f4f5' : 'var(--text-faint)' }}>
            {next ? next.username : 'Unassigned'}
          </div>
        </div>
        {nextChangeAt && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Handoff in
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f4f4f5' }}>{fmtDuration(nextChangeAt - now)}</div>
          </div>
        )}
      </div>
    </div>
  )
}
