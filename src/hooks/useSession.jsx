import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  checkSession,
  authenticateUser,
  logout as authLogout,
  getUserSession,
} from '../lib/auth'

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  // On mount, validate existing session
  useEffect(() => {
    ;(async () => {
      // Optimistic: load from localStorage immediately so UI doesn't flash
      const cached = getUserSession()
      if (cached) setUser(cached)

      const validated = await checkSession()
      setUser(validated)
      setLoading(false)
    })()
  }, [])

  const login = useCallback(async (apiKey, rememberMe, stayLoggedIn) => {
    const result = await authenticateUser(apiKey, rememberMe, stayLoggedIn)
    if (result.success) {
      setUser(result.user)
    }
    return result
  }, [])

  const logout = useCallback(async () => {
    await authLogout()
    setUser(null)
  }, [])

  return (
    <SessionContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}
