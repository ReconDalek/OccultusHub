import { useState, useEffect, useMemo, useCallback } from 'react'
import { API_BASE_URL } from '../../../config/api'

const token = () => localStorage.getItem('occultusSession')
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

function buildMonthOptions() {
  const now = new Date()
  const options = []
  for (let i = 0; i < 18; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    options.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 })
  }
  return options
}

function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—'
  return `$${Math.round(n).toLocaleString()}`
}
function fmtUnits(n) {
  if (n == null || isNaN(n)) return '—'
  return Math.round(n).toLocaleString()
}
function fmtShortDate(d) {
  if (!d) return d
  const [, m, day] = d.split('-')
  return `${parseInt(m, 10)}/${parseInt(day, 10)}`
}

const labelStyle = { color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }
const inputStyle = {
  padding: '7px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.06)', color: '#f4f4f5', fontSize: '13px', boxSizing: 'border-box',
}

// ─── Generic small SVG chart — one or two series, line or bar, shared axis/
// tooltip plumbing. Self-contained (no charting library in this project). ────

const CW = 720, CH = 220
const CPAD = { top: 16, right: 16, bottom: 28, left: 56 }
const CIW = CW - CPAD.left - CPAD.right
const CIH = CH - CPAD.top - CPAD.bottom

function MiniChart({ title, dates, series, type = 'line', valueFmt = fmtUnits }) {
  const [tooltip, setTooltip] = useState(null)

  const allValues = series.flatMap(s => s.values).filter(v => v != null)
  const maxVal = Math.max(1, ...allValues, 0)
  const minVal = Math.min(0, ...allValues)
  const range = (maxVal - minVal) || 1

  function xOf(i) {
    if (dates.length <= 1) return CIW / 2
    return (i / (dates.length - 1)) * CIW
  }
  function yOf(v) {
    return CIH - ((v - minVal) / range) * CIH
  }

  const tickCount = 4
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => minVal + (range / tickCount) * i)
  const xLabelStep = Math.max(1, Math.ceil(dates.length / 7))

  if (!dates.length) {
    return (
      <div>
        <p style={{ color: 'var(--text-faint)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{title}</p>
        <p style={{ color: 'var(--text-faint)', fontSize: '13px', padding: '30px 0', textAlign: 'center' }}>No data for this month yet.</p>
      </div>
    )
  }

  const barWidth = type === 'bar' ? Math.max(2, (CIW / dates.length) / (series.length + 1) - 2) : 0

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <p style={{ color: 'var(--text-faint)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{title}</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          {series.map(s => (
            <span key={s.label} style={{ fontSize: '11px', color: s.color }}>● {s.label}</span>
          ))}
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }} onMouseLeave={() => setTooltip(null)}>
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line x1={CPAD.left} y1={CPAD.top + yOf(tick)} x2={CPAD.left + CIW} y2={CPAD.top + yOf(tick)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              <text x={CPAD.left - 8} y={CPAD.top + yOf(tick) + 4} textAnchor="end" fill="#52525b" fontSize="10">
                {Math.abs(tick) >= 1000 ? `${(tick / 1000).toFixed(1)}k` : Math.round(tick)}
              </text>
            </g>
          ))}
          {dates.map((d, i) => (i % xLabelStep === 0 || i === dates.length - 1) && (
            <text key={d} x={CPAD.left + xOf(i)} y={CPAD.top + CIH + 16} textAnchor="middle" fill="#52525b" fontSize="10">
              {fmtShortDate(d)}
            </text>
          ))}

          {type === 'bar' && series.map((s, si) => s.values.map((v, i) => {
            if (v == null) return null
            const x = CPAD.left + xOf(i) - (series.length * barWidth) / 2 + si * barWidth
            const y0 = CPAD.top + yOf(0)
            const y1 = CPAD.top + yOf(v)
            return (
              <rect key={`${si}-${i}`} x={x} y={Math.min(y0, y1)} width={barWidth} height={Math.max(1, Math.abs(y1 - y0))}
                fill={s.color} opacity="0.85" rx="1" />
            )
          }))}

          {type === 'line' && series.map((s, si) => {
            const pts = s.values.map((v, i) => (v == null ? null : `${CPAD.left + xOf(i)},${CPAD.top + yOf(v)}`)).filter(Boolean).join(' ')
            if (!pts) return null
            return <polyline key={si} points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
          })}

          {/* Hit targets for tooltip, one column per date */}
          {dates.map((d, i) => (
            <rect key={`hit-${i}`} x={CPAD.left + xOf(i) - (CIW / dates.length) / 2} y={CPAD.top} width={CIW / dates.length} height={CIH}
              fill="transparent"
              onMouseEnter={() => setTooltip({ x: CPAD.left + xOf(i), date: d, values: series.map(s => ({ label: s.label, color: s.color, value: s.values[i] })) })}
              style={{ cursor: 'crosshair' }}
            />
          ))}

          {tooltip && (
            <line x1={tooltip.x} y1={CPAD.top} x2={tooltip.x} y2={CPAD.top + CIH} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,3" style={{ pointerEvents: 'none' }} />
          )}
        </svg>

        {tooltip && (
          <div style={{
            position: 'absolute', left: `${(tooltip.x / CW) * 100}%`, top: 0, transform: 'translateX(-50%)',
            background: '#1a1a28', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px',
            padding: '6px 10px', fontSize: '11px', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 5,
          }}>
            <div style={{ color: 'var(--text-faint)', marginBottom: '2px' }}>{tooltip.date}</div>
            {tooltip.values.map(v => (
              <div key={v.label} style={{ color: v.color }}>{v.label}: {v.value == null ? '—' : valueFmt(v.value)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Summary stat tile ───────────────────────────────────────────────────────

function StatTile({ label, value, sub, color }) {
  return (
    <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', minWidth: '130px' }}>
      <div style={{ color: 'var(--text-faint)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{label}</div>
      <div style={{ color: color || '#f4f4f5', fontSize: '16px', fontWeight: '600' }}>{value}</div>
      {sub && <div style={{ color: 'var(--text-faint)', fontSize: '11px', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function CompanyAnalyticsTab({ factionId }) {
  const now = new Date()
  const months = buildMonthOptions()

  const [selectedMonth, setSelectedMonth] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 })
  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState(null)
  const [companySearch, setCompanySearch] = useState('')
  const [profitDays, setProfitDays] = useState([])
  const [stockDays, setStockDays] = useState([])
  const [stockItemName, setStockItemName] = useState(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState(null)

  // Company list for the selected month (also carries the month-scoped totals
  // used in the summary tiles) — same endpoint CompanySubTab's history mode uses.
  const loadCompanyList = useCallback(() => {
    setLoadingList(true)
    const params = new URLSearchParams({ year: String(selectedMonth.year), month: String(selectedMonth.month) })
    if (factionId) params.set('faction_id', String(factionId))
    fetch(`${API_BASE_URL}/api/leadership/accounting/companies/history?${params}`, { headers: { Authorization: token() } })
      .then(res => res.json())
      .then(json => {
        const list = json.companies || []
        setCompanies(list)
        setError(null)
        setCompanyId(prev => (prev && list.some(c => c.company_id === prev)) ? prev : (list[0]?.company_id ?? null))
      })
      .catch(e => setError(e.message))
      .finally(() => setLoadingList(false))
  }, [selectedMonth, factionId])

  useEffect(() => { loadCompanyList() }, [loadCompanyList])

  useEffect(() => {
    if (!companyId) { setProfitDays([]); setStockDays([]); return }
    setLoadingDetail(true)
    const params = new URLSearchParams({ year: String(selectedMonth.year), month: String(selectedMonth.month) })
    Promise.all([
      fetch(`${API_BASE_URL}/api/leadership/accounting/companies/${companyId}/breakdown?${params}`, { headers: { Authorization: token() } }).then(r => r.json()),
      fetch(`${API_BASE_URL}/api/leadership/accounting/companies/${companyId}/stock-breakdown?${params}`, { headers: { Authorization: token() } }).then(r => r.json()),
    ])
      .then(([profitJson, stockJson]) => {
        setProfitDays(profitJson.days || [])
        setStockDays(stockJson.days || [])
        setStockItemName(stockJson.item_name ?? null)
        setError(null)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoadingDetail(false))
  }, [companyId, selectedMonth])

  const company = companies.find(c => c.company_id === companyId) || null

  const filteredCompanies = companies.filter(c =>
    companySearch.length === 0 || c.name.toLowerCase().includes(companySearch.toLowerCase())
  )

  // Merge profit + stock rows by date into one table, and build the aligned
  // date axis all three charts share.
  const merged = useMemo(() => {
    const byDate = {}
    for (const d of profitDays) byDate[d.date] = { ...byDate[d.date], ...d }
    for (const d of stockDays) byDate[d.date] = { ...byDate[d.date], ...d, date: d.date }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
  }, [profitDays, stockDays])

  const dates = merged.map(d => d.date)
  const latestStock = [...stockDays].reverse().find(d => d.in_stock != null) || null

  return (
    <div>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '18px', alignItems: 'flex-end' }}>
        <div>
          <label style={labelStyle}>Month</label>
          <select
            value={`${selectedMonth.year}-${selectedMonth.month}`}
            onChange={e => { const [y, m] = e.target.value.split('-').map(Number); setSelectedMonth({ year: y, month: m }) }}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {months.map(({ year, month }) => (
              <option key={`${year}-${month}`} value={`${year}-${month}`}>{MONTHS_FULL[month - 1]} {year}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={labelStyle}>Company</label>
          <input
            placeholder="Search companies…"
            value={companySearch}
            onChange={e => setCompanySearch(e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
      </div>

      {error && (
        <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(255,0,0,0.08)', border: '1px solid rgba(255,0,0,0.2)', marginBottom: '16px' }}>
          <p style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{error}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '18px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Company picker list */}
        <div style={{ width: '220px', flexShrink: 0, maxHeight: '560px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {loadingList ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Loading…</p>
          ) : filteredCompanies.length === 0 ? (
            <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No companies match.</p>
          ) : filteredCompanies.map(c => {
            const active = c.company_id === companyId
            return (
              <button key={c.company_id} onClick={() => setCompanyId(c.company_id)}
                style={{
                  textAlign: 'left', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
                  border: `1px solid ${active ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  background: active ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.02)',
                }}
              >
                <div style={{ color: active ? '#f4f4f5' : 'var(--text-secondary)', fontSize: '13px', fontWeight: active ? '600' : '400' }}>{c.name}</div>
                <div style={{ color: 'var(--text-faint)', fontSize: '11px' }}>{fmtMoney(c.total_profit)} this month</div>
              </button>
            )
          })}
        </div>

        {/* Detail panel */}
        <div style={{ flex: 1, minWidth: '320px' }}>
          {!company ? (
            <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>Select a company to view its analytics.</p>
          ) : (
            <>
              <div style={{ marginBottom: '14px' }}>
                <h3 style={{ color: '#f4f4f5', fontSize: '16px', fontWeight: '600', margin: 0, marginBottom: '2px' }}>{company.name}</h3>
                <p style={{ color: 'var(--text-faint)', fontSize: '11px', margin: 0 }}>
                  Rating {company.rating ?? '—'} · {company.employees_hired ?? '—'}/{company.employees_capacity ?? '—'} employees
                  {!company.has_api_key && ' · no director key on file'}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
                <StatTile label="Profit this month" value={fmtMoney(company.total_profit)} color="#4ade80" sub={`${company.days_tracked} day${company.days_tracked !== 1 ? 's' : ''} tracked`} />
                <StatTile label="Faction cut" value={fmtMoney(company.total_cut)} color="#a78bfa" sub={company.paid ? 'Collected' : 'Not yet collected'} />
                <StatTile label="Avg daily profit" value={fmtMoney(company.avg_daily_profit)} />
                <StatTile label="Avg daily income" value={fmtMoney(company.avg_daily_income)} />
                <StatTile label="Current stock" value={latestStock ? fmtUnits(latestStock.in_stock) : '—'} sub={stockItemName || undefined}
                  color={latestStock && latestStock.in_stock <= 1000 ? '#f87171' : latestStock && latestStock.in_stock >= 9000 ? '#fbbf24' : undefined} />
              </div>

              {loadingDetail ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Loading trends…</p>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                    <MiniChart
                      title="Daily Profit"
                      dates={dates}
                      type="bar"
                      valueFmt={fmtMoney}
                      series={[{ label: 'Profit', color: '#4ade80', values: merged.map(d => d.profit ?? null) }]}
                    />
                    <MiniChart
                      title="Stock Level"
                      dates={dates}
                      type="line"
                      valueFmt={fmtUnits}
                      series={[{ label: 'In Stock', color: '#60a5fa', values: merged.map(d => d.in_stock ?? null) }]}
                    />
                    <MiniChart
                      title="Generated vs Sold"
                      dates={dates}
                      type="bar"
                      valueFmt={fmtUnits}
                      series={[
                        { label: 'Generated', color: '#4ade80', values: merged.map(d => d.generated ?? null) },
                        { label: 'Sold', color: '#f87171', values: merged.map(d => d.sold_amount ?? null) },
                      ]}
                    />
                    <MiniChart
                      title="Income vs Wages + Advert"
                      dates={dates}
                      type="line"
                      valueFmt={fmtMoney}
                      series={[
                        { label: 'Income', color: '#4ade80', values: merged.map(d => d.income ?? null) },
                        { label: 'Wages+Advert', color: '#f87171', values: merged.map(d => (d.wages != null && d.advert != null) ? d.wages + d.advert : null) },
                      ]}
                    />
                  </div>

                  {/* Day-by-day table */}
                  <div className="table-scroll">
                    <div style={{ minWidth: '760px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr 1fr 1fr 90px 90px 90px', gap: '8px', padding: '6px 12px', marginBottom: '4px' }}>
                        {['Date', 'Income', 'Wages', 'Advert', 'Profit', 'Stock', 'Sold', 'Generated'].map(h => (
                          <span key={h} style={{ color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                        ))}
                      </div>
                      {merged.length === 0 ? (
                        <p style={{ color: 'var(--text-faint)', fontSize: '13px', padding: '12px' }}>No tracked days this month.</p>
                      ) : merged.map((d, i) => (
                        <div key={d.date} style={{
                          display: 'grid', gridTemplateColumns: '70px 1fr 1fr 1fr 1fr 90px 90px 90px', gap: '8px', padding: '7px 12px', borderRadius: '6px',
                          background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                        }}>
                          <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>{fmtShortDate(d.date)}</span>
                          <span style={{ color: '#f4f4f5', fontSize: '12px' }}>{d.income != null ? fmtMoney(d.income) : '—'}</span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{d.wages != null ? fmtMoney(d.wages) : '—'}</span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{d.advert != null ? fmtMoney(d.advert) : '—'}</span>
                          <span style={{ color: '#4ade80', fontSize: '12px', fontWeight: '600' }}>{d.profit != null ? fmtMoney(d.profit) : '—'}</span>
                          <span style={{ color: '#60a5fa', fontSize: '12px' }}>{d.in_stock != null ? fmtUnits(d.in_stock) : '—'}</span>
                          <span style={{ color: '#f87171', fontSize: '12px' }}>{d.sold_amount != null ? fmtUnits(d.sold_amount) : '—'}</span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{d.generated != null ? fmtUnits(d.generated) : '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
