import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

const FACTION_LABEL = { 33097: 'Occ1', 9728: 'Occ2', 9171: 'Occ3' }
const token = () => localStorage.getItem('occultusSession')

const STEPS = [
  { key: 'step_first_mailer',     label: 'First Steps Mailer' },
  { key: 'step_mansion_offer',    label: 'Mansion Offer' },
  { key: 'step_joined_discord',   label: 'Joined Discord' },
  { key: 'step_joined_tornstats', label: 'Joined TornStats' },
]

const STATUS_COLOR = {
  active:    { bg: 'rgba(139,92,246,0.15)', color: '#a78bfa' },
  completed: { bg: 'rgba(74,222,128,0.15)', color: '#4ade80' },
  removed:   { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-faint)' },
}

const SUB_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'tools',    label: 'Tools' },
]

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-GB')
}
function fmtMoney(n) {
  if (n == null) return '—'
  return '$' + Math.round(n).toLocaleString('en-GB')
}
function fmtDate(d) {
  if (!d) return '—'
  return d.slice(0, 10)
}
function fmtTz(tz) {
  if (tz == null) return '—'
  return `GMT${tz >= 0 ? '+' : ''}${tz}`
}

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)',
  color: '#f4f4f5', fontSize: '13px', boxSizing: 'border-box',
}
const labelStyle = { color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }

// ─── Member picker (shared by both add modals) ─────────────────────────────

