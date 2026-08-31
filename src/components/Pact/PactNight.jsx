import { useState, useEffect } from 'react'
import PactDie from './PactDie.jsx'

const LETTERS = ['A', 'B', 'C', 'D']

export default function PactNight({
  night, committed, yourVote, votes, mode, progress, lastOutcome, busy, onVote,
}) {
  const [selected, setSelected] = useState(yourVote || null)
  useEffect(() => { setSelected(yourVote || null) }, [yourVote, night?.night])

  // ── committed: show the outcome / waiting gate ──
  if (committed) {
    const waiting = progress && progress.committed < progress.total
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        {lastOutcome?.band && (
          <div style={{ marginBottom: 20 }}>
            <PactDie face={lastOutcome.face} band={lastOutcome.band} nonce={night?.night} size={110} />
          </div>
        )}
        <h3 className="font-cinzel" style={{ letterSpacing: 2, color: '#ece7f4', fontSize: 18 }}>
          {lastOutcome?.broke ? 'The Pact is Broken'
            : lastOutcome?.failed ? 'The ritual failed'
            : 'The choice is made'}
        </h3>
        {lastOutcome?.note && (
          <p style={{ color: '#a49bbd', fontStyle: 'italic', maxWidth: 440, margin: '8px auto 0' }}>
            {lastOutcome.note}
          </p>
        )}
        {waiting && !lastOutcome?.broke && (
          <p style={{ color: '#6f6689', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, marginTop: 18 }}>
            waiting on {progress.total - progress.committed} other cabal{progress.total - progress.committed === 1 ? '' : 's'}…
          </p>
        )}
      </div>
    )
  }

  if (!night) return null
  const tally = votes || {}

  return (
    <div>
      <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: 2,
          textTransform: 'uppercase', color: night.rollsDice ? '#c01d47' : '#6f6689',
        }}>
          Night {night.night}{night.rollsDice ? " · Fate's Dice" : ''}
        </span>
      </div>
      <h2 className="font-cinzel" style={{ letterSpacing: 2, color: '#ece7f4', fontSize: 22, margin: '0 0 10px' }}>
        {night.title}
      </h2>
      <p style={{ color: '#ded7ea', lineHeight: 1.7, marginBottom: 18 }}>{night.body}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {LETTERS.map((k) => {
          const opt = night.options[k]
          if (!opt) return null
          const isSel = selected === k
          const n = tally[k] || 0
          return (
            <button
              key={k}
              onClick={() => setSelected(k)}
              disabled={busy}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                width: '100%', minHeight: 52, padding: '12px 14px',
                background: isSel ? 'rgba(192,29,71,0.14)' : '#151220',
                border: `1px solid ${isSel ? '#c01d47' : '#302943'}`,
                borderRadius: 10, color: '#ece7f4', cursor: busy ? 'default' : 'pointer',
                font: 'inherit', fontSize: 15,
              }}
            >
              <span style={{
                fontFamily: 'Cinzel, serif', color: isSel ? '#c01d47' : '#6f6689',
                fontSize: 15, width: 16, flexShrink: 0,
              }}>{k}</span>
              <span style={{ flex: 1 }}>{opt.label}</span>
              {mode === 'team' && n > 0 && (
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#a49bbd',
                  background: '#1d1830', borderRadius: 10, padding: '1px 7px', flexShrink: 0,
                }}>{n}</span>
              )}
            </button>
          )
        })}
      </div>

      <button
        onClick={() => selected && onVote(selected)}
        disabled={!selected || busy}
        style={{
          marginTop: 16, width: '100%', padding: '12px 0',
          background: selected && !busy ? 'linear-gradient(135deg,#c01d47cc,#c01d4788)' : '#1d1830',
          border: `1px solid ${selected && !busy ? '#c01d4760' : '#302943'}`,
          borderRadius: 8, color: selected && !busy ? '#fff' : '#6f6689',
          fontSize: 13, fontWeight: 600, letterSpacing: 1,
          cursor: selected && !busy ? 'pointer' : 'default',
        }}
      >
        {busy ? '…' : mode === 'team'
          ? (yourVote ? 'Change your vote' : 'Cast your vote')
          : 'Commit — the night turns'}
      </button>
      {mode === 'team' && (
        <p style={{ color: '#6f6689', fontSize: 11, textAlign: 'center', marginTop: 8 }}>
          the cabal commits once every member has voted · ties are broken by Fate
        </p>
      )}
    </div>
  )
}
