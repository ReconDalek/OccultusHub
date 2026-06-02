import { Link } from 'react-router-dom'

export default function RespectTab() {
  return (
    <div>
      <h2 className="font-cinzel mb-2" style={{ fontSize: '22px', color: '#f4f4f5' }}>
        Respect Tracker
      </h2>
      <p style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '28px' }}>
        Monitor and track faction respect gains over time.
      </p>

      <Link
        to="/respect"
        className="inline-block px-6 py-3 rounded-xl text-white no-underline transition-all hover:-translate-y-0.5"
        style={{
          background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
          boxShadow: '0 0 20px rgba(179,18,63,0.35)',
        }}
      >
        Open Respect Tracker
      </Link>
    </div>
  )
}
