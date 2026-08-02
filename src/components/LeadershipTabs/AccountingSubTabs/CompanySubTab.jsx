import { useState, useEffect, useMemo } from 'react'
import { API_BASE_URL } from '../../../config/api'

const PRINCIPAL   = 4_000_000_000
const TRACK_START = '2026-06-01'
// Tracking began mid-June, so that month can never be fully covered — exclude
// it from the "missing data detected" flag (it still shows in the coverage
// list itself, just doesn't trigger the warning).
const [TRACK_START_YEAR, TRACK_START_MONTH] = TRACK_START.split('-').map(Number)

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return `$${Math.round(n).toLocaleString()}`
}

function fmtShort(n) {
  if (!n) return '$0'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`
  return `$${Math.round(n).toLocaleString()}`
}

function pad(n) { return String(n).padStart(2, '0') }

function fmtMonthLabel(year, month) {
  return new Date(Date.UTC(year, month - 1, 1))
    .toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function fmtDay(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number)
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]
  return `${d} ${mon}`
}

// Returns list of YYYY-MM-DD strings for every day from monthStart up to min(yesterday, monthEnd).
// Yesterday, not today: snapshots are stamped with the date their data represents, and Torn only
// updates company figures once per day — today's row can't exist until tomorrow's cron runs.
function daysInRange(year, month) {
  const yesterdayDate = new Date(Date.now() - 86400000)
  const yesterday = `${yesterdayDate.getUTCFullYear()}-${pad(yesterdayDate.getUTCMonth()+1)}-${pad(yesterdayDate.getUTCDate())}`
  const lastDay  = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const monthEnd = `${year}-${pad(month)}-${pad(lastDay)}`
  const end      = yesterday < monthEnd ? yesterday : monthEnd
  const dates    = []
  for (let d = 1; d <= lastDay; d++) {
    const s = `${year}-${pad(month)}-${pad(d)}`
    if (s > end) break
    dates.push(s)
  }
  return dates
}

// All months from TRACK_START to now, most recent first
function getMonthRange() {
  const months = []
  const now = new Date()
  let y = now.getUTCFullYear(), m = now.getUTCMonth() + 1
  while (`${y}-${pad(m)}-01` >= TRACK_START) {
    months.push({ year: y, month: m })
    if (--m === 0) { m = 12; y-- }
  }
  return months
}

// Build coverage: per month, per company — which expected days are missing
function buildCoverage(companies, monthRange) {
  const withKey = companies.filter(c => c.has_api_key)
  if (!withKey.length) return []

  return monthRange.map(({ year, month }) => {
    const expected = daysInRange(year, month)
    if (!expected.length) return null

    const perCompany = withKey.map(c => {
      const tracked = new Set(c.snapshot_dates ?? [])
      const missing = expected.filter(d => !tracked.has(d))
      return { company_id: c.company_id, name: c.name, missing, tracked: expected.length - missing.length }
    })

    // Days where ALL companies have data
    const fullDays = expected.filter(d => perCompany.every(c => !c.missing.includes(d)))
    const anyMissing = perCompany.some(c => c.missing.length > 0)

    return { year, month, expected: expected.length, fullDays: fullDays.length, perCompany, anyMissing }
  }).filter(Boolean)
}

const TH = ({ children, right }) => (
  <th style={{
    padding: '8px 12px', textAlign: right ? 'right' : 'left',
    color: "var(--text-muted)", fontWeight: '500', fontSize: '12px',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  }}>{children}</th>
)

const TD = ({ children, right, muted, color }) => (
  <td style={{
    padding: '10px 12px', textAlign: right ? 'right' : 'left',
    color: color || (muted ? "var(--text-muted)" : '#f4f4f5'), fontSize: '13px',
  }}>{children}</td>
)

// "faction 30%" sub-line shown beneath a per-member amount — same colour as
// its column so it reads as "this column, but the cut", not a separate muted note
const CutLine = ({ value, color }) => (
  <div style={{ fontSize: '13px', color, marginTop: '2px', fontWeight: '400' }}>
    30%: {fmt(value * 0.3)}
  </div>
)

// Same star glyph throughout, filled vs unfilled told apart by colour rather
// than by ★/☆ shape — the outline/solid distinction disappears at small sizes
const RatingStars = ({ rating }) => (
  <div style={{ fontSize: '13px', letterSpacing: '1px', marginTop: '2px' }}>
    {Array.from({ length: 10 }, (_, i) => (
      <span key={i} style={{ color: i < rating ? '#ffd166' : 'rgba(255,255,255,0.2)' }}>★</span>
    ))}
  </div>
)

// ─── Company breakdown ─────────────────────────────────────────────────────

function CompanyBreakdownPanel({ companies, token }) {
  const monthRange = useMemo(getMonthRange, [])
  const [companyId, setCompanyId] = useState(companies[0]?.company_id ?? '')
  const [monthKey, setMonthKey]   = useState(monthRange[0] ? `${monthRange[0].year}-${monthRange[0].month}` : '')
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)

  useEffect(() => {
    if (!companyId || !monthKey) return undefined
    const [year, month] = monthKey.split('-').map(Number)
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`${API_BASE_URL}/api/leadership/accounting/companies/${companyId}/breakdown?year=${year}&month=${month}`, {
      headers: { Authorization: token }, signal: controller.signal,
    })
      .then(r => r.json().then(json => ({ r, json })))
      .then(({ r, json }) => {
        if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`)
        setData(json)
      })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [companyId, monthKey, token])

  const selectedCompany = companies.find(c => String(c.company_id) === String(companyId))

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <label style={{ color: "var(--text-muted)", fontSize: '10px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Company</label>
          <select
            value={companyId}
            onChange={e => setCompanyId(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', color: '#f4f4f5', padding: '7px 12px', fontSize: '13px', cursor: 'pointer',
              minWidth: '200px',
            }}
          >
            {companies.map(c => (
              <option key={c.company_id} value={c.company_id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <label style={{ color: "var(--text-muted)", fontSize: '10px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Month</label>
          <select
            value={monthKey}
            onChange={e => setMonthKey(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', color: '#f4f4f5', padding: '7px 12px', fontSize: '13px', cursor: 'pointer',
            }}
          >
            {monthRange.map(({ year, month }) => (
              <option key={`${year}-${month}`} value={`${year}-${month}`}>{fmtMonthLabel(year, month)}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p style={{ color: "var(--text-secondary)", fontSize: '13px' }}>Loading…</p>}

      {error && (
        <div style={{
          padding: '14px 16px', borderRadius: '10px',
          background: 'rgba(255,0,0,0.08)', border: '1px solid rgba(255,0,0,0.2)', marginBottom: '16px',
        }}>
          <p style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        data.days.length === 0 ? (
          <div style={{
            padding: '48px', textAlign: 'center',
            background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <p style={{ color: "var(--text-faint)", fontSize: '14px', margin: 0 }}>
              No profit snapshots for {selectedCompany?.name || data.name} in {fmtMonthLabel(data.year, data.month)}.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '800px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <TH>Date</TH>
                  <TH>Day</TH>
                  <TH right>Income</TH>
                  <TH right>Wages</TH>
                  <TH right>Advert</TH>
                  <TH right>Profit</TH>
                  <TH right>Month Profit</TH>
                </tr>
              </thead>
              <tbody>
                {data.days.map((d, i) => {
                  const isWeekend = d.weekday === 'Saturday' || d.weekday === 'Sunday'
                  return (
                    <tr key={d.date} style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                    }}>
                      <TD>{d.date}</TD>
                      <TD color={isWeekend ? '#fbbf24' : "var(--text-secondary)"}>{d.weekday}</TD>
                      <TD right>{fmt(d.income)}</TD>
                      <TD right color={d.wages > 0 ? '#f87171' : "var(--text-muted)"}>{fmt(d.wages)}</TD>
                      <TD right color={d.advert > 0 ? '#f87171' : "var(--text-muted)"}>{fmt(d.advert)}</TD>
                      <TD right color={d.profit > 0 ? '#4ade80' : "var(--text-muted)"}>
                        {fmt(d.profit)}
                        <CutLine value={d.profit} color="#4ade8099" />
                      </TD>
                      <TD right color="#a78bfa">
                        {fmt(d.month_profit)}
                        <CutLine value={d.month_profit} color="#a78bfa99" />
                      </TD>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

export default function CompanySubTab({ factionId }) {
  const [view, setView]                 = useState('overview')
  const [companies, setCompanies]       = useState([])
  const [loading, setLoading]           = useState(true)
  const [addId, setAddId]               = useState('')
  const [adding, setAdding]             = useState(false)
  const [addError, setAddError]         = useState(null)
  const [toggling, setToggling]         = useState(null)
  const [coverageOpen, setCoverageOpen] = useState(false)
  const [openMonths, setOpenMonths]     = useState({})
  const token = localStorage.getItem('occultusSession')

  const load = () => {
    setLoading(true)
    const qs = factionId != null ? `?faction_id=${factionId}` : ''
    fetch(`${API_BASE_URL}/api/leadership/accounting/companies${qs}`, {
      headers: { Authorization: token },
    })
      .then(r => r.json())
      .then(d => { setCompanies(d.companies || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(load, [factionId, token])

  const monthRange = useMemo(getMonthRange, [])
  const coverage   = useMemo(() => buildCoverage(companies, monthRange), [companies, monthRange])

  // Current month fully-covered days (all companies with API key have data)
  const currentCov   = coverage[0] ?? null
  const daysTracked  = currentCov?.fullDays ?? 0
  const daysExpected = currentCov?.expected ?? 0

  const togglePrincipalPaid = async (company) => {
    setToggling(company.company_id)
    try {
      await fetch(`${API_BASE_URL}/api/leadership/accounting/companies/${company.company_id}/principal-paid`, {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid: !company.principal_paid }),
      })
      setCompanies(prev => prev.map(c =>
        c.company_id === company.company_id ? { ...c, principal_paid: c.principal_paid ? 0 : 1 } : c
      ))
    } catch (e) {
      console.error('Failed to toggle principal paid:', e)
    } finally {
      setToggling(null)
    }
  }

  const handleAdd = async () => {
    const id = parseInt(addId)
    if (!id) return setAddError('Enter a valid Torn company ID')
    if (companies.find(c => c.company_id === id)) return setAddError('Company already tracked')
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/accounting/companies`, {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: id }),
      })
      const data = await res.json()
      if (!res.ok) { setAddError(data.error || 'Failed to add company'); return }
      setAddId('')
      load()
    } catch (e) {
      setAddError(e.message)
    } finally {
      setAdding(false)
    }
  }

  const totalPrincipalPaid  = companies.filter(c => c.principal_paid).length * PRINCIPAL
  const totalPrincipalOwing = companies.filter(c => !c.principal_paid).length * PRINCIPAL
  const totalMtd            = companies.reduce((s, c) => s + (c.mtd_profit ?? 0), 0)
  const totalYtd            = companies.reduce((s, c) => s + (c.ytd_profit ?? 0), 0)
  const totalEstMonthly     = companies.reduce((s, c) => s + (c.est_monthly ?? 0), 0)
  const totalPrevMonth      = companies.reduce((s, c) => s + (c.prev_month_profit ?? 0), 0)
  const withKey             = companies.filter(c => c.has_api_key).length

  if (loading) return <p style={{ color: "var(--text-secondary)", fontSize: '13px' }}>Loading…</p>

  const daysColor = daysTracked === daysExpected ? '#4ade80' : daysTracked === 0 ? '#f87171' : '#f97316'

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[['overview', 'Overview'], ['breakdown', 'Company Breakdown']].map(([v, label]) => (
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

      {view === 'breakdown' && <CompanyBreakdownPanel companies={companies} token={token} />}

      {view === 'overview' && (
      <>
      {/* Summary stats */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        {[
          { label: 'Companies',          value: companies.length,                               color: '#f4f4f5' },
          { label: 'API Keys',           value: `${withKey} / ${companies.length}`,             color: withKey === companies.length ? '#4ade80' : '#f97316' },
          { label: 'Principal Invested', value: fmtShort(totalPrincipalPaid),                   color: '#f4f4f5' },
          { label: 'Principal Owing',    value: fmtShort(totalPrincipalOwing),                  color: totalPrincipalOwing > 0 ? '#f97316' : "var(--text-muted)" },
          { label: 'MTD Profit (30%)',         value: fmtShort(totalMtd * 0.3),                 color: '#4ade80' },
          { label: 'Current Month Est. (30%)', value: fmtShort(totalEstMonthly * 0.3),          color: '#a78bfa' },
          { label: 'Days Tracked',       value: `${daysTracked} / ${daysExpected}`,             color: daysColor },
        ].map(({ label, value, color }) => (
          <div key={label} className="p-4 rounded-lg" style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', minWidth: '130px',
          }}>
            <p style={{ color: "var(--text-secondary)", fontSize: '12px', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
            <p style={{ color, fontSize: '18px', fontWeight: '700', margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Coverage panel */}
      {coverage.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => setCoverageOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'none', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px', padding: '10px 14px', cursor: 'pointer',
              color: "var(--text-secondary)", fontSize: '12px', fontWeight: '600',
              textTransform: 'uppercase', letterSpacing: '0.05em', width: '100%',
            }}
          >
            <span style={{ fontSize: '10px' }}>{coverageOpen ? '▼' : '▶'}</span>
            Data Coverage
            {!coverageOpen && coverage.some(m => m.anyMissing && !(m.year === TRACK_START_YEAR && m.month === TRACK_START_MONTH)) && (
              <span style={{ marginLeft: '6px', color: '#f97316', fontSize: '11px', fontWeight: '500', textTransform: 'none', letterSpacing: 0 }}>
                — missing data detected
              </span>
            )}
          </button>

          {coverageOpen && (
            <div style={{
              border: '1px solid rgba(255,255,255,0.08)', borderTop: 'none',
              borderRadius: '0 0 8px 8px', overflow: 'hidden',
            }}>
              {coverage.map(({ year, month, expected, fullDays, perCompany, anyMissing }) => {
                const key   = `${year}-${month}`
                const open  = openMonths[key]
                const label = fmtMonthLabel(year, month)
                const allGood = fullDays === expected

                return (
                  <div key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <button
                      onClick={() => setOpenMonths(s => ({ ...s, [key]: !s[key] }))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        width: '100%', background: 'rgba(255,255,255,0.02)',
                        border: 'none', padding: '10px 16px', cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ color: "var(--text-muted)", fontSize: '10px' }}>{open ? '▼' : '▶'}</span>
                      <span style={{ color: '#e4e4e7', fontSize: '13px', flex: 1 }}>{label}</span>
                      <span style={{ fontSize: '12px', color: allGood ? '#4ade80' : '#f97316' }}>
                        {fullDays} / {expected} days fully covered
                      </span>
                    </button>

                    {open && (
                      <div style={{ padding: '8px 16px 14px 36px' }}>
                        {anyMissing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {perCompany.map(c => c.missing.length > 0 && (
                              <div key={c.company_id} style={{ fontSize: '12px' }}>
                                <span style={{ color: "var(--text-secondary)", marginRight: '8px' }}>{c.name}</span>
                                <span style={{ color: '#f97316' }}>
                                  {c.tracked} / {expected} days —
                                </span>
                                <span style={{ color: "var(--text-muted)" }}> missing: </span>
                                <span style={{ color: '#f87171' }}>{c.missing.map(fmtDay).join(', ')}</span>
                              </div>
                            ))}
                            {perCompany.every(c => c.missing.length === 0) && (
                              <p style={{ color: '#4ade80', fontSize: '12px', margin: 0 }}>All companies fully covered.</p>
                            )}
                          </div>
                        ) : (
                          <p style={{ color: '#4ade80', fontSize: '12px', margin: 0 }}>All companies fully covered.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '900px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <TH>Company</TH>
              <TH>Director</TH>
              <TH right>Daily Income Avg</TH>
              <TH right>Wages</TH>
              <TH right>Advert</TH>
              <TH right>Daily Profit Avg</TH>
              <TH right>Prev Month</TH>
              <TH right>MTD</TH>
              <TH right>YTD</TH>
              <TH right>Current Month Est.</TH>
              <TH>Principal</TH>
            </tr>
          </thead>
          <tbody>
            {companies.map(c => {
              const hasDays = (c.month_snapshot_days ?? 0) > 0
              return (
                <tr key={c.company_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <TD>
                    <div style={{ fontWeight: '500' }}>{c.name}</div>
                    {c.rating != null && <RatingStars rating={c.rating} />}
                    {!c.has_api_key && (
                      <div style={{ fontSize: '10px', color: '#f97316', marginTop: '2px' }}>No API key — principal only</div>
                    )}
                  </TD>
                  <TD muted>
                    <div>{c.director_name ?? `#${c.director_id}`}</div>
                    {c.employees_capacity != null && (
                      <div style={{ fontSize: '13px', color: "var(--text-faint)", marginTop: '2px' }}>{c.employees_hired}/{c.employees_capacity}</div>
                    )}
                  </TD>
                  <TD right>{hasDays ? fmt(c.avg_daily_income) : '—'}</TD>
                  <TD right color={c.daily_wages > 0 ? '#f87171' : "var(--text-muted)"}>{c.has_api_key ? fmt(c.daily_wages) : '—'}</TD>
                  <TD right color={c.daily_advert > 0 ? '#f87171' : "var(--text-muted)"}>{c.has_api_key ? fmt(c.daily_advert) : '—'}</TD>
                  <TD right color={c.avg_daily_profit > 0 ? '#4ade80' : "var(--text-muted)"}>{hasDays ? fmt(c.avg_daily_profit) : '—'}</TD>
                  <TD right color={(c.prev_month_profit ?? 0) > 0 ? '#94a3b8' : "var(--text-muted)"}>
                    {(c.prev_month_profit ?? 0) > 0 ? fmt(c.prev_month_profit) : '—'}
                    {(c.prev_month_profit ?? 0) > 0 && <CutLine value={c.prev_month_profit} color="#94a3b899" />}
                  </TD>
                  <TD right color={hasDays ? '#4ade80' : "var(--text-muted)"}>
                    {hasDays ? fmt(c.mtd_profit) : '—'}
                    {hasDays && <CutLine value={c.mtd_profit} color="#4ade8099" />}
                  </TD>
                  <TD right color={hasDays ? '#60a5fa' : "var(--text-muted)"}>
                    {hasDays ? fmt(c.ytd_profit) : '—'}
                    {hasDays && <CutLine value={c.ytd_profit} color="#60a5fa99" />}
                  </TD>
                  <TD right color={hasDays ? '#a78bfa' : "var(--text-muted)"}>
                    {hasDays
                      ? <span title={`${c.month_snapshot_days} day${c.month_snapshot_days === 1 ? '' : 's'} of data`}>{fmt(c.est_monthly)}</span>
                      : '—'}
                    {hasDays && <CutLine value={c.est_monthly} color="#a78bfa99" />}
                  </TD>
                  <td style={{ padding: '10px 12px' }}>
                    <button
                      onClick={() => togglePrincipalPaid(c)}
                      disabled={toggling === c.company_id}
                      style={{
                        padding: '3px 10px', borderRadius: '99px', border: 'none', cursor: 'pointer',
                        fontSize: '12px', fontWeight: '600',
                        background: c.principal_paid ? 'rgba(74,222,128,0.15)' : 'rgba(249,115,22,0.15)',
                        color: c.principal_paid ? '#4ade80' : '#f97316',
                        opacity: toggling === c.company_id ? 0.5 : 1,
                      }}
                    >
                      {c.principal_paid ? 'Paid' : 'Owing'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <td colSpan={6} style={{ padding: '10px 12px', color: "var(--text-secondary)", fontSize: '12px', fontWeight: '600' }}>
                Total
              </td>
              <TD right color='#94a3b8'>{totalPrevMonth > 0 ? fmt(totalPrevMonth) : '—'}</TD>
              <TD right color='#4ade80'>{fmt(totalMtd)}</TD>
              <TD right color='#60a5fa'>{fmt(totalYtd)}</TD>
              <TD right color='#a78bfa'>{fmt(totalEstMonthly)}</TD>
              <td />
            </tr>
            <tr style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <td colSpan={6} style={{ padding: '6px 12px', color: "var(--text-faint)", fontSize: '13px', fontWeight: '600' }}>
                Faction 30%
              </td>
              <TD right color='#64748b'>{totalPrevMonth > 0 ? fmt(totalPrevMonth * 0.3) : '—'}</TD>
              <TD right color='#4ade8099'>{fmt(totalMtd * 0.3)}</TD>
              <TD right color='#60a5fa99'>{fmt(totalYtd * 0.3)}</TD>
              <TD right color='#a78bfa99'>{fmt(totalEstMonthly * 0.3)}</TD>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Add company */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px' }}>
        <p style={{ color: "var(--text-secondary)", fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
          Add Company
        </p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="number"
            placeholder="Torn company ID"
            value={addId}
            onChange={e => { setAddId(e.target.value); setAddError(null) }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            style={{
              padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.05)', color: '#f4f4f5', fontSize: '13px', width: '180px',
            }}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !addId}
            style={{
              padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: 'rgba(179,18,63,0.2)', color: '#ff2f6d', fontSize: '13px', fontWeight: '600',
              opacity: adding || !addId ? 0.5 : 1,
            }}
          >
            {adding ? 'Adding…' : 'Add Company'}
          </button>
          {addError && <span style={{ color: '#f87171', fontSize: '12px' }}>{addError}</span>}
        </div>
        <p style={{ color: "var(--text-faint)", fontSize: '11px', marginTop: '8px' }}>
          Adds to the daily company cron. The director must log in to provide their API key for profit data.
        </p>
      </div>

      <p style={{ color: "var(--text-faint)", fontSize: '11px', marginTop: '16px' }}>
        Principal: {fmt(PRINCIPAL)} per company · Daily Income Avg / Daily Profit Avg = average of this month's daily snapshots (not just the latest day) · Profit = daily income − wages − advert ·
        MTD / YTD / Prev Month = sum of daily profit snapshots · Current Month Est. = daily average × days in month ·
        Days Tracked = days where all companies with API keys have data · Only paid principal counts toward networth
      </p>
      </>
      )}
    </div>
  )
}
