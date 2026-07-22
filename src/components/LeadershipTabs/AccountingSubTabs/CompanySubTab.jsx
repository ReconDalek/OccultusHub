import { useState, useEffect, useMemo } from 'react'
import { API_BASE_URL } from '../../../config/api'

const PRINCIPAL   = 4_000_000_000
const TRACK_START = '2026-06-01'

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

// Returns list of YYYY-MM-DD strings for every day from monthStart up to min(today, monthEnd)
function daysInRange(year, month) {
  const now      = new Date()
  const today    = `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())}`
  const lastDay  = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const monthEnd = `${year}-${pad(month)}-${pad(lastDay)}`
  const end      = today < monthEnd ? today : monthEnd
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
    color: "var(--text-muted)", fontWeight: '500', fontSize: '11px',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  }}>{children}</th>
)

const TD = ({ children, right, muted, color }) => (
  <td style={{
    padding: '10px 12px', textAlign: right ? 'right' : 'left',
    color: color || (muted ? "var(--text-muted)" : '#f4f4f5'), fontSize: '13px',
  }}>{children}</td>
)

// Small dulled "faction 30%" sub-line shown beneath a per-member amount
const CutLine = ({ value }) => (
  <div style={{ fontSize: '10px', color: "var(--text-faint)", marginTop: '2px', fontWeight: '400' }}>
    30%: {fmt(value * 0.3)}
  </div>
)

export default function CompanySubTab({ factionId }) {
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
      {/* Summary stats */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        {[
          { label: 'Companies',          value: companies.length,                               color: '#f4f4f5' },
          { label: 'API Keys',           value: `${withKey} / ${companies.length}`,             color: withKey === companies.length ? '#4ade80' : '#f97316' },
          { label: 'Principal Invested', value: fmtShort(totalPrincipalPaid),                   color: '#f4f4f5' },
          { label: 'Principal Owing',    value: fmtShort(totalPrincipalOwing),                  color: totalPrincipalOwing > 0 ? '#f97316' : "var(--text-muted)" },
          { label: 'MTD Profit',         value: fmtShort(totalMtd),                             color: '#4ade80' },
          { label: 'Current Month Est.', value: fmtShort(totalEstMonthly),                      color: '#a78bfa' },
          { label: 'Days Tracked',       value: `${daysTracked} / ${daysExpected}`,             color: daysColor },
        ].map(({ label, value, color }) => (
          <div key={label} className="p-4 rounded-lg" style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', minWidth: '130px',
          }}>
            <p style={{ color: "var(--text-secondary)", fontSize: '11px', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
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
            {!coverageOpen && coverage.some(m => m.anyMissing) && (
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
                    {!c.has_api_key && (
                      <div style={{ fontSize: '10px', color: '#f97316', marginTop: '2px' }}>No API key — principal only</div>
                    )}
                  </TD>
                  <TD muted>{c.director_name ?? `#${c.director_id}`}</TD>
                  <TD right>{hasDays ? fmt(c.avg_daily_income) : '—'}</TD>
                  <TD right color={c.daily_wages > 0 ? '#f87171' : "var(--text-muted)"}>{c.has_api_key ? fmt(c.daily_wages) : '—'}</TD>
                  <TD right color={c.daily_advert > 0 ? '#f87171' : "var(--text-muted)"}>{c.has_api_key ? fmt(c.daily_advert) : '—'}</TD>
                  <TD right color={c.avg_daily_profit > 0 ? '#4ade80' : "var(--text-muted)"}>{hasDays ? fmt(c.avg_daily_profit) : '—'}</TD>
                  <TD right color={(c.prev_month_profit ?? 0) > 0 ? '#94a3b8' : "var(--text-muted)"}>
                    {(c.prev_month_profit ?? 0) > 0 ? fmt(c.prev_month_profit) : '—'}
                    {(c.prev_month_profit ?? 0) > 0 && <CutLine value={c.prev_month_profit} />}
                  </TD>
                  <TD right color={hasDays ? '#4ade80' : "var(--text-muted)"}>
                    {hasDays ? fmt(c.mtd_profit) : '—'}
                    {hasDays && <CutLine value={c.mtd_profit} />}
                  </TD>
                  <TD right color={hasDays ? '#60a5fa' : "var(--text-muted)"}>
                    {hasDays ? fmt(c.ytd_profit) : '—'}
                    {hasDays && <CutLine value={c.ytd_profit} />}
                  </TD>
                  <TD right color={hasDays ? '#a78bfa' : "var(--text-muted)"}>
                    {hasDays
                      ? <span title={`${c.month_snapshot_days} day${c.month_snapshot_days === 1 ? '' : 's'} of data`}>{fmt(c.est_monthly)}</span>
                      : '—'}
                    {hasDays && <CutLine value={c.est_monthly} />}
                  </TD>
                  <td style={{ padding: '10px 12px' }}>
                    <button
                      onClick={() => togglePrincipalPaid(c)}
                      disabled={toggling === c.company_id}
                      style={{
                        padding: '3px 10px', borderRadius: '99px', border: 'none', cursor: 'pointer',
                        fontSize: '11px', fontWeight: '600',
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
                Total ({withKey}/{companies.length} with key · {companies.filter(c => c.principal_paid).length}/{companies.length} principal paid)
              </td>
              <TD right color='#94a3b8'>{totalPrevMonth > 0 ? fmt(totalPrevMonth) : '—'}</TD>
              <TD right color='#4ade80'>{fmt(totalMtd)}</TD>
              <TD right color='#60a5fa'>{fmt(totalYtd)}</TD>
              <TD right color='#a78bfa'>{fmt(totalEstMonthly)}</TD>
              <td />
            </tr>
            <tr style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <td colSpan={6} style={{ padding: '6px 12px', color: "var(--text-faint)", fontSize: '11px', fontWeight: '600' }}>
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
    </div>
  )
}
