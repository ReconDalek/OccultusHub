import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../config/api'

function ScrollToTop() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  if (!visible) return null
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      style={{
        position: 'fixed', bottom: '28px', right: '28px', zIndex: 999,
        width: '40px', height: '40px', borderRadius: '50%',
        background: 'rgba(20,20,30,0.85)', border: '1px solid rgba(255,255,255,0.12)',
        color: "var(--text-secondary)", fontSize: '18px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(6px)',
        transition: 'opacity 0.2s, color 0.2s',
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = '#f4f4f5'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
      onMouseLeave={e => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
      title="Back to top"
    >
      ↑
    </button>
  )
}

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

const dateInputStyle = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px', color: '#f4f4f5', padding: '6px 10px', fontSize: '13px',
}

function PeriodPicker({ mode, setMode, selectedMonth, setSelectedMonth, customFrom, setCustomFrom, customTo, setCustomTo, customDay, setCustomDay, onApply, minDate }) {
  const months = buildMonthOptions()
  const now = new Date()

  const isMonthBeforeData = (year, month) => {
    if (!minDate) return false
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)
    return lastDay < minDate
  }

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '24px' }}>
      {[['month', 'By Month'], ['day', 'Per Day'], ['custom', 'Custom Range']].map(([m, label]) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          style={{
            padding: '7px 16px',
            borderRadius: '8px',
            border: `1px solid ${mode === m ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
            background: mode === m ? 'rgba(179,18,63,0.15)' : 'transparent',
            color: mode === m ? '#f4f4f5' : "var(--text-secondary)",
            fontSize: '13px',
            fontWeight: mode === m ? '600' : '400',
            cursor: 'pointer',
          }}
        >
          {label}
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
            const noData = isMonthBeforeData(year, month)
            return (
              <option
                key={`${year}-${month}`}
                value={`${year}-${month}`}
                disabled={noData}
                style={{ color: noData ? "var(--text-faint)" : '#f4f4f5' }}
              >
                {monthLabel(year, month)}{isCurrent ? ' (current)' : ''}{noData ? ' — no data' : ''}
              </option>
            )
          })}
        </select>
      )}

      {mode === 'day' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <label style={{ color: "var(--text-muted)", fontSize: '10px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Date (UTC)</label>
          <input
            type="date"
            value={customDay}
            min={minDate}
            onChange={e => setCustomDay(e.target.value)}
            style={dateInputStyle}
          />
        </div>
      )}

      {mode === 'custom' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ color: "var(--text-muted)", fontSize: '10px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>From (UTC)</label>
            <input
              type="date"
              value={customFrom}
              min={minDate}
              onChange={e => setCustomFrom(e.target.value)}
              style={dateInputStyle}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ color: "var(--text-muted)", fontSize: '10px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>To (UTC)</label>
            <input
              type="date"
              value={customTo}
              min={minDate}
              onChange={e => setCustomTo(e.target.value)}
              style={dateInputStyle}
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

// ─── Energy toggles ───────────────────────────────────────────────────────────

function EnergyToggles({ includeRevives, setIncludeRevives, includeAttacks, setIncludeAttacks, hasRevives, hasAttacks, showComparison, setShowComparison }) {
  const toggle = (active, hasData, label, onClick) => (
    <button
      key={label}
      onClick={onClick}
      disabled={!hasData}
      title={hasData ? undefined : `No ${label.toLowerCase()} data saved for this period`}
      style={{
        display: 'flex', alignItems: 'center', gap: '7px',
        padding: '6px 12px', borderRadius: '8px', cursor: hasData ? 'pointer' : 'not-allowed',
        border: `1px solid ${active ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.08)'}`,
        background: active ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.03)',
        color: hasData ? (active ? '#c4b5fd' : "var(--text-secondary)") : "var(--text-ghost)",
        fontSize: '12px', fontWeight: active ? '600' : '400',
        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
        opacity: hasData ? 1 : 0.5,
      }}
    >
      <span style={{
        width: '14px', height: '14px', borderRadius: '4px', flexShrink: 0,
        border: `1.5px solid ${active && hasData ? '#a78bfa' : 'rgba(255,255,255,0.2)'}`,
        background: active && hasData ? '#a78bfa' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s, border-color 0.15s',
      }}>
        {active && hasData && <span style={{ color: '#fff', fontSize: '9px', lineHeight: 1 }}>✓</span>}
      </span>
      {label} <span style={{ color: active && hasData ? '#a78bfa' : "var(--text-faint)", fontSize: '11px' }}>+25 ea</span>
    </button>
  )

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
      <span style={{ color: "var(--text-faint)", fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Include:</span>
      {toggle(includeRevives, hasRevives, 'Revives', () => setIncludeRevives(v => !v))}
      {toggle(includeAttacks, hasAttacks, 'Attacks', () => setIncludeAttacks(v => !v))}

      <div style={{ flex: 1 }} />

      <button
        onClick={() => setShowComparison(v => !v)}
        style={{
          padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px',
          border: `1px solid ${showComparison ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.08)'}`,
          background: showComparison ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.03)',
          color: showComparison ? '#fbbf24' : "var(--text-secondary)",
          fontWeight: showComparison ? '600' : '400',
          transition: 'background 0.15s, border-color 0.15s, color 0.15s',
        }}
      >
        {showComparison ? 'Snapshot View' : 'Comparison View'}
      </button>
    </div>
  )
}

