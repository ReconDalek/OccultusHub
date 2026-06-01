import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'META', 'LINK'])

function atbash(char) {
  const c = char.charCodeAt(0)
  if (c >= 97 && c <= 122) return String.fromCharCode(219 - c)  // a-z
  if (c >= 65 && c <= 90)  return String.fromCharCode(155 - c)  // A-Z
  return char
}

function encodeText(text) {
  return text.split('').map(atbash).join('')
}

const CipherContext = createContext({ cipherActive: false, toggleCipher: () => {} })

export function CipherProvider({ children }) {
  const [cipherActive, setCipherActive] = useState(
    () => localStorage.getItem('occultus_cipher') === 'true'
  )
  const observerRef  = useRef(null)
  const originalsRef = useRef(new Map())   // TextNode → original string
  const encodedRef   = useRef(new Map())   // TextNode → encoded string
  const applyingRef  = useRef(false)

  const encodeNode = useCallback((node) => {
    if (node.nodeType !== Node.TEXT_NODE) return
    const parent = node.parentElement
    if (!parent || SKIP_TAGS.has(parent.tagName)) return
    const raw = node.nodeValue
    if (!raw || !raw.trim()) return
    // Store original only once (first time we see this node)
    if (!originalsRef.current.has(node)) {
      originalsRef.current.set(node, raw)
    }
    const original = originalsRef.current.get(node)
    const encoded  = encodeText(original)
    encodedRef.current.set(node, encoded)
    node.nodeValue = encoded
  }, [])

  const walkAndEncode = useCallback((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node
    while ((node = walker.nextNode())) encodeNode(node)
  }, [encodeNode])

  const startObserver = useCallback(() => {
    if (observerRef.current) return
    const observer = new MutationObserver((mutations) => {
      if (applyingRef.current) return
      applyingRef.current = true
      try {
        for (const mut of mutations) {
          if (mut.type === 'childList') {
            mut.addedNodes.forEach((n) => {
              if (n.nodeType === Node.TEXT_NODE) encodeNode(n)
              else if (n.nodeType === Node.ELEMENT_NODE) walkAndEncode(n)
            })
          } else if (mut.type === 'characterData') {
            const node = mut.target
            // If the new value is not our encoded value, React updated the text — re-encode
            if (node.nodeValue !== encodedRef.current.get(node)) {
              originalsRef.current.set(node, node.nodeValue)
              encodeNode(node)
            }
          }
        }
      } finally {
        applyingRef.current = false
      }
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true })
    observerRef.current = observer
  }, [encodeNode, walkAndEncode])

  const stopObserver = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (cipherActive) {
      localStorage.setItem('occultus_cipher', 'true')
      applyingRef.current = true
      walkAndEncode(document.body)
      applyingRef.current = false
      startObserver()
    } else {
      localStorage.setItem('occultus_cipher', 'false')
      stopObserver()
      // Restore all original text
      applyingRef.current = true
      originalsRef.current.forEach((original, node) => {
        try { node.nodeValue = original } catch (_) {}
      })
      originalsRef.current.clear()
      encodedRef.current.clear()
      applyingRef.current = false
    }
    return stopObserver
  }, [cipherActive, walkAndEncode, startObserver, stopObserver])

  const toggleCipher = useCallback(() => setCipherActive((v) => !v), [])

  return (
    <CipherContext.Provider value={{ cipherActive, toggleCipher }}>
      {children}
    </CipherContext.Provider>
  )
}

export function useCipher() {
  return useContext(CipherContext)
}
