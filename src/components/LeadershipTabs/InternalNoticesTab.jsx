import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'
import { getSessionToken } from '../../lib/auth'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function InternalNoticesTab() {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  const token = getSessionToken()
  const headers = { Authorization: token, 'Content-Type': 'application/json' }

  useEffect(() => { fetchNotices() }, [])

  async function fetchNotices() {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/notices`, { headers: { Authorization: token } })
      const data = await res.json()
      setNotices(data.notices || [])
    } catch {} finally {
      setLoading(false)
    }
  }

  async function postNotice() {
    if (!content.trim()) return
    setPosting(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/notices`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to post'); return }
      setNotices(prev => [data.notice, ...prev].slice(0, 10))
      setContent('')
    } catch {
      setError('Failed to post notice')
    } finally {
      setPosting(false)
    }
  }

  async function deleteNotice(id) {
    try {
      await fetch(`${API_BASE_URL}/api/leadership/notices/${id}`, {
        method: 'DELETE',
        headers: { Authorization: token },
      })
      setNotices(prev => prev.filter(n => n.id !== id))
    } catch {}
  }

  return (
    <div>
      <h2 className="font-cinzel mb-1" style={{ fontSize: 22, color: '#f4f4f5' }}>
        Internal Notices
      </h2>
      <p style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 28 }}>
        Post updates for all leadership. Newest notices appear at the top — maximum 10 displayed.
      </p>

      {/* Post form */}
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          padding: 20,
          marginBottom: 28,
        }}
      >
        <label style={{ display: 'block', fontSize: 12, color: '#a1a1aa', marginBottom: 8, fontWeight: 500 }}>
          Post a Notice
        </label>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Write your notice here..."
          maxLength={1000}
          rows={3}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            color: '#f4f4f5',
            fontSize: 13,
            padding: '10px 14px',
            resize: 'vertical',
            outline: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <span style={{ fontSize: 11, color: '#4b5563' }}>{content.length}/1000</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {error && <span style={{ fontSize: 12, color: '#ef4444' }}>{error}</span>}
            <button
              onClick={postNotice}
              disabled={!content.trim() || posting}
              style={{
                background: content.trim() && !posting
                  ? 'linear-gradient(135deg, #b3123f, #6d28d9)'
                  : 'rgba(255,255,255,0.06)',
                border: 'none',
                borderRadius: 8,
                color: content.trim() && !posting ? '#fff' : '#4b5563',
                fontSize: 13,
                fontWeight: 600,
                padding: '8px 20px',
                cursor: content.trim() && !posting ? 'pointer' : 'not-allowed',
                transition: 'background 0.2s',
              }}
            >
              {posting ? 'Posting...' : 'Post Notice'}
            </button>
          </div>
        </div>
      </div>

      {/* Notices list */}
      {loading ? (
        <p style={{ color: '#a1a1aa', fontSize: 13 }}>Loading notices...</p>
      ) : notices.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#4b5563',
            fontSize: 13,
            border: '1px dashed rgba(255,255,255,0.08)',
            borderRadius: 14,
          }}
        >
          No notices posted yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {notices.map(notice => (
            <div
              key={notice.id}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 14,
                padding: '16px 20px',
                position: 'relative',
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    {notice.username?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5' }}>
                      {notice.username}
                    </span>
                    <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>
                      {timeAgo(notice.created_at)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => deleteNotice(notice.id)}
                  title="Delete notice"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#4b5563',
                    cursor: 'pointer',
                    fontSize: 16,
                    lineHeight: 1,
                    padding: '4px 6px',
                    borderRadius: 6,
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                  onMouseLeave={e => e.currentTarget.style.color = '#4b5563'}
                >
                  ×
                </button>
              </div>

              {/* Content */}
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: '#d1d5db',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {notice.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
