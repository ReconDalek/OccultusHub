import { useState, useEffect } from 'react'

const LETTERS = ['A', 'B', 'C', 'D']

const STAT = {
  gold: { glyph: '☩', color: '#d8a53a' },
  offerings: { glyph: '⛧', color: '#8b5cf6' },
  dominion: { glyph: '✦', color: '#c01d47' },
  thralls: { glyph: '☾', color: '#c9b6f0' },
}
const BAND_LABEL = { 'ill-fortune': 'Ill Fortune', 'the-turning': 'The Turning', 'favour': 'Favour' }
const BAND_COLOR = { 'ill-fortune': '#d9484f', 'the-turning': '#a49bbd', 'favour': '#3fb98a' }
const sign = (n) => (n > 0 ? '+' : '') + n

// renders the non-zero stat deltas of an outcome { gold, offerings, dominion, thralls }
export function OutcomeTags({ o, size = 11 }) {
  const tags = ['gold', 'offerings', 'dominion', 'thralls'].filter((k) => o?.[k])
  if (!tags.length) return <span style={{ color: '#6f6689', fontSize: size }}>no change</span>
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 5 }}>
      {tags.map((k) => (
        <span key={k} style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: size, letterSpacing: 0.3,
          color: STAT[k].color, background: '#0c0a11',
          border: `1px solid ${STAT[k].color}33`, borderRadius: 6, padding: '1px 6px',
        }}>
          {STAT[k].glyph} {sign(o[k])}
        </span>
      ))}
    </span>
  )
}

function OptionOutcomes({ opt, rollsDice }) {
  return (
    <div style={{ marginTop: 7 }}>
      {rollsDice ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {opt.outcomes.map((row) => (
            <div key={row.band} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{
                fontFamily: 'Cinzel, serif', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
                color: BAND_COLOR[row.band], minWidth: 78, flexShrink: 0,
              }}>{BAND_LABEL[row.band]}</span>
              <OutcomeTags o={row} />
            </div>
          ))}
        </div>
      ) : (
        <OutcomeTags o={opt.outcome} />
      )}

      {opt.delayed && (
        <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {opt.delayed.outcomes.map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 10, flexShrink: 0, minWidth: 78,
                color: row.band ? BAND_COLOR[row.band] : '#d8a53a',
              }}>
                ⏳ n{opt.delayed.on}{row.band ? ` · ${BAND_LABEL[row.band]}` : ''}
              </span>
              <OutcomeTags o={row} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PactNight({
  night, committed, yourVote, votes, mode, progress, busy, onVote,
}) {
  const [selected, setSelected] = useState(yourVote || null)
  useEffect(() => { setSelected(yourVote || null) }, [yourVote, night?.night])

  if (committed) {
    const left = progress ? progress.total - progress.committed : 0
    return (
      <div style={{ textAlign: 'center', padding: '28px 0', color: '#a49bbd' }}>
        <p>Your choice is locked in.</p>
        {left > 0 && (
          <p style={{ color: '#6f6689', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, marginTop: 10 }}>
            waiting on {left} other cabal{left === 1 ? '' : 's'}…
          </p>
        )}
      </div>
    )
  }

  if (!night) return null
  const tally = votes || {}

  return (
    <div>
      <div style={{ marginBottom: 6 }}>
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
      <p style={{ color: '#ded7ea', lineHeight: 1.7, marginBottom: night.rollsDice ? 8 : 18 }}>{night.body}</p>
      {night.rollsDice && (
        <p style={{ color: '#6f6689', fontSize: 12, fontStyle: 'italic', marginBottom: 16 }}>
          Each option lists what the die gives on <span style={{ color: '#d9484f' }}>Ill Fortune</span>,{' '}
          <span style={{ color: '#a49bbd' }}>The Turning</span>, and <span style={{ color: '#3fb98a' }}>Favour</span>.
          You won't know which until you commit.
        </p>
      )}

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
                display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left',
                width: '100%', padding: '12px 14px',
                background: isSel ? 'rgba(192,29,71,0.14)' : '#151220',
                border: `1px solid ${isSel ? '#c01d47' : '#302943'}`,
                borderRadius: 10, color: '#ece7f4', cursor: busy ? 'default' : 'pointer',
                font: 'inherit', fontSize: 15,
              }}
            >
              <span style={{
                fontFamily: 'Cinzel, serif', color: isSel ? '#c01d47' : '#6f6689',
                fontSize: 15, width: 16, flexShrink: 0, marginTop: 1,
              }}>{k}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                {opt.label}
                <OptionOutcomes opt={opt} rollsDice={night.rollsDice} />
              </span>
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
          : night.rollsDice ? 'Commit — and cast Fate\'s Dice' : 'Commit — the night turns'}
      </button>
      {mode === 'team' && (
        <p style={{ color: '#6f6689', fontSize: 11, textAlign: 'center', marginTop: 8 }}>
          the cabal commits once every member has voted · ties are broken by Fate
        </p>
      )}
    </div>
  )
}
