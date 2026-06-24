import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../../config/api'

const PRINCIPAL = 4_000_000_000

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

const TH = ({ children, right }) => (
  <th style={{
    padding: '8px 12px', textAlign: right ? 'right' : 'left',
    color: '#71717a', fontWeight: '500', fontSize: '11px',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  }}>{children}</th>
)

const TD = ({ children, right, muted, color }) => (
  <td style={{
    padding: '10px 12px', textAlign: right ? 'right' : 'left',
    color: color || (muted ? '#71717a' : '#f4f4f5'), fontSize: '13px',
  }}>{children}</td>
)

export default function CompanySubTab({ factionId }) {
  const [companies, setCompanies]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [addId, setAddId]           = useState('')
  const [adding, setAdding]         = useState(false)
  const [addError, setAddError]     = useState(null)
  const [toggling, setToggling]     = useState(null)
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

  const totalPrincipalPaid   = companies.filter(c => c.principal_paid).length * PRINCIPAL
  const totalPrincipalOwing  = companies.filter(c => !c.principal_paid).length * PRINCIPAL
  const totalMtd             = companies.reduce((s, c) => s + (c.mtd_profit ?? 0), 0)
  const totalEstMonthly      = companies.reduce((s, c) => s + (c.est_monthly ?? 0), 0)
  const totalPrevMonth       = companies.reduce((s, c) => s + (c.prev_month_profit ?? 0), 0)
  const withKey              = companies.filter(c => c.has_api_key).length

  if (loading) return <p style={{ color: '#a1a1aa', fontSize: '13px' }}>Loading…</p>

  return (
    <div>
      {/* Summary stats */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        {[
          { label: 'Companies',          value: companies.length,                               color: '#f4f4f5' },
          { label: 'API Keys',           value: `${withKey} / ${companies.length}`,             color: withKey === companies.length ? '#4ade80' : '#f97316' },
          { label: 'Principal Invested', value: fmtShort(totalPrincipalPaid),                   color: '#f4f4f5' },
          { label: 'Principal Owing',    value: fmtShort(totalPrincipalOwing),                  color: totalPrincipalOwing > 0 ? '#f97316' : '#71717a' },
          { label: 'MTD Profit',           value: fmtShort(totalMtd),          color: '#4ade80' },
          { label: 'Current Month Est.', value: fmtShort(totalEstMonthly),    color: '#a78bfa' },
        ].map(({ label, value, color }) => (
          <div key={label} className="p-4 rounded-lg" style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', minWidth: '130px',
          }}>
            <p style={{ color: '#a1a1aa', fontSize: '11px', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
            <p style={{ color, fontSize: '18px', fontWeight: '700', margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '900px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <TH>Company</TH>
              <TH>Director</TH>
              <TH right>Daily Income</TH>
              <TH right>Wages</TH>
              <TH right>Advert</TH>
              <TH right>Daily Profit</TH>
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
                  <TD right>{c.has_api_key ? fmt(c.daily_income) : '—'}</TD>
                  <TD right color={c.daily_wages > 0 ? '#f87171' : '#71717a'}>{c.has_api_key ? fmt(c.daily_wages) : '—'}</TD>
                  <TD right color={c.daily_advert > 0 ? '#f87171' : '#71717a'}>{c.has_api_key ? fmt(c.daily_advert) : '—'}</TD>
                  <TD right color={c.daily_profit > 0 ? '#4ade80' : '#71717a'}>{c.has_api_key ? fmt(c.daily_profit) : '—'}</TD>
                  <TD right color={(c.prev_month_profit ?? 0) > 0 ? '#94a3b8' : '#71717a'}>{(c.prev_month_profit ?? 0) > 0 ? fmt(c.prev_month_profit) : '—'}</TD>
                  <TD right color={hasDays ? '#4ade80' : '#71717a'}>{hasDays ? fmt(c.mtd_profit) : '—'}</TD>
                  <TD right color={hasDays ? '#60a5fa' : '#71717a'}>{hasDays ? fmt(c.ytd_profit) : '—'}</TD>
                  <TD right color={hasDays ? '#a78bfa' : '#71717a'}>
                    {hasDays
                      ? <span title={`${c.month_snapshot_days} day${c.month_snapshot_days === 1 ? '' : 's'} of data`}>{fmt(c.est_monthly)}</span>
                      : '—'}
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
              <td colSpan={6} style={{ padding: '10px 12px', color: '#a1a1aa', fontSize: '12px', fontWeight: '600' }}>
                Total ({withKey}/{companies.length} with key · {companies.filter(c => c.principal_paid).length}/{companies.length} principal paid)
              </td>
              <TD right color='#94a3b8'>{totalPrevMonth > 0 ? fmt(totalPrevMonth) : '—'}</TD>
              <TD right color='#4ade80'>{fmt(totalMtd)}</TD>
              <TD right color='#60a5fa'>—</TD>
              <TD right color='#a78bfa'>{fmt(totalEstMonthly)}</TD>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Add company */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px' }}>
        <p style={{ color: '#a1a1aa', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
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
        <p style={{ color: '#52525b', fontSize: '11px', marginTop: '8px' }}>
          Adds to the daily company cron. The director must log in to provide their API key for profit data.
        </p>
      </div>

      <p style={{ color: '#52525b', fontSize: '11px', marginTop: '16px' }}>
        Principal: {fmt(PRINCIPAL)} per company · Profit = daily income − wages − advert ·
        MTD / YTD / Prev Month = sum of daily profit snapshots · Current Month Est. = daily average × days in month ·
        Only paid principal counts toward networth
      </p>
    </div>
  )
}
