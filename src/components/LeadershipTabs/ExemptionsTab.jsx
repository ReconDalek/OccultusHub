import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

const FACTION_LABEL = { 33097: 'Occ1', 9728: 'Occ2', 9171: 'Occ3' }
const EXEMPTION_TYPES = ['Energy', 'Chain', 'War', 'All']

const token = () => localStorage.getItem('occultusSession')

const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

function buildMonthOptions() {
  const now = new Date()
  const options = []
  for (let i = 0; i < 18; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    options.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() })
  }
  return options
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

function fmtDate(d) {
  if (!d) return '—'
  return d.slice(0, 10)
}

function typeColor(t) {
  switch (t) {
    case 'Energy': return { bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24' }
    case 'Chain':  return { bg: 'rgba(179,18,63,0.15)',   color: '#ff2f6d' }
    case 'War':    return { bg: 'rgba(96,165,250,0.15)',  color: '#60a5fa' }
    default:       return { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa' } // All
  }
}

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)',
  color: '#f4f4f5', fontSize: '13px', boxSizing: 'border-box',
}
const labelStyle = { color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }

// ─── Add Exemption Modal ──────────────────────────────────────────────────────

function AddExemptionModal({ members, onClose, onSaved }) {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  const [exemptionType, setExemptionType] = useState('Energy')
  const [dateMode, setDateMode] = useState('range') // 'range' | 'month'
  const [dateStart, setDateStart] = useState(today)
  const [dateEnd, setDateEnd] = useState(today)
  const [selectedMonth, setSelectedMonth] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() })
  const [reason, setReason] = useState('')

  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMember, setSelectedMember] = useState(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const months = buildMonthOptions()

  const filteredMembers = members.filter(m =>
    memberSearch.length > 0 &&
    m.username.toLowerCase().includes(memberSearch.toLowerCase())
  )

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedMember) { setError('Select a member'); return }
    if (!reason.trim())  { setError('Enter a reason'); return }

    const [rangeStart, rangeEnd] = dateMode === 'month'
      ? [
          `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, '0')}-01`,
          `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, '0')}-${String(lastDayOfMonth(selectedMonth.year, selectedMonth.month)).padStart(2, '0')}`,
        ]
      : [dateStart, dateEnd]

    if (rangeEnd < rangeStart) { setError('End date must not be before start date'); return }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/exemptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token() },
        body: JSON.stringify({
          torn_user_id:   selectedMember.torn_user_id,
          username:       selectedMember.username,
          exemption_type: exemptionType,
          date_start:     rangeStart,
          date_end:       rangeEnd,
          reason:         reason.trim(),
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', padding: '16px',
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#12121a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px',
        padding: '28px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ color: '#f4f4f5', fontFamily: 'Cinzel,serif', fontSize: '16px', letterSpacing: '1px', margin: 0 }}>
            Add Exemption
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Member picker */}
          <div>
            <label style={labelStyle}>Member *</label>
            {selectedMember ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
              }}>
                <span style={{ flex: 1, color: '#f4f4f5', fontSize: '13px' }}>{selectedMember.username}</span>
                <span style={{ color: 'var(--text-faint)', fontSize: '11px' }}>
                  {FACTION_LABEL[selectedMember.faction_id]}{selectedMember.level != null && ` · Lv ${selectedMember.level}`}
                </span>
                <button type="button" onClick={() => setSelectedMember(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input
                  style={inputStyle}
                  placeholder="Search member…"
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                />
                {filteredMembers.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                    background: '#1a1a28', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                    maxHeight: '160px', overflowY: 'auto', marginTop: '2px',
                  }}>
                    {filteredMembers.slice(0, 12).map(m => (
                      <button key={m.torn_user_id} type="button"
                        onClick={() => { setSelectedMember(m); setMemberSearch('') }}
                        style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none', color: '#f4f4f5', cursor: 'pointer', fontSize: '13px' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        {m.username}
                        <span style={{ marginLeft: '8px', color: 'var(--text-faint)', fontSize: '11px' }}>
                          {FACTION_LABEL[m.faction_id]} · Lv {m.level}{!m.is_active && ' (departed)'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Type */}
          <div>
            <label style={labelStyle}>Exemption Type *</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {EXEMPTION_TYPES.map(t => {
                const c = typeColor(t)
                const active = exemptionType === t
                return (
                  <button key={t} type="button"
                    onClick={() => setExemptionType(t)}
                    style={{
                      padding: '5px 14px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                      border: `1px solid ${active ? c.color : 'rgba(255,255,255,0.1)'}`,
                      background: active ? c.bg : 'transparent',
                      color: active ? c.color : 'var(--text-secondary)',
                    }}
                  >{t}</button>
                )
              })}
            </div>
          </div>

          {/* Date mode */}
          <div>
            <label style={labelStyle}>Period *</label>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              {[['range', 'Date Range'], ['month', 'Entire Month']].map(([m, l]) => (
                <button key={m} type="button" onClick={() => setDateMode(m)}
                  style={{
                    padding: '6px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                    border: `1px solid ${dateMode === m ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    background: dateMode === m ? 'rgba(167,139,250,0.15)' : 'transparent',
                    color: dateMode === m ? '#f4f4f5' : 'var(--text-secondary)',
                  }}
                >{l}</button>
              ))}
            </div>

            {dateMode === 'range' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: '11px' }}>From</label>
                  <input type="date" style={inputStyle} value={dateStart} onChange={e => setDateStart(e.target.value)} />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: '11px' }}>To</label>
                  <input type="date" style={inputStyle} value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
                </div>
              </div>
            ) : (
              <select
                value={`${selectedMonth.year}-${selectedMonth.month}`}
                onChange={e => {
                  const [y, mo] = e.target.value.split('-').map(Number)
                  setSelectedMonth({ year: y, month: mo })
                }}
                style={inputStyle}
              >
                {months.map(({ year, month }) => (
                  <option key={`${year}-${month}`} value={`${year}-${month}`}>{MONTHS_FULL[month]} {year}</option>
                ))}
              </select>
            )}
          </div>

          {/* Reason */}
          <div>
            <label style={labelStyle}>Reason *</label>
            <textarea rows={2} style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Why this member is exempt…"
              value={reason}
              onChange={e => setReason(e.target.value)} />
          </div>

          {error && <p style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button type="button" onClick={onClose}
              style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', background: 'rgba(179,18,63,0.8)', color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: '13px', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Add Exemption'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Exemption row ────────────────────────────────────────────────────────────

function ExemptionRow({ e, onDelete }) {
  const tc = typeColor(e.exemption_type)
  return (
    <div style={{
      padding: '12px 14px', borderRadius: '8px', marginBottom: '6px',
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap',
    }}>
      <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', background: tc.bg, color: tc.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {e.exemption_type}
      </span>
      <div style={{ flex: 1, minWidth: '220px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'baseline' }}>
          <span style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '500' }}>{e.username}</span>
          <span style={{ color: 'var(--text-faint)', fontSize: '11px' }}>{fmtDate(e.date_start)} – {fmtDate(e.date_end)}</span>
        </div>
        {e.reason && <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '4px 0 0', fontStyle: 'italic' }}>"{e.reason}"</p>}
        {e.created_by_username && (
          <p style={{ color: 'var(--text-faint)', fontSize: '11px', margin: '4px 0 0' }}>Added by {e.created_by_username}</p>
        )}
      </div>
      <button onClick={() => onDelete(e.id)}
        style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.08)', color: '#f87171', cursor: 'pointer', fontSize: '11px', flexShrink: 0 }}>
        Delete
      </button>
    </div>
  )
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function ExemptionsTab() {
  const [exemptions, setExemptions] = useState([])
  const [members, setMembers]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    fetchExemptions()
    fetchMembers()
  }, [])

  async function fetchExemptions() {
    setLoading(true)
    try {
      const res  = await fetch(`${API_BASE_URL}/api/leadership/exemptions`, { headers: { Authorization: token() } })
      const data = await res.json()
      setExemptions(data.exemptions || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  async function fetchMembers() {
    try {
      const res  = await fetch(`${API_BASE_URL}/api/leadership/warnings/members`, { headers: { Authorization: token() } })
      const data = await res.json()
      setMembers(data.members || [])
    } catch { /* ignore */ }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this exemption?')) return
    await fetch(`${API_BASE_URL}/api/leadership/exemptions/${id}`, {
      method: 'DELETE', headers: { Authorization: token() },
    })
    setExemptions(prev => prev.filter(e => e.id !== id))
  }

  const displayed = exemptions.filter(e =>
    !search || e.username.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cinzel,serif', color: '#f4f4f5', fontSize: '20px', letterSpacing: '1px', marginBottom: '4px' }}>
            Warning Exemptions
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
            {displayed.length} exemption{displayed.length !== 1 ? 's' : ''} on record
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{ padding: '9px 22px', borderRadius: '8px', border: 'none', background: 'rgba(179,18,63,0.7)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
        >
          + Add Exemption
        </button>
      </div>

      <input
        style={{
          width: '100%', maxWidth: '320px', padding: '8px 12px', borderRadius: '8px', marginBottom: '20px',
          border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.05)',
          color: '#f4f4f5', fontSize: '13px', boxSizing: 'border-box',
        }}
        placeholder="Search member…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : displayed.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          {exemptions.length === 0 ? 'No exemptions recorded yet.' : 'No exemptions match the current search.'}
        </p>
      ) : (
        <div>
          {displayed.map(e => (
            <ExemptionRow key={e.id} e={e} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showAddModal && (
        <AddExemptionModal
          members={members}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); fetchExemptions() }}
        />
      )}
    </div>
  )
}
