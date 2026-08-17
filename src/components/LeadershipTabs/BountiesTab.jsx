import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../config/api'
import { FACTIONS } from './ChainTrackingTab'

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return token ? { Authorization: token } : {}
}

function fmtMoney(n) {
  const v = Math.round(Number(n) || 0)
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-GB')
}

function formatDateTime(unix) {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC', hour12: false,
  }) + ' UTC/TCT'
}

// datetime-local <-> unix, same convention as VerifyDataTab in WarTrackingTab.jsx
function unixToInput(unix) {
  if (!unix) return ''
  return new Date(unix * 1000).toISOString().slice(0, 16)
}
function inputToUnix(val) {
  if (!val) return null
  return Math.floor(new Date(val + 'Z').getTime() / 1000)
}

function factionName(id) {
  return FACTIONS.find(f => f.id === id)?.name ?? null
}

function SortArrow({ dir }) {
  if (!dir) return null
  return <span style={{ fontSize: '9px', marginLeft: '3px' }}>{dir === 'asc' ? '▲' : '▼'}</span>
}

const COLUMNS = [
  { key: 'placed_at',       label: 'Date',    align: 'left'  },
  { key: 'placer_username', label: 'Placer',  align: 'left'  },
  { key: 'target_username', label: 'Target',  align: 'left'  },
  { key: 'faction_id',      label: 'Faction', align: 'left'  },
  { key: 'ranked_war_id',   label: 'War',     align: 'left'  },
  { key: 'bounty_count',    label: 'Count',   align: 'right' },
  { key: 'bounty_value',    label: 'Value',   align: 'right' },
  { key: 'total_cost',      label: 'Cost',    align: 'right' },
  { key: 'paid',            label: 'Paid',    align: 'center' },
]

const inputStyle = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px', color: '#f4f4f5', padding: '7px 10px', fontSize: '13px',
}

