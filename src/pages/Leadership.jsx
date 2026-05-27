import { Link } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import QuoteBox from '../components/QuoteBox'

export default function Leadership() {
  const { user, loading } = useSession()

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <p style={{ color: '#a1a1aa' }}>Checking access…</p>
      </div>
    )
  }

  return (
    <>
      <main className="max-w-5xl mx-auto px-6 py-16">
        <h1
          className="font-cinzel text-center"
          style={{ fontSize: 'clamp(36px, 5vw, 48px)', marginBottom: '60px' }}
        >
          Leadership Dashboard
        </h1>

        {!user?.isLeader ? (
          <div
            className="max-w-3xl mx-auto p-10 rounded-3xl text-center"
            style={{ background: 'rgba(255,255,255,0.03)', color: '#a1a1aa' }}
          >
            Access Restricted — Leadership Clearance Required
          </div>
        ) : (
          <div
            className="rounded-3xl mt-8 p-10"
            style={{
              background: 'rgba(22,22,32,0.82)',
              border: '1px solid rgba(255,255,255,0.05)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <h3 className="font-cinzel mb-6" style={{ fontSize: '24px' }}>
              Command Controls
            </h3>

            <div className="flex flex-wrap gap-4">
              <Link
                to="/respect"
                className="px-5 py-3 rounded-xl text-white no-underline transition-all hover:-translate-y-0.5"
                style={{
                  background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
                  boxShadow: '0 0 20px rgba(179,18,63,0.35)',
                }}
              >
                Respect Tracker
              </Link>

              <button
                className="px-5 py-3 rounded-xl text-white border-none cursor-pointer"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                Member Activity
              </button>

              <button
                className="px-5 py-3 rounded-xl text-white border-none cursor-pointer"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                Internal Notices
              </button>
            </div>
          </div>
        )}
      </main>

      <QuoteBox />
    </>
  )
}
