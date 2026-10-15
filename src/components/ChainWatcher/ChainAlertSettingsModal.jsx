import { useState } from 'react'
import Modal from './Modal'
import { notificationSupported, notificationPermission, requestNotificationPermission } from './chainAlerts'

const ACCENT = '#8b5cf6'

function thresholdLabel(s) {
  if (s % 60 === 0) return `${s / 60} min`
  if (s > 60) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${s}s`
}

const checkboxRow = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
  color: 'var(--text-secondary)', marginBottom: 10, cursor: 'pointer',
}

export default function ChainAlertSettingsModal({ settings, onChange, onClose, pipSupported }) {
  const [thresholdInput, setThresholdInput] = useState('')
  const [permission, setPermission] = useState(() => notificationPermission())

  async function toggleNotification(checked) {
    if (checked && permission !== 'granted') {
      const result = await requestNotificationPermission()
      setPermission(result)
      if (result !== 'granted') return // left off if the browser prompt was denied/dismissed
    }
    onChange({ ...settings, notification: checked })
  }

  function addThreshold() {
    const val = parseInt(thresholdInput, 10)
    if (!val || val <= 0 || settings.thresholds.includes(val)) { setThresholdInput(''); return }
    onChange({ ...settings, thresholds: [...settings.thresholds, val].sort((a, b) => b - a) })
    setThresholdInput('')
  }

  function removeThreshold(val) {
    onChange({ ...settings, thresholds: settings.thresholds.filter((t) => t !== val) })
  }

  return (
    <Modal onClose={onClose} maxWidth={420}>
      <h3 style={{ color: '#f4f4f5', fontFamily: 'Cinzel,serif', fontSize: 16, letterSpacing: 1, margin: '0 0 16px' }}>
        Chain Timer Settings
      </h3>

      <label style={checkboxRow}>
        <input type="checkbox" checked={settings.enabled} onChange={(e) => onChange({ ...settings, enabled: e.target.checked })} />
        Enable timer alerts
      </label>

      <div style={{ opacity: settings.enabled ? 1 : 0.4, pointerEvents: settings.enabled ? 'auto' : 'none', marginLeft: 4 }}>
        <label style={checkboxRow}>
          <input type="checkbox" checked={settings.sound} onChange={(e) => onChange({ ...settings, sound: e.target.checked })} />
          Sound (chirp)
        </label>
        <label style={checkboxRow}>
          <input type="checkbox" checked={settings.flash} onChange={(e) => onChange({ ...settings, flash: e.target.checked })} />
          Screen flash (5x, red)
        </label>

        {notificationSupported() && (
          <>
            <label style={{ ...checkboxRow, marginBottom: permission === 'denied' ? 2 : 16 }}>
              <input type="checkbox" checked={settings.notification} onChange={(e) => toggleNotification(e.target.checked)} />
              Desktop notification
            </label>
            {permission === 'denied' && (
              <p style={{ fontSize: 11, color: '#f87171', margin: '0 0 16px 24px' }}>
                Notifications are blocked for this site — allow them in your browser's site settings to use this.
              </p>
            )}
          </>
        )}

        <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '0 0 8px' }}>Alert when time remaining drops to:</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {settings.thresholds.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>No alerts set.</span>
          )}
          {settings.thresholds.map((t) => (
            <span key={t} style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 8px', borderRadius: 6,
              background: 'rgba(139,92,246,0.12)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.35)',
            }}>
              {thresholdLabel(t)}
              <button
                onClick={() => removeThreshold(t)}
                style={{ background: 'none', border: 'none', color: '#c4b5fd', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex" style={{ gap: 8, marginBottom: 20 }}>
          <input
            type="number" min="1" placeholder="Seconds remaining"
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addThreshold()}
            style={{
              flex: 1, fontSize: 13, padding: '6px 10px', borderRadius: 6,
              background: 'rgba(255,255,255,0.04)', color: '#f4f4f5', border: '1px solid var(--border-subtle)',
            }}
          />
          <button
            onClick={addThreshold}
            style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, background: ACCENT, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            Add
          </button>
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
        <label style={{ ...checkboxRow, marginBottom: 2 }}>
          <input type="checkbox" checked={settings.alwaysOnTop} onChange={(e) => onChange({ ...settings, alwaysOnTop: e.target.checked })} />
          Pop-out timer floats on top of other windows
        </label>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '0 0 0 24px' }}>
          {pipSupported
            ? 'Supported in this browser — the pop-out timer stays visible over other apps.'
            : "Not supported in this browser — the pop-out timer opens as a normal window instead."}
        </p>
      </div>

      <div style={{ marginTop: 20, textAlign: 'right' }}>
        <button
          onClick={onClose}
          style={{
            fontSize: 13, padding: '7px 16px', borderRadius: 7, background: 'rgba(255,255,255,0.05)',
            color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer',
          }}
        >
          Done
        </button>
      </div>
    </Modal>
  )
}
