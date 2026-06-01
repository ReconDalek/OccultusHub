import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { useCipher } from '../contexts/CipherContext'
import { OCCULTUS_CONFIG } from '../lib/config'
import LoginModal from './LoginModal'

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

function buildNavLinks(user) {
  const links = [
    { label: 'Home',  to: '/'      },
    { label: 'About', to: '/about' },
  ]
  if (user?.isFactionMember) {
    links.push(
      { label: 'Factions',  to: '/factions'  },
      { label: 'Companies', to: '/companies' },
    )
  }
  if (user?.isLeader) {
    links.push({ label: 'Leadership', to: '/leadership' })
  }
  return links
}

export default function Navbar() {
  const { user, logout } = useSession()
  const { cipherActive, toggleCipher } = useCipher()
  const location         = useLocation()
  const [modalOpen, setModalOpen]     = useState(false)
  const [dropdownOpen, setDropdown]   = useState(false)
  const dropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const factionLabel =
    OCCULTUS_CONFIG.factionNames[Number(user?.factionId)] || 'Visitor'

  const navLinks = buildNavLinks(user)

  return (
    <>
      <nav
        className="sticky top-0 w-full z-[1000] flex items-center justify-between"
        style={{
          padding: '20px 48px',
          background: 'rgba(5,5,10,0.82)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(14px)',
        }}
      >
        {/* LEFT – Logo */}
        <div className="flex items-center z-20">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <div>
              <h1
                className="font-cinzel text-white"
                style={{ fontSize: '28px', letterSpacing: '6px' }}
              >
                OCCULTUS
              </h1>
              <span
                className="block"
                style={{ color: '#a1a1aa', fontSize: '12px', letterSpacing: '3px' }}
              >
                The Inner Sanctum
              </span>
            </div>
          </Link>
        </div>

        {/* CENTER – Nav links (absolutely centered) */}
        <div
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-8 flex-wrap justify-center z-10"
          style={{ maxWidth: 'calc(100% - 400px)' }}
        >
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="transition-colors duration-300 no-underline"
              style={{
                color: location.pathname === link.to ? '#f4f4f5' : '#a1a1aa',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => (e.target.style.color = '#f4f4f5')}
              onMouseLeave={(e) =>
                (e.target.style.color =
                  location.pathname === link.to ? '#f4f4f5' : '#a1a1aa')
              }
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* RIGHT – Auth */}
        <div className="flex items-center gap-3 ml-auto z-20">
          {user ? (
            /* ── Member card ── */
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
                      <div className="text-sm" style={{ color: '#a1a1aa' }}>
                        {user.factionPosition || 'Visitor'}
                      </div>
                      <div className="text-sm" style={{ color: '#a1a1aa' }}>
                        {factionLabel}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
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
                      <span style={{ letterSpacing: '0.5px', fontSize: '13px' }}>
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
              className="px-5 py-3 rounded-xl text-white border-none cursor-pointer transition-all hover:-translate-y-0.5"
              style={{
                background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
                boxShadow: '0 0 20px rgba(179,18,63,0.35)',
              }}
            >
              Member Login
            </button>
          )}
        </div>
      </nav>

      <LoginModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}
