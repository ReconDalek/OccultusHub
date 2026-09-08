import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from '../../hooks/useSession'
import { API_BASE_URL } from '../../config/api'

const HIDE_KEY = 'occultus_radio_hidden'

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return token ? { Authorization: token } : {}
}

const accent = '#1DB954' // Spotify green

function ShuffleIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  )
}

function embedSrc(id) {
  return `https://open.spotify.com/embed/playlist/${id}?theme=0`
}

export default function SpotifyPlayer() {
  const { user } = useSession()

  const [status, setStatus] = useState(null)
  const [open, setOpen]     = useState(false)
  const [view, setView]     = useState('radio')     // 'radio' | 'league'
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem(HIDE_KEY) === '1' } catch { return false }
  })

  const [data, setData]       = useState(null)      // { meta } for the radio playlist
  const [q, setQ]             = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy]       = useState(false)
  const [shuffling, setShuffling] = useState(false)
  const [embedKey, setEmbedKey]   = useState(0)     // bump to reload the radio iframe
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

  const radioOn = !!(status?.enabled && status?.playlistId)
  const league  = status?.musicLeague || null
  const anyOn   = radioOn || !!league

  // default to whichever is available
  useEffect(() => {
    if (!radioOn && league) setView('league')
    else if (radioOn) setView('radio')
  }, [radioOn, league])

  // ── radio playlist meta (for the "open in Spotify" link) ─────────────────
  const loadPlaylist = useCallback(() => {
    fetch(`${API_BASE_URL}/api/spotify/playlist`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!open || !radioOn || hidden) return
    loadPlaylist()
  }, [open, radioOn, hidden, loadPlaylist])

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

  async function doShuffle() {
    setShuffling(true); setErr(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/spotify/shuffle`, { method: 'POST', headers: authHeaders() })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Could not shuffle'); return }
      setEmbedKey(k => k + 1)
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
  if (!user || !anyOn) return null
  if (hidden) return <RestoreNub onClick={unhide} />

  const showingLeague = view === 'league' && league

  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 900,
      width: open ? 'min(360px, calc(100vw - 32px))' : 'auto',
      fontFamily: 'Inter, sans-serif',
    }}>
      {open ? (
        <div style={{
          background: 'rgba(12,12,18,0.97)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(14px)',
          boxShadow: '0 16px 50px rgba(0,0,0,0.55)',
          display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(100vh - 32px)',
          ...(showingLeague ? {} : { height: 'min(620px, calc(100vh - 32px))' }),
        }}>
          {/* header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', flexShrink: 0,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}>
            <span style={{ color: accent, fontSize: 13 }}>♫</span>
            <span className="font-cinzel" style={{ color: '#f4f4f5', fontSize: 12, letterSpacing: 2, flex: 1 }}>
              {showingLeague ? 'MUSIC LEAGUE' : 'OCCULT RADIO'}
            </span>
            <button onClick={() => setOpen(false)} title="Collapse" style={navBtn}>–</button>
            <button onClick={hide} title="Hide for this session" style={navBtn}>×</button>
          </div>

          {/* Radio / Music League switch */}
          {radioOn && league && (
            <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {[['radio', 'Radio'], ['league', 'Music League']].map(([k, lbl]) => (
                <button key={k} onClick={() => setView(k)}
                  style={{
                    flex: 1, padding: '7px 0', background: 'transparent', border: 'none', cursor: 'pointer',
                    fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
                    color: view === k ? '#f4f4f5' : 'var(--text-faint)',
                    borderBottom: view === k ? `2px solid ${accent}` : '2px solid transparent',
                  }}>
                  {lbl}
                </button>
              ))}
            </div>
          )}

          {showingLeague ? (
            <>
              <iframe
                key={`league-${league.playlistId}`}
                title="Music League"
                src={embedSrc(league.playlistId)}
                width="100%" height="352" frameBorder="0" loading="lazy"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                style={{ display: 'block', border: 0, flexShrink: 0 }}
              />
              <p style={{ color: 'var(--text-faint)', fontSize: 10, margin: 0, padding: '7px 12px', flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                Music League · listen-only, new playlist each round
              </p>
            </>
          ) : (
            <>
              <iframe
                key={`radio-${embedKey}`}
                title="Occult Radio"
                src={embedSrc(status.playlistId)}
                width="100%" height="352" frameBorder="0" loading="lazy"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                style={{ display: 'block', border: 0, flexShrink: 0 }}
              />

              {/* shuffle bar — fused to the bottom of the player, no gap */}
              <button
                onClick={doShuffle}
                disabled={shuffling}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  padding: '10px 0', border: 'none', flexShrink: 0,
                  cursor: shuffling ? 'default' : 'pointer',
                  background: 'rgba(255,255,255,0.07)', color: '#f4f4f5',
                  fontSize: 12, letterSpacing: 0.5,
                }}
                onMouseEnter={e => { if (!shuffling) e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
              >
                <ShuffleIcon />
                {shuffling ? 'Shuffling…' : 'Shuffle playlist'}
              </button>

              {/* empty space */}
              <div style={{ flex: 1, minHeight: 10 }} />

              <div style={{ flexShrink: 0, overflowY: 'auto', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{
                color: 'var(--text-faint)', fontSize: 10, lineHeight: 1.5, margin: 0,
                padding: '8px 12px 4px',
              }}>
                30-second previews by default.{' '}
                <a href="https://accounts.spotify.com/login" target="_blank" rel="noreferrer"
                   style={{ color: accent, textDecoration: 'none' }}>Log in to Spotify</a>
                {' '}for full tracks (Premium plays end-to-end).
                {data?.meta?.url && (
                  <> · <a href={data.meta.url} target="_blank" rel="noreferrer" style={{ color: accent, textDecoration: 'none' }}>Open in Spotify</a></>
                )}
              </p>

              {/* add a track */}
              <div style={{ padding: '6px 12px 10px' }}>
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
                      <button key={t.id} onClick={() => addTrack(t)} disabled={busy} style={rowBtn}>
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
              </div>
            </>
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
          <span className="font-cinzel" style={{ fontSize: 11, letterSpacing: 2 }}>
            {radioOn ? 'OCCULT RADIO' : 'MUSIC LEAGUE'}
          </span>
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
      title="Music"
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
