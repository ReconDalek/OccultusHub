import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

export default function SettingsTab() {
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/settings`, {
        headers: { Authorization: token },
      })
      const data = await res.json()
      setSettings(data)
    } catch (err) {
      console.error('Failed to fetch settings:', err)
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (key, currentValue) => {
    setEditing(key)
    setValue(currentValue)
  }

  const saveSettings = async (key) => {
    try {
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/settings/${key}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
        },
        body: JSON.stringify({ value }),
      })
      if (res.ok) {
        setSettings({ ...settings, [key]: value })
        setEditing(null)
      }
    } catch (err) {
      console.error('Failed to save setting:', err)
    }
  }

  if (loading) {
    return <p style={{ color: '#a1a1aa' }}>Loading settings...</p>
  }

  const settingsList = [
    { key: 'site_title', label: 'Site Title', type: 'text' },
    { key: 'cache_expiry_minutes', label: 'Cache Expiry (minutes)', type: 'number' },
    { key: 'max_users', label: 'Max Users', type: 'number' },
  ]

  return (
    <div>
      <p style={{ color: '#a1a1aa', marginBottom: '24px' }}>
        Configure system-wide settings and defaults.
      </p>

      <div className="space-y-4">
        {settingsList.map((setting) => (
          <div
            key={setting.key}
            className="p-6 rounded-lg flex items-center justify-between"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div>
              <p style={{ color: '#f4f4f5', marginBottom: '4px' }}>
                {setting.label}
              </p>
              {editing === setting.key ? (
                <input
                  type={setting.type}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="px-3 py-2 rounded border-none"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    color: '#f4f4f5',
                  }}
                />
              ) : (
                <p style={{ color: '#a1a1aa', fontSize: '14px' }}>
                  {settings[setting.key]}
                </p>
              )}
            </div>

            <div>
              {editing === setting.key ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => saveSettings(setting.key)}
                    className="px-4 py-2 rounded border-none cursor-pointer transition-all hover:opacity-80"
                    style={{
                      background: 'rgba(179,18,63,0.2)',
                      color: '#ff2f6d',
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="px-4 py-2 rounded border-none cursor-pointer transition-all hover:opacity-80"
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      color: '#a1a1aa',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => startEdit(setting.key, settings[setting.key])}
                  className="px-4 py-2 rounded border-none cursor-pointer transition-all hover:opacity-80"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    color: '#a1a1aa',
                  }}
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
