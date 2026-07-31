import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { useCipher } from '../contexts/CipherContext'
import { useSite } from '../contexts/SiteContext'
import { OCCULTUS_CONFIG } from '../lib/config'
import LoginModal from './LoginModal'
import Grimoire   from './Grimoire'
import ProfileCard from './ProfileCard'

const DEFAULT_AVATAR = 'https://www.torn.com/images/profile_man.jpg'

function SafeAvatar({ src, alt, className }) {
  const [imgSrc, setImgSrc] = useState(src || DEFAULT_AVATAR)
  useEffect(() => { setImgSrc(src || DEFAULT_AVATAR) }, [src])
  return (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      onError={() => setImgSrc(DEFAULT_AVATAR)}
    />
  )
}

function buildNavLinks(user, pages) {
  const links = [
    { label: 'Home',  to: '/'      },
    { label: 'About', to: '/about' },
    { label: 'Games', to: '/games' },
  ]
  if (user?.isFactionMember) {
    links.push({ label: 'Forums', to: '/forums' })
    links.push({ label: 'Stocks', to: '/stocks' })
    if (pages.factions)  links.push({ label: 'Factions',  to: '/factions'  })
    if (pages.companies) links.push({ label: 'Companies', to: '/companies' })
  }
  return links
}

export default function Navbar() {
  const { user, logout } = useSession()
  const { cipherActive, toggleCipher } = useCipher()
  const { pages } = useSite()
  const location = useLocation()
  const [modalOpen, setModalOpen]       = useState(false)
  const [dropdownOpen, setDropdown]     = useState(false)
  const [grimoireOpen, setGrimoire]     = useState(false)
  const [grimoirePage, setGrimoirePage] = useState(null)
  const [profileOpen, setProfileOpen]   = useState(false)
  const dropdownRef  = useRef(null)
  const logoClickRef = useRef({ count: 0, timer: null })

  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    function handler(e) {
      setGrimoirePage(e.detail?.index ?? null)
      setGrimoire(true)
    }
    window.addEventListener('openGrimoirePage', handler)
    return () => window.removeEventListener('openGrimoirePage', handler)
  }, [])

  function handleLogoClick(e) {
    const lc = logoClickRef.current
    lc.count += 1
    clearTimeout(lc.timer)
    if (lc.count >= 5) {
      lc.count = 0
      e.preventDefault()
      setGrimoirePage(null)
      setGrimoire(true)
      return
    }
    lc.timer = setTimeout(() => { lc.count = 0 }, 800)
  }

  const factionLabel = OCCULTUS_CONFIG.factionNames[Number(user?.factionId)] || 'Visitor'
  const navLinks = buildNavLinks(user, pages)

  const GAME_PATHS = ['/games', '/rite', '/cards', '/sanctum']
  const linkStyle = (to) => {
    const isActive = to === '/games'
      ? GAME_PATHS.includes(location.pathname)
      : location.pathname === to
    return { color: isActive ? '#f4f4f5' : "var(--text-secondary)", textDecoration: 'none' }
  }

  function NavLink({ to, label }) {
    return (
      <Link
        to={to}
        className="transition-colors duration-300 no-underline whitespace-nowrap"
        style={linkStyle(to)}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#f4f4f5')}
        onMouseLeave={(e) => (e.currentTarget.style.color = linkStyle(to).color)}
      >
        {label}
      </Link>
    )
  }

  return (
    <>
      <nav
        className="sticky top-0 w-full z-[1000]"
        style={{
          background: 'rgba(5,5,10,0.82)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(14px)',
        }}
      >
        {/* ── Row 1: Logo (left) · Desktop nav links (center) · Auth (right) ── */}
        <div
          className="relative flex items-center justify-between"
          style={{ padding: '20px 48px' }}
        >
          {/* LEFT – Logo */}
          <div className="flex items-center z-20 shrink-0">
            <Link to="/" style={{ textDecoration: 'none' }} onClick={handleLogoClick}>
              <h1
                className="font-cinzel text-white"
                style={{ fontSize: 'clamp(18px, 3.5vw, 28px)', letterSpacing: '6px', margin: 0 }}
              >
                OCCULTUS
              </h1>
              <span
                className="block"
                style={{ color: "var(--text-secondary)", fontSize: '12px', letterSpacing: '3px' }}
              >
                The Inner Sanctum
              </span>
            </Link>
          </div>

          {/* CENTER – Nav links, desktop only (absolutely centred in row 1) */}
          <div
            className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-8 z-10"
          >
            {navLinks.map((link) => (
              <NavLink key={link.to} to={link.to} label={link.label} />
            ))}
          </div>

          {/* RIGHT – Auth */}
          <div className="flex items-center gap-3 ml-auto z-20 shrink-0">
            {user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdown((v) => !v)}
                  className="p-0 border-none bg-transparent cursor-pointer"
                >
                  <SafeAvatar
                    src={user.image}
                    alt="Member Avatar"
                    className="w-[52px] h-[52px] rounded-full object-cover block"
                    style={{ border: '3px solid #4f0051' }}
                  />
                </button>

                {dropdownOpen && (
                  <div
                    className="absolute top-[calc(100%+12px)] right-0 w-[260px] rounded-2xl p-[18px] z-[99999]"
                    style={{
                      background: 'rgba(12,12,12,0.96)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.45)',
                      backdropFilter: 'blur(14px)',
                    }}
                  >
                    <div className="flex gap-3.5 items-center">
                      <SafeAvatar
                        src={user.image}
                        alt="Avatar"
                        className="w-16 h-16 rounded-full object-cover"
                        style={{ border: '3px solid #4f0051' }}
                      />
                      <div>
                        <div className="font-bold text-base">{user.username || 'Unknown'}</div>
                        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                          {user.factionPosition || 'Visitor'}
                        </div>
                        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                          {factionLabel}
                        </div>
                        {user.fishingPoints != null && (
                          <button
                            onClick={() => { window.dispatchEvent(new CustomEvent('openFishingLeaderboard')); setDropdown(false) }}
                            className="border-none bg-transparent p-0 cursor-pointer text-left block"
                            style={{ color: '#a78bfa', fontSize: '12px', marginTop: '3px', letterSpacing: '0.03em' }}
                            title="View void seers leaderboard"
                          >
                            ◈ {user.fishingPoints.toLocaleString()} void essence
                          </button>
                        )}
                        {user.runePoints != null && (
                          <button
                            onClick={() => { window.dispatchEvent(new CustomEvent('openRuneLeaderboard')); setDropdown(false) }}
                            className="border-none bg-transparent p-0 cursor-pointer text-left block"
                            style={{ color: '#a78bfa', fontSize: '12px', marginTop: '1px', letterSpacing: '0.03em' }}
                            title="View rune seers leaderboard"
                          >
                            ᚠ {user.runePoints.toLocaleString()} rune essence
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-2">
                      {user.tornUserId && (
                        <button
                          onClick={() => { setProfileOpen(true); setDropdown(false) }}
                          className="w-full py-2.5 px-3.5 rounded-xl text-white cursor-pointer border-none transition-all hover:opacity-80"
                          style={{ background: 'rgba(255,255,255,0.06)' }}
                        >
                          View Full Profile
                        </button>
                      )}
                      {user.isLeader && pages.leadership && (
                        <Link
                          to="/leadership"
                          className="w-full py-2.5 px-3.5 rounded-xl text-white cursor-pointer border-none transition-all hover:opacity-80 block text-center no-underline"
                          style={{ background: 'rgba(109,40,217,0.2)' }}
                          onClick={() => setDropdown(false)}
                        >
                          Leadership
                        </Link>
                      )}
                      {user.isAdmin && (
                        <Link
                          to="/admin"
                          className="w-full py-2.5 px-3.5 rounded-xl text-white cursor-pointer border-none transition-all hover:opacity-80 block text-center no-underline"
                          style={{ background: 'rgba(179,18,63,0.2)' }}
                          onClick={() => setDropdown(false)}
                        >
                          Admin Panel
                        </Link>
                      )}
                      <button
                        onClick={toggleCipher}
                        className="w-full py-2.5 px-3.5 rounded-xl text-white cursor-pointer border-none transition-all hover:opacity-80 flex items-center justify-between gap-2"
                        style={{
                          background: cipherActive
                            ? 'linear-gradient(135deg, rgba(109,40,217,0.35), rgba(179,18,63,0.35))'
                            : 'rgba(109,40,217,0.12)',
                          border: cipherActive
                            ? '1px solid rgba(109,40,217,0.5)'
                            : '1px solid rgba(109,40,217,0.2)',
                          boxShadow: cipherActive ? '0 0 12px rgba(109,40,217,0.3)' : 'none',
                        }}
                      >
                        <span style={{ letterSpacing: '0.5px', fontSize: '14.8px' }}>
                          The Silent Shadows
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            letterSpacing: '1px',
                            color: cipherActive ? '#c084fc' : '#7c3aed',
                            fontFamily: 'monospace',
                          }}
                        >
                          {cipherActive ? '◈ ON' : '◇ OFF'}
                        </span>
                      </button>
                      <button
                        onClick={async () => { await logout(); setDropdown(false) }}
                        className="w-full py-2.5 px-3.5 rounded-xl text-white cursor-pointer border-none transition-all hover:opacity-80"
                        style={{ background: 'rgba(255,255,255,0.08)' }}
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setModalOpen(true)}
                className="px-5 py-3 rounded-xl text-white border-none cursor-pointer transition-all hover:-translate-y-0.5 whitespace-nowrap"
                style={{
                  background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
                  boxShadow: '0 0 20px rgba(179,18,63,0.35)',
                }}
              >
                Member Login
              </button>
            )}
          </div>
        </div>

        {/* ── Row 2: Mobile nav links only (hidden on md+) — horizontally scrollable ── */}
        {navLinks.length > 0 && (
          <div
            className="md:hidden"
            style={{
              borderTop: '1px solid rgba(255,255,255,0.05)',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              /* hide scrollbar on all browsers */
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            <style>{`.mob-nav::-webkit-scrollbar { display: none; }`}</style>
            <div
              className="mob-nav flex items-center gap-x-5 pb-3"
              style={{
                paddingLeft: 16,
                paddingRight: 16,
                width: 'max-content',
                minWidth: '100%',
              }}
            >
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="transition-colors duration-300 no-underline whitespace-nowrap"
                  style={{
                    ...linkStyle(link.to),
                    fontSize: '13px',
                    letterSpacing: '0.3px',
                    paddingTop: '10px',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#f4f4f5')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = linkStyle(link.to).color)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>

      <LoginModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <Grimoire open={grimoireOpen} onClose={() => { setGrimoire(false); setGrimoirePage(null) }} openToPage={grimoirePage} />
      {profileOpen && user?.tornUserId && (
        <ProfileCard tornUserId={user.tornUserId} onClose={() => setProfileOpen(false)} />
      )}
    </>
  )
}
