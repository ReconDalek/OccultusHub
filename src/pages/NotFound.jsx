import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: '70vh', gap: '24px' }}>
      <h1 className="font-cinzel" style={{ fontSize: '64px' }}>404</h1>
      <p style={{ color: "var(--text-secondary)", fontSize: '20px' }}>
        The shadows hide this page from you.
      </p>
      <Link
        to="/"
        className="px-5 py-3 rounded-xl text-white no-underline"
        style={{
          background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
          boxShadow: '0 0 20px rgba(179,18,63,0.35)',
        }}
      >
        Return Home
      </Link>
    </div>
  )
}
