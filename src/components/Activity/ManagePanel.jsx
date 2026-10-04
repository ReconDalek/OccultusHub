import { useMemo, useState } from 'react'
import { apiSend, fmtDay, useIsMobile } from './activityUtils'
import { timeAgo } from '../../lib/dates'
import { card, sectionTitle, sectionSub } from './Charts'

const FILTERS = [
  { k: 'all', label: 'All' },
  { k: 'active', label: 'Active' },
  { k: 'paused', label: 'Paused' },
  { k: 'errors', label: 'Errors' },
  { k: 'war', label: 'War' },
]

const SOURCE_STYLE = {
  own:    { label: 'Ours',   color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  manual: { label: 'Manual', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  war:    { label: 'War',    color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
}

export default function ManagePanel({ factions, onChanged, onView }) {
  const isMobile = useIsMobile()
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(new Set())
  const [busy, setBusy] = useState(false)

  const flash = (type, m) => { setMsg({ type, m }); setTimeout(() => setMsg(null), 6000) }

  const list = useMemo(() => factions.filter(f => {
    if (q && !(`${f.name || ''} ${f.tag || ''} ${f.faction_id}`.toLowerCase().includes(q.toLowerCase()))) return false
    if (filter === 'active') return !!f.is_active
    if (filter === 'paused') return !f.is_active
    if (filter === 'errors') return !!f.last_error
    if (filter === 'war') return f.source === 'war'
    return true
  }), [factions, q, filter])

  const counts = useMemo(() => ({
    total: factions.length,
    active: factions.filter(f => f.is_active).length,
    errors: factions.filter(f => f.last_error).length,
  }), [factions])

  async function add() {
    if (!text.trim()) return
    setAdding(true)
    try {
      const r = await apiSend('/api/leadership/activity/factions', 'POST', { text })
      flash('ok', `Added ${r.added} new${r.reactivated ? `, re-enabled ${r.reactivated}` : ''}${r.already ? `, ${r.already} already tracked` : ''}. Names fill in on the first sample (within 30 min).`)
      setText('')
      onChanged()
    } catch (e) { flash('err', e.message) }
    finally { setAdding(false) }
  }

  async function toggle(f) {
    try { await apiSend(`/api/leadership/activity/factions/${f.faction_id}`, 'PATCH', { is_active: !f.is_active }); onChanged() }
    catch (e) { flash('err', e.message) }
  }

  async function removeSelected() {
    const ids = [...selected]
    if (!ids.length) return
    if (!window.confirm(`Stop tracking ${ids.length} faction${ids.length !== 1 ? 's' : ''} and delete their stored activity? This can't be undone.`)) return
    setBusy(true)
    try {
      const r = await apiSend('/api/leadership/activity/factions/remove', 'POST', { faction_ids: ids })
      flash('ok', `Removed ${r.removed} faction${r.removed !== 1 ? 's' : ''}.`)
      setSelected(new Set())
      onChanged()
    } catch (e) { flash('err', e.message) }
    finally { setBusy(false) }
  }

  const toggleSel = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const removable = list.filter(f => f.source !== 'own')
  const allSelected = removable.length > 0 && removable.every(f => selected.has(f.faction_id))

  return (
    <div>
      <div style={card}>
        <h3 style={sectionTitle}>Add factions</h3>
        <p style={sectionSub}>Paste faction IDs or Torn faction links — one per line, or separated by commas/spaces. Hundreds at once is fine. Each faction is sampled every 30 minutes from then on; Torn has no history, so data starts from when it's added.</p>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
          placeholder={'12345\n23456, 34567\nhttps://www.torn.com/factions.php?step=profile&ID=45678'}
          style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#f4f4f5', fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
          <button onClick={add} disabled={adding || !text.trim()} style={btnPrimary(adding || !text.trim())}>{adding ? 'Adding…' : 'Add to tracking'}</button>
          {msg && <span style={{ fontSize: 12, color: msg.type === 'ok' ? '#4ade80' : '#f87171' }}>{msg.m}</span>}
        </div>
      </div>

      <div style={card}>
        <h3 style={sectionTitle}>Tracked factions</h3>
        <p style={sectionSub}>{counts.active} of {counts.total} being sampled{counts.errors ? ` · ${counts.errors} with errors` : ''}. War opponents are added automatically when matched and stop 14 days after the war starts. Factions Torn reports as invalid are paused after 3 failed samples.</p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, tag or ID…" style={{ ...input, flex: '1 1 180px' }} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button key={f.k} onClick={() => setFilter(f.k)} style={chip(filter === f.k)}>{f.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(removable.map(f => f.faction_id)))} />
            Select all shown
          </label>
          <button onClick={removeSelected} disabled={!selected.size || busy} style={btnDanger(!selected.size || busy)}>
            {busy ? 'Removing…' : `Remove selected${selected.size ? ` (${selected.size})` : ''}`}
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Showing {list.length}</span>
        </div>

        <div style={{ display: 'grid', gap: 4 }}>
          {list.map(f => {
            const s = SOURCE_STYLE[f.source] || SOURCE_STYLE.manual
            const own = f.source === 'own'
            return (
              <div key={f.faction_id} style={{
                display: 'grid', gridTemplateColumns: isMobile ? '22px 1fr' : '22px minmax(160px, 1.4fr) 70px 90px minmax(120px, 1fr) auto',
                alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                background: f.is_active ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.01)', border: '1px solid var(--border-subtle)',
                opacity: f.is_active ? 1 : 0.6,
              }}>
                <input type="checkbox" disabled={own} checked={selected.has(f.faction_id)} onChange={() => toggleSel(f.faction_id)} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5' }}>{f.name || <span style={{ color: 'var(--text-faint)' }}>Awaiting first sample</span>}</span>
                    {f.tag && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>[{f.tag}]</span>}
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, color: s.color, background: s.bg }}>{s.label}</span>
                    {!f.is_active && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, color: '#a1a1aa', background: 'rgba(255,255,255,0.06)' }}>Paused</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    ID {f.faction_id}
                    {isMobile && <> · {f.members ?? '—'} members · {f.last_sampled_at ? `sampled ${timeAgo(new Date(f.last_sampled_at * 1000).toISOString())}` : 'not sampled yet'}</>}
                  </div>
                  {f.last_error && <div style={{ fontSize: 11, color: '#f87171' }}>⚠ {f.last_error}</div>}
                  {isMobile && <MobileActions f={f} own={own} onToggle={toggle} onView={onView} />}
                </div>
                {!isMobile && <>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.members ?? '—'} <span style={{ color: 'var(--text-faint)' }}>mem</span></span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.days_stored || 0} <span style={{ color: 'var(--text-faint)' }}>days</span></span>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    {f.last_sampled_at ? `Sampled ${timeAgo(new Date(f.last_sampled_at * 1000).toISOString())}` : 'Not sampled yet'}
                    {f.first_day && <> · since {fmtDay(f.first_day, { day: 'numeric', month: 'short' })}</>}
                  </span>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    {f.days_stored > 0 && <button onClick={() => onView(f.faction_id)} style={btnGhost}>View</button>}
                    {!own && <button onClick={() => toggle(f)} style={btnGhost}>{f.is_active ? 'Pause' : 'Resume'}</button>}
                  </div>
                </>}
              </div>
            )
          })}
          {!list.length && <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No factions match.</p>}
        </div>
      </div>
    </div>
  )
}

function MobileActions({ f, own, onToggle, onView }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
      {f.days_stored > 0 && <button onClick={() => onView(f.faction_id)} style={btnGhost}>View</button>}
      {!own && <button onClick={() => onToggle(f)} style={btnGhost}>{f.is_active ? 'Pause' : 'Resume'}</button>}
    </div>
  )
}

const input = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)', color: '#f4f4f5', fontSize: 13, minWidth: 0,
}
const chip = (on) => ({
  padding: '6px 11px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
  border: `1px solid ${on ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.08)'}`,
  background: on ? 'rgba(167,139,250,0.15)' : 'transparent', color: on ? '#f4f4f5' : 'var(--text-secondary)',
})
const btnPrimary = (dis) => ({
  padding: '9px 18px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: dis ? 'default' : 'pointer',
  background: 'linear-gradient(135deg, #b3123f, #6d28d9)', color: '#fff', opacity: dis ? 0.5 : 1,
})
const btnDanger = (dis) => ({
  padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: dis ? 'default' : 'pointer',
  border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.08)', color: '#f87171', opacity: dis ? 0.4 : 1,
})
const btnGhost = {
  padding: '5px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-secondary)',
}