// ─── Coverage bar ─────────────────────────────────────────────────────────────

function CoverageBar({ coverage, days }) {
  if (!coverage?.days_covered) return null

  const snapshotDays = coverage.days_covered
  const totalDates   = Math.round(days) + 1
  const missingDays  = Math.max(0, totalDates - snapshotDays)
  const fillPct      = Math.min(100, Math.round((snapshotDays / totalDates) * 100))
  const hasMissing   = missingDays > 0

  return (
    <div style={{
      padding: '10px 14px', borderRadius: '8px', marginBottom: '16px',
      background: hasMissing ? 'rgba(251,191,36,0.05)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${hasMissing ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.07)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ display: 'flex', gap: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: hasMissing ? '#fbbf24' : "var(--text-secondary)" }}>
            <strong style={{ color: hasMissing ? '#fbbf24' : '#f4f4f5' }}>{snapshotDays}</strong>
            <span style={{ color: "var(--text-faint)" }}> / {totalDates} days tracked</span>
          </span>
          {hasMissing && (
            <span style={{ fontSize: '11px', color: '#f87171' }}>
              {missingDays} day{missingDays !== 1 ? 's' : ''} missing
            </span>
          )}
          {!hasMissing && (
            <span style={{ fontSize: '11px', color: '#34d399' }}>complete coverage</span>
          )}
        </div>
        <span style={{ fontSize: '11px', color: "var(--text-faint)" }}>
          {coverage.earliest} → {coverage.latest}
        </span>
      </div>
      <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${fillPct}%`,
          background: hasMissing
            ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
            : 'linear-gradient(90deg, #34d399, #059669)',
          borderRadius: '2px', transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

// ─── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ members, extras, includeRevives, includeAttacks, days, coverage }) {
  const total = members.reduce((s, m) => {
    const reviveEnergy = includeRevives ? (extras?.revives?.[m.id] ?? 0) * 25 : 0
    const attackEnergy = includeAttacks ? (extras?.attacks?.[m.id] ?? 0) * 25 : 0
    return s + m.energy + reviveEnergy + attackEnergy
  }, 0)

  const snapshotDays = coverage?.days_covered || Math.ceil(days)
  const avgDay = snapshotDays > 0 ? Math.round(total / snapshotDays) : 0

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
      gap: '8px', marginBottom: '12px',
    }}>
      {[
        { label: 'Active Members', value: members.length,  color: '#f4f4f5' },
        { label: 'Total Energy',   value: fmt(total),      color: '#a78bfa' },
        { label: 'Avg / Day',      value: fmt(avgDay),     color: '#ff2f6d' },
      ].map(({ label, value, color }) => (
        <div key={label} style={{
          padding: '10px 14px', borderRadius: '8px',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <p style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px 0' }}>{label}</p>
          <p style={{ color, fontSize: '18px', fontWeight: '700', margin: 0 }}>{value}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Energy table ─────────────────────────────────────────────────────────────

function EnergyTable({ members, extras, includeRevives, includeAttacks, days, periodFrom }) {
  const augmented = members.map(m => {
    const reviveEnergy  = includeRevives ? (extras?.revives?.[m.id] ?? 0) * 25 : 0
    const attackEnergy  = includeAttacks ? (extras?.attacks?.[m.id] ?? 0) * 25 : 0
    const displayEnergy = m.energy + reviveEnergy + attackEnergy
    const partialStart  = periodFrom && m.start_date && m.start_date > periodFrom
    return { ...m, displayEnergy, reviveEnergy, attackEnergy, partialStart }
  }).sort((a, b) => b.displayEnergy - a.displayEnergy)

  const maxEnergy = augmented[0]?.displayEnergy || 1
  const showBreakdown = includeRevives || includeAttacks

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: showBreakdown ? '640px' : '540px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: showBreakdown ? '30px 1fr 140px 160px 110px' : '30px 1fr 140px 110px',
          gap: '8px', padding: '6px 12px', marginBottom: '4px',
        }}>
          {['#', 'Member', 'Energy Used', ...(showBreakdown ? ['Breakdown'] : []), 'Avg / Day'].map(h => (
            <span key={h} style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {h}
            </span>
          ))}
        </div>

        {augmented.map((m, i) => {
          const barPct = Math.round((m.displayEnergy / maxEnergy) * 100)
          const avgDay = days > 0 ? Math.round(m.displayEnergy / days) : 0
          return (
            <div
              key={m.id}
              style={{
                display: 'grid',
                gridTemplateColumns: showBreakdown ? '30px 1fr 140px 160px 110px' : '30px 1fr 140px 110px',
                alignItems: 'center',
                gap: '8px', padding: '9px 12px', borderRadius: '8px',
                background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                border: '1px solid transparent',
              }}
            >
              <span style={{ color: "var(--text-faint)", fontSize: '12px', textAlign: 'right' }}>{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <span style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '500', display: 'block', marginBottom: '3px' }}>
                  {m.username}
                  {m.partialStart && (
                    <span
                      title={`First snapshot: ${m.start_date} (joined mid-period)`}
                      style={{ marginLeft: '6px', color: '#f59e0b', fontSize: '11px', verticalAlign: 'middle' }}
                    >⚠</span>
                  )}
                </span>
                <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${barPct}%`,
                    background: 'linear-gradient(90deg, #6d28d9, #b3123f)',
                    borderRadius: '2px', transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
              <span style={{ color: '#a78bfa', fontSize: '13px', fontWeight: '700' }}>{fmt(m.displayEnergy)}</span>
              {showBreakdown && (
                <span style={{ color: "var(--text-faint)", fontSize: '11px', lineHeight: '1.6' }}>
                  {m.energy > 0 && <span style={{ color: "var(--text-muted)", display: 'block' }}>gym {fmt(m.energy)}</span>}
                  {m.reviveEnergy > 0 && <span style={{ color: '#34d399', display: 'block' }}>revives {fmt(m.reviveEnergy)}</span>}
                  {m.attackEnergy > 0 && <span style={{ color: '#f87171', display: 'block' }}>attacks {fmt(m.attackEnergy)}</span>}
                </span>
              )}
              <span style={{ color: "var(--text-secondary)", fontSize: '12px' }}>{fmt(avgDay)} / day</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Comparison table ─────────────────────────────────────────────────────────

function ComparisonTable({ members, extras, includeRevives, includeAttacks, periodFrom }) {
  const augmented = members.map(m => {
    const daysBetween  = m.start_date && m.end_date
      ? Math.max(1, Math.round((Date.parse(m.end_date) - Date.parse(m.start_date)) / 86400000))
      : 1
    const gymEnergy    = m.energy
    const reviveEnergy = includeRevives ? (extras?.revives?.[m.id] ?? 0) * 25 : 0
    const attackEnergy = includeAttacks ? (extras?.attacks?.[m.id] ?? 0) * 25 : 0
    const totalEnergy  = gymEnergy + reviveEnergy + attackEnergy
    const avgDay       = Math.round(totalEnergy / daysBetween)
    const partialStart = periodFrom && m.start_date && m.start_date > periodFrom
    return { ...m, gymEnergy, reviveEnergy, attackEnergy, totalEnergy, avgDay, daysBetween, partialStart }
  }).sort((a, b) => b.totalEnergy - a.totalEnergy)

  const maxEnergy = augmented[0]?.totalEnergy || 1
  const showBreakdown = includeRevives || includeAttacks

  const colTemplate = showBreakdown
    ? '30px 1fr 160px 160px 130px 70px 100px'
    : '30px 1fr 160px 160px 130px 70px 100px'

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: '820px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: colTemplate,
          gap: '8px', padding: '6px 12px', marginBottom: '4px',
        }}>
          {['#', 'Member', 'First Snapshot', 'Last Snapshot', 'Energy Gained', 'Days', 'Avg / Day'].map(h => (
            <span key={h} style={{ color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {h}
            </span>
          ))}
        </div>

        {augmented.map((m, i) => {
          const barPct = Math.round((m.totalEnergy / maxEnergy) * 100)
          return (
            <div
              key={m.id}
              style={{
                display: 'grid',
                gridTemplateColumns: colTemplate,
                alignItems: 'center',
                gap: '8px', padding: '9px 12px', borderRadius: '8px',
                background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
              }}
            >
              <span style={{ color: "var(--text-faint)", fontSize: '12px', textAlign: 'right' }}>{i + 1}</span>

              <div style={{ minWidth: 0 }}>
                <span style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '500', display: 'block', marginBottom: '3px' }}>
                  {m.username}
                </span>
                <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${barPct}%`,
                    background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                    borderRadius: '2px',
                  }} />
                </div>
              </div>

              <div title={m.partialStart ? `No data before ${m.start_date} — joined or tracked mid-period` : undefined}>
                <span style={{ color: m.partialStart ? '#f59e0b' : "var(--text-faint)", fontSize: '10px', display: 'block' }}>
                  {m.start_date || '—'}
                  {m.partialStart && <span style={{ marginLeft: '4px' }}>⚠</span>}
                </span>
                <span style={{ color: m.partialStart ? '#fbbf24' : "var(--text-muted)", fontSize: '12px', fontWeight: '500' }}>
                  {fmt(m.start_energy)}
                </span>
              </div>

              <div>
                <span style={{ color: "var(--text-faint)", fontSize: '10px', display: 'block' }}>{m.end_date || '—'}</span>
                <span style={{ color: "var(--text-muted)", fontSize: '12px', fontWeight: '500' }}>{fmt(m.end_energy)}</span>
              </div>

              <div>
                <span style={{ color: '#a78bfa', fontSize: '13px', fontWeight: '700' }}>{fmt(m.totalEnergy)}</span>
                {showBreakdown && (
                  <span style={{ color: "var(--text-ghost)", fontSize: '10px', display: 'block', lineHeight: '1.5' }}>
                    {m.gymEnergy > 0 && `gym ${fmt(m.gymEnergy)}`}
                    {m.reviveEnergy > 0 && ` · rev ${fmt(m.reviveEnergy)}`}
                    {m.attackEnergy > 0 && ` · atk ${fmt(m.attackEnergy)}`}
                  </span>
                )}
              </div>

              <span style={{ color: "var(--text-secondary)", fontSize: '12px' }}>{m.daysBetween}d</span>
              <span style={{ color: "var(--text-secondary)", fontSize: '12px' }}>{fmt(m.avgDay)} / day</span>
            </div>
          )
        })}
      </div>
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
  const [customDay,  setCustomDay]  = useState(todayStr)

  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const [includeRevives,  setIncludeRevives]  = useState(false)
  const [includeAttacks,  setIncludeAttacks]  = useState(false)
  const [showComparison,  setShowComparison]  = useState(false)

  const minDate = data?.overall_earliest || data?.coverage?.earliest || todayStr

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
    if (mode === 'day') return { from: customDay, to: customDay }
    return { from: customFrom, to: customTo }
  }, [mode, selectedMonth, customFrom, customTo, customDay])

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

  const periodLabel = () => {
    if (mode === 'month') return monthLabel(selectedMonth.year, selectedMonth.month)
    if (mode === 'day')   return `${customDay} UTC`
    return `${customFrom} to ${customTo} UTC`
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontFamily: 'Cinzel, serif', color: '#f4f4f5', fontSize: '16px', letterSpacing: '1px', margin: '0 0 4px 0' }}>
          Gym Energy
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: '13px', margin: 0 }}>
          Energy trained across all three factions. Snapshots taken daily — data available from tomorrow onwards.
        </p>
      </div>

      <PeriodPicker
        mode={mode} setMode={setMode}
        selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth}
        customFrom={customFrom} setCustomFrom={setCustomFrom}
        customTo={customTo} setCustomTo={setCustomTo}
        customDay={customDay} setCustomDay={setCustomDay}
        onApply={load}
        minDate={minDate}
      />

      {loading && (
        <div style={{ padding: '48px', textAlign: 'center', color: "var(--text-secondary)", fontSize: '14px' }}>
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
            <span style={{ color: "var(--text-faint)", fontSize: '12px' }}>
              Period: <span style={{ color: "var(--text-secondary)" }}>{periodLabel()}</span>
            </span>
          </div>

          {data.members.length === 0 ? (
            <div style={{
              padding: '48px', textAlign: 'center',
              background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <p style={{ color: "var(--text-faint)", fontSize: '14px', margin: '0 0 6px 0' }}>No energy data for this period.</p>
              {data.coverage?.days_covered === 0 && (
                <p style={{ color: "var(--text-ghost)", fontSize: '12px', margin: 0 }}>
                  Snapshots are taken daily at 01:00 UTC — check back tomorrow.
                </p>
              )}
            </div>
          ) : (
            <>
              <EnergyToggles
                includeRevives={includeRevives} setIncludeRevives={setIncludeRevives}
                includeAttacks={includeAttacks} setIncludeAttacks={setIncludeAttacks}
                hasRevives={Object.keys(data.extras?.revives ?? {}).length > 0}
                hasAttacks={Object.keys(data.extras?.attacks ?? {}).length > 0}
                showComparison={showComparison} setShowComparison={setShowComparison}
              />
              <SummaryBar
                members={data.members} extras={data.extras}
                includeRevives={includeRevives} includeAttacks={includeAttacks}
                days={data.period.days} coverage={data.coverage}
              />
              <CoverageBar coverage={data.coverage} days={data.period.days} />
              {showComparison ? (
                <ComparisonTable
                  members={data.members} extras={data.extras}
                  includeRevives={includeRevives} includeAttacks={includeAttacks}
                  periodFrom={data.period.from}
                />
              ) : (
                <EnergyTable
                  members={data.members} extras={data.extras}
                  includeRevives={includeRevives} includeAttacks={includeAttacks}
                  days={data.period.days} periodFrom={data.period.from}
                />
              )}
            </>
          )}
        </>
      )}
      <ScrollToTop />
    </div>
  )
}
