import { useState } from 'react'

// The answer card — parchment style, used in hand and judging

export default function FateCard({
  card,
  selected = false,
  onSelect,
  customText = '',
  onCustomTextChange,
  disabled = false,
  faceDown = false,  // The Veil omen
  isWinner = false,
  small = false,
  style = {},
}) {
  const [hovered, setHovered] = useState(false)
  const [flipped, setFlipped] = useState(false)

  const w = small ? 130 : 160
  const h = small ? 178 : 222
  const pad = small ? 12 : 16
  const fontSize = small ? 12 : 13

  const isBlank = card?.is_blank || card?.is_blank === 1

  const showFace = !faceDown || flipped

  return (
    <div
      style={{
        width: w,
        height: h,
        perspective: 600,
        flexShrink: 0,
        cursor: disabled ? 'default' : (faceDown && !flipped) ? 'pointer' : (onSelect ? 'pointer' : 'default'),
        ...style,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        if (faceDown && !flipped) { setFlipped(true); return }
        if (!disabled && onSelect) onSelect(card)
      }}
    >
      <div style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        transformStyle: 'preserve-3d',
        transition: 'transform 0.5s ease',
        transform: showFace ? 'rotateY(0deg)' : 'rotateY(180deg)',
      }}>
        {/* Front face */}
        <div style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden',
          borderRadius: 12,
          background: selected
            ? 'linear-gradient(160deg, #f0e8d8 0%, #e8dccc 100%)'
            : 'linear-gradient(160deg, #f5f0e8 0%, #ece4d4 100%)',
          border: selected
            ? '2px solid rgba(179,18,63,0.8)'
            : isWinner
            ? '2px solid rgba(109,40,217,0.9)'
            : `1px solid rgba(120,80,20,${hovered ? 0.5 : 0.25})`,
          boxShadow: selected
            ? '0 0 20px rgba(179,18,63,0.4), 0 8px 24px rgba(0,0,0,0.5)'
            : isWinner
            ? '0 0 28px rgba(109,40,217,0.5), 0 8px 24px rgba(0,0,0,0.5)'
            : hovered
            ? '0 8px 28px rgba(0,0,0,0.55)'
            : '0 4px 16px rgba(0,0,0,0.45)',
          transform: selected
            ? 'translateY(-18px) scale(1.04)'
            : hovered
            ? 'translateY(-8px) scale(1.03)'
            : 'translateY(0) scale(1)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease, border 0.2s ease',
          padding: pad,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: 'hidden',
        }}>
          {/* Subtle texture lines */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 18px, rgba(120,80,20,0.04) 19px)',
            borderRadius: 12,
          }} />

          {/* Corner accents */}
          <svg style={{ position: 'absolute', top: 6, left: 6, opacity: 0.2 }} width="16" height="16" viewBox="0 0 16 16">
            <path d="M1 1 L7 1 L1 7" stroke="#6b3a12" strokeWidth="1.2" fill="none"/>
          </svg>
          <svg style={{ position: 'absolute', top: 6, right: 6, opacity: 0.2, transform: 'scaleX(-1)' }} width="16" height="16" viewBox="0 0 16 16">
            <path d="M1 1 L7 1 L1 7" stroke="#6b3a12" strokeWidth="1.2" fill="none"/>
          </svg>
          <svg style={{ position: 'absolute', bottom: 6, left: 6, opacity: 0.2, transform: 'scaleY(-1)' }} width="16" height="16" viewBox="0 0 16 16">
            <path d="M1 1 L7 1 L1 7" stroke="#6b3a12" strokeWidth="1.2" fill="none"/>
          </svg>
          <svg style={{ position: 'absolute', bottom: 6, right: 6, opacity: 0.2, transform: 'scale(-1,-1)' }} width="16" height="16" viewBox="0 0 16 16">
            <path d="M1 1 L7 1 L1 7" stroke="#6b3a12" strokeWidth="1.2" fill="none"/>
          </svg>

          {/* Header */}
          <div style={{
            fontFamily: 'Cinzel, serif',
            fontSize: 7,
            letterSpacing: '2px',
            color: 'rgba(60,30,10,0.35)',
            textTransform: 'uppercase',
          }}>
            {isWinner ? '✦ Soul Claimed' : 'Cards Against Occultus'}
          </div>

          {/* Text area */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '8px 0' }}>
            {isBlank && onCustomTextChange ? (
              <textarea
                value={customText}
                onChange={e => onCustomTextChange(e.target.value)}
                placeholder="Write your fate..."
                maxLength={120}
                onClick={e => e.stopPropagation()}
                style={{
                  width: '100%',
                  height: '80px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid rgba(60,30,10,0.3)',
                  resize: 'none',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: fontSize - 1,
                  color: '#2a1505',
                  outline: 'none',
                  lineHeight: 1.5,
                }}
              />
            ) : (
              <p style={{
                fontFamily: 'Inter, sans-serif',
                fontSize,
                color: '#2a1505',
                lineHeight: 1.55,
                margin: 0,
                fontStyle: isBlank ? 'italic' : 'normal',
              }}>
                {isBlank ? (customText || '— blank vessel —') : card?.text}
              </p>
            )}
          </div>

          {/* Footer */}
          <div style={{
            fontFamily: 'Cinzel, serif',
            fontSize: 7,
            color: 'rgba(60,30,10,0.3)',
            letterSpacing: '1.5px',
            textAlign: 'right',
          }}>
            {isBlank ? 'VESSEL' : 'FATE'}
          </div>
        </div>

        {/* Back face (face-down state) */}
        <div style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          borderRadius: 12,
          background: 'linear-gradient(160deg, #120619 0%, #0a0310 55%, #150010 100%)',
          border: '1px solid rgba(179,18,63,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <svg width="40" height="40" viewBox="0 0 40 40" opacity="0.35">
            <circle cx="20" cy="20" r="16" stroke="#b3123f" strokeWidth="1" fill="none"/>
            <path d="M20 4 L20 36 M4 20 L36 20 M7 7 L33 33 M33 7 L7 33" stroke="#6d28d9" strokeWidth="0.8" fill="none"/>
          </svg>
        </div>
      </div>
    </div>
  )
}
