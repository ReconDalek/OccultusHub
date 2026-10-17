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
  { value: 'lotto_balls', label: 'Lotto machine' },
  { value: 'gumball_machine', label: 'Gumball machine' },
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
  const [testMode, setTestMode] = useState(false)
  const [drawing, setDrawing] = useState(null) // { pool, winner, remainingTickets, isTest } while animation plays

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
    const warn = winners.length > 0
      ? `Delete this raffle round? It already has ${winners.length} winner${winners.length === 1 ? '' : 's'} drawn — this removes that history too.`
      : 'Delete this raffle round?'
    if (!confirm(warn)) return
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

  // The pool "as it stands right now" — for the animation to shuffle through
  // — is every live ticket this round, derived client-side from what we
  // already loaded (entries minus already-removed winners), mirroring
  // exactly what the backend itself draws from for a real draw.
  const computeLivePool = () => {
    const removedUserIds = new Set(
      data.winners.filter(w => w.removal_mode === 'all_tickets').map(w => w.torn_user_id)
    )
    const removedEntryIds = new Set(
      data.winners.filter(w => w.winning_entry_id).map(w => w.winning_entry_id)
    )
    return data.entries
      .filter(e => (e.review_status === 'auto' || e.review_status === 'included'))
      .filter(e => !removedUserIds.has(e.torn_user_id) && !removedEntryIds.has(e.id))
  }

  const runDraw = async () => {
    setError('')
    try {
      const livePool = computeLivePool()
      if (!livePool.length) { setError('No tickets left in the pool.'); return }

      const json = await apiSend(`/api/chain-watcher/raffle/rounds/${roundId}/draw`, 'POST', {
        removal_mode: removalMode, animation_style: animationStyle,
      })
      setDrawing({ pool: livePool, winner: json.winner, remainingTickets: json.remainingTickets, isTest: false })
    } catch (err) {
      setError(err.message)
    }
  }

  // Picks a winner entirely client-side and never calls the backend — lets
  // a leader preview/compare the animations against this round's real pool
  // as many times as they like without recording anything or touching the
  // ticket pool. (Added after test rounds got stuck in production with no
  // way to tell a real round from a test one apart from deleting it.)
  const runTestDraw = () => {
    setError('')
    const livePool = computeLivePool()
    if (!livePool.length) { setError('No tickets in the pool to test with.'); return }
    const pick = livePool[Math.floor(Math.random() * livePool.length)]
    setDrawing({
      pool: livePool,
      winner: { torn_user_id: pick.torn_user_id, username: pick.username, winning_entry_id: pick.id },
      remainingTickets: livePool.length - 1,
      isTest: true,
    })
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
        {(
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
            isTest={drawing.isTest}
            onDone={() => { const wasTest = drawing.isTest; setDrawing(null); if (!wasTest) load() }}
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#fbbf24', marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)} />
              Test mode &mdash; spin repeatedly to preview the animation, nothing is recorded
            </label>
            {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              {testMode ? (
                <button onClick={runTestDraw} disabled={liveTicketCount <= 0} style={{ ...ghostBtn, border: '1px dashed #fbbf24', color: '#fbbf24', opacity: liveTicketCount <= 0 ? 0.5 : 1 }}>
                  Test Spin
                </button>
              ) : (
                <button onClick={runDraw} disabled={liveTicketCount <= 0} style={{ ...primaryBtn, opacity: liveTicketCount <= 0 ? 0.5 : 1 }}>
                  Draw Winner {winners.length > 0 ? `(#${winners.length + 1})` : ''}
                </button>
              )}
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
// Each animation runs its own "spin" phase, then renders WinnerReveal, which
// handles the lingering reveal itself and calls onDone only once that's
// run its course — so the winner's name stays on screen for a few seconds
// instead of vanishing the instant the spin stops.

function DrawAnimation({ style, pool, winner, onDone, isTest }) {
  const inner = style === 'wheel'
    ? <SpinWheel pool={pool} winner={winner} onDone={onDone} isTest={isTest} />
    : style === 'lotto_balls'
      ? <LottoDrum pool={pool} winner={winner} onDone={onDone} isTest={isTest} />
      : style === 'gumball_machine'
        ? <GumballMachine pool={pool} winner={winner} onDone={onDone} isTest={isTest} />
        : <SlotMachineReel pool={pool} winner={winner} onDone={onDone} isTest={isTest} />

  if (!isTest) return inner
  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', top: -10, right: -6, zIndex: 5, padding: '3px 10px', borderRadius: 999,
        background: 'rgba(251,191,36,0.2)', color: '#fbbf24', fontSize: 11, fontWeight: 700,
        border: '1px solid rgba(251,191,36,0.5)', letterSpacing: '0.04em',
      }}>
        TEST &mdash; not recorded
      </div>
      {inner}
    </div>
  )
}

function WinnerReveal({ winner, lingerMs = 3200, onDone, isTest }) {
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), lingerMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div style={{ textAlign: 'center', animation: 'raffleRevealPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both' }}>
      <style>{`@keyframes raffleRevealPop { 0%{transform:scale(0.4);opacity:0} 100%{transform:scale(1);opacity:1} }`}</style>
      <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fbbf24', fontWeight: 700 }}>Winner</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: '#f4f4f5', marginTop: 4 }}>
        {winner.username || winner.torn_user_id}
      </div>
      {isTest && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>(test spin &mdash; not recorded)</div>}
    </div>
  )
}

