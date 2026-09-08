import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from '../../hooks/useSession'
import { API_BASE_URL } from '../../config/api'

const HIDE_KEY = 'occultus_radio_hidden'

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return token ? { Authorization: token } : {}
}

const accent = '#1DB954' // Spotify green, used sparingly against the site's red/purple

export default function SpotifyPlayer() {
  const { user } = useSession()

  const [status, setStatus]   = useState(null)   // { enabled, configured, playlistId, addLimitPerDay }
  const [open, setOpen]       = useState(false)
  const [hidden, setHidden]   = useState(() => {
    try { return sessionStorage.getItem(HIDE_KEY) === '1' } catch { return false }
  })

  const [data, setData]       = useState(null)   // { meta, submissions }
  const [q, setQ]             = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy]       = useState(false)
  const [shuffling, setShuffling] = useState(false)
  const [embedKey, setEmbedKey] = useState(0)    // bump to reload the iframe
  const [err, setErr]         = useState(null)
  const searchTimer = useRef(null)

  // ── status ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setStatus(null); return }
    fetch(`${API_BASE_URL}/api/spotify/status`, { headers: authHeaders() })
      .then(r => r.json())
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [user])

  const active = !!user && !hidden && status?.enabled && status?.playlistId

  // ── playlist (poll while open) ──────────────────────────────────────────
  const loadPlaylist = useCallback(() => {
    fetch(`${API_BASE_URL}/api/spotify/playlist`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!open || !active) return
    loadPlaylist()
    const id = setInterval(loadPlaylist, 30000)
    return () => clearInterval(id)
  }, [open, active, loadPlaylist])

  // ── search (debounced) ─────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setResults(null); return }
    searchTimer.current = setTimeout(() => {
      fetch(`${API_BASE_URL}/api/spotify/search?q=${encodeURIComponent(q.trim())}`, { headers: authHeaders() })
        .then(r => r.json())
        .then(d => setResults(d.tracks || []))
        .catch(() => setResults([]))
    }, 350)
    return () => clearTimeout(searchTimer.current)
  }, [q])

  async function addTrack(t) {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/spotify/add`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, uri: t.uri, name: t.name, artist: t.artist, albumArt: t.albumArt }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Could not add that track'); return }
      setData(d); setQ(''); setResults(null)
    } finally { setBusy(false) }
  }

  async function removeTrack(id) {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/spotify/track`, {
        method: 'DELETE',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: id }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Could not remove that track'); return }
      setData(d)
    } finally { setBusy(false) }
  }

  async function doShuffle() {
    setShuffling(true); setErr(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/spotify/shuffle`, { method: 'POST', headers: authHeaders() })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Could not shuffle'); return }
      setEmbedKey(k => k + 1)   // reload the embed so it starts on the new order
      loadPlaylist()
    } finally { setShuffling(false) }
  }

  function hide() {
    setOpen(false); setHidden(true)
    try { sessionStorage.setItem(HIDE_KEY, '1') } catch { /* ignore */ }
  }
  function unhide() {
    setHidden(false)
    try { sessionStorage.removeItem(HIDE_KEY) } catch { /* ignore */ }
  }

  // ── render ─────────────────────────────────────────────────────────────
  if (!user || !status?.enabled || !status?.playlistId) {
    // still offer the restore nub if they hid it this session and it's configured
    if (user && hidden && status?.enabled && status?.playlistId) {
      return <RestoreNub onClick={unhide} />
    }
    return null
  }
  if (hidden) return <RestoreNub onClick={unhide} />

  return (
    <div
      style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 900,
        width: open ? 'min(360px, calc(100vw - 32px))' : 'auto',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {open ? (
        <div style={{
          background: 'rgba(12,12,18,0.97)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(14px)',
          boxShadow: '0 16px 50px rgba(0,0,0,0.55)',
        }}>
          {/* header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}>
            <span style={{ color: accent, fontSize: 13 }}>♫</span>
            <span className="font-cinzel" style={{ color: '#f4f4f5', fontSize: 12, letterSpacing: 2, flex: 1 }}>
              OCCULT RADIO
            </span>
            <button onClick={doShuffle} disabled={shuffling} title="Shuffle the playlist for everyone"
              style={{ ...navBtn, color: shuffling ? 'var(--text-faint)' : accent, fontSize: 13 }}>
              {shuffling ? '…' : '🔀'}
            </button>
            {data?.meta?.url && (
              <a href={data.meta.url} target="_blank" rel="noreferrer"
                 style={{ color: 'var(--text-faint)', fontSize: 10, textDecoration: 'none' }}
                 title="Open in Spotify">↗</a>
            )}
            <button onClick={() => setOpen(false)} title="Collapse"
              style={navBtn}>–</button>
            <button onClick={hide} title="Hide for this session" style={navBtn}>×</button>
          </div>

          {/* embed player */}
          <iframe
            key={embedKey}
            title="Occult Radio"
            src={`https://open.spotify.com/embed/playlist/${status.playlistId}?theme=0`}
            width="100%" height="352" frameBorder="0" loading="lazy"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            style={{ display: 'block', border: 0 }}
          />
          <p style={{
            color: 'var(--text-faint)', fontSize: 10, lineHeight: 1.5, margin: 0,
            padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            30-second previews by default.{' '}
            <a href="https://accounts.spotify.com/login" target="_blank" rel="noreferrer"
               style={{ color: accent, textDecoration: 'none' }}>Log in to Spotify</a>
            {' '}in this browser for full tracks (Premium plays end-to-end; the login sticks).
          </p>

          {/* add a track */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Add a track — search Spotify…"
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 12,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#f4f4f5', outline: 'none',
              }}
            />
            {err && <p style={{ color: '#f87171', fontSize: 11, margin: '6px 0 0' }}>{err}</p>}

            {results && (
              <div style={{ marginTop: 8, maxHeight: 168, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {results.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: 11, margin: 0 }}>No matches.</p>}
                {results.map(t => (
                  <button key={t.id} onClick={() => addTrack(t)} disabled={busy}
                    style={rowBtn}>
                    {t.albumArt && <img src={t.albumArt} alt="" width={28} height={28} style={{ borderRadius: 4, flexShrink: 0 }} />}
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span style={{ color: '#f4f4f5', fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.artist}</span>
                    </span>
                    <span style={{ color: accent, fontSize: 15, flexShrink: 0 }}>+</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* recently added by the circle */}
          {data?.submissions?.length > 0 && (
            <div style={{ padding: '0 12px 12px', maxHeight: 176, overflowY: 'auto' }}>
              <p style={{ color: 'var(--text-faint)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, margin: '4px 0 6px' }}>
                Added by the circle
              </p>
              {data.submissions.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  {s.album_art && <img src={s.album_art} alt="" width={24} height={24} style={{ borderRadius: 3, flexShrink: 0 }} />}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: '#d4d4d8', fontSize: 11, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.track_name}</span>
                    <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>{s.artist} · {s.added_by_username}</span>
                  </span>
                  {s.mine && (
                    <button onClick={() => removeTrack(s.id)} disabled={busy} title="Remove"
                      style={{ ...navBtn, fontSize: 12 }}>×</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
            borderRadius: 999, cursor: 'pointer',
            background: 'rgba(12,12,18,0.95)', border: '1px solid rgba(255,255,255,0.12)',
            color: '#f4f4f5', backdropFilter: 'blur(14px)', boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
          }}
        >
          <span style={{ color: accent, fontSize: 14 }}>♫</span>
          <span className="font-cinzel" style={{ fontSize: 11, letterSpacing: 2 }}>OCCULT RADIO</span>
        </button>
      )}
    </div>
  )
}

const navBtn = {
  background: 'transparent', border: 'none', color: 'var(--text-secondary)',
  cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '2px 4px',
}
const rowBtn = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '5px 6px',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 6, cursor: 'pointer',
}

function RestoreNub({ onClick }) {
  return (
    <button
      onClick={onClick}
      title="Occult Radio"
      style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 900,
        width: 40, height: 40, borderRadius: 999, cursor: 'pointer',
        background: 'rgba(12,12,18,0.95)', border: '1px solid rgba(255,255,255,0.12)',
        color: '#1DB954', fontSize: 16, backdropFilter: 'blur(14px)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
      }}
    >
      ♫
    </button>
  )
}
