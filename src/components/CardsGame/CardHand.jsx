import { useState } from 'react'
import FateCard from './FateCard'

// Fan-of-cards hand display at bottom of screen
export default function CardHand({
  cards = [],
  selectedIds = [],
  onSelect,
  customTexts = {},
  onCustomTextChange,
  disabled = false,
  picks = 1,
}) {
  const [hoveredId, setHoveredId] = useState(null)

  const count = cards.length
  if (!count) return (
    <div style={{ textAlign: 'center', color: 'rgba(244,244,245,0.3)', fontSize: 13, padding: '20px 0' }}>
      No cards in hand
    </div>
  )

  // Responsive card sizing — shrink on narrow screens so the hand doesn't overflow
  const vw = typeof window !== 'undefined' ? window.innerWidth : 800
  const isSmall = vw < 500
  const isMid   = vw < 720

  const CARD_W = isSmall ? 100 : isMid ? 120 : 154
  const CARD_H = isSmall ? 138 : isMid ? 165 : 215
  // Tighter overlap on small screens to keep everything on-screen
  const OVERLAP = isSmall
    ? Math.min(28, Math.max(8, 200 / count))
    : isMid
    ? Math.min(38, Math.max(10, 260 / count))
    : Math.min(50, Math.max(10, 320 / count))
  const totalWidth = CARD_W + (count - 1) * OVERLAP
  const MAX_ROTATE = Math.min(22, count * 2.5)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      {picks > 1 && (
        <div style={{
          fontSize: 12,
          color: 'rgba(244,100,100,0.8)',
          background: 'rgba(179,18,63,0.12)',
          border: '1px solid rgba(179,18,63,0.25)',
          borderRadius: 20,
          padding: '4px 14px',
          letterSpacing: '0.5px',
        }}>
          Select {picks} cards — {selectedIds.length}/{picks} chosen
        </div>
      )}

      {/* Fan container */}
      <div style={{
        position: 'relative',
        width: Math.min(totalWidth, window.innerWidth - 48),
        height: CARD_H + 30,
        margin: '0 auto',
      }}>
        {cards.map((card, i) => {
          const center = (count - 1) / 2
          const offset = i - center
          const normalised = count > 1 ? offset / center : 0
          const rotation = normalised * MAX_ROTATE
          const translateX = i * OVERLAP
          const arcY = Math.abs(normalised) * 12
          const isSelected = selectedIds.includes(card.id)
          const isHovered = hoveredId === card.id
          const zIndex = isSelected ? 50 : isHovered ? count + i : i

          let cardTransform
          if (isSelected) {
            cardTransform = `translateX(${translateX}px) translateY(-32px) rotate(0deg) scale(1.06)`
          } else if (isHovered) {
            cardTransform = `translateX(${translateX}px) translateY(${arcY - 16}px) rotate(${rotation * 0.4}deg) scale(1.05)`
          } else {
            cardTransform = `translateX(${translateX}px) translateY(${arcY}px) rotate(${rotation}deg)`
          }

          return (
            <div
              key={card.id}
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                zIndex,
                transform: cardTransform,
                transition: 'transform 0.2s ease, z-index 0s',
                transformOrigin: 'bottom center',
              }}
              onMouseEnter={() => setHoveredId(card.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <FateCard
                card={card}
                selected={isSelected}
                onSelect={!disabled ? onSelect : null}
                customText={customTexts[card.id] || ''}
                onCustomTextChange={onCustomTextChange ? (t) => onCustomTextChange(card.id, t) : null}
                disabled={disabled || (!isSelected && selectedIds.length >= picks)}
                small={isSmall || isMid}
                style={{ width: CARD_W, height: CARD_H }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
