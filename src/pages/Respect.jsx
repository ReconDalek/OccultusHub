import { Link } from 'react-router-dom'

export default function Respect() {
  return (
    <div
      style={{ height: 'calc(100vh - 80px)', width: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {/* Header bar */}
      <div
        className="flex justify-between items-center"
        style={{
          padding: '16px 24px',
          background: 'rgba(0,0,0,0.4)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div>
          <div className="font-cinzel text-white" style={{ fontSize: '18px', letterSpacing: '1px' }}>
            Respect Tracker
          </div>
          <div className="text-xs" style={{ color: '#a1a1aa' }}>
            Embedded operational monitoring tool
          </div>
        </div>
        <div className="text-xs" style={{ color: '#a1a1aa' }}>
          External module (read-only embed)
        </div>
      </div>

      {/* iframe */}
      <div style={{ flex: 1, width: '100%', position: 'relative' }}>
        <iframe
          src="https://respect-tracker.pages.dev/"
          loading="lazy"
          title="Respect Tracker"
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </div>
  )
}
