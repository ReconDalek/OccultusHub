import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'
import { EVENT_DEFS, PREVIEW_KEY } from '../SeasonalEvents'

export default function SeasonalEventsTab() {
  const [enabled, setEnabled]     = useState({})   // { event_id: bool }
  const [toggling, setToggling]   = useState({})   // { event_id: bool }
  const [previewId, setPreviewId] = useState(() => localStorage.getItem(PREVIEW_KEY))
  const [message, setMessage]     = useState(null)

  // Fetch current enabled states from public settings
  function fetchSettings() {
    fetch(`${API_BASE_URL}/api/settings/public`)
      .then(r => r.json())
      .then(d => {
        const map = {}
        EVENT_DEFS.forEach(ev => { map[ev.id] = d?.[`event_${ev.id}`] !== '0' })
        setEnabled(map)
      })
      .catch(() => {})
  }

  useEffect(() => { fetchSettings() }, [])

  async function toggleEvent(id, current) {
    setToggling(t => ({ ...t, [id]: true }))
    try {
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/settings/event_${id}`, {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: current ? '0' : '1' }),
      })
      const data = await res.json()
      if (data.success) {
        setEnabled(e => ({ ...e, [id]: !current }))
        showMsg('success', `${EVENT_DEFS.find(e => e.id === id)?.name} ${current ? 'disabled' : 'enabled'}.`)
      } else {
        showMsg('error', data.error || 'Failed.')
      }
    } catch {
      showMsg('error', 'Network error.')
    } finally {
      setToggling(t => ({ ...t, [id]: false }))
    }
  }

  function startPreview(id) {
    localStorage.setItem(PREVIEW_KEY, id)
    setPreviewId(id)
    window.dispatchEvent(new Event('occultus_preview_change'))
    showMsg('success', `Previewing ${EVENT_DEFS.find(e => e.id === id)?.name} — only visible to you.`)
  }

  function clearPreview() {
    localStorage.removeItem(PREVIEW_KEY)
    setPreviewId(null)
    window.dispatchEvent(new Event('occultus_preview_change'))
    showMsg('success', 'Preview cleared.')
  }

  function showMsg(type, text) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const now = new Date()

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontFamily: 'Cinzel, serif', letterSpacing: '1px' }}>
            Seasonal Themes
          </h3>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: '13px' }}>
            Toggle global event effects. Use <strong style={{ color: '#a78bfa' }}>Test Preview</strong> to see an effect locally — only visible on this browser.
          </p>
        </div>
        {previewId && (
          <button
            onClick={clearPreview}
            style={{
              padding: '8px 18px', borderRadius: '10px', fontWeight: 700, fontSize: '12px',
              background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)',
              color: '#fde68a', cursor: 'pointer', letterSpacing: '0.05em',
            }}
          >
            ✕ End Preview
          </button>
        )}
      </div>

      {message && (
        <div style={{
          marginBottom: '20px', padding: '10px 16px', borderRadius: '8px', fontSize: '13px',
          background: message.type === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          border: `1px solid ${message.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: message.type === 'success' ? '#86efac' : '#fca5a5',
        }}>
          {message.text}
        </div>
      )}

      {/* Event cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
        {EVENT_DEFS.map(ev => {
          const isOn      = enabled[ev.id] !== false
          const isTogglin = toggling[ev.id]
          const autoNow   = ev.isActive()
          const isPreviewing = previewId === ev.id

          return (
            <div
              key={ev.id}
              style={{
                padding: '18px', borderRadius: '14px',
                background: isPreviewing
                  ? 'rgba(109,40,217,0.12)'
                  : autoNow
                    ? 'rgba(34,197,94,0.06)'
                    : 'rgba(255,255,255,0.03)',
                border: isPreviewing
                  ? '1px solid rgba(109,40,217,0.4)'
                  : autoNow
                    ? '1px solid rgba(34,197,94,0.2)'
                    : '1px solid rgba(255,255,255,0.07)',
                transition: 'border-color 0.2s, background 0.2s',
              }}
            >
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ fontSize: '22px', lineHeight: 1 }}>{ev.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', fontWeight: 600 }}>{ev.name}</span>
                    {autoNow && (
                      <span style={{
                        fontSize: '9px', letterSpacing: '1px', padding: '1px 6px', borderRadius: '4px',
                        background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.3)',
                        color: '#86efac',
                      }}>ACTIVE NOW</span>
                    )}
                    {isPreviewing && (
                      <span style={{
                        fontSize: '9px', letterSpacing: '1px', padding: '1px 6px', borderRadius: '4px',
                        background: 'rgba(109,40,217,0.25)', border: '1px solid rgba(109,40,217,0.45)',
                        color: '#c4b5fd',
                      }}>PREVIEWING</span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: "var(--text-muted)", marginTop: '1px' }}>{ev.dateDesc}</div>
                </div>
              </div>

              {/* Banner preview pill */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '3px 10px', borderRadius: '12px', marginBottom: '14px',
                background: ev.banner.bg, border: `1px solid ${ev.banner.border}`,
              }}>
                <span style={{ fontSize: '10px' }}>{ev.icon}</span>
                <span style={{ fontSize: '9px', color: ev.banner.color, letterSpacing: '0.18em', fontFamily: 'Cinzel, serif' }}>
                  {ev.banner.text}
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px' }}>
                {/* Global toggle */}
                <button
                  onClick={() => toggleEvent(ev.id, isOn)}
                  disabled={isTogglin}
                  style={{
                    flex: 1, padding: '7px 10px', borderRadius: '8px',
                    fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em',
                    background: isOn ? 'rgba(34,197,94,0.14)' : 'rgba(100,100,120,0.14)',
                    border: `1px solid ${isOn ? 'rgba(34,197,94,0.35)' : 'rgba(100,100,120,0.25)'}`,
                    color: isOn ? '#86efac' : "var(--text-muted)",
                    cursor: isTogglin ? 'not-allowed' : 'pointer',
                    opacity: isTogglin ? 0.6 : 1,
                  }}
                >
                  {isTogglin ? '...' : isOn ? '● Enabled' : '○ Disabled'}
                </button>

                {/* Local preview */}
                <button
                  onClick={() => isPreviewing ? clearPreview() : startPreview(ev.id)}
                  style={{
                    flex: 1, padding: '7px 10px', borderRadius: '8px',
                    fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em',
                    background: isPreviewing ? 'rgba(109,40,217,0.22)' : 'rgba(109,40,217,0.1)',
                    border: `1px solid ${isPreviewing ? 'rgba(109,40,217,0.5)' : 'rgba(109,40,217,0.25)'}`,
                    color: isPreviewing ? '#c4b5fd' : '#8b5cf6',
                    cursor: 'pointer',
                  }}
                >
                  {isPreviewing ? '✕ Stop' : '▶ Test'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <p style={{ marginTop: '20px', fontSize: '11px', color: "var(--text-faint)", textAlign: 'center' }}>
        Global toggles affect all users. Test Preview is local to this browser only and clears on refresh.
      </p>
    </div>
  )
}
