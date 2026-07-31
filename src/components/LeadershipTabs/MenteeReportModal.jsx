import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

const FACTION_LABEL = { 33097: 'Occ1', 9728: 'Occ2', 9171: 'Occ3' }
const token = () => localStorage.getItem('occultusSession')

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-GB')
}
function fmtMoney(n) {
  if (n == null) return '—'
  return '$' + Math.round(n).toLocaleString('en-GB')
}
function fmtDateStr(d) {
  if (!d) return '—'
  return d.slice(0, 10)
}
function fmtUnixDate(unix) {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

const sectionStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '14px', marginBottom: '12px' }
const sectionTitle = { color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px 0', fontWeight: '600' }
const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '13px' }
const labelStyle = { color: 'var(--text-secondary)' }

function Row({ label, value, color }) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={{ color: color || '#f4f4f5', fontWeight: '500', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export default function MenteeReportModal({ menteeId, menteeName, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/leadership/mentoring/mentees/${menteeId}/report`, { headers: { Authorization: token() } })
      .then(r => { if (!r.ok) throw new Error('Failed to load report'); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [menteeId])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(15,15,20,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px', width: '480px', maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ fontWeight: '700', fontSize: '16px', color: '#f4f4f5' }}>{data?.identity?.username || menteeName}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>New Player Progress Report</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {loading && <p style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Generating report…</p>}
        {error && <p style={{ color: '#f87171', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>{error}</p>}

        {data && !loading && !error && (
          <>
            <div style={sectionStyle}>
              <p style={sectionTitle}>Identity</p>
              <Row label="Level" value={fmt(data.identity.level)} />
              <Row label="Position" value={data.identity.faction_position || '—'} />
              <Row label="Faction" value={FACTION_LABEL[data.identity.current_faction_id] ?? '—'} />
              <Row label="Days in Faction" value={fmt(data.identity.days_in_faction)} />
              <Row label="Faction Join Date" value={fmtDateStr(data.identity.joined_at)} />
              {!data.identity.is_active && <Row label="Status" value="No longer an active member" color="#f97316" />}
            </div>

            <div style={sectionStyle}>
              <p style={sectionTitle}>New Player Progress</p>
              <Row label="Days Tracked (since added as mentee)" value={fmt(data.progress.days_tracked)} />
              <Row label="Levels Gained" value={data.progress.levels_gained != null ? fmt(data.progress.levels_gained) : '— (no baseline recorded)'} />
              <Row label="Average Daily Level Gain" value={data.progress.avg_daily_level_gain != null ? data.progress.avg_daily_level_gain : '—'} />
            </div>

            <div style={sectionStyle}>
              <p style={sectionTitle}>Combat & War (Totals)</p>
              <Row label="Chain Attacks / Respect" value={`${fmt(data.combat.chain_hits?.total_attacks)} / ${fmt(Math.round(data.combat.chain_hits?.total_respect))}`} />
              <Row label="War Hits" value={fmt(data.combat.war_hits?.war_hits)} color="#4ade80" />
              <Row label="War Payouts" value={fmtMoney(data.combat.war_hits?.payout_amount)} color="#4ade80" />
              <Row label="Custom / Event Hits" value={fmt(data.combat.custom_hits)} />
              {data.combat.recent_wars?.length > 0 && (
                <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '0 0 6px' }}>Recent wars</p>
                  {data.combat.recent_wars.map((w, i) => (
                    <div key={i} style={{ ...rowStyle, fontSize: '12px' }}>
                      <span style={labelStyle}>vs {w.opponent_faction_name || '—'} ({fmtUnixDate(w.ended_at)})</span>
                      <span>{fmt(w.war_hits)} hits · {fmtMoney(w.payout_amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={sectionStyle}>
              <p style={sectionTitle}>Organized Crime</p>
              <Row label="Total Joined" value={fmt(data.oc.joined)} />
              <Row label="Successful" value={fmt(data.oc.successful)} color="#4ade80" />
              <Row label="Failed" value={fmt(data.oc.failed)} color={data.oc.failed > 0 ? '#f87171' : undefined} />
              <Row label="Success Rate" value={data.oc.success_pct != null ? `${data.oc.success_pct}%` : '—'} />
            </div>

            <div style={sectionStyle}>
              <p style={sectionTitle}>Activity (This Month)</p>
              <Row label="Total Energy Trained" value={fmt(data.activity.energy_this_month_total)} />
              <Row label="Average Daily Energy" value={fmt(data.activity.energy_this_month_avg)} />
            </div>

            <div style={sectionStyle}>
              <p style={sectionTitle}>Mentoring Program</p>
              <Row label="Mentor" value={data.mentoring.mentor_username || '—'} />
              <Row label="Stage" value={data.mentoring.status} />
              <Row label="Steps Completed" value={`${Object.values(data.mentoring.steps).filter(Boolean).length} / 4`} />
              {data.mentoring.incentive_amount != null && (
                <Row label="Level 15 Incentive" value={`${fmtMoney(data.mentoring.incentive_amount)}${data.mentoring.incentive_paid ? ' (paid)' : ''}`} color="#4ade80" />
              )}
            </div>

            <div style={{ ...sectionStyle, background: 'rgba(248,113,113,0.04)', borderColor: 'rgba(248,113,113,0.15)' }}>
              <p style={sectionTitle}>Warnings {data.warnings?.length > 0 ? `(${data.warnings.length})` : ''}</p>
              {data.warnings?.length > 0 ? (
                data.warnings.slice(0, 5).map(w => (
                  <div key={w.id} style={{ fontSize: '12px', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ color: '#f87171', fontWeight: '500' }}>{w.warning_type} — {w.period}</div>
                    {w.comment && <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>{w.comment}</div>}
                  </div>
                ))
              ) : (
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>No warnings recorded</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
