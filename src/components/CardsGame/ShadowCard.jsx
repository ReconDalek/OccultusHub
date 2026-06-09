// The dark prompt card displayed each round

const OMEN_LABELS = {
  blood_moon: { icon: '🌑', label: 'Blood Moon', desc: 'Submit two cards' },
  the_veil:   { icon: '👁', label: 'The Veil',   desc: 'Harbinger judges blind' },
  the_awakening: { icon: '✦', label: 'The Awakening', desc: '+1 card dealt to all' },
}

export default function ShadowCard({ card, omen, picks, roundNumber, large = false }) {
  if (!card) return null

  const w = large ? 280 : 220
  const h = large ? 390 : 308
  const pad = large ? 28 : 22
  const fontSize = large ? 18 : 15
  const omenData = omen ? OMEN_LABELS[omen] : null

  return (
    <div style={{
      width: w,
      height: h,
      borderRadius: 14,
      background: 'linear-gradient(160deg, #120619 0%, #0a0310 55%, #150010 100%)',
      border: '1px solid rgba(179,18,63,0.45)',
      boxShadow: '0 0 40px rgba(109,40,217,0.25), 0 8px 32px rgba(0,0,0,0.7), inset 0 0 60px rgba(179,18,63,0.04)',
      padding: pad,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      position: 'relative',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* Corner rune decorations */}
      <svg style={{ position: 'absolute', top: 8, left: 8, opacity: 0.18 }} width="28" height="28" viewBox="0 0 28 28">
        <path d="M2 2 L12 2 L2 12" stroke="#b3123f" strokeWidth="1.5" fill="none"/>
        <path d="M2 2 L2 8" stroke="#6d28d9" strokeWidth="1" fill="none"/>
        <circle cx="2" cy="2" r="1.5" fill="#b3123f"/>
      </svg>
      <svg style={{ position: 'absolute', top: 8, right: 8, opacity: 0.18, transform: 'scaleX(-1)' }} width="28" height="28" viewBox="0 0 28 28">
        <path d="M2 2 L12 2 L2 12" stroke="#b3123f" strokeWidth="1.5" fill="none"/>
        <path d="M2 2 L2 8" stroke="#6d28d9" strokeWidth="1" fill="none"/>
        <circle cx="2" cy="2" r="1.5" fill="#b3123f"/>
      </svg>
      <svg style={{ position: 'absolute', bottom: 8, left: 8, opacity: 0.18, transform: 'scaleY(-1)' }} width="28" height="28" viewBox="0 0 28 28">
        <path d="M2 2 L12 2 L2 12" stroke="#b3123f" strokeWidth="1.5" fill="none"/>
        <path d="M2 2 L2 8" stroke="#6d28d9" strokeWidth="1" fill="none"/>
        <circle cx="2" cy="2" r="1.5" fill="#b3123f"/>
      </svg>
      <svg style={{ position: 'absolute', bottom: 8, right: 8, opacity: 0.18, transform: 'scale(-1,-1)' }} width="28" height="28" viewBox="0 0 28 28">
        <path d="M2 2 L12 2 L2 12" stroke="#b3123f" strokeWidth="1.5" fill="none"/>
        <path d="M2 2 L2 8" stroke="#6d28d9" strokeWidth="1" fill="none"/>
        <circle cx="2" cy="2" r="1.5" fill="#b3123f"/>
      </svg>

      {/* Header */}
      <div>
        <div style={{
          fontFamily: 'Cinzel, serif',
          fontSize: 9,
          letterSpacing: '2.5px',
          color: 'rgba(244,244,245,0.35)',
          marginBottom: 6,
          textTransform: 'uppercase',
        }}>
          Cards Against Occultus
        </div>
        {roundNumber && (
          <div style={{ fontSize: 10, color: 'rgba(179,18,63,0.6)', letterSpacing: '1px' }}>
            Round {roundNumber}
          </div>
        )}
      </div>

      {/* Card text */}
      <div style={{
        fontFamily: 'Cinzel, serif',
        fontSize,
        lineHeight: 1.6,
        color: '#f4f4f5',
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        padding: '12px 0',
      }}>
        {card.text}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        {omenData ? (
          <div style={{
            background: 'rgba(179,18,63,0.15)',
            border: '1px solid rgba(179,18,63,0.3)',
            borderRadius: 6,
            padding: '3px 8px',
            fontSize: 10,
            color: '#f4a0b0',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            {omenData.icon} {omenData.label}
          </div>
        ) : <div />}
        <div style={{
          fontFamily: 'Cinzel, serif',
          fontSize: 9,
          color: 'rgba(244,244,245,0.25)',
          letterSpacing: '1.5px',
        }}>
          SHADOW {picks > 1 ? `✕${picks}` : ''}
        </div>
      </div>
    </div>
  )
}
