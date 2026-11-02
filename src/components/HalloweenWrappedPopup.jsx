import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { WRAPPED_STORAGE_KEY } from '../pages/HalloweenWrapped'

// Live window for offering the recap at all — a little past the event itself
// so stragglers who log in a few days later still catch it, without it
// lingering indefinitely once Halloween is long over.
function withinOfferWindow() {
  const now = new Date()
  const start = new Date('2026-10-25T00:00:00Z')
  const end = new Date('2026-11-08T00:00:00Z')
  return now >= start && now < end
}

export default function HalloweenWrappedPopup() {
  const { user, loading } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (loading || !user?.isFactionMember || !user?.tornUserId) return
    if (location.pathname === '/halloween-wrapped') return
    if (!withinOfferWindow()) return
    try {
      if (localStorage.getItem(WRAPPED_STORAGE_KEY(user.tornUserId))) return
    } catch { return }
    setShow(true)
  }, [loading, user, location.pathname])

  if (!show) return null

  const dismiss = () => {
    try { localStorage.setItem(WRAPPED_STORAGE_KEY(user.tornUserId), '1') } catch { /* ignore */ }
    setShow(false)
  }
  const view = () => { dismiss(); navigate('/halloween-wrapped') }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(5,0,10,0.72)', backdropFilter: 'blur(3px)', padding: 20,
    }} onClick={dismiss}>
      <div onClick={e => e.stopPropagation()} style={{
        maxWidth: 380, width: '100%', borderRadius: 18, textAlign: 'center',
        background: 'linear-gradient(160deg, rgba(60,10,100,0.55), rgba(15,5,25,0.9))',
        border: '1px solid rgba(168,85,247,0.35)', boxShadow: '0 0 50px rgba(109,40,217,0.3)',
        padding: '32px 26px',
      }}>
        <div style={{ fontSize: 48 }}>🎃</div>
        <h3 className="font-cinzel" style={{ margin: '12px 0 6px', fontSize: 20, color: '#f4f4f5', letterSpacing: '1px' }}>
          Your Halloween Wrapped is ready
        </h3>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: '0 0 22px' }}>
          A look back at your trick-or-treat season — your stats, your rank, and the whole Occultus family's numbers.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={dismiss} style={{
            padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)',
            background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
          }}>Maybe later</button>
          <button onClick={view} style={{
            padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: '#b3123f', color: '#fff',
          }}>View My Wrapped</button>
        </div>
      </div>
    </div>
  )
}
