import { createContext, useContext, useState, useEffect } from 'react'
import { API_BASE_URL } from '../config/api'

const DEFAULT_PAGES = { factions: true, companies: true, leadership: true, respect: true }

const ALL_EVENTS = ['blood_moon','new_year','valentines','st_patricks','walpurgis','spring_equinox','beltane','summer_solstice','lammas','autumn_equinox','halloween','samhain','day_of_dead','anniversary','winter_solstice','yuletide']
const DEFAULT_EVENTS = Object.fromEntries(ALL_EVENTS.map(k => [k, true]))

const SiteContext = createContext({
  pages: DEFAULT_PAGES,
  siteTitle: 'OCCULTUS',
  fishingEnabled: true,
  runesEnabled: true,
  seasonalEvents: DEFAULT_EVENTS,
  loaded: false,
})

export function SiteProvider({ children }) {
  const [pages, setPages] = useState(DEFAULT_PAGES)
  const [siteTitle, setSiteTitle] = useState('OCCULTUS')
  const [fishingEnabled, setFishingEnabled] = useState(true)
  const [runesEnabled, setRunesEnabled] = useState(true)
  const [seasonalEvents, setSeasonalEvents] = useState(DEFAULT_EVENTS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/api/pages/visibility`).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/settings/public`).then((r) => r.json()),
    ])
      .then(([pagesData, settingsData]) => {
        setPages({ ...DEFAULT_PAGES, ...pagesData })
        if (settingsData?.site_title) setSiteTitle(settingsData.site_title)
        setFishingEnabled(settingsData?.fishing_enabled !== '0')
        setRunesEnabled(settingsData?.runes_enabled !== '0')
        setSeasonalEvents(Object.fromEntries(ALL_EVENTS.map(k => [k, settingsData?.[`event_${k}`] !== '0'])))
      })
      .catch(console.error)
      .finally(() => setLoaded(true))
  }, [])

  return (
    <SiteContext.Provider value={{ pages, siteTitle, fishingEnabled, runesEnabled, seasonalEvents, loaded }}>
      {children}
    </SiteContext.Provider>
  )
}

export const useSite = () => useContext(SiteContext)
