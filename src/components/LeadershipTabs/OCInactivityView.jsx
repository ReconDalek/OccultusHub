import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

// Members who go more than 24h without being in an OC. Overview = everyone
// detected in a month; Member = one person's full history across months.

const FACTION_LABELS = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' }
const GRACE_OPTIONS = [1, 2]

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return token ? { Authorization: token } : {}
}

const currentMonthKey = () => new Date().toISOString().slice(0, 7)

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

// 53.5 hours → "2d 5h"
function fmtHours(hours) {
  const total = Math.round(hours)
  const days = Math.floor(total / 24)
  const rem = total % 24
  return days ? `${days}d ${rem}h` : `${rem}h`
}

const cardStyle = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px', padding: '12px 14px', marginBottom: '10px',
}

const inputStyle = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#f4f4f5', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', width: '100%', maxWidth: '260px',
}

const labelStyle = { color: 'var(--text-secondary)', fontSize: '11px', display: 'block', marginBottom: '4px' }

function pillStyle(active) {
  return {
    padding: '5px 14px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
    fontWeight: active ? '600' : '400',
    border: active ? '1px solid rgba(179,18,63,0.6)' : '1px solid rgba(255,255,255,0.12)',
    background: active ? 'rgba(179,18,63,0.18)' : 'rgba(255,255,255,0.04)',
    color: active ? '#f4f4f5' : 'var(--text-secondary)',
  }
}

function SummaryTile({ label, value, sub }) {
  return (
    <div style={{ ...cardStyle, flex: '1 1 140px', marginBottom: 0 }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ color: '#f4f4f5', fontSize: '22px', fontWeight: '600', marginTop: '4px' }}>{value}</div>
      {sub && <div style={{ color: 'var(--text-faint)', fontSize: '11px', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

function InstanceRow({ inst, showFaction }) {
  const endText = inst.end_reason === 'ongoing' ? 'Still out'
    : inst.end_reason === 'left' ? 'Left the faction'
    : `Joined an OC ${fmtDate(inst.ended_at)}`
  return (
    <div style={{ borderLeft: '2px solid rgba(179,18,63,0.5)', padding: '6px 10px', marginTop: '8px' }}>
      <div style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '600' }}>
        {fmtHours(inst.hours_out)} out
        {showFaction && inst.faction_id && <span style={{ color: 'var(--text-secondary)', fontWeight: '400' }}> · {FACTION_LABELS[inst.faction_id] || inst.faction_id}</span>}
      </div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
        Out since {fmtDate(inst.out_since)} · 24h mark {fmtDate(inst.detected_at)}
      </div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
        {endText} · {inst.detection_count} daily detection{inst.detection_count === 1 ? '' : 's'}
        {inst.counted_this_month === false && <span style={{ color: 'var(--text-faint)' }}> · counted in an earlier month</span>}
      </div>
    </div>
  )
}

function MemberCard({ m, expanded, onToggle, onOpen }) {
  return (
    <div style={cardStyle}>
      <div onClick={onToggle} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#f4f4f5', fontWeight: '600', fontSize: '14px' }}>{m.username || `#${m.torn_user_id}`}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
            {m.instance_count} instance{m.instance_count === 1 ? '' : 's'} · {m.detection_count} daily detection{m.detection_count === 1 ? '' : 's'} · {m.days_out}d out
          </div>
        </div>
        <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>{expanded ? 'Hide ▲' : 'Details ▼'}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: '8px' }}>
          {m.instances.map((inst, i) => <InstanceRow key={`${inst.out_since}-${i}`} inst={inst} />)}
          <button onClick={() => onOpen(m.torn_user_id)} style={{ ...pillStyle(false), marginTop: '10px', fontSize: '11px' }}>
            View full history
          </button>
        </div>
      )}
    </div>
  )
}

function OverviewPanel({ data, loading, error, onOpenMember }) {
  const [expanded, setExpanded] = useState({})

  if (loading && !data) return <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>Loading…</p>
  if (error) return <p style={{ color: '#f87171', fontSize: '13px' }}>Error: {error}</p>
  if (!data) return null

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <SummaryTile label="Members detected" value={data.totals.members} />
        <SummaryTile label="Instances" value={data.totals.instances} sub="one per stretch out" />
        <SummaryTile label="Daily detections" value={data.totals.detections} sub="one per 24h block" />
        <SummaryTile label="Days out" value={data.totals.days_out} sub="across instances" />
      </div>

      {data.members.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          Nobody went more than 24h outside an OC in {monthLabel(data.month)}.
        </p>
      ) : (
        data.members.map(m => (
          <MemberCard
            key={m.torn_user_id}
            m={m}
            expanded={!!expanded[m.torn_user_id]}
            onToggle={() => setExpanded(prev => ({ ...prev, [m.torn_user_id]: !prev[m.torn_user_id] }))}
            onOpen={onOpenMember}
          />
        ))
      )}
    </div>
  )
}