function MemberPicker({ members, excludeIds, onPick }) {
  const [search, setSearch] = useState('')
  const filtered = members.filter(m =>
    search.length > 0 &&
    m.username.toLowerCase().includes(search.toLowerCase()) &&
    !excludeIds.includes(m.torn_user_id)
  )
  return (
    <div style={{ position: 'relative' }}>
      <input style={inputStyle} placeholder="Search member…" value={search} onChange={e => setSearch(e.target.value)} />
      {filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
          background: '#1a1a28', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
          maxHeight: '160px', overflowY: 'auto', marginTop: '2px',
        }}>
          {filtered.slice(0, 12).map(m => (
            <button key={m.torn_user_id} type="button" onClick={() => { onPick(m); setSearch('') }}
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
  )
}

// ─── Add Mentor modal ───────────────────────────────────────────────────────

function AddMentorModal({ members, mentors, onClose, onAdded }) {
  const [picked, setPicked] = useState(null)
  const [timezone, setTimezone] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!picked) { setError('Pick a member'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/mentoring/mentors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token() },
        body: JSON.stringify({
          torn_user_id: picked.torn_user_id, username: picked.username, faction_id: picked.faction_id,
          timezone_offset: timezone !== '' ? parseFloat(timezone) : null, notes: notes || null,
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onAdded()
      onClose()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: '16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#12121a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '420px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ color: '#f4f4f5', fontFamily: 'Cinzel,serif', fontSize: '16px', letterSpacing: '1px', margin: 0 }}>Add Mentor</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Member *</label>
            {picked ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ flex: 1, color: '#f4f4f5', fontSize: '13px' }}>{picked.username}</span>
                <button type="button" onClick={() => setPicked(null)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: '16px' }}>×</button>
              </div>
            ) : (
              <MemberPicker members={members} excludeIds={mentors.map(m => m.torn_user_id)} onPick={setPicked} />
            )}
          </div>
          <div>
            <label style={labelStyle}>GMT Offset (e.g. -5, 5.5)</label>
            <input type="number" step="0.5" min="-12" max="14" style={inputStyle} value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label style={labelStyle}>Notes (optional)</label>
            <textarea rows={2} style={{ ...inputStyle, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          {error && <p style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', background: 'rgba(179,18,63,0.8)', color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: '13px', opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Add Mentor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Add Mentee modal ───────────────────────────────────────────────────────

function AddMenteeModal({ members, mentees, mentors, onClose, onAdded }) {
  const [picked, setPicked] = useState(null)
  const [timezone, setTimezone] = useState('')
  const [accountAge, setAccountAge] = useState('')
  const [mentorId, setMentorId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!picked) { setError('Pick a member'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/mentoring/mentees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token() },
        body: JSON.stringify({
          torn_user_id: picked.torn_user_id, username: picked.username, faction_id: picked.faction_id,
          timezone_offset: timezone !== '' ? parseFloat(timezone) : null,
          account_age_at_added: accountAge !== '' ? parseInt(accountAge, 10) : null,
          mentor_id: mentorId !== '' ? parseInt(mentorId, 10) : null,
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onAdded()
      onClose()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: '16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#12121a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '420px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ color: '#f4f4f5', fontFamily: 'Cinzel,serif', fontSize: '16px', letterSpacing: '1px', margin: 0 }}>Add Mentee</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Member *</label>
            {picked ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ flex: 1, color: '#f4f4f5', fontSize: '13px' }}>{picked.username}</span>
                <button type="button" onClick={() => setPicked(null)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: '16px' }}>×</button>
              </div>
            ) : (
              <MemberPicker members={members} excludeIds={mentees.filter(m => m.status === 'active').map(m => m.torn_user_id)} onPick={setPicked} />
            )}
          </div>
          <div>
            <label style={labelStyle}>Current account age (days) *</label>
            <input type="number" min="0" style={inputStyle} value={accountAge} onChange={e => setAccountAge(e.target.value)} placeholder="e.g. 8" />
            <p style={{ color: 'var(--text-faint)', fontSize: '11px', margin: '4px 0 0' }}>
              Counts up by 1 each day automatically and freezes once level 15 is detected — editable later if entered wrong.
            </p>
          </div>
          <div>
            <label style={labelStyle}>GMT Offset (e.g. -5, 5.5)</label>
            <input type="number" step="0.5" min="-12" max="14" style={inputStyle} value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label style={labelStyle}>Mentor (optional — leave blank to show a recommendation)</label>
            <select style={inputStyle} value={mentorId} onChange={e => setMentorId(e.target.value)}>
              <option value="">— Unassigned —</option>
              {mentors.filter(m => m.is_active).map(m => (
                <option key={m.id} value={m.id}>{m.username} ({m.active_mentees} mentee{m.active_mentees !== 1 ? 's' : ''})</option>
              ))}
            </select>
          </div>
          {error && <p style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', background: 'rgba(179,18,63,0.8)', color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: '13px', opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Add Mentee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Mentors panel ──────────────────────────────────────────────────────────

function MentorsPanel({ mentors, members, mentees, onRefresh, restricted }) {
  const [showAdd, setShowAdd] = useState(false)

  async function toggleActive(mentor) {
    await fetch(`${API_BASE_URL}/api/leadership/mentoring/mentors/${mentor.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: token() },
      body: JSON.stringify({ is_active: mentor.is_active ? 0 : 1 }),
    })
    onRefresh()
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ color: '#f4f4f5', fontFamily: 'Cinzel,serif', fontSize: '15px', letterSpacing: '0.5px', margin: 0 }}>Mentors</h3>
        {!restricted && (
          <button onClick={() => setShowAdd(true)} style={{ padding: '6px 16px', borderRadius: '8px', border: 'none', background: 'rgba(179,18,63,0.7)', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
            + Add Mentor
          </button>
        )}
      </div>
      {mentors.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No mentors added yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {mentors.map(m => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '8px',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
              opacity: m.is_active ? 1 : 0.5,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: '#f4f4f5', fontSize: '13px' }}>{m.username}</span>
                <span style={{ marginLeft: '8px', color: 'var(--text-faint)', fontSize: '11px' }}>
                  {FACTION_LABEL[m.faction_id]} · {fmtTz(m.timezone_offset)}
                  {!m.is_active && ' · inactive'}
                </span>
              </div>
              <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '700', background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                {m.active_mentees} mentee{m.active_mentees !== 1 ? 's' : ''}
              </span>
              {!restricted && (
                <button onClick={() => toggleActive(m)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '11px' }}>
                  {m.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {showAdd && <AddMentorModal members={members} mentors={mentors} onClose={() => setShowAdd(false)} onAdded={onRefresh} />}
    </div>
  )
}

// ─── Mentee card ────────────────────────────────────────────────────────────

function MenteeCard({ mentee, mentors, onRefresh, canEdit }) {
  const [expanded, setExpanded] = useState(false)
  const [ageAtAddedInput, setAgeAtAddedInput] = useState(mentee.account_age_at_added ?? '')
  const [ageInput, setAgeInput] = useState(mentee.account_age_days_at_level_15 ?? '')
  const [dateInput, setDateInput] = useState(mentee.level_15_reached_at ?? '')
  const [notesInput, setNotesInput] = useState(mentee.notes ?? '')
  const [saving, setSaving] = useState(false)

  async function patch(body) {
    setSaving(true)
    await fetch(`${API_BASE_URL}/api/leadership/mentoring/mentees/${mentee.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: token() },
      body: JSON.stringify(body),
    })
    setSaving(false)
    onRefresh()
  }

  async function toggleStep(key) {
    await patch({ [key]: mentee[key] ? 0 : 1 })
  }

  async function saveAgeAtAdded() {
    await patch({ account_age_at_added: ageAtAddedInput !== '' ? parseInt(ageAtAddedInput, 10) : null })
  }

  async function saveAgeOverride() {
    await patch({
      account_age_days_at_level_15: ageInput !== '' ? parseInt(ageInput, 10) : null,
      level_15_reached_at: dateInput || null,
    })
  }

  async function complete() {
    if (!confirm(`Mark ${mentee.username} as completed?`)) return
    await fetch(`${API_BASE_URL}/api/leadership/mentoring/mentees/${mentee.id}/complete`, { method: 'POST', headers: { Authorization: token() } })
    onRefresh()
  }
  async function remove() {
    if (!confirm(`Remove ${mentee.username} from the mentoring program?`)) return
    await fetch(`${API_BASE_URL}/api/leadership/mentoring/mentees/${mentee.id}/remove`, { method: 'POST', headers: { Authorization: token() } })
    onRefresh()
  }

  const allStepsDone = STEPS.every(s => mentee[s.key])
  const eligible = mentee.incentive_amount != null && allStepsDone
  const statusStyle = STATUS_COLOR[mentee.status] || STATUS_COLOR.active
  const levelFifteenFrozen = mentee.level_15_reached_at != null

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
      <button onClick={() => setExpanded(e => !e)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
        padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <div style={{ flex: 1, minWidth: '160px' }}>
          <span style={{ color: '#f4f4f5', fontSize: '14px', fontWeight: '500' }}>{mentee.username}</span>
          <span style={{ marginLeft: '8px', color: 'var(--text-faint)', fontSize: '11px' }}>
            {FACTION_LABEL[mentee.current_faction_id]}{mentee.level != null && ` · Lv ${mentee.level}`}
          </span>
        </div>

        {mentee.mentor_id ? (
          <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>
            {mentee.mentor_username}
          </span>
        ) : mentee.recommended_mentor_username ? (
          <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-faint)', fontStyle: 'italic' }}>
            Recommended: {mentee.recommended_mentor_username}
          </span>
        ) : (
          <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
            Unassigned
          </span>
        )}

        <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', background: statusStyle.bg, color: statusStyle.color, textTransform: 'capitalize' }}>
          {mentee.status}
        </span>

        {mentee.incentive_amount != null && (
          <span style={{ color: eligible ? '#4ade80' : 'var(--text-faint)', fontSize: '12px', fontWeight: '600' }}>
            {fmtMoney(mentee.incentive_amount)}{mentee.incentive_paid ? ' (paid)' : eligible ? ' (ready)' : ''}
          </span>
        )}

        <span style={{ color: 'var(--text-faint)', fontSize: '13px' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Live member info */}
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Days in faction: <span style={{ color: '#f4f4f5' }}>{fmt(mentee.days_in_faction)}</span></span>
            <span style={{ color: 'var(--text-secondary)' }}>Joined: <span style={{ color: '#f4f4f5' }}>{fmtDate(mentee.joined_at)}</span></span>
            <span style={{ color: 'var(--text-secondary)' }}>Timezone: <span style={{ color: '#f4f4f5' }}>{fmtTz(mentee.timezone_offset)}</span></span>
            {!mentee.member_is_active && <span style={{ color: '#f87171' }}>No longer an active member</span>}
          </div>

          {/* Mentor assignment */}
          <div>
            <label style={labelStyle}>Mentor</label>
            {canEdit ? (
              <select style={{ ...inputStyle, maxWidth: '280px' }} value={mentee.mentor_id ?? ''} onChange={e => patch({ mentor_id: e.target.value !== '' ? parseInt(e.target.value, 10) : null })}>
                <option value="">— Unassigned{mentee.recommended_mentor_username ? ` (recommended: ${mentee.recommended_mentor_username})` : ''} —</option>
                {mentors.filter(m => m.is_active).map(m => (
                  <option key={m.id} value={m.id}>{m.username} ({m.active_mentees} mentee{m.active_mentees !== 1 ? 's' : ''})</option>
                ))}
              </select>
            ) : (
              <p style={{ color: '#f4f4f5', fontSize: '13px', margin: 0 }}>{mentee.mentor_username || '—'}</p>
            )}
          </div>

          {/* Steps */}
          <div>
            <label style={labelStyle}>Mentoring Steps</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {STEPS.map(s => (
                <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#f4f4f5', cursor: canEdit ? 'pointer' : 'default' }}>
                  <input type="checkbox" checked={!!mentee[s.key]} disabled={!canEdit} onChange={() => toggleStep(s.key)} />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

          {/* Level 15 / incentive tracking */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
            <label style={labelStyle}>Level 15 Incentive Tracking</label>
            {!levelFifteenFrozen ? (
              <>
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ ...labelStyle, fontSize: '11px' }}>Account age at time added (days)</label>
                  {canEdit ? (
                    <input type="number" style={inputStyle} value={ageAtAddedInput} onChange={e => setAgeAtAddedInput(e.target.value)} />
                  ) : (
                    <p style={{ color: '#f4f4f5', fontSize: '13px', margin: 0 }}>{fmt(mentee.account_age_at_added)}</p>
                  )}
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '0 0 8px' }}>
                  Current estimate: <span style={{ color: '#f4f4f5', fontWeight: '600' }}>{fmt(mentee.current_account_age_estimate)} days</span> — auto-incrementing daily, freezes once level 15 is detected
                </p>
                {canEdit && (
                  <button onClick={saveAgeAtAdded} disabled={saving} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }}>
                    Save
                  </button>
                )}
              </>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '11px' }}>Date reached level 15</label>
                    {canEdit ? (
                      <input type="date" style={inputStyle} value={dateInput} onChange={e => setDateInput(e.target.value)} />
                    ) : (
                      <p style={{ color: '#f4f4f5', fontSize: '13px', margin: 0 }}>{fmtDate(mentee.level_15_reached_at)}</p>
                    )}
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: '11px' }}>Account age (days) at level 15</label>
                    {canEdit ? (
                      <input type="number" style={inputStyle} value={ageInput} onChange={e => setAgeInput(e.target.value)} />
                    ) : (
                      <p style={{ color: '#f4f4f5', fontSize: '13px', margin: 0 }}>{fmt(mentee.account_age_days_at_level_15)}</p>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <button onClick={saveAgeOverride} disabled={saving} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }}>
                    Save
                  </button>
                )}
              </>
            )}
            {mentee.incentive_amount != null && (
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '13px', color: eligible ? '#4ade80' : 'var(--text-secondary)' }}>
                  Incentive: {fmtMoney(mentee.incentive_amount)} {eligible ? '(all steps complete)' : '(steps incomplete)'}
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#f4f4f5', cursor: (eligible && canEdit) ? 'pointer' : 'default', opacity: eligible ? 1 : 0.5 }}>
                  <input type="checkbox" disabled={!eligible || !canEdit} checked={!!mentee.incentive_paid} onChange={() => patch({ incentive_paid: !mentee.incentive_paid })} />
                  Paid
                </label>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            {canEdit ? (
              <textarea rows={2} style={{ ...inputStyle, resize: 'vertical' }} value={notesInput} onChange={e => setNotesInput(e.target.value)} onBlur={() => patch({ notes: notesInput })} />
            ) : (
              <p style={{ color: '#f4f4f5', fontSize: '13px', margin: 0, whiteSpace: 'pre-wrap' }}>{mentee.notes || '—'}</p>
            )}
          </div>

          {canEdit && mentee.status === 'active' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={complete} style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid rgba(74,222,128,0.2)', background: 'rgba(74,222,128,0.08)', color: '#4ade80', cursor: 'pointer', fontSize: '12px' }}>
                Mark Completed
              </button>
              <button onClick={remove} style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.08)', color: '#f87171', cursor: 'pointer', fontSize: '12px' }}>
                Remove
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Overview sub-tab ───────────────────────────────────────────────────────

