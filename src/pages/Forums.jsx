import { useState, useEffect, useCallback } from 'react'
import { useSession } from '../hooks/useSession'
import { API_BASE_URL } from '../config/api'
import ForumEditor from '../components/Forums/ForumEditor'

const CATEGORIES = ['general', 'guides', 'announcements', 'archive']

function formatDate(dt) {
  if (!dt) return ''
  const d = new Date(dt)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

// ── Show Code Modal ──────────────────────────────────────────────────────────
function ShowCodeModal({ html, onClose }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(html).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(10,10,15,0.98)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '800px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <span className="font-cinzel" style={{ color: '#f4f4f5', letterSpacing: '2px', fontSize: '14px' }}>
            SOURCE CODE
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={copy}
              style={{
                background: copied ? 'rgba(34,197,94,0.2)' : 'linear-gradient(135deg, #b3123f, #6d28d9)',
                border: 'none', color: '#fff', padding: '8px 18px', borderRadius: '8px',
                cursor: 'pointer', fontSize: '13px',
              }}
            >
              {copied ? '✓ Copied!' : 'Copy to Clipboard'}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.08)', border: 'none', color: '#a1a1aa',
                padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
              }}
            >
              Close
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          <p style={{ color: '#71717a', fontSize: '12px', marginBottom: '12px' }}>
            Paste this into Torn's forum source editor (the &lt;/&gt; button) to recreate this post.
          </p>
          <pre style={{
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px',
            padding: '16px',
            color: '#a5f3fc',
            fontFamily: 'monospace',
            fontSize: '12px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            margin: 0,
            overflowX: 'auto',
          }}>
            {html}
          </pre>
        </div>
      </div>
    </div>
  )
}

