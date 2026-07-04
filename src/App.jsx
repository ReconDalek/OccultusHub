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
import Stocks         from './pages/Stocks'
import NotFound       from './pages/NotFound'

const GAME_ROUTES = ['/rite', '/cards', '/sanctum', '/binding'] // active gameplay routes — suppress easter egg overlays

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

  useEffect(() => {
    if (siteTitle) document.title = siteTitle
  }, [siteTitle])

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