function OverviewSubTab({ restricted, mentorId }) {
  const [mentees, setMentees] = useState([])
  const [mentors, setMentors] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('active')
  const [showAddMentee, setShowAddMentee] = useState(false)

  useEffect(() => { fetchAll(false) }, [])

  // silent=true skips the loading flag so the list never unmounts mid-refresh
  // — otherwise every checkbox/field edit collapses every expanded card back
  // to its default state (MenteeCard's `expanded` is local, destroyed on unmount).
  async function fetchAll(silent) {
    if (!silent) setLoading(true)
    try {
      const requests = [fetch(`${API_BASE_URL}/api/leadership/mentoring/overview`, { headers: { Authorization: token() } })]
      if (!restricted) requests.push(fetch(`${API_BASE_URL}/api/leadership/mentoring/members`, { headers: { Authorization: token() } }))

      const [overviewRes, membersRes] = await Promise.all(requests)
      const overview = await overviewRes.json()
      setMentees(overview.mentees || [])
      setMentors(overview.mentors || [])
      if (membersRes) {
        const membersData = await membersRes.json()
        setMembers(membersData.members || [])
      }
    } catch { /* ignore */ }
    finally { if (!silent) setLoading(false) }
  }

  const refresh = () => fetchAll(true)

  const displayed = mentees.filter(m => statusFilter === 'all' || m.status === statusFilter)

  return (
    <div>
      <MentorsPanel mentors={mentors} members={members} mentees={mentees} onRefresh={refresh} restricted={restricted} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
        <h3 style={{ color: '#f4f4f5', fontFamily: 'Cinzel,serif', fontSize: '15px', letterSpacing: '0.5px', margin: 0 }}>Mentees</h3>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {['active', 'completed', 'removed', 'all'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '5px 14px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', textTransform: 'capitalize',
              border: `1px solid ${statusFilter === s ? 'rgba(179,18,63,0.6)' : 'rgba(255,255,255,0.12)'}`,
              background: statusFilter === s ? 'rgba(179,18,63,0.18)' : 'transparent',
              color: statusFilter === s ? '#f4f4f5' : 'var(--text-secondary)',
            }}>{s}</button>
          ))}
          {!restricted && (
            <button onClick={() => setShowAddMentee(true)} style={{ padding: '6px 16px', borderRadius: '8px', border: 'none', background: 'rgba(179,18,63,0.7)', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '500', marginLeft: '6px' }}>
              + Add Mentee
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : displayed.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No mentees in this view.</p>
      ) : (
        displayed.map(m => (
          <MenteeCard
            key={m.id}
            mentee={m}
            mentors={mentors}
            onRefresh={refresh}
            canEdit={!restricted || m.mentor_id === mentorId}
          />
        ))
      )}

      {showAddMentee && (
        <AddMenteeModal members={members} mentees={mentees} mentors={mentors} onClose={() => setShowAddMentee(false)} onAdded={refresh} />
      )}
    </div>
  )
}