// ── Single Post View ─────────────────────────────────────────────────────────
function PostView({ post, user, onBack, onEdit, onDelete }) {
  const [showCode, setShowCode] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const canEdit = user?.userId === post.author_id || user?.isAdmin || user?.isLeader

  return (
    <div>
      {/* Back + actions bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
        <button
          onClick={onBack}
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#a1a1aa', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
          }}
        >
          ← Back to Forums
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowCode(true)}
            style={{
              background: 'rgba(109,40,217,0.15)', border: '1px solid rgba(109,40,217,0.3)',
              color: '#a78bfa', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
            }}
          >
            &lt;/&gt; Show Code
          </button>
          {canEdit && (
            <>
              <button
                onClick={onEdit}
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#d4d4d8', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
                }}
              >
                Edit
              </button>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{
                    background: 'rgba(179,18,63,0.1)', border: '1px solid rgba(179,18,63,0.2)',
                    color: '#f87171', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
                  }}
                >
                  Delete
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={onDelete}
                    style={{ background: '#b3123f', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#a1a1aa', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Post card */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        {/* Post header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <h1 className="font-cinzel" style={{ color: '#f4f4f5', fontSize: '22px', letterSpacing: '2px', margin: '0 0 10px 0' }}>
            {post.title}
          </h1>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: '#71717a' }}>
            <span>By <span style={{ color: '#a78bfa' }}>{post.author_name}</span></span>
            <span>{formatDate(post.created_at)}</span>
            {post.updated_at !== post.created_at && (
              <span style={{ fontStyle: 'italic' }}>Edited {formatDate(post.updated_at)}</span>
            )}
            {post.category && post.category !== 'general' && (
              <span style={{
                background: 'rgba(109,40,217,0.15)', border: '1px solid rgba(109,40,217,0.25)',
                color: '#a78bfa', padding: '1px 8px', borderRadius: '12px', textTransform: 'capitalize',
              }}>
                {post.category}
              </span>
            )}
          </div>
        </div>

        {/* Post content — render Torn-compatible HTML */}
        <div style={{ padding: '24px' }}>
          <style>{`
            .forum-post-content { color: #e4e4e7; font-size: 14px; line-height: 1.75; }
            .forum-post-content b, .forum-post-content strong { font-weight: 700; }
            .forum-post-content i, .forum-post-content em { font-style: italic; }
            .forum-post-content u { text-decoration: underline; }
            .forum-post-content s { text-decoration: line-through; }
            .forum-post-content a { color: #a78bfa; }
            .forum-post-content blockquote {
              border-left: 3px solid rgba(109,40,217,0.6);
              margin: 12px 0; padding: 4px 14px; color: #a1a1aa;
            }
            .forum-post-content ul { padding-left: 22px; margin: 8px 0; list-style: disc; }
            .forum-post-content ol { padding-left: 22px; margin: 8px 0; list-style: decimal; }
            .forum-post-content img { max-width: 100%; border-radius: 4px; }
            .forum-post-content p { margin: 0 0 8px 0; }
          `}</style>
          <div
            className="forum-post-content"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </div>
      </div>

      {showCode && <ShowCodeModal html={post.content} onClose={() => setShowCode(false)} />}
    </div>
  )
}

// ── Post Form (Create / Edit) ────────────────────────────────────────────────
function PostForm({ initial, onSubmit, onCancel, saving }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [content, setContent] = useState(initial?.content || '')
  const [category, setCategory] = useState(initial?.category || 'general')

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({ title, content, category })
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="font-cinzel" style={{ color: '#f4f4f5', fontSize: '18px', letterSpacing: '3px', margin: 0 }}>
          {initial ? 'EDIT POST' : 'NEW POST'}
        </h2>
        <button
          type="button" onClick={onCancel}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#a1a1aa', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
        >
          Cancel
        </button>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', marginBottom: '6px', letterSpacing: '1px' }}>
            TITLE
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            maxLength={150}
            placeholder="Post title..."
            style={{
              width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', color: '#f4f4f5', padding: '10px 14px', fontSize: '14px',
              boxSizing: 'border-box', outline: 'none',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', marginBottom: '6px', letterSpacing: '1px' }}>
            CATEGORY
          </label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', color: '#f4f4f5', padding: '10px 14px', fontSize: '14px',
              cursor: 'pointer', textTransform: 'capitalize',
            }}
          >
            {CATEGORIES.map(c => <option key={c} value={c} style={{ background: '#0a0a0f' }}>{c}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', marginBottom: '6px', letterSpacing: '1px' }}>
          CONTENT
        </label>
        <ForumEditor content={content} onChange={setContent} />
      </div>

      <button
        type="submit"
        disabled={saving || !title.trim() || !content.trim()}
        style={{
          background: saving ? 'rgba(109,40,217,0.3)' : 'linear-gradient(135deg, #b3123f, #6d28d9)',
          border: 'none', color: '#fff', padding: '10px 28px', borderRadius: '8px',
          cursor: saving ? 'default' : 'pointer', fontSize: '14px',
          opacity: (!title.trim() || !content.trim()) ? 0.5 : 1,
        }}
      >
        {saving ? 'Saving...' : initial ? 'Save Changes' : 'Create Post'}
      </button>
    </form>
  )
}

// ── Forums List ──────────────────────────────────────────────────────────────
function PostsList({ posts, onSelect, onNew, loading }) {
  const [categoryFilter, setCategoryFilter] = useState('all')

  const filtered = categoryFilter === 'all'
    ? posts
    : posts.filter(p => p.category === categoryFilter)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 className="font-cinzel" style={{ color: '#f4f4f5', fontSize: '26px', letterSpacing: '4px', margin: 0 }}>
          FORUMS
        </h1>
        <button
          onClick={onNew}
          style={{
            background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
            border: 'none', color: '#fff', padding: '10px 22px', borderRadius: '8px',
            cursor: 'pointer', fontSize: '13px', letterSpacing: '1px',
          }}
        >
          + New Post
        </button>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {['all', ...CATEGORIES].map(c => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            style={{
              background: categoryFilter === c ? 'rgba(109,40,217,0.25)' : 'rgba(255,255,255,0.04)',
              border: categoryFilter === c ? '1px solid rgba(109,40,217,0.5)' : '1px solid rgba(255,255,255,0.08)',
              color: categoryFilter === c ? '#a78bfa' : '#71717a',
              padding: '6px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px',
              textTransform: 'capitalize', letterSpacing: '0.5px',
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Thread list */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        {/* Column headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 120px 120px',
          padding: '10px 20px',
          background: 'rgba(0,0,0,0.3)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          fontSize: '11px', color: '#52525b', letterSpacing: '1.5px',
          fontFamily: "'Cinzel', serif",
        }}>
          <span>THREAD</span>
          <span style={{ textAlign: 'center' }}>AUTHOR</span>
          <span style={{ textAlign: 'right' }}>DATE</span>
        </div>

        {loading && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#52525b', fontSize: '14px' }}>
            Loading posts...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#52525b', fontSize: '14px' }}>
            No posts yet. Be the first to create one.
          </div>
        )}

        {filtered.map((post, idx) => (
          <div
            key={post.id}
            onClick={() => onSelect(post)}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 120px 120px',
              padding: '14px 20px',
              borderBottom: idx < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              cursor: 'pointer',
              alignItems: 'center',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ color: '#e4e4e7', fontSize: '14px', fontWeight: '500' }}>{post.title}</span>
                {post.category && post.category !== 'general' && (
                  <span style={{
                    background: 'rgba(109,40,217,0.12)', border: '1px solid rgba(109,40,217,0.2)',
                    color: '#7c3aed', padding: '1px 7px', borderRadius: '10px',
                    fontSize: '11px', textTransform: 'capitalize',
                  }}>
                    {post.category}
                  </span>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'center', color: '#a78bfa', fontSize: '12px' }}>
              {post.author_name}
            </div>
            <div style={{ textAlign: 'right', color: '#52525b', fontSize: '11px' }}>
              {formatDate(post.created_at)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Forums Page ─────────────────────────────────────────────────────────
export default function Forums() {
  const { user, loading: sessionLoading } = useSession()
  const [view, setView] = useState('list')   // 'list' | 'post' | 'new' | 'edit'
  const [posts, setPosts] = useState([])
  const [selectedPost, setSelectedPost] = useState(null)
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const fetchPosts = useCallback(async () => {
    setLoadingPosts(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/forums/posts`, { headers: authHeaders() })
      const data = await res.json()
      if (data.posts) setPosts(data.posts)
    } catch {
      setError('Failed to load posts')
    } finally {
      setLoadingPosts(false)
    }
  }, [user])

  useEffect(() => {
    if (user) fetchPosts()
  }, [user, fetchPosts])

  const openPost = async (post) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/forums/posts/${post.id}`, { headers: authHeaders() })
      const data = await res.json()
      setSelectedPost(data.post)
      setView('post')
    } catch {
      setError('Failed to load post')
    }
  }

  const handleCreate = async ({ title, content, category }) => {
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/forums/posts`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title, content, category }),
      })
      const data = await res.json()
      if (res.ok) {
        await fetchPosts()
        setView('list')
      } else {
        setError(data.error || 'Failed to create post')
      }
    } catch {
      setError('Failed to create post')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async ({ title, content, category }) => {
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/forums/posts/${selectedPost.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ title, content, category }),
      })
      const data = await res.json()
      if (res.ok) {
        await fetchPosts()
        const refreshed = await fetch(`${API_BASE_URL}/api/forums/posts/${selectedPost.id}`, { headers: authHeaders() })
        const refreshedData = await refreshed.json()
        setSelectedPost(refreshedData.post)
        setView('post')
      } else {
        setError(data.error || 'Failed to update post')
      }
    } catch {
      setError('Failed to update post')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/forums/posts/${selectedPost.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      await fetchPosts()
      setSelectedPost(null)
      setView('list')
    } catch {
      setError('Failed to delete post')
    }
  }

  if (sessionLoading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525b' }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '40px 24px' }}>
      {/* Breadcrumbs */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '32px', fontSize: '12px', color: '#52525b' }}>
        <span
          onClick={() => setView('list')}
          style={{ cursor: view !== 'list' ? 'pointer' : 'default', color: view !== 'list' ? '#a78bfa' : '#52525b' }}
        >
          Forums
        </span>
        {(view === 'post' || view === 'edit') && selectedPost && (
          <>
            <span>›</span>
            <span
              onClick={() => setView('post')}
              style={{ cursor: view === 'edit' ? 'pointer' : 'default', color: view === 'edit' ? '#a78bfa' : '#52525b', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {selectedPost.title}
            </span>
          </>
        )}
        {view === 'new' && <><span>›</span><span style={{ color: '#52525b' }}>New Post</span></>}
        {view === 'edit' && <><span>›</span><span style={{ color: '#52525b' }}>Edit</span></>}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          background: 'rgba(179,18,63,0.1)', border: '1px solid rgba(179,18,63,0.2)',
          borderRadius: '8px', padding: '12px 16px', color: '#f87171',
          fontSize: '13px', marginBottom: '20px',
          display: 'flex', justifyContent: 'space-between',
        }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {view === 'list' && (
        <PostsList
          posts={posts}
          loading={loadingPosts}
          onSelect={openPost}
          onNew={() => setView('new')}
        />
      )}

      {view === 'post' && selectedPost && (
        <PostView
          post={selectedPost}
          user={user}
          onBack={() => setView('list')}
          onEdit={() => setView('edit')}
          onDelete={handleDelete}
        />
      )}

      {view === 'new' && (
        <PostForm
          onSubmit={handleCreate}
          onCancel={() => setView('list')}
          saving={saving}
        />
      )}

      {view === 'edit' && selectedPost && (
        <PostForm
          initial={selectedPost}
          onSubmit={handleUpdate}
          onCancel={() => setView('post')}
          saving={saving}
        />
      )}
    </div>
  )
}
