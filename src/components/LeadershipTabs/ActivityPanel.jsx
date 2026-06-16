import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../config/api'

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return { Authorization: token }
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GB')
}

function monthLabel(year, month) {
  return new Date(Date.UTC(year, month, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function buildMonthOptions() {
  const now = new Date()
  const options = []
  for (let i = 0; i < 18; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    options.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() })
  }
  return options
}

// ─── Period picker ─────────────────────────────────────────────────────────────

function PeriodPicker({ mode, setMode, selectedMonth, setSelectedMonth, customFrom, setCustomFrom, customTo, setCustomTo, onApply }) {
  const months = buildMonthOptions()
  const now = new Date()

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '24px' }}>
      {['month', 'custom'].map(m => (
        <button
          key={m}
          onClick={() => setMode(m)}
          style={{
            padding: '7px 16px',
            borderRadius: '8px',
            border: `1px solid ${mode === m ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
            background: mode === m ? 'rgba(179,18,63,0.15)' : 'transparent',
            color: mode === m ? '#f4f4f5' : '#a1a1aa',
            fontSize: '13px',
            fontWeight: mode === m ? '600' : '400',
            cursor: 'pointer',
          }}
        >
          {m === 'month' ? 'By Month' : 'Custom Range'}
        </button>
      ))}

      {mode === 'month' && (
        <select
          value={`${selectedMonth.year}-${selectedMonth.month}`}
          onChange={e => {
            const [y, mo] = e.target.value.split('-').map(Number)
            setSelectedMonth({ year: y, month: mo })
          }}
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', color: '#f4f4f5', padding: '7px 12px', fontSize: '13px', cursor: 'pointer',
          }}
        >
          {months.map(({ year, month }) => {
            const isCurrent = year === now.getUTCFullYear() && month === now.getUTCMonth()
            return (
              <option key={`${year}-${month}`} value={`${year}-${month}`}>
                {monthLabel(year, month)}{isCurrent ? ' (current)' : ''}
              </option>
            )
          })}
        </select>
      )}

      {mode === 'custom' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ color: '#71717a', fontSize: '10px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>From (UTC)</label>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px', color: '#f4f4f5', padding: '6px 10px', fontSize: '13px',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ color: '#71717a', fontSize: '10px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>To (UTC)</label>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px', color: '#f4f4f5', padding: '6px 10px', fontSize: '13px',
              }}
            />
          </div>
        </>
      )}

      <button
        onClick={onApply}
        style={{
          padding: '7px 20px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
          border: 'none', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
        }}
      >
        Load
      </button>
    </div>
  )
}

// ─── Energy table ─────────────────────────────────────────────────────────────

function EnergyTable({ members }) {
  const maxEnergy = members[0]?.energy || 1

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: '540px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '30px 1fr 140px 110px',
          gap: '8px',
          padding: '6px 12px',
          marginBottom: '4px',
        }}>
          {['#', 'Member', 'Energy Used', 'Avg / Day'].map(h => (
            <span key={h} style={{ color: '#a1a1aa', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {h}
            </span>
          ))}
        </div>

        {members.map((m, i) => {
          const barPct = Math.round((m.energy / maxEnergy) * 100)
          return (
            <div
              key={m.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '30px 1fr 140px 110px',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 12px',
                borderRadius: '8px',
                background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                border: '1px solid transparent',
              }}
            >
              <span style={{ color: '#52525b', fontSize: '12px', textAlign: 'right' }}>{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <span style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '500', display: 'block', marginBottom: '3px' }}>
                  {m.username}
                </span>
                <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${barPct}%`,
                    background: 'linear-gradient(90deg, #6d28d9, #b3123f)',
                    borderRadius: '2px', transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
              <span style={{ color: '#a78bfa', fontSize: '13px', fontWeight: '700' }}>{fmt(m.energy)}</span>
              <span style={{ color: '#a1a1aa', fontSize: '12px' }}>{fmt(m.avg_day)} / day</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ members, days }) {
  const total  = members.reduce((s, m) => s + m.energy, 0)
  const avgDay = days > 0 ? Math.round(total / days) : 0

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
      gap: '8px', marginBottom: '20px',
    }}>
      {[
        { label: 'Active Members', value: members.length, color: '#f4f4f5' },
        { label: 'Total Energy',   value: fmt(total),     color: '#a78bfa' },
        { label: 'Avg / Day',      value: fmt(avgDay),    color: '#ff2f6d' },
        { label: 'Days Tracked',   value: Math.ceil(days), color: '#f4f4f5' },
      ].map(({ label, value, color }) => (
        <div key={label} style={{
          padding: '10px 14px', borderRadius: '8px',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <p style={{ color: '#a1a1aa', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px 0' }}>{label}</p>
          <p style={{ color, fontSize: '18px', fontWeight: '700', margin: 0 }}>{value}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Main energy panel ────────────────────────────────────────────────────────

export default function EnergyActivityPanel() {
  const now = new Date()
  const [mode, setMode] = useState('month')
  const [selectedMonth, setSelectedMonth] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() })
  const todayStr = now.toISOString().slice(0, 10)
  const firstOfMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
  const [customFrom, setCustomFrom] = useState(firstOfMonth)
  const [customTo,   setCustomTo]   = useState(todayStr)

  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const buildParams = useCallback(() => {
    if (mode === 'month') {
      const { year, month } = selectedMonth
      const fromStr = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth()
      const toStr = isCurrentMonth
        ? now.toISOString().slice(0, 10)
        : new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)
      return { from: fromStr, to: toStr }
    }
    return { from: customFrom, to: customTo }
  }, [mode, selectedMonth, customFrom, customTo])

  const load = useCallback(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    const { from, to } = buildParams()
    fetch(
      `${API_BASE_URL}/api/leadership/energy?from=${from}&to=${to}`,
      { headers: authHeaders(), signal: controller.signal }
    )
      .then(res => res.json().then(json => ({ res, json })))
      .then(({ res, json }) => {
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
        setData(json)
      })
      .catch(e => {
        if (e.name !== 'AbortError') setError(e.message)
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return controller
  }, [buildParams])

  useEffect(() => {
    const controller = load()
    return () => controller.abort()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const periodLabel = () =>
    mode === 'month'
      ? monthLabel(selectedMonth.year, selectedMonth.month)
      : `${customFrom} to ${customTo} UTC`

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontFamily: 'Cinzel, serif', color: '#f4f4f5', fontSize: '16px', letterSpacing: '1px', margin: '0 0 4px 0' }}>
          Gym Energy
        </h3>
        <p style={{ color: '#a1a1aa', fontSize: '13px', margin: 0 }}>
          Energy trained across all three factions. Snapshots taken daily — data available from tomorrow onwards.
        </p>
      </div>

      <PeriodPicker
        mode={mode} setMode={setMode}
        selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth}
        customFrom={customFrom} setCustomFrom={setCustomFrom}
        customTo={customTo} setCustomTo={setCustomTo}
        onApply={load}
      />

      {loading && (
        <div style={{ padding: '48px', textAlign: 'center', color: '#a1a1aa', fontSize: '14px' }}>
          Loading…
        </div>
      )}

      {error && (
        <div style={{
          padding: '14px 16px', borderRadius: '10px',
          background: 'rgba(255,0,0,0.08)', border: '1px solid rgba(255,0,0,0.2)', marginBottom: '16px',
        }}>
          <p style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{error}</p>
        </div>
      )}

      {!loading && data && (
        <>
          {data.errors?.length > 0 && (
            <div style={{
              padding: '10px 14px', borderRadius: '8px',
              background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', marginBottom: '16px',
            }}>
              <p style={{ color: '#fbbf24', fontSize: '12px', margin: 0 }}>
                Some factions could not be fetched: {data.errors.join(' · ')}
              </p>
            </div>
          )}

          <div style={{ marginBottom: '12px' }}>
            <span style={{ color: '#52525b', fontSize: '12px' }}>
              Period: <span style={{ color: '#a1a1aa' }}>{periodLabel()}</span>
              {data.coverage?.days_covered > 0 && (
                <> · <span style={{ color: '#a1a1aa' }}>{data.coverage.days_covered} snapshot{data.coverage.days_covered !== 1 ? 's' : ''} ({data.coverage.earliest} to {data.coverage.latest})</span></>
              )}
            </span>
          </div>

          {data.members.length === 0 ? (
            <div style={{
              padding: '48px', textAlign: 'center',
              background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <p style={{ color: '#52525b', fontSize: '14px', margin: '0 0 6px 0' }}>No energy data for this period.</p>
              {data.coverage?.days_covered === 0 && (
                <p style={{ color: '#3f3f46', fontSize: '12px', margin: 0 }}>
                  Snapshots are taken daily at 01:00 UTC — check back tomorrow.
                </p>
              )}
            </div>
          ) : (
            <>
              <SummaryBar members={data.members} days={data.period.days} />
              <EnergyTable members={data.members} />
            </>
          )}
        </>
      )}
    </div>
  )
}
