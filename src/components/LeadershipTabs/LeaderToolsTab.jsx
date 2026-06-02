import { Link } from 'react-router-dom'

const tools = [
  {
    id: 'respect',
    label: 'Respect Tracker',
    description: 'Track and monitor faction respect gains over time.',
    badge: 'Active',
    badgeColor: 'rgba(109,40,217,0.3)',
    badgeText: '#9f67ff',
    action: { type: 'link', to: '/respect', label: 'Open Tracker' },
  },
  {
    id: 'activity',
    label: 'Member Activity',
    description: 'View login frequency, participation, and engagement across all three factions.',
    badge: 'Coming soon',
    badgeColor: 'rgba(255,255,255,0.06)',
    badgeText: '#a1a1aa',
    action: null,
  },
]

export default function LeaderToolsTab() {
  return (
    <div>
      <h2 className="font-cinzel mb-2" style={{ fontSize: '22px', color: '#f4f4f5' }}>
        Leader Tools
      </h2>
      <p style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '28px' }}>
        Command-level resources for managing the order.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '560px' }}>
        {tools.map((tool) => (
          <div
            key={tool.id}
            style={{
              padding: '20px 24px',
              borderRadius: '14px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, fontSize: '15px' }}>{tool.label}</span>
                <span style={{
                  fontSize: '11px',
                  padding: '2px 10px',
                  borderRadius: '20px',
                  background: tool.badgeColor,
                  color: tool.badgeText,
                  fontWeight: 600,
                  letterSpacing: '0.5px',
                }}>
                  {tool.badge}
                </span>
              </div>
              <p style={{ color: '#a1a1aa', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
                {tool.description}
              </p>
            </div>

            {tool.action?.type === 'link' && (
              <Link
                to={tool.action.to}
                className="no-underline"
                style={{
                  padding: '8px 20px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
                  color: '#f4f4f5',
                  fontSize: '13px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {tool.action.label}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
