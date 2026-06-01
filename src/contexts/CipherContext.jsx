import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

// ─── Cipher definitions ───────────────────────────────────────────────────────

// Atbash — ancient Hebrew reverse-alphabet cipher (A↔Z)
function atbash(char) {
  const c = char.charCodeAt(0)
  if (c >= 97 && c <= 122) return String.fromCharCode(219 - c)
  if (c >= 65 && c <= 90)  return String.fromCharCode(155 - c)
  return char
}

// ROT13 — shift 13 (self-inverse)
function rot13(char) {
  const c = char.charCodeAt(0)
  if (c >= 97 && c <= 122) return String.fromCharCode(((c - 97 + 13) % 26) + 97)
  if (c >= 65 && c <= 90)  return String.fromCharCode(((c - 65 + 13) % 26) + 65)
  return char
}

// Caesar III — Julius Caesar's original cipher, shift +3
function caesarIII(char) {
  const c = char.charCodeAt(0)
  if (c >= 97 && c <= 122) return String.fromCharCode(((c - 97 + 3) % 26) + 97)
  if (c >= 65 && c <= 90)  return String.fromCharCode(((c - 65 + 3) % 26) + 65)
  return char
}

// Elder Futhark runes — Norse runic alphabet substitution
const FUTHARK_LOWER = {
  a:'ᚨ', b:'ᛒ', c:'ᚲ', d:'ᛞ', e:'ᛖ', f:'ᚠ', g:'ᚷ', h:'ᚺ',
  i:'ᛁ', j:'ᛃ', k:'ᚲ', l:'ᛚ', m:'ᛗ', n:'ᚾ', o:'ᛟ', p:'ᛈ',
  q:'ᚲ', r:'ᚱ', s:'ᛊ', t:'ᛏ', u:'ᚢ', v:'ᚹ', w:'ᚹ', x:'ᛉ',
  y:'ᛃ', z:'ᛉ',
}
const FUTHARK_UPPER = Object.fromEntries(
  Object.entries(FUTHARK_LOWER).map(([k, v]) => [k.toUpperCase(), v])
)
function futhark(char) {
  return FUTHARK_LOWER[char] || FUTHARK_UPPER[char] || char
}

// Vigenère keyed to "OCCULTUS" — shifts each letter by key letter position
const VIGENERE_KEY = 'OCCULTUS'
function makeVigenere(key) {
  const shifts = key.toUpperCase().split('').map((c) => c.charCodeAt(0) - 65)
  let idx = 0
  return function vigenere(char) {
    const c = char.charCodeAt(0)
    if (c >= 97 && c <= 122) {
      const encoded = String.fromCharCode(((c - 97 + shifts[idx % shifts.length]) % 26) + 97)
      idx++
      return encoded
    }
    if (c >= 65 && c <= 90) {
      const encoded = String.fromCharCode(((c - 65 + shifts[idx % shifts.length]) % 26) + 65)
      idx++
      return encoded
    }
    return char
  }
}

const CIPHERS = [
  { name: 'Atbash',        label: 'Atbash ᚨ',        fn: () => (text) => text.split('').map(atbash).join('')   },
  { name: 'ROT13',         label: 'ROT XIII',         fn: () => (text) => text.split('').map(rot13).join('')    },
  { name: 'Caesar III',    label: 'Caesar III',       fn: () => (text) => text.split('').map(caesarIII).join('')},
  { name: 'Elder Futhark', label: 'ᚠᚢᚦᚨᚱᚲ',          fn: () => (text) => text.split('').map(futhark).join('')  },
  { name: 'Vigenère',      label: 'Vigenère OCCULTUS', fn: () => { const v = makeVigenere(VIGENERE_KEY); return (text) => text.split('').map(v).join('') } },
]

function pickCipher() {
  return CIPHERS[Math.floor(Math.random() * CIPHERS.length)]
}

// ─── Context ──────────────────────────────────────────────────────────────────

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'META', 'LINK'])

const CipherContext = createContext({
  cipherActive: false,
  cipherName: '',
  cipherLabel: '',
  toggleCipher: () => {},
})

export function CipherProvider({ children }) {
  const [cipherActive, setCipherActive] = useState(
    () => localStorage.getItem('occultus_cipher') === 'true'
  )
  const [cipherMeta, setCipherMeta] = useState({ name: '', label: '' })

  const observerRef  = useRef(null)
  const originalsRef = useRef(new Map())
  const encodedRef   = useRef(new Map())
  const applyingRef  = useRef(false)
  const encodeFnRef  = useRef((t) => t)

  const encodeNode = useCallback((node) => {
    if (node.nodeType !== Node.TEXT_NODE) return
    const parent = node.parentElement
    if (!parent || SKIP_TAGS.has(parent.tagName)) return
    const raw = node.nodeValue
    if (!raw || !raw.trim()) return
    if (!originalsRef.current.has(node)) originalsRef.current.set(node, raw)
    const original = originalsRef.current.get(node)
    const encoded  = encodeFnRef.current(original)
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
      const chosen = pickCipher()
      encodeFnRef.current = chosen.fn()
      setCipherMeta({ name: chosen.name, label: chosen.label })
      localStorage.setItem('occultus_cipher', 'true')
      applyingRef.current = true
      walkAndEncode(document.body)
      applyingRef.current = false
      startObserver()
    } else {
      setCipherMeta({ name: '', label: '' })
      localStorage.setItem('occultus_cipher', 'false')
      stopObserver()
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
    <CipherContext.Provider value={{ cipherActive, cipherName: cipherMeta.name, cipherLabel: cipherMeta.label, toggleCipher }}>
      {children}
    </CipherContext.Provider>
  )
}

export function useCipher() {
  return useContext(CipherContext)
}
