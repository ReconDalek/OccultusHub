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

const GRIMOIRE_KEY = 'grimoire_found'
const TOTAL = LORE.length               // 20
const FIRST = 0                         // The Founding — always known
const LAST  = TOTAL - 1                 // The Final Entry — unlocked last

export function getFoundPages() {
  try {
    const stored = localStorage.getItem(GRIMOIRE_KEY)
    if (stored) {
      const arr = JSON.parse(stored)
      if (Array.isArray(arr) && arr.length > 0) return arr
    }
  } catch {}
  return [FIRST]
}

export function findNextGrimoirePage() {
  const found = getFoundPages()
  // Middle pages 1–18 first
  const middle = Array.from({ length: TOTAL - 2 }, (_, i) => i + 1)
  const unfoundMiddle = middle.filter(i => !found.includes(i))
  if (unfoundMiddle.length > 0) {
    const idx = unfoundMiddle[Math.floor(Math.random() * unfoundMiddle.length)]
    const next = [...found, idx]
    localStorage.setItem(GRIMOIRE_KEY, JSON.stringify(next))
    return idx
  }
  // All middle pages found — unlock The Final Entry
  if (!found.includes(LAST)) {
    const next = [...found, LAST]
    localStorage.setItem(GRIMOIRE_KEY, JSON.stringify(next))
    return LAST
  }
  // Everything found
  return null
}

