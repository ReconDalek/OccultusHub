import { useState, useEffect } from 'react'

const LORE = [
  {
    title: 'The Founding',
    body: 'Three circles were drawn at the crossroads. The first in blood. The second in shadow. The third in silence. Where they converge, the order was born — not founded, not established. Born.',
  },
  {
    title: 'The Pact',
    body: 'They came to the elder with open hands. They left with something that could not be seen, only felt in the marrow at three in the morning when the city is still.',
  },
  {
    title: 'The Name',
    body: 'Occultus was not chosen. It was received. At the hour between midnight and dawn, the name arose from the static and was written down before it could be questioned.',
  },
  {
    title: 'The Hierarchy',
    body: 'Power does not descend from the top. It rises from those willing to carry it. The leaders do not command. They hold what others cannot bear to hold alone.',
  },
  {
    title: 'The Three Circles',
    body: 'Occultus holds the directive. Occul2us carries the blade. Occul3us tends the flame. Together they form the complete glyph. Separately, they are only fragments of an unspoken word.',
  },
  {
    title: 'The First War',
    body: 'The conflict lasted eleven days. No quarter was given. When it ended, those who survived did not celebrate. They understood, for the first time, what they had become.',
  },
  {
    title: 'The Silence Rule',
    body: 'There are things discussed within these walls that have no equivalent in language. For these, silence is not an absence. It is the message itself, delivered without risk of interception.',
  },
  {
    title: 'The Watchers',
    body: 'There are members who are never seen at the front. They do not strike. They observe. What they catalogue is held in a place that only the innermost circle can access.',
  },
  {
    title: 'The Trial',
    body: 'Those who seek to rise within the inner circle undergo no formal test. The trial is ongoing. It began the day you joined. It has not ended. It never ends.',
  },
  {
    title: 'The Departed',
    body: 'Those who leave are not forgotten. They are archived. Their knowledge remains useful. Their absence is noted in the margins of every record that once bore their name.',
  },
  {
    title: 'The City Beneath',
    body: 'Torn is a city of surfaces. What the order operates beneath those surfaces cannot be mapped by conventional means. The map exists only in collective memory, distributed and incomplete by design.',
  },
  {
    title: 'On Enemies',
    body: 'We do not call them enemies in the traditional sense. They are complications. Some complications must be removed with precision. Others, given sufficient patience, become assets.',
  },
  {
    title: 'The Mark',
    body: 'You carry it without knowing what it looks like. Others within the order recognise it immediately. Outsiders cannot perceive it at all. This asymmetry is not an accident.',
  },
  {
    title: 'The Cipher',
    body: 'Every day a new cipher is placed before the order. Every day a new mind is measured. The answers matter less than the willingness to engage with the question without being told to.',
  },
  {
    title: 'The Blood Moon',
    body: 'When the moon turns crimson, the veil is at its thinnest. The order has always known this. Old rites are performed quietly in those hours. Nothing is discussed afterward. Nothing needs to be.',
  },
  {
    title: 'On Strength',
    body: 'Strength within the order is not measured in victories. It is measured in endurance. The one who outlasts every conflict, every doubt, every test — that is the one who truly understands.',
  },
  {
    title: 'The Archive',
    body: 'Records go back further than the order\'s official founding. This discrepancy is not an error. It is the most important fact about the order, and the least often discussed.',
  },
  {
    title: 'The Directive',
    body: 'The directive was never written down. It does not need to be. Those who have heard it understand completely. Those who have not — they are still being prepared.',
  },
  {
    title: 'The Mirror Doctrine',
    body: 'What you see in the abyss is not the abyss. It is a reflection of what the abyss has already catalogued in you. The scrying is not discovery. It is recognition.',
  },
  {
    title: 'The Final Entry',
    body: 'This page was not supposed to be found. The fact that you are reading it means either you were meant to, or a boundary has been crossed. In either case: you are now part of this record.',
  },
]

