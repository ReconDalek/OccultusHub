import { useState, useEffect, useCallback, useMemo } from 'react'
import { API_BASE_URL } from '../../config/api'

const FACTION_LABEL = { 33097: 'Occ1', 9728: 'Occ2', 9171: 'Occ3' }

const BOARD_TYPES = [
  { id: 'faction', label: 'Faction' },
  { id: 'social',   label: 'Social' },
  { id: 'event',    label: 'Event' },
  { id: 'mug',      label: 'Mug' },
]

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return token ? { Authorization: token } : {}
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GB')
}

function monthLabel(year, month) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

// Last 15 months including the current one, most recent first — no hard
// data-availability cutoff (an empty result for an unconfigured/no-data
// month is self-evident from the table).
function buildMonthOptions() {
  const now = new Date()
  const options = []
  for (let i = 0; i < 15; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    options.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 })
  }
  return options
}

export default function LeaderboardsSection() {
  const [activeType, setActiveType] = useState('faction')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const [statKey, setStatKey] = useState('')
  const [monthKey, setMonthKey] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [togglingActive, setTogglingActive] = useState(false)

  const monthOptions = useMemo(buildMonthOptions, [])

  const load = useCallback(() => {
    const controller = new AbortController()
    setLoading(true); setError(null)
    fetch(`${API_BASE_URL}/api/leadership/leaderboards`, { headers: authHeaders(), signal: controller.signal })
      .then(r => r.json().then(json => ({ r, json })))
      .then(({ r, json }) => {
        if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`)
        setData(json)
      })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  useEffect(() => { const cleanup = load(); return cleanup }, [load])

  // Sync the config form to whichever board is active whenever fresh data arrives.
  useEffect(() => {
    if (!data) return
    const config = data.configs?.[activeType]
    setStatKey(config?.stat_key || '')
    setMonthKey(config?.year && config?.month ? `${config.year}-${config.month}` : '')
    setSaveError(null)
  }, [data, activeType])

  const saveConfig = async () => {
    if (!statKey || !monthKey) { setSaveError('Pick a stat and a month'); return }
    const [year, month] = monthKey.split('-').map(Number)
    setSaving(true); setSaveError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/leaderboards/${activeType}`, {
        method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ stat_key: statKey, year, month }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      load()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async () => {
    const nextActive = !(config?.active ?? true)
    setTogglingActive(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/leaderboards/${activeType}/active`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Toggle failed')
      load()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setTogglingActive(false)
    }
  }

  // Group available stats by category for the <optgroup> picker.
  const statsByCategory = useMemo(() => {
    const groups = {}
    for (const s of data?.available_stats || []) {
      if (!groups[s.category]) groups[s.category] = []
      groups[s.category].push(s)
    }
    return groups
  }, [data])

  const board = data?.leaderboards?.[activeType]
  const config = data?.configs?.[activeType]
  const isActive = !!(config?.active ?? true)
  const isConfigured = !!(config?.stat_key && config?.year && config?.month)

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {BOARD_TYPES.map(b => (
          <button
            key={b.id}
            onClick={() => setActiveType(b.id)}
            style={{
              padding: '7px 18px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
              border: `1px solid ${activeType === b.id ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
              background: activeType === b.id ? 'rgba(179,18,63,0.15)' : 'rgba(255,255,255,0.04)',
              color: activeType === b.id ? '#f4f4f5' : "var(--text-secondary)",
              fontWeight: activeType === b.id ? '600' : '400',
            }}
          >
            {b.label}
          </button>
        ))}
      </div>

      {error && <p style={{ color: '#f87171', fontSize: '13px' }}>{error}</p>}

      {loading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: '13px', padding: '20px 0' }}>Loading…</p>
      ) : (
        <>
          {/* Config panel */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <p style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                What this leaderboard tracks
              </p>
              <button
                onClick={toggleActive}
                disabled={togglingActive}
                title={isActive ? 'Disable this leaderboard' : 'Enable this leaderboard'}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px 4px 4px', borderRadius: '999px',
                  border: `1px solid ${isActive ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.12)'}`,
                  background: isActive ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.04)',
                  cursor: togglingActive ? 'not-allowed' : 'pointer', opacity: togglingActive ? 0.6 : 1,
                }}
              >
                <span style={{
                  width: '30px', height: '16px', borderRadius: '999px', position: 'relative', flexShrink: 0,
                  background: isActive ? '#4ade80' : 'rgba(255,255,255,0.15)', transition: 'background 0.15s',
                }}>
                  <span style={{
                    position: 'absolute', top: '2px', left: isActive ? '16px' : '2px',
                    width: '12px', height: '12px', borderRadius: '50%', background: '#0a0a0b', transition: 'left 0.15s',
                  }} />
                </span>
                <span style={{ fontSize: '11px', fontWeight: '600', color: isActive ? '#4ade80' : "var(--text-secondary)" }}>
                  {isActive ? 'Active' : 'Disabled'}
                </span>
              </button>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ color: "var(--text-muted)", fontSize: '10px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Stat</label>
                <select
                  value={statKey}
                  onChange={e => setStatKey(e.target.value)}
                  style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', color: '#f4f4f5', padding: '7px 12px', fontSize: '13px', cursor: 'pointer',
                    minWidth: '220px',
                  }}
                >
                  <option value="" style={{ background: '#18181b', color: '#f4f4f5' }}>Select a stat…</option>
                  {Object.entries(statsByCategory).map(([category, stats]) => (
                    <optgroup key={category} label={category} style={{ background: '#18181b', color: '#a78bfa' }}>
                      {stats.map(s => (
                        <option key={s.key} value={s.key} style={{ background: '#18181b', color: '#f4f4f5' }}>{s.label}</option>
                      ))}
                    </optgroup>
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
                  <option value="">Select a month…</option>
                  {monthOptions.map(({ year, month }) => (
                    <option key={`${year}-${month}`} value={`${year}-${month}`}>{monthLabel(year, month)}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={saveConfig}
                disabled={saving}
                style={{
                  padding: '7px 20px', borderRadius: '8px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, #b3123f, #6d28d9)', color: '#fff', fontSize: '13px', fontWeight: '600',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>

              {saveError && <span style={{ color: '#f87171', fontSize: '12px' }}>{saveError}</span>}
            </div>
          </div>

          {/* Results */}
          {!isConfigured ? (
            <div style={{ padding: '48px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ color: "var(--text-faint)", fontSize: '14px', margin: 0 }}>This leaderboard isn't configured yet — pick a stat and month above.</p>
            </div>
          ) : !isActive ? (
            <div style={{ padding: '48px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ color: "var(--text-faint)", fontSize: '14px', margin: 0 }}>This leaderboard is disabled — flip the toggle above to run it again.</p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '12px' }}>
                <span style={{ color: "var(--text-faint)", fontSize: '12px' }}>
                  Tracking <span style={{ color: "var(--text-secondary)" }}>{board?.stat?.label}</span> gained during{' '}
                  <span style={{ color: "var(--text-secondary)" }}>{monthLabel(config.year, config.month)}</span>
                </span>
              </div>

              {!board?.entries?.length ? (
                <div style={{ padding: '48px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ color: "var(--text-faint)", fontSize: '14px', margin: 0 }}>No gains recorded for this stat/month yet.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: '480px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 140px', gap: '8px', padding: '6px 12px', marginBottom: '4px' }}>
                      {['#', 'Member', 'Gained'].map(h => (
                        <span key={h} style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                      ))}
                    </div>
                    {board.entries.map((e, i) => (
                      <div
                        key={e.torn_user_id}
                        style={{
                          display: 'grid', gridTemplateColumns: '40px 1fr 140px', alignItems: 'center',
                          gap: '8px', padding: '9px 12px', borderRadius: '8px',
                          background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                        }}
                      >
                        <span style={{ color: "var(--text-faint)", fontSize: '12px', textAlign: 'right' }}>{i + 1}</span>
                        <span style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '500' }}>
                          {e.username}
                          {FACTION_LABEL[e.faction_id] && (
                            <span style={{ marginLeft: '6px', color: "var(--text-faint)", fontSize: '11px', fontWeight: '400' }}>{FACTION_LABEL[e.faction_id]}</span>
                          )}
                        </span>
                        <span style={{ color: '#a78bfa', fontSize: '13px', fontWeight: '700' }}>{fmt(e.gained)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
