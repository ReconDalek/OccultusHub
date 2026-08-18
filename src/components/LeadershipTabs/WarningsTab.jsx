import { useState, useEffect } from 'react'
import { useSession } from '../../hooks/useSession'
import { API_BASE_URL } from '../../config/api'
import GenerateWarningsPanel from './GenerateWarningsPanel'
import ExemptionsTab from './ExemptionsTab'

const FACTION_LABEL = { 33097: 'Occ1', 9728: 'Occ2', 9171: 'Occ3' }
const FACTION_IDS_ALL = [33097, 9728, 9171]
const WARNING_TYPES = ['Energy', 'Chain', 'Other']

const TYPE_LABELS = {
  Energy: { target: 'Target Avg/Day', achieved: 'Achieved Avg/Day' },
  Chain:  { target: 'Target Hits',    achieved: 'Hits Achieved' },
  Other:  { target: 'Target',         achieved: 'Achieved' },
}

const token = () => localStorage.getItem('occultusSession')

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Defaults the period picker to last calendar month — warnings are typically
// reported on a period that has already ended.
function defaultPeriod() {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { period_month: prev.getMonth() + 1, period_year: prev.getFullYear() }
}

// ─── Window helpers ───────────────────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, '0') }

// Returns the last 6 complete months, not including the current month.
// E.g. if today is July 2026, returns Jan 1 2026 – Jun 30 2026.
// Built from plain year/month integers (no Date→toISOString round-trip) —
// that round-trip converts a local midnight to UTC, which rolls the date
// back a day (and sometimes a whole month) for any timezone ahead of UTC.
function getSixMonthWindow() {
  const now = new Date()
  const endYear  = now.getFullYear()
  const endMonth = now.getMonth() // 0-indexed; exclusive end = 1st of this month
  let startYear  = endYear
  let startMonth = endMonth - 6
  if (startMonth < 0) { startMonth += 12; startYear -= 1 }
  return {
    start: `${startYear}-${pad2(startMonth + 1)}-01`,
    end:   `${endYear}-${pad2(endMonth + 1)}-01`,
  }
}

function windowLabel(win) {
  const [sy, sm] = win.start.split('-').map(Number)
  const [ey, em] = win.end.split('-').map(Number)
  // end is exclusive (1st of current month), so last included month = end - 1
  let lastMonth = em - 1
  let lastYear  = ey
  if (lastMonth < 1) { lastMonth = 12; lastYear -= 1 }
  const sStr = `${MONTHS[sm - 1]} ${sy}`
  const eStr = `${MONTHS[lastMonth - 1]} ${lastYear}`
  return `${sStr} – ${eStr}`
}

// Windows against the warning's period (what month it's actually FOR), not
// date_reported (when it was logged) — warnings are always reported in
// arrears, so date_reported would misalign which periods count.
function isInWindow(periodYear, periodMonth, win) {
  if (periodYear == null || periodMonth == null) return false
  const periodStr = `${periodYear}-${pad2(periodMonth)}-01`
  return periodStr >= win.start && periodStr < win.end
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—'
  return d.slice(0, 10)
}

