import { useState, useEffect, createContext, useContext } from 'react'
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

// ─── CPR empirical success curves ─────────────────────────────────────────────
// Fetched once (module-level cache, since the data is faction-agnostic) and
// used to colour CPR badges by the *actual observed pass rate* for that crime
// + position + CPR band, rather than the raw number alone.

const CprCurvesContext = createContext({})
function useCprCurvesContext() { return useContext(CprCurvesContext) }

let cprCurvesCache = null
let cprCurvesPromise = null
function useCprCurves() {
  const [curves, setCurves] = useState(cprCurvesCache || {})
  useEffect(() => {
    if (cprCurvesCache) return
    if (!cprCurvesPromise) {
      cprCurvesPromise = fetch(`${API_BASE_URL}/api/leadership/oc/cpr-curves`, { headers: authHeaders() })
        .then(r => r.json())
        .then(d => { cprCurvesCache = d.curves || {}; return cprCurvesCache })
        .catch(() => ({}))
    }
    cprCurvesPromise.then(setCurves)
  }, [])
  return curves
}

// Nearest CPR-bucket lookup (bucket ignored if under 3 samples — too noisy to
// trust). Falls back to treating the raw CPR number as the estimate when
// there's no reliable historical data for this crime+position yet.
function estimateSuccessRate(curves, crimeName, position, cpr) {
  const buckets = curves?.[crimeName]?.[position]
  if (!buckets?.length) return cpr
  let best = null, bestDist = Infinity
  for (const b of buckets) {
    if (b.sample_size < 3) continue
    const dist = Math.abs(b.cpr - cpr)
    if (dist < bestDist) { bestDist = dist; best = b }
  }
  return best ? best.success_rate : cpr
}

