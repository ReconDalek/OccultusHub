import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

// Add new pages here and seed page_settings in the DB — they'll appear automatically.
const PAGE_META = {
  factions:   { label: 'Factions',      icon: '⚔️' },
  companies:  { label: 'Companies',     icon: '🏢' },
  leadership: { label: 'Leadership',    icon: '👑' },
  respect:    { label: 'Respect Board', icon: '🏆' },
}

export default function PagesTab() {
  const [pages, setPages] = useState({})
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(null)

  useEffect(() => {
    fetchPages()
  }, [])

  const fetchPages = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/pages`, {
        headers: { Authorization: token },
      })
      const data = await res.json()
      setPages(data)
    } catch (err) {
      console.error('Failed to fetch pages:', err)
    } finally {
      setLoading(false)
    }
  }

  const togglePage = async (pageName) => {
    try {
      setToggling(pageName)
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/pages/${pageName}/toggle`, {
        method: 'POST',
        headers: { Authorization: token },
      })
      if (res.ok) {
        const data = await res.json()
        setPages((prev) => ({ ...prev, [pageName]: data.isVisible }))
      }
    } catch (err) {
      console.error('Failed to toggle page:', err)
    } finally {
      setToggling(null)
    }
  }

  if (loading) {
    return <p style={{ color: '#a1a1aa' }}>Loading page settings...</p>
  }

  const pageNames = Object.keys(pages)

  if (pageNames.length === 0) {
    return <p style={{ color: '#a1a1aa' }}>No pages found in database.</p>
  }

  return (
    <div>
      <p style={{ color: '#a1a1aa', marginBottom: '24px' }}>
        Toggle visibility of pages on the site. Hidden pages will not appear in the navigation and their routes will be disabled.
      </p>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
        {pageNames.map((name) => {
          const meta = PAGE_META[name] ?? { label: name.charAt(0).toUpperCase() + name.slice(1), icon: '📄' }
          const visible = pages[name]
          const busy = toggling === name

          return (
            <div
              key={name}
              className="p-6 rounded-lg border"
              style={{
                background: visible ? 'rgba(179,18,63,0.1)' : 'rgba(255,0,0,0.05)',
                border: visible
                  ? '1px solid rgba(179,18,63,0.3)'
                  : '1px solid rgba(255,80,80,0.2)',
                opacity: busy ? 0.6 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>{meta.icon}</div>
              <h4 style={{ color: '#f4f4f5', marginBottom: '4px' }}>{meta.label}</h4>
              <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '12px', fontFamily: 'monospace' }}>
                /{name}
              </p>
              <p style={{ color: visible ? '#a1a1aa' : '#6b6b6b', fontSize: '14px', marginBottom: '16px' }}>
                {visible ? '✓ Visible' : '✗ Hidden'}
              </p>
              <button
                onClick={() => togglePage(name)}
                disabled={busy}
                className="w-full py-2 rounded border-none cursor-pointer transition-all hover:opacity-80"
                style={{
                  background: visible ? 'rgba(255,0,0,0.2)' : 'rgba(179,18,63,0.2)',
                  color: visible ? '#ff6b6b' : '#ff2f6d',
                }}
              >
                {busy ? 'Updating...' : visible ? 'Hide Page' : 'Show Page'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