export default function Grimoire({ open, onClose }) {
  const [page, setPage] = useState(0)
  const [flipping, setFlipping] = useState(false)

  useEffect(() => {
    if (open) setPage(Math.floor(Math.random() * LORE.length))
  }, [open])

  function turnPage(dir) {
    if (flipping) return
    setFlipping(true)
    setTimeout(() => {
      setPage(p => (p + dir + LORE.length) % LORE.length)
      setFlipping(false)
    }, 260)
  }

  if (!open) return null

  const entry = LORE[page]

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10002,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <style>{`
        @keyframes grimPageFlip {
          0%   { opacity: 1; transform: rotateY(0deg); }
          50%  { opacity: 0; transform: rotateY(30deg); }
          100% { opacity: 1; transform: rotateY(0deg); }
        }
      `}</style>

      <div style={{
        maxWidth: '480px', width: '100%',
        background: 'linear-gradient(160deg, rgba(10,6,20,0.99), rgba(14,8,28,0.99))',
        border: '1px solid rgba(109,40,217,0.3)',
        borderRadius: '4px',
        boxShadow: '0 0 80px rgba(109,40,217,0.1), inset 0 0 60px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        perspective: '800px',
      }}>
        {/* Tome header */}
        <div style={{
          padding: '20px 28px 16px',
          borderBottom: '1px solid rgba(109,40,217,0.2)',
          background: 'linear-gradient(rgba(109,40,217,0.08), transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px', color: 'rgba(109,40,217,0.7)', fontFamily: 'monospace' }}>📖</span>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', letterSpacing: '3px', color: 'rgba(179,18,63,0.8)' }}>
              THE GRIMOIRE
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#4c1d95', letterSpacing: '0.1em' }}>
              {page + 1} of {LORE.length}
            </span>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: '#6d28d9',
              cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '2px 6px',
            }}>✕</button>
          </div>
        </div>

        {/* Page content */}
        <div style={{
          padding: '32px 36px',
          minHeight: '260px',
          animation: flipping ? 'grimPageFlip 0.52s ease-in-out' : 'none',
        }}>
          {/* Decorative top border */}
          <div style={{ textAlign: 'center', color: 'rgba(109,40,217,0.3)', fontSize: '14px', letterSpacing: '6px', marginBottom: '24px', fontFamily: 'monospace' }}>
            ⋯ ✦ ⋯
          </div>

          <h3 style={{
            margin: '0 0 20px', fontFamily: 'Cinzel, serif',
            fontSize: '17px', letterSpacing: '2px', textAlign: 'center',
            color: '#e9d5ff',
          }}>
            {entry.title}
          </h3>

          <p style={{
            color: '#a1a1aa', lineHeight: 2, fontSize: '14px',
            textAlign: 'center', margin: 0, fontStyle: 'italic',
          }}>
            {entry.body}
          </p>

          {/* Decorative bottom */}
          <div style={{ textAlign: 'center', color: 'rgba(109,40,217,0.3)', fontSize: '14px', letterSpacing: '6px', marginTop: '24px', fontFamily: 'monospace' }}>
            ⋯ ✦ ⋯
          </div>
        </div>

        {/* Navigation */}
        <div style={{
          padding: '16px 28px',
          borderTop: '1px solid rgba(109,40,217,0.15)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button onClick={() => turnPage(-1)} style={{
            background: 'rgba(109,40,217,0.1)', border: '1px solid rgba(109,40,217,0.25)',
            color: '#a78bfa', padding: '7px 16px', borderRadius: '6px',
            cursor: 'pointer', fontSize: '13px', fontFamily: 'Cinzel, serif', letterSpacing: '1px',
          }}>← Previous</button>

          <div style={{ display: 'flex', gap: '4px' }}>
            {LORE.map((_, i) => (
              <div key={i} style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: i === page ? '#7c3aed' : 'rgba(109,40,217,0.2)',
                transition: 'background 0.2s',
              }} />
            ))}
          </div>

          <button onClick={() => turnPage(1)} style={{
            background: 'rgba(109,40,217,0.1)', border: '1px solid rgba(109,40,217,0.25)',
            color: '#a78bfa', padding: '7px 16px', borderRadius: '6px',
            cursor: 'pointer', fontSize: '13px', fontFamily: 'Cinzel, serif', letterSpacing: '1px',
          }}>Next →</button>
        </div>
      </div>
    </div>
  )
}
