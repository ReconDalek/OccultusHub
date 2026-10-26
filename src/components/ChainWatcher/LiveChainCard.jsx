import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiGet, fmtDuration, card, sectionTitle, computeWatcherStatus } from './chainWatcherUtils'
import {
  loadAlertSettings, saveAlertSettings, playChirp, triggerFlashSequence, showChainAlertNotification,
  OVERLAY_FONT_MIN, OVERLAY_FONT_MAX, OVERLAY_FONT_STEP,
} from './chainAlerts'
import ChainAlertSettingsModal from './ChainAlertSettingsModal'
import QuickTargetButton from './QuickTargetButton'

const POLL_MS = 10000
const FAST_POLL_MS = 5000
const FAST_POLL_THRESHOLD = 120 // seconds left before a chain drops — poll tighter once attacks matter most
const PIP_SUPPORTED = typeof window !== 'undefined' && 'documentPictureInPicture' in window

// Full-viewport red flash — rendered into whichever document(s) are
// currently relevant (the main page, and the pop-out window if one is open).
function RedFlash() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999999, pointerEvents: 'none', background: 'rgba(120,0,0,0.45)' }} />
  )
}

const fontStepBtn = {
  width: 22, height: 22, borderRadius: 4, background: 'rgba(255,255,255,0.08)', color: '#e4e4e7',
  border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer', fontSize: 11, fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1,
}

const RECONNECT_PULSE_KEYFRAMES = `@keyframes chainReconnectPulse { 0%,100%{opacity:.35} 50%{opacity:1} }`

// Small "still trying" blip — not an error, just a loading indicator, shown
// wherever the live chain data could otherwise look stale or blank.
function ReconnectBlip({ fontSize = 11 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize, color: '#a1a1aa', fontWeight: 500 }}>
      <style>{RECONNECT_PULSE_KEYFRAMES}</style>
      <span style={{
        display: 'inline-block', width: Math.max(5, Math.round(fontSize * 0.5)), height: Math.max(5, Math.round(fontSize * 0.5)),
        borderRadius: '50%', background: '#f87171', animation: 'chainReconnectPulse 1s ease-in-out infinite',
      }}/>
      reconnecting…
    </span>
  )
}

// Faction newsletter shortcut — leadership-only, opens Torn's own mailer in
// a new tab rather than anything this site manages itself.
function MailerButton({ fontSize = 12 }) {
  return (
    <a
      href="https://www.torn.com/factions.php?step=your#/tab=controls&option=newsletter"
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize,
        padding: '6px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.05)',
        color: '#d4d4d8', border: '1px solid rgba(255,255,255,0.14)',
        textDecoration: 'none', whiteSpace: 'nowrap',
      }}
    >
      ✉ Faction mailer
    </a>
  )
}

