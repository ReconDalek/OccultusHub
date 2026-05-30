import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

export default function PagesTab() {
  const [pages, setPages] = useState({})
  const [loading, setLoading] = useState(true)

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
      const token = localStorage.getItem('occultusSession')
      const res = await fetch(`${API_BASE_URL}/api/admin/pages/${pageName}/toggle`, {
        method: 'POST',
        headers: { Authorization: token },
      })
      if (res.ok) {
        fetchPages()
      }
    } catch (err) {
      console.error('Failed to toggle page:', err)
    }
  }

  if (loading) {
    return <p style={{ color: '#a1a1aa' }}>Loading page settings...</p>
  }

  const pageList = [
    { name: 'factions', label: 'Factions', icon: '⚔️' },
    { name: 'companies', label: 'Companies', icon: '🏢' },
    { name: 'leadership', label: 'Leadership', icon: '👑' },
    { name: 'respect', label: 'Respect Board', icon: '🏆' },
  ]

  return (
    <div>
      <p style={{ color: '#a1a1aa', marginBottom: '24px' }}>
        Toggle visibility of pages on the site. Hidden pages will not appear in the navigation.
      </p>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
        {pageList.map((page) => (
          <div
            key={page.name}
            className="p-6 rounded-lg border transition-all cursor-pointer"
            onClick={() => togglePage(page.name)}
            style={{
              background: pages[page.name] ? 'rgba(179,18,63,0.1)' : 'rgba(255,0,0,0.1)',
              border: pages[page.name]
                ? '1px solid rgba(179,18,63,0.3)'
                : '1px solid rgba(255,0,0,0.3)',
            }}
          >
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>
              {page.icon}
            </div>
            <h4 style={{ color: '#f4f4f5', marginBottom: '8px' }}>{page.label}</h4>
            <p style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '12px' }}>
              Status: {pages[page.name] ? '✓ Visible' : '✗ Hidden'}
            </p>
            <button
              className="w-full py-2 rounded border-none cursor-pointer transition-all hover:opacity-80"
              style={{
                background: pages[page.name]
                  ? 'rgba(255,0,0,0.2)'
                  : 'rgba(179,18,63,0.2)',
                color: pages[page.name] ? '#ff6b6b' : '#ff2f6d',
              }}
            >
              {pages[page.name] ? 'Hide Page' : 'Show Page'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
