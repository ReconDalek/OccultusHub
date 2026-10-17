import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiSend, card, sectionTitle, OCC_FACTIONS, tctInputToUnix } from './chainWatcherUtils'

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)',
  color: '#f4f4f5', fontSize: 13, boxSizing: 'border-box',
}
const labelStyle = { color: 'var(--text-secondary)', fontSize: 12, display: 'block', marginBottom: 4 }
const btn = {
  padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
}
const primaryBtn = { ...btn, background: '#b3123f', color: '#fff' }
const ghostBtn = { ...btn, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }

const REMOVAL_MODES = [
  { value: 'all_tickets', label: 'Remove all of the winner’s tickets', hint: 'They can’t win again this round (recommended)' },
  { value: 'single_ticket', label: 'Remove only the winning ticket', hint: 'They could still win again with their other tickets' },
]
const ANIMATION_STYLES = [
  { value: 'slot_machine', label: 'Slot machine' },
  { value: 'wheel', label: 'Spinning wheel' },
  { value: 'lotto_balls', label: 'Lotto balls' },
]

export default function RaffleTab() {
  const [factionId, setFactionId] = useState(OCC_FACTIONS[0].id)
  const [rounds, setRounds] = useState([])
  const [activeRoundId, setActiveRoundId] = useState(null)
  const [loadingRounds, setLoadingRounds] = useState(true)

  const loadRounds = async (fid) => {
    try {
      setLoadingRounds(true)
      const json = await apiGet(`/api/chain-watcher/raffle/rounds?faction_id=${fid}`)
      setRounds(json.rounds || [])
    } catch (err) {
      console.error('Failed to load raffle rounds:', err)
    } finally {
      setLoadingRounds(false)
    }
  }

  useEffect(() => { loadRounds(factionId) }, [factionId])

  if (activeRoundId) {
    return (
      <RoundDetail
        roundId={activeRoundId}
        onBack={() => { setActiveRoundId(null); loadRounds(factionId) }}
      />
    )
  }

  return (
    <div>
      <div style={card}>
        <p style={sectionTitle}>New Raffle</p>
        <NewRoundForm factionId={factionId} onFactionChange={setFactionId} onCreated={(id) => setActiveRoundId(id)} />
      </div>

      <div style={card}>
        <p style={sectionTitle}>Past Raffles</p>
        {loadingRounds ? (
          <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Loading…</p>
        ) : rounds.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No raffles run yet for this faction.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rounds.map(r => (
              <button
                key={r.id}
                onClick={() => setActiveRoundId(r.id)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left',
                  padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                  background: 'rgba(255,255,255,0.03)', color: '#f4f4f5', cursor: 'pointer', fontSize: 13,
                }}
              >
                <span>
                  {new Date(r.period_start * 1000).toLocaleDateString()} &ndash; {new Date(r.period_end * 1000).toLocaleDateString()}
                  <span style={{ color: 'var(--text-faint)', marginLeft: 8 }}>({r.draw_count} draw{r.draw_count === 1 ? '' : 's'})</span>
                </span>
                <StatusBadge status={r.status} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const styles = {
    building: { bg: 'rgba(251,191,36,0.2)', color: '#fbbf24', label: 'Building' },
    ready: { bg: 'rgba(96,165,250,0.2)', color: '#60a5fa', label: 'Ready' },
    completed: { bg: 'rgba(74,222,128,0.2)', color: '#4ade80', label: 'Completed' },
  }
  const s = styles[status] || styles.building
  return (
    <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

// ─── Setup form ──────────────────────────────────────────────────────────────

function NewRoundForm({ factionId, onFactionChange, onCreated }) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [drawCount, setDrawCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!start || !end) { setError('Pick a start and end date/time'); return }
    setBusy(true)
    setError('')
    try {
      const json = await apiSend('/api/chain-watcher/raffle/rounds', 'POST', {
        faction_id: factionId,
        period_start: tctInputToUnix(start),
        period_end: tctInputToUnix(end),
        draw_count: Number(drawCount) || 1,
      })
      onCreated(json.round.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={labelStyle}>Faction</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {OCC_FACTIONS.map(f => (
            <button key={f.id} type="button" onClick={() => onFactionChange(f.id)}
              style={{
                flex: 1, padding: '8px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                border: `1px solid ${factionId === f.id ? '#b3123f' : 'rgba(255,255,255,0.1)'}`,
                background: factionId === f.id ? 'rgba(179,18,63,0.15)' : 'transparent',
                color: factionId === f.id ? '#f4f4f5' : 'var(--text-secondary)',
              }}
            >{f.label}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={labelStyle}>Period start (TCT)</label>
          <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={labelStyle}>Period end (TCT)</label>
          <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ width: 110 }}>
          <label style={labelStyle}>Raffles to run</label>
          <input type="number" min={1} value={drawCount} onChange={e => setDrawCount(e.target.value)} style={inputStyle} />
        </div>
      </div>
      <p style={{ color: 'var(--text-faint)', fontSize: 12, margin: 0 }}>
        Pulls every watched hour slot in this window as a ticket &mdash; one per slot, so more hours watched means more chances.
      </p>
      {error && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{error}</p>}
      <div>
        <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Building pool…' : 'Build Pool'}
        </button>
      </div>
    </form>
  )
}

// ─── Round detail ────────────────────────────────────────────────────────────

function RoundDetail({ roundId, onBack }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [removalMode, setRemovalMode] = useState('all_tickets')
  const [animationStyle, setAnimationStyle] = useState('slot_machine')
  const [drawing, setDrawing] = useState(null) // { pool, winner, remainingTickets } while animation plays

  const load = async () => {
    try {
      const json = await apiGet(`/api/chain-watcher/raffle/rounds/${roundId}`)
      setData(json)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => { load() }, [roundId])

  const review = async (entryId, decision) => {
    try {
      await apiSend(`/api/chain-watcher/raffle/entries/${entryId}/review`, 'POST', { decision })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const deleteRound = async () => {
    if (!confirm('Delete this raffle round? This only works before any draws have been run.')) return
    try {
      await apiSend(`/api/chain-watcher/raffle/rounds/${roundId}`, 'DELETE')
      onBack()
    } catch (err) {
      setError(err.message)
    }
  }

  const completeRound = async () => {
    try {
      await apiSend(`/api/chain-watcher/raffle/rounds/${roundId}/complete`, 'POST')
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const runDraw = async () => {
    setError('')
    try {
      // The pool "as it stands right now" — for the animation to shuffle
      // through — is every live ticket this round, derived client-side from
      // what we already loaded (entries minus already-removed winners),
      // mirroring exactly what the backend itself will draw from.
      const removedUserIds = new Set(
        data.winners.filter(w => w.removal_mode === 'all_tickets').map(w => w.torn_user_id)
      )
      const removedEntryIds = new Set(
        data.winners.filter(w => w.winning_entry_id).map(w => w.winning_entry_id)
      )
      const livePool = data.entries
        .filter(e => (e.review_status === 'auto' || e.review_status === 'included'))
        .filter(e => !removedUserIds.has(e.torn_user_id) && !removedEntryIds.has(e.id))

      if (!livePool.length) { setError('No tickets left in the pool.'); return }

      const json = await apiSend(`/api/chain-watcher/raffle/rounds/${roundId}/draw`, 'POST', {
        removal_mode: removalMode, animation_style: animationStyle,
      })
      setDrawing({ pool: livePool, winner: json.winner, remainingTickets: json.remainingTickets })
    } catch (err) {
      setError(err.message)
    }
  }

  if (error && !data) return <div style={card}><p style={{ color: '#f87171', fontSize: 13 }}>{error}</p></div>
  if (!data) return <div style={card}><p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Loading…</p></div>

  const { round, entries, overview, winners } = data
  const pending = entries.filter(e => e.review_status === 'pending')
  const liveTicketCount = entries.filter(e => e.review_status === 'auto' || e.review_status === 'included').length
    - winners.reduce((sum, w) => sum + (w.removal_mode === 'all_tickets'
        ? entries.filter(e => e.torn_user_id === w.torn_user_id && (e.review_status === 'auto' || e.review_status === 'included')).length
        : 1), 0)

  return (
    <div>
      <button onClick={onBack} style={{ ...ghostBtn, marginBottom: 16 }}>&larr; Back to raffles</button>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ ...sectionTitle, margin: 0 }}>
            {OCC_FACTIONS.find(f => f.id === round.faction_id)?.label} Raffle
          </p>
          <StatusBadge status={round.status} />
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
          {new Date(round.period_start * 1000).toLocaleString()} &ndash; {new Date(round.period_end * 1000).toLocaleString()}
        </p>
        <p style={{ color: 'var(--text-faint)', fontSize: 12, margin: '4px 0 0' }}>
          {entries.length} ticket{entries.length === 1 ? '' : 's'} pulled &middot; {liveTicketCount} still in the pool &middot; aiming for {round.draw_count} winner{round.draw_count === 1 ? '' : 's'}
        </p>
        {round.status === 'building' && winners.length === 0 && (
          <div style={{ marginTop: 10 }}>
            <button onClick={deleteRound} style={{ ...ghostBtn, color: '#f87171' }}>Delete round</button>
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <div style={card}>
          <p style={sectionTitle}>Needs Review ({pending.length})</p>
          <p style={{ color: 'var(--text-faint)', fontSize: 12, margin: '0 0 10px' }}>
            These watched hours have a leader note attached &mdash; decide whether each one still counts as a ticket before running the raffle.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pending.map(e => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: '#f4f4f5', fontSize: 13, fontWeight: 600 }}>{e.username || e.torn_user_id}</div>
                  <div style={{ color: 'var(--text-faint)', fontSize: 11 }}>
                    {new Date(e.slot_start * 1000).toLocaleString()} &mdash; &ldquo;{e.note}&rdquo;
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => review(e.id, 'included')} style={{ ...ghostBtn, color: '#4ade80', padding: '6px 12px', fontSize: 12 }}>Include</button>
                  <button onClick={() => review(e.id, 'excluded')} style={{ ...ghostBtn, color: '#f87171', padding: '6px 12px', fontSize: 12 }}>Exclude</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={card}>
        <p style={sectionTitle}>Unique Watchers</p>
        {overview.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No watched hours in this window.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
            {overview.map(o => (
              <div key={o.torn_user_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 2px' }}>
                <span style={{ color: '#f4f4f5' }}>{o.username || o.torn_user_id}</span>
                <span style={{ color: 'var(--text-faint)' }}>{o.slots} hour{o.slots === 1 ? '' : 's'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {winners.length > 0 && (
        <div style={card}>
          <p style={sectionTitle}>Winners</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {winners.map(w => (
              <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#f4f4f5' }}>#{w.draw_number} &mdash; {w.username || w.torn_user_id}</span>
                <span style={{ color: 'var(--text-faint)' }}>{new Date(w.drawn_at.replace(' ', 'T') + 'Z').toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={card}>
        <p style={sectionTitle}>Run a Draw</p>
        {pending.length > 0 ? (
          <p style={{ color: '#fbbf24', fontSize: 13 }}>Resolve the {pending.length} note{pending.length === 1 ? '' : 's'} above first.</p>
        ) : drawing ? (
          <DrawAnimation
            style={animationStyle}
            pool={drawing.pool}
            winner={drawing.winner}
            onDone={() => setDrawing(null)}
          />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>If the winner is drawn again</label>
                {REMOVAL_MODES.map(m => (
                  <label key={m.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 6, cursor: 'pointer' }}>
                    <input type="radio" name="removalMode" checked={removalMode === m.value} onChange={() => setRemovalMode(m.value)} style={{ marginTop: 3 }} />
                    <span>{m.label}<br /><span style={{ color: 'var(--text-faint)', fontSize: 11 }}>{m.hint}</span></span>
                  </label>
                ))}
              </div>
              <div>
                <label style={labelStyle}>Draw animation</label>
                {ANIMATION_STYLES.map(a => (
                  <label key={a.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 6, cursor: 'pointer' }}>
                    <input type="radio" name="animStyle" checked={animationStyle === a.value} onChange={() => setAnimationStyle(a.value)} />
                    {a.label}
                  </label>
                ))}
              </div>
            </div>
            {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={runDraw} disabled={liveTicketCount <= 0} style={{ ...primaryBtn, opacity: liveTicketCount <= 0 ? 0.5 : 1 }}>
                Draw Winner {winners.length > 0 ? `(#${winners.length + 1})` : ''}
              </button>
              {round.status !== 'completed' && winners.length > 0 && (
                <button onClick={completeRound} style={ghostBtn}>Mark Round Complete</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Draw animations ─────────────────────────────────────────────────────────

function DrawAnimation({ style, pool, winner, onDone }) {
  if (style === 'wheel') return <SpinWheel pool={pool} winner={winner} onDone={onDone} />
  if (style === 'lotto_balls') return <LottoBalls pool={pool} winner={winner} onDone={onDone} />
  return <SlotMachineReel pool={pool} winner={winner} onDone={onDone} />
}

const ITEM_H = 48
const VISIBLE = 5
const CENTER_OFFSET = Math.floor(VISIBLE / 2)

function SlotMachineReel({ pool, winner, onDone }) {
  const reel = useMemo(() => {
    const names = pool.length ? pool : [winner]
    const arr = []
    for (let i = 0; i < 4; i++) arr.push(...[...names].sort(() => Math.random() - 0.5))
    arr.push(winner)
    return arr
  }, [pool, winner])

  const finalTranslate = -(reel.length - 1 - CENTER_OFFSET) * ITEM_H
  const [translateY, setTranslateY] = useState(0)

  useEffect(() => {
    const spin = setTimeout(() => setTranslateY(finalTranslate), 50)
    const done = setTimeout(() => onDone?.(), 3300)
    return () => { clearTimeout(spin); clearTimeout(done) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', height: ITEM_H * VISIBLE, width: 260, overflow: 'hidden', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)' }}>
        <div style={{
          position: 'absolute', top: ITEM_H * CENTER_OFFSET, left: 0, right: 0, height: ITEM_H,
          background: 'rgba(179,18,63,0.18)', borderTop: '2px solid #b3123f', borderBottom: '2px solid #b3123f', zIndex: 2, pointerEvents: 'none',
        }} />
        <div style={{ transform: `translateY(${translateY}px)`, transition: 'transform 3s cubic-bezier(0.08,0.75,0.15,1)' }}>
          {reel.map((p, i) => (
            <div key={i} style={{ height: ITEM_H, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: '#f4f4f5' }}>
              {p.username || p.torn_user_id}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const WHEEL_PALETTE = ['#b3123f', '#8b5cf6', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#ef4444', '#14b8a6', '#eab308', '#6366f1']

function SpinWheel({ pool, winner, onDone }) {
  const segments = useMemo(() => {
    const map = new Map()
    for (const p of pool) {
      const key = p.torn_user_id
      if (!map.has(key)) map.set(key, { torn_user_id: key, username: p.username, count: 0 })
      map.get(key).count++
    }
    // Safety net: if the client-side pool snapshot somehow doesn't include
    // the actual winner the backend drew, give them a (tiny) segment anyway
    // so the wheel always lands on whoever really won.
    if (!map.has(winner.torn_user_id)) map.set(winner.torn_user_id, { torn_user_id: winner.torn_user_id, username: winner.username, count: 1 })
    const list = [...map.values()]
    const total = list.reduce((s, c) => s + c.count, 0) || 1
    let acc = 0
    return list.map(c => {
      const span = (c.count / total) * 360
      const seg = { ...c, startAngle: acc, endAngle: acc + span }
      acc += span
      return seg
    })
  }, [pool])

  const winnerSeg = segments.find(s => s.torn_user_id === winner.torn_user_id) || segments[0]
  const winnerMid = winnerSeg ? (winnerSeg.startAngle + winnerSeg.endAngle) / 2 : 0
  const finalRotation = 5 * 360 + (360 - winnerMid)

  const [rotation, setRotation] = useState(0)
  useEffect(() => {
    const spin = setTimeout(() => setRotation(finalRotation), 50)
    const done = setTimeout(() => onDone?.(), 4000)
    return () => { clearTimeout(spin); clearTimeout(done) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const gradient = segments.map((s, i) => `${WHEEL_PALETTE[i % WHEEL_PALETTE.length]} ${s.startAngle}deg ${s.endAngle}deg`).join(',')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', width: 220, height: 220 }}>
        <div style={{
          width: '100%', height: '100%', borderRadius: '50%',
          background: `conic-gradient(${gradient})`,
          transform: `rotate(${rotation}deg)`,
          transition: 'transform 3.8s cubic-bezier(0.1,0.65,0.15,1)',
          border: '3px solid rgba(255,255,255,0.2)',
          boxShadow: '0 0 30px rgba(0,0,0,0.4)',
        }} />
        <div style={{
          position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0, borderLeft: '11px solid transparent', borderRight: '11px solid transparent', borderTop: '20px solid #f4f4f5',
        }} />
      </div>
    </div>
  )
}

function LottoBalls({ pool, winner, onDone }) {
  const balls = useMemo(() => {
    const map = new Map()
    for (const p of pool) { if (!map.has(p.torn_user_id)) map.set(p.torn_user_id, p) }
    if (!map.has(winner.torn_user_id)) map.set(winner.torn_user_id, winner)
    return [...map.values()]
  }, [pool, winner])

  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const reveal = setTimeout(() => setRevealed(true), 2500)
    const done = setTimeout(() => onDone?.(), 3800)
    return () => { clearTimeout(reveal); clearTimeout(done) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ position: 'relative', minHeight: 170, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
      <style>{`@keyframes lottoJitter { from{transform:translateY(-5px) rotate(-3deg)} to{transform:translateY(5px) rotate(3deg)} }`}</style>
      {balls.map((b, i) => {
        const isWinner = b.torn_user_id === winner.torn_user_id
        const big = revealed && isWinner
        return (
          <div key={b.torn_user_id} style={{
            width: big ? 100 : 44, height: big ? 100 : 44, borderRadius: '50%',
            background: isWinner ? 'linear-gradient(135deg,#fbbf24,#b3123f)' : 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
            fontSize: big ? 11 : 10, fontWeight: 700, color: '#f4f4f5', padding: 4, overflow: 'hidden',
            opacity: revealed && !isWinner ? 0.1 : 1,
            animation: !revealed ? `lottoJitter ${0.5 + (i % 5) * 0.09}s ease-in-out infinite alternate` : 'none',
            transition: 'width 0.6s ease, height 0.6s ease, opacity 0.6s ease',
          }}>
            {big ? (b.username || b.torn_user_id) : i + 1}
          </div>
        )
      })}
    </div>
  )
}
