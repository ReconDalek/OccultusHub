import { useState } from 'react'
import Respect from '../../pages/Respect'
import EnergyActivityPanel from './ActivityPanel'
import PersonalStatsPanel from './PersonalStatsPanel'
import CipherReviewTab from './CipherReviewTab'

// ─── Sub-tab bar ──────────────────────────────────────────────────────────────

function SubTabs({ options, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', flexWrap: 'wrap' }}>
      {options.map((opt) => {
        const isActive = active === opt.value
        const disabled = opt.disabled
        return (
          <button
            key={opt.value}
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            style={{
              padding: '7px 18px',
              borderRadius: '8px',
              border: `1px solid ${isActive ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
              background: isActive ? 'rgba(179,18,63,0.15)' : 'transparent',
              color: disabled ? "var(--text-faint)" : isActive ? '#f4f4f5' : "var(--text-secondary)",
              fontSize: '13px',
              fontWeight: isActive ? '600' : '400',
              cursor: disabled ? 'default' : 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            onMouseEnter={(e) => { if (!isActive && !disabled) e.currentTarget.style.color = '#f4f4f5' }}
            onMouseLeave={(e) => { if (!isActive && !disabled) e.currentTarget.style.color = "var(--text-secondary)" }}
          >
            {opt.label}
            {opt.badge && (
              <span style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '10px',
                background: opt.badgeColor ?? 'rgba(255,255,255,0.06)',
                color: opt.badgeText ?? "var(--text-secondary)",
                fontWeight: '600',
                letterSpacing: '0.4px',
              }}>
                {opt.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Respect Tracker panel ────────────────────────────────────────────────────

function RespectPanel() {
  return (
    <div style={{
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      background: 'rgba(22,22,32,0.82)',
      overflow: 'auto',
      maxHeight: '800px',
    }}>
      <Respect />
    </div>
  )
}

// ─── Recruitment panel ────────────────────────────────────────────────────────

function RecruitmentPanel() {
  return (
    <iframe
      src="https://faction-recon.pages.dev/"
      style={{
        width: '100%',
        height: '800px',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        background: '#07070a',
        display: 'block',
      }}
      title="Faction Recruitment"
    />
  )
}


// ─── Main component ───────────────────────────────────────────────────────────

const TOOLS = [
  { value: 'activity',       label: 'Gym Energy' },
  { value: 'personal_stats', label: 'Personal Stats' },
  { value: 'respect',        label: 'Respect Tracker' },
  { value: 'recruitment',    label: 'Recruitment' },
  { value: 'cipher',         label: 'Cipher Review' },
]

export default function LeaderToolsTab() {
  const [activeTool, setActiveTool] = useState('activity')

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2
          style={{
            fontFamily: 'Cinzel, serif',
            color: '#f4f4f5',
            fontSize: '20px',
            letterSpacing: '1px',
            marginBottom: '4px',
          }}
        >
          Tools
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: '13px', margin: 0 }}>
          Command-level resources for managing the order.
        </p>
      </div>

      {/* Tool sub-tabs */}
      <SubTabs options={TOOLS} active={activeTool} onChange={setActiveTool} />

      {/* Panel */}
      {activeTool === 'activity'        && <EnergyActivityPanel />}
      {activeTool === 'personal_stats'  && <PersonalStatsPanel />}
      {activeTool === 'respect'         && <RespectPanel />}
      {activeTool === 'recruitment'     && <RecruitmentPanel />}
      {activeTool === 'cipher'          && <CipherReviewTab />}
    </div>
  )
}