export default function Grimoire({ open, onClose, openToPage = null }) {
  const [page, setPage] = useState(FIRST)       // LORE index currently displayed
  const [foundPages, setFoundPages] = useState([FIRST])
  const [flipping, setFlipping] = useState(false)
  const [isNew, setIsNew] = useState(false)      // newly found badge

  useEffect(() => {
    if (!open) return
    const found = getFoundPages()
    setFoundPages(found)
    if (openToPage !== null && found.includes(openToPage)) {
      setPage(openToPage)
      setIsNew(true)
    } else {
      setPage(found.includes(FIRST) ? FIRST : found[0])
      setIsNew(false)
    }
  }, [open, openToPage])

  function turnPage(dir) {
    if (flipping) return
    // Navigate through ALL 20 positions
    setFlipping(true)
    setTimeout(() => {
      setPage(p => (p + dir + TOTAL) % TOTAL)
      setIsNew(false)
      setFlipping(false)
    }, 260)
  }

  if (!open) return null

  const found = foundPages
  const entry = LORE[page]
  const isTorn = !found.includes(page)
  const foundCount = found.length

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10002,
        background: 'rgba(0,0,0,0.92)',
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
        @keyframes grimNewPage {
          0%   { box-shadow: 0 0 0 0 rgba(179,18,63,0); }
          40%  { box-shadow: 0 0 40px 8px rgba(179,18,63,0.25); }
          100% { box-shadow: 0 0 0 0 rgba(179,18,63,0); }
        }
      `}</style>

      <div style={{
        maxWidth: '500px', width: '100%',
        background: 'linear-gradient(160deg, rgba(10,6,20,0.99), rgba(14,8,28,0.99))',
        border: `1px solid ${isNew ? 'rgba(179,18,63,0.5)' : 'rgba(109,40,217,0.3)'}`,
        borderRadius: '4px',
        boxShadow: '0 0 80px rgba(109,40,217,0.1), inset 0 0 60px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        perspective: '800px',
        animation: isNew ? 'grimNewPage 1.8s ease-out' : 'none',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 24px 14px',
          borderBottom: '1px solid rgba(109,40,217,0.2)',
          background: 'linear-gradient(rgba(109,40,217,0.08), transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '16px', color: 'rgba(109,40,217,0.7)' }}>📖</span>
            <div>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '3px', color: 'rgba(179,18,63,0.8)', display: 'block' }}>
                THE GRIMOIRE
              </span>
              <span style={{ fontSize: '10px', color: '#4c1d95', letterSpacing: '0.08em' }}>
                {foundCount} of {TOTAL} pages recovered
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isNew && (
              <span style={{
                fontSize: '9px', letterSpacing: '1.5px', color: '#fca5a5',
                background: 'rgba(179,18,63,0.2)', border: '1px solid rgba(179,18,63,0.4)',
                padding: '2px 8px', borderRadius: '4px', fontFamily: 'Cinzel, serif',
              }}>
                RECOVERED
              </span>
            )}
            <span style={{ fontSize: '11px', color: '#4c1d95', letterSpacing: '0.08em' }}>
              {page + 1} / {TOTAL}
            </span>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: '#6d28d9',
              cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '2px 6px',
            }}>✕</button>
          </div>
        </div>

        {/* Page content */}
        <div style={{
          padding: '28px 32px',
          minHeight: '240px',
          animation: flipping ? 'grimPageFlip 0.52s ease-in-out' : 'none',
        }}>
          <div style={{ textAlign: 'center', color: 'rgba(109,40,217,0.3)', fontSize: '14px', letterSpacing: '6px', marginBottom: '20px', fontFamily: 'monospace' }}>
            ⋯ ✦ ⋯
          </div>

          {isTorn ? (
            /* Torn / missing page */
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '36px', marginBottom: '12px',
                filter: 'grayscale(1) opacity(0.3)',
              }}>📄</div>
              <h3 style={{
                margin: '0 0 16px', fontFamily: 'Cinzel, serif',
                fontSize: '15px', letterSpacing: '2px',
                color: 'rgba(180,150,210,0.65)',
              }}>
                — Page Missing —
              </h3>
              <p style={{
                color: 'rgba(160,130,190,0.6)', lineHeight: 1.8, fontSize: '13px',
                fontStyle: 'italic', margin: 0,
              }}>
                This page has been torn from the grimoire.<br />
                The eye may yet reveal what was lost.
              </p>
              <div style={{
                marginTop: '18px', padding: '10px 16px', borderRadius: '6px',
                background: 'rgba(109,40,217,0.08)', border: '1px dashed rgba(109,40,217,0.25)',
                display: 'inline-block',
              }}>
                <span style={{ fontSize: '11px', color: 'rgba(160,100,230,0.7)', letterSpacing: '1px', fontFamily: 'Cinzel, serif' }}>
                  AWAIT THE WATCHING EYE
                </span>
              </div>
            </div>
          ) : (
            /* Found page */
            <>
              <h3 style={{
                margin: '0 0 18px', fontFamily: 'Cinzel, serif',
                fontSize: '17px', letterSpacing: '2px', textAlign: 'center',
                color: '#e9d5ff',
              }}>
                {entry.title}
              </h3>
              <p style={{
                color: "var(--text-secondary)", lineHeight: 2, fontSize: '14px',
                textAlign: 'center', margin: 0, fontStyle: 'italic',
              }}>
                {entry.body}
              </p>
            </>
          )}

          <div style={{ textAlign: 'center', color: 'rgba(109,40,217,0.3)', fontSize: '14px', letterSpacing: '6px', marginTop: '20px', fontFamily: 'monospace' }}>
            ⋯ ✦ ⋯
          </div>
        </div>

        {/* Navigation */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid rgba(109,40,217,0.15)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button onClick={() => turnPage(-1)} style={{
            background: 'rgba(109,40,217,0.1)', border: '1px solid rgba(109,40,217,0.25)',
            color: '#a78bfa', padding: '7px 16px', borderRadius: '6px',
            cursor: 'pointer', fontSize: '13px', fontFamily: 'Cinzel, serif', letterSpacing: '1px',
          }}>← Prev</button>

          {/* Dot nav — all 20 pages */}
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '200px' }}>
            {LORE.map((_, i) => {
              const isCur   = i === page
              const isFound = found.includes(i)
              return (
                <div
                  key={i}
                  onClick={() => { if (!flipping) { setFlipping(true); setTimeout(() => { setPage(i); setIsNew(false); setFlipping(false) }, 260) } }}
                  style={{
                    width: '6px', height: '6px', borderRadius: '50%', cursor: 'pointer',
                    background: isCur
                      ? (isFound ? '#b3123f' : 'rgba(179,18,63,0.4)')
                      : (isFound ? '#7c3aed' : 'rgba(109,40,217,0.15)'),
                    border: isCur ? '1px solid rgba(179,18,63,0.6)' : 'none',
                    transition: 'background 0.2s',
                    boxShadow: isCur && isFound ? '0 0 4px rgba(179,18,63,0.5)' : 'none',
                  }}
                  title={isFound ? LORE[i].title : 'Unknown'}
                />
              )
            })}
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
