import { useState, useEffect, useCallback, useRef } from 'react'
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
        color: '#a1a1aa', fontSize: '18px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(6px)',
        transition: 'opacity 0.2s, color 0.2s',
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = '#f4f4f5'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
      onMouseLeave={e => { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
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

function fmtTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
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

function buildParams(mode, selectedMonth, customFrom, customTo, customDay) {
  if (mode === 'latest') return { mode: 'latest' }
  if (mode === 'custom') return { from: customFrom, to: customTo }
  if (mode === 'day')    return { from: customDay, to: customDay }
  const { year, month } = selectedMonth
  const now = new Date()
  const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth()
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const to = isCurrentMonth
    ? now.toISOString().slice(0, 10)
    : new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)
  return { from, to }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

// Categories with optional subcategories. Flat `keys` for simple cats, `subs` array for grouped ones.
const CATEGORIES = [
  { id: 'attacking',     label: 'Attacking',      subs: [
    { id: 'atk_attacks', label: 'Attacks',         keys: ['atk_won','atk_lost','atk_stalemate','atk_assist','atk_stealth'] },
    { id: 'atk_defends', label: 'Defends',         keys: ['def_won','def_lost','def_stalemate','def_total'] },
    { id: 'atk_combat',  label: 'Combat',          keys: ['hits_success','hits_miss','hits_critical','hits_ohk','dmg_total','dmg_best','elo','unarmored_wins','highest_level','killstreak_best'] },
    { id: 'atk_faction', label: 'Faction',         keys: ['war_hits','raid_hits','faction_respect','faction_retals','wall_joins','wall_clears','wall_time'] },
    { id: 'atk_ammo',    label: 'Ammunition',      keys: ['ammo_total','ammo_special','ammo_hp','ammo_tracer','ammo_piercing','ammo_incendiary'] },
    { id: 'atk_mug',     label: 'Mugging',         keys: ['money_mugged','largest_mug','items_looted'] },
    { id: 'atk_esc',     label: 'Escapes',         keys: ['esc_player','esc_foes'] },
  ]},
  { id: 'jobs',          label: 'Jobs',             keys: ['job_points','trains_received'] },
  { id: 'trading',       label: 'Trading',          subs: [
    { id: 'trd_general', label: 'General',          keys: ['trades','items_sent','bought_market','bought_shops','points_bought','points_sold'] },
    { id: 'trd_auctions',label: 'Auctions',         keys: ['auctions_won','auctions_sold'] },
    { id: 'trd_bazaar',  label: 'Bazaar / IM',      keys: ['bazaar_customers','bazaar_sales','bazaar_profit','imarket_customers','imarket_sales','imarket_revenue'] },
  ]},
  { id: 'jail',          label: 'Jail',             keys: ['times_jailed','busts','bust_fails','bails','bail_fees'] },
  { id: 'hospital',      label: 'Hospital',         keys: ['hosp','medical_items','blood_withdrawn','revives','revives_received'] },
  { id: 'finishing',     label: 'Finishing Hits',   keys: ['fh_heavy_arty','fh_machine_guns','fh_rifles','fh_smg','fh_shotguns','fh_pistols','fh_temporary','fh_piercing','fh_slashing','fh_clubbing','fh_mechanical','fh_h2h'] },
  { id: 'communication', label: 'Comms',            keys: ['mails_total','mails_friends','mails_faction','mails_colleagues','classified_ads'] },
  { id: 'crimes',        label: 'Crimes',           subs: [
    { id: 'crim_totals', label: 'Totals',           keys: ['crimes','oc'] },
    { id: 'crim_types',  label: 'By Type',          keys: ['crime_vandalism','crime_fraud','crime_theft','crime_counterfeit','crime_illicit','crime_cyber','crime_extortion','crime_illprod'] },
  ]},
  { id: 'bounties',      label: 'Bounties',         keys: ['bounties_placed','bounty_val_placed','bounties_coll','bounty_val_coll','bounties_received'] },
  { id: 'items',         label: 'Items',            subs: [
    { id: 'itm_found',   label: 'Found / Coded',    keys: ['items_city','items_dump','items_trashed','viruses_coded'] },
    { id: 'itm_used',    label: 'Used',             keys: ['books_used','boosters_used','consumables_used','candy_used','alcohol_used','energy_used'] },
  ]},
  { id: 'travel',        label: 'Travel',           subs: [
    { id: 'trv_main',    label: 'Overview',         keys: ['travel','travel_time','travel_items','travel_atk_won','travel_def_lost'] },
    { id: 'trv_dest',    label: 'Destinations',     keys: ['travel_argentina','travel_canada','travel_cayman','travel_china','travel_hawaii','travel_japan','travel_mexico','travel_uae','travel_uk','travel_sa','travel_swiss'] },
  ]},
  { id: 'drugs',         label: 'Drugs',            subs: [
    { id: 'drg_totals',  label: 'Totals',           keys: ['drugs','drug_overdoses','drug_rehabs'] },
    { id: 'drg_types',   label: 'By Type',          keys: ['drug_cannabis','drug_ecstasy','drug_ketamine','drug_lsd','drug_opium','drug_pcp','drug_shrooms','drug_speed','drug_vicodin','drug_xanax'] },
  ]},
  { id: 'missions',      label: 'Missions',         keys: ['missions','contracts','mission_credits'] },
  { id: 'racing',        label: 'Racing',           keys: ['races_entered','races_won','racing_points'] },
  { id: 'networth',      label: 'Networth',         keys: ['networth'] },
  { id: 'other',         label: 'Other',            subs: [
    { id: 'oth_activity',label: 'Activity',         keys: ['active_time','streak_current','streak_best','awards','donator_days'] },
    { id: 'oth_misc',    label: 'Misc',             keys: ['refills_energy','refills_nerve','merits_bought','ranked_war_wins'] },
  ]},
]

// Returns the active key list given a category and subcategory id
function getActiveKeys(catId, subId) {
  const cat = CATEGORIES.find(c => c.id === catId)
  if (!cat) return []
  if (cat.subs) {
    const sub = cat.subs.find(s => s.id === subId) ?? cat.subs[0]
    return sub.keys
  }
  return cat.keys
}

// Time-formatted stat keys (seconds → human readable)
const TIME_KEYS = new Set(['active_time', 'wall_time', 'travel_time'])

const FACTION_NAMES  = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' }
const FACTION_COLORS = { 33097: '#b3123f', 9728: '#6d28d9', 9171: '#0e7490' }
const SERIES_COLORS  = ['#f43f5e', '#8b5cf6', '#22d3ee', '#f97316']

// ─── Period picker ─────────────────────────────────────────────────────────────

const psDateInput = {
  padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
  background: '#18181b', color: '#f4f4f5', fontSize: '13px',
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
      {[['latest', 'Latest'], ['month', 'By Month'], ['day', 'Per Day'], ['custom', 'Custom Range']].map(([m, label]) => (
        <button key={m} onClick={() => setMode(m)} style={{
          padding: '7px 16px', borderRadius: '8px',
          border: `1px solid ${mode === m ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
          background: mode === m ? 'rgba(179,18,63,0.15)' : 'transparent',
          color: mode === m ? '#f4f4f5' : '#a1a1aa', fontSize: '13px',
          fontWeight: mode === m ? '600' : '400', cursor: 'pointer',
        }}>
          {label}
        </button>
      ))}

      {mode === 'latest' && (
        <span style={{ color: '#52525b', fontSize: '12px', alignSelf: 'center' }}>
          Showing totals from each member's most recent snapshot
        </span>
      )}

      {mode === 'month' && (
        <select
          value={`${selectedMonth.year}-${selectedMonth.month}`}
          onChange={e => { const [y, mo] = e.target.value.split('-').map(Number); setSelectedMonth({ year: y, month: mo }) }}
          style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#18181b', color: '#f4f4f5', fontSize: '13px', cursor: 'pointer' }}
        >
          {months.map(({ year, month }) => {
            const isCurrent = year === now.getUTCFullYear() && month === now.getUTCMonth()
            const noData = isMonthBeforeData(year, month)
            return (
              <option key={`${year}-${month}`} value={`${year}-${month}`} disabled={noData} style={{ color: noData ? '#52525b' : '#f4f4f5' }}>
                {monthLabel(year, month)}{isCurrent ? ' (this month)' : ''}{noData ? ' — no data' : ''}
              </option>
            )
          })}
        </select>
      )}

      {mode === 'day' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ color: '#a1a1aa', fontSize: '12px' }}>Date (UTC)</label>
          <input type="date" value={customDay} min={minDate} onChange={e => setCustomDay(e.target.value)} style={psDateInput} />
        </div>
      )}

      {mode === 'custom' && (
        <>
          {[['From', customFrom, setCustomFrom], ['To', customTo, setCustomTo]].map(([lbl, val, setter]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ color: '#a1a1aa', fontSize: '12px' }}>{lbl}</label>
              <input type="date" value={val} min={minDate} onChange={e => setter(e.target.value)} style={psDateInput} />
            </div>
          ))}
        </>
      )}

      {mode !== 'latest' && (
        <button onClick={onApply} style={{
          padding: '7px 16px', borderRadius: '8px', border: '1px solid rgba(179,18,63,0.4)',
          background: 'rgba(179,18,63,0.15)', color: '#f4f4f5', fontSize: '13px', cursor: 'pointer',
        }}>Apply</button>
      )}
    </div>
  )
}

// ─── Faction filter ────────────────────────────────────────────────────────────

function FactionFilter({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
      {[['all','All Factions'],['33097','Occultus'],['9728','Occul2us'],['9171','Occul3us']].map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: '5px 14px', borderRadius: '8px',
          border: `1px solid ${value === v ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
          background: value === v ? 'rgba(179,18,63,0.12)' : 'transparent',
          color: value === v ? '#f4f4f5' : '#a1a1aa', fontSize: '12px', cursor: 'pointer',
        }}>{l}</button>
      ))}
    </div>
  )
}

// ─── Category tabs ─────────────────────────────────────────────────────────────

function CategoryTabs({ activeCat, onChangeCat, activeSub, onChangeSub }) {
  const cat = CATEGORIES.find(c => c.id === activeCat)
  return (
    <div>
      <div style={{ display: 'flex', gap: '4px', marginBottom: cat?.subs ? '8px' : '16px', flexWrap: 'wrap' }}>
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => onChangeCat(c.id)} style={{
            padding: '5px 12px', borderRadius: '8px',
            border: `1px solid ${activeCat === c.id ? 'rgba(109,40,217,0.5)' : 'rgba(255,255,255,0.08)'}`,
            background: activeCat === c.id ? 'rgba(109,40,217,0.15)' : 'transparent',
            color: activeCat === c.id ? '#f4f4f5' : '#a1a1aa', fontSize: '12px',
            fontWeight: activeCat === c.id ? '600' : '400', cursor: 'pointer',
          }}>{c.label}</button>
        ))}
      </div>
      {cat?.subs && (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap', paddingLeft: '4px' }}>
          {cat.subs.map(s => (
            <button key={s.id} onClick={() => onChangeSub(s.id)} style={{
              padding: '3px 12px', borderRadius: '6px',
              border: `1px solid ${activeSub === s.id ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.06)'}`,
              background: activeSub === s.id ? 'rgba(34,211,238,0.08)' : 'transparent',
              color: activeSub === s.id ? '#22d3ee' : '#71717a', fontSize: '11px',
              fontWeight: activeSub === s.id ? '600' : '400', cursor: 'pointer',
            }}>{s.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Stats table ───────────────────────────────────────────────────────────────

function StatsTable({ members, fields, categoryKeys, sortKey, setSortKey, sortDir, setSortDir }) {
  const visibleFields = fields.filter(f => categoryKeys.includes(f.key))

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...members].sort((a, b) => {
    const av = a.stats[sortKey] ?? 0; const bv = b.stats[sortKey] ?? 0
    return sortDir === 'desc' ? bv - av : av - bv
  })

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '500px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <th style={{ textAlign: 'left', padding: '8px 12px', color: '#71717a', fontWeight: '500', width: '32px' }}>#</th>
            <th style={{ textAlign: 'left', padding: '8px 12px', color: '#71717a', fontWeight: '500' }}>Member</th>
            {visibleFields.map(f => (
              <th key={f.key} onClick={() => handleSort(f.key)} style={{
                textAlign: 'right', padding: '8px 12px',
                color: sortKey === f.key ? '#c084fc' : '#71717a',
                fontWeight: sortKey === f.key ? '600' : '500',
                cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
              }}>
                {f.label} {sortKey === f.key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, i) => {
            return (
              <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                <td style={{ padding: '8px 12px', color: '#52525b', fontSize: '11px' }}>{i + 1}</td>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div>
                      <div style={{ color: '#f4f4f5', fontWeight: '500' }}>{m.username}</div>
                      {m.faction_id && (
                        <div style={{ fontSize: '10px', color: FACTION_COLORS[m.faction_id] ?? '#52525b', marginTop: '1px' }}>
                          {FACTION_NAMES[m.faction_id] ?? `Faction ${m.faction_id}`}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                {visibleFields.map(f => (
                  <td key={f.key} style={{
                    padding: '8px 12px', textAlign: 'right',
                    color: (m.stats[f.key] ?? 0) > 0 ? '#f4f4f5' : '#3f3f46',
                    fontWeight: sortKey === f.key ? '600' : '400',
                  }}>
                    {TIME_KEYS.has(f.key) ? fmtTime(m.stats[f.key] ?? 0) : fmt(m.stats[f.key] ?? 0)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ members, coverage, isLatest }) {
  const activeCount  = members.filter(m => Object.values(m.stats).some(v => v > 0)).length
  const totalWarHits = members.reduce((s, m) => s + (m.stats.war_hits ?? 0), 0)
  const totalRevives = members.reduce((s, m) => s + (m.stats.revives ?? 0), 0)
  const totalCrimes  = members.reduce((s, m) => s + (m.stats.crimes ?? 0), 0)

  const tiles = [
    ['Members',        activeCount],
    [isLatest ? 'Total War Hits' : 'War Hits Gained', fmt(totalWarHits)],
    [isLatest ? 'Total Revives'  : 'Revives Gained',  fmt(totalRevives)],
    [isLatest ? 'Total Crimes'   : 'Crimes Gained',   fmt(totalCrimes)],
    ['Days of History', coverage?.days_covered ?? 0],
  ]

  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
      {tiles.map(([l, v]) => (
        <div key={l} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '10px 16px', minWidth: '110px' }}>
          <div style={{ color: '#a1a1aa', fontSize: '11px', marginBottom: '4px' }}>{l}</div>
          <div style={{ color: '#f4f4f5', fontSize: '18px', fontWeight: '600' }}>{v}</div>
        </div>
      ))}
    </div>
  )
}

// ─── SVG Line Chart ────────────────────────────────────────────────────────────

const PAD = { top: 24, right: 24, bottom: 56, left: 62 }
const W = 760, H = 280
const INNER_W = W - PAD.left - PAD.right
const INNER_H = H - PAD.top  - PAD.bottom

function LineChart({ series, statLabel }) {
  const [tooltip, setTooltip] = useState(null)

  // Collect all dates across all series
  const allDates = [...new Set(series.flatMap(s => s.points.map(p => p.date)))].sort()
  if (!allDates.length) return (
    <div style={{ color: '#52525b', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>
      No data points in range.
    </div>
  )

  const maxDelta = Math.max(1, ...series.flatMap(s => s.points.map(p => p.delta)))

  function xOf(date) {
    const i = allDates.indexOf(date)
    if (allDates.length === 1) return INNER_W / 2
    return (i / (allDates.length - 1)) * INNER_W
  }
  function yOf(delta) {
    return INNER_H - (delta / maxDelta) * INNER_H
  }

  // Y axis ticks — up to 5
  const tickCount = Math.min(5, maxDelta)
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((maxDelta / tickCount) * i))

  // X axis labels — show at most 8 evenly spaced
  const xLabelStep = Math.max(1, Math.ceil(allDates.length / 8))
  const xLabels = allDates.filter((_, i) => i % xLabelStep === 0 || i === allDates.length - 1)

  function fmtDate(d) {
    const [, m, day] = d.split('-')
    return `${day}/${m}`
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', overflow: 'visible' }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Grid lines */}
        {yTicks.map(tick => {
          const y = yOf(tick)
          return (
            <g key={tick}>
              <line
                x1={PAD.left} y1={PAD.top + y}
                x2={PAD.left + INNER_W} y2={PAD.top + y}
                stroke="rgba(255,255,255,0.06)" strokeWidth="1"
              />
              <text
                x={PAD.left - 8} y={PAD.top + y + 4}
                textAnchor="end" fill="#52525b" fontSize="10"
              >
                {tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : tick}
              </text>
            </g>
          )
        })}

        {/* X axis labels */}
        {xLabels.map(date => (
          <text
            key={date}
            x={PAD.left + xOf(date)} y={PAD.top + INNER_H + 18}
            textAnchor="middle" fill="#52525b" fontSize="10"
          >
            {fmtDate(date)}
          </text>
        ))}

        {/* Y axis label */}
        <text
          x={14} y={PAD.top + INNER_H / 2}
          textAnchor="middle" fill="#71717a" fontSize="10"
          transform={`rotate(-90, 14, ${PAD.top + INNER_H / 2})`}
        >
          {statLabel}
        </text>

        {/* Series lines */}
        {series.map((s, si) => {
          const color = SERIES_COLORS[si % SERIES_COLORS.length]
          if (!s.points.length) return null
          const pts = s.points.map(p => `${PAD.left + xOf(p.date)},${PAD.top + yOf(p.delta)}`).join(' ')
          return (
            <g key={s.id}>
              <polyline
                points={pts}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.9"
              />
              {/* Area fill */}
              <polygon
                points={`${PAD.left + xOf(s.points[0].date)},${PAD.top + INNER_H} ${pts} ${PAD.left + xOf(s.points[s.points.length - 1].date)},${PAD.top + INNER_H}`}
                fill={color}
                opacity="0.06"
              />
              {/* Data points — hit targets */}
              {s.points.map((p, pi) => (
                <circle
                  key={pi}
                  cx={PAD.left + xOf(p.date)} cy={PAD.top + yOf(p.delta)}
                  r="5"
                  fill="transparent"
                  stroke="transparent"
                  onMouseEnter={() => setTooltip({ x: PAD.left + xOf(p.date), y: PAD.top + yOf(p.delta), date: p.date, delta: p.delta, username: s.username, color })}
                  style={{ cursor: 'crosshair' }}
                />
              ))}
              {/* Visible dots */}
              {s.points.map((p, pi) => (
                <circle
                  key={`dot-${pi}`}
                  cx={PAD.left + xOf(p.date)} cy={PAD.top + yOf(p.delta)}
                  r="3" fill={color} stroke="#0d0d14" strokeWidth="1.5"
                  style={{ pointerEvents: 'none' }}
                />
              ))}
            </g>
          )
        })}

        {/* Tooltip vertical line */}
        {tooltip && (
          <line
            x1={tooltip.x} y1={PAD.top}
            x2={tooltip.x} y2={PAD.top + INNER_H}
            stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,3"
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>

      {/* Floating tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          top: `${(tooltip.y / H) * 100}%`,
          left: `${(tooltip.x / W) * 100}%`,
          transform: tooltip.x > W * 0.6 ? 'translate(-110%,-50%)' : 'translate(12px,-50%)',
          background: 'rgba(10,10,18,0.95)',
          border: `1px solid ${tooltip.color}44`,
          borderRadius: '8px',
          padding: '8px 12px',
          fontSize: '12px',
          pointerEvents: 'none',
          zIndex: 10,
          whiteSpace: 'nowrap',
        }}>
          <div style={{ color: tooltip.color, fontWeight: '600', marginBottom: '2px' }}>{tooltip.username}</div>
          <div style={{ color: '#a1a1aa' }}>{tooltip.date}</div>
          <div style={{ color: '#f4f4f5', fontWeight: '600', marginTop: '2px' }}>+{fmt(tooltip.delta)}</div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '8px', justifyContent: 'center' }}>
        {series.map((s, si) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <div style={{ width: '12px', height: '3px', background: SERIES_COLORS[si % SERIES_COLORS.length], borderRadius: '2px' }} />
            <span style={{ color: '#d4d4d8' }}>{s.username ?? `ID ${s.id}`}</span>
            {s.faction_id && (
              <span style={{ color: FACTION_COLORS[s.faction_id] ?? '#52525b', fontSize: '10px' }}>
                {FACTION_NAMES[s.faction_id] ?? ''}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Compare panel ─────────────────────────────────────────────────────────────

function ComparePanel({ allMembers, allFields, minDate }) {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const [mode, setMode]                   = useState('month')
  const [selectedMonth, setSelectedMonth] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() })
  const [customFrom, setCustomFrom]       = useState('')
  const [customTo, setCustomTo]           = useState('')
  const [customDay, setCustomDay]         = useState(todayStr)
  const [selectedStat, setSelectedStat]   = useState('war_hits')
  const [pickedMembers, setPickedMembers] = useState([])
  const [search, setSearch]               = useState('')
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)
  const [chartData, setChartData]         = useState(null)
  const abortRef = useRef(null)

  const filtered = allMembers
    .filter(m => !pickedMembers.find(p => p.id === m.id))
    .filter(m => m.username?.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 20)

  function addMember(m) {
    if (pickedMembers.length >= 4) return
    setPickedMembers(prev => [...prev, { id: m.id, username: m.username, faction_id: m.faction_id }])
    setSearch('')
  }

  function removeMember(id) {
    setPickedMembers(prev => prev.filter(m => m.id !== id))
    setChartData(null)
  }

  const fetchCompare = useCallback(async (params) => {
    if (pickedMembers.length < 2) return
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams({
        members: pickedMembers.map(m => m.id).join(','),
        stat: selectedStat,
        ...params,
      }).toString()
      const res = await fetch(`${API_BASE_URL}/api/leadership/personal-stats/compare?${qs}`, {
        headers: authHeaders(), signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setChartData(await res.json())
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally { setLoading(false) }
  }, [pickedMembers, selectedStat])

  function handleApply() {
    const params = buildParams(mode, selectedMonth, customFrom, customTo, customDay)
    if (params.from && params.to) fetchCompare(params)
  }

  useEffect(() => {
    if (pickedMembers.length >= 2) {
      const params = buildParams(mode, selectedMonth, customFrom, customTo, customDay)
      if (params.from && params.to) fetchCompare(params)
    } else {
      setChartData(null)
    }
    return () => abortRef.current?.abort()
  }, [pickedMembers, selectedStat, mode, selectedMonth, fetchCompare])

  const statField = allFields.find(f => f.key === selectedStat)

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '20px', background: 'rgba(14,14,22,0.6)' }}>
      <h3 style={{ fontFamily: 'Cinzel, serif', color: '#c084fc', fontSize: '15px', letterSpacing: '0.5px', margin: '0 0 20px' }}>
        Compare Members
      </h3>

      {/* Controls row */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'flex-start' }}>

        {/* Member search + chips */}
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ color: '#71717a', fontSize: '11px', marginBottom: '6px' }}>
            Members ({pickedMembers.length}/4)
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {pickedMembers.map((m, i) => (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '4px 10px', borderRadius: '20px',
                background: `${SERIES_COLORS[i]}22`,
                border: `1px solid ${SERIES_COLORS[i]}55`,
                fontSize: '12px', color: '#f4f4f5',
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: SERIES_COLORS[i], flexShrink: 0 }} />
                {m.username}
                <button onClick={() => removeMember(m.id)} style={{
                  background: 'none', border: 'none', color: '#71717a',
                  cursor: 'pointer', padding: '0', lineHeight: 1, fontSize: '13px',
                }}>×</button>
              </div>
            ))}
          </div>
          {pickedMembers.length < 4 && (
            <div style={{ position: 'relative' }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search member…"
                style={{
                  width: '100%', padding: '7px 12px', borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)', background: '#18181b',
                  color: '#f4f4f5', fontSize: '13px', boxSizing: 'border-box',
                }}
              />
              {search && filtered.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                  background: '#18181b', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px', marginTop: '4px', maxHeight: '180px', overflowY: 'auto',
                }}>
                  {filtered.map(m => (
                    <div key={m.id} onClick={() => addMember(m)} style={{
                      padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                      color: '#d4d4d8', display: 'flex', justifyContent: 'space-between',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span>{m.username}</span>
                      {m.faction_id && (
                        <span style={{ color: FACTION_COLORS[m.faction_id] ?? '#52525b', fontSize: '11px' }}>
                          {FACTION_NAMES[m.faction_id]}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stat selector */}
        <div style={{ flex: '1 1 180px' }}>
          <div style={{ color: '#71717a', fontSize: '11px', marginBottom: '6px' }}>Stat</div>
          <select
            value={selectedStat}
            onChange={e => setSelectedStat(e.target.value)}
            style={{ width: '100%', padding: '7px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#18181b', color: '#f4f4f5', fontSize: '13px', cursor: 'pointer' }}
          >
            {CATEGORIES.map(cat => (
              <optgroup key={cat.id} label={cat.label}>
                {allFields.filter(f => (cat.keys ?? cat.subs?.flatMap(s => s.keys) ?? []).includes(f.key)).map(f => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Period */}
        <div style={{ flex: '2 1 300px' }}>
          <div style={{ color: '#71717a', fontSize: '11px', marginBottom: '6px' }}>Period</div>
          <PeriodPicker
            mode={mode} setMode={setMode}
            selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth}
            customFrom={customFrom} setCustomFrom={setCustomFrom}
            customTo={customTo} setCustomTo={setCustomTo}
            customDay={customDay} setCustomDay={setCustomDay}
            onApply={handleApply}
            minDate={minDate}
          />
        </div>
      </div>

      {/* Chart area */}
      {pickedMembers.length < 2 && (
        <div style={{ color: '#52525b', fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>
          Select at least 2 members to compare.
        </div>
      )}
      {pickedMembers.length >= 2 && loading && (
        <div style={{ color: '#a1a1aa', fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>Loading…</div>
      )}
      {error && (
        <div style={{ color: '#f87171', fontSize: '13px', padding: '12px', background: 'rgba(248,113,113,0.06)', borderRadius: '8px' }}>
          {error}
        </div>
      )}
      {!loading && chartData && (
        <div style={{ marginTop: '8px' }}>
          {chartData.series.every(s => !s.points.length) ? (
            <div style={{ color: '#52525b', fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>
              No snapshot data for these members in this period.
            </div>
          ) : (
            <LineChart series={chartData.series} statLabel={statField?.label ?? selectedStat} />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function PersonalStatsPanel() {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const [mode, setMode]                   = useState('latest')
  const [selectedMonth, setSelectedMonth] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() })
  const [customFrom, setCustomFrom]       = useState('')
  const [customTo, setCustomTo]           = useState('')
  const [customDay, setCustomDay]         = useState(todayStr)
  const [factionFilter, setFactionFilter] = useState('all')
  const [activeCat, setActiveCat]         = useState('attacking')
  const [activeSub, setActiveSub]         = useState('atk_attacks')
  const [sortKey, setSortKey]             = useState('atk_won')
  const [sortDir, setSortDir]             = useState('desc')
  const [showCompare, setShowCompare]     = useState(false)

  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [data, setData]         = useState(null)
  const abortRef = useRef(null)

  const minDate = data?.coverage?.earliest || todayStr

  const fetchData = useCallback(async (params) => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams(params).toString()
      const res = await fetch(`${API_BASE_URL}/api/leadership/personal-stats?${qs}`, {
        headers: authHeaders(), signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const params = buildParams(mode, selectedMonth, customFrom, customTo, customDay)
    if (mode === 'latest' || (params.from && params.to)) fetchData(params)
    return () => abortRef.current?.abort()
  }, [mode, selectedMonth, fetchData])

  // Reset subcategory and sort key when top-level category changes
  function handleChangeCat(catId) {
    const cat = CATEGORIES.find(c => c.id === catId)
    const newSub = cat?.subs ? cat.subs[0].id : null
    const newKeys = cat?.subs ? cat.subs[0].keys : (cat?.keys ?? [])
    setActiveCat(catId)
    setActiveSub(newSub)
    setSortKey(newKeys[0] ?? 'atk_won')
  }

  function handleChangeSub(subId) {
    const cat = CATEGORIES.find(c => c.id === activeCat)
    const sub = cat?.subs?.find(s => s.id === subId)
    setActiveSub(subId)
    if (sub?.keys?.[0]) setSortKey(sub.keys[0])
  }

  const handleApply = () => {
    const params = buildParams(mode, selectedMonth, customFrom, customTo, customDay)
    if (params.from && params.to) fetchData(params)
  }

  const members = (data?.members ?? []).filter(m =>
    factionFilter === 'all' || String(m.faction_id) === factionFilter
  )

  return (
    <div>
      {/* Period picker */}
      <PeriodPicker
        mode={mode} setMode={setMode}
        selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth}
        customFrom={customFrom} setCustomFrom={setCustomFrom}
        customTo={customTo} setCustomTo={setCustomTo}
        customDay={customDay} setCustomDay={setCustomDay}
        onApply={handleApply}
        minDate={minDate}
      />

      <FactionFilter value={factionFilter} onChange={setFactionFilter} />

      {loading && (
        <div style={{ color: '#a1a1aa', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>
          Loading personal stats…
        </div>
      )}

      {error && (
        <div style={{ color: '#f87171', fontSize: '13px', padding: '16px', background: 'rgba(248,113,113,0.06)', borderRadius: '8px', marginBottom: '16px' }}>
          Failed to load: {error}
        </div>
      )}

      {!loading && data && (
        <>
          {(!data.members?.length) ? (
            <div style={{ padding: '32px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', background: 'rgba(22,22,32,0.6)' }}>
              <div style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '8px' }}>
                {mode === 'latest' ? 'No snapshot data yet.' : 'No snapshot data for this period.'}
              </div>
              <div style={{ color: '#52525b', fontSize: '12px' }}>Personal stats are snapshotted daily at 01:00 UTC. Data will appear from the next cron run.</div>
            </div>
          ) : (
            <>
              <SummaryBar members={members} coverage={data.coverage} isLatest={mode === 'latest'} />
              {data.coverage && (
                <div style={{ color: '#52525b', fontSize: '11px', marginBottom: '12px' }}>
                  {mode === 'latest'
                    ? `Latest snapshot: ${data.coverage.latest} — ${data.coverage.days_covered} day${data.coverage.days_covered !== 1 ? 's' : ''} of history`
                    : `Snapshots: ${data.coverage.earliest} → ${data.coverage.latest} (${data.coverage.days_covered} day${data.coverage.days_covered !== 1 ? 's' : ''})`}
                </div>
              )}

              {/* Compare — sits above the stats table */}
              <div style={{ marginBottom: '20px' }}>
                <button
                  onClick={() => setShowCompare(v => !v)}
                  style={{
                    padding: '8px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
                    border: `1px solid ${showCompare ? 'rgba(192,132,252,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    background: showCompare ? 'rgba(192,132,252,0.1)' : 'transparent',
                    color: showCompare ? '#c084fc' : '#a1a1aa',
                    transition: 'all 0.15s',
                  }}
                >
                  {showCompare ? '▲ Hide Compare' : '⟺ Compare Members'}
                </button>

                {showCompare && (
                  <div style={{ marginTop: '16px' }}>
                    <ComparePanel allMembers={data.members ?? []} allFields={data.fields ?? []} minDate={minDate} />
                  </div>
                )}
              </div>

              <CategoryTabs
                activeCat={activeCat} onChangeCat={handleChangeCat}
                activeSub={activeSub} onChangeSub={handleChangeSub}
              />

              {members.length === 0 ? (
                <div style={{ color: '#a1a1aa', fontSize: '13px', padding: '24px 0', textAlign: 'center' }}>No members match the current filter.</div>
              ) : (
                <StatsTable
                  members={members}
                  fields={data.fields ?? []}
                  categoryKeys={getActiveKeys(activeCat, activeSub)}
                  sortKey={sortKey} setSortKey={setSortKey}
                  sortDir={sortDir} setSortDir={setSortDir}
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