function MemberPanel({ graceDays, memberId, onSelect, roster }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!memberId) { setData(null); return }
    setLoading(true); setError(null)
    const params = new URLSearchParams({ torn_user_id: memberId, grace_days: graceDays })
    fetch(`${API_BASE_URL}/api/leadership/oc/inactivity/member?${params}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [memberId, graceDays])

  return (
    <div>
      <label style={labelStyle}>Member</label>
      <select style={inputStyle} value={memberId || ''} onChange={e => onSelect(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Choose a member…</option>
        {roster.map(m => <option key={m.torn_user_id} value={m.torn_user_id}>{m.username}</option>)}
      </select>

      <div style={{ marginTop: '16px' }}>
        {!memberId && <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>Pick a member to see their out-of-OC history.</p>}
        {loading && <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>Loading…</p>}
        {error && <p style={{ color: '#f87171', fontSize: '13px' }}>Error: {error}</p>}

        {data && !loading && (
          <>
            <div style={{ color: '#f4f4f5', fontWeight: '600', fontSize: '15px', marginBottom: '10px' }}>
              {data.username || `#${data.torn_user_id}`}
              <a href={`https://www.torn.com/profiles.php?XID=${data.torn_user_id}`} target="_blank" rel="noopener noreferrer"
                style={{ color: '#a78bfa', fontSize: '12px', marginLeft: '10px', textDecoration: 'none', fontWeight: '400' }}>Torn profile ↗</a>
            </div>

            <div style={{ color: 'var(--text-faint)', fontSize: '12px', marginBottom: '12px' }}>
              By month
            </div>
            {data.monthly.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No out-of-OC stretches over 24h on record.</p>}
            {data.monthly.map(m => (
              <div key={m.month} style={cardStyle}>
                <div style={{ color: '#f4f4f5', fontWeight: '600', fontSize: '13px' }}>{monthLabel(m.month)}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
                  {m.instances} instance{m.instances === 1 ? '' : 's'} · {m.detections} daily detection{m.detections === 1 ? '' : 's'} · {m.days_out}d out
                </div>
              </div>
            ))}

            <div style={{ color: 'var(--text-faint)', fontSize: '12px', margin: '16px 0 4px' }}>
              Stretches out (newest first)
            </div>
            {data.instances.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>None.</p>}
            <div style={cardStyle}>
              {data.instances.map((inst, i) => <InstanceRow key={`${inst.out_since}-${i}`} inst={inst} showFaction />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function OCInactivityView({ factionId }) {
  const [mode, setMode] = useState('overview')
  const [month, setMonth] = useState(currentMonthKey)
  const [graceDays, setGraceDays] = useState(2)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [memberId, setMemberId] = useState(null)

  useEffect(() => {
    setLoading(true); setError(null)
    const params = new URLSearchParams({ faction_id: factionId, month, grace_days: graceDays })
    fetch(`${API_BASE_URL}/api/leadership/oc/inactivity?${params}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [factionId, month, graceDays])

  useEffect(() => { setMemberId(null) }, [factionId])

  const openMember = (id) => { setMemberId(id); setMode('member') }

  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 14px', maxWidth: '640px' }}>
        Members not in any OC for more than 24 hours, after their 3-day recruit period and a leeway of
        {' '}{graceDays} day{graceDays === 1 ? '' : 's'}. An <strong>instance</strong> is one unbroken stretch out, counted in the month it passes 24 hours.
        {' '}<strong>Daily detections</strong> count each 24-hour block of that stretch (the bot's original method).
      </p>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div>
          <label style={labelStyle}>Month (UTC)</label>
          <select style={{ ...inputStyle, maxWidth: '200px' }} value={month} onChange={e => setMonth(e.target.value)}>
            {(data?.months || [month]).map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Leeway after recruit</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            {GRACE_OPTIONS.map(g => (
              <button key={g} onClick={() => setGraceDays(g)} style={pillStyle(graceDays === g)}>
                {g} day{g === 1 ? '' : 's'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {data?.coverage_start && (
        <p style={{ color: 'var(--text-faint)', fontSize: '12px', margin: '0 0 14px' }}>
          Crime data is tracked from {fmtDate(data.coverage_start)} — earlier months can't be assessed.
        </p>
      )}

      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '16px' }}>
        {[['overview', 'Overview'], ['member', 'Member']].map(([id, label]) => (
          <button key={id} onClick={() => setMode(id)} style={{
            padding: '8px 16px', fontWeight: '500', border: 'none', cursor: 'pointer', background: 'transparent',
            color: mode === id ? '#f4f4f5' : 'var(--text-secondary)', fontSize: '13px',
            borderBottom: mode === id ? '2px solid #b3123f' : '2px solid transparent',
          }}>{label}</button>
        ))}
      </div>

      {mode === 'overview' && (
        <OverviewPanel data={data} loading={loading} error={error} onOpenMember={openMember} />
      )}
      {mode === 'member' && (
        <MemberPanel
          graceDays={graceDays}
          memberId={memberId}
          onSelect={setMemberId}
          roster={data?.roster || []}
        />
      )}
    </div>
  )
}
