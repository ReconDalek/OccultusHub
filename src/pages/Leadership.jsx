import { useState } from 'react'
import { useSession } from '../hooks/useSession'
import InternalNoticesTab from '../components/LeadershipTabs/InternalNoticesTab'
import EventsSchedulesTab from '../components/LeadershipTabs/EventsSchedulesTab'
import LeaderToolsTab from '../components/LeadershipTabs/LeaderToolsTab'
import ChainTrackingTab from '../components/LeadershipTabs/ChainTrackingTab'
import MemberRanksTab from '../components/LeadershipTabs/MemberRanksTab'
import AccountingTab from '../components/LeadershipTabs/AccountingTab'
import ArmoryTab from '../components/LeadershipTabs/ArmoryTab'
import WarningsTab from '../components/LeadershipTabs/WarningsTab'
import OCTab from '../components/LeadershipTabs/OCTab'

const tabs = [
  { id: 'notices',    label: 'Notices' },
  { id: 'events',     label: 'Scheduling' },
  { id: 'chains',     label: 'Warfare' },
  { id: 'ranks',      label: 'Ranks' },
  { id: 'accounting', label: 'Accounting' },
  { id: 'armory',     label: 'Armory' },
  { id: 'oc',         label: 'Organized Crime' },
  { id: 'warnings',   label: 'Warnings' },
  { id: 'tools',      label: 'Tools' },
]

export default function Leadership() {
  const { user, loading } = useSession()
  const [activeTab, setActiveTab] = useState('notices')

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <p style={{ color: "var(--text-secondary)" }}>Checking access…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ color: '#f4f4f5' }}>
      <div className="max-w-[1600px] mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1
            className="font-cinzel text-white mb-2"
            style={{ fontSize: '40px', letterSpacing: '2px' }}
          >
            LEADERSHIP DASHBOARD
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: '14px' }}>
            Command controls and leadership tools
          </p>
        </div>

        {!user?.isLeader ? (
          <div
            className="max-w-3xl p-10 rounded-3xl text-center"
            style={{ background: 'rgba(255,255,255,0.03)', color: "var(--text-secondary)" }}
          >
             — Access Restricted — 
          </div>
        ) : (
          <>
            {/* Tab navigation */}
            <div
              style={{
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                marginBottom: '32px',
                overflowX: 'auto',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <div style={{ display: 'flex', gap: 0, minWidth: 'max-content' }}>
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: '12px 20px',
                      fontWeight: '500',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'color 0.15s',
                      whiteSpace: 'nowrap',
                      background: 'transparent',
                      color: activeTab === tab.id ? '#f4f4f5' : "var(--text-secondary)",
                      borderBottom: activeTab === tab.id ? '2px solid #b3123f' : '2px solid transparent',
                      fontSize: '14px',
                    }}
                    onMouseEnter={(e) => { if (activeTab !== tab.id) e.currentTarget.style.color = '#f4f4f5' }}
                    onMouseLeave={(e) => { if (activeTab !== tab.id) e.currentTarget.style.color = "var(--text-secondary)" }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div
              className="rounded-2xl p-8"
              style={{
                background: 'rgba(22, 22, 32, 0.82)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {activeTab === 'notices' && <InternalNoticesTab />}
              {activeTab === 'events'  && <EventsSchedulesTab />}
              {activeTab === 'tools'   && <LeaderToolsTab />}
              {activeTab === 'chains'  && <ChainTrackingTab />}
              {activeTab === 'ranks'   && <MemberRanksTab />}
              {activeTab === 'accounting' && <AccountingTab />}
              {activeTab === 'armory'    && <ArmoryTab />}
              {activeTab === 'oc'        && <OCTab />}
              {activeTab === 'warnings'  && <WarningsTab />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
