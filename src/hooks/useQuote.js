import { useState, useEffect } from 'react'
import { OCCULTUS_CONFIG } from '../lib/config'

export function useQuote(intervalMs = 30000) {
  const quotes = OCCULTUS_CONFIG.quotes

  const [index, setIndex] = useState(
    () => Math.floor(Math.random() * quotes.length)
  )
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex(prev => {
          let next
          do {
            next = Math.floor(Math.random() * quotes.length)
          } while (quotes.length > 1 && next === prev)
          return next
        })
        setVisible(true)
      }, 300)
    }, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, quotes.length])

  return { quote: quotes[index], visible }
}
