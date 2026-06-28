export default function CardsEnd({ room, players, myPlayerId, onLeave }) {
  const winner = players.find(p => p.display_name === room.winner_name)
  const sorted = [...players].sort((a, b) => b.souls - a.souls)
  const isWinner = winner?.id === myPlayerId

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', padding: '0 16px' }}>
      {/* Banner */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          fontFamily: 'Cinzel, serif',
          fontSize: 11,
          letterSpacing: '4px',
          color: "var(--text-secondary)",
          marginBottom: 12,
        }}>
          THE RITUAL CONCLUDES
        </div>
        <div style={{
          fontFamily: 'Cinzel, serif',
          fontSize: isWinner ? 36 : 28,
          color: isWinner ? '#f4a0b0' : '#f4f4f5',
          textShadow: isWinner ? '0 0 32px rgba(179,18,63,0.5)' : 'none',
          marginBottom: 8,
          lineHeight: 1.2,
        }}>
          {isWinner ? 'You have claimed the souls.' : `${room.winner_name} claims victory.`}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {isWinner
            ? 'The darkness bows to you.'
            : 'Better luck in the next ritual.'}
        </div>
      </div>

      {/* Soul scoreboard */}
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 24,
      }}>
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          fontSize: 11,
          letterSpacing: '2px',
          color: "var(--text-secondary)",
        }}>
          FINAL STANDINGS
        </div>
        {sorted.map((p, i) => (
          <div key={p.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 20px',
            borderBottom: i < sorted.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
            background: p.display_name === room.winner_name ? 'rgba(179,18,63,0.08)' : 'transparent',
          }}>
            <span style={{
              fontSize: 12,
              color: i === 0 ? '#b3123f' : "var(--text-secondary)",
              width: 20,
              flexShrink: 0,
            }}>
              {i === 0 ? '◈' : i + 1}
            </span>
            <span style={{
              flex: 1,
              fontSize: 14,
              color: p.id === myPlayerId ? '#f4f4f5' : '#d4d4d8',
              textAlign: 'left',
            }}>
              {p.display_name}
              {p.id === myPlayerId && <span style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: 6 }}>(you)</span>}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 16, color: '#b3123f' }}>
                {Array.from({ length: p.souls }).map((_, j) => (
                  <span key={j}>●</span>
                ))}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: 4 }}>{p.souls} soul{p.souls !== 1 ? 's' : ''}</span>
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={onLeave}
        style={{
          padding: '12px 36px',
          borderRadius: 10,
          border: 'none',
          background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
          color: '#f4f4f5',
          fontFamily: 'Cinzel, serif',
          fontSize: 14,
          letterSpacing: '1px',
          cursor: 'pointer',
          boxShadow: '0 0 20px rgba(179,18,63,0.25)',
        }}
      >
        Return to the Void
      </button>
    </div>
  )
}
