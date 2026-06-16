import { useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE_URL } from '../../config/api'

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return { Authorization: token }
}

const LEVEL_COLORS = {
  info:  { bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.3)',  text: '#818cf8' },
  warn:  { bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.3)',  text: '#fbbf24' },
  error: { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.3)',   text: '#f87171' },
}

const CATEGORY_LABELS = {
  api_call:  'API Call',
  api_error: 'API Error',
  auth:      'Auth',
  cron:      'Cron',
  game:      'Game',
  admin:     'Admin',
  error:     'Error',
}

function ts(unix) {
  const d = new Date(unix * 1000)
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

function MetaBlock({ meta }) {
  if (!meta) return null
  return (
    <pre style={{
      marginTop: '6px', padding: '8px 10px',
      background: 'rgba(0,0,0,0.3)', borderRadius: '6px',
      fontSize: '11px', color: '#71717a', overflowX: 'auto',
      maxHeight: '160px', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
    }}>
      {JSON.stringify(meta, null, 2)}
    </pre>
  )
}

function LogRow({ log }) {
  const [expanded, setExpanded] = useState(false)
  const lc = LEVEL_COLORS[log.level] || LEVEL_COLORS.info
  const hasDetail = log.torn_user_id || log.faction_id || log.meta

  return (
    <div
      onClick={() => hasDetail && setExpanded(e => !e)}
      style={{
        padding: '10px 14px',
        borderRadius: '8px',
        border: `1px solid ${expanded ? lc.border : 'rgba(255,255,255,0.05)'}`,
        background: expanded ? lc.bg : 'rgba(255,255,255,0.02)',
        cursor: hasDetail ? 'pointer' : 'default',
        marginBottom: '4px',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* Main row */}
      <div style={{ display: 'grid', gridTemplateColumns: '160px 90px 110px 1fr auto', gap: '10px', alignItems: 'center' }}>
        <span style={{ color: '#52525b', fontSize: '11px', fontFamily: 'monospace' }}>{ts(log.created_at)}</span>

        <span style={{
          padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
          background: lc.bg, border: `1px solid ${lc.border}`, color: lc.text, textAlign: 'center',
        }}>
          {log.level.toUpperCase()}
        </span>

        <span style={{
          padding: '2px 7px', borderRadius: '4px', fontSize: '11px',
          background: 'rgba(255,255,255,0.05)', color: '#a1a1aa', textAlign: 'center',
        }}>
          {CATEGORY_LABELS[log.category] || log.category}
        </span>

        <div style={{ minWidth: 0 }}>
          <span style={{ color: '#e4e4e7', fontSize: '13px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {log.message}
          </span>
          <span style={{ color: '#3f3f46', fontSize: '11px' }}>{log.event}</span>
        </div>

        {hasDetail && (
          <span style={{ color: '#52525b', fontSize: '12px', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: log.meta ? '8px' : 0 }}>
            {log.username && (
              <span style={{ color: '#a1a1aa', fontSize: '12px' }}>
                User: <span style={{ color: '#f4f4f5' }}>{log.username}</span>
                {log.torn_user_id && <span style={{ color: '#52525b' }}> (#{log.torn_user_id})</span>}
              </span>
            )}
            {log.faction_id && (
              <span style={{ color: '#a1a1aa', fontSize: '12px' }}>
                Faction: <span style={{ color: '#f4f4f5' }}>{log.faction_id}</span>
              </span>
            )}
          </div>
          <MetaBlock meta={log.meta} />
        </div>
      )}
    </div>
  )
}

export default function LogsTab() {
  const [logs,       setLogs]       = useState([])
  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [hasMore,    setHasMore]    = useState(false)
  const [error,      setError]      = useState(null)

  const [filterCat,    setFilterCat]    = useState('')
  const [filterLevel,  setFilterLevel]  = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const cursorRef = useRef(null) // created_at of last row for pagination

  const fetchLogs = useCallback(async ({ append = false } = {}) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (filterCat)    params.set('category', filterCat)
      if (filterLevel)  params.set('level',    filterLevel)
      if (filterSearch) params.set('search',   filterSearch)
      if (append && cursorRef.current) params.set('before', cursorRef.current)

      const res = await fetch(`${API_BASE_URL}/api/admin/logs?${params}`, { headers: authHeaders() })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)

      setCategories(json.categories || [])
      setHasMore(json.hasMore)
      const newLogs = json.logs || []

      if (append) {
        setLogs(prev => [...prev, ...newLogs])
      } else {
        setLogs(newLogs)
      }

      if (newLogs.length) {
        cursorRef.current = newLogs[newLogs.length - 1].created_at
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filterCat, filterLevel, filterSearch])

  // Reload when filters change
  useEffect(() => {
    cursorRef.current = null
    fetchLogs()
  }, [filterCat, filterLevel, filterSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  const inputStyle = {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', color: '#f4f4f5', padding: '7px 12px', fontSize: '13px',
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontFamily: 'Cinzel, serif', color: '#f4f4f5', fontSize: '18px', letterSpacing: '1px', margin: '0 0 4px 0' }}>
          System Logs
        </h2>
        <p style={{ color: '#a1a1aa', fontSize: '13px', margin: 0 }}>
          All site events — API calls, auth, cron jobs, errors. API keys are never stored; users are identified by name/ID only.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search message, event, user..."
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          style={{ ...inputStyle, minWidth: '220px' }}
        />

        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="">All categories</option>
          {categories.map(c => (
            <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
          ))}
        </select>

        <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="">All levels</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>

        <button
          onClick={() => { cursorRef.current = null; fetchLogs(); }}
          style={{
            padding: '7px 16px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#f4f4f5', fontSize: '13px', cursor: 'pointer',
          }}
        >
          Refresh
        </button>

        {(filterCat || filterLevel || filterSearch) && (
          <button
            onClick={() => { setFilterCat(''); setFilterLevel(''); setFilterSearch(''); }}
            style={{
              padding: '7px 12px', borderRadius: '8px',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
              color: '#71717a', fontSize: '12px', cursor: 'pointer',
            }}
          >
            Clear filters
          </button>
        )}

        {!loading && <span style={{ color: '#52525b', fontSize: '12px', marginLeft: 'auto' }}>{logs.length} entries</span>}
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '160px 90px 110px 1fr',
        gap: '10px', padding: '4px 14px 8px', marginBottom: '4px',
      }}>
        {['Timestamp (UTC)', 'Level', 'Category', 'Message / Event'].map(h => (
          <span key={h} style={{ color: '#52525b', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
        ))}
      </div>

      {/* Log rows */}
      {error && (
        <div style={{ padding: '14px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', marginBottom: '12px' }}>
          <p style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{error}</p>
        </div>
      )}

      {loading && !logs.length && (
        <div style={{ padding: '48px', textAlign: 'center', color: '#52525b', fontSize: '14px' }}>Loading…</div>
      )}

      {!loading && !logs.length && !error && (
        <div style={{ padding: '48px', textAlign: 'center', color: '#52525b', fontSize: '14px' }}>No logs found.</div>
      )}

      {logs.map(log => <LogRow key={log.id} log={log} />)}

      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button
            onClick={() => fetchLogs({ append: true })}
            disabled={loading}
            style={{
              padding: '9px 24px', borderRadius: '8px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: loading ? '#52525b' : '#a1a1aa', fontSize: '13px', cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