function typeColor(t) {
  switch (t) {
    case 'Energy': return { bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24' }
    case 'Chain':  return { bg: 'rgba(179,18,63,0.15)',   color: '#ff2f6d' }
    default:       return { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }
  }
}

// ─── Add Warning Modal ────────────────────────────────────────────────────────

function AddWarningModal({ members, onClose, onRefresh }) {
  const today = new Date().toISOString().slice(0, 10)

  // Shared fields
  const [shared, setShared] = useState({
    warning_type: 'Energy',
    custom_type: '',
    ...defaultPeriod(),
    date_reported: today,
    date_issued: '',
    target_value: '',
    comment: '',
  })

  const currentYear = new Date().getFullYear()
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1]
  const periodLabel = `${MONTHS_FULL[shared.period_month - 1]} ${shared.period_year}`

  // Per-member list: [{ torn_user_id, username, achieved_value }]
  const [selectedMembers, setSelectedMembers] = useState([])
  const [memberSearch, setMemberSearch]       = useState('')
  const [saving, setSaving]                   = useState(false)
  const [error, setError]                     = useState(null)
  const [savedNames, setSavedNames]           = useState(null) // set after batch save

  const resolvedType = shared.warning_type === 'Other' ? shared.custom_type : shared.warning_type
  const typeInfo     = TYPE_LABELS[shared.warning_type] || TYPE_LABELS.Other

  const filteredMembers = members.filter(m =>
    memberSearch.length > 0 &&
    m.username.toLowerCase().includes(memberSearch.toLowerCase()) &&
    !selectedMembers.find(s => s.torn_user_id === m.torn_user_id)
  )

  function addMember(m) {
    setSelectedMembers(prev => [...prev, { torn_user_id: m.torn_user_id, username: m.username, faction_id: m.faction_id, level: m.level, is_active: m.is_active, achieved_value: '' }])
    setMemberSearch('')
  }

  function removeMember(id) {
    setSelectedMembers(prev => prev.filter(m => m.torn_user_id !== id))
  }

  function setAchieved(id, val) {
    setSelectedMembers(prev => prev.map(m => m.torn_user_id === id ? { ...m, achieved_value: val } : m))
  }

  function resetForNextBatch() {
    setSelectedMembers([])
    setMemberSearch('')
    setSavedNames(null)
    onRefresh()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (selectedMembers.length === 0) { setError('Add at least one member'); return }
    if (!resolvedType)                { setError('Enter a warning type'); return }

    setSaving(true)
    setError(null)
    try {
      const results = await Promise.all(
        selectedMembers.map(m =>
          fetch(`${API_BASE_URL}/api/leadership/warnings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token() },
            body: JSON.stringify({
              torn_user_id:   m.torn_user_id,
              username:       m.username,
              date_reported:  shared.date_reported,
              date_issued:    shared.date_issued || null,
              period:         periodLabel,
              period_month:   shared.period_month,
              period_year:    shared.period_year,
              warning_type:   resolvedType,
              target_value:   shared.target_value !== '' ? parseFloat(shared.target_value) : null,
              achieved_value: m.achieved_value !== '' ? parseFloat(m.achieved_value) : null,
              comment:        shared.comment || null,
            }),
          }).then(r => r.json())
        )
      )
      const failed = results.filter(r => r.error)
      if (failed.length > 0) { setError(`${failed.length} warning(s) failed to save`); return }
      setSavedNames(selectedMembers.map(m => m.username))
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)',
    color: '#f4f4f5', fontSize: '13px', boxSizing: 'border-box',
  }
  const labelStyle = { color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', padding: '16px',
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#12121a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px',
        padding: '28px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ color: '#f4f4f5', fontFamily: 'Cinzel,serif', fontSize: '16px', letterSpacing: '1px', margin: 0 }}>
            Add Warning
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>

        {savedNames ? (
          /* ── Post-save confirmation ── */
          <div style={{ borderRadius: '10px', border: '1px solid rgba(74,222,128,0.25)', background: 'rgba(74,222,128,0.07)', padding: '18px 20px' }}>
            <p style={{ color: '#4ade80', fontSize: '14px', margin: '0 0 6px', fontWeight: '600' }}>
              {savedNames.length} warning{savedNames.length !== 1 ? 's' : ''} saved
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '0 0 16px' }}>
              {savedNames.join(', ')}
            </p>
            <p style={{ color: '#f4f4f5', fontSize: '13px', margin: '0 0 14px' }}>Add another batch?</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={resetForNextBatch}
                style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: 'rgba(179,18,63,0.8)', color: '#fff', cursor: 'pointer', fontSize: '13px' }}>
                Yes, add another
              </button>
              <button type="button" onClick={() => { onRefresh(); onClose() }}
                style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
                No, done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* Warning type */}
            <div>
              <label style={labelStyle}>Warning Type *</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {WARNING_TYPES.map(t => {
                  const c = typeColor(t)
                  const active = shared.warning_type === t
                  return (
                    <button key={t} type="button"
                      onClick={() => setShared(f => ({ ...f, warning_type: t }))}
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
              {shared.warning_type === 'Other' && (
                <input style={{ ...inputStyle, marginTop: '8px' }} placeholder="Specify type…"
                  value={shared.custom_type}
                  onChange={e => setShared(f => ({ ...f, custom_type: e.target.value }))} />
              )}
            </div>

            {/* Period */}
            <div>
              <label style={labelStyle}>Period *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <select style={inputStyle} value={shared.period_month}
                  onChange={e => setShared(f => ({ ...f, period_month: parseInt(e.target.value, 10) }))}>
                  {MONTHS_FULL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select style={inputStyle} value={shared.period_year}
                  onChange={e => setShared(f => ({ ...f, period_year: parseInt(e.target.value, 10) }))}>
                  {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Dates row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Date Reported *</label>
                <input type="date" style={inputStyle} value={shared.date_reported}
                  onChange={e => setShared(f => ({ ...f, date_reported: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Date Issued (optional)</label>
                <input type="date" style={inputStyle} value={shared.date_issued}
                  onChange={e => setShared(f => ({ ...f, date_issued: e.target.value }))} />
              </div>
            </div>

            {/* Target (shared) */}
            <div>
              <label style={labelStyle}>{typeInfo.target} (shared)</label>
              <input type="number" style={inputStyle} placeholder="e.g. 500"
                value={shared.target_value}
                onChange={e => setShared(f => ({ ...f, target_value: e.target.value }))} />
            </div>

            {/* Comment */}
            <div>
              <label style={labelStyle}>Comment / Note (optional)</label>
              <textarea rows={2} style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Any notes about this warning batch…"
                value={shared.comment}
                onChange={e => setShared(f => ({ ...f, comment: e.target.value }))} />
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '2px 0' }} />

            {/* Member picker */}
            <div>
              <label style={labelStyle}>Members * — achieved value per member</label>
              <div style={{ position: 'relative' }}>
                <input
                  style={inputStyle}
                  placeholder="Search and add members…"
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
                      <button key={m.torn_user_id} type="button" onClick={() => addMember(m)}
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

              {/* Selected members list */}
              {selectedMembers.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {selectedMembers.map(m => (
                    <div key={m.torn_user_id} style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '8px 12px', borderRadius: '8px',
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ color: '#f4f4f5', fontSize: '13px' }}>{m.username}</span>
                        <span style={{ marginLeft: '6px', color: 'var(--text-faint)', fontSize: '11px' }}>
                          {FACTION_LABEL[m.faction_id]}{m.level != null && ` · Lv ${m.level}`}
                        </span>
                      </div>
                      <input
                        type="number"
                        placeholder={typeInfo.achieved}
                        value={m.achieved_value}
                        onChange={e => setAchieved(m.torn_user_id, e.target.value)}
                        style={{ width: '110px', padding: '5px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: '#f4f4f5', fontSize: '12px' }}
                      />
                      <button type="button" onClick={() => removeMember(m.torn_user_id)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '2px 4px', flexShrink: 0 }}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <p style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{error}</p>}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button type="button" onClick={onClose}
                style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
                Cancel
              </button>
              <button type="submit" disabled={saving || selectedMembers.length === 0}
                style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', background: 'rgba(179,18,63,0.8)', color: '#fff', cursor: (saving || selectedMembers.length === 0) ? 'default' : 'pointer', fontSize: '13px', opacity: (saving || selectedMembers.length === 0) ? 0.5 : 1 }}>
                {saving ? 'Saving…' : `Add ${selectedMembers.length > 0 ? selectedMembers.length + ' ' : ''}Warning${selectedMembers.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Edit Warning Modal — full edit of an existing warning's own details
// (type, period, both dates, target/achieved, comment). Distinct from the
// inline "Issue" quick-action below, which only ever touches date_issued +
// comment. Member identity (torn_user_id/username) is never editable here —
// a warning attributed to the wrong member should be deleted and re-added. ──

function EditWarningModal({ warning: w, onClose, onSaved }) {
  const knownType = WARNING_TYPES.includes(w.warning_type) ? w.warning_type : 'Other'
  const [form, setForm] = useState({
    warning_type:   knownType,
    custom_type:    knownType === 'Other' ? w.warning_type : '',
    period_month:   w.period_month || defaultPeriod().period_month,
    period_year:    w.period_year || defaultPeriod().period_year,
    date_reported:  w.date_reported ? w.date_reported.slice(0, 10) : '',
    date_issued:    w.date_issued ? w.date_issued.slice(0, 10) : '',
    target_value:   w.target_value ?? '',
    achieved_value: w.achieved_value ?? '',
    comment:        w.comment || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  const currentYear = new Date().getFullYear()
  const yearOptions  = [currentYear - 1, currentYear, currentYear + 1]
  const resolvedType = form.warning_type === 'Other' ? form.custom_type : form.warning_type
  const typeInfo      = TYPE_LABELS[form.warning_type] || TYPE_LABELS.Other
  const periodLabel   = `${MONTHS_FULL[form.period_month - 1]} ${form.period_year}`

  async function handleSubmit(e) {
    e.preventDefault()
    if (!resolvedType)        { setError('Enter a warning type'); return }
    if (!form.date_reported)  { setError('Date reported is required'); return }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/warnings/${w.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: token() },
        body: JSON.stringify({
          date_reported:  form.date_reported,
          date_issued:    form.date_issued || null,
          period:         periodLabel,
          period_month:   form.period_month,
          period_year:    form.period_year,
          warning_type:   resolvedType,
          target_value:   form.target_value !== '' ? parseFloat(form.target_value) : null,
          achieved_value: form.achieved_value !== '' ? parseFloat(form.achieved_value) : null,
          comment:        form.comment || null,
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onSaved({
        date_reported:  form.date_reported,
        date_issued:    form.date_issued || null,
        period:         periodLabel,
        period_month:   form.period_month,
        period_year:    form.period_year,
        warning_type:   resolvedType,
        target_value:   form.target_value !== '' ? parseFloat(form.target_value) : null,
        achieved_value: form.achieved_value !== '' ? parseFloat(form.achieved_value) : null,
        comment:        form.comment || null,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)',
    color: '#f4f4f5', fontSize: '13px', boxSizing: 'border-box',
  }
  const labelStyle = { color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }

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
            Edit Warning
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>

        <p style={{ color: '#f4f4f5', fontSize: '14px', margin: '0 0 18px' }}>{w.username}</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Warning Type *</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {WARNING_TYPES.map(t => {
                const c = typeColor(t)
                const active = form.warning_type === t
                return (
                  <button key={t} type="button"
                    onClick={() => setForm(f => ({ ...f, warning_type: t }))}
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
            {form.warning_type === 'Other' && (
              <input style={{ ...inputStyle, marginTop: '8px' }} placeholder="Specify type…"
                value={form.custom_type}
                onChange={e => setForm(f => ({ ...f, custom_type: e.target.value }))} />
            )}
          </div>

          <div>
            <label style={labelStyle}>Period *</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <select style={inputStyle} value={form.period_month}
                onChange={e => setForm(f => ({ ...f, period_month: parseInt(e.target.value, 10) }))}>
                {MONTHS_FULL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select style={inputStyle} value={form.period_year}
                onChange={e => setForm(f => ({ ...f, period_year: parseInt(e.target.value, 10) }))}>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Date Reported *</label>
              <input type="date" style={inputStyle} value={form.date_reported}
                onChange={e => setForm(f => ({ ...f, date_reported: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Date Issued (optional)</label>
              <input type="date" style={inputStyle} value={form.date_issued}
                onChange={e => setForm(f => ({ ...f, date_issued: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>{typeInfo.target}</label>
              <input type="number" style={inputStyle} placeholder="e.g. 500"
                value={form.target_value}
                onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>{typeInfo.achieved}</label>
              <input type="number" style={inputStyle}
                value={form.achieved_value}
                onChange={e => setForm(f => ({ ...f, achieved_value: e.target.value }))} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Comment / Note (optional)</label>
            <textarea rows={2} style={{ ...inputStyle, resize: 'vertical' }}
              value={form.comment}
              onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} />
          </div>

          {error && <p style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button type="button" onClick={onClose}
              style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', background: 'rgba(179,18,63,0.8)', color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: '13px', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Warning row ──────────────────────────────────────────────────────────────

function WarningRow({ w, expired, onDelete }) {
  const [editing, setEditing]   = useState(false)
  const [editingAll, setEditingAll] = useState(false)
  const [comment, setComment] = useState(w.comment || '')
  // Presets to today (UTC) when issuing for the first time — still freely
  // editable, just saves the common case of "issuing right now" a click.
  const [dateIssued, setDateIssued] = useState(w.date_issued || new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const tc = typeColor(w.warning_type)

  // The "Issue" quick-action — only sets date_issued + comment, distinct
  // from the full Edit modal below which can change any field.
  async function saveIssue() {
    setSaving(true)
    await fetch(`${API_BASE_URL}/api/leadership/warnings/${w.id}/comment`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: token() },
      body: JSON.stringify({ comment, date_issued: dateIssued || null }),
    })
    setSaving(false)
    setEditing(false)
    w.comment     = comment
    w.date_issued = dateIssued || null
  }

  return (
    <div style={{
      padding: '12px 14px', borderRadius: '8px', marginBottom: '6px',
      background: expired ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${expired ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)'}`,
      opacity: expired ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
        {/* Type badge */}
        <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', background: tc.bg, color: tc.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {w.warning_type}
        </span>
        {expired && (
          <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '10px', background: 'rgba(255,255,255,0.04)', color: 'var(--text-faint)', flexShrink: 0 }}>
            expired
          </span>
        )}

        {/* Core info */}
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Period: <span style={{ color: '#f4f4f5' }}>{w.period}</span></span>
            {w.target_value != null && (
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                Target: <span style={{ color: '#f4f4f5' }}>{w.target_value}</span>
                {w.achieved_value != null && (
                  <> → Achieved: <span style={{ color: w.achieved_value < w.target_value ? '#f87171' : '#4ade80' }}>{w.achieved_value}</span></>
                )}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-faint)', fontSize: '11px' }}>Reported: {fmtDate(w.date_reported)}</span>
            <span style={{ color: 'var(--text-faint)', fontSize: '11px' }}>Issued: {fmtDate(w.date_issued)}</span>
            {w.issued_by_username && (
              <span style={{ color: 'var(--text-faint)', fontSize: '11px' }}>By: {w.issued_by_username}</span>
            )}
          </div>
          {w.comment && !editing && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '6px 0 0', fontStyle: 'italic' }}>
              "{w.comment}"
            </p>
          )}
          {editing && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input type="date"
                value={dateIssued}
                onChange={e => setDateIssued(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: '#f4f4f5', fontSize: '12px', width: '160px' }}
              />
              <textarea rows={2}
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Comment or member response…"
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: '#f4f4f5', fontSize: '12px', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={saveIssue} disabled={saving}
                  style={{ padding: '5px 14px', borderRadius: '6px', border: 'none', background: 'rgba(74,222,128,0.2)', color: '#4ade80', cursor: 'pointer', fontSize: '12px' }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditing(false)}
                  style={{ padding: '5px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {!editing && !w.date_issued && (
            <button onClick={() => setEditing(true)}
              title="Set the date this warning was actually delivered to the member, plus a comment"
              style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(74,222,128,0.3)', background: 'rgba(74,222,128,0.1)', color: '#4ade80', cursor: 'pointer', fontSize: '11px' }}>
              Issue
            </button>
          )}
          {!w.date_issued && (
            <a href={`https://www.torn.com/messages.php#/p=compose&XID=${w.torn_user_id}`}
              target="_blank" rel="noopener noreferrer"
              title="Compose a Torn mail to this member"
              style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.1)', color: '#60a5fa', cursor: 'pointer', fontSize: '11px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              Mail
            </a>
          )}
          <button onClick={() => setEditingAll(true)}
            title="Edit all details of this warning"
            style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '11px' }}>
            Edit
          </button>
          <button onClick={() => onDelete(w.id)}
            style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.08)', color: '#f87171', cursor: 'pointer', fontSize: '11px' }}>
            Delete
          </button>
        </div>
      </div>

      {editingAll && (
        <EditWarningModal
          warning={w}
          onClose={() => setEditingAll(false)}
          onSaved={(updated) => {
            Object.assign(w, updated)
            setEditingAll(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Member card ──────────────────────────────────────────────────────────────

function MemberCard({ member, windowWarnings, historicalWarnings, showAllWarnings, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const kickCount = windowWarnings.length

  return (
    <div style={{ border: `1px solid ${kickCount >= 3 ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.07)'}`, borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
      {/* Header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
          padding: '12px 16px',
          background: kickCount >= 3 ? 'rgba(248,113,113,0.04)' : 'rgba(255,255,255,0.02)',
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ color: '#f4f4f5', fontSize: '14px', fontWeight: '500' }}>{member.username}</span>
          <span style={{ marginLeft: '8px', color: 'var(--text-faint)', fontSize: '11px' }}>
            {FACTION_LABEL[member.current_faction_id]}
            {member.level != null && ` · Lv ${member.level}`}
            {!member.is_active && <span style={{ color: '#f87171', marginLeft: '4px' }}>(departed)</span>}
          </span>
        </div>

        {/* Kick-window badge — always shows 6-month count */}
        <span style={{
          padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '700',
          background: kickCount >= 3 ? 'rgba(248,113,113,0.2)' : kickCount >= 2 ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.06)',
          color: kickCount >= 3 ? '#f87171' : kickCount >= 2 ? '#fbbf24' : 'var(--text-secondary)',
        }}>
          {kickCount} / 3
        </span>

        {showAllWarnings && historicalWarnings.length > 0 && (
          <span style={{ color: 'var(--text-faint)', fontSize: '11px', whiteSpace: 'nowrap' }}>
            +{historicalWarnings.length} older
          </span>
        )}

        {windowWarnings[0] && (
          <span style={{ color: 'var(--text-faint)', fontSize: '11px', whiteSpace: 'nowrap' }}>
            Last: {fmtDate(windowWarnings[0].date_reported)}
          </span>
        )}

        <span style={{ color: 'var(--text-faint)', fontSize: '13px', marginLeft: '4px' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Expanded warnings */}
      {expanded && (
        <div style={{ padding: '10px 14px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {windowWarnings.map(w => (
            <WarningRow key={w.id} w={w} expired={false} onDelete={onDelete} />
          ))}
          {showAllWarnings && historicalWarnings.length > 0 && (
            <>
              {windowWarnings.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0 8px' }}>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
                  <span style={{ color: 'var(--text-faint)', fontSize: '11px' }}>older / expired</span>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
                </div>
              )}
              {historicalWarnings.map(w => (
                <WarningRow key={w.id} w={w} expired={true} onDelete={onDelete} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function WarningsTab() {
  // Recomputed on every render (not module scope) so a long-lived tab picks up
  // the real current month instead of freezing at whatever date the bundle
  // first loaded.
  const WINDOW = getSixMonthWindow()
  const { user } = useSession()
  const [view,             setView]              = useState('overview')
  const [warnings,         setWarnings]         = useState([])
  const [members,          setMembers]           = useState([])
  const [loading,          setLoading]           = useState(true)
  const [activeOnly,       setActiveOnly]        = useState(true)
  const [showAllWarnings,  setShowAllWarnings]   = useState(false)
  const [search,           setSearch]            = useState('')
  const [showAddModal,     setShowAddModal]      = useState(false)
  const [periodFilter,     setPeriodFilter]      = useState('all')
  const [factionFilter,    setFactionFilter]     = useState(FACTION_IDS_ALL)
  const [issuedFilter,     setIssuedFilter]      = useState('all') // 'all' | 'issued' | 'reported'

  useEffect(() => {
    Promise.all([fetchWarnings(), fetchMembers()])
  }, [])

  async function fetchWarnings() {
    setLoading(true)
    try {
      const res  = await fetch(`${API_BASE_URL}/api/leadership/warnings`, { headers: { Authorization: token() } })
      const data = await res.json()
      setWarnings(data.warnings || [])
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
    if (!confirm('Delete this warning?')) return
    await fetch(`${API_BASE_URL}/api/leadership/warnings/${id}`, {
      method: 'DELETE', headers: { Authorization: token() },
    })
    setWarnings(w => w.filter(x => x.id !== id))
  }

  function toggleFactionFilter(id) {
    setFactionFilter(prev => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev // keep at least one selected
        return prev.filter(f => f !== id)
      }
      return [...prev, id]
    })
  }

  // Every unique period actually logged on a warning (e.g. "July 2026"), most
  // recent first — sourced from the real data, not a generic month list, so
  // the dropdown only ever shows periods that exist. Sorted by period_year/
  // period_month when available; falls back to the end so any legacy warning
  // without those set doesn't scramble the ordering of periods that do.
  const periodOptions = (() => {
    const map = new Map()
    for (const w of warnings) {
      if (!map.has(w.period)) map.set(w.period, { year: w.period_year, month: w.period_month })
    }
    return Array.from(map.entries())
      .map(([period, meta]) => ({ period, ...meta }))
      .sort((a, b) => {
        const aKey = (a.year != null && a.month != null) ? a.year * 12 + a.month : -Infinity
        const bKey = (b.year != null && b.month != null) ? b.year * 12 + b.month : -Infinity
        return bKey - aKey
      })
  })()

  // Group all warnings by member, split into window vs historical
  const grouped = {}
  for (const w of warnings) {
    if (!grouped[w.torn_user_id]) {
      grouped[w.torn_user_id] = {
        username:           w.username,
        is_active:          w.is_active,
        level:              w.level,
        current_faction_id: w.current_faction_id,
        windowWarnings:     [],
        historicalWarnings: [],
      }
    }
    if (isInWindow(w.period_year, w.period_month, WINDOW)) {
      grouped[w.torn_user_id].windowWarnings.push(w)
    } else {
      grouped[w.torn_user_id].historicalWarnings.push(w)
    }
  }

  // A specific period selected in the dropdown bypasses the 6-month-window
  // grouping entirely — just every warning matching that exact period,
  // grouped by member, no window/historical split (there's nothing "older"
  // to distinguish within a single period).
  const periodGrouped = {}
  if (periodFilter !== 'all') {
    for (const w of warnings) {
      if (w.period !== periodFilter) continue
      if (!periodGrouped[w.torn_user_id]) {
        periodGrouped[w.torn_user_id] = {
          username:           w.username,
          is_active:          w.is_active,
          level:              w.level,
          current_faction_id: w.current_faction_id,
          windowWarnings:     [],
          historicalWarnings: [],
        }
      }
      periodGrouped[w.torn_user_id].windowWarnings.push(w)
    }
  }

  const activeGrouped = periodFilter === 'all' ? grouped : periodGrouped

  function matchesIssued(w) {
    if (issuedFilter === 'issued')   return !!w.date_issued
    if (issuedFilter === 'reported') return !w.date_issued
    return true
  }

  // Filter members — issued/reported filtering happens on the individual
  // warning lists first (a member can have a mix of issued and not-yet-issued
  // warnings), then member-level filters apply on top of the filtered lists.
  const displayed = Object.entries(activeGrouped)
    .map(([id, m]) => (issuedFilter === 'all' ? [id, m] : [id, {
      ...m,
      windowWarnings:     m.windowWarnings.filter(matchesIssued),
      historicalWarnings: m.historicalWarnings.filter(matchesIssued),
    }]))
    .filter(([, m]) => {
      if (activeOnly && !m.is_active) return false
      // Only excludes members with a KNOWN faction that isn't selected — a
      // member with no faction_members match at all (very old warning
      // against a purged record) always passes through rather than
      // vanishing under the default "all factions" filter.
      if (m.current_faction_id != null && !factionFilter.includes(m.current_faction_id)) return false
      // In default mode, only show members who have at least one warning in the window.
      // A specific period filter already scopes to matching warnings only, so this
      // additional window check doesn't apply there.
      if (periodFilter === 'all' && !showAllWarnings && m.windowWarnings.length === 0) return false
      // Issued/reported filtering can empty out a member entirely (e.g. every
      // warning they have is already issued, but "Not yet issued" is selected).
      if (issuedFilter !== 'all' && m.windowWarnings.length === 0 && m.historicalWarnings.length === 0) return false
      if (search && !m.username.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })

  // Sort: kick-at-risk first (window count desc), then by most recent window warning
  displayed.sort((a, b) => {
    const diff = b[1].windowWarnings.length - a[1].windowWarnings.length
    if (diff !== 0) return diff
    const aDate = a[1].windowWarnings[0]?.date_reported || a[1].historicalWarnings[0]?.date_reported || ''
    const bDate = b[1].windowWarnings[0]?.date_reported || b[1].historicalWarnings[0]?.date_reported || ''
    return bDate.localeCompare(aDate)
  })

  const atRisk      = displayed.filter(([, m]) => m.windowWarnings.length >= 3).length
  const totalWindow = displayed.reduce((s, [, m]) => s + m.windowWarnings.length, 0)

  return (
    <div>
      {/* View switcher */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[['overview', 'Overview'], ['exemptions', 'Exemptions'], ['generate', 'Generate']].map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: '7px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
              fontWeight: view === v ? '600' : '400',
              border: `1px solid ${view === v ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.08)'}`,
              background: view === v ? 'rgba(167,139,250,0.15)' : 'transparent',
              color: view === v ? '#f4f4f5' : 'var(--text-secondary)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'exemptions' && <ExemptionsTab />}

      {view === 'generate' && <GenerateWarningsPanel onWarningSaved={fetchWarnings} />}

      {view === 'overview' && (
      <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cinzel,serif', color: '#f4f4f5', fontSize: '20px', letterSpacing: '1px', marginBottom: '4px' }}>
            Member Warnings
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
            {periodFilter !== 'all' ? periodFilter : showAllWarnings ? 'All time' : windowLabel(WINDOW)}
            {' · '}
            {displayed.length} member{displayed.length !== 1 ? 's' : ''} · {totalWindow} warning{totalWindow !== 1 ? 's' : ''}{periodFilter === 'all' && ' in window'}
            {atRisk > 0 && (
              <span style={{ marginLeft: '8px', color: '#f87171', fontWeight: '600' }}>
                · {atRisk} at kick threshold
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{ padding: '9px 22px', borderRadius: '8px', border: 'none', background: 'rgba(179,18,63,0.7)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
        >
          + Add Warning
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{
            flex: 1, minWidth: '180px', padding: '8px 12px', borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.05)',
            color: '#f4f4f5', fontSize: '13px',
          }}
          placeholder="Search member…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          value={periodFilter}
          onChange={e => setPeriodFilter(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
            border: `1px solid ${periodFilter !== 'all' ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.08)'}`,
            background: periodFilter !== 'all' ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.05)',
            color: periodFilter !== 'all' ? '#a78bfa' : 'var(--text-secondary)',
          }}
        >
          <option value="all">All periods</option>
          {periodOptions.map(p => (
            <option key={p.period} value={p.period}>{p.period}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: '4px' }}>
          {FACTION_IDS_ALL.map(id => {
            const active = factionFilter.includes(id)
            return (
              <button key={id} onClick={() => toggleFactionFilter(id)}
                style={{
                  padding: '8px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                  border: `1px solid ${active ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  background: active ? 'rgba(167,139,250,0.12)' : 'transparent',
                  color: active ? '#a78bfa' : 'var(--text-secondary)',
                }}
              >
                {FACTION_LABEL[id]}
              </button>
            )
          })}
        </div>
        <select
          value={issuedFilter}
          onChange={e => setIssuedFilter(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
            border: `1px solid ${issuedFilter !== 'all' ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.08)'}`,
            background: issuedFilter !== 'all' ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)',
            color: issuedFilter !== 'all' ? '#4ade80' : 'var(--text-secondary)',
          }}
        >
          <option value="all">Issued + Reported</option>
          <option value="issued">Issued only</option>
          <option value="reported">Reported only (not yet issued)</option>
        </select>
        <button
          onClick={() => setActiveOnly(a => !a)}
          style={{
            padding: '8px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap',
            border: `1px solid ${activeOnly ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
            background: activeOnly ? 'rgba(139,92,246,0.12)' : 'transparent',
            color: activeOnly ? '#a78bfa' : 'var(--text-secondary)',
          }}
        >
          {activeOnly ? 'Active members only' : 'All members'}
        </button>
        {periodFilter === 'all' && (
          <button
            onClick={() => setShowAllWarnings(a => !a)}
            style={{
              padding: '8px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap',
              border: `1px solid ${showAllWarnings ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.08)'}`,
              background: showAllWarnings ? 'rgba(251,191,36,0.1)' : 'transparent',
              color: showAllWarnings ? '#fbbf24' : 'var(--text-secondary)',
            }}
          >
            {showAllWarnings ? 'All warnings' : 'Last 6 months'}
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : displayed.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          {warnings.length === 0 ? 'No warnings recorded yet.' : 'No warnings match the current filter.'}
        </p>
      ) : (
        <div>
          {displayed.map(([id, m]) => (
            <MemberCard
              key={id}
              member={{ torn_user_id: parseInt(id, 10), ...m }}
              windowWarnings={m.windowWarnings}
              historicalWarnings={m.historicalWarnings}
              showAllWarnings={showAllWarnings}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showAddModal && (
        <AddWarningModal
          members={members}
          onClose={() => setShowAddModal(false)}
          onRefresh={fetchWarnings}
        />
      )}
      </>
      )}
    </div>
  )
}
