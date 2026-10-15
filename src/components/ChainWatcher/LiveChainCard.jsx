import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiGet, fmtDuration, card, sectionTitle, computeWatcherStatus } from './chainWatcherUtils'
import {
  loadAlertSettings, saveAlertSettings, playChirp, triggerFlashSequence, showChainAlertNotification,
  OVERLAY_FONT_MIN, OVERLAY_FONT_MAX, OVERLAY_FONT_STEP,
} from './chainAlerts'
import ChainAlertSettingsModal from './ChainAlertSettingsModal'

const POLL_MS = 20000
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

// Compact view rendered into the pop-out/PiP window — just the countdown and
// current/next watcher, nothing else needs to travel with it. Font size is a
// single user-controlled base (the countdown's own size, in px) with every
// other size in here derived as a fixed ratio off it — automatic viewport-
// based scaling (clamp()+vmin) didn't track window resizes the way the user
// wanted, so sizing is manual via the A−/A+ buttons instead, persisted like
// the other alert settings.
function OverlayContent({ liveTimeout, urgent, current, next, flashOn, fontSize, onFontSizeChange }) {
  const labelSize = Math.round(fontSize * 0.13)
  const nameLabelSize = Math.round(fontSize * 0.1)
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

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: labelSize, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time left</div>
        <div style={{ fontSize, fontWeight: 800, lineHeight: 1.1, color: urgent ? '#f87171' : '#f4f4f5' }}>{fmtDuration(liveTimeout)}</div>
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
      {flashOn && <RedFlash />}
    </div>
  )
}

export default function LiveChainCard({ factionId, target, shifts = [] }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [settings, setSettings] = useState(() => loadAlertSettings())
  const [showSettings, setShowSettings] = useState(false)
  const [flashOn, setFlashOn] = useState(false)
  const [overlayWindow, setOverlayWindow] = useState(null)

  const chainKeyRef = useRef(null)
  const firedThresholdsRef = useRef(new Set())
  const prevTimeoutRef = useRef(null)

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
        setData(json)
        setError(null)
        if (json.status === 'active' && json.timeout <= FAST_POLL_THRESHOLD) nextDelay = FAST_POLL_MS
      } catch (e) {
        if (cancelled) return
        setError(e.message)
      }
      if (!cancelled) timer = setTimeout(load, nextDelay)
    }

    load()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
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
    }
  }, [data?.start, data?.status])

  // Fires on a threshold CROSSING (previous tick above it, this tick at/below
  // it) — not just "currently at or below," so loading the page mid-chain
  // doesn't immediately fire every threshold already passed before anyone was
  // watching.
  useEffect(() => {
    if (!settings.enabled || data?.status !== 'active') { prevTimeoutRef.current = null; return }
    const prev = prevTimeoutRef.current
    prevTimeoutRef.current = liveTimeout
    if (prev == null) return

    for (const t of settings.thresholds) {
      if (prev > t && liveTimeout <= t && !firedThresholdsRef.current.has(t)) {
        firedThresholdsRef.current.add(t)
        if (settings.sound) playChirp()
        if (settings.flash) triggerFlashSequence(setFlashOn)
        if (settings.notification) showChainAlertNotification(t)
      }
    }
  }, [liveTimeout, settings, data?.status])

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

  if (error) {
    return (
      <div style={card}>
        <p style={sectionTitle}>Live Chain</p>
        <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>
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
          liveTimeout={liveTimeout} urgent={urgent} current={current} next={next} flashOn={flashOn}
          fontSize={settings.overlayFontSize} onFontSizeChange={adjustOverlayFontSize}
        />,
        overlayWindow.document.body
      )}
    </div>
  )
}
