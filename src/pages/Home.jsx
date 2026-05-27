import { Link } from 'react-router-dom'
import QuoteBox from '../components/QuoteBox'

const FACTIONS = [
  {
    id: 33097,
    name: 'Occultus',
    description:
      'The first circle. The head of the sacred order, where loyalty is proven, strength is forged, and the directive is carried from the shadows.',
  },
  {
    id: 9728,
    name: 'Occul2us',
    description:
      'The war division. Few in number yet relentless, devoted to conflict, ritualistic bloodshed, and answering the call when war awakens.',
  },
  {
    id: 9171,
    name: 'Occul3us',
    description:
      'The growing circle. A rising extension of the order, following the same directive while nurturing those yet to ascend.',
  },
]

export default function Home() {
  return (
    <>
      {/* HERO */}
      <section
        className="flex items-center justify-center text-center"
        style={{ minHeight: '90vh', padding: '100px 24px' }}
      >
        <div style={{ maxWidth: '900px' }}>
          <div
            className="pointer-events-none"
            style={{
              position: 'absolute',
              width: '600px',
              height: '600px',
              background: 'radial-gradient(circle, rgba(179,18,63,0.15), transparent 70%)',
              transform: 'translate(-50%, -50%)',
              left: '50%',
              top: '40%',
            }}
          />

          <h1
            className="font-cinzel animate-fade-up"
            style={{ fontSize: 'clamp(52px, 8vw, 76px)', lineHeight: 1.1, marginBottom: '28px' }}
          >
            The Veil Watches
          </h1>

          <p
            className="animate-fade-up-slow"
            style={{
              color: '#a1a1aa',
              fontSize: '20px',
              lineHeight: 1.8,
              maxWidth: '700px',
              margin: '0 auto 40px',
            }}
          >
            Occultus stands beyond the shadows of Torn.<br />
            Three circles, One sacred order.<br />
            Strength through unity, and loyalty through blood.
          </p>

          <div
            className="flex gap-5 justify-center flex-wrap animate-fade-up-slower hero-buttons-responsive"
          >
            <Link
              to="/about"
              className="px-5 py-3 rounded-xl text-white no-underline transition-all hover:-translate-y-0.5"
              style={{
                background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
                boxShadow: '0 0 20px rgba(179,18,63,0.35)',
              }}
            >
              About us
            </Link>

            <a
              href="#join-section"
              className="px-5 py-3 rounded-xl text-white no-underline"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              Join The Order
            </a>
          </div>
        </div>
      </section>

      {/* FACTIONS */}
      <section id="join-section" style={{ padding: '120px 48px' }}>
        <h2
          className="font-cinzel text-center"
          style={{ fontSize: 'clamp(36px, 5vw, 48px)', marginBottom: '60px' }}
        >
          Join the Order
        </h2>

        <div
          className="grid gap-8 faction-grid-responsive"
          style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
        >
          {FACTIONS.map((f) => (
            <a
              key={f.id}
              href={`https://www.torn.com/factions.php?step=profile&ID=${f.id}`}
              target="_blank"
              rel="noreferrer"
              className="no-underline text-inherit block"
            >
              <div
                className="relative rounded-3xl transition-all duration-300 hover:-translate-y-1.5 cursor-pointer"
                style={{
                  background: 'rgba(22,22,32,0.82)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  padding: '40px',
                  backdropFilter: 'blur(12px)',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)')
                }
              >
                <h3
                  className="font-cinzel"
                  style={{ fontSize: '30px', marginBottom: '20px' }}
                >
                  {f.name}
                </h3>
                <p style={{ color: '#a1a1aa', lineHeight: 1.7, marginBottom: '24px' }}>
                  {f.description}
                </p>
                <span style={{ color: '#9f67ff', fontSize: '14px' }}>
                  Faction ID: {f.id}
                </span>
              </div>
            </a>
          ))}
        </div>
      </section>

      <QuoteBox />

      {/* FOOTER */}
      <nav
        className="flex items-center justify-between flex-wrap gap-4"
        style={{
          padding: '20px 48px',
          background: 'rgba(5,5,10,0.82)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex gap-3" style={{ color: '#a1a1aa' }}>
          <Link to="/tos" style={{ color: '#a1a1aa', textDecoration: 'none' }}>
            Terms of Service
          </Link>
          <span>|</span>
          <Link to="/privacy" style={{ color: '#a1a1aa', textDecoration: 'none' }}>
            Privacy Policy
          </Link>
        </div>
        <div>
          <a
            href="#"
            style={{ color: '#a1a1aa', textDecoration: 'none' }}
          >
            Occultus Discord
          </a>
        </div>
      </nav>
    </>
  )
}
