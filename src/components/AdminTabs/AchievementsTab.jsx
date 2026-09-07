import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

const FACTION_NAMES = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' }
const TIER_COLORS = { Bronze: '#cd7f32', Silver: '#c0c0c0', Gold: '#ffd700' }

function fmt(n) {
  if (n == null) return '—'
  if (typeof n === 'boolean') return n ? 'Yes' : 'No'
  return Number(n).toLocaleString()
}

function Toggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
        background: on ? '#4ade80' : 'rgba(255,255,255,0.15)', position: 'relative', flexShrink: 0, padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: '2px', left: on ? '18px' : '2px', width: '16px', height: '16px',
        borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
      }} />
    </button>
  )
}

function BadgeRow({ badge, holders, onSave }) {
  const [expanded, setExpanded] = useState(false)
  const [enabled, setEnabled] = useState(badge.enabled)
  const [thresholds, setThresholds] = useState(
    badge.tiers ? { bronze: badge.tiers[0].threshold, silver: badge.tiers[1].threshold, gold: badge.tiers[2].threshold } : null
  )
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const holderList = holders?.[badge.key] || []

  const handleSave = async () => {
    setSaving(true)
    await onSave(badge.key, {
      enabled,
      bronze_threshold: thresholds?.bronze ?? null,
      silver_threshold: thresholds?.silver ?? null,
      gold_threshold: thresholds?.gold ?? null,
    })
    setSaving(false)
    setDirty(false)
  }

  const handleToggle = async (next) => {
    setEnabled(next)
    setSaving(true)
    await onSave(badge.key, {
      enabled: next,
      bronze_threshold: thresholds?.bronze ?? null,
      silver_threshold: thresholds?.silver ?? null,
      gold_threshold: thresholds?.gold ?? null,
    })
    setSaving(false)
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
      padding: '14px', opacity: enabled ? 1 : 0.6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '22px' }}>{badge.icon}</span>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <p style={{ color: '#f4f4f5', fontSize: '14px', fontWeight: '600', margin: 0 }}>
            {badge.label}
            <span style={{ color: 'var(--text-faint)', fontSize: '10px', fontWeight: '400', marginLeft: '8px' }}>
              {badge.binary ? 'Binary' : 'Tiered'}
            </span>
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '3px 0 0' }}>
            {badge.description}
          </p>
        </div>

        {!badge.binary && thresholds && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {[['bronze', 'Bronze'], ['silver', 'Silver'], ['gold', 'Gold']].map(([k, label]) => (
              <div key={k}>
                <label style={{ color: TIER_COLORS[label], fontSize: '9px', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>{label}</label>
                <input
                  type="number" value={thresholds[k]}
                  onChange={e => { setThresholds(t => ({ ...t, [k]: parseFloat(e.target.value) || 0 })); setDirty(true) }}
                  style={{
                    width: '70px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '6px', color: '#f4f4f5', padding: '5px 8px', fontSize: '12px',
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {dirty && (
          <button onClick={handleSave} disabled={saving} style={{
            padding: '6px 14px', borderRadius: '6px', border: 'none', background: 'rgba(179,18,63,0.8)',
            color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
          }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}

        <Toggle on={enabled} onChange={handleToggle} />

        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap',
          }}
        >
          {expanded ? 'Hide' : 'View'} Holders ({holderList.length})
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px', maxHeight: '260px', overflowY: 'auto' }}>
          {holderList.length === 0 ? (
            <p style={{ color: 'var(--text-faint)', fontSize: '12px', margin: 0 }}>No members currently hold this badge.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px' }}>
              {holderList.map(h => (
                <div key={h.torn_user_id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
                  padding: '6px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.02)', fontSize: '12px',
                }}>
                  <span style={{ color: h.is_active ? '#f4f4f5' : 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.username} <span style={{ color: 'var(--text-faint)', fontSize: '10px' }}>({FACTION_NAMES[h.faction_id] ?? '—'})</span>
                  </span>
                  <span style={{ flexShrink: 0, color: h.tier ? TIER_COLORS[h.tier] : '#4ade80', fontWeight: '600' }}>
                    {h.tier ? `${h.tier} (${fmt(h.value)})` : 'Earned'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AchievementsTab() {
  const [badges, setBadges] = useState(null)
  const [holders, setHolders] = useState(null)
  const [memberCount, setMemberCount] = useState(0)
  const [error, setError] = useState(null)
  const token = localStorage.getItem('occultusSession')

  const load = () => {
    Promise.all([
      fetch(`${API_BASE_URL}/api/admin/achievements/configs`, { headers: { Authorization: token } }).then(r => r.json()),
      fetch(`${API_BASE_URL}/api/admin/achievements/holders`, { headers: { Authorization: token } }).then(r => r.json()),
    ]).then(([cfgData, holderData]) => {
      if (cfgData.error) { setError(cfgData.error); return }
      if (holderData.error) { setError(holderData.error); return }
      setBadges(cfgData.badges)
      setHolders(holderData.holders)
      setMemberCount(holderData.member_count)
    }).catch(e => setError(e.message))
  }

  useEffect(load, [])

  const handleSave = async (key, body) => {
    await fetch(`${API_BASE_URL}/api/admin/achievements/configs/${key}`, {
      method: 'PUT',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    load() // re-fetch holders too — a threshold change can move people in/out of a tier immediately
  }

  if (error) return <p style={{ color: '#f87171', fontSize: '13px' }}>{error}</p>
  if (!badges) return <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Loading achievements…</p>

  return (
    <div>
      <div style={{ marginBottom: '18px' }}>
        <h3 style={{ color: '#f4f4f5', marginBottom: '4px' }}>Achievements</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: 0 }}>
          Manage which badges are active and their thresholds — changes take effect immediately for everyone.
          Computed live across {memberCount} tracked members (active + departed).
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {badges.map(b => (
          <BadgeRow key={b.key} badge={b} holders={holders} onSave={handleSave} />
        ))}
      </div>
    </div>
  )
}