function BountyForm({ initial, wars, onSave, onCancel }) {
  const [placedAt,  setPlacedAt]  = useState(initial ? unixToInput(initial.placed_at) : '')
  const [placer,    setPlacer]    = useState(initial?.placer_username ?? '')
  const [placerId,  setPlacerId]  = useState(initial?.placer_torn_id ?? '')
  const [target,    setTarget]    = useState(initial?.target_username ?? '')
  const [count,     setCount]     = useState(initial?.bounty_count ?? 1)
  const [value,     setValue]     = useState(initial?.bounty_value ?? '')
  const [cost,      setCost]      = useState(initial?.total_cost ?? '')
  const [factionId, setFactionId] = useState(initial?.faction_id ?? '')
  const [warId,     setWarId]     = useState(initial?.ranked_war_id ?? '')
  const [notes,     setNotes]     = useState(initial?.notes ?? '')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)

  const submit = async () => {
    const placed_at = inputToUnix(placedAt)
    if (!placed_at || !target.trim() || !cost) { setError('Date, target, and cost are required'); return }
    setSaving(true); setError(null)
    try {
      await onSave({
        placed_at,
        placer_username: placer.trim() || null,
        placer_torn_id: placerId ? parseInt(placerId, 10) : null,
        target_username: target.trim(),
        bounty_count: parseInt(count, 10) || 1,
        bounty_value: parseInt(value, 10) || parseInt(cost, 10) || 0,
        total_cost: parseInt(cost, 10) || 0,
        faction_id: factionId ? parseInt(factionId, 10) : null,
        ranked_war_id: warId ? parseInt(warId, 10) : null,
        notes: notes.trim() || null,
      })
    } catch (e) { setError(e.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '16px', marginBottom: '14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: '10px', marginBottom: '12px' }}>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Placed At (UTC)</label>
          <input type="datetime-local" value={placedAt} onChange={e => setPlacedAt(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
        </div>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Target Username</label>
          <input type="text" value={target} onChange={e => setTarget(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
        </div>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Placer Username</label>
          <input type="text" value={placer} onChange={e => setPlacer(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
        </div>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Placer Torn ID</label>
          <input type="number" value={placerId} onChange={e => setPlacerId(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
        </div>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Count</label>
          <input type="number" min="1" value={count} onChange={e => setCount(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
        </div>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Bounty Value ($)</label>
          <input type="number" value={value} onChange={e => setValue(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
        </div>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Total Cost ($)</label>
          <input type="number" value={cost} onChange={e => setCost(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
        </div>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Faction</label>
          <select value={factionId} onChange={e => setFactionId(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
            <option value="">Auto-detect</option>
            {FACTIONS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>War</label>
          <select value={warId} onChange={e => setWarId(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
            <option value="">Unassigned / auto-detect</option>
            {wars.map(w => <option key={w.id} value={w.id}>vs {w.opponent_faction_name} ({formatDateTime(w.started_at)})</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Notes</label>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button onClick={submit} disabled={saving} style={{
          padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer',
          background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc',
        }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: "var(--text-secondary)" }}>
          Cancel
        </button>
        {error && <span style={{ color: '#f87171', fontSize: '12px' }}>{error}</span>}
      </div>
    </div>
  )
}

// ─── Paste Log ───────────────────────────────────────────────────────────────
// Same detection the Discord bot uses on the #bounty-log channel, exposed
// here for logs that came in outside that channel (or need re-adding) --
// paste the raw text, preview what would be added, then commit.

function BountyLogPasteForm({ onDone, onCancel }) {
  const [text,       setText]       = useState('')
  const [placer,     setPlacer]     = useState('')
  const [placerId,   setPlacerId]   = useState('')
  const [rows,       setRows]       = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState(null)
  const [result,     setResult]     = useState(null)

  const runParse = async (dryRun) => {
    if (!text.trim()) { setError('Paste a log to parse'); return }
    setError(null)
    dryRun ? setPreviewing(true) : setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/bounties/parse-log`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_content: text,
          placer_username: placer.trim() || null,
          placer_torn_id: placerId ? parseInt(placerId, 10) : null,
          dry_run: dryRun,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Parse failed')
      setRows(json.rows)
      if (!dryRun) {
        setResult({ inserted: json.inserted, skipped: json.skipped })
        onDone()
      }
    } catch (e) {
      setError(e.message || 'Failed to parse log')
    } finally {
      setPreviewing(false); setSubmitting(false)
    }
  }

  const newCount = rows ? rows.filter(r => !r.duplicate).length : 0
  const dupCount = rows ? rows.filter(r => r.duplicate).length : 0

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '16px', marginBottom: '14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: '10px', marginBottom: '10px' }}>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Placer Username</label>
          <input type="text" value={placer} onChange={e => setPlacer(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
        </div>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Placer Torn ID</label>
          <input type="number" value={placerId} onChange={e => setPlacerId(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
        </div>
      </div>

      <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
        Paste bounty log(s)
      </label>
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setRows(null); setResult(null) }}
        placeholder={'10:58:55 - 15/08/26 You placed 1x $300,001 bounties on Sahil007 for a cost of $450,002\n...'}
        rows={6}
        style={{ ...inputStyle, width: '100%', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical', marginBottom: '10px' }}
      />

      {rows && (
        <div style={{ marginBottom: '10px', maxHeight: '220px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px' }}>
          {rows.map((r, i) => (
            <div key={i} style={{
              display: 'flex', gap: '10px', alignItems: 'center', fontSize: '12px', padding: '6px 10px',
              borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              opacity: r.duplicate ? 0.45 : 1,
            }}>
              <span style={{ color: "var(--text-faint)", minWidth: '150px' }}>{formatDateTime(r.placed_at)}</span>
              <span style={{ color: '#e4e4e7', flex: 1 }}>{r.target_username}</span>
              <span style={{ color: '#f4f4f5', fontWeight: '600' }}>{fmtMoney(r.total_cost)}</span>
              {r.estimated && <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '5px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b' }}>est.</span>}
              {r.duplicate && <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '5px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: "var(--text-faint)" }}>already added</span>}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button onClick={() => runParse(true)} disabled={previewing || submitting} style={{
          padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#e4e4e7',
        }}>
          {previewing ? 'Parsing…' : 'Preview'}
        </button>
        <button
          onClick={() => runParse(false)}
          disabled={!rows || previewing || submitting || newCount === 0}
          style={{
            padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
            cursor: (!rows || newCount === 0) ? 'not-allowed' : 'pointer',
            background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80',
            opacity: (!rows || newCount === 0) ? 0.5 : 1,
          }}
        >
          {submitting ? 'Adding…' : rows ? `Add ${newCount} Bount${newCount === 1 ? 'y' : 'ies'}${dupCount ? ` (${dupCount} already added, skipped)` : ''}` : 'Add Bounties'}
        </button>
        <button onClick={onCancel} style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: "var(--text-secondary)" }}>
          Cancel
        </button>
        {error && <span style={{ color: '#f87171', fontSize: '12px' }}>{error}</span>}
        {result && <span style={{ color: '#4ade80', fontSize: '12px' }}>Added {result.inserted}{result.skipped ? `, skipped ${result.skipped} duplicate(s)` : ''}.</span>}
      </div>
    </div>
  )
}

// ─── Bulk Pay ────────────────────────────────────────────────────────────────
// Tallies all currently-unpaid bounties across one or more selected wars into
// one lump-sum total per placer, so leadership pays each person once instead
// of individually per bounty — then marks every underlying row paid in one
// batch request when the lump sum is settled.

function BulkPayTab({ wars }) {
  const [selectedWarIds, setSelectedWarIds] = useState([])
  const [includeUnassigned, setIncludeUnassigned] = useState(false)
  const [bounties, setBounties] = useState([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [expanded, setExpanded] = useState({})
  const [paying,   setPaying]   = useState(null)

  const hasSelection = selectedWarIds.length > 0 || includeUnassigned

  const load = useCallback(() => {
    if (!hasSelection) { setBounties([]); return undefined }
    const controller = new AbortController()
    setLoading(true); setError(null)
    const tokens = [...selectedWarIds.map(String), ...(includeUnassigned ? ['none'] : [])]
    const params = new URLSearchParams({ war_id: tokens.join(','), paid: '0', limit: '500' })
    fetch(`${API_BASE_URL}/api/leadership/bounties?${params}`, { headers: authHeaders(), signal: controller.signal })
      .then(r => r.json())
      .then(d => setBounties(d.bounties || []))
      .catch(e => { if (e.name !== 'AbortError') setError('Failed to load bounties') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [selectedWarIds, includeUnassigned, hasSelection])

  useEffect(() => { const cleanup = load(); return cleanup }, [load])

  const toggleWar = (id) => {
    setSelectedWarIds(prev => prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id])
  }

  const groups = bounties.reduce((acc, b) => {
    const key = b.placer_torn_id ? `id:${b.placer_torn_id}` : `name:${b.placer_username || 'Unknown'}`
    if (!acc[key]) acc[key] = { key, placer_torn_id: b.placer_torn_id, placer_username: b.placer_username, total: 0, rows: [] }
    acc[key].total += b.total_cost
    acc[key].rows.push(b)
    return acc
  }, {})
  const groupList = Object.values(groups).sort((a, b) => b.total - a.total)
  const grandTotal = groupList.reduce((s, g) => s + g.total, 0)

  const markGroupPaid = async (group) => {
    setPaying(group.key)
    try {
      await fetch(`${API_BASE_URL}/api/leadership/bounties/bulk-paid`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: group.rows.map(b => b.id), paid: true }),
      })
      const paidIds = new Set(group.rows.map(b => b.id))
      setBounties(prev => prev.filter(b => !paidIds.has(b.id)))
    } catch (e) {
      console.error('Failed to bulk-mark bounties paid:', e)
    } finally {
      setPaying(null)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '14px' }}>
        <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
          Wars to tally (select one or more)
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setIncludeUnassigned(v => !v)}
            style={{
              padding: '6px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
              border: `1px solid ${includeUnassigned ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)'}`,
              background: includeUnassigned ? 'rgba(245,158,11,0.15)' : 'transparent',
              color: includeUnassigned ? '#f59e0b' : "var(--text-secondary)",
            }}
          >
            Unassigned
          </button>
          {wars.map(w => {
            const active = selectedWarIds.includes(w.id)
            return (
              <button
                key={w.id}
                onClick={() => toggleWar(w.id)}
                style={{
                  padding: '6px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                  border: `1px solid ${active ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  background: active ? 'rgba(167,139,250,0.15)' : 'transparent',
                  color: active ? '#c4b5fd' : "var(--text-secondary)",
                }}
              >
                vs {w.opponent_faction_name}
              </button>
            )
          })}
        </div>
      </div>

      {!hasSelection && (
        <p style={{ color: "var(--text-faint)", fontSize: '13px', padding: '20px 0' }}>Select at least one war (or Unassigned) to tally.</p>
      )}

      {error && <p style={{ color: '#f87171', fontSize: '13px' }}>{error}</p>}

      {hasSelection && loading && (
        <p style={{ color: "var(--text-secondary)", fontSize: '13px', padding: '20px 0' }}>Loading…</p>
      )}

      {hasSelection && !loading && !error && (
        groupList.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>No unpaid bounties for the selected war(s).</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
              {[
                { label: 'Placers',      value: groupList.length },
                { label: 'Bounties',     value: bounties.length },
                { label: 'Grand Total',  value: fmtMoney(grandTotal), color: '#f87171' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 16px', minWidth: '120px' }}>
                  <p style={{ color: "var(--text-secondary)", fontSize: '11px', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                  <p style={{ color: color || '#f4f4f5', fontSize: '17px', fontWeight: '700', margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {groupList.map(g => {
                const isOpen = !!expanded[g.key]
                return (
                  <div key={g.key} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'rgba(255,255,255,0.02)' }}>
                      <button
                        onClick={() => setExpanded(s => ({ ...s, [g.key]: !s[g.key] }))}
                        style={{ background: 'none', border: 'none', color: "var(--text-muted)", cursor: 'pointer', fontSize: '10px', padding: 0 }}
                      >
                        {isOpen ? '▼' : '▶'}
                      </button>
                      <span style={{ color: '#f4f4f5', fontSize: '14px', fontWeight: '600', flex: 1 }}>
                        {g.placer_username || 'Unknown'}
                        <span style={{ color: "var(--text-faint)", fontSize: '11px', fontWeight: '400', marginLeft: '8px' }}>
                          {g.rows.length} bount{g.rows.length === 1 ? 'y' : 'ies'}
                        </span>
                      </span>
                      <span style={{ color: '#f87171', fontSize: '15px', fontWeight: '700' }}>{fmtMoney(g.total)}</span>
                      {g.placer_torn_id ? (
                        <a
                          href={`https://www.torn.com/factions.php?step=your#/tab=controls&addMoneyTo=${g.placer_torn_id}&money=${g.total}`}
                          target="_blank" rel="noreferrer"
                          style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', textDecoration: 'none', whiteSpace: 'nowrap' }}
                        >
                          Pay ↗
                        </a>
                      ) : (
                        <span style={{ fontSize: '11px', color: "var(--text-faint)" }} title="No Torn ID recorded for this placer">No ID</span>
                      )}
                      <button
                        onClick={() => markGroupPaid(g)}
                        disabled={paying === g.key}
                        style={{
                          fontSize: '11px', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer',
                          background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc',
                          opacity: paying === g.key ? 0.5 : 1, whiteSpace: 'nowrap',
                        }}
                      >
                        {paying === g.key ? 'Marking…' : 'Mark All Paid'}
                      </button>
                    </div>

                    {isOpen && (
                      <div style={{ padding: '4px 14px 10px 34px' }}>
                        {g.rows.map(b => (
                          <div key={b.id} style={{ display: 'flex', gap: '10px', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ color: "var(--text-faint)", minWidth: '150px' }}>{formatDateTime(b.placed_at)}</span>
                            <span style={{ color: "var(--text-secondary)", flex: 1 }}>on {b.target_username}</span>
                            <span style={{ color: "var(--text-faint)" }}>{b.ranked_war_id ? `vs ${b.opponent_faction_name}` : 'Unassigned'}</span>
                            <span style={{ color: '#e4e4e7', fontWeight: '500' }}>{fmtMoney(b.total_cost)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )
      )}
    </div>
  )
}

export default function BountiesTab() {
  const [view,      setView]      = useState('list')
  const [bounties,  setBounties]  = useState([])
  const [wars,      setWars]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [sortKey,   setSortKey]   = useState('placed_at')
  const [sortDir,   setSortDir]   = useState('desc')
  const [showAdd,   setShowAdd]   = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [editing,   setEditing]   = useState(null)

  // Filters
  const [warFilter,     setWarFilter]     = useState('')
  const [factionFilter, setFactionFilter] = useState('')
  const [monthFilter,   setMonthFilter]   = useState('')
  const [fromFilter,    setFromFilter]    = useState('')
  const [toFilter,      setToFilter]      = useState('')
  const [userFilter,    setUserFilter]    = useState('')

  useEffect(() => {
    Promise.all(FACTIONS.map(f =>
      fetch(`${API_BASE_URL}/api/leadership/wars?faction_id=${f.id}`, { headers: authHeaders() }).then(r => r.json()).catch(() => ({ wars: [] }))
    )).then(results => {
      const merged = results.flatMap(r => r.wars || [])
      merged.sort((a, b) => (b.started_at ?? 0) - (a.started_at ?? 0))
      setWars(merged)
    })
  }, [])

  const load = useCallback(() => {
    setLoading(true); setError(null)
    const params = new URLSearchParams()
    if (warFilter)     params.set('war_id', warFilter)
    if (factionFilter) params.set('faction_id', factionFilter)
    if (monthFilter)   params.set('month', monthFilter)
    if (fromFilter)    params.set('from', String(inputToUnix(fromFilter + 'T00:00')))
    if (toFilter)      params.set('to', String(inputToUnix(toFilter + 'T23:59')))
    if (userFilter)    params.set('user', userFilter)
    params.set('sort', sortKey)
    params.set('dir', sortDir)

    fetch(`${API_BASE_URL}/api/leadership/bounties?${params}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setBounties(d.bounties || []))
      .catch(() => setError('Failed to load bounties'))
      .finally(() => setLoading(false))
  }, [warFilter, factionFilter, monthFilter, fromFilter, toFilter, userFilter, sortKey, sortDir])

  useEffect(() => { load() }, [load])

  const toggleSort = (key) => {
    if (sortKey !== key) { setSortKey(key); setSortDir('desc'); return }
    setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
  }

  const saveNew = async (payload) => {
    const res = await fetch(`${API_BASE_URL}/api/leadership/bounties`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Save failed') }
    setShowAdd(false); load()
  }

  const saveEdit = async (payload) => {
    const res = await fetch(`${API_BASE_URL}/api/leadership/bounties/${editing.id}`, {
      method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Save failed') }
    setEditing(null); load()
  }

  const [togglingPaid, setTogglingPaid] = useState(null)
  const togglePaid = async (b) => {
    setTogglingPaid(b.id)
    try {
      await fetch(`${API_BASE_URL}/api/leadership/bounties/${b.id}`, {
        method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid: !b.paid }),
      })
      setBounties(prev => prev.map(row => row.id === b.id ? { ...row, paid: row.paid ? 0 : 1 } : row))
    } catch (e) {
      console.error('Failed to toggle bounty paid:', e)
    } finally {
      setTogglingPaid(null)
    }
  }

  const remove = async (id) => {
    if (!confirm('Delete this bounty record?')) return
    await fetch(`${API_BASE_URL}/api/leadership/bounties/${id}`, { method: 'DELETE', headers: authHeaders() })
    load()
  }

  const th = (align) => ({
    padding: '8px 10px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em',
    color: "var(--text-secondary)", fontWeight: '600', borderBottom: '1px solid rgba(255,255,255,0.07)',
    textAlign: align, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
  })
  const td = (align) => ({ padding: '8px 10px', fontSize: '12px', color: '#e4e4e7', textAlign: align, borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' })

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
        {[['list', 'All Bounties'], ['bulk', 'Bulk Pay']].map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              border: `1px solid ${view === v ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.08)'}`,
              background: view === v ? 'rgba(167,139,250,0.15)' : 'transparent',
              color: view === v ? '#f4f4f5' : "var(--text-secondary)",
              fontSize: '13px',
              fontWeight: view === v ? '600' : '400',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'bulk' && <BulkPayTab wars={wars} />}

      {view === 'list' && (
      <>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'flex-end' }}>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>War</label>
          <select value={warFilter} onChange={e => setWarFilter(e.target.value)} style={inputStyle}>
            <option value="">All</option>
            <option value="none">Unassigned</option>
            {wars.map(w => <option key={w.id} value={w.id}>vs {w.opponent_faction_name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Faction</label>
          <select value={factionFilter} onChange={e => setFactionFilter(e.target.value)} style={inputStyle}>
            <option value="">All</option>
            {FACTIONS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Month</label>
          <input type="month" value={monthFilter} onChange={e => { setMonthFilter(e.target.value); setFromFilter(''); setToFilter('') }} style={inputStyle} />
        </div>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>From</label>
          <input type="date" value={fromFilter} onChange={e => { setFromFilter(e.target.value); setMonthFilter('') }} style={inputStyle} />
        </div>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>To</label>
          <input type="date" value={toFilter} onChange={e => { setToFilter(e.target.value); setMonthFilter('') }} style={inputStyle} />
        </div>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>User</label>
          <input type="text" placeholder="Target or placer" value={userFilter} onChange={e => setUserFilter(e.target.value)} style={inputStyle} />
        </div>
        <button onClick={() => { setShowAdd(v => !v); setShowPaste(false) }} style={{
          padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
          background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80',
        }}>
          {showAdd ? 'Cancel' : '+ Add Bounty'}
        </button>
        <button onClick={() => { setShowPaste(v => !v); setShowAdd(false) }} style={{
          padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
          background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc',
        }}>
          {showPaste ? 'Cancel' : '📋 Paste Log'}
        </button>
      </div>

      {showAdd && <BountyForm wars={wars} onSave={saveNew} onCancel={() => setShowAdd(false)} />}
      {showPaste && <BountyLogPasteForm onDone={load} onCancel={() => setShowPaste(false)} />}
      {editing && <BountyForm initial={editing} wars={wars} onSave={saveEdit} onCancel={() => setEditing(null)} />}

      {error && <p style={{ color: '#f87171', fontSize: '13px' }}>{error}</p>}
      {loading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: '13px', padding: '20px 0' }}>Loading bounties…</p>
      ) : !bounties.length ? (
        <p style={{ color: "var(--text-secondary)", fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>No bounties recorded.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr>
                {COLUMNS.map(c => (
                  <th key={c.key} style={th(c.align)} onClick={() => toggleSort(c.key)}>
                    {c.label}<SortArrow dir={sortKey === c.key ? sortDir : null} />
                  </th>
                ))}
                <th style={th('center')}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bounties.map(b => (
                <tr key={b.id}>
                  <td style={td('left')}>
                    {formatDateTime(b.placed_at)}
                    {!!b.placed_at_estimated && (
                      <span
                        title="This message was missing its timestamp, so this date/time was estimated from a neighboring log line or the message's post time. Edit if it's wrong."
                        style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 5px', borderRadius: '5px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b' }}
                      >
                        est.
                      </span>
                    )}
                  </td>
                  <td style={td('left')}>
                    {b.placer_username || '—'}
                    {b.placer_torn_id && !b.paid && (
                      <a href={`https://www.torn.com/factions.php?step=your#/tab=controls&addMoneyTo=${b.placer_torn_id}&money=${b.total_cost}`}
                        target="_blank" rel="noreferrer"
                        style={{ marginLeft: '6px', fontSize: '10px', padding: '2px 6px', borderRadius: '5px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', textDecoration: 'none' }}>
                        Pay ↗
                      </a>
                    )}
                  </td>
                  <td style={td('left')}>{b.target_username}</td>
                  <td style={{ ...td('left'), color: b.faction_id ? '#e4e4e7' : "var(--text-faint)" }}>{factionName(b.faction_id) || '—'}</td>
                  <td style={td('left')}>
                    {b.ranked_war_id ? (
                      <span>vs {b.opponent_faction_name}</span>
                    ) : (
                      <span style={{ color: '#f59e0b', fontSize: '11px', padding: '2px 6px', borderRadius: '5px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>Unassigned</span>
                    )}
                  </td>
                  <td style={td('right')}>{b.bounty_count}</td>
                  <td style={td('right')}>{fmtMoney(b.bounty_value)}</td>
                  <td style={{ ...td('right'), fontWeight: '600', color: '#f87171' }}>{fmtMoney(b.total_cost)}</td>
                  <td style={td('center')}>
                    <button
                      onClick={() => togglePaid(b)}
                      disabled={togglingPaid === b.id}
                      title={b.paid ? 'Mark as unpaid' : 'Mark as paid'}
                      style={{
                        width: '22px', height: '22px', borderRadius: '6px', cursor: 'pointer',
                        border: `1px solid ${b.paid ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.15)'}`,
                        background: b.paid ? 'rgba(34,197,94,0.2)' : 'transparent',
                        color: b.paid ? '#4ade80' : "var(--text-faint)", fontSize: '13px', lineHeight: 1,
                        opacity: togglingPaid === b.id ? 0.5 : 1,
                      }}
                    >{b.paid ? '✓' : ''}</button>
                  </td>
                  <td style={td('center')}>
                    <button onClick={() => setEditing(b)} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', cursor: 'pointer', marginRight: '4px' }}>Edit</button>
                    <button onClick={() => remove(b.id)} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', cursor: 'pointer' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}
    </div>
  )
}
