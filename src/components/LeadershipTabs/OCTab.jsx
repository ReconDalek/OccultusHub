import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

const FACTIONS = [
  { id: 33097, label: 'Occultus' },
  { id: 9728,  label: 'Occul2us' },
  { id: 9171,  label: 'Occul3us' },
]

const STATUS_TABS = [
  { id: 'recruiting', label: 'Recruiting' },
  { id: 'planning',   label: 'Planning' },
  { id: 'completed',  label: 'Completed' },
]

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return token ? { Authorization: token } : {}
}

function fmtMoney(n) {
  if (!n) return '$0'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toLocaleString()}`
}

function fmtUnixDate(unix) {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC/TCT'
}

// ─── Countdown ────────────────────────────────────────────────────────────────

function useCountdown(targetUnix) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (!targetUnix) { setLabel(''); return }
    const tick = () => {
      const secs = targetUnix - Math.floor(Date.now() / 1000)
      if (secs <= 0) { setLabel('Ready'); return }
      const d = Math.floor(secs / 86400)
      const h = Math.floor((secs % 86400) / 3600)
      const m = Math.floor((secs % 3600) / 60)
      const s = secs % 60
      setLabel(d > 0 ? `${d}d ${h}h ${m}m` : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetUnix])
  return label
}

function DifficultyBadge({ difficulty }) {
  const color = difficulty >= 8 ? '#f87171' : difficulty >= 5 ? '#f97316' : '#4ade80'
  return (
    <span style={{ fontSize: '11px', fontWeight: '700', color, background: `${color}22`, border: `1px solid ${color}44`, borderRadius: '6px', padding: '2px 8px' }}>
      {difficulty}/10
    </span>
  )
}

function CprBadge({ rate }) {
  if (!rate) return <span style={{ color: "var(--text-faint)", fontSize: '11px' }}>—</span>
  const color = rate >= 80 ? '#4ade80' : rate >= 60 ? '#f97316' : '#f87171'
  return <span style={{ color, fontSize: '12px', fontWeight: '600' }}>{rate}%</span>
}

const OUTCOME_STYLE = {
  Successful:   { icon: '✔', color: '#4ade80' },
  Failed:       { icon: '✖', color: '#f87171' },
  Hospitalized: { icon: '🏥', color: '#f97316' },
  Jailed:       { icon: '🚔', color: '#f97316' },
  Injured:      { icon: '🤕', color: '#eab308' },
}

// ─── Crime card ───────────────────────────────────────────────────────────────

function CrimeCard({ crime }) {
  const bucket = crime.status === 'Recruiting' ? 'recruiting' : crime.status === 'Planning' ? 'planning' : 'completed'
  const countdownTarget = bucket === 'recruiting' ? crime.expired_at : bucket === 'planning' ? crime.ready_at : null
  const countdown = useCountdown(countdownTarget)

  const isSuccess = crime.status === 'Successful'
  const isFailure = crime.status === 'Failure'
  const isExpired = crime.status === 'Expired'

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden', marginBottom: '12px' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#f4f4f5', fontWeight: '600', fontSize: '14px' }}>{crime.name}</span>
          <DifficultyBadge difficulty={crime.difficulty} />
        </div>
        {bucket === 'completed' ? (
          <span style={{
            fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em',
            color: isSuccess ? '#4ade80' : isFailure ? '#f87171' : "var(--text-muted)",
            background: isSuccess ? 'rgba(74,222,128,0.1)' : isFailure ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${isSuccess ? 'rgba(74,222,128,0.3)' : isFailure ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: '6px', padding: '3px 10px',
          }}>
            {isExpired ? 'Expired' : crime.status}
          </span>
        ) : (
          <span style={{ color: "var(--text-secondary)", fontSize: '12px', fontFamily: 'monospace' }}>
            {bucket === 'recruiting' ? `Expires in ${countdown || '—'}` : `Ready in ${countdown || '—'}`}
          </span>
        )}
      </div>

      {/* Slots */}
      <div style={{ padding: '10px 16px' }}>
        {crime.slots.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
            <span style={{ color: "var(--text-secondary)", fontSize: '12px', minWidth: '110px' }}>{s.position_label || s.position}</span>
            {s.torn_user_id ? (
              <a href={`https://www.torn.com/profiles.php?XID=${s.torn_user_id}`} target="_blank" rel="noopener noreferrer"
                style={{ color: '#a78bfa', fontSize: '13px', textDecoration: 'none', flex: '1 1 0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.username}
              </a>
            ) : (
              <span style={{ color: "var(--text-ghost)", fontSize: '13px', fontStyle: 'italic', flex: '1 1 0' }}>Vacant</span>
            )}
            {bucket === 'planning' && s.torn_user_id && (
              <div style={{ width: '80px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ width: `${s.progress || 0}%`, height: '100%', background: 'linear-gradient(90deg,#6d28d9,#b3123f)' }} />
              </div>
            )}
            {bucket === 'completed' && s.outcome && (
              <span style={{ fontSize: '11px', color: OUTCOME_STYLE[s.outcome]?.color ?? "var(--text-muted)", flexShrink: 0 }}>
                {OUTCOME_STYLE[s.outcome]?.icon ?? ''} {s.outcome}
              </span>
            )}
            <CprBadge rate={s.checkpoint_pass_rate} />
          </div>
        ))}
      </div>

      {/* Rewards (completed only) */}
      {bucket === 'completed' && crime.rewards && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', background: 'rgba(255,255,255,0.015)' }}>
          {crime.rewards.money > 0 && <span style={{ color: '#4ade80', fontSize: '12px', fontWeight: '600' }}>{fmtMoney(crime.rewards.money)}</span>}
          {crime.rewards.respect > 0 && <span style={{ color: "var(--text-secondary)", fontSize: '12px' }}>⚡ {crime.rewards.respect} respect</span>}
          {crime.rewards.items?.length > 0 && <span style={{ color: "var(--text-secondary)", fontSize: '12px' }}>📦 {crime.rewards.items.length} item{crime.rewards.items.length !== 1 ? 's' : ''}</span>}
          {crime.rewards.payout && (
            <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: '700', color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: '6px', padding: '2px 8px' }}>
              PAID
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Crimes list view ─────────────────────────────────────────────────────────

function CrimesListView({ factionId }) {
  const [status, setStatus] = useState('recruiting')
  const [crimes, setCrimes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`${API_BASE_URL}/api/leadership/oc/crimes?faction_id=${factionId}&status=${status}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setCrimes(d.crimes || []) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [factionId, status])

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        {STATUS_TABS.map(t => {
          const active = status === t.id
          return (
            <button key={t.id} onClick={() => setStatus(t.id)}
              style={{
                padding: '6px 16px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                border: active ? '1px solid rgba(179,18,63,0.6)' : '1px solid rgba(255,255,255,0.12)',
                background: active ? 'rgba(179,18,63,0.18)' : 'rgba(255,255,255,0.04)',
                color: active ? '#f4f4f5' : "var(--text-secondary)",
              }}
            >{t.label}</button>
          )
        })}
      </div>

      {loading && <p style={{ color: "var(--text-faint)", fontSize: '13px' }}>Loading crimes…</p>}
      {!loading && error && <p style={{ color: '#f87171', fontSize: '13px' }}>Error: {error}</p>}
      {!loading && !error && crimes.length === 0 && (
        <p style={{ color: "var(--text-faint)", fontSize: '13px' }}>No {status} crimes found. Data populates via the daily cron — use the admin Cache page to refresh manually.</p>
      )}
      {!loading && !error && crimes.map(c => <CrimeCard key={c.id} crime={c} />)}
    </div>
  )
}

// ─── Team builder ─────────────────────────────────────────────────────────────

function TeamBuilder({ factionId }) {
  const [templates, setTemplates] = useState([])
  const [crimeName, setCrimeName] = useState('')
  const [teamCount, setTeamCount] = useState(1)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setCrimeName('')
    setResult(null)
    fetch(`${API_BASE_URL}/api/leadership/oc/templates?faction_id=${factionId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setTemplates(d.templates || []))
      .catch(() => setTemplates([]))
  }, [factionId])

  const selectedTemplate = templates.find(t => t.name === crimeName)

  const runSuggest = async () => {
    if (!crimeName) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/oc/suggest-teams`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ faction_id: factionId, crime_name: crimeName, team_count: teamCount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to suggest teams')
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#f4f4f5', borderRadius: '8px', padding: '8px 12px', fontSize: '13px',
  }

  return (
    <div>
      <p style={{ color: "var(--text-secondary)", fontSize: '13px', margin: '0 0 16px' }}>
        Suggests the best member for each position using their highest known checkpoint pass rate for that crime,
        spread evenly across teams (snake draft) so no single team hoards all the top performers.
      </p>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '11px', display: 'block', marginBottom: '4px' }}>Crime</label>
          <select style={{ ...inputStyle, minWidth: '220px' }} value={crimeName} onChange={e => setCrimeName(e.target.value)}>
            <option value="">Select a crime…</option>
            {templates.map(t => <option key={t.name} value={t.name}>{t.name} ({t.difficulty}/10)</option>)}
          </select>
        </div>
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '11px', display: 'block', marginBottom: '4px' }}>Teams</label>
          <input type="number" min="1" max="10" style={{ ...inputStyle, width: '70px' }} value={teamCount}
            onChange={e => setTeamCount(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))} />
        </div>
        <button onClick={runSuggest} disabled={!crimeName || loading}
          style={{
            padding: '9px 20px', borderRadius: '8px', border: 'none', cursor: (!crimeName || loading) ? 'default' : 'pointer',
            background: 'rgba(179,18,63,0.8)', color: '#fff', fontSize: '13px', fontWeight: '600',
            opacity: (!crimeName || loading) ? 0.5 : 1,
          }}
        >{loading ? 'Building…' : 'Suggest Teams'}</button>
      </div>

      {selectedTemplate && (
        <p style={{ color: "var(--text-faint)", fontSize: '12px', marginTop: '-10px', marginBottom: '16px' }}>
          Positions: {selectedTemplate.positions.map(p => p.position_label).join(', ')}
        </p>
      )}

      {error && <p style={{ color: '#f87171', fontSize: '13px' }}>{error}</p>}

      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          {result.teams.map(team => (
            <div key={team.team_index} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#f4f4f5', fontWeight: '600', fontSize: '13px' }}>Team {team.team_index + 1}</span>
                <span style={{ fontSize: '12px', color: team.filled === team.needed ? '#4ade80' : '#f97316' }}>
                  {team.filled}/{team.needed} filled · avg {team.avg_pass_rate}%
                </span>
              </div>
              <div style={{ padding: '8px 14px' }}>
                {team.positions.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: i < team.positions.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                    <span style={{ color: "var(--text-secondary)", fontSize: '12px' }}>{p.position_label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <a href={`https://www.torn.com/profiles.php?XID=${p.torn_user_id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa', fontSize: '12px', textDecoration: 'none' }}>
                        {p.username}
                      </a>
                      <CprBadge rate={p.pass_rate} />
                    </div>
                  </div>
                ))}
                {team.filled < team.needed && (
                  <p style={{ color: '#f97316', fontSize: '11px', margin: '8px 0 0' }}>
                    Not enough members with known CPR for this crime to fill every slot.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function OCTab() {
  const [factionId, setFactionId] = useState(FACTIONS[0].id)
  const [view, setView] = useState('crimes')

  const subTabStyle = (id) => ({
    padding: '8px 16px', fontWeight: '500', border: 'none', cursor: 'pointer',
    background: 'transparent', color: view === id ? '#f4f4f5' : "var(--text-secondary)",
    borderBottom: view === id ? '2px solid #b3123f' : '2px solid transparent', fontSize: '13px', whiteSpace: 'nowrap',
  })

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 className="font-cinzel" style={{ fontSize: '20px', color: '#f4f4f5', marginBottom: '4px' }}>Organized Crime</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: '13px', margin: 0 }}>
          Faction OC history and a checkpoint-pass-rate-based team builder.
        </p>
      </div>

      {/* Faction pills */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {FACTIONS.map(f => {
          const active = factionId === f.id
          return (
            <button key={f.id} onClick={() => setFactionId(f.id)}
              style={{
                padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: active ? '600' : '400', cursor: 'pointer',
                border: active ? '1px solid rgba(179,18,63,0.6)' : '1px solid rgba(255,255,255,0.12)',
                background: active ? 'rgba(179,18,63,0.18)' : 'rgba(255,255,255,0.04)',
                color: active ? '#f4f4f5' : "var(--text-secondary)",
              }}
            >{f.label}</button>
          )
        })}
      </div>

      {/* View tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '20px' }}>
        <button onClick={() => setView('crimes')} style={subTabStyle('crimes')}>Crimes</button>
        <button onClick={() => setView('builder')} style={subTabStyle('builder')}>Team Builder</button>
      </div>

      {view === 'crimes'  && <CrimesListView factionId={factionId} />}
      {view === 'builder' && <TeamBuilder factionId={factionId} />}
    </div>
  )
}
