import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

// Members out of any OC for more than 24h. Shown for a month, a single day or a
// date range. Member mode shows one person's history across months.

const FACTION_LABELS = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' }
const GRACE_OPTIONS = [1, 2]
const PERIOD_MODES = [['month', 'Month'], ['day', 'Day'], ['range', 'Range']]

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return token ? { Authorization: token } : {}
}

const todayKey = () => new Date().toISOString().slice(0, 10)
const monthKey = () => new Date().toISOString().slice(0, 7)
const firstOfMonth = () => `${monthKey()}-01`

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

// "12 Sep" — the year is shown only in headers, so lists stay short.
function fmtDay(key) {
  if (!key) return '—'
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function fmtDayLong(key) {
  if (!key) return '—'
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

const cardStyle = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px', padding: '12px 14px', marginBottom: '10px',
}

const inputStyle = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#f4f4f5', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', width: '100%', maxWidth: '220px',
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

function Tile({ label, value }) {
  return (
    <div style={{ ...cardStyle, flex: '1 1 110px', marginBottom: 0 }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ color: '#f4f4f5', fontSize: '22px', fontWeight: '600', marginTop: '4px' }}>{value}</div>
    </div>
  )
}

function StretchRow({ s, faction }) {
  return (
    <div style={{ borderLeft: '2px solid rgba(179,18,63,0.5)', padding: '4px 10px', marginTop: '8px', fontSize: '13px', color: '#f4f4f5' }}>
      {fmtDay(s.from)} → {fmtDay(s.to)} · {plural(s.days, 'day')}
      {faction && <span style={{ color: 'var(--text-secondary)' }}> · {FACTION_LABELS[faction] || faction}</span>}
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
            {plural(m.instance_count, 'instance')} · {plural(m.days, 'day')}
          </div>
        </div>
        <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>{expanded ? 'Hide' : 'Show'}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: '6px' }}>
          {m.instances.map((s, i) => <StretchRow key={i} s={s} />)}
          <button onClick={() => onOpen(m.torn_user_id)} style={{ ...pillStyle(false), marginTop: '10px', fontSize: '11px' }}>
            Full history
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
        <Tile label="Members" value={data.totals.members} />
        <Tile label="Instances" value={data.totals.instances} />
        <Tile label="Days" value={data.totals.days} />
      </div>

      {data.members.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No one in this period.</p>
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
        <option value="">Select…</option>
        {roster.map(m => <option key={m.torn_user_id} value={m.torn_user_id}>{m.username}</option>)}
      </select>

      <div style={{ marginTop: '16px' }}>
        {loading && <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>Loading…</p>}
        {error && <p style={{ color: '#f87171', fontSize: '13px' }}>Error: {error}</p>}

        {data && !loading && (
          <>
            <div style={{ color: '#f4f4f5', fontWeight: '600', fontSize: '15px', marginBottom: '12px' }}>
              {data.username || `#${data.torn_user_id}`}
              <a href={`https://www.torn.com/profiles.php?XID=${data.torn_user_id}`} target="_blank" rel="noopener noreferrer"
                style={{ color: '#a78bfa', fontSize: '12px', marginLeft: '10px', textDecoration: 'none', fontWeight: '400' }}>Torn profile</a>
            </div>

            {data.monthly.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>None.</p>}
            {data.monthly.map(m => (
              <div key={m.month} style={cardStyle}>
                <div style={{ color: '#f4f4f5', fontWeight: '600', fontSize: '13px' }}>{monthLabel(m.month)}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
                  {plural(m.instances, 'instance')} · {plural(m.days, 'day')}
                </div>
              </div>
            ))}

            {data.instances.length > 0 && (
              <div style={cardStyle}>
                {data.instances.map((s, i) => <StretchRow key={i} s={s} faction={s.faction_id} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function OCInactivityView({ factionId }) {
  const [view, setView] = useState('overview')
  const [periodMode, setPeriodMode] = useState('month')
  const [month, setMonth] = useState(monthKey)
  const [day, setDay] = useState(todayKey)
  const [rangeFrom, setRangeFrom] = useState(firstOfMonth)
  const [rangeTo, setRangeTo] = useState(todayKey)
  const [graceDays, setGraceDays] = useState(2)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [memberId, setMemberId] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams({ faction_id: factionId, grace_days: graceDays })
    if (periodMode === 'month') params.set('month', month)
    if (periodMode === 'day') { params.set('from', day); params.set('to', day) }
    if (periodMode === 'range') { params.set('from', rangeFrom); params.set('to', rangeTo) }

    setLoading(true); setError(null)
    fetch(`${API_BASE_URL}/api/leadership/oc/inactivity?${params}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [factionId, periodMode, month, day, rangeFrom, rangeTo, graceDays])

  useEffect(() => { setMemberId(null) }, [factionId])

  const openMember = (id) => { setMemberId(id); setView('member') }
  const monthOptions = data?.months || [month]

  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div>
          <label style={labelStyle}>Period</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            {PERIOD_MODES.map(([id, label]) => (
              <button key={id} onClick={() => setPeriodMode(id)} style={pillStyle(periodMode === id)}>{label}</button>
            ))}
          </div>
        </div>

        {periodMode === 'month' && (
          <div>
            <label style={labelStyle}>Month</label>
            <select style={{ ...inputStyle, maxWidth: '200px' }} value={month} onChange={e => setMonth(e.target.value)}>
              {monthOptions.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
        )}
        {periodMode === 'day' && (
          <div>
            <label style={labelStyle}>Day</label>
            <input type="date" style={inputStyle} value={day} max={todayKey()} onChange={e => e.target.value && setDay(e.target.value)} />
          </div>
        )}
        {periodMode === 'range' && (
          <>
            <div>
              <label style={labelStyle}>From</label>
              <input type="date" style={inputStyle} value={rangeFrom} max={todayKey()} onChange={e => e.target.value && setRangeFrom(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>To</label>
              <input type="date" style={inputStyle} value={rangeTo} max={todayKey()} onChange={e => e.target.value && setRangeTo(e.target.value)} />
            </div>
          </>
        )}

        <div>
          <label style={labelStyle}>Leeway</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            {GRACE_OPTIONS.map(g => (
              <button key={g} onClick={() => setGraceDays(g)} style={pillStyle(graceDays === g)}>
                {g} day{g === 1 ? '' : 's'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {data?.membership_start && (
        <p style={{ color: 'var(--text-faint)', fontSize: '12px', margin: '0 0 14px' }}>
          Tracked since {fmtDayLong(data.membership_start)}
        </p>
      )}

      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '16px' }}>
        {[['overview', 'Overview'], ['member', 'Member']].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)} style={{
            padding: '8px 16px', fontWeight: '500', border: 'none', cursor: 'pointer', background: 'transparent',
            color: view === id ? '#f4f4f5' : 'var(--text-secondary)', fontSize: '13px',
            borderBottom: view === id ? '2px solid #b3123f' : '2px solid transparent',
          }}>{label}</button>
        ))}
      </div>

      {view === 'overview' && (
        <OverviewPanel data={data} loading={loading} error={error} onOpenMember={openMember} />
      )}
      {view === 'member' && (
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
