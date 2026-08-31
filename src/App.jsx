import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { SessionProvider } from './hooks/useSession'
import { CipherProvider } from './contexts/CipherContext'
import { SiteProvider, useSite } from './contexts/SiteContext'
import { useEffect } from 'react'
import { API_BASE_URL } from './config/api'

import BackgroundOverlay from './components/BackgroundOverlay'
import Navbar            from './components/Navbar'
import ProtectedRoute    from './components/ProtectedRoute'
import CipherOverlay     from './components/CipherOverlay'
import Footer            from './components/Footer'
import QuoteBox          from './components/QuoteBox'
import DiscordWidget     from './components/DiscordWidget/DiscordWidget'
import FishingEasterEgg from './components/FishingEasterEgg'
import RuneEasterEgg    from './components/RuneEasterEgg'
import WatchingEye      from './components/WatchingEye'
import SeasonalEvents  from './components/SeasonalEvents'

import Home       from './pages/Home'
import About      from './pages/About'
import Factions   from './pages/Factions'
import Companies  from './pages/Companies'
import Leadership from './pages/Leadership'
import Respect    from './pages/Respect'
import Admin          from './pages/Admin'
import TermsOfService from './pages/TermsOfService'
import PrivacyPolicy  from './pages/PrivacyPolicy'
import Forums         from './pages/Forums'
import Games          from './pages/Games'
import GameRoom       from './pages/GameRoom'
import CardsGame      from './pages/CardsGame'
import Sanctum        from './pages/Sanctum'
import Binding        from './pages/Binding'
import Pact           from './pages/Pact'
import Stocks         from './pages/Stocks'
import NotFound       from './pages/NotFound'

const GAME_ROUTES = ['/rite', '/cards', '/sanctum', '/binding', '/pact'] // active gameplay routes — suppress easter egg overlays

const PAGE_META = {
  '/': {
    title: 'Occultus Hub — Occultus Faction, Torn City',
    description: 'Occultus Hub — the official hub for the Occultus faction family in Torn City. Faction stats, war tracking, leadership tools, and community for Occultus, Occul2us, and Occul3us.',
  },
  '/about': {
    title: 'About Occultus — Occultus Hub',
    description: 'The story of Occultus, a Torn City faction born into blood, fire, and revenge — and the rise of the Occultus faction family.',
  },
  '/games': {
    title: 'Games — Occultus Hub',
    description: 'Community games and events run by Occultus, the Torn City faction.',
  },
  '/pact': {
    title: 'The Pact — Occultus Hub',
    description: 'An occult 18-night ritual of favour, followers, and Fate — played solo or in teams.',
  },
  '/respect': {
    title: 'Respect — Occultus Hub',
    description: 'Respect and recognition within the Occultus faction family on Torn City.',
  },
  '/tos': {
    title: 'Terms of Service — Occultus Hub',
    description: 'Terms of Service for Occultus Hub.',
  },
  '/privacy': {
    title: 'Privacy Policy — Occultus Hub',
    description: 'Privacy Policy for Occultus Hub.',
  },
}

function usePageMeta(pathname, siteTitle) {
  useEffect(() => {
    const meta = PAGE_META[pathname]
    document.title = meta ? meta.title : (siteTitle || 'Occultus Hub')

    let tag = document.querySelector('meta[name="description"]')
    if (!tag) {
      tag = document.createElement('meta')
      tag.setAttribute('name', 'description')
      document.head.appendChild(tag)
    }
    if (meta) tag.setAttribute('content', meta.description)

    let canonical = document.querySelector('link[rel="canonical"]')
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.setAttribute('rel', 'canonical')
      document.head.appendChild(canonical)
    }
    canonical.setAttribute('href', `https://occultushub.com${pathname}`)
  }, [pathname, siteTitle])
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function Layout({ children }) {
  const { pathname } = useLocation()
  const isGameRoute = GAME_ROUTES.includes(pathname)

  return (
    <>
      <ScrollToTop />
      <BackgroundOverlay />
      {!isGameRoute && <CipherOverlay />}
      <Navbar />
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
      <QuoteBox />
      <Footer />
      {/* <DiscordWidget /> */}
      {!isGameRoute && <FishingEasterEgg />}
      {!isGameRoute && <RuneEasterEgg />}
      {!isGameRoute && <WatchingEye />}
      <SeasonalEvents />
    </>
  )
}

