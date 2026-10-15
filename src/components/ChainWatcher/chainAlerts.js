// Personal, per-browser preference — not shared faction data, so this lives
// in localStorage rather than the backend (same reasoning as per-faction
// target inputs elsewhere in Chain Watch).
const STORAGE_KEY = 'chainWatch.alertSettings'

const DEFAULTS = {
  enabled: true,
  sound: true,
  flash: true,
  notification: false, // off by default — needs explicit browser permission first
  thresholds: [90, 60, 30], // seconds remaining — 1m30, 1min and 30s warnings
  alwaysOnTop: true, // only matters if the pop-out timer is opened
}

export function loadAlertSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    return {
      enabled: parsed.enabled ?? DEFAULTS.enabled,
      sound: parsed.sound ?? DEFAULTS.sound,
      flash: parsed.flash ?? DEFAULTS.flash,
      notification: parsed.notification ?? DEFAULTS.notification,
      thresholds: Array.isArray(parsed.thresholds) ? parsed.thresholds : DEFAULTS.thresholds,
      alwaysOnTop: parsed.alwaysOnTop ?? DEFAULTS.alwaysOnTop,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveAlertSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch { /* private browsing / storage disabled — setting just won't persist */ }
}

// Lazily created, reused AudioContext — browsers require it to originate
// from a user gesture at least once, which the settings modal's checkboxes
// and the page itself being clicked into already satisfy by the time an
// alert actually needs to fire.
let audioCtx = null
function getAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  if (!audioCtx) audioCtx = new Ctx()
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
  return audioCtx
}

// Two quick high tones — a "chirp chirp," not a single flat beep.
export function playChirp() {
  const ctx = getAudioCtx()
  if (!ctx) return
  const beepAt = (delay) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 1046.5 // C6
    const t0 = ctx.currentTime + delay
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14)
    osc.start(t0)
    osc.stop(t0 + 0.15)
  }
  beepAt(0)
  beepAt(0.18)
}

// OS-level toast — the one alert channel that genuinely surfaces over other
// apps/windows regardless of focus (sound is heard anywhere too, but this
// adds a visible readout of what actually happened for anyone not looking at
// a screen at all when it fires). Requires the browser's own permission
// prompt, which must originate from a user gesture — handled by the settings
// modal's checkbox, not requested on page load.
export function notificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission() {
  return notificationSupported() ? Notification.permission : 'unsupported'
}

export async function requestNotificationPermission() {
  if (!notificationSupported()) return 'unsupported'
  return Notification.requestPermission()
}

export function showChainAlertNotification(secondsRemaining) {
  if (!notificationSupported() || Notification.permission !== 'granted') return
  try {
    new Notification('Chain Watch', {
      body: secondsRemaining <= 0 ? 'Chain is dropping now!' : `Chain dropping in ${secondsRemaining}s`,
      tag: 'chain-watch-alert', // reuses one slot across multiple thresholds instead of stacking
      renotify: true, // without this, a 2nd/3rd threshold hitting the same tag can silently replace the first with no new pop/alert
      requireInteraction: true, // stays until dismissed — Chrome's own anti-spam heuristic quiets/blocks a site whose notifications it sees vanish unclicked, so this gives it a real interaction to see instead of none
      silent: true, // we already play our own chirp — avoid a second, different beep
    })
  } catch { /* some browsers restrict Notification() in certain contexts — fail quietly */ }
}

// Drives a red screen flash on/off exactly `times` times via setTimeout chain
// (clearer to reason about than interval-counting). `setVisible` is whatever
// state setter controls the flash overlay's visibility.
export function triggerFlashSequence(setVisible, times = 5, onMs = 150, offMs = 120) {
  let i = 0
  function step() {
    if (i >= times) { setVisible(false); return }
    setVisible(true)
    setTimeout(() => {
      setVisible(false)
      i++
      setTimeout(step, offMs)
    }, onMs)
  }
  step()
}
