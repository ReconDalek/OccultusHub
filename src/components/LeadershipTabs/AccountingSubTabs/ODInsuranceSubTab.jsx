import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../../config/api'

// OD (overdose) item reimbursement overview — browse/search every record the
// Discord bot has logged (auto-detected or manually added via /od_add).
// Read-only: completing/rejecting pending items still happens from the
// Discord tracker, this is just for visibility. Faction scope comes from
// AccountingTab's own faction picker (including "All Factions") rather than
// having a second one here.

const FACTION_LABELS = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' }

const STATUS_OPTIONS = [
  { id: 'all',       label: 'All' },
  { id: 'pending',   label: 'Pending' },
  { id: 'completed', label: 'Completed' },
  { id: 'rejected',  label: 'Rejected' },
]

const STATUS_COLORS = { pending: '#facc15', completed: '#4ade80', rejected: '#f87171' }

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return token ? { Authorization: token } : {}
}

const cardStyle = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px', padding: '12px 14px', marginBottom: '10px',
}

const inputStyle = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#f4f4f5', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', width: '100%', maxWidth: '220px',
  boxSizing: 'border-box',
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

function Tile({ label, value, color }) {
  return (
    <div style={{ ...cardStyle, flex: '1 1 130px', marginBottom: 0 }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ color: color || '#f4f4f5', fontSize: '20px', fontWeight: '600', marginTop: '4px' }}>{value}</div>
    </div>
  )
}

function fmtMoney(n) {
  return `$${Math.round(n || 0).toLocaleString()}`
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusBadge({ status }) {
  return (
    <span style={{ color: STATUS_COLORS[status] || '#f4f4f5', fontWeight: '600', textTransform: 'capitalize', fontSize: '12px' }}>
      {status}
    </span>
  )
}

function MemberLink({ r }) {
  return (
    <a
      href={`https://www.torn.com/profiles.php?XID=${r.torn_user_id}`}
      target="_blank" rel="noopener noreferrer"
      style={{ color: '#f4f4f5', textDecoration: 'none', fontWeight: '600' }}
    >
      {r.username || `#${r.torn_user_id}`}
    </a>
  )
}

// Stacked card, one per record — used under 640px instead of the table.
function RecordCard({ r }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ minWidth: 0 }}>
          <MemberLink r={r} />
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
            {FACTION_LABELS[r.faction_id] || r.faction_id}
          </div>
        </div>
        <StatusBadge status={r.status} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '13px' }}>
        <span style={{ color: '#f4f4f5' }}>{r.item_name} ×{r.quantity}</span>
        <span style={{ color: r.status === 'completed' ? '#4ade80' : 'var(--text-faint)', fontWeight: '600' }}>
          {r.status === 'completed' ? fmtMoney(r.quantity * (r.unit_price_at_completion || 0)) : '—'}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: 'var(--text-faint)' }}>
        <span>Logged {fmtDate(r.logged_at)}</span>
        {r.completed_at && <span>{r.status === 'rejected' ? 'Rejected' : 'Completed'} {fmtDate(r.completed_at)}</span>}
      </div>
      {r.completed_by && (
        <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px' }}>
          by {r.completed_by.split(' (')[0]}
        </div>
      )}
    </div>
  )
}

export default function ODInsuranceSubTab({ factionId }) {
  const [status, setStatus] = useState('all')
  const [itemName, setItemName] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Debounce the free-text search so it doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    const params = new URLSearchParams({ status })
    if (factionId) params.set('faction_id', factionId)
    if (itemName) params.set('item_name', itemName)
    if (search) params.set('search', search)
    if (from) params.set('from', String(Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000)))
    if (to) params.set('to', String(Math.floor(new Date(`${to}T23:59:59Z`).getTime() / 1000)))

    setLoading(true); setError(null)
    fetch(`${API_BASE_URL}/api/leadership/od-reimbursements?${params}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [factionId, status, itemName, search, from, to])

  const rows = data?.reimbursements || []
  const summary = data?.summary || { pending_count: 0, completed_count: 0, rejected_count: 0, completed_value: 0 }
  const hasActiveFilters = status !== 'all' || itemName || searchInput || from || to

  const clearFilters = () => {
    setStatus('all'); setItemName(''); setSearchInput(''); setFrom(''); setTo('')
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <Tile label="Pending" value={summary.pending_count} color="#facc15" />
        <Tile label="Completed" value={summary.completed_count} color="#4ade80" />
        <Tile label="Rejected" value={summary.rejected_count} color="#f87171" />
        <Tile label="Completed Value" value={fmtMoney(summary.completed_value)} color="#4ade80" />
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div>
          <label style={labelStyle}>Status</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {STATUS_OPTIONS.map(s => (
              <button key={s.id} onClick={() => setStatus(s.id)} style={pillStyle(status === s.id)}>{s.label}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: isMobile ? '1 1 140px' : '0 0 auto' }}>
          <label style={labelStyle}>Item</label>
          <select style={{ ...inputStyle, maxWidth: isMobile ? 'none' : '160px' }} value={itemName} onChange={e => setItemName(e.target.value)}>
            <option value="">All items</option>
            {(data?.items || []).map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        <div style={{ flex: isMobile ? '1 1 180px' : '0 0 auto' }}>
          <label style={labelStyle}>Search member</label>
          <input
            style={{ ...inputStyle, maxWidth: isMobile ? 'none' : '220px' }}
            placeholder="Name or Torn ID"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>

        <div style={{ flex: isMobile ? '1 1 130px' : '0 0 auto' }}>
          <label style={labelStyle}>From</label>
          <input type="date" style={{ ...inputStyle, maxWidth: isMobile ? 'none' : '150px' }} value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} />
        </div>
        <div style={{ flex: isMobile ? '1 1 130px' : '0 0 auto' }}>
          <label style={labelStyle}>To</label>
          <input type="date" style={{ ...inputStyle, maxWidth: isMobile ? 'none' : '150px' }} value={to} min={from || undefined} onChange={e => setTo(e.target.value)} />
        </div>

        {hasActiveFilters && (
          <button onClick={clearFilters} style={{ ...pillStyle(false), alignSelf: 'center' }}>
            Clear filters
          </button>
        )}
      </div>

      {loading && !data && <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>Loading…</p>}
      {error && <p style={{ color: '#f87171', fontSize: '13px' }}>Error: {error}</p>}

      {data && (
        rows.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No reimbursements match these filters.</p>
        ) : isMobile ? (
          <div>
            {rows.map(r => <RecordCard key={r.id} r={r} />)}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left' }}>
                  {['Member', 'Faction', 'Item', 'Qty', 'Status', 'Value', 'Logged', 'Completed', 'By'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontWeight: '500', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      <MemberLink r={r} />
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {FACTION_LABELS[r.faction_id] || r.faction_id}
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{r.item_name}</td>
                    <td style={{ padding: '8px 10px' }}>{r.quantity}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <StatusBadge status={r.status} />
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      {r.status === 'completed' ? fmtMoney(r.quantity * (r.unit_price_at_completion || 0)) : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(r.logged_at)}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(r.completed_at)}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-faint)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      {(r.completed_by || '').split(' (')[0] || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