function RespectLayout() {
  return (
    <>
      <BackgroundOverlay />
      <CipherOverlay />
      <nav
        className="sticky top-0 w-full z-[1000] flex items-center justify-between"
        style={{
          padding: '20px 48px',
          background: 'rgba(5,5,10,0.82)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(14px)',
        }}
      >
        <div className="flex items-center">
          <span
            className="font-cinzel text-white"
            style={{ fontSize: '28px', letterSpacing: '6px' }}
          >
            OCCULTUS
          </span>
        </div>
        <a
          href="/"
          className="px-5 py-3 rounded-xl text-white no-underline transition-all hover:-translate-y-0.5"
          style={{
            background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
            boxShadow: '0 0 20px rgba(179,18,63,0.35)',
          }}
        >
          Back Home
        </a>
      </nav>
      <Respect />
      <QuoteBox />
      <Footer />
    </>
  )
}

function AppRoutes() {
  const { pages, siteTitle, loaded } = useSite()
  const { pathname } = useLocation()

  usePageMeta(pathname, siteTitle)

  if (!loaded) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: '100vh', color: "var(--text-secondary)" }}
      >
        Loading...
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Layout><Home /></Layout>} />
      <Route path="/about" element={<Layout><About /></Layout>} />

      {pages.factions && (
        <Route
          path="/factions"
          element={
            <Layout>
              <ProtectedRoute requiredLevel="member">
                <Factions />
              </ProtectedRoute>
            </Layout>
          }
        />
      )}

      {pages.companies && (
        <Route
          path="/companies"
          element={
            <Layout>
              <ProtectedRoute requiredLevel="member">
                <Companies />
              </ProtectedRoute>
            </Layout>
          }
        />
      )}

      {pages.leadership && (
        <Route
          path="/leadership"
          element={
            <Layout>
              <ProtectedRoute requiredLevel="leadership">
                <Leadership />
              </ProtectedRoute>
            </Layout>
          }
        />
      )}

      {pages.respect && (
        <Route path="/respect" element={<RespectLayout />} />
      )}

      <Route
        path="/admin"
        element={
          <Layout>
            <ProtectedRoute requiredLevel="admin">
              <Admin />
            </ProtectedRoute>
          </Layout>
        }
      />

      <Route
        path="/forums"
        element={
          <Layout>
            <ProtectedRoute requiredLevel="member">
              <Forums />
            </ProtectedRoute>
          </Layout>
        }
      />

      <Route
        path="/stocks"
        element={
          <Layout>
            <ProtectedRoute requiredLevel="member">
              <Stocks />
            </ProtectedRoute>
          </Layout>
        }
      />

      <Route path="/games" element={<Layout><Games /></Layout>} />
      <Route path="/rite" element={<Layout><GameRoom /></Layout>} />
      <Route path="/cards" element={<Layout><CardsGame /></Layout>} />
      <Route path="/sanctum" element={<Layout><Sanctum /></Layout>} />
      <Route path="/binding" element={<Layout><Binding /></Layout>} />
      <Route path="/pact" element={<Layout><Pact /></Layout>} />

      <Route path="/tos"     element={<Layout><TermsOfService /></Layout>} />
      <Route path="/privacy" element={<Layout><PrivacyPolicy /></Layout>} />

      <Route path="*" element={<Layout><NotFound /></Layout>} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <CipherProvider>
        <SessionProvider>
          <SiteProvider>
            <AppRoutes />
          </SiteProvider>
        </SessionProvider>
      </CipherProvider>
    </BrowserRouter>
  )
}
