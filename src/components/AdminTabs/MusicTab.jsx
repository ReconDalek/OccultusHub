import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../config/api'

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return token ? { Authorization: token } : {}
}

const card = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10, padding: 16, marginBottom: 16,
}
const label = { color: 'var(--text-secondary)', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6 }
const input = {
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#f4f4f5', outline: 'none',
}
const btn = {
  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
  background: 'linear-gradient(135deg, #b3123f, #6d28d9)', color: '#fff',
}

export default function MusicTab() {
  const [cfg, setCfg]         = useState(null)
  const [subs, setSubs]       = useState([])
  const [clientId, setClientId]   = useState('')
  const [playlistId, setPlaylistId] = useState('')
  const [limit, setLimit]     = useState(5)
  const [mlPlaylist, setMlPlaylist] = useState('')
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)
  const [diag, setDiag]       = useState(null)
  const [diagBusy, setDiagBusy] = useState(false)

  const [tracksErr, setTracksErr] = useState(null)
  const [tracksLoading, setTracksLoading] = useState(false)

  const [tracksDebug, setTracksDebug] = useState(null)
  const loadTracks = useCallback(() => {
    setTracksLoading(true)
    fetch(`${API_BASE_URL}/api/admin/spotify/playlist`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { setSubs(d.tracks || []); setTracksErr(d.error || null); setTracksDebug(d.debug || null) })
      .catch(() => setTracksErr('Could not load the playlist'))
      .finally(() => setTracksLoading(false))
  }, [])

  const load = useCallback(() => {
    fetch(`${API_BASE_URL}/api/admin/spotify/config`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        setCfg(d)
        setClientId(d.clientId || '')
        setPlaylistId(d.playlistId || '')
        setLimit(d.addLimitPerDay ?? 5)
        setMlPlaylist(d.mlPlaylistId || '')
      })
      .catch(() => {})
    loadTracks()
  }, [loadTracks])

  useEffect(() => {
    load()
    const p = new URLSearchParams(window.location.search).get('spotify')
    if (p === 'linked') setMsg({ ok: true, text: 'Jukebox account linked.' })
    if (p === 'error')  setMsg({ ok: false, text: 'Linking failed — check the Client ID/Secret and redirect URI, then try again.' })
  }, [load])

  async function save(patch) {
    setSaving(true); setMsg(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/spotify/config`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const d = await res.json()
      if (!res.ok) { setMsg({ ok: false, text: d.error || 'Save failed' }); return }
      setCfg(d)
    } finally { setSaving(false) }
  }

  async function runDiagnostic() {
    setDiagBusy(true); setDiag(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/spotify/diagnose`, { headers: authHeaders() })
      setDiag(await res.json())
    } catch {
      setDiag({ problem: 'Could not reach the server' })
    } finally { setDiagBusy(false) }
  }

  async function authorizeJukebox() {
    const res = await fetch(`${API_BASE_URL}/api/admin/spotify/auth-url`, { headers: authHeaders() })
    const d = await res.json()
    if (d.url) window.location.href = d.url
    else setMsg({ ok: false, text: d.error || 'Could not start authorization' })
  }

  async function removeTrack(uri) {
    const res = await fetch(`${API_BASE_URL}/api/admin/spotify/playlist-track`, {
      method: 'DELETE',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri }),
    })
    const d = await res.json()
    if (res.ok) setSubs(d.tracks || [])
    else setMsg({ ok: false, text: d.error || 'Could not remove that track' })
  }

  if (!cfg) return <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>

  const ready = cfg.secretSet && cfg.clientId && cfg.playlistId && cfg.jukeboxLinked

  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
        Shared Spotify playlist shown as a bottom-right overlay to every logged-in member. They can play it
        (full tracks need their own Spotify Premium; everyone else gets 30-second previews) and add tracks,
        capped at {cfg.addLimitPerDay}/member/day.
      </p>

      {msg && (
        <div style={{
          ...card, marginBottom: 20,
          background: msg.ok ? 'rgba(34,197,94,0.08)' : 'rgba(248,113,113,0.08)',
          borderColor: msg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)',
          color: msg.ok ? '#4ade80' : '#f87171',
        }}>{msg.text}</div>
      )}

      {/* Enable */}
      <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ color: '#f4f4f5', margin: 0 }}>Overlay enabled</p>
          <p style={{ color: 'var(--text-faint)', fontSize: 12, margin: '2px 0 0' }}>
            {ready ? 'Ready.' : 'Fill in everything below first — the overlay stays hidden until setup is complete.'}
          </p>
        </div>
        <button
          onClick={() => save({ enabled: !cfg.enabled })}
          disabled={saving || (!cfg.enabled && !ready)}
          style={{
            ...btn, background: cfg.enabled ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.08)',
            opacity: (!cfg.enabled && !ready) ? 0.5 : 1,
          }}
        >
          {cfg.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {/* Music League — secondary listen-only player */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <p style={{ color: '#f4f4f5', marginTop: 0, marginBottom: 2, fontWeight: 600 }}>Music League player</p>
            <p style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 0 }}>
              A second tab in the overlay — listen-only, no adding. Paste the round's public playlist and swap it each round.
              Independent of the jukebox setup below.
            </p>
          </div>
          {cfg.mlEnabled && (
            <button
              onClick={() => save({ mlEnabled: false })}
              disabled={saving}
              style={{ ...btn, flexShrink: 0, background: 'rgba(255,255,255,0.08)' }}
            >
              Hide tab
            </button>
          )}
        </div>
        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <label style={label}>Round playlist (URL, id, or spotify: URI)</label>
          <input style={input} value={mlPlaylist} onChange={e => setMlPlaylist(e.target.value)} placeholder="paste the round's public Spotify playlist" />
        </div>
        <button style={btn} disabled={saving || !mlPlaylist.trim()} onClick={() => save({ mlPlaylistId: mlPlaylist, mlEnabled: true })}>
          {saving ? 'Saving…' : (cfg.mlEnabled ? 'Update round' : 'Save & show tab')}
        </button>
        {cfg.mlPlaylistId && (
          <p style={{ color: 'var(--text-faint)', fontSize: 11, marginTop: 8 }}>
            Current: <code style={{ color: '#9f67ff' }}>{cfg.mlPlaylistId}</code> — tab is {cfg.mlEnabled ? 'visible' : 'hidden'}
          </p>
        )}
      </div>

      {/* Credentials */}
      <div style={card}>
        <p style={{ color: '#f4f4f5', marginTop: 0, marginBottom: 14, fontWeight: 600 }}>1 · Spotify app (for Occult Radio)</p>

        <div style={{ marginBottom: 12 }}>
          <label style={label}>Client ID</label>
          <input style={input} value={clientId} onChange={e => setClientId(e.target.value)} placeholder="from developer.spotify.com" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={label}>Client Secret</label>
          <p style={{ color: cfg.secretSet ? '#4ade80' : '#f87171', fontSize: 12, margin: 0 }}>
            {cfg.secretSet
              ? '✓ Set as a Worker secret.'
              : '✗ Not set. Run:  wrangler secret put SPOTIFY_CLIENT_SECRET --env production'}
          </p>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={label}>Playlist (id, URL, or spotify: URI)</label>
          <input style={input} value={playlistId} onChange={e => setPlaylistId(e.target.value)} placeholder="must be a PUBLIC playlist owned by the jukebox account" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={label}>Add limit — tracks per member per day</label>
          <input style={{ ...input, width: 100 }} type="number" min={1} max={50} value={limit} onChange={e => setLimit(e.target.value)} />
        </div>
        <button style={btn} disabled={saving}
          onClick={() => save({ clientId, playlistId, addLimitPerDay: limit })}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <p style={{ color: 'var(--text-faint)', fontSize: 11, marginTop: 10 }}>
          Redirect URI to register on the Spotify app:{' '}
          <code style={{ color: '#9f67ff' }}>https://occultushub-worker-production.rkilpatrick4221.workers.dev/api/spotify/callback</code>
        </p>
      </div>

      {/* Jukebox link */}
      <div style={card}>
        <p style={{ color: '#f4f4f5', marginTop: 0, marginBottom: 8, fontWeight: 600 }}>2 · Link the jukebox account</p>
        <p style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 0 }}>
          Log into Spotify as the account that owns the playlist, then authorize. One-time; the refresh token is stored server-side.
        </p>
        <p style={{ color: cfg.jukeboxLinked ? '#4ade80' : 'var(--text-secondary)', fontSize: 13, margin: '0 0 10px' }}>
          {cfg.jukeboxLinked ? `✓ Linked${cfg.jukeboxName ? ` as ${cfg.jukeboxName}` : ''}` : 'Not linked'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btn} disabled={!cfg.clientId || !cfg.secretSet} onClick={authorizeJukebox}>
            {cfg.jukeboxLinked ? 'Re-authorize' : 'Authorize jukebox account'}
          </button>
          <button style={{ ...btn, background: 'rgba(255,255,255,0.08)' }} disabled={diagBusy || !cfg.jukeboxLinked} onClick={runDiagnostic}>
            {diagBusy ? 'Checking…' : 'Run diagnostic'}
          </button>
        </div>

        {diag && (
          <div style={{
            marginTop: 12, padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.6,
            background: diag.canModify ? 'rgba(34,197,94,0.08)' : 'rgba(248,113,113,0.08)',
            border: `1px solid ${diag.canModify ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)'}`,
            color: '#d4d4d8',
          }}>
            {diag.jukebox && <div>Authorized account: <b>{diag.jukebox.name || diag.jukebox.id}</b> ({diag.jukebox.product || 'unknown plan'})</div>}
            {diag.grantedScope !== undefined && <div>Granted scopes: <code>{diag.grantedScope || '(none)'}</code></div>}
            {diag.writeTest && (
              <div>Add-track test: <b style={{ color: diag.writeTest.ok ? '#4ade80' : '#f87171' }}>{diag.writeTest.ok ? 'passed' : `HTTP ${diag.writeTest.status}`}</b>
                {diag.writeTest.body && !diag.writeTest.ok && (
                  <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '4px 0 0', fontSize: 11, color: '#f87171' }}>{diag.writeTest.body}</pre>
                )}
              </div>
            )}
            {diag.playlist && <div>Playlist: <b>{diag.playlist.name}</b> — owned by <b>{diag.playlist.ownerName || diag.playlist.ownerId}</b>{diag.playlist.public ? '' : ' · not public'}{diag.playlist.collaborative ? ' · collaborative' : ''}</div>}
            {diag.rawRead && (
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '6px 0', fontSize: 10, color: 'var(--text-faint)' }}>
                {JSON.stringify(diag.rawRead, null, 1)}
              </pre>
            )}
            <div style={{ marginTop: 6, color: diag.canModify ? '#4ade80' : '#f87171', fontWeight: 600 }}>
              {diag.canModify ? '✓ The jukebox can add to this playlist.' : (diag.problem || 'Cannot modify this playlist.')}
            </div>
          </div>
        )}
      </div>

      {/* Playlist contents (Occult Radio) */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <p style={{ color: '#f4f4f5', margin: 0, fontWeight: 600 }}>
            Occult Radio playlist ({subs.length})
          </p>
          <button onClick={loadTracks} disabled={tracksLoading}
            style={{ ...btn, background: 'rgba(255,255,255,0.08)', padding: '4px 12px', fontSize: 12 }}>
            {tracksLoading ? '…' : 'Refresh'}
          </button>
        </div>
        {tracksErr && <p style={{ color: '#f87171', fontSize: 12, margin: '0 0 8px' }}>{tracksErr}</p>}
        {!tracksErr && subs.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: 13, margin: 0 }}>Playlist is empty.</p>}
        {subs.length === 0 && tracksDebug && (
          <pre style={{ color: 'var(--text-faint)', fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '8px 0 0' }}>{JSON.stringify(tracksDebug, null, 1)}</pre>
        )}
        {subs.map(s => (
          <div key={s.uri} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            {s.albumArt && <img src={s.albumArt} alt="" width={32} height={32} style={{ borderRadius: 4, flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#f4f4f5', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.name} <span style={{ color: 'var(--text-faint)' }}>— {s.artist}</span>
              </div>
              <div style={{ color: 'var(--text-faint)', fontSize: 11 }}>
                {s.addedBy ? `added by ${s.addedBy}` : 'added outside the hub'}
              </div>
            </div>
            <button onClick={() => removeTrack(s.uri)}
              style={{ ...btn, background: 'rgba(248,113,113,0.15)', color: '#f87171', padding: '4px 12px', fontSize: 12 }}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
