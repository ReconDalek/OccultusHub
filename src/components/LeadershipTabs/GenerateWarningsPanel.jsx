import { useState, useCallback } from 'react'
import { API_BASE_URL } from '../../config/api'

const FACTION_LABEL = { 33097: 'Occ1', 9728: 'Occ2', 9171: 'Occ3' }
const FACTION_IDS   = [33097, 9728, 9171]
const REPORT_TYPES  = ['Energy', 'Chain', 'War']

const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

const token = () => localStorage.getItem('occultusSession')

function buildMonthOptions() {
  const now = new Date()
  const options = []
  for (let i = 0; i < 18; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    options.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() })
  }
  return options
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GB')
}

function fmtShortDate(d) {
  if (!d) return d
  const [, m, day] = d.split('-')
  return `${MONTHS_FULL[parseInt(m, 10) - 1].slice(0, 3)} ${parseInt(day, 10)}`
}

const inputStyle = {
  padding: '7px 12px', borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)',
  color: '#f4f4f5', fontSize: '13px', boxSizing: 'border-box',
}
const labelStyle = { color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }

// ─── Type selector ────────────────────────────────────────────────────────────

function TypeSelector({ reportType, setReportType }) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
      {REPORT_TYPES.map(t => (
        <button
          key={t}
          onClick={() => setReportType(t)}
          style={{
            padding: '7px 18px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
            fontWeight: reportType === t ? '600' : '400',
            border: `1px solid ${reportType === t ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
            background: reportType === t ? 'rgba(179,18,63,0.15)' : 'transparent',
            color: reportType === t ? '#f4f4f5' : 'var(--text-secondary)',
          }}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

// ─── Report modal — single member, prefilled from the generated row ──────────

function ReportModal({ member, periodLabel, periodMonth, periodYear, target, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const [dateReported, setDateReported]   = useState(today)
  const [dateIssued, setDateIssued]       = useState('')
  const [targetValue, setTargetValue]     = useState(target ?? '')
  const [achievedValue, setAchievedValue] = useState(member.avg_per_day)
  const [comment, setComment]             = useState('')
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/warnings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token() },
        body: JSON.stringify({
          torn_user_id:   member.torn_user_id,
          username:       member.username,
          date_reported:  dateReported,
          date_issued:    dateIssued || null,
          period:         periodLabel,
          period_month:   periodMonth,
          period_year:    periodYear,
          warning_type:   'Energy',
          target_value:   targetValue !== '' ? parseFloat(targetValue) : null,
          achieved_value: achievedValue !== '' ? parseFloat(achievedValue) : null,
          comment:        comment || null,
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onSaved()
    } catch (e) {
      setError(e.message)
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
        padding: '28px', width: '100%', maxWidth: '480px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <h3 style={{ color: '#f4f4f5', fontFamily: 'Cinzel,serif', fontSize: '16px', letterSpacing: '1px', margin: 0 }}>
            Report Energy Warning
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>

        <p style={{ color: '#f4f4f5', fontSize: '14px', margin: '0 0 4px' }}>{member.username}</p>
        <p style={{ color: 'var(--text-faint)', fontSize: '12px', margin: '0 0 18px' }}>
          {FACTION_LABEL[member.faction_id] || '—'} · {periodLabel}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Target Avg/Day</label>
              <input type="number" style={{ ...inputStyle, width: '100%' }} value={targetValue}
                onChange={e => setTargetValue(e.target.value)} placeholder="e.g. 400" />
            </div>
            <div>
              <label style={labelStyle}>Achieved Avg/Day</label>
              <input type="number" style={{ ...inputStyle, width: '100%' }} value={achievedValue}
                onChange={e => setAchievedValue(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Date Reported</label>
              <input type="date" style={{ ...inputStyle, width: '100%' }} value={dateReported}
                onChange={e => setDateReported(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Date Issued (optional)</label>
              <input type="date" style={{ ...inputStyle, width: '100%' }} value={dateIssued}
                onChange={e => setDateIssued(e.target.value)} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Comment / Note (optional)</label>
            <textarea rows={2} style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
              value={comment} onChange={e => setComment(e.target.value)} />
          </div>

          {error && <p style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button type="button" onClick={onClose}
              style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', background: 'rgba(179,18,63,0.8)', color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: '13px', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save Warning'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Energy report table ──────────────────────────────────────────────────────

function EnergyReportTable({ data, targets, reportedIds, onReport }) {
  const showAttacks = data.include_attacks

  const colTemplate = showAttacks
    ? '30px 1fr 90px 90px 90px 70px 50px 90px 100px 130px'
    : '30px 1fr 90px 90px 70px 50px 90px 100px 130px'

  const headers = showAttacks
    ? ['#', 'Member', 'Gym', 'Attacks', 'Total', 'Days', 'OD', 'Avg/Day', 'vs Target', '']
    : ['#', 'Member', 'Gym', 'Total', 'Days', 'OD', 'Avg/Day', 'vs Target', '']

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: showAttacks ? '880px' : '800px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: colTemplate, gap: '8px', padding: '6px 12px', marginBottom: '4px' }}>
          {headers.map((h, i) => (
            <span key={h + i} style={{ color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>

        {data.members.map((m, i) => {
          const target = targets[m.faction_id]
          const hasTarget = target !== '' && target != null && !Number.isNaN(Number(target))
          const delta = hasTarget ? m.avg_per_day - Number(target) : null
          const reported = reportedIds.has(m.torn_user_id)

          return (
            <div key={m.torn_user_id} style={{
              display: 'grid', gridTemplateColumns: colTemplate, alignItems: 'center',
              gap: '8px', padding: '9px 12px', borderRadius: '8px',
              background: hasTarget && delta < 0 ? 'rgba(248,113,113,0.05)' : (i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'),
              border: hasTarget && delta < 0 ? '1px solid rgba(248,113,113,0.15)' : '1px solid transparent',
            }}>
              <span style={{ color: 'var(--text-faint)', fontSize: '12px', textAlign: 'right' }}>{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <span style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '500' }}>{m.username}</span>
                <span style={{ marginLeft: '6px', color: 'var(--text-faint)', fontSize: '11px' }}>
                  {FACTION_LABEL[m.faction_id]}{m.level != null && ` · Lv ${m.level}`}
                  {m.joined_mid_month && (
                    <span title={`First tracked ${m.start_date} — joined mid-month`} style={{ color: '#f59e0b', marginLeft: '4px' }}>⚠ new</span>
                  )}
                </span>
                {m.movements && (
                  <div style={{ color: '#c4b5fd', fontSize: '12px', fontWeight: '600', marginTop: '3px' }}>
                    ↔ {m.movements.map((mv, idx) => (
                      <span key={idx}
                        style={mv.is_future ? { color: 'var(--text-faint)', fontWeight: '400', fontStyle: 'italic' } : undefined}
                        title={mv.is_future ? 'Moved back after this reporting period' : undefined}
                      >
                        {idx > 0 && ' → '}
                        {FACTION_LABEL[mv.faction_id]}
                        {idx > 0 && <span style={{ color: 'var(--text-faint)', fontWeight: '400' }}> ({fmtShortDate(mv.start_date)})</span>}
                        {mv.is_majority && <span title="Spent the most days here this month"> ★</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {showAttacks && <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{fmt(m.gym_energy)}</span>}
              {showAttacks && <span style={{ color: '#f87171', fontSize: '12px' }}>{m.attack_hits > 0 ? `+${fmt(m.attack_energy)}` : '—'}</span>}
              {!showAttacks && <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{fmt(m.gym_energy)}</span>}
              <span style={{ color: '#a78bfa', fontSize: '13px', fontWeight: '700' }}>{fmt(m.total_energy)}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{m.tracked_days}d</span>
              <span style={{ color: m.overdoses > 0 ? '#f87171' : 'var(--text-secondary)', fontSize: '12px' }}>{fmt(m.overdoses)}</span>
              <span style={{ color: '#ff2f6d', fontSize: '13px', fontWeight: '600' }}>{fmt(m.avg_per_day)}</span>
              <span style={{ fontSize: '12px', color: !hasTarget ? 'var(--text-faint)' : (delta < 0 ? '#f87171' : '#4ade80') }}>
                {!hasTarget ? '—' : `${delta >= 0 ? '+' : ''}${fmt(delta)}`}
              </span>
              <div>
                {reported ? (
                  <span style={{ color: '#4ade80', fontSize: '12px' }}>✓ Warned</span>
                ) : (
                  <button onClick={() => onReport(m)}
                    style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(179,18,63,0.4)', background: 'rgba(179,18,63,0.12)', color: '#ff2f6d', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap' }}>
                    Warn
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Energy generator ─────────────────────────────────────────────────────────

// Warnings are reported in arrears — default to the last completed month,
// not the in-progress current one (which usually has little/no data yet).
function previousMonth(now) {
  const year  = now.getUTCFullYear()
  const month = now.getUTCMonth() - 1
  return month < 0 ? { year: year - 1, month: 11 } : { year, month }
}

function EnergyGenerator({ onWarningSaved }) {
  const now = new Date()
  const months = buildMonthOptions()

  const [selectedMonth, setSelectedMonth]     = useState(() => previousMonth(now))
  const [selectedFactions, setSelectedFactions] = useState(FACTION_IDS)
  const [includeAttacks, setIncludeAttacks]   = useState(true)
  const [includeNewMembers, setIncludeNewMembers] = useState(false)
  const [targets, setTargets] = useState({ 33097: '', 9728: '', 9171: '' })

  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [reportedIds, setReportedIds] = useState(new Set())
  const [reportingMember, setReportingMember] = useState(null)

  function toggleFaction(id) {
    setSelectedFactions(prev => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev // keep at least one selected
        return prev.filter(f => f !== id)
      }
      return [...prev, id]
    })
  }

  const generate = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({
      year: String(selectedMonth.year),
      month: String(selectedMonth.month + 1),
      factions: selectedFactions.join(','),
      includeAttacks: includeAttacks ? '1' : '0',
      includeNewMembers: includeNewMembers ? '1' : '0',
    })
    fetch(`${API_BASE_URL}/api/leadership/warnings/generate/energy?${params}`, { headers: { Authorization: token() } })
      .then(res => res.json().then(json => ({ res, json })))
      .then(({ res, json }) => {
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
        setData(json)
        setReportedIds(new Set())
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedMonth, selectedFactions, includeAttacks, includeNewMembers])

  const periodLabel = `${MONTHS_FULL[selectedMonth.month]} ${selectedMonth.year}`

  // Members who already meet or exceed their faction's target aren't warning
  // candidates — hide them once a target is set for their faction. Recomputed
  // from live `targets` state (not baked in at generate time) so tweaking a
  // target updates the list immediately without re-generating.
  const visibleMembers = data ? data.members.filter(m => {
    const target = targets[m.faction_id]
    const hasTarget = target !== '' && target != null && !Number.isNaN(Number(target))
    return !hasTarget || m.avg_per_day < Number(target)
  }) : []

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div>
          <label style={labelStyle}>Month</label>
          <select
            value={`${selectedMonth.year}-${selectedMonth.month}`}
            onChange={e => {
              const [y, mo] = e.target.value.split('-').map(Number)
              setSelectedMonth({ year: y, month: mo })
            }}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {months.map(({ year, month }) => (
              <option key={`${year}-${month}`} value={`${year}-${month}`}>
                {MONTHS_FULL[month]} {year}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Factions</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            {FACTION_IDS.map(id => {
              const active = selectedFactions.includes(id)
              return (
                <button key={id} onClick={() => toggleFaction(id)}
                  style={{
                    padding: '7px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                    border: `1px solid ${active ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    background: active ? 'rgba(167,139,250,0.15)' : 'transparent',
                    color: active ? '#f4f4f5' : 'var(--text-secondary)',
                  }}
                >
                  {FACTION_LABEL[id]}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Options</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setIncludeAttacks(v => !v)}
              style={{
                padding: '7px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                border: `1px solid ${includeAttacks ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.08)'}`,
                background: includeAttacks ? 'rgba(251,191,36,0.1)' : 'transparent',
                color: includeAttacks ? '#fbbf24' : 'var(--text-secondary)',
              }}
            >
              Include Attacks
            </button>
            <button onClick={() => setIncludeNewMembers(v => !v)}
              style={{
                padding: '7px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                border: `1px solid ${includeNewMembers ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.08)'}`,
                background: includeNewMembers ? 'rgba(251,191,36,0.1)' : 'transparent',
                color: includeNewMembers ? '#fbbf24' : 'var(--text-secondary)',
              }}
            >
              Include New Members
            </button>
          </div>
        </div>

        <div style={{ alignSelf: 'flex-end' }}>
          <button onClick={generate} disabled={loading}
            style={{
              padding: '8px 22px', borderRadius: '8px', border: 'none',
              background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
              color: '#fff', fontSize: '13px', fontWeight: '600', cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Generating…' : 'Generate Report'}
          </button>
        </div>
      </div>

      {/* Per-faction targets */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {selectedFactions.map(id => (
          <div key={id}>
            <label style={labelStyle}>{FACTION_LABEL[id]} Target Avg/Day</label>
            <input
              type="number"
              placeholder="none set"
              value={targets[id]}
              onChange={e => setTargets(t => ({ ...t, [id]: e.target.value }))}
              style={{ ...inputStyle, width: '130px' }}
            />
          </div>
        ))}
      </div>

      {error && (
        <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(255,0,0,0.08)', border: '1px solid rgba(255,0,0,0.2)', marginBottom: '16px' }}>
          <p style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{error}</p>
        </div>
      )}

      {!data && !loading && !error && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Set your parameters and click Generate Report.</p>
      )}

      {data && (
        data.members.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ color: 'var(--text-faint)', fontSize: '14px', margin: 0 }}>No energy data for {periodLabel} with the selected factions.</p>
          </div>
        ) : visibleMembers.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ color: 'var(--text-faint)', fontSize: '14px', margin: 0 }}>Every member met their faction's target for {periodLabel}.</p>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--text-faint)', fontSize: '12px', marginBottom: '10px' }}>
              {periodLabel} · {visibleMembers.length} member{visibleMembers.length !== 1 ? 's' : ''} · {data.days_in_month} days in month
            </p>
            <EnergyReportTable
              data={{ ...data, members: visibleMembers }}
              targets={targets}
              reportedIds={reportedIds}
              onReport={setReportingMember}
            />
          </>
        )
      )}

      {reportingMember && (
        <ReportModal
          member={reportingMember}
          periodLabel={periodLabel}
          periodMonth={selectedMonth.month + 1}
          periodYear={selectedMonth.year}
          target={targets[reportingMember.faction_id]}
          onClose={() => setReportingMember(null)}
          onSaved={() => {
            setReportedIds(prev => new Set(prev).add(reportingMember.torn_user_id))
            setReportingMember(null)
            onWarningSaved?.()
          }}
        />
      )}
    </div>
  )
}

// ─── Coming soon (Chain / War) ────────────────────────────────────────────────

function ComingSoon({ type }) {
  return (
    <div style={{ padding: '48px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p style={{ color: 'var(--text-faint)', fontSize: '14px', margin: 0 }}>{type} warning generation is coming soon.</p>
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function GenerateWarningsPanel({ onWarningSaved }) {
  const [reportType, setReportType] = useState('Energy')

  return (
    <div>
      <TypeSelector reportType={reportType} setReportType={setReportType} />
      {reportType === 'Energy' ? <EnergyGenerator onWarningSaved={onWarningSaved} /> : <ComingSoon type={reportType} />}
    </div>
  )
}
