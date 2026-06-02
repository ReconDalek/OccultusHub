import { useState } from 'react'
import { useSession } from '../hooks/useSession'
import RespectTab from '../components/LeadershipTabs/RespectTab'
import EventsTab from '../components/LeadershipTabs/EventsTab'
import SchedulesTab from '../components/LeadershipTabs/SchedulesTab'

const tabs = [
  { id: 'respect', label: 'Respect Tracker' },
  { id: 'events', label: 'Events Calendar' },
  { id: 'schedules', label: 'Faction Schedules' },
  { id: 'activity', label: 'Member Activity' },
  { id: 'notices', label: 'Internal Notices' },
]

function PlaceholderTab({ label }) {
  return (
    <div style={{ color: '#a1a1aa', fontSize: '14px' }}>
      {label} — coming soon.
    </div>
  )
}

export default function Leadership() {
  const { user, loading } = useSession()
  const [activeTab, setActiveTab] = useState('respect')

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <p style={{ color: '#a1a1aa' }}>Checking access…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#07070a', color: '#f4f4f5' }}>
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1
            className="font-cinzel text-white mb-2"
            style={{ fontSize: '40px', letterSpacing: '2px' }}
          >
            LEADERSHIP DASHBOARD
          </h1>
          <p style={{ color: '#a1a1aa', fontSize: '14px' }}>
            Command controls and leadership tools
          </p>
        </div>

        {!user?.isLeader ? (
          <div
            className="max-w-3xl p-10 rounded-3xl text-center"
            style={{ background: 'rgba(255,255,255,0.03)', color: '#a1a1aa' }}
          >
            Access Restricted — Leadership Clearance Required
          </div>
        ) : (
          <>
            {/* Tab navigation */}
            <div
              className="flex gap-0 mb-8 border-b"
              style={{ borderColor: 'rgba(255,255,255,0.08)' }}
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="px-6 py-3 font-medium border-none cursor-pointer transition-all"
                  style={{
                    background: 'transparent',
                    color: activeTab === tab.id ? '#f4f4f5' : '#a1a1aa',
                    borderBottom: activeTab === tab.id ? '2px solid #b3123f' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== tab.id) e.target.style.color = '#f4f4f5'
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== tab.id) e.target.style.color = '#a1a1aa'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div
              className="rounded-2xl p-8"
              style={{
                background: 'rgba(22, 22, 32, 0.82)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {activeTab === 'respect' && <RespectTab />}
              {activeTab === 'events' && <EventsTab />}
              {activeTab === 'schedules' && <SchedulesTab />}
              {activeTab === 'activity' && <PlaceholderTab label="Member Activity" />}
              {activeTab === 'notices' && <PlaceholderTab label="Internal Notices" />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
