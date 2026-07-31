import { useState } from 'react'
import UsersTab from '../components/AdminTabs/UsersTab'
import CacheTab from '../components/AdminTabs/CacheTab'
import LeaderboardsTab  from '../components/AdminTabs/LeaderboardsTab'
import SeasonalEventsTab from '../components/AdminTabs/SeasonalEventsTab'
import AdminCardsTab from '../components/AdminTabs/AdminCardsTab'
import LogsTab from '../components/AdminTabs/LogsTab'
import WebhooksTab from '../components/AdminTabs/WebhooksTab'

export default function Admin() {
  const [activeTab, setActiveTab] = useState('users')

  const tabs = [
    { id: 'users', label: 'Users' },
    { id: 'cache', label: 'Cache' },
    { id: 'events',      label: 'Themes' },
    { id: 'logs',        label: 'Logs' },
    { id: 'leaderboards', label: 'Leaderboards' },
    { id: 'cards',       label: 'Cards' },
    { id: 'webhooks',    label: 'Webhooks' },
  ]

  return (
    <div className="min-h-screen" style={{ color: '#f4f4f5' }}>
      <div className="max-w-[1600px] mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1
            className="font-cinzel text-white mb-2"
            style={{ fontSize: '40px', letterSpacing: '2px' }}
          >
            ADMIN PANEL
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: '14px' }}>
            Manage site configuration, users, and system settings
          </p>
        </div>

        {/* Tab navigation */}
        <div
          className="mb-8 border-b"
          style={{
            borderColor: 'rgba(255,255,255,0.08)',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div className="flex gap-0" style={{ minWidth: 'max-content' }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-6 py-3 font-medium border-none cursor-pointer transition-all whitespace-nowrap"
                style={{
                  background: activeTab === tab.id ? 'transparent' : 'transparent',
                  color: activeTab === tab.id ? '#f4f4f5' : "var(--text-secondary)",
                  borderBottom: activeTab === tab.id ? '2px solid #b3123f' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.id) {
                    e.target.style.color = '#f4f4f5'
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.id) {
                    e.target.style.color = "var(--text-secondary)"
                  }
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div
          className="rounded-2xl p-8"
          style={{ background: 'rgba(22, 22, 32, 0.82)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'cache' && <CacheTab />}
          {activeTab === 'leaderboards' && <LeaderboardsTab />}
          {activeTab === 'events'      && <SeasonalEventsTab />}
          {activeTab === 'cards'    && <AdminCardsTab />}
          {activeTab === 'logs'     && <LogsTab />}
          {activeTab === 'webhooks' && <WebhooksTab />}
        </div>
      </div>
    </div>
  )
}