// ─── Tools sub-tab ──────────────────────────────────────────────────────────

const CATEGORY_LABEL = { link: 'Helpful Links', mailer: 'Example Mailers', other: 'Other' }

function ToolsSubTab({ restricted }) {
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('link')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchResources() }, [])

  async function fetchResources() {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/mentoring/resources`, { headers: { Authorization: token() } })
      const data = await res.json()
      setResources(data.resources || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    await fetch(`${API_BASE_URL}/api/leadership/mentoring/resources`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token() },
      body: JSON.stringify({ category, title: title.trim(), url: url.trim() || null, body: body.trim() || null }),
    })
    setTitle(''); setUrl(''); setBody('')
    setSaving(false)
    fetchResources()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this resource?')) return
    await fetch(`${API_BASE_URL}/api/leadership/mentoring/resources/${id}`, { method: 'DELETE', headers: { Authorization: token() } })
    setResources(r => r.filter(x => x.id !== id))
  }

  const grouped = ['link', 'mailer', 'other'].map(cat => ({ cat, items: resources.filter(r => r.category === cat) }))

  return (
    <div>
      {!restricted && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
          <h3 style={{ color: '#f4f4f5', fontFamily: 'Cinzel,serif', fontSize: '15px', letterSpacing: '0.5px', margin: '0 0 12px' }}>Add Resource</h3>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['link', 'mailer', 'other'].map(c => (
                <button key={c} type="button" onClick={() => setCategory(c)} style={{
                  padding: '5px 14px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                  border: `1px solid ${category === c ? 'rgba(179,18,63,0.6)' : 'rgba(255,255,255,0.12)'}`,
                  background: category === c ? 'rgba(179,18,63,0.18)' : 'transparent',
                  color: category === c ? '#f4f4f5' : 'var(--text-secondary)',
                }}>{CATEGORY_LABEL[c]}</button>
              ))}
            </div>
            <input style={inputStyle} placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
            {category === 'link' && (
              <input style={inputStyle} placeholder="URL" value={url} onChange={e => setUrl(e.target.value)} />
            )}
            <textarea rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Body / description (optional)" value={body} onChange={e => setBody(e.target.value)} />
            <button type="submit" disabled={saving || !title.trim()} style={{ alignSelf: 'flex-end', padding: '8px 20px', borderRadius: '8px', border: 'none', background: 'rgba(179,18,63,0.8)', color: '#fff', cursor: 'pointer', fontSize: '13px', opacity: (saving || !title.trim()) ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Add'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : (
        grouped.map(({ cat, items }) => items.length > 0 && (
          <div key={cat} style={{ marginBottom: '20px' }}>
            <h4 style={{ color: 'var(--text-secondary)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>{CATEGORY_LABEL[cat]}</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {items.map(r => (
                <div key={r.id} style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '500' }}>{r.title}</div>
                      {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa', fontSize: '12px' }}>{r.url}</a>}
                      {r.body && <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{r.body}</p>}
                      <p style={{ color: 'var(--text-faint)', fontSize: '10px', margin: '4px 0 0' }}>Added by {r.created_by_username || 'unknown'}</p>
                    </div>
                    {!restricted && (
                      <button onClick={() => handleDelete(r.id)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: '14px', flexShrink: 0 }}>×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
      {!loading && resources.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No resources added yet.</p>}
    </div>
  )
}

// ─── Main tab ───────────────────────────────────────────────────────────────

export default function MentoringTab({ restricted = false, mentorId = null }) {
  const [activeSubTab, setActiveSubTab] = useState('overview')

  const subTabStyle = (id) => ({
    padding: '8px 16px', fontWeight: '500', border: 'none', cursor: 'pointer', background: 'transparent',
    color: activeSubTab === id ? '#f4f4f5' : 'var(--text-secondary)',
    borderBottom: activeSubTab === id ? '2px solid #b3123f' : '2px solid transparent',
    fontSize: '13px', whiteSpace: 'nowrap', transition: 'color 0.15s',
  })

  return (
    <div>
      {!restricted && (
        <div style={{ marginBottom: '20px' }}>
          <h2 className="font-cinzel" style={{ fontSize: '20px', color: '#f4f4f5', marginBottom: '4px' }}>Mentoring</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Track mentee onboarding progress and mentor assignments.</p>
        </div>
      )}

      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '24px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        <div style={{ display: 'flex', minWidth: 'max-content' }}>
          {SUB_TABS.map(t => (
            <button key={t.id} onClick={() => setActiveSubTab(t.id)} style={subTabStyle(t.id)}
              onMouseEnter={e => { if (activeSubTab !== t.id) e.currentTarget.style.color = '#f4f4f5' }}
              onMouseLeave={e => { if (activeSubTab !== t.id) e.currentTarget.style.color = 'var(--text-secondary)' }}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {activeSubTab === 'overview' && <OverviewSubTab restricted={restricted} mentorId={mentorId} />}
      {activeSubTab === 'tools' && <ToolsSubTab restricted={restricted} />}
    </div>
  )
}
