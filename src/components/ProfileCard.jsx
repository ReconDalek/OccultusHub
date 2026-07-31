import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { API_BASE_URL } from '../config/api'

const DEFAULT_AVATAR = 'https://www.torn.com/images/profile_man.jpg'
const FACTION_NAME = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' }

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return token ? { Authorization: token } : {}
}

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-GB')
}

function fmtMoney(n) {
  const v = Math.round(Number(n) || 0)
  return '$' + Math.abs(v).toLocaleString('en-GB')
}

function fmtDate(unix) {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

const sectionStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '14px', marginBottom: '12px' }
const sectionTitle = { color: "var(--text-secondary)", fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px 0', fontWeight: '600' }
const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '13px' }
const labelStyle = { color: "var(--text-secondary)" }

function Row({ label, value, color }) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={{ color: color || '#f4f4f5', fontWeight: '500', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export default function ProfileCard({ tornUserId, onClose }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    setLoading(true); setError(null); setData(null)
    fetch(`${API_BASE_URL}/api/members/${tornUserId}/profile`, { headers: authHeaders() })
      .then(r => { if (!r.ok) throw new Error(r.status === 403 ? 'Not authorised to view this member' : 'Failed to load profile'); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [tornUserId])

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '20px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(15,15,20,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px',
          padding: '24px', width: '480px', maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <img
              src={data?.identity?.image_url || DEFAULT_AVATAR} alt="avatar"
              className="w-14 h-14 rounded-full object-cover"
              style={{ border: '3px solid #4f0051' }}
            />
            <div>
              <div style={{ fontWeight: '700', fontSize: '16px', color: '#f4f4f5' }}>
                {data?.identity?.username || `#${tornUserId}`}
              </div>
              <div style={{ fontSize: '12px', color: "var(--text-secondary)" }}>
                {data?.identity?.faction_position || '—'} · {FACTION_NAME[data?.identity?.faction_id] ?? '—'}
                {data?.identity?.level ? ` · Lv.${data.identity.level}` : ''}
              </div>
              {data?.identity?.is_active === 0 && (
                <div style={{ fontSize: '11px', color: '#f97316', marginTop: '2px' }}>No longer an active member</div>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: "var(--text-secondary)", fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {loading && <p style={{ color: "var(--text-secondary)", fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Loading…</p>}
        {error && <p style={{ color: '#f87171', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>{error}</p>}

        {data && !loading && !error && (
          <>
            {/* Combat / War — all lifetime totals, not this-month */}
            <div style={sectionStyle}>
              <p style={sectionTitle}>Combat & War (Totals)</p>
              <Row label="Total Chain Attacks / Respect" value={`${fmt(data.combat.chain_hits?.total_attacks)} / ${fmt(Math.round(data.combat.chain_hits?.total_respect))}`} />
              <Row label="Total War Hits" value={fmt(data.combat.war_hits?.war_hits)} color="#4ade80" />
              <Row label="Total War Payouts" value={fmtMoney(data.combat.war_hits?.payout_amount)} color="#4ade80" />
              <Row label="Total Custom / Event Hits" value={fmt(data.combat.custom_hits)} />
              {data.combat.recent_wars?.length > 0 && (
                <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                  <p style={{ fontSize: '11px', color: "var(--text-faint)", margin: '0 0 6px' }}>Recent wars</p>
                  {data.combat.recent_wars.map((w, i) => (
                    <div key={i} style={{ ...rowStyle, fontSize: '12px' }}>
                      <span style={labelStyle}>vs {w.opponent_faction_name || '—'} ({fmtDate(w.ended_at)})</span>
                      <span>{fmt(w.war_hits)} hits · {fmtMoney(w.payout_amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Organized Crime */}
            <div style={sectionStyle}>
              <p style={sectionTitle}>Organized Crime</p>
              <Row label="Total OCs Joined" value={fmt(data.oc?.joined)} />
              <Row label="Total Successful" value={fmt(data.oc?.successful)} color="#4ade80" />
              <Row label="Total Failed" value={fmt(data.oc?.failed)} color={data.oc?.failed > 0 ? '#f87171' : undefined} />
              <Row label="Success Rate" value={data.oc?.success_pct != null ? `${data.oc.success_pct}%` : '—'} />
              {data.oc?.cpr?.length > 0 && (
                <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                  <p style={{ fontSize: '11px', color: "var(--text-faint)", margin: '0 0 6px' }}>Best OC pass rates</p>
                  {data.oc.cpr.slice(0, 5).map((c, i) => (
                    <div key={i} style={{ ...rowStyle, fontSize: '12px' }}>
                      <span style={labelStyle}>{c.crime_name} — {c.position}</span>
                      <span>{c.best_pass_rate}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Financial */}
            <div style={sectionStyle}>
              <p style={sectionTitle}>Financial</p>
              <Row label="Armory Deposited (this month)" value={`${fmt(data.financial.armory_deposits_this_month?.count)} deposits, ${fmt(data.financial.armory_deposits_this_month?.total_qty)} items`} />
              <Row label="Bounties Placed" value={`${fmt(data.financial.bounties_placed?.count)} — ${fmtMoney(data.financial.bounties_placed?.total_cost)}`} />
              <Row label="Bounties Received" value={`${fmt(data.financial.bounties_received?.count)} — ${fmtMoney(data.financial.bounties_received?.total_cost)}`} color={data.financial.bounties_received?.count > 0 ? '#f59e0b' : undefined} />
              {data.financial.investments?.length > 0 && data.financial.investments.map((inv, i) => (
                <Row key={i} label="Bank Investment" value={fmtMoney(inv.amount)} />
              ))}
              {data.financial.stocks?.length > 0 && data.financial.stocks.map((s, i) => (
                <Row key={i} label={`Stock (${s.stock_acronym})`} value={`Tier ${s.tier}`} />
              ))}
              {data.financial.xanax_recent?.length > 0 && (
                <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                  <p style={{ fontSize: '11px', color: "var(--text-faint)", margin: '0 0 6px' }}>Xanax perk (recent months)</p>
                  {data.financial.xanax_recent.map((x, i) => (
                    <div key={i} style={{ ...rowStyle, fontSize: '12px' }}>
                      <span style={labelStyle}>{x.distribution_month}/{x.distribution_year}</span>
                      <span>{x.quantity}x</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity — this month only, not lifetime totals */}
            <div style={sectionStyle}>
              <p style={sectionTitle}>Activity (This Month)</p>
              <Row label="Total Energy Trained" value={fmt(data.activity.energy_this_month_total)} />
              <Row label="Average Daily Energy" value={fmt(data.activity.energy_this_month_avg)} />
              {data.activity.personal_stats && (
                <>
                  {Object.entries(data.activity.personal_stats).filter(([k]) => !['since_date', 'as_of_date'].includes(k)).map(([k, v]) => (
                    <Row key={k} label={v.label} value={fmt(v.value)} color={k === 'drug_overdoses' && v.value > 0 ? '#f87171' : undefined} />
                  ))}
                  <p style={{ fontSize: '10px', color: "var(--text-faint)", marginTop: '6px' }}>{data.activity.personal_stats.since_date} → {data.activity.personal_stats.as_of_date}</p>
                </>
              )}
            </div>

            {/* Games */}
            {data.games && (
              <div style={sectionStyle}>
                <p style={sectionTitle}>Games</p>
                <Row label="Scrying" value={`${fmt(data.games.fishing?.essence)} essence · ${fmt(data.games.fishing?.catches)} catches`} />
                <Row label="Rune Casting" value={`${fmt(data.games.runes?.essence)} essence · ${fmt(data.games.runes?.casts)} casts`} />
                {data.games.sanctum && (
                  <Row label="The Sanctum" value={<>{fmt(data.games.sanctum.essence)} essence<br />({fmt(data.games.sanctum.total_essence)} lifetime)</>} />
                )}
                {data.games.binding_game && (
                  <Row label="The Binding Game" value={`${data.games.binding_game.species || '—'}, Lv.${data.games.binding_game.level ?? '—'} · ${fmt(data.games.binding_game.wins)}W / ${fmt(data.games.binding_game.battles)} battles`} />
                )}
                <Row label="Cards Against Occultus" value={`${fmt(data.games.cah?.essence)} essence · ${fmt(data.games.cah?.games_played)} games`} />
                <Row label="The Rite" value={`${fmt(data.games.rite?.games_played)} games`} />
              </div>
            )}

            {/* Warnings */}
            <div style={{ ...sectionStyle, background: 'rgba(248,113,113,0.04)', borderColor: 'rgba(248,113,113,0.15)' }}>
              <p style={sectionTitle}>Warnings {data.warnings?.length > 0 ? `(${data.warnings.length})` : ''}</p>
              {data.warnings?.length > 0 ? (
                data.warnings.slice(0, 5).map(w => (
                  <div key={w.id} style={{ fontSize: '12px', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ color: '#f87171', fontWeight: '500' }}>{w.warning_type} — {w.period}</div>
                    {w.comment && <div style={{ color: "var(--text-secondary)", marginTop: '2px' }}>{w.comment}</div>}
                  </div>
                ))
              ) : (
                <p style={{ fontSize: '12px', color: "var(--text-secondary)", margin: 0 }}>No warnings recorded</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
