import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { API_BASE_URL } from '../config/api'
import PactTracker from '../components/Pact/PactTracker.jsx'
import PactNight from '../components/Pact/PactNight.jsx'

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}
async function api(path, body) {
  const res = await fetch(`${API_BASE_URL}/api/pact${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: authHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body || {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

const TIMERS = [
  { v: 0, label: 'No timer' }, { v: 90, label: '90s / night' },
  { v: 120, label: '120s / night' }, { v: 180, label: '180s / night' },
]

const card = {
  background: '#151220', border: '1px solid #302943', borderRadius: 12, padding: 20,
}
const btn = (primary) => ({
  padding: '11px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, letterSpacing: 1,
  cursor: 'pointer', border: `1px solid ${primary ? '#c01d4760' : '#302943'}`,
  background: primary ? 'linear-gradient(135deg,#c01d47cc,#c01d4788)' : '#1d1830',
  color: primary ? '#fff' : '#ece7f4',
})

export default function Pact() {
  const { user, loading: sessionLoading } = useSession()
  const [params, setParams] = useSearchParams()
  const code = params.get('code')

  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [mode, setMode] = useState('solo')
  const [timer, setTimer] = useState(0)
  const [board, setBoard] = useState(null)
  const pollRef = useRef(null)

  const setCode = (c) => setParams(c ? { code: c } : {}, { replace: true })

  const load = useCallback(async () => {
    if (!code) return
    try {
      const s = await api(`/session/${code}/state`)
      setState(s); setError(null)
    } catch (e) { setError(e.message) }
  }, [code])

  useEffect(() => { load() }, [load])

  // poll while lobby / playing
  useEffect(() => {
    clearInterval(pollRef.current)
    const st = state?.session?.status
    if (code && (st === 'lobby' || st === 'playing')) {
      pollRef.current = setInterval(() => { if (!busy) load() }, 2500)
    }
    return () => clearInterval(pollRef.current)
  }, [code, state?.session?.status, busy, load])

  useEffect(() => {
    api('/leaderboard?scope=season').then(setBoard).catch(() => {})
  }, [state?.session?.status])

  const act = async (fn) => {
    setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false); await load() }
  }

  const createGame = () => act(async () => {
    const r = await api('/session', { mode, timer_seconds: timer })
    setCode(r.code)
  })
  const join = () => act(async () => {
    const c = joinCode.trim().toUpperCase()
    await api(`/session/${c}/join`, {})
    setCode(c)
  })
  const chooseTeam = (payload) => act(() => api(`/session/${code}/team`, payload))
  const start = () => act(() => api(`/session/${code}/start`, {}))
  const vote = (option) => act(() => api(`/session/${code}/vote`, { option }))

  if (sessionLoading) return <Shell><p style={{ color: '#a49bbd' }}>…</p></Shell>
  if (!user) return <Shell><p style={{ color: '#a49bbd' }}>Sign in to enter the Order.</p></Shell>

  // ── landing ──
  if (!code) {
    return (
      <Shell>
        <Intro />
        <div style={{ ...card, marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['solo', 'team'].map((m) => (
              <button key={m} onClick={() => setMode(m)} style={{
                ...btn(mode === m), textTransform: 'capitalize', flex: '1 1 120px',
              }}>{m} game</button>
            ))}
          </div>
          <select value={timer} onChange={(e) => setTimer(Number(e.target.value))}
            style={{ ...btn(false), appearance: 'auto', cursor: 'pointer' }}>
            {TIMERS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
          <button onClick={createGame} disabled={busy} style={btn(true)}>Open a lobby</button>
        </div>

        <div style={{ ...card, marginTop: 16 }}>
          <label style={{ fontSize: 12, letterSpacing: 1, color: '#6f6689' }}>JOIN WITH A CODE</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="XXXXXX"
              maxLength={6} style={{
                flex: 1, padding: '10px 12px', background: '#0c0a11', border: '1px solid #302943',
                borderRadius: 8, color: '#ece7f4', fontFamily: 'JetBrains Mono, monospace',
                letterSpacing: 4, textTransform: 'uppercase',
              }} />
            <button onClick={join} disabled={busy || joinCode.trim().length !== 6} style={btn(false)}>Join</button>
          </div>
        </div>

        {error && <ErrLine msg={error} />}
        <Board board={board} />
      </Shell>
    )
  }

  const s = state?.session
  if (!state || !s) {
    return <Shell><p style={{ color: '#a49bbd' }}>{error || 'Consulting the omens…'}</p>
      <button onClick={() => setCode(null)} style={{ ...btn(false), marginTop: 16 }}>← back</button></Shell>
  }

  // ── lobby ──
  if (s.status === 'lobby') {
    return (
      <Shell>
        <CodeHeader code={s.code} onLeave={() => setCode(null)} />
        <p style={{ color: '#a49bbd', fontStyle: 'italic', marginTop: 4 }}>{s.setting}</p>
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ fontSize: 12, letterSpacing: 1, color: '#6f6689' }}>
            {s.mode.toUpperCase()} · {s.timerSeconds ? `${s.timerSeconds}s/night` : 'no timer'}
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {state.cabals.map((c) => (
              <div key={c.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#0c0a11', border: '1px solid #302943', borderRadius: 8, padding: '8px 12px',
              }}>
                <span style={{ color: '#ece7f4', fontFamily: 'Cinzel, serif', fontSize: 14 }}>{c.name}</span>
                <span style={{ color: '#6f6689', fontSize: 12 }}>
                  {(c.members || []).length} member{(c.members || []).length === 1 ? '' : 's'}
                  {s.mode === 'team' && c.id !== state.you?.cabalId && (c.members || []).length < 4 && (
                    <button onClick={() => chooseTeam({ cabal_id: c.id })} disabled={busy}
                      style={{ ...btn(false), padding: '3px 10px', marginLeft: 10, fontSize: 11 }}>join</button>
                  )}
                </span>
              </div>
            ))}
          </div>

          {s.mode === 'team' && !state.you && (
            <button onClick={() => chooseTeam({})} disabled={busy} style={{ ...btn(false), marginTop: 12 }}>
              Form a new circle
            </button>
          )}
          {s.isHost && (
            <button onClick={start} disabled={busy || state.cabals.length === 0} style={{ ...btn(true), marginTop: 12, width: '100%' }}>
              Begin the eighteen nights
            </button>
          )}
          {!s.isHost && <p style={{ color: '#6f6689', fontSize: 12, marginTop: 12 }}>waiting for the host to begin…</p>}
        </div>
        {error && <ErrLine msg={error} />}
      </Shell>
    )
  }

  // ── ended: reckoning ──
  if (s.status === 'ended') {
    const r = state.reckoning
    return (
      <Shell>
        <CodeHeader code={s.code} onLeave={() => setCode(null)} />
        <h2 className="font-cinzel" style={{ letterSpacing: 3, color: '#ece7f4', textAlign: 'center', marginTop: 20 }}>
          The Reckoning
        </h2>
        {r && (
          <div style={{ ...card, marginTop: 16, textAlign: 'center' }}>
            {r.status === 'broken'
              ? <p style={{ color: '#d9484f' }}>The Pact was broken on night {r.brokeOnNight}. The Order is scattered.</p>
              : <>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 36, color: '#c01d47', fontWeight: 700 }}>
                  {r.score.toLocaleString()}
                </div>
                <div style={{ color: '#6f6689', fontSize: 12, letterSpacing: 1, marginTop: 4 }}>FINAL SCORE</div>
                <div style={{ color: '#a49bbd', fontSize: 13, marginTop: 12, fontFamily: 'JetBrains Mono, monospace' }}>
                  {r.dominion} Dominion × {r.loyaltyMod?.toFixed(2)} loyalty × {r.cashMod?.toFixed(2)} coin × 10
                </div>
              </>}
          </div>
        )}
        {state.standings && (
          <div style={{ ...card, marginTop: 16 }}>
            <div style={{ fontSize: 12, letterSpacing: 1, color: '#6f6689', marginBottom: 8 }}>STANDINGS</div>
            {state.standings.map((c, i) => (
              <Row key={i} rank={i + 1} name={c.name}
                right={c.status === 'broken' ? `broken · N${c.brokeOnNight}` : c.score.toLocaleString()} />
            ))}
          </div>
        )}
        <Board board={board} />
      </Shell>
    )
  }

  // ── playing ──
  const lastForNight = (state.cabal?.ledger || []).filter((l) => l.night === s.currentNight && !l.delayed).slice(-1)[0]
  return (
    <Shell wide>
      <CodeHeader code={s.code} onLeave={() => setCode(null)} small />
      <PactTracker cabal={state.cabal} night={s.currentNight} />
      {state.cabal?.status !== 'active' ? (
        <div style={{ ...card, textAlign: 'center' }}>
          <p style={{ color: '#d9484f' }}>Your cabal is out of the game. Awaiting the others…</p>
        </div>
      ) : (
        <div style={card}>
          <PactNight
            night={state.night}
            committed={state.committed}
            yourVote={state.yourVote}
            votes={state.votes}
            mode={s.mode}
            progress={state.progress}
            lastOutcome={lastForNight}
            busy={busy}
            onVote={vote}
          />
        </div>
      )}
      {error && <ErrLine msg={error} />}
    </Shell>
  )
}

// ── bits ──
function Shell({ children, wide }) {
  return (
    <div style={{ minHeight: '100vh', padding: '72px 16px 100px', color: '#f4f4f5' }}>
      <div style={{ maxWidth: wide ? 620 : 560, margin: '0 auto' }}>{children}</div>
    </div>
  )
}
function Intro() {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 30, color: '#d8a53a', filter: 'drop-shadow(0 0 8px #d8a53a66)' }}>☩</div>
      <h1 className="font-cinzel" style={{ fontSize: 'clamp(24px,5vw,36px)', letterSpacing: 6, margin: '10px 0 8px' }}>
        THE PACT
      </h1>
      <p style={{ color: '#a49bbd', fontStyle: 'italic', maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
        Eighteen nights. A sealed crypt, a hungry dark, and the favour it grants those who feed it.
        Chase Dominion — but a following you neglect will cost you most of it.
      </p>
    </div>
  )
}
function CodeHeader({ code, onLeave, small }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: 4, color: '#d8a53a', fontSize: small ? 14 : 18 }}>
        {code}
      </span>
      <button onClick={onLeave} style={{ ...btn(false), padding: '5px 12px', fontSize: 11 }}>leave</button>
    </div>
  )
}
function ErrLine({ msg }) {
  return <p style={{ color: '#d9484f', fontSize: 13, marginTop: 14, textAlign: 'center' }}>{msg}</p>
}
function Row({ rank, name, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1d1830', fontSize: 14 }}>
      <span style={{ color: '#ded7ea' }}>
        <span style={{ color: '#6f6689', fontFamily: 'JetBrains Mono, monospace', marginRight: 8 }}>{rank}</span>{name}
      </span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#a49bbd' }}>{right}</span>
    </div>
  )
}
function Board({ board }) {
  if (!board?.leaderboard?.length) return null
  return (
    <div style={{ ...card, marginTop: 16 }}>
      <div style={{ fontSize: 12, letterSpacing: 1, color: '#6f6689', marginBottom: 8 }}>
        SEASON {board.season} · TOP ORDERS
      </div>
      {board.leaderboard.slice(0, 10).map((r, i) => (
        <Row key={i} rank={i + 1} name={r.username} right={(r.score ?? 0).toLocaleString()} />
      ))}
    </div>
  )
}