const ITEM_H = 60
const VISIBLE = 5
const CENTER_OFFSET = Math.floor(VISIBLE / 2)

function SlotMachineReel({ pool, winner, onDone, isTest }) {
  const reel = useMemo(() => {
    const names = pool.length ? pool : [winner]
    const arr = []
    for (let i = 0; i < 4; i++) arr.push(...[...names].sort(() => Math.random() - 0.5))
    arr.push(winner)
    return arr
  }, [pool, winner])

  const finalTranslate = -(reel.length - 1 - CENTER_OFFSET) * ITEM_H
  const [translateY, setTranslateY] = useState(0)
  const [phase, setPhase] = useState('spin')

  useEffect(() => {
    const spin = setTimeout(() => setTranslateY(finalTranslate), 50)
    const reveal = setTimeout(() => setPhase('reveal'), 3100)
    return () => { clearTimeout(spin); clearTimeout(reveal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <div style={{ position: 'relative', height: ITEM_H * VISIBLE, width: 320, overflow: 'hidden', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.35)' }}>
        <div style={{
          position: 'absolute', top: ITEM_H * CENTER_OFFSET, left: 0, right: 0, height: ITEM_H,
          background: 'rgba(179,18,63,0.2)', borderTop: '2px solid #b3123f', borderBottom: '2px solid #b3123f', zIndex: 2, pointerEvents: 'none',
        }} />
        <div style={{ transform: `translateY(${translateY}px)`, transition: 'transform 3s cubic-bezier(0.08,0.75,0.15,1)' }}>
          {reel.map((p, i) => (
            <div key={i} style={{ height: ITEM_H, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#f4f4f5' }}>
              {p.username || p.torn_user_id}
            </div>
          ))}
        </div>
      </div>
      {phase === 'reveal' && <WinnerReveal winner={winner} onDone={onDone} isTest={isTest} />}
    </div>
  )
}

const WHEEL_SIZE = 320
const WHEEL_PALETTE = ['#b3123f', '#8b5cf6', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#ef4444', '#14b8a6', '#eab308', '#6366f1']

function SpinWheel({ pool, winner, onDone, isTest }) {
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
  }, [pool, winner])

  const winnerSeg = segments.find(s => s.torn_user_id === winner.torn_user_id) || segments[0]
  const winnerMid = winnerSeg ? (winnerSeg.startAngle + winnerSeg.endAngle) / 2 : 0
  const finalRotation = 5 * 360 + (360 - winnerMid)

  const [rotation, setRotation] = useState(0)
  const [phase, setPhase] = useState('spin')
  useEffect(() => {
    const spin = setTimeout(() => setRotation(finalRotation), 50)
    const reveal = setTimeout(() => setPhase('reveal'), 3900)
    return () => { clearTimeout(spin); clearTimeout(reveal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const gradient = segments.map((s, i) => `${WHEEL_PALETTE[i % WHEEL_PALETTE.length]} ${s.startAngle}deg ${s.endAngle}deg`).join(',')
  const labelRadius = WHEEL_SIZE / 2 * 0.68

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <div style={{ position: 'relative', width: WHEEL_SIZE, height: WHEEL_SIZE }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          transform: `rotate(${rotation}deg)`,
          transition: 'transform 3.8s cubic-bezier(0.1,0.65,0.15,1)',
        }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: `conic-gradient(${gradient})`,
            border: '3px solid rgba(255,255,255,0.2)', boxShadow: '0 0 30px rgba(0,0,0,0.4)',
          }} />
          {segments.map(s => {
            const mid = (s.startAngle + s.endAngle) / 2
            return (
              <div key={s.torn_user_id} style={{ position: 'absolute', left: '50%', top: '50%', transform: `rotate(${mid}deg)` }}>
                <span style={{
                  position: 'absolute', left: 0, top: -labelRadius, transform: 'translate(-50%,-50%) rotate(90deg)',
                  width: 86, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#fff',
                  textShadow: '0 1px 4px rgba(0,0,0,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {s.username || s.torn_user_id}
                </span>
              </div>
            )
          })}
        </div>
        <div style={{
          position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderTop: '22px solid #f4f4f5',
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))',
        }} />
      </div>
      {phase === 'reveal' && <WinnerReveal winner={winner} onDone={onDone} isTest={isTest} />}
    </div>
  )
}

// ── Lotto drum / gumball machine ─────────────────────────────────────────────
// Tickets (one ball per entry, not deduped by person — a bigger pool means
// more balls in the machine, same as more tickets means better real odds)
// drop into a round glass chamber, tumble around for a bit (the whole
// chamber rocks too, not just the balls), then the actual winning ticket's
// ball exits through the bottom and the name is revealed below it. Both
// styles share this same ticket-sampling + tumble-physics logic — they only
// differ in how the chamber/stand/balls are drawn.
const MAX_BALLS = 40

function sampleTickets(pool, winner) {
  let list = pool.length ? pool : [winner]
  const isWinnerTicket = (t) => (winner.winning_entry_id != null ? t.id === winner.winning_entry_id : t.torn_user_id === winner.torn_user_id)
  if (!list.some(isWinnerTicket)) list = [...list, winner]
  if (list.length > MAX_BALLS) {
    const winnerTicket = list.find(isWinnerTicket)
    const rest = list.filter(t => t !== winnerTicket)
    const sample = [...rest].sort(() => Math.random() - 0.5).slice(0, MAX_BALLS - 1)
    list = winnerTicket ? [...sample, winnerTicket] : sample
  }
  return list
}

// Positions are relative to the chamber's own centre (0,0), uniformly
// distributed within a circle (sqrt-scaled radius, not a naive r*random()
// which would bunch points toward the centre) so balls spread convincingly
// across the whole glass rather than clustering in the middle.
function randomCirclePos(chamberRadius, ballSize) {
  const maxR = Math.max(0, chamberRadius - ballSize / 2 - 4)
  const r = maxR * Math.sqrt(Math.random())
  const theta = Math.random() * Math.PI * 2
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) }
}

// Shared phase/position timeline: dropping (balls fall in, staggered) ->
// mixing (re-shuffled a few times) -> selecting (winner's ball moves to the
// exit point, everyone else fades) -> revealed (WinnerReveal takes over).
function useBallTumble(tickets, winnerIdx, chamberRadius, ballSize, exitPos) {
  const [positions, setPositions] = useState(() => tickets.map(() => ({ x: 0, y: -(chamberRadius + 120) })))
  const [phase, setPhase] = useState('dropping')

  useEffect(() => {
    const timers = []
    tickets.forEach((_, i) => {
      timers.push(setTimeout(() => {
        setPositions(prev => { const next = [...prev]; next[i] = randomCirclePos(chamberRadius, ballSize); return next })
      }, 150 + i * 55))
    })
    timers.push(setTimeout(() => setPhase('mixing'), 150 + tickets.length * 55 + 450))
    ;[1500, 2000, 2500].forEach(t => {
      timers.push(setTimeout(() => setPositions(() => tickets.map(() => randomCirclePos(chamberRadius, ballSize))), t))
    })
    timers.push(setTimeout(() => {
      setPhase('selecting')
      setPositions(prev => {
        const next = [...prev]
        if (winnerIdx >= 0) next[winnerIdx] = exitPos
        return next
      })
    }, 3100))
    timers.push(setTimeout(() => setPhase('revealed'), 3850))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { positions, phase }
}

const GUMBALL_PALETTE = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ec4899', '#a855f7', '#14b8a6', '#eab308']

// Renders the chamber's balls — identical mechanics for both machines, only
// the per-ball fill/text colour differs (ivory numbered balls for the lotto
// drum, bright candy colours for the gumball machine).
function TumbleBalls({ tickets, positions, phase, winnerIdx, ballSize, ballStyle }) {
  return tickets.map((t, i) => {
    const pos = positions[i] || { x: 0, y: -9999 }
    const isWinnerBall = i === winnerIdx
    const fadeOut = phase === 'selecting' && !isWinnerBall
    return (
      <div key={t.id ?? t.torn_user_id} style={{
        position: 'absolute', width: ballSize, height: ballSize, borderRadius: '50%',
        left: `calc(50% + ${pos.x}px - ${ballSize / 2}px)`, top: `calc(50% + ${pos.y}px - ${ballSize / 2}px)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800,
        opacity: fadeOut ? 0.08 : 1,
        transition: 'left 0.75s cubic-bezier(0.32,0.6,0.3,1), top 0.75s cubic-bezier(0.32,0.6,0.3,1), opacity 0.6s ease',
        ...ballStyle(i),
      }}>
        {i + 1}
      </div>
    )
  })
}

const DRUM_D = 280
const DRUM_BALL = 36

function LottoDrum({ pool, winner, onDone, isTest }) {
  const tickets = useMemo(() => sampleTickets(pool, winner), [pool, winner])
  const winnerIdx = useMemo(() => tickets.findIndex(t =>
    winner.winning_entry_id != null ? t.id === winner.winning_entry_id : t.torn_user_id === winner.torn_user_id
  ), [tickets, winner])
  const { positions, phase } = useBallTumble(tickets, winnerIdx, DRUM_D / 2, DRUM_BALL, { x: 0, y: DRUM_D / 2 + 70 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <div style={{ position: 'relative', width: DRUM_D + 40, height: DRUM_D + 150 }}>
        {/* Stand: post + base */}
        <div style={{ position: 'absolute', left: '50%', top: DRUM_D - 10, transform: 'translateX(-50%)', width: 10, height: 60, background: 'linear-gradient(90deg,#52525b,#a1a1aa,#52525b)', borderRadius: 3 }} />
        <div style={{ position: 'absolute', left: '50%', top: DRUM_D + 46, transform: 'translateX(-50%)', width: 140, height: 14, background: 'linear-gradient(90deg,#3f3f46,#71717a,#3f3f46)', borderRadius: 7, boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }} />
        {/* Side axle supports */}
        <div style={{ position: 'absolute', left: 6, top: DRUM_D / 2 - 30, width: 14, height: 60, background: 'linear-gradient(90deg,#3f3f46,#71717a)', borderRadius: 4 }} />
        <div style={{ position: 'absolute', right: 6, top: DRUM_D / 2 - 30, width: 14, height: 60, background: 'linear-gradient(90deg,#71717a,#3f3f46)', borderRadius: 4 }} />

        {/* Glass drum — rocks back and forth while mixing, like a hand-cranked bingo cage */}
        <div style={{
          position: 'absolute', left: 20, top: 0, width: DRUM_D, height: DRUM_D, borderRadius: '50%',
          animation: phase === 'mixing' ? 'raffleDrumRock 0.7s ease-in-out infinite' : 'none',
          transformOrigin: '50% 50%',
        }}>
          <style>{`@keyframes raffleDrumRock { 0%,100%{transform:rotate(-7deg)} 50%{transform:rotate(7deg)} }`}</style>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden',
            border: '7px solid #94a3b8', boxShadow: 'inset 0 0 36px rgba(0,0,0,0.55), 0 12px 26px rgba(0,0,0,0.5)',
            background: 'radial-gradient(circle at 32% 24%, rgba(255,255,255,0.45), rgba(200,210,230,0.12) 38%, rgba(10,15,25,0.5) 78%, rgba(5,8,15,0.65) 100%)',
          }}>
            {/* wire cage lines for a bit of "cage" texture */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.12)', margin: 14 }} />
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.1)' }} />
            <TumbleBalls tickets={tickets} positions={positions} phase={phase} winnerIdx={winnerIdx} ballSize={DRUM_BALL} ballStyle={() => ({
              background: 'radial-gradient(circle at 35% 30%, #fff, #fef3c7 45%, #e9d8a6 100%)',
              boxShadow: 'inset -3px -3px 6px rgba(0,0,0,0.25), inset 3px 3px 4px rgba(255,255,255,0.6)',
              color: '#78350f', fontSize: 12,
            })} />
          </div>
        </div>
        {/* Exit chute + tray */}
        <div style={{ position: 'absolute', left: '50%', top: DRUM_D - 6, transform: 'translateX(-50%)', width: 26, height: 34, background: 'linear-gradient(180deg,#71717a,#3f3f46)', clipPath: 'polygon(20% 0,80% 0,100% 100%,0% 100%)' }} />
        {(phase === 'selecting' || phase === 'revealed') && winnerIdx >= 0 && (
          <div style={{
            position: 'absolute', left: '50%', top: DRUM_D + 60,
            transform: `translate(-50%,-50%) scale(${phase === 'revealed' ? 1.7 : 1})`,
            width: DRUM_BALL, height: DRUM_BALL, borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #fff, #fde68a 45%, #d4af37 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, color: '#78350f',
            boxShadow: '0 8px 22px rgba(0,0,0,0.5)',
            transition: 'transform 0.6s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            {winnerIdx + 1}
          </div>
        )}
      </div>
      {phase === 'revealed' && <WinnerReveal winner={winner} onDone={onDone} isTest={isTest} />}
    </div>
  )
}

const GLOBE_D = 220
const GUM_BALL = 28

function GumballMachine({ pool, winner, onDone, isTest }) {
  const tickets = useMemo(() => sampleTickets(pool, winner), [pool, winner])
  const winnerIdx = useMemo(() => tickets.findIndex(t =>
    winner.winning_entry_id != null ? t.id === winner.winning_entry_id : t.torn_user_id === winner.torn_user_id
  ), [tickets, winner])
  const { positions, phase } = useBallTumble(tickets, winnerIdx, GLOBE_D / 2, GUM_BALL, { x: 0, y: GLOBE_D / 2 + 95 })
  const ballColors = useMemo(() => tickets.map((_, i) => GUMBALL_PALETTE[i % GUMBALL_PALETTE.length]), [tickets])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <div style={{ position: 'relative', width: GLOBE_D + 20, height: GLOBE_D + 190 }}>
        {/* Glass globe */}
        <div style={{
          position: 'absolute', left: 10, top: 0, width: GLOBE_D, height: GLOBE_D, borderRadius: '50%', overflow: 'hidden',
          border: '6px solid #c4b5a0', boxShadow: 'inset 0 0 30px rgba(0,0,0,0.4), 0 10px 22px rgba(0,0,0,0.45)',
          background: 'radial-gradient(circle at 32% 22%, rgba(255,255,255,0.5), rgba(255,255,255,0.08) 40%, rgba(0,0,0,0.12) 80%)',
        }}>
          <TumbleBalls tickets={tickets} positions={positions} phase={phase} winnerIdx={winnerIdx} ballSize={GUM_BALL} ballStyle={(i) => ({
            background: `radial-gradient(circle at 35% 28%, rgba(255,255,255,0.8), ${ballColors[i]} 45%, ${ballColors[i]} 100%)`,
            boxShadow: 'inset -2px -2px 4px rgba(0,0,0,0.3), inset 2px 2px 3px rgba(255,255,255,0.5)',
            color: '#fff', fontSize: 10, textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          })} />
        </div>
        {/* Neck */}
        <div style={{ position: 'absolute', left: '50%', top: GLOBE_D - 14, transform: 'translateX(-50%)', width: 36, height: 18, background: '#c4b5a0', borderRadius: '0 0 6px 6px' }} />
        {/* Red pedestal base, classic gumball-machine shape */}
        <div style={{
          position: 'absolute', left: '50%', top: GLOBE_D, transform: 'translateX(-50%)',
          width: 150, height: 150, clipPath: 'polygon(30% 0, 70% 0, 92% 88%, 8% 88%)',
          background: 'linear-gradient(135deg,#ef4444,#b3123f 60%,#7f0e2d)',
          boxShadow: '0 10px 24px rgba(0,0,0,0.5)',
        }}>
          {/* coin slot */}
          <div style={{ position: 'absolute', left: '50%', top: 28, transform: 'translateX(-50%)', width: 22, height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.5)' }} />
          {/* dispensing door */}
          <div style={{ position: 'absolute', left: '50%', bottom: 18, transform: 'translateX(-50%)', width: 60, height: 26, borderRadius: 5, background: 'rgba(0,0,0,0.35)', border: '2px solid rgba(255,255,255,0.15)' }} />
        </div>
        {(phase === 'selecting' || phase === 'revealed') && winnerIdx >= 0 && (
          <div style={{
            position: 'absolute', left: '50%', top: GLOBE_D + 85,
            transform: `translate(-50%,-50%) scale(${phase === 'revealed' ? 1.8 : 1})`,
            width: GUM_BALL, height: GUM_BALL, borderRadius: '50%',
            background: `radial-gradient(circle at 35% 28%, rgba(255,255,255,0.9), ${winnerIdx >= 0 ? ballColors[winnerIdx] : '#fbbf24'} 60%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            boxShadow: '0 8px 22px rgba(0,0,0,0.5)',
            transition: 'transform 0.6s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            {winnerIdx + 1}
          </div>
        )}
      </div>
      {phase === 'revealed' && <WinnerReveal winner={winner} onDone={onDone} isTest={isTest} />}
    </div>
  )
}
