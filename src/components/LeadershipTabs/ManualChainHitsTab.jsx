import { useState, useEffect, useMemo, useCallback } from 'react'
import { API_BASE_URL } from '../../config/api'
import { FACTIONS } from './ChainTrackingTab'

// Stored as a fixed custom_hits.hit_type so these entries are distinguishable
// from the generic Event/Raid/Other hits added via the Member Ranks tab, while
// still counting toward the rank formula the same way (chain_hits + rank_hits
// + custom_hits — see memberController.getFactionMembers).
const HIT_TYPE = 'Manual Chain'

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return token ? { Authorization: token } : {}
}

function useIsMobile() {
  const [m, setM] = useState(() => window.innerWidth < 700)
  useEffect(() => {
    const h = () => setM(window.innerWidth < 700)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return m
}

const inputStyle = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px', color: '#f4f4f5', padding: '7px 10px', fontSize: '13px',
}

// ─── Faction / mode pill tabs ───────────────────────────────────────────────

function PillTabs({ options, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '7px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s',
            border: `1px solid ${active === opt.value ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
            background: active === opt.value ? 'rgba(179,18,63,0.15)' : 'transparent',
            color: active === opt.value ? '#f4f4f5' : 'var(--text-secondary)',
            fontWeight: active === opt.value ? '600' : '400',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Paste-line parsing ─────────────────────────────────────────────────────
// One member per line. Accepts: "Username, 42" / "Username: 42" /
// "Username - 42" / "Username 42" / "Username [12345] 42" (bracketed ID
// skips name matching entirely). Lines that don't resolve to a name + a
// number are returned with parseError so the UI can surface them separately.

function parsePasteLine(rawLine) {
  const line = rawLine.trim()
  if (!line || line.startsWith('#')) return null

  const idMatch = line.match(/\[(\d+)\]/)
  const withoutId = line.replace(/\[\d+\]/, '').trim()

  const m = withoutId.match(/^(.+?)[\s,:\-–—]+(\d+)\s*(?:hits?)?$/i)
  if (!m) return { raw: line, parseError: true }

  const username = m[1].trim().replace(/[,:\-–—]+$/, '').trim()
  const hits = parseInt(m[2], 10)
  if (!username || !Number.isFinite(hits)) return { raw: line, parseError: true }

  return { raw: line, username, hits, explicitId: idMatch ? parseInt(idMatch[1], 10) : null }
}

function resolveRow(parsed, directoryByName) {
  if (parsed.explicitId) {
    return { ...parsed, torn_user_id: String(parsed.explicitId), matched: true }
  }
  const hit = directoryByName.get(parsed.username.toLowerCase())
  if (hit) return { ...parsed, torn_user_id: String(hit.torn_user_id), username: hit.username, matched: true }
  return { ...parsed, torn_user_id: '', matched: false }
}

// ─── Member directory (for username → ID resolution) ───────────────────────

function useMemberDirectory(factionId) {
  const [directory, setDirectory] = useState([])

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE_URL}/api/leadership/members?faction_id=${factionId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { if (!cancelled) setDirectory(data.members || []) })
      .catch(() => { if (!cancelled) setDirectory([]) })
    return () => { cancelled = true }
  }, [factionId])

  const byName = useMemo(() => {
    const map = new Map()
    for (const m of directory) if (m.username) map.set(m.username.toLowerCase(), m)
    return map
  }, [directory])

  return { directory, byName }
}

// ─── Bulk paste panel ───────────────────────────────────────────────────────

function PastePanel({ directoryByName, rows, setRows, isMobile }) {
  const [text, setText] = useState('')
  const [unparsed, setUnparsed] = useState([])

  const parse = () => {
    const bad = []
    const good = []
    for (const line of text.split('\n')) {
      const parsed = parsePasteLine(line)
      if (!parsed) continue
      if (parsed.parseError) { bad.push(parsed.raw); continue }
      good.push(resolveRow(parsed, directoryByName))
    }
    setUnparsed(bad)
    setRows(good.map((r, i) => ({ ...r, key: `p${Date.now()}_${i}` })))
  }

  const updateRow = (key, field, val) => setRows(rs => rs.map(r => r.key === key ? { ...r, [field]: val } : r))
  const removeRow = (key) => setRows(rs => rs.filter(r => r.key !== key))

  const matchedCount = rows.filter(r => r.torn_user_id && parseInt(r.hits, 10) > 0).length

  return (
    <div>
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px', padding: '12px 14px', marginBottom: '12px',
      }}>
        <p style={{ color: '#f4f4f5', fontSize: '12.5px', fontWeight: '600', margin: '0 0 6px 0' }}>
          Format — one member per line
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '0 0 8px 0', lineHeight: 1.5 }}>
          Username, then the hit count. Separate them with a comma, colon, dash, or just a space.
          Put an ID in [brackets] if two members share a name — that skips name matching.
        </p>
        <pre style={{
          margin: 0, fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace',
          background: 'rgba(0,0,0,0.25)', borderRadius: '6px', padding: '8px 10px', overflowX: 'auto',
        }}>{'Shadowbane, 42\nNightViper: 17\nxXDemonXx - 9\nBloodReaper [2741093] 25'}</pre>
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={'Paste your member / hit list here…'}
        rows={8}
        style={{ ...inputStyle, width: '100%', fontFamily: 'monospace', resize: 'vertical', marginBottom: '10px' }}
      />

      <button onClick={parse} disabled={!text.trim()} style={{
        padding: '8px 18px', borderRadius: '8px', fontSize: '13px', cursor: text.trim() ? 'pointer' : 'default',
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#f4f4f5',
        opacity: text.trim() ? 1 : 0.5, marginBottom: '16px',
      }}>Parse Paste</button>

      {unparsed.length > 0 && (
        <div style={{
          background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)',
          borderRadius: '8px', padding: '10px 12px', marginBottom: '16px',
        }}>
          <p style={{ color: '#fbbf24', fontSize: '12px', fontWeight: '600', margin: '0 0 6px 0' }}>
            Couldn't read {unparsed.length} line{unparsed.length !== 1 ? 's' : ''} — fix and re-paste:
          </p>
          {unparsed.map((l, i) => (
            <p key={i} style={{ color: 'var(--text-secondary)', fontSize: '12px', fontFamily: 'monospace', margin: '2px 0' }}>{l}</p>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '0 0 8px 0' }}>
            {matchedCount} of {rows.length} row{rows.length !== 1 ? 's' : ''} ready to save
            {matchedCount < rows.length ? ' — fill in a Torn ID for anything flagged below' : ''}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {rows.map((r) => (
              <ParsedRow key={r.key} row={r} onUpdate={updateRow} onRemove={removeRow} isMobile={isMobile} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ParsedRow({ row, onUpdate, onRemove, isMobile }) {
  const found = !!row.torn_user_id
  const chip = (
    <span style={{
      fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '999px',
      background: found ? 'rgba(34,197,94,0.12)' : 'rgba(251,191,36,0.12)',
      color: found ? '#4ade80' : '#fbbf24',
      border: `1px solid ${found ? 'rgba(34,197,94,0.3)' : 'rgba(251,191,36,0.35)'}`,
      whiteSpace: 'nowrap',
    }}>{found ? '✓ Matched' : '⚠ Enter ID'}</span>
  )

  if (isMobile) {
    return (
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '600' }}>{row.username}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {chip}
            <button onClick={() => onRemove(row.key)} style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-faint)',
              borderRadius: '6px', cursor: 'pointer', fontSize: '13px', padding: '4px 8px',
            }}>✕</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          <input type="number" min="1" placeholder="Torn ID" value={row.torn_user_id}
            onChange={e => onUpdate(row.key, 'torn_user_id', e.target.value)}
            style={{ ...inputStyle, textAlign: 'center', borderColor: found ? undefined : 'rgba(251,191,36,0.4)' }} />
          <input type="number" min="0" placeholder="Hits" value={row.hits}
            onChange={e => onUpdate(row.key, 'hits', e.target.value)}
            style={{ ...inputStyle, textAlign: 'center' }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 90px 90px 32px', gap: '6px', alignItems: 'center' }}>
      <span style={{ color: '#f4f4f5', fontSize: '13px' }}>{row.username}</span>
      <div>{chip}</div>
      <input type="number" min="1" placeholder="Torn ID" value={row.torn_user_id}
        onChange={e => onUpdate(row.key, 'torn_user_id', e.target.value)}
        style={{ ...inputStyle, textAlign: 'center', borderColor: found ? undefined : 'rgba(251,191,36,0.4)' }} />
      <input type="number" min="0" placeholder="Hits" value={row.hits}
        onChange={e => onUpdate(row.key, 'hits', e.target.value)}
        style={{ ...inputStyle, textAlign: 'center' }} />
      <button onClick={() => onRemove(row.key)} style={{
        background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-faint)',
        borderRadius: '6px', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '6px',
      }}>✕</button>
    </div>
  )
}

// ─── One-by-one manual panel ────────────────────────────────────────────────

function ManualPanel({ directoryByName, rows, setRows, isMobile }) {
  const addRow = () => setRows(rs => [...rs, { key: `m${Date.now()}`, torn_user_id: '', username: '', hits: '' }])
  const removeRow = (key) => setRows(rs => rs.length > 1 ? rs.filter(r => r.key !== key) : rs)
  const updateRow = (key, field, val) => setRows(rs => rs.map(r => {
    if (r.key !== key) return r
    const next = { ...r, [field]: val }
    // Auto-fill the ID from the directory once the typed name matches exactly,
    // but only if the leader hasn't already set one themselves.
    if (field === 'username' && !r.torn_user_id) {
      const hit = directoryByName.get(val.trim().toLowerCase())
      if (hit) next.torn_user_id = String(hit.torn_user_id)
    }
    return next
  }))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <label style={{ color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Members &amp; Hits
        </label>
        <button onClick={addRow} style={{
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          color: 'var(--text-secondary)', borderRadius: '6px', padding: '3px 12px', fontSize: '12px', cursor: 'pointer',
        }}>+ Add Member</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {rows.map((r) => (
          <ManualRow key={r.key} row={r} onUpdate={updateRow} onRemove={removeRow} isMobile={isMobile} canRemove={rows.length > 1} />
        ))}
      </div>
    </div>
  )
}

function ManualRow({ row, onUpdate, onRemove, isMobile, canRemove }) {
  if (isMobile) {
    return (
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px',
      }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <input type="text" value={row.username} list="manual-chain-hits-usernames"
            onChange={e => onUpdate(row.key, 'username', e.target.value)}
            placeholder="Username" style={{ ...inputStyle, flex: 1 }} />
          <button onClick={() => onRemove(row.key)} disabled={!canRemove} style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-faint)',
            borderRadius: '6px', cursor: canRemove ? 'pointer' : 'default', fontSize: '14px', padding: '6px 10px',
          }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          <input type="number" min="1" value={row.torn_user_id} onChange={e => onUpdate(row.key, 'torn_user_id', e.target.value)}
            placeholder="Torn ID" style={{ ...inputStyle, textAlign: 'center' }} />
          <input type="number" min="0" value={row.hits} onChange={e => onUpdate(row.key, 'hits', e.target.value)}
            placeholder="Hits" style={{ ...inputStyle, textAlign: 'center' }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 90px 32px', gap: '6px', alignItems: 'center' }}>
      <input type="text" value={row.username} list="manual-chain-hits-usernames"
        onChange={e => onUpdate(row.key, 'username', e.target.value)}
        placeholder="Username" style={inputStyle} />
      <input type="number" min="1" value={row.torn_user_id} onChange={e => onUpdate(row.key, 'torn_user_id', e.target.value)}
        placeholder="Torn ID" style={{ ...inputStyle, textAlign: 'center' }} />
      <input type="number" min="0" value={row.hits} onChange={e => onUpdate(row.key, 'hits', e.target.value)}
        placeholder="Hits" style={{ ...inputStyle, textAlign: 'center' }} />
      <button onClick={() => onRemove(row.key)} disabled={!canRemove} style={{
        background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-faint)',
        borderRadius: '6px', cursor: canRemove ? 'pointer' : 'default', fontSize: '14px', lineHeight: 1, padding: '6px',
      }}>✕</button>
    </div>
  )
}

// ─── Recent entries ─────────────────────────────────────────────────────────

function RecentEntries({ factionId, reloadKey }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`${API_BASE_URL}/api/leadership/custom-hits?faction_id=${factionId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setEntries((data.entries || []).filter(e => e.hit_type === HIT_TYPE)))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [factionId, reloadKey])

  if (loading) return <p style={{ color: 'var(--text-faint)', fontSize: '12px' }}>Loading recent entries…</p>
  if (!entries.length) return <p style={{ color: 'var(--text-faint)', fontSize: '12px' }}>No manual chain hits recorded for this faction yet.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {entries.slice(0, 20).map(e => (
        <div key={e.id} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px',
          padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '12.5px',
        }}>
          <span style={{ color: '#f4f4f5' }}>{e.username || `[${e.torn_user_id}]`}</span>
          <span style={{ color: 'var(--text-secondary)' }}>{e.notes || '—'}</span>
          <span style={{ color: 'var(--text-secondary)' }}>{new Date(e.saved_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          <span style={{ color: '#ff2f6d', fontWeight: '700' }}>+{e.hits}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main export ────────────────────────────────────────────────────────────

export default function ManualChainHitsTab() {
  const [factionId, setFactionId] = useState(33097)
  const [mode, setMode] = useState('paste') // 'paste' | 'manual'
  const [notes, setNotes] = useState('')
  const [pasteRows, setPasteRows] = useState([])
  const [manualRows, setManualRows] = useState([{ key: 'm0', torn_user_id: '', username: '', hits: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const isMobile = useIsMobile()

  const { directory, byName } = useMemberDirectory(factionId)

  const rows = mode === 'paste' ? pasteRows : manualRows
  const setRows = mode === 'paste' ? setPasteRows : setManualRows

  const submit = useCallback(async () => {
    setError(null); setSuccess(null)
    const valid = rows
      .map(r => ({ torn_user_id: parseInt(r.torn_user_id, 10), username: r.username?.trim() || null, hits: parseInt(r.hits, 10) }))
      .filter(r => r.torn_user_id > 0 && r.hits > 0)

    if (!valid.length) { setError('At least one member with a Torn ID and hits is required'); return }

    setSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/custom-hits`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ faction_id: factionId, hit_type: HIT_TYPE, notes: notes.trim() || null, members: valid }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Save failed') }
      const data = await res.json()
      setSuccess(data.message || `${valid.length} hit record${valid.length !== 1 ? 's' : ''} saved`)
      setPasteRows([])
      setManualRows([{ key: `m${Date.now()}`, torn_user_id: '', username: '', hits: '' }])
      setNotes('')
      setReloadKey(k => k + 1)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }, [rows, factionId, notes])

  return (
    <div>
      <datalist id="manual-chain-hits-usernames">
        {directory.map(m => <option key={m.torn_user_id} value={m.username} />)}
      </datalist>

      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ color: '#f4f4f5', fontSize: '15px', fontWeight: '600', margin: '0 0 4px 0' }}>Manual Chain Hits</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '12.5px', margin: 0 }}>
          Credit hits a member made outside of a tracked chain — these count toward their rank total the same way chain hits do.
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <PillTabs options={FACTIONS.map(f => ({ value: f.id, label: f.name }))} active={factionId} onChange={setFactionId} />
        <PillTabs
          options={[{ value: 'paste', label: 'Bulk Paste' }, { value: 'manual', label: 'Add One by One' }]}
          active={mode} onChange={setMode}
        />
      </div>

      <div style={{ marginBottom: '14px', maxWidth: isMobile ? '100%' : '320px' }}>
        <label style={{ color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>
          Session Label (optional)
        </label>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="e.g. Oct 30 — Discord-tracked attacks" style={{ ...inputStyle, width: '100%' }} />
      </div>

      {mode === 'paste'
        ? <PastePanel directoryByName={byName} rows={pasteRows} setRows={setPasteRows} isMobile={isMobile} />
        : <ManualPanel directoryByName={byName} rows={manualRows} setRows={setManualRows} isMobile={isMobile} />}

      {error && <p style={{ color: '#f87171', fontSize: '12px', margin: '12px 0 0 0' }}>{error}</p>}
      {success && <p style={{ color: '#4ade80', fontSize: '12px', margin: '12px 0 0 0' }}>{success}</p>}

      <div style={{ marginTop: '16px' }}>
        <button onClick={submit} disabled={saving} style={{
          padding: '9px 22px', borderRadius: '8px', fontSize: '13px', cursor: saving ? 'not-allowed' : 'pointer',
          background: 'rgba(179,18,63,0.15)', border: '1px solid rgba(179,18,63,0.4)', color: '#f4f4f5', fontWeight: '600',
          opacity: saving ? 0.6 : 1, width: isMobile ? '100%' : 'auto',
        }}>{saving ? 'Saving…' : 'Save Hits'}</button>
      </div>

      <div style={{ marginTop: '28px' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
          Recent Manual Chain Hits — {FACTIONS.find(f => f.id === factionId)?.name}
        </p>
        <RecentEntries factionId={factionId} reloadKey={reloadKey} />
      </div>
    </div>
  )
}
