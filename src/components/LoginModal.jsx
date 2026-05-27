import { useState, useEffect, useRef } from 'react'
import { useSession } from '../hooks/useSession'

export default function LoginModal({ open, onClose }) {
  const { login }         = useSession()
  const [apiKey, setKey]  = useState('')
  const [stay, setStay]   = useState(false)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setStatus('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!open) return null

  async function handleSubmit() {
    const key = apiKey.trim()
    if (!key) return

    setLoading(true)
    setStatus('Authenticating...')

    try {
      const result = await login(key, false, stay)
      if (result.success) {
        onClose()
        setKey('')
        setStatus('')
      } else {
        setStatus(result.error || 'Login failed.')
      }
    } catch {
      setStatus('Network error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[5000] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-[90%] max-w-[460px] rounded-3xl p-10 relative"
        style={{
          background: '#121218',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-white text-3xl bg-transparent border-none cursor-pointer leading-none"
        >
          ×
        </button>

        <h2 className="font-cinzel text-2xl mb-4">Member Authentication</h2>

        <p className="text-sm mb-6" style={{ color: '#a1a1aa' }}>
          Enter your Torn API key to access the inner sanctum.
        </p>

        <input
          ref={inputRef}
          type="password"
          value={apiKey}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          placeholder="Enter Torn API Key"
          className="w-full px-4 py-4 rounded-xl border-none text-white mb-5 outline-none"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        />

        {/* Options */}
        <div className="flex flex-col gap-2.5 mb-5 text-sm" style={{ color: '#a1a1aa' }}>
          <label className="flex items-start gap-2 cursor-pointer leading-tight">
            <input
              type="checkbox"
              checked={stay}
              onChange={(e) => setStay(e.target.checked)}
              className="mt-0.5"
            />
            Stay Logged In
          </label>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3 rounded-xl text-white font-medium cursor-pointer border-none transition-all hover:-translate-y-0.5 disabled:opacity-60"
          style={{
            background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
            boxShadow: '0 0 20px rgba(179,18,63,0.35)',
          }}
        >
          {loading ? 'Authenticating…' : 'Authenticate'}
        </button>

        {status && (
          <p className="mt-3 text-sm text-center" style={{ color: '#a1a1aa' }}>
            {status}
          </p>
        )}

        <p className="text-xs italic mt-10" style={{ color: '#a1a1aa' }}>
          By submitting your API key, you consent to it being saved securely and used
          for faction data collection. Your key will never be shared or stored in
          plaintext and you can revoke access at any time.
        </p>
      </div>
    </div>
  )
}
