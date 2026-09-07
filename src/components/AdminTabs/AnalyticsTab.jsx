import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'
import { timeAgo } from '../../lib/dates'

function fmt(n) {
  if (n == null) return '—'
  return n.toLocaleString()
}

// Shared card shell — every section on this tab is a titled card with either
// a stat grid, a bar chart, or a plain list inside, so one wrapper covers all.
function Card({ title, subtitle, children }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '18px' }}>
      <div style={{ marginBottom: '14px' }}>
        <h4 style={{ color: '#f4f4f5', fontSize: '14px', fontWeight: '600', margin: 0 }}>{title}</h4>
        {subtitle && <p style={{ color: 'var(--text-faint)', fontSize: '11px', margin: '2px 0 0' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Stat({ label, value, color = '#f4f4f5' }) {
  return (
    <div style={{ flex: '1 1 100px' }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '11px', margin: '0 0 4px' }}>{label}</p>
      <p style={{ color, fontSize: '22px', fontWeight: '700', margin: 0 }}>{fmt(value)}</p>
    </div>
  )
}

// Simple div-bar daily trend chart — no charting library, just flex bars
// scaled to the max value in the series. Good enough for a 30-point trend.
function BarChart({ data, valueKey = 'count', color = '#b3123f', height = 90 }) {
  if (!data?.length) return <p style={{ color: 'var(--text-faint)', fontSize: '12px' }}>No data yet</p>
  const max = Math.max(1, ...data.map(d => d[valueKey] || 0))
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: `${height}px` }}>
        {data.map((d, i) => (
          <div
            key={i}
            title={`${d.day}: ${d[valueKey]}`}
            style={{
              flex: '1 1 0', minWidth: '2px',
              height: `${Math.max(2, (d[valueKey] / max) * height)}px`,
              background: color, borderRadius: '2px 2px 0 0', opacity: 0.55 + 0.45 * (d[valueKey] / max),
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        <span style={{ color: 'var(--text-faint)', fontSize: '10px' }}>{data[0]?.day}</span>
        <span style={{ color: 'var(--text-faint)', fontSize: '10px' }}>{data[data.length - 1]?.day}</span>
      </div>
    </div>
  )
}

function BreakdownBars({ items, labelKey, valueKey, colors }) {
  const total = items.reduce((s, i) => s + (i[valueKey] || 0), 0) || 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {items.map((item, i) => {
        const pct = Math.round(((item[valueKey] || 0) / total) * 100)
        return (
          <div key={item[labelKey] ?? i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{item[labelKey]}</span>
              <span style={{ color: '#f4f4f5', fontWeight: '600' }}>{fmt(item[valueKey])} <span style={{ color: 'var(--text-faint)', fontWeight: '400' }}>({pct}%)</span></span>
            </div>
            <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: colors?.[i % colors.length] ?? '#b3123f' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

const FACTION_COLORS = ['#b3123f', '#6d28d9', '#f97316', '#4b5563']
const DEVICE_COLORS  = ['#4ade80', '#60a5fa', '#f59e0b', '#6b7280']

export default function AnalyticsTab() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem('occultusSession')
    fetch(`${API_BASE_URL}/api/admin/analytics/dashboard`, { headers: { Authorization: token } })
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d) })
      .catch(e => setError(e.message))
  }, [])

  if (error) return <p style={{ color: '#f87171', fontSize: '13px' }}>{error}</p>
  if (!data) return <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Loading analytics…</p>

  const { growth, activity, engagement, moderation } = data
  const ab = growth.active_buckets

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* ── Growth ─────────────────────────────────────────────────────── */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Growth</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <Card title="Signups — last 30 days" subtitle={`${growth.total_users} users total`}>
            <BarChart data={growth.signups_by_day} color="#4ade80" />
          </Card>
          <Card title="Faction Distribution">
            <BreakdownBars items={growth.faction_distribution} labelKey="faction_name" valueKey="count" colors={FACTION_COLORS} />
          </Card>
          <Card title="Account Activity" subtitle={`${ab.total} accounts`}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              <Stat label="Active 24h"  value={ab.last_24h} color="#4ade80" />
              <Stat label="Active 7d"   value={ab.last_7d} />
              <Stat label="Active 30d"  value={ab.last_30d} />
              <Stat label="Active 90d"  value={ab.last_90d} />
              <Stat label="Never Logged In" value={ab.never} color="#f87171" />
            </div>
          </Card>
        </div>
      </div>

      {/* ── Activity ───────────────────────────────────────────────────── */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Activity</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <Card title="Logins — last 30 days" subtitle="Total login events per day">
            <BarChart data={activity.logins_by_day} color="#60a5fa" />
          </Card>
          <Card title="Unique Active Users — last 30 days" subtitle="Distinct members logging in per day">
            <BarChart data={activity.unique_active_by_day} color="#9f67ff" />
          </Card>
          <Card title="Device Breakdown" subtitle="Last 30 days of logins">
            <BreakdownBars items={activity.device_breakdown} labelKey="device" valueKey="count" colors={DEVICE_COLORS} />
          </Card>
        </div>
      </div>

      {/* ── Feature Engagement ─────────────────────────────────────────── */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Feature Engagement</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Card title="Forums">
            <div style={{ display: 'flex', gap: '16px' }}>
              <Stat label="Total Posts" value={engagement.forums.total_posts} />
              <Stat label="Active Authors (30d)" value={engagement.forums.active_authors_month} />
            </div>
          </Card>
          <Card title="Games Played" subtitle="All-time totals">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
              {[
                ['The Rite', engagement.games.rite_rooms],
                ['Cards Against Occultus', engagement.games.cah_rooms],
                ['The Pact', engagement.games.pact_sessions],
                ['The Sanctum (players)', engagement.games.sanctum_players],
                ['The Binding (familiars)', engagement.games.binding_players],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ color: '#f4f4f5', fontWeight: '600' }}>{fmt(value)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Daily Cipher">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
              <Stat label="Submissions (30d)" value={engagement.cipher.submissions_month} />
              <Stat label="Total Submissions" value={engagement.cipher.total_submissions} />
              <Stat label="Unique Solvers" value={engagement.cipher.unique_solvers} />
            </div>
          </Card>
          <Card title="Discord Linking">
            <Stat label={`${engagement.discord.linked} of ${engagement.discord.total_users} members linked`} value={`${engagement.discord.pct}%`} color="#5865F2" />
          </Card>
          <Card title="Easter Eggs">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>🎣 Fishing catches ({fmt(engagement.easter_eggs.fishing_users)} anglers)</span>
                <span style={{ color: '#f4f4f5', fontWeight: '600' }}>{fmt(engagement.easter_eggs.fishing_catches)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>ᛃ Rune casts ({fmt(engagement.easter_eggs.rune_users)} casters)</span>
                <span style={{ color: '#f4f4f5', fontWeight: '600' }}>{fmt(engagement.easter_eggs.rune_casts)}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Moderation / Health ────────────────────────────────────────── */}
      <div>
        <h3 style={{ color: '#f4f4f5', marginBottom: '16px' }}>Moderation & Health</h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Card title="Warnings">
            <div style={{ display: 'flex', gap: '16px' }}>
              <Stat label="Issued (30d)" value={moderation.warnings_issued_month} />
              <Stat label="At Kick Threshold Now" value={moderation.members_at_kick_threshold} color={moderation.members_at_kick_threshold > 0 ? '#f87171' : '#4ade80'} />
            </div>
          </Card>
          <Card title="Webhook Health" subtitle="Last run per event type">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {moderation.webhooks.map(w => (
                <div key={w.event_type} style={{ fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#f4f4f5', fontWeight: '600' }}>{w.event_type}</span>
                    <span style={{
                      fontSize: '10px', padding: '1px 8px', borderRadius: '10px',
                      background: w.enabled ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.06)',
                      color: w.enabled ? '#4ade80' : 'var(--text-faint)',
                    }}>
                      {w.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-faint)', fontSize: '11px', margin: '2px 0 0' }}>
                    {w.last_status ?? 'Never run'}{w.last_triggered ? ` — ${timeAgo(w.last_triggered)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
