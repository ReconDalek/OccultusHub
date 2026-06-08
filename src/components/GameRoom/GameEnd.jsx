const ROLE_META = {
  congregation: { icon: '◌', color: '#a1a1aa', label: 'Congregation' },
  cabal:        { icon: '◈', color: '#b3123f', label: 'Cabal Agent' },
  inquisitor:   { icon: '◉', color: '#9f67ff', label: 'Inquisitor' },
  warden:       { icon: '◎', color: '#22c55e', label: 'Warden' },
  apostate:     { icon: '✦', color: '#f59e0b', label: 'The Apostate' },
  deceiver:     { icon: '◬', color: '#e879f9', label: 'Deceiver' },
  acolyte:      { icon: '✧', color: '#38bdf8', label: 'Acolyte' },
}

export default function GameEnd({ gameState, displayName, onPlayAgain }) {
  const room = gameState?.room
  const players = gameState?.players || []
  const messages = gameState?.messages || []
  const winner = room?.winner
  const isCabalWin      = winner === 'cabal'
  const isApostateWin   = winner === 'apostate'
  const isCongregation  = !isCabalWin && !isApostateWin

  const oracleMsgs = messages.filter(m => m.display_name === 'The Oracle')
  const lastOracleMsg = oracleMsgs[oracleMsgs.length - 1]?.message || ''

  const winIcon  = isCabalWin ? '◈' : isApostateWin ? '✦' : '✦'
  const winColor = isCabalWin ? '#b3123f' : isApostateWin ? '#f59e0b' : '#9f67ff'
  const winTitle = isCabalWin ? 'THE CABAL PREVAILS' : isApostateWin ? 'THE APOSTATE PREVAILS' : 'THE CONGREGATION ENDURES'

  return (
    <div style={{ minHeight: 'calc(100vh - 72px)', padding: '48px 20px 60px', color: '#f4f4f5' }}>
      <div style={{ maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>{winIcon}</div>

        <h1 className="font-cinzel" style={{ fontSize: 32, letterSpacing: 6, marginBottom: 8, color: winColor }}>
          {winTitle}
        </h1>

        <p style={{ color: '#71717a', fontSize: 13, maxWidth: 380, margin: '0 auto 32px', lineHeight: 1.6 }}>
          {lastOracleMsg}
        </p>

        {/* Player reveal */}
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 11, color: '#71717a', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>The Circle Revealed</p>
          <div style={{ display: 'grid', gap: 6 }}>
            {players.map(p => {
              const meta = ROLE_META[p.role] || { icon: '?', color: '#71717a', label: 'Unknown' }
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: `${meta.color}10`, border: `1px solid ${meta.color}30`, borderRadius: 8 }}>
                  <span style={{ fontSize: 16, color: meta.color }}>{meta.icon}</span>
                  <span style={{ fontSize: 14, flex: 1, textAlign: 'left', color: p.is_alive ? '#f4f4f5' : '#52525b' }}>
                    {p.display_name}
                    {p.is_me && <span style={{ color: '#9f67ff', fontSize: 11 }}> (you)</span>}
                  </span>
                  <span style={{ fontSize: 12, color: meta.color }}>{meta.label}</span>
                  {!p.is_alive && <span style={{ fontSize: 11, color: '#52525b' }}>fallen</span>}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onPlayAgain} style={primaryBtn}>
            ⊕ Play Again
          </button>
        </div>
      </div>
    </div>
  )
}

const primaryBtn = {
  padding: '13px 32px',
  background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
  border: 'none',
  borderRadius: 8,
  color: '#f4f4f5',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  letterSpacing: 1,
}