// Compact view rendered into the pop-out/PiP window — just the countdown and
// current/next watcher, nothing else needs to travel with it. Font size is a
// single user-controlled base (the countdown's own size, in px) with every
// other size in here derived as a fixed ratio off it — automatic viewport-
// based scaling (clamp()+vmin) didn't track window resizes the way the user
// wanted, so sizing is manual via the A−/A+ buttons instead, persisted like
// the other alert settings.
function OverlayContent({ liveTimeout, urgent, hits, target, current, next, flashOn, fontSize, onFontSizeChange, reconnecting, isLeader }) {
  const labelSize = Math.round(fontSize * 0.18)
  const nameLabelSize = Math.round(fontSize * 0.16)
  const nameSize = Math.round(fontSize * 0.2)

  return (
    <div style={{
      position: 'relative', minHeight: '100vh', boxSizing: 'border-box', overflow: 'auto',
      padding: Math.round(fontSize * 0.3), color: '#f4f4f5', background: '#0c0c0c',
      display: 'flex', flexDirection: 'column', gap: Math.round(fontSize * 0.2),
      justifyContent: 'center', fontFamily: 'inherit',
    }}>
      <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
        <button
          onClick={() => onFontSizeChange(-OVERLAY_FONT_STEP)}
          disabled={fontSize <= OVERLAY_FONT_MIN}
          title="Smaller text"
          style={{ ...fontStepBtn, opacity: fontSize <= OVERLAY_FONT_MIN ? 0.4 : 1 }}
        >
          A−
        </button>
        <button
          onClick={() => onFontSizeChange(OVERLAY_FONT_STEP)}
          disabled={fontSize >= OVERLAY_FONT_MAX}
          title="Bigger text"
          style={{ ...fontStepBtn, opacity: fontSize >= OVERLAY_FONT_MAX ? 0.4 : 1 }}
        >
          A+
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: Math.round(fontSize * 0.5), flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: labelSize, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hits</div>
          <div style={{ fontSize, fontWeight: 800, lineHeight: 1.1 }}>
            {hits.toLocaleString()}{target ? ` / ${target.toLocaleString()}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: labelSize, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time left</div>
          <div style={{ fontSize, fontWeight: 800, lineHeight: 1.1, color: urgent ? '#f87171' : '#f4f4f5' }}>{fmtDuration(liveTimeout)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-around' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#a1a1aa', textTransform: 'uppercase', fontSize: nameLabelSize, letterSpacing: '0.05em' }}>Watching</div>
          <div style={{ fontWeight: 700, fontSize: nameSize }}>{current?.username || 'Unassigned'}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#a1a1aa', textTransform: 'uppercase', fontSize: nameLabelSize, letterSpacing: '0.05em' }}>Next</div>
          <div style={{ fontWeight: 700, fontSize: nameSize }}>{next?.username || 'Unassigned'}</div>
        </div>
      </div>
      {reconnecting && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <ReconnectBlip fontSize={labelSize} />
        </div>
      )}
      {isLeader && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <MailerButton fontSize={labelSize} />
        </div>
      )}
      {flashOn && <RedFlash />}
    </div>
  )
}

// How long a poll is allowed to keep failing before the UI admits it —
// a single bad/rate-limited key swapped out and retried (both the backend's
// own retry and this component's own fast re-poll below) usually recovers
// within a second or two, and flagging that routine blip would just be
// noise. Only a failure that's still going after this long is worth saying
// anything about.
const RECONNECT_UI_DELAY_MS = 4000
// While erroring, re-poll much sooner than the normal cadence — each retry
// hits the backend again, which picks a fresh key per attempt (see
// tornApiService.js's fetchWithRetry), so this is what "force a new check
// with a different key" actually looks like from here.
const ERROR_RETRY_MS = 2500

export default function LiveChainCard({ factionId, target, shifts = [], isLeader = false }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [settings, setSettings] = useState(() => loadAlertSettings())
  const [showSettings, setShowSettings] = useState(false)
  const [flashOn, setFlashOn] = useState(false)
  const [overlayWindow, setOverlayWindow] = useState(null)
  const [bonusBanner, setBonusBanner] = useState(null)

  const chainKeyRef = useRef(null)
  const firedThresholdsRef = useRef(new Set())
  const prevTimeoutRef = useRef(null)
  const prevPolledTimeoutRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const bonusShownRef = useRef(new Set())
  const bonusBannerTimerRef = useRef(null)

  // Self-scheduling rather than a fixed interval, so the poll rate can tighten
  // up as a chain gets close to timing out — each attack resets Torn's own
  // timeout server-side, and polling faster near zero keeps the live display
  // from lagging behind a reset by a full normal poll cycle.
  useEffect(() => {
    let cancelled = false
    let timer = null

    async function load() {
      let nextDelay = POLL_MS
      try {
        const json = await apiGet(`/api/chain-watcher/live?faction_id=${factionId}`)
        if (cancelled) return
        setData((prev) => {
          // Torn's own chain timeout only ever resets upward on a NEW hit —
          // with no hit since the last poll (same `current`, same chain),
          // it can only count down, never up. A poll that disagrees with
          // that is a bad/stale read (seen live: the timer jumping up ~20s
          // with no attack shown, then correcting itself a few seconds
          // later) — discard just that one poll and keep ticking off the
          // last good data; the next poll is almost always fine.
          if (
            prev && prev.status === 'active' && json.status === 'active' &&
            json.start === prev.start && json.current === prev.current &&
            json.timeout > prev.timeout
          ) {
            console.warn(`[LiveChainCard] ignoring anomalous timeout jump with no new hit (${prev.timeout}s -> ${json.timeout}s)`)
            return prev
          }
          return json
        })
        setError(null)
        setReconnecting(false)
        if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null }
        if (json.status === 'active' && json.timeout <= FAST_POLL_THRESHOLD) nextDelay = FAST_POLL_MS

        // Every viewer polling within ~20s of the award sees this, not just
        // whoever's request happened to detect it server-side — dedupe
        // locally by chain position so it only banners once per viewer.
        const freshAwards = (json.bonusAwards || []).filter((a) => !bonusShownRef.current.has(a.chain_position))
        if (freshAwards.length) {
          freshAwards.forEach((a) => bonusShownRef.current.add(a.chain_position))
          setBonusBanner(freshAwards[freshAwards.length - 1])
          if (bonusBannerTimerRef.current) clearTimeout(bonusBannerTimerRef.current)
          bonusBannerTimerRef.current = setTimeout(() => setBonusBanner(null), 7000)
        }
      } catch (e) {
        if (cancelled) return
        setError(e.message)
        nextDelay = ERROR_RETRY_MS
        if (!reconnectTimerRef.current) {
          reconnectTimerRef.current = setTimeout(() => { setReconnecting(true) }, RECONNECT_UI_DELAY_MS)
        }
      }
      if (!cancelled) timer = setTimeout(load, nextDelay)
    }

    load()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (bonusBannerTimerRef.current) clearTimeout(bonusBannerTimerRef.current)
    }
  }, [factionId])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  const elapsedSincePoll = data ? Math.max(0, (now - data.fetchedAt * 1000) / 1000) : 0
  const liveTimeout = data?.status === 'active' ? Math.max(0, data.timeout - elapsedSincePoll) : 0
  const liveCooldown = data?.status === 'cooldown' ? Math.max(0, data.cooldown - elapsedSincePoll) : 0
  const urgent = data?.status === 'active' && liveTimeout <= 90
  const { current, next } = computeWatcherStatus(shifts, now / 1000)

  // A new chain run resets which thresholds have already fired — `data.start`
  // uniquely identifies the chain, so this only resets on an actual new chain,
  // not every poll of the same one.
  useEffect(() => {
    if (data?.status === 'active' && data.start !== chainKeyRef.current) {
      chainKeyRef.current = data.start
      firedThresholdsRef.current = new Set()
      prevTimeoutRef.current = null
      prevPolledTimeoutRef.current = null
      bonusShownRef.current = new Set()
    }
  }, [data?.start, data?.status])

  // A threshold is allowed to fire again any time the timeout has gone back
  // ABOVE it since it last fired — a chain's timeout resets on every attack,
  // so it can have several close calls in one chain, each one worth its own
  // alert, not just the first ever. firedThresholdsRef tracks "currently
  // below and already alerted for" rather than "ever fired this chain": it's
  // cleared for a threshold the moment we're back above it, and only set
  // again on the next genuine crossing. Shared by both effects below, so
  // whichever one notices a crossing first fires it — the other is then a
  // no-op for that same crossing.
  function checkThresholds(prev, timeout) {
    if (prev == null) {
      // First observation for this mount/chain — mark anything already
      // passed as "fired" so it doesn't alert retroactively, without
      // touching anything still above its threshold (which stays eligible
      // to fire normally once actually crossed).
      for (const t of settings.thresholds) {
        if (timeout <= t) firedThresholdsRef.current.add(t)
      }
      return
    }
    for (const t of settings.thresholds) {
      if (timeout > t) {
        firedThresholdsRef.current.delete(t)
      } else if (!firedThresholdsRef.current.has(t)) {
        firedThresholdsRef.current.add(t)
        if (settings.sound) playChirp()
        if (settings.flash) triggerFlashSequence(setFlashOn)
        if (settings.notification) showChainAlertNotification(t)
      }
    }
  }

  // Primary check: the locally-ticking countdown, every second — catches the
  // exact moment while the tab is actively being watched.
  useEffect(() => {
    if (!settings.enabled || data?.status !== 'active') { prevTimeoutRef.current = null; return }
    const prev = prevTimeoutRef.current
    prevTimeoutRef.current = liveTimeout
    checkThresholds(prev, liveTimeout)
  }, [liveTimeout, settings, data?.status])

  // Backup check: the server's own timeout value, every time a fresh poll
  // arrives — a browser can throttle a backgrounded tab's setInterval (e.g.
  // the countdown tick above) long before it throttles the poll's own timer,
  // which is exactly the case reported: alerts fired fine on the Chain Watch
  // tab itself, but not while looking at a different tab with only the
  // pop-out visible. This doesn't depend on the countdown tick at all, so it
  // still catches a crossing even if that tick has stalled.
  useEffect(() => {
    if (!settings.enabled || data?.status !== 'active') { prevPolledTimeoutRef.current = null; return }
    const prev = prevPolledTimeoutRef.current
    prevPolledTimeoutRef.current = data.timeout
    checkThresholds(prev, data.timeout)
  }, [data, settings])

  function updateSettings(next) {
    setSettings(next)
    saveAlertSettings(next)
  }

  function adjustOverlayFontSize(delta) {
    const size = Math.min(OVERLAY_FONT_MAX, Math.max(OVERLAY_FONT_MIN, settings.overlayFontSize + delta))
    updateSettings({ ...settings, overlayFontSize: size })
  }

  function copyStylesInto(win) {
    [...document.styleSheets].forEach((sheet) => {
      // Skip any seasonal-event theme tag (e.g. the Halloween body-background
      // override) — it's a one-time snapshot clone, not a live sync, so if a
      // theme happened to be active at pop-out time it would otherwise stay
      // baked into this window's background forever, even after the theme
      // ends or the main tab navigates away. The overlay has its own fixed
      // dark background regardless, so this stylesheet is never wanted here.
      if (sheet.ownerNode?.id === 'occultus-event-bg') return
      try {
        const rules = [...sheet.cssRules].map((r) => r.cssText).join('')
        const style = win.document.createElement('style')
        style.textContent = rules
        win.document.head.appendChild(style)
      } catch {
        if (sheet.href) {
          const link = win.document.createElement('link')
          link.rel = 'stylesheet'
          link.href = sheet.href
          win.document.head.appendChild(link)
        }
      }
    })
    win.document.body.style.margin = '0'
    // Belt-and-braces: guarantee a solid background underneath the overlay
    // content no matter what else got cloned in above.
    win.document.body.style.background = '#0c0c0c'
  }

  async function openOverlay() {
    if (overlayWindow && !overlayWindow.closed) { overlayWindow.focus(); return }

    let win = null
    if (settings.alwaysOnTop && PIP_SUPPORTED) {
      try {
        win = await window.documentPictureInPicture.requestWindow({ width: 300, height: 200 })
      } catch {
        win = null
      }
    }
    if (!win) {
      win = window.open('', 'chainTimerOverlay', 'width=300,height=220,resizable=yes')
    }
    if (!win) return // popup blocked

    copyStylesInto(win)
    win.document.title = 'Chain Timer'
    win.addEventListener('pagehide', () => setOverlayWindow(null), { once: true })
    setOverlayWindow(win)
  }

  // Close the pop-out if this card unmounts (chain watch ended) rather than
  // leaving an orphaned window showing stale data.
  useEffect(() => {
    return () => { if (overlayWindow && !overlayWindow.closed) overlayWindow.close() }
  }, [overlayWindow])

  // A poll failing (a bad key, a brief network blip, Torn itself hiccuping)
  // is routine and usually resolves within a couple of fast retries — it
  // must NOT blank out an otherwise-still-valid last-known chain state.
  // Someone watching a chain could read a blanked display as "the chain
  // ended" and stop attacking, which is exactly the failure this is trying
  // to avoid. Only show a hard error once it's been failing long enough to
  // set `reconnecting` (a quick retry that recovers in a blip never shows
  // anything); once we have data, keep showing it — ticking down locally off
  // the last successful poll — with a small, unalarming note instead.
  if (error && !data) {
    return (
      <div style={card}>
        <p style={sectionTitle}>Live Chain</p>
        <p style={{ color: reconnecting ? '#f87171' : 'var(--text-faint)', fontSize: 13 }}>
          {reconnecting ? error : 'Loading…'}
        </p>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={card}>
        <p style={sectionTitle}>Live Chain</p>
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Loading…</p>
      </div>
    )
  }

  return (
    <div style={{ ...card, border: urgent ? '1px solid #f87171' : card.border, position: 'relative' }}>
      <div className="flex items-center" style={{ justifyContent: 'space-between' }}>
        <p style={sectionTitle}>
          Live Chain
          {data.isTest && (
            <span style={{
              marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: '#f4f4f5', background: '#8b5cf6',
              borderRadius: 5, padding: '2px 7px', verticalAlign: 'middle', letterSpacing: '0.04em',
            }}>
              TEST
            </span>
          )}
          {reconnecting && (
            <span title={error} style={{ marginLeft: 8 }}>
              <ReconnectBlip />
            </span>
          )}
        </p>
        <div className="flex items-center" style={{ gap: 6 }}>
          {data.status === 'active' && (
            <button
              onClick={openOverlay}
              title="Open a small floating timer window"
              style={{
                fontSize: 11, padding: '4px 9px', borderRadius: 6, background: 'rgba(255,255,255,0.05)',
                color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer',
              }}
            >
              ⧉ Pop out
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            title="Timer alert settings"
            style={{
              fontSize: 13, width: 26, height: 26, borderRadius: 6, background: 'rgba(255,255,255,0.05)',
              color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ⚙
          </button>
        </div>
      </div>

      {(data.status === 'idle' || data.status === 'no_session') && (
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No chain currently running.</p>
      )}

      {data.status === 'cooldown' && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Chain ended — cooldown for <strong>{fmtDuration(liveCooldown)}</strong>
        </p>
      )}

      {data.status === 'active' && (
        <div className="flex items-center" style={{ gap: 28, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hits</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#f4f4f5' }}>
              {data.current.toLocaleString()}{target ? ` / ${target.toLocaleString()}` : ''}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time left</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: urgent ? '#f87171' : '#f4f4f5' }}>{fmtDuration(liveTimeout)}</div>
          </div>
          {urgent && (
            <div style={{ fontSize: 13, color: '#f87171', fontWeight: 600, alignSelf: 'center' }}>
              Chain is about to drop — attack now!
            </div>
          )}
        </div>
      )}

      {data.status === 'active' && (
        <div style={{ marginTop: 10 }}>
          <QuickTargetButton isLeader={isLeader} />
        </div>
      )}

      {bonusBanner && (
        <p style={{
          fontSize: 12.5, color: '#c4b5fd', background: 'rgba(139,92,246,0.12)',
          border: '1px solid rgba(139,92,246,0.3)', borderRadius: 7, padding: '6px 10px', margin: '10px 0 0',
        }}>
          🎉 {bonusBanner.username} landed the {bonusBanner.chain_position.toLocaleString()}th hit — earned {bonusBanner.merit_type}!
        </p>
      )}

      {data.status === 'active' && data.viewers && (
        <p
          title={`Peak for this faction: ${data.viewers.peak}${data.viewers.peakAt ? ` (${new Date(data.viewers.peakAt).toLocaleString()})` : ''} • Peak overall: ${data.viewers.peakOverall}`}
          style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '6px 0 0' }}
        >
          👀 {data.viewers.current} watching now (peak {data.viewers.peak})
        </p>
      )}

      {isLeader && (
        <div style={{ marginTop: 12 }}>
          <MailerButton />
        </div>
      )}

      {flashOn && <RedFlash />}

      {showSettings && (
        <ChainAlertSettingsModal
          settings={settings}
          onChange={updateSettings}
          onClose={() => setShowSettings(false)}
          pipSupported={PIP_SUPPORTED}
        />
      )}

      {overlayWindow && createPortal(
        <OverlayContent
          liveTimeout={liveTimeout} urgent={urgent} hits={data?.current ?? 0} target={target}
          current={current} next={next} flashOn={flashOn}
          fontSize={settings.overlayFontSize} onFontSizeChange={adjustOverlayFontSize}
          reconnecting={reconnecting} isLeader={isLeader}
        />,
        overlayWindow.document.body
      )}
    </div>
  )
}
