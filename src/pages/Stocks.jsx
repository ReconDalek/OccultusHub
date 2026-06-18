import { useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE_URL } from '../config/api'
import { TORN_STOCKS } from '../components/LeadershipTabs/AccountingSubTabs/StocksSubTab'

const token = () => localStorage.getItem('occultusSession')

function fmt(n) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function pct(n) {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function pctColor(n) {
  if (n == null || n === 0) return '#a0a0b0'
  return n > 0 ? '#4ade80' : '#f87171'
}

function SparkLine({ history, width = 120, height = 36 }) {
  if (!history || history.length < 2) {
    return <svg width={width} height={height}><text x="4" y="22" fill="#555" fontSize="10">No data</text></svg>
  }
  const prices = history.map(h => h.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * width
    const y = height - 4 - ((p - min) / range) * (height - 8)
    return `${x},${y}`
  }).join(' ')
  const start = prices[0]
  const end = prices[prices.length - 1]
  const color = end >= start ? '#4ade80' : '#f87171'
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function FullChart({ history, width = 500, height = 160 }) {
  if (!history || history.length < 2) {
    return <div style={{ color: '#555', fontSize: 13, padding: '20px 0' }}>No price history yet. Charts populate hourly.</div>
  }
  const prices = history.map(h => h.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const pad = { top: 16, right: 16, bottom: 28, left: 60 }
  const w = width - pad.left - pad.right
  const h = height - pad.top - pad.bottom
  const pts = prices.map((p, i) => {
    const x = pad.left + (i / (prices.length - 1)) * w
    const y = pad.top + h - ((p - min) / range) * h
    return `${x},${y}`
  }).join(' ')
  const start = prices[0]
  const end = prices[prices.length - 1]
  const color = end >= start ? '#4ade80' : '#f87171'

  // Y-axis labels
  const yLabels = [min, min + range * 0.25, min + range * 0.5, min + range * 0.75, max]
  // X-axis labels — first, mid, last
  const xLabels = [0, Math.floor(prices.length / 2), prices.length - 1].map(i => ({
    i,
    label: history[i]?.recorded_at ? new Date(history[i].recorded_at).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
  }))

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
      {/* Grid lines */}
      {yLabels.map((val, i) => {
        const y = pad.top + h - ((val - min) / range) * h
        return (
          <g key={i}>
            <line x1={pad.left} y1={y} x2={pad.left + w} y2={y} stroke="#2a2a3a" strokeWidth="1" />
            <text x={pad.left - 6} y={y + 4} textAnchor="end" fill="#777" fontSize="9">{fmt(val)}</text>
          </g>
        )
      })}
      {/* X labels */}
      {xLabels.map(({ i, label }) => {
        const x = pad.left + (i / (prices.length - 1)) * w
        return <text key={i} x={x} y={height - 4} textAnchor="middle" fill="#666" fontSize="8">{label}</text>
      })}
      {/* Price line */}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {/* First / last dot */}
      {[0, prices.length - 1].map(i => {
        const x = pad.left + (i / (prices.length - 1)) * w
        const y = pad.top + h - ((prices[i] - min) / range) * h
        return <circle key={i} cx={x} cy={y} r="3" fill={color} />
      })}
    </svg>
  )
}

function SignalBadge({ signal }) {
  const colors = { BUY: '#4ade80', SELL: '#f87171', HOLD: '#a0a0b0' }
  const c = colors[signal] || '#a0a0b0'
  return (
    <span style={{ background: c + '22', color: c, border: `1px solid ${c}55`, borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
      {signal}
    </span>
  )
}

function computeSignal(history, perf) {
  if (!history || history.length < 5) return 'HOLD'
  const prices = history.map(h => h.price)
  const recent = prices.slice(-5)
  const trend = recent[recent.length - 1] - recent[0]
  const dayPct = perf?.last_day ?? 0
  if (dayPct > 1.5 && trend > 0) return 'BUY'
  if (dayPct < -1.5 && trend < 0) return 'SELL'
  return 'HOLD'
}

function StockRow({ apiStock, localStock, onExpand, expanded, detail, detailLoading }) {
  const perf = apiStock?.chart?.performance
  const history = detail?.history || []
  const price = apiStock?.market?.price ?? 0
  const signal = computeSignal(history, perf)

  return (
    <>
      <tr
        onClick={onExpand}
        style={{ cursor: 'pointer', borderBottom: '1px solid #1e1e2e', transition: 'background 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = '#14141f'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <td style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 220 }}>
          <img src={localStock?.logo} alt={apiStock?.acronym} style={{ width: 28, height: 28, borderRadius: 4, background: '#1a1a2e', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
          <div>
            <div style={{ fontWeight: 700, color: '#f4f4f5', fontSize: 13 }}>{apiStock?.acronym}</div>
            <div style={{ color: '#666', fontSize: 11 }}>{apiStock?.name || localStock?.name}</div>
          </div>
        </td>
        <td style={{ padding: '10px 12px', color: '#f4f4f5', fontFamily: 'monospace', fontSize: 13 }}>{fmt(price)}</td>
        <td style={{ padding: '10px 12px', color: pctColor(perf?.last_hour), fontFamily: 'monospace', fontSize: 12 }}>{pct(perf?.last_hour)}</td>
        <td style={{ padding: '10px 12px', color: pctColor(perf?.last_day), fontFamily: 'monospace', fontSize: 12 }}>{pct(perf?.last_day)}</td>
        <td style={{ padding: '10px 12px', color: pctColor(perf?.last_week), fontFamily: 'monospace', fontSize: 12 }}>{pct(perf?.last_week)}</td>
        <td style={{ padding: '10px 12px', color: pctColor(perf?.last_month), fontFamily: 'monospace', fontSize: 12 }}>{pct(perf?.last_month)}</td>
        <td style={{ padding: '10px 12px' }}>
          <SparkLine history={history} />
        </td>
        <td style={{ padding: '10px 12px' }}><SignalBadge signal={signal} /></td>
        <td style={{ padding: '10px 12px', color: '#555', fontSize: 11 }}>{apiStock?.bonus?.requirement?.toLocaleString() ?? '—'} shares</td>
        <td style={{ padding: '10px 12px', color: '#888', fontSize: 11 }}>{localStock?.frequency === 7 ? '7-day' : '28-day'}</td>
        <td style={{ padding: '10px 12px', color: '#555', fontSize: 18 }}>{expanded ? '▲' : '▼'}</td>
      </tr>
      {expanded && (
        <tr style={{ background: '#0d0d18', borderBottom: '1px solid #1e1e2e' }}>
          <td colSpan={11} style={{ padding: '16px 20px' }}>
            {detailLoading ? (
              <div style={{ color: '#555' }}>Loading history...</div>
            ) : (
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 300px', minWidth: 260 }}>
                  <div style={{ color: '#888', fontSize: 11, marginBottom: 8, fontWeight: 600, letterSpacing: 1 }}>PRICE HISTORY</div>
                  <FullChart history={history} width={500} height={160} />
                  <div style={{ color: '#444', fontSize: 10, marginTop: 4 }}>Hourly snapshots — up to 90 days stored</div>
                </div>
                <div style={{ flex: '0 0 200px' }}>
                  <div style={{ color: '#888', fontSize: 11, marginBottom: 8, fontWeight: 600, letterSpacing: 1 }}>PERFORMANCE</div>
                  {[
                    ['1 Hour', perf?.last_hour],
                    ['1 Day', perf?.last_day],
                    ['1 Week', perf?.last_week],
                    ['1 Month', perf?.last_month],
                    ['1 Year', perf?.last_year],
                    ['All Time', perf?.all_time],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #1a1a2e', fontSize: 12 }}>
                      <span style={{ color: '#777' }}>{label}</span>
                      <span style={{ color: pctColor(val), fontFamily: 'monospace' }}>{pct(val)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ flex: '0 0 220px' }}>
                  <div style={{ color: '#888', fontSize: 11, marginBottom: 8, fontWeight: 600, letterSpacing: 1 }}>BONUS</div>
                  <div style={{ fontSize: 12, color: '#aaa', lineHeight: 1.6 }}>
                    <div><span style={{ color: '#666' }}>Requires:</span> {apiStock?.bonus?.requirement?.toLocaleString() ?? '—'} shares</div>
                    <div><span style={{ color: '#666' }}>Frequency:</span> {localStock?.frequency === 7 ? 'Weekly' : 'Monthly'}</div>
                    <div style={{ marginTop: 6, color: '#888' }}>{apiStock?.bonus?.description || '—'}</div>
                  </div>
                  <div style={{ marginTop: 16, padding: '10px 12px', background: '#0a0a14', border: '1px solid #1e1e2e', borderRadius: 6 }}>
                    <div style={{ color: '#888', fontSize: 11, marginBottom: 4, fontWeight: 600, letterSpacing: 1 }}>SIGNAL</div>
                    <SignalBadge signal={signal} />
                    <div style={{ color: '#444', fontSize: 10, marginTop: 6 }}>
                      Based on recent trend & 24h performance. Not financial advice.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export default function Stocks() {
  const [stocks, setStocks] = useState([])
  const [fetchedAt, setFetchedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [details, setDetails] = useState({})
  const [detailLoading, setDetailLoading] = useState({})
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('acronym')
  const [sortDir, setSortDir] = useState(1)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/stocks`, {
          headers: { Authorization: token() },
        })
        if (!res.ok) throw new Error(`${res.status}`)
        const data = await res.json()
        const arr = Array.isArray(data.stocks) ? data.stocks : Object.values(data.stocks || {})
        setStocks(arr)
        setFetchedAt(data.fetched_at)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const loadDetail = useCallback(async (stockId) => {
    if (details[stockId] || detailLoading[stockId]) return
    setDetailLoading(d => ({ ...d, [stockId]: true }))
    try {
      const res = await fetch(`${API_BASE_URL}/api/stocks/${stockId}`, {
        headers: { Authorization: token() },
      })
      const data = await res.json()
      setDetails(d => ({ ...d, [stockId]: data }))
    } catch (_) {}
    setDetailLoading(d => ({ ...d, [stockId]: false }))
  }, [details, detailLoading])

  const handleExpand = (stockId) => {
    const next = expandedId === stockId ? null : stockId
    setExpandedId(next)
    if (next) loadDetail(next)
  }

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(1) }
  }

  // Merge API data with local TORN_STOCKS for logos/names
  const merged = stocks.map(apiS => ({
    apiStock: apiS,
    localStock: TORN_STOCKS.find(l => l.id === apiS.id) || TORN_STOCKS.find(l => l.acronym === apiS.acronym),
  })).filter(({ apiStock, localStock }) => {
    const q = search.toLowerCase()
    return !q || (apiStock?.acronym?.toLowerCase().includes(q) || (apiStock?.name || localStock?.name || '').toLowerCase().includes(q))
  }).sort((a, b) => {
    const get = (item) => {
      if (sortKey === 'price') return item.apiStock?.market?.price ?? 0
      if (sortKey === 'day') return item.apiStock?.chart?.performance?.last_day ?? 0
      if (sortKey === 'week') return item.apiStock?.chart?.performance?.last_week ?? 0
      if (sortKey === 'month') return item.apiStock?.chart?.performance?.last_month ?? 0
      return item.apiStock?.acronym ?? ''
    }
    const av = get(a), bv = get(b)
    return av < bv ? -sortDir : av > bv ? sortDir : 0
  })

  const SortTh = ({ col, label }) => (
    <th
      onClick={() => handleSort(col)}
      style={{ padding: '10px 12px', color: sortKey === col ? '#9d6ef9' : '#555', cursor: 'pointer', userSelect: 'none', fontSize: 11, fontWeight: 600, letterSpacing: 1, whiteSpace: 'nowrap' }}
    >
      {label}{sortKey === col ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  )

  if (loading) return (
    <div style={{ color: '#f4f4f5', padding: '60px 20px', textAlign: 'center' }}>
      Loading stock market data...
    </div>
  )

  if (error) return (
    <div style={{ color: '#f87171', padding: '60px 20px', textAlign: 'center' }}>
      {error === '503' ? 'Stock data is not yet cached. The worker refreshes every 5 minutes.' : `Error: ${error}`}
    </div>
  )

  return (
    <div style={{ color: '#f4f4f5', padding: '24px 20px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#f4f4f5' }}>Torn Stock Market</h1>
          {fetchedAt && (
            <div style={{ color: '#555', fontSize: 11, marginTop: 4 }}>
              Last updated: {new Date(fetchedAt).toLocaleString()} · Prices refresh every 5 min
            </div>
          )}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search stocks..."
          style={{ background: '#0d0d18', border: '1px solid #2a2a3a', borderRadius: 6, padding: '8px 12px', color: '#f4f4f5', fontSize: 13, width: 200 }}
        />
      </div>

      <div style={{ background: '#0d0d18', border: '1px solid #1e1e2e', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2a3a', background: '#07070a' }}>
                <SortTh col="acronym" label="STOCK" />
                <SortTh col="price" label="PRICE" />
                <th style={{ padding: '10px 12px', color: '#555', fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>1H</th>
                <SortTh col="day" label="1D" />
                <SortTh col="week" label="1W" />
                <SortTh col="month" label="1M" />
                <th style={{ padding: '10px 12px', color: '#555', fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>CHART</th>
                <th style={{ padding: '10px 12px', color: '#555', fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>SIGNAL</th>
                <th style={{ padding: '10px 12px', color: '#555', fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>BONUS REQ</th>
                <th style={{ padding: '10px 12px', color: '#555', fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>FREQ</th>
                <th style={{ padding: '10px 12px', width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {merged.length === 0 && (
                <tr><td colSpan={11} style={{ padding: 32, textAlign: 'center', color: '#555' }}>No stocks found.</td></tr>
              )}
              {merged.map(({ apiStock, localStock }) => (
                <StockRow
                  key={apiStock.id}
                  apiStock={apiStock}
                  localStock={localStock}
                  expanded={expandedId === apiStock.id}
                  onExpand={() => handleExpand(apiStock.id)}
                  detail={details[apiStock.id]}
                  detailLoading={!!detailLoading[apiStock.id]}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 12, color: '#3a3a4a', fontSize: 11, textAlign: 'right' }}>
        Buy/Sell signals are algorithmic suggestions based on recent price trends and 24h performance. They do not constitute financial advice.
      </div>
    </div>
  )
}
