import { createContext, useContext, useState, useEffect } from 'react'
import { API_BASE_URL } from '../config/api'

const DEFAULT_PAGES = { factions: true, companies: true, leadership: true, respect: true }

const SiteContext = createContext({
  pages: DEFAULT_PAGES,
  siteTitle: 'OCCULTUS',
  loaded: false,
})

export function SiteProvider({ children }) {
  const [pages, setPages] = useState(DEFAULT_PAGES)
  const [siteTitle, setSiteTitle] = useState('OCCULTUS')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/api/pages/visibility`).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/settings/public`).then((r) => r.json()),
    ])
      .then(([pagesData, settingsData]) => {
        setPages({ ...DEFAULT_PAGES, ...pagesData })
        if (settingsData?.site_title) setSiteTitle(settingsData.site_title)
      })
      .catch(console.error)
      .finally(() => setLoaded(true))
  }, [])

  return (
    <SiteContext.Provider value={{ pages, siteTitle, loaded }}>
      {children}
    </SiteContext.Provider>
  )
}

export const useSite = () => useContext(SiteContext)
