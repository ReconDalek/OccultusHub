import { useState } from 'react'

const RES = [
  { key: 'gold', label: 'Gold', glyph: '☩', color: '#d8a53a', cap: null },
  { key: 'offerings', label: 'Offerings', glyph: '⛧', color: '#8b5cf6', cap: 90 },
  { key: 'dominion', label: 'Dominion', glyph: '✦', color: '#c01d47', cap: null },
  { key: 'thralls', label: 'Thralls', glyph: '☾', color: '#c9b6f0', cap: null },
]

function fmtDelta(n) {
  if (!n) return null
  return (n > 0 ? '+' : '') + n
}

export default function PactTracker({ cabal, night }) {
  const [openLedger, setOpenLedger] = useState(false)
  if (!cabal) return null
  const ledger = cabal.ledger || []

  return (
    <div style={{
      position: 'sticky', top: 8, zIndex: 5,
      background: 'rgba(13,10,17,0.92)', backdropFilter: 'blur(6px)',
      border: '1px solid #302943', borderRadius: 12, padding: '12px 14px',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontFamily: 'Cinzel, serif', letterSpacing: 2, fontSize: 13, color: '#ece7f4' }}>
          {cabal.name}
        </span>
        {night != null && (
          <span style={{ fontSize: 11, letterSpacing: 1, color: '#6f6689', fontFamily: 'JetBrains Mono, monospace' }}>
            NIGHT {night} / 18
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {RES.map((r) => (
          <div key={r.key} style={{
            background: '#151220', border: '1px solid #302943', borderRadius: 8,
            padding: '8px 6px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, color: r.color, lineHeight: 1 }}>{r.glyph}</div>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 15, fontWeight: 600,
              color: '#fff', marginTop: 3,
            }}>
              {cabal[r.key]}{r.cap ? <span style={{ color: '#6f6689', fontSize: 11 }}>/{r.cap}</span> : null}
            </div>
            <div style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: '#6f6689', marginTop: 1 }}>
              {r.label}
            </div>
          </div>
        ))}
      </div>

      {ledger.length > 0 && (
        <>
          <button
            onClick={() => setOpenLedger((v) => !v)}
            style={{
              marginTop: 10, width: '100%', background: 'transparent', border: 'none',
              color: '#a49bbd', fontSize: 11, letterSpacing: 1, cursor: 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            {openLedger ? '▾ hide the ledger' : `▸ the ledger (${ledger.filter(l => !l.delayed).length})`}
          </button>
          {openLedger && (
            <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ledger.map((l, i) => (
                <div key={i} style={{
                  fontSize: 12, borderLeft: `2px solid ${l.broke ? '#d9484f' : l.failed ? '#d8a53a' : '#302943'}`,
                  paddingLeft: 8, color: '#ded7ea',
                }}>
                  <span style={{ color: '#6f6689', fontFamily: 'JetBrains Mono, monospace' }}>N{l.night}</span>{' '}
                  {l.delayed ? <em style={{ color: '#a49bbd' }}>a deferred bargain came due</em> : l.label}
                  {l.band && <span style={{ color: '#a49bbd' }}> · {l.band.replace('-', ' ')}</span>}
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#a49bbd', marginLeft: 6 }}>
                    {RES.map((r) => {
                      const d = fmtDelta(l.deltas?.[r.key])
                      return d ? <span key={r.key} style={{ marginRight: 6, color: r.color }}>{r.glyph}{d}</span> : null
                    })}
                  </span>
                  {l.failed && <div style={{ color: '#d8a53a', fontSize: 11 }}>the ritual failed</div>}
                  {l.overfilled && <div style={{ color: '#d8a53a', fontSize: 11 }}>the vault overflowed</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
