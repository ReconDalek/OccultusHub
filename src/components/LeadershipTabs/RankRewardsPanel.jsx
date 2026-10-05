import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE_URL } from '../../config/api'

// Leadership → Ranks → Rank Rewards. Manages the monthly rank perk the
// Occultus Operations userscript hands out (base item × rank coefficient +
// energy bonus), and shows the member list exactly as the script sees it.
// Backend: rankRewardsController.js (config + computeRankRewards); the
// userscript reads the same computed quantities from /api/leadership/xanax.

const token = () => localStorage.getItem('occultusSession')
async function api(path, method = 'GET', body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { Authorization: token(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

const FACTIONS = [
  { id: 33097, name: 'Occultus' },
  { id: 9728, name: 'Occul2us' },
  { id: 9171, name: 'Occul3us' },
]
const RANK_COLORS = {
  Harbinger: '#ff2f6d', Doomsayer: '#f97316', Sentinel: '#eab308', Arcanist: '#9f67ff', Adept: '#60a5fa', Acolyte: 'var(--text-secondary)',
}
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const qtyFor = (base, coef) => (coef > 0 ? Math.floor(base * Math.round(coef * 100) / 100 + 1e-9) : 0)
const fmtCoef = (c) => `x${Number(c).toFixed(2).replace(/0$/, '')}` // 1.4 → x1.4, 1.25 → x1.25, 1 → x1.0

const card = { background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 'clamp(12px, 3vw, 18px)', marginBottom: 16 }
const h3 = { margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#f4f4f5' }
const sub = { margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }
const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#f4f4f5', fontSize: 13, minWidth: 0, boxSizing: 'border-box', width: '100%' }
const label = { display: 'block', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
const btn = (primary, disabled) => ({
  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
  border: primary ? 'none' : '1px solid rgba(255,255,255,0.12)',
  background: primary ? 'linear-gradient(135deg, #b3123f, #6d28d9)' : 'transparent', color: primary ? '#fff' : 'var(--text-secondary)',
})

export default function RankRewardsPanel() {
  const [config, setConfig] = useState(null)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = useCallback(() => { api('/api/leadership/rank-rewards/config').then(setConfig).catch(e => setErr(e.message)) }, [])
  useEffect(() => { load() }, [load])
  const flash = (m, isErr) => { setMsg({ m, isErr }); setTimeout(() => setMsg(null), 5000) }
  const [listKey, setListKey] = useState(0) // refetch member list after config changes

  async function save(path, method, body, okMsg) {
    try { setConfig(await api(path, method, body)); setListKey(k => k + 1); flash(okMsg) }
    catch (e) { flash(e.message, true) }
  }

  if (err) return <p style={{ color: '#f87171', fontSize: 13 }}>{err}</p>
  if (!config) return <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading rank rewards…</p>

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 14px' }}>
        The monthly rank reward the Operations userscript gives out: <strong style={{ color: '#f4f4f5' }}>base × (rank coefficient + bonuses)</strong>, rounded down.
        Rank is earned from hits banked before the month started; warnings and energy are judged on the previous month. The userscript reads everything here — no script edits needed when values change.
      </p>
      {msg && <p style={{ fontSize: 12, color: msg.isErr ? '#f87171' : '#4ade80', margin: '0 0 10px' }}>{msg.m}</p>}

      <SettingsCard settings={config.settings} onSave={(b) => save('/api/leadership/rank-rewards/settings', 'PUT', b, 'Base reward saved')} />
      <RanksCard ranks={config.ranks} base={config.settings.base_quantity} item={config.settings.item_name}
        onSave={(ranks) => save('/api/leadership/rank-rewards/ranks', 'PUT', { ranks }, 'Rank coefficients saved')} />
      <BonusesCard config={config}
        onAdd={(b) => save('/api/leadership/rank-rewards/bonuses', 'POST', b, 'Threshold added')}
        onUpdate={(id, b) => save(`/api/leadership/rank-rewards/bonuses/${id}`, 'PATCH', b, 'Threshold updated')}
        onDelete={(id) => save(`/api/leadership/rank-rewards/bonuses/${id}`, 'DELETE', null, 'Threshold removed')} />
      <MemberList key={listKey} />
    </div>
  )
}

// ── Base reward ───────────────────────────────────────────────────────────────
function SettingsCard({ settings, onSave }) {
  const [f, setF] = useState(settings)
  useEffect(() => setF(settings), [settings])
  const dirty = ['base_quantity', 'item_id', 'item_name', 'armory_tab'].some(k => String(f[k]) !== String(settings[k]))
  return (
    <div style={card}>
      <h3 style={h3}>Base reward</h3>
      <p style={sub}>What's given at x1.0. Change the item here if the reward ever moves away from Xanax — the userscript fills the give form for whatever item ID is set.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <div><label style={label}>Base quantity</label><input type="number" min="0" value={f.base_quantity} onChange={e => setF({ ...f, base_quantity: e.target.value })} style={input} /></div>
        <div><label style={label}>Item name</label><input value={f.item_name} onChange={e => setF({ ...f, item_name: e.target.value })} style={input} /></div>
        <div><label style={label}>Torn item ID</label><input type="number" min="1" value={f.item_id} onChange={e => setF({ ...f, item_id: e.target.value })} style={input} /></div>
        <div><label style={label} title="Faction armoury sub-tab the userscript opens to give the item (drugs, medical, boosters, temporary…)">Armoury tab</label><input value={f.armory_tab} onChange={e => setF({ ...f, armory_tab: e.target.value })} style={input} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <button disabled={!dirty} onClick={() => onSave(f)} style={btn(true, !dirty)}>Save base reward</button>
        {settings.updated_by && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Last changed by {settings.updated_by}</span>}
      </div>
    </div>
  )
}

// ── Rank coefficients ─────────────────────────────────────────────────────────
function RanksCard({ ranks, base, item, onSave }) {
  const [vals, setVals] = useState(() => Object.fromEntries(ranks.map(r => [r.rank_name, r.coefficient])))
  useEffect(() => setVals(Object.fromEntries(ranks.map(r => [r.rank_name, r.coefficient]))), [ranks])
  const dirty = ranks.some(r => Number(vals[r.rank_name]) !== r.coefficient)
  return (
    <div style={card}>
      <h3 style={h3}>Rank coefficients</h3>
      <p style={sub}>Multiplier per earned rank. 0 = no reward for that rank (energy bonuses don't apply either).</p>
      <div style={{ display: 'grid', gap: 6 }}>
        {ranks.map(r => {
          const v = Number(vals[r.rank_name])
          return (
            <div key={r.rank_name} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 1fr) 100px minmax(80px, 1fr)', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: RANK_COLORS[r.rank_name] }}>{r.rank_name}</span>
              <input type="number" step="0.1" min="0" value={vals[r.rank_name]} onChange={e => setVals({ ...vals, [r.rank_name]: e.target.value })} style={input} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v > 0 ? `${qtyFor(base, v)} ${item}` : 'no reward'}</span>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 12 }}>
        <button disabled={!dirty} onClick={() => onSave(ranks.map(r => ({ rank_name: r.rank_name, coefficient: Number(vals[r.rank_name]) })))} style={btn(true, !dirty)}>Save coefficients</button>
      </div>
    </div>
  )
}

// ── Energy bonuses ────────────────────────────────────────────────────────────
function BonusesCard({ config, onAdd, onUpdate, onDelete }) {
  const { bonuses, ranks, settings } = config
  const energy = bonuses.filter(b => b.category === 'energy').sort((a, b) => a.threshold - b.threshold)
  const [nt, setNt] = useState('')
  const [ni, setNi] = useState('0.2')
  const active = energy.filter(b => b.is_active)
  const paid = ranks.filter(r => r.coefficient > 0)

  return (
    <div style={card}>
      <h3 style={h3}>Energy bonuses</h3>
      <p style={sub}>
        Extra coefficient for members whose <strong>average daily energy last month</strong> (gym + attacks, the same figure as Warnings → Generate → Energy) reached a threshold.
        Only the <strong>highest</strong> threshold a member reaches applies — set each tier's increment to the full bonus for that tier (e.g. 1,000 → +0.2, 1,400 → +0.4).
      </p>

      {energy.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>No energy thresholds yet.</p>}
      <div style={{ display: 'grid', gap: 6 }}>
        {energy.map(b => <BonusRow key={b.id} b={b} onUpdate={onUpdate} onDelete={onDelete} />)}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ flex: '1 1 140px' }}><label style={label}>Avg energy / day ≥</label><input type="number" min="0" placeholder="e.g. 1000" value={nt} onChange={e => setNt(e.target.value)} style={input} /></div>
        <div style={{ flex: '1 1 110px' }}><label style={label}>Adds coefficient</label><input type="number" step="0.1" value={ni} onChange={e => setNi(e.target.value)} style={input} /></div>
        <button disabled={nt === '' || ni === ''} onClick={() => { onAdd({ category: 'energy', threshold: Number(nt), increment: Number(ni), is_active: true }); setNt('') }} style={btn(true, nt === '' || ni === '')}>Add threshold</button>
      </div>

      {active.length > 0 && paid.length > 0 && (
        <div style={{ marginTop: 16, overflowX: 'auto' }}>
          <p style={{ ...label, marginBottom: 6 }}>What each rank receives</p>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 320 }}>
            <thead>
              <tr>
                <th style={th}>Rank</th>
                <th style={th}>Below {active[0].threshold.toLocaleString()}</th>
                {active.map(b => <th key={b.id} style={th}>≥ {b.threshold.toLocaleString()}</th>)}
              </tr>
            </thead>
            <tbody>
              {paid.map(r => (
                <tr key={r.rank_name}>
                  <td style={{ ...td, color: RANK_COLORS[r.rank_name], fontWeight: 700 }}>{r.rank_name}</td>
                  <td style={td}>{qtyFor(settings.base_quantity, r.coefficient)} <span style={{ color: 'var(--text-faint)' }}>{fmtCoef(r.coefficient)}</span></td>
                  {active.map(b => {
                    const c = Math.round((r.coefficient + b.increment) * 100) / 100
                    return <td key={b.id} style={td}>{qtyFor(settings.base_quantity, c)} <span style={{ color: 'var(--text-faint)' }}>{fmtCoef(c)}</span></td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
const th = { textAlign: 'left', padding: '4px 10px', color: 'var(--text-muted)', fontWeight: 500, borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }
const td = { padding: '4px 10px', color: '#f4f4f5', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' }

function BonusRow({ b, onUpdate, onDelete }) {
  const [t, setT] = useState(b.threshold), [i, setI] = useState(b.increment)
  useEffect(() => { setT(b.threshold); setI(b.increment) }, [b])
  const dirty = Number(t) !== b.threshold || Number(i) !== b.increment
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', opacity: b.is_active ? 1 : 0.55 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>⚡ ≥</span>
      <input type="number" min="0" value={t} onChange={e => setT(e.target.value)} style={{ ...input, width: 100 }} />
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>energy/day → +</span>
      <input type="number" step="0.1" value={i} onChange={e => setI(e.target.value)} style={{ ...input, width: 80 }} />
      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
        {dirty && <button onClick={() => onUpdate(b.id, { threshold: Number(t), increment: Number(i) })} style={btn(true)}>Save</button>}
        <button onClick={() => onUpdate(b.id, { is_active: !b.is_active })} style={btn(false)}>{b.is_active ? 'Disable' : 'Enable'}</button>
        <button onClick={() => { if (window.confirm(`Remove the ${b.threshold.toLocaleString()} energy threshold?`)) onDelete(b.id) }} style={{ ...btn(false), color: '#f87171', borderColor: 'rgba(248,113,113,0.35)' }}>Remove</button>
      </div>
    </div>
  )
}

// ── Member list (mirrors the userscript) ──────────────────────────────────────
function MemberList() {
  const now = new Date()
  const [ym, setYm] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 })
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [open, setOpen] = useState(() => new Set([33097]))
  const [showAcolytes, setShowAcolytes] = useState(false)

  useEffect(() => {
    setData(null); setErr(null)
    api(`/api/leadership/rank-rewards/members?year=${ym.year}&month=${ym.month}`).then(setData).catch(e => setErr(e.message))
  }, [ym])

  const months = useMemo(() => Array.from({ length: 6 }, (_, k) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1))
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  const item = data?.settings?.item_name || 'Xanax'
  const base = data?.settings?.base_quantity ?? 5
  const rankOrder = (data?.ranks || []).map(r => r.rank_name)
  const coefOf = Object.fromEntries((data?.ranks || []).map(r => [r.rank_name, r.coefficient]))

  const totals = useMemo(() => {
    const ms = (data?.members || []).filter(m => m.quantity > 0)
    const receiving = ms.filter(m => !m.is_warned && !m.is_visitor)
    return {
      receiving: receiving.length,
      qty: receiving.reduce((s, m) => s + m.quantity, 0),
      given: receiving.filter(m => m.is_complete).length,
      warned: ms.filter(m => m.is_warned).length,
      bonus: receiving.filter(m => m.energy_bonus).length,
    }
  }, [data])

  const toggle = (id) => setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h3 style={h3}>Member list</h3>
          <p style={{ ...sub, marginBottom: 8 }}>
            Exactly what the userscript shows for {MONTHS[ym.month - 1]} {ym.year}
            {data?.energy_month ? ` — energy from ${MONTHS[data.energy_month.month - 1]}` : ''}.
          </p>
        </div>
        <select value={`${ym.year}-${ym.month}`} onChange={e => { const [y, m] = e.target.value.split('-').map(Number); setYm({ year: y, month: m }) }} style={{ ...input, width: 'auto' }}>
          {months.map(m => <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{MONTHS[m.month - 1]} {m.year}</option>)}
        </select>
      </div>

      {err && <p style={{ color: '#f87171', fontSize: 13 }}>{err}</p>}
      {!data && !err && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Calculating rewards…</p>}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 12px' }}>
            <Tile l="Receiving" v={totals.receiving} />
            <Tile l={`Total ${item}`} v={totals.qty} c="#c4b5fd" />
            <Tile l="Given so far" v={`${totals.given}/${totals.receiving}`} c="#4ade80" />
            <Tile l="Energy bonus" v={totals.bonus} c="#fbbf24" />
            <Tile l="Blocked (warned)" v={totals.warned} c="#f87171" />
          </div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={showAcolytes} onChange={() => setShowAcolytes(v => !v)} /> Also show Acolytes (not in the userscript — no reward)
          </label>

          {FACTIONS.map(f => {
            const fm = data.members.filter(m => m.faction_id === f.id && (showAcolytes || m.derived_rank !== 'Acolyte'))
            if (!fm.length) return null
            const isOpen = open.has(f.id)
            return (
              <div key={f.id} style={{ marginTop: 8 }}>
                <button onClick={() => toggle(f.id)} style={{
                  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                  background: 'rgba(192,132,252,0.08)', border: '1px solid rgba(192,132,252,0.25)', color: '#c084fc', fontWeight: 600, fontSize: 13,
                }}>
                  <span>{f.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({fm.length})</span></span>
                  <span>{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && rankOrder.map(rank => {
                  const rm = fm.filter(m => m.derived_rank === rank)
                  if (!rm.length) return null
                  const coef = coefOf[rank] ?? 0
                  return (
                    <div key={rank} style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 10px', borderLeft: `3px solid ${RANK_COLORS[rank]}`, background: 'rgba(255,255,255,0.03)', fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: RANK_COLORS[rank], textTransform: 'uppercase' }}>{rank}s</span>
                        <span style={{ color: 'var(--text-muted)' }}>{coef > 0 ? `${fmtCoef(coef)} (${qtyFor(base, coef)} ${item})` : 'no reward'}</span>
                      </div>
                      <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
                        {rm.map(m => <MemberRow key={m.torn_user_id} m={m} item={item} />)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function Tile({ l, v, c }) {
  return (
    <div style={{ flex: '1 1 110px', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: c || '#f4f4f5' }}>{v}</div>
    </div>
  )
}

function MemberRow({ m, item }) {
  const status = m.is_complete
    ? { t: `✔ Given${m.given_quantity && m.given_quantity !== m.quantity ? ` (${m.given_quantity})` : ''}`, c: '#4ade80', bg: 'rgba(74,222,128,0.06)' }
    : m.is_warned ? { t: '⚠ Warned last month', c: '#f87171', bg: 'rgba(248,113,113,0.06)' }
    : m.is_visitor ? { t: '👁 Visitor (Socius)', c: '#9db8d8', bg: 'rgba(46,63,90,0.25)' }
    : m.quantity <= 0 ? { t: 'No reward', c: 'var(--text-faint)', bg: 'transparent' }
    : { t: 'To give', c: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.02)' }
  const dim = m.is_complete || m.is_warned || m.is_visitor
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', padding: '8px 10px', borderRadius: 8, background: status.bg, border: '1px solid var(--border-subtle)', opacity: dim ? 0.75 : 1 }}>
      <span style={{ flex: '1 1 140px', minWidth: 0, fontSize: 13, fontWeight: 600, color: '#f4f4f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <a href={`https://www.torn.com/profiles.php?XID=${m.torn_user_id}`} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{m.username}</a>
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }} title="Average daily energy last month (gym + attacks)">
        ⚡ {m.avg_energy != null ? m.avg_energy.toLocaleString() : '—'}/day
      </span>
      {m.energy_bonus ? (
        <span style={{ fontSize: 11, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }} title={`Reached the ${m.energy_bonus_threshold?.toLocaleString()} energy threshold`}>
          +{m.energy_bonus} energy
        </span>
      ) : null}
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtCoef(m.coefficient)}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd', whiteSpace: 'nowrap', minWidth: 60, textAlign: 'right' }}>{m.quantity} {item}</span>
      <span style={{ fontSize: 11, color: status.c, whiteSpace: 'nowrap', minWidth: 110, textAlign: 'right' }}>{status.t}</span>
    </div>
  )
}