// Red (0%) → yellow/orange (50%) → green (100%), by estimated success rate.
function successRateColor(rate) {
  const clamped = Math.max(0, Math.min(100, rate))
  return `hsl(${Math.round(clamped * 1.2)}, 75%, 50%)`
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

// Checkpoint Pass Rate — Torn's own per-member, per-position stat estimating
// how likely that member is to pass their individual checkpoint on this crime.
// Colour reflects the *empirical* historical pass rate observed for this
// crime + position at this CPR level (green=100% historical success,
// red=0%, yellow/orange=50/50) — not the raw CPR number itself. Falls back
// to treating the raw number as the estimate when there's no reliable
// history yet for that crime+position.
function CprBadge({ rate, crimeName, position }) {
  const curves = useCprCurvesContext()
  if (!rate) return <span style={{ color: "var(--text-faint)", fontSize: '11px' }}>—</span>
  const estimated = crimeName && position ? estimateSuccessRate(curves, crimeName, position, rate) : rate
  const color = successRateColor(estimated)
  return (
    <span title={`~${Math.round(estimated)}% historical pass rate for ${position || 'this role'} at this CPR`} style={{ color, fontSize: '12px', fontWeight: '600' }}>
      {rate}%
    </span>
  )
}

// Time-based crime completion progress (0–100%, how close the crime is to
// becoming "Ready") — unrelated to CPR/skill, shown only during Planning.
function ProgressBar({ progress }) {
  return (
    <div title={`${Math.round(progress || 0)}% toward ready`} style={{ width: '80px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ width: `${progress || 0}%`, height: '100%', background: 'linear-gradient(90deg,#6d28d9,#b3123f)' }} />
    </div>
  )
}

const OUTCOME_STYLE = {
  Successful:   { icon: '✔', color: '#4ade80' },
  Failed:       { icon: '✖', color: '#f87171' },
  Hospitalized: { icon: '🏥', color: '#f97316' },
  Jailed:       { icon: '🚔', color: '#f97316' },
  Injured:      { icon: '🤕', color: '#eab308' },
}

// ─── Predict outcome ────────────────────────────────────────────────────────
// 1) Checks whether this exact set of members has run this crime before and
//    shows their real historical success rate if so.
// 2) Otherwise compares this team's average CPR against the average CPR seen
//    in this crime's past successful vs failed runs, as a rough estimate.

function PredictOutcome({ factionId, crimeName, memberIds, avgCpr }) {
  const [shown, setShown]     = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState(null)

  if (!memberIds.length) return null

  const run = async () => {
    setShown(true)
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/oc/predict-success`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ faction_id: factionId, crime_name: crimeName, member_ids: memberIds, avg_cpr: avgCpr }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Prediction failed')
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!shown) {
    return (
      <button onClick={run} style={{
        padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.08)',
        color: '#a78bfa', fontSize: '11px', cursor: 'pointer', marginTop: '8px',
      }}>Predict Outcome</button>
    )
  }

  return (
    <div style={{ marginTop: '8px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}>
      {loading && <p style={{ color: "var(--text-faint)", fontSize: '11px', margin: 0 }}>Analyzing history…</p>}
      {!loading && error && <p style={{ color: '#f87171', fontSize: '11px', margin: 0 }}>{error}</p>}
      {!loading && !error && result?.exact_match && (
        <p style={{ color: "var(--text-secondary)", fontSize: '11px', margin: 0 }}>
          This exact team has run this crime <strong style={{ color: '#f4f4f5' }}>{result.exact_match.runs}</strong> time{result.exact_match.runs !== 1 ? 's' : ''} before —{' '}
          <strong style={{ color: result.exact_match.success_rate >= 50 ? '#4ade80' : '#f87171' }}>{result.exact_match.success_rate}% successful</strong>{' '}
          ({result.exact_match.successes}/{result.exact_match.runs}).
        </p>
      )}
      {!loading && !error && !result?.exact_match && result?.fallback && (
        <p style={{ color: "var(--text-secondary)", fontSize: '11px', margin: 0 }}>
          No exact match — based on {result.fallback.sample_size} past run{result.fallback.sample_size !== 1 ? 's' : ''} of this crime,
          successful teams averaged {result.fallback.success_avg_cpr}% CPR vs {result.fallback.fail_avg_cpr}% for failed ones.
          {result.fallback.estimated_success_chance !== null && (
            <> This team's avg CPR is {result.fallback.team_avg_cpr}% → estimated{' '}
              <strong style={{ color: result.fallback.estimated_success_chance >= 50 ? '#4ade80' : '#f87171' }}>
                ~{result.fallback.estimated_success_chance}% chance of success
              </strong>.
            </>
          )}
        </p>
      )}
      {!loading && !error && !result?.exact_match && !result?.fallback && (
        <p style={{ color: "var(--text-faint)", fontSize: '11px', margin: 0 }}>{result?.message || 'Not enough history for this crime yet to estimate an outcome.'}</p>
      )}
    </div>
  )
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
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', flexWrap: 'wrap' }}>
            <span style={{ color: "var(--text-secondary)", fontSize: '12px', minWidth: '110px' }}>{s.position_label || s.position}</span>
            {(bucket === 'recruiting' || bucket === 'planning') && s.item_name && (
              <span title={s.item_available ? 'Item available' : 'Item missing or unavailable'} style={{
                fontSize: '10px', padding: '1px 6px', borderRadius: '4px', flexShrink: 0, whiteSpace: 'nowrap',
                color: s.item_available ? "var(--text-muted)" : '#f87171',
                background: s.item_available ? 'rgba(255,255,255,0.05)' : 'rgba(248,113,113,0.1)',
                border: `1px solid ${s.item_available ? 'rgba(255,255,255,0.1)' : 'rgba(248,113,113,0.3)'}`,
              }}>
                {s.item_available ? '' : '⚠ '}{s.item_name}
              </span>
            )}
            {s.torn_user_id ? (
              <a href={`https://www.torn.com/profiles.php?XID=${s.torn_user_id}`} target="_blank" rel="noopener noreferrer"
                style={{ color: '#a78bfa', fontSize: '13px', textDecoration: 'none', flex: '1 1 0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.username}
              </a>
            ) : (
              <span style={{ color: "var(--text-ghost)", fontSize: '13px', fontStyle: 'italic', flex: '1 1 0' }}>Vacant</span>
            )}
            {bucket === 'planning' && s.torn_user_id && <ProgressBar progress={s.progress} />}
            {bucket === 'completed' && s.outcome && (
              <span style={{ fontSize: '11px', color: OUTCOME_STYLE[s.outcome]?.color ?? "var(--text-muted)", flexShrink: 0 }}>
                {OUTCOME_STYLE[s.outcome]?.icon ?? ''} {s.outcome}
              </span>
            )}
            <CprBadge rate={s.checkpoint_pass_rate} crimeName={crime.name} position={s.position} />
          </div>
        ))}

        {bucket === 'planning' && (() => {
          const filledSlots = crime.slots.filter(s => s.torn_user_id)
          const rates = filledSlots.map(s => s.checkpoint_pass_rate).filter(r => r > 0)
          const avgCpr = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : null
          return (
            <PredictOutcome factionId={crime.faction_id} crimeName={crime.name}
              memberIds={filledSlots.map(s => s.torn_user_id)} avgCpr={avgCpr} />
          )
        })()}
      </div>

      {/* Rewards (completed only) */}
      {bucket === 'completed' && crime.rewards && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', background: 'rgba(255,255,255,0.015)' }}>
          {crime.rewards.money > 0 && (() => {
            const money = crime.rewards.money
            const memberPct = crime.rewards.payout?.percentage ?? 80
            const factionPct = 100 - memberPct
            const participantCount = crime.slots.filter(s => s.torn_user_id).length
            const perMember = participantCount > 0 ? (money * memberPct / 100) / participantCount : 0
            return (
              <>
                <span style={{ color: '#4ade80', fontSize: '12px', fontWeight: '600' }}>{fmtMoney(money)} total</span>
                <span style={{ color: "var(--text-muted)", fontSize: '11px' }}>
                  {memberPct}% split ({participantCount} member{participantCount !== 1 ? 's' : ''}): {fmtMoney(perMember)} each
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: '11px' }}>
                  Faction {factionPct}%: {fmtMoney(money * factionPct / 100)}
                </span>
              </>
            )
          })()}
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
      <p style={{ color: "var(--text-faint)", fontSize: '11px', margin: '0 0 14px' }}>
        The % badge next to each member is their checkpoint pass rate (CPR) — Torn's estimate of how likely they are to pass their individual part of this crime. Its colour reflects the actual historical pass rate we've observed at that CPR for this specific role/crime (green ≈ always succeeds, red ≈ rarely succeeds, yellow/orange ≈ 50/50) — not just the raw number. The bar shown during Planning is unrelated — it's the crime's time-based progress toward becoming Ready.
      </p>
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

const inputStyle = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#f4f4f5', borderRadius: '8px', padding: '8px 12px', fontSize: '13px',
}

// Shared result card for both Suggested and Custom team output.
function TeamResultCard({ team, factionId, crimeName, editable, roster, usedIds, onPick }) {
  const memberIds = team.positions.filter(p => p.torn_user_id).map(p => p.torn_user_id)

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#f4f4f5', fontWeight: '600', fontSize: '13px' }}>Team {team.team_index + 1}</span>
        <span style={{ fontSize: '12px', color: team.filled === team.needed ? '#4ade80' : '#f97316' }}>
          {team.filled}/{team.needed} filled · avg {team.avg_pass_rate}%
        </span>
      </div>
      <div style={{ padding: '8px 14px' }}>
        {team.positions.map((p, i) => (
          <div key={p.slotKey ?? i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: i < team.positions.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
            <span style={{ color: "var(--text-secondary)", fontSize: '12px', flexShrink: 0 }}>
              {p.position_label}
              {p.weight > 0 && (
                <span title="How much this position's own outcome historically swings the crime's overall success rate" style={{ color: '#f97316', fontSize: '10px', marginLeft: '5px' }}>
                  ⚡{p.weight}%
                </span>
              )}
            </span>
            {editable ? (
              <select
                value={p.torn_user_id ?? ''}
                onChange={e => onPick(p.slotKey, e.target.value ? Number(e.target.value) : null)}
                style={{ ...inputStyle, padding: '4px 8px', fontSize: '12px', maxWidth: '160px' }}
              >
                <option value="">— Vacant —</option>
                {roster.members
                  .filter(m => !usedIds.has(m.torn_user_id) || m.torn_user_id === p.torn_user_id)
                  .map(m => {
                    const rate = roster.cpr[m.torn_user_id]?.[p.position]
                    return <option key={m.torn_user_id} value={m.torn_user_id}>{m.username}{rate != null ? ` (${rate}%)` : ''}</option>
                  })}
              </select>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <a href={`https://www.torn.com/profiles.php?XID=${p.torn_user_id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa', fontSize: '12px', textDecoration: 'none' }}>
                  {p.username}
                </a>
                <CprBadge rate={p.pass_rate} crimeName={crimeName} position={p.position} />
              </div>
            )}
            {editable && <CprBadge rate={p.pass_rate} crimeName={crimeName} position={p.position} />}
          </div>
        ))}
        {team.filled < team.needed && (
          <p style={{ color: '#f97316', fontSize: '11px', margin: '8px 0 0' }}>
            {editable ? 'Not every position is filled yet.' : 'Not enough members with known CPR for this crime to fill every slot.'}
          </p>
        )}
        {memberIds.length > 0 && <PredictOutcome factionId={factionId} crimeName={crimeName} memberIds={memberIds} avgCpr={team.avg_pass_rate} />}
      </div>
    </div>
  )
}

// ── Suggested mode: algorithmic snake-draft ──────────────────────────────────

function SuggestedTeamBuilder({ factionId }) {
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

  return (
    <div>
      <p style={{ color: "var(--text-secondary)", fontSize: '13px', margin: '0 0 16px' }}>
        Suggests the best member for each position using their highest known checkpoint pass rate for that crime,
        spread evenly across teams (snake draft) so no single team hoards all the top performers. Positions are
        filled in order of how much they historically swing the crime's success (⚡ badge), so the most critical
        roles get first pick of the best available members.
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
            <TeamResultCard key={team.team_index} team={team} factionId={factionId} crimeName={crimeName} editable={false} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Custom mode: manual member assignment per slot ───────────────────────────

function CustomTeamBuilder({ factionId }) {
  const [templates, setTemplates] = useState([])
  const [crimeName, setCrimeName] = useState('')
  const [teamCount, setTeamCount] = useState(1)
  const [roster, setRoster] = useState({ members: [], cpr: {} })
  const [picks, setPicks] = useState({}) // `${teamIdx}-${slotIdx}` -> torn_user_id

  useEffect(() => {
    setCrimeName('')
    setPicks({})
    fetch(`${API_BASE_URL}/api/leadership/oc/templates?faction_id=${factionId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setTemplates(d.templates || []))
      .catch(() => setTemplates([]))
  }, [factionId])

  useEffect(() => {
    setPicks({})
    if (!crimeName) { setRoster({ members: [], cpr: {} }); return }
    fetch(`${API_BASE_URL}/api/leadership/oc/roster?faction_id=${factionId}&crime_name=${encodeURIComponent(crimeName)}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setRoster({ members: d.members || [], cpr: d.cpr || {} }))
      .catch(() => setRoster({ members: [], cpr: {} }))
  }, [factionId, crimeName])

  const selectedTemplate = templates.find(t => t.name === crimeName)
  const usedIds = new Set(Object.values(picks).filter(Boolean))

  const onPick = (slotKey, userId) => {
    setPicks(prev => ({ ...prev, [slotKey]: userId }))
  }

  const teams = selectedTemplate ? Array.from({ length: teamCount }, (_, teamIdx) => {
    const positions = selectedTemplate.positions.map((slot, slotIdx) => {
      const slotKey = `${teamIdx}-${slotIdx}`
      const userId = picks[slotKey] ?? null
      const username = userId ? roster.members.find(m => m.torn_user_id === userId)?.username : null
      const passRate = userId ? (roster.cpr[userId]?.[slot.position] ?? null) : null
      return { position: slot.position, position_label: slot.position_label, torn_user_id: userId, username, pass_rate: passRate, slotKey }
    })
    const rates = positions.map(p => p.pass_rate).filter(r => r != null)
    const avg = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : 0
    return { team_index: teamIdx, positions, avg_pass_rate: avg, filled: positions.filter(p => p.torn_user_id).length, needed: positions.length }
  }) : []

  return (
    <div>
      <p style={{ color: "var(--text-secondary)", fontSize: '13px', margin: '0 0 16px' }}>
        Manually assign a member to each position for however many teams you want — shown with the same CPR and
        Predict Outcome tools as the suggested builder.
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
            onChange={e => { setTeamCount(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1))); setPicks({}) }} />
        </div>
      </div>

      {selectedTemplate && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          {teams.map(team => (
            <TeamResultCard key={team.team_index} team={team} factionId={factionId} crimeName={crimeName}
              editable roster={roster} usedIds={usedIds} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Batch mode: multiple crimes at once, sequentially excluding used members ──

function BatchTeamBuilder({ factionId }) {
  const [templates, setTemplates] = useState([])
  const [rows, setRows] = useState([{ crime_name: '', team_count: 1 }])
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setRows([{ crime_name: '', team_count: 1 }])
    setResults(null)
    fetch(`${API_BASE_URL}/api/leadership/oc/templates?faction_id=${factionId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setTemplates(d.templates || []))
      .catch(() => setTemplates([]))
  }, [factionId])

  const updateRow = (i, patch) => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addRow = () => setRows(prev => [...prev, { crime_name: '', team_count: 1 }])
  const removeRow = (i) => setRows(prev => prev.filter((_, idx) => idx !== i))

  const runBatch = async () => {
    const valid = rows.filter(r => r.crime_name)
    if (!valid.length) return
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/oc/suggest-teams-batch`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ faction_id: factionId, crimes: valid }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to build batch')
      setResults(data.results)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <p style={{ color: "var(--text-secondary)", fontSize: '13px', margin: '0 0 16px' }}>
        Build teams for several crimes in one pass — the first crime gets first pick of members, then each
        following crime draws from whoever's left, so nobody is drafted onto two crimes at once.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ color: "var(--text-secondary)", fontSize: '11px', display: 'block', marginBottom: '4px' }}>Crime {i + 1}</label>
              <select style={{ ...inputStyle, minWidth: '220px' }} value={row.crime_name} onChange={e => updateRow(i, { crime_name: e.target.value })}>
                <option value="">Select a crime…</option>
                {templates.map(t => <option key={t.name} value={t.name}>{t.name} ({t.difficulty}/10)</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: "var(--text-secondary)", fontSize: '11px', display: 'block', marginBottom: '4px' }}>Teams</label>
              <input type="number" min="1" max="10" style={{ ...inputStyle, width: '70px' }} value={row.team_count}
                onChange={e => updateRow(i, { team_count: Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)) })} />
            </div>
            {rows.length > 1 && (
              <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: "var(--text-faint)", cursor: 'pointer', fontSize: '16px', padding: '8px' }}>×</button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button onClick={addRow} style={{
          padding: '7px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)',
          color: "var(--text-secondary)", fontSize: '12px', cursor: 'pointer',
        }}>+ Add Crime</button>
        <button onClick={runBatch} disabled={loading || !rows.some(r => r.crime_name)}
          style={{
            padding: '9px 20px', borderRadius: '8px', border: 'none', cursor: (loading || !rows.some(r => r.crime_name)) ? 'default' : 'pointer',
            background: 'rgba(179,18,63,0.8)', color: '#fff', fontSize: '13px', fontWeight: '600',
            opacity: (loading || !rows.some(r => r.crime_name)) ? 0.5 : 1,
          }}
        >{loading ? 'Building…' : 'Build All Teams'}</button>
      </div>

      {error && <p style={{ color: '#f87171', fontSize: '13px' }}>{error}</p>}

      {results && results.map((result, i) => (
        <div key={i} style={{ marginBottom: '20px' }}>
          <p style={{ color: '#f4f4f5', fontSize: '14px', fontWeight: '600', margin: '0 0 8px' }}>{result.crime_name}</p>
          {result.error ? (
            <p style={{ color: '#f87171', fontSize: '12px' }}>{result.error}</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
              {result.teams.map(team => (
                <TeamResultCard key={team.team_index} team={team} factionId={factionId} crimeName={result.crime_name} editable={false} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Mode wrapper ──────────────────────────────────────────────────────────────

function TeamBuilder({ factionId }) {
  const [mode, setMode] = useState('suggested')

  const modeStyle = (id) => ({
    padding: '5px 14px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
    border: mode === id ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.12)',
    background: mode === id ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
    color: mode === id ? '#f4f4f5' : "var(--text-secondary)",
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        <button onClick={() => setMode('suggested')} style={modeStyle('suggested')}>Suggested</button>
        <button onClick={() => setMode('batch')} style={modeStyle('batch')}>Multi-Crime</button>
        <button onClick={() => setMode('custom')} style={modeStyle('custom')}>Custom</button>
      </div>
      {mode === 'suggested' && <SuggestedTeamBuilder factionId={factionId} />}
      {mode === 'batch' && <BatchTeamBuilder factionId={factionId} />}
      {mode === 'custom' && <CustomTeamBuilder factionId={factionId} />}
    </div>
  )
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function OCTab() {
  const [factionId, setFactionId] = useState(FACTIONS[0].id)
  const [view, setView] = useState('crimes')
  const cprCurves = useCprCurves()

  const subTabStyle = (id) => ({
    padding: '8px 16px', fontWeight: '500', border: 'none', cursor: 'pointer',
    background: 'transparent', color: view === id ? '#f4f4f5' : "var(--text-secondary)",
    borderBottom: view === id ? '2px solid #b3123f' : '2px solid transparent', fontSize: '13px', whiteSpace: 'nowrap',
  })

  return (
    <CprCurvesContext.Provider value={cprCurves}>
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
    </CprCurvesContext.Provider>
  )
}
