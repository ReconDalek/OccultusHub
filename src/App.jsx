import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SessionProvider } from './hooks/useSession'
import { useState, useEffect } from 'react'
import { API_BASE_URL } from './config/api'

import BackgroundOverlay from './components/BackgroundOverlay'
import Navbar            from './components/Navbar'
import ProtectedRoute    from './components/ProtectedRoute'

import Home       from './pages/Home'
import About      from './pages/About'
import Factions   from './pages/Factions'
import Companies  from './pages/Companies'
import Leadership from './pages/Leadership'
import Respect    from './pages/Respect'
import Admin      from './pages/Admin'
import NotFound   from './pages/NotFound'

function Layout({ children }) {
  return (
    <>
      <BackgroundOverlay />
      <Navbar />
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </>
  )
}

// Respect page has its own full-height layout (no standard navbar needed)
function RespectLayout() {
  return (
    <>
      <BackgroundOverlay />
      {/* Minimal navbar for Respect page */}
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
    </>
  )
}

export default function App() {
  const [pageVisibility, setPageVisibility] = useState({
    factions: true,
    companies: true,
    leadership: true,
    respect: true,
  })
  const [visibilityLoaded, setVisibilityLoaded] = useState(false)

  useEffect(() => {
    const fetchPageVisibility = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/pages/visibility`)
        const data = await res.json()
        setPageVisibility(data)
      } catch (err) {
        console.error('Failed to fetch page visibility:', err)
      } finally {
        setVisibilityLoaded(true)
      }
    }

    fetchPageVisibility()
  }, [])

  if (!visibilityLoaded) {
    return (
      <BrowserRouter>
        <SessionProvider>
          <div
            className="flex items-center justify-center"
            style={{
              minHeight: '100vh',
              background: '#07070a',
              color: '#a1a1aa',
            }}
          >
            Loading...
          </div>
        </SessionProvider>
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/" element={<Layout><Home /></Layout>} />
          <Route path="/about" element={<Layout><About /></Layout>} />

          {pageVisibility.factions && (
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

          {pageVisibility.companies && (
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

          {pageVisibility.leadership && (
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

          {pageVisibility.respect && (
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

          <Route path="*" element={<Layout><NotFound /></Layout>} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}
