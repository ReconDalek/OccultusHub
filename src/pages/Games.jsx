import { Link } from 'react-router-dom'

const GAMES = [
  {
    to: '/rite',
    title: 'The Rite',
    symbol: '⛧',
    symbolColor: '#b3123f',
    accentColor: '#b3123f',
    gradientFrom: 'rgba(179,18,63,0.12)',
    gradientTo:   'rgba(109,40,217,0.06)',
    border:       'rgba(179,18,63,0.3)',
    tag: 'Social Deduction',
    tagColor: '#b3123f',
    players: '4 – 16 players',
    description:
      'An occult game of loyalty, deception, and sacrifice. The Congregation must root out the Cabal hiding among them before the circle is destroyed from within. Roles include the Inquisitor, Warden, Acolyte, Deceiver, and Apostate.',
    cta: 'Enter the Circle',
  },
  {
    to: '/cards',
    title: 'Cards Against Occultus',
    symbol: '◈',
    symbolColor: '#6d28d9',
    accentColor: '#6d28d9',
    gradientFrom: 'rgba(109,40,217,0.12)',
    gradientTo:   'rgba(179,18,63,0.06)',
    border:       'rgba(109,40,217,0.3)',
    tag: 'Party Game',
    tagColor: '#a78bfa',
    players: '3 – 20 players',
    description:
      'A dark humour card game for the inner sanctum. A Harbinger draws a black card, the rest of the circle plays their worst white card, and the Harbinger judges who has the most cursed soul.',
    cta: 'Join the Table',
  },
]

export default function Games() {
  return (
    <div style={{ minHeight: '100vh', padding: '80px 20px 80px', color: '#f4f4f5' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.7 }}>⚉</div>
          <h1
            className="font-cinzel"
            style={{ fontSize: 'clamp(26px, 5vw, 40px)', letterSpacing: 8, marginBottom: 12 }}
          >
            GAME ROOM
          </h1>
          <p style={{ color: '#71717a', fontSize: 14, letterSpacing: 1 }}>
            Choose your rite. More games will be added in time.
          </p>
        </div>

        {/* Game cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {GAMES.map((g) => (
            <div
              key={g.to}
              style={{
                background: `linear-gradient(135deg, ${g.gradientFrom}, ${g.gradientTo})`,
                border: `1px solid ${g.border}`,
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '28px 28px 24px' }}>
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginBottom: 16 }}>
                  <div style={{
                    fontSize: 36, color: g.symbolColor, flexShrink: 0,
                    filter: `drop-shadow(0 0 8px ${g.symbolColor}66)`,
                    lineHeight: 1,
                    marginTop: 2,
                  }}>
                    {g.symbol}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                      <h2
                        className="font-cinzel"
                        style={{ fontSize: 'clamp(16px, 3vw, 22px)', letterSpacing: 3, margin: 0, color: '#f4f4f5' }}
                      >
                        {g.title}
                      </h2>
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
                        color: g.tagColor,
                        background: `${g.accentColor}18`,
                        border: `1px solid ${g.accentColor}40`,
                        borderRadius: 20, padding: '2px 9px',
                      }}>
                        {g.tag}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: '#71717a', letterSpacing: 1, margin: 0 }}>
                      {g.players}
                    </p>
                  </div>
                </div>

                {/* Description */}
                <p style={{
                  fontSize: 14, color: '#a1a1aa', lineHeight: 1.75,
                  marginBottom: 20, marginLeft: 54,
                }}>
                  {g.description}
                </p>

                {/* CTA */}
                <div style={{ marginLeft: 54 }}>
                  <Link
                    to={g.to}
                    style={{
                      display: 'inline-block',
                      padding: '11px 24px',
                      background: `linear-gradient(135deg, ${g.accentColor}cc, ${g.accentColor}88)`,
                      border: `1px solid ${g.accentColor}60`,
                      borderRadius: 8,
                      color: '#f4f4f5',
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: 1,
                      textDecoration: 'none',
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    {g.cta} →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Future games teaser */}
        <div style={{
          marginTop: 32,
          padding: '20px 24px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(255,255,255,0.07)',
          borderRadius: 12,
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 12, color: '#3f3f46', letterSpacing: 2, textTransform: 'uppercase' }}>
            More rites are being prepared
          </p>
        </div>

      </div>
    </div>
  )
}
