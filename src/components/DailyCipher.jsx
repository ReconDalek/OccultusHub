import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../config/api'
import { getSessionToken } from '../lib/auth'

const DIFFICULTY_COLORS = {
  Easy:   { bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)',  text: '#10b981' },
  Medium: { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  text: '#f59e0b' },
  Hard:   { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   text: '#ef4444' },
}

export default function DailyCipher({ guest = false }) {
  const [cipher, setCipher] = useState(null)
  const [loading, setLoading] = useState(true)
  const [answer, setAnswer] = useState('')
  const [guestName, setGuestName] = useState('')
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [alreadySolved, setAlreadySolved] = useState(false)

  const token = getSessionToken()

  useEffect(() => {
    const headers = token ? { Authorization: token } : {}
    fetch(`${API_BASE_URL}/api/cipher/today`, { headers })
      .then(r => r.json())
      .then(data => { setCipher(data); setLoading(false) })
      .catch(() => setLoading(false))

    // Guests can't persist result (no account), members use localStorage
    if (!guest) {
      const today = new Date().toISOString().slice(0, 10)
      const saved = localStorage.getItem(`cipher_${today}`)
      if (saved) {
        const parsed = JSON.parse(saved)
        setResult(parsed)
        setAlreadySolved(parsed.isCorrect)
      }
    }
  }, [])

  async function handleSubmit() {
    if (!answer.trim() || submitting || alreadySolved) return
    if (guest && !guestName.trim()) return
    setSubmitting(true)
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = token
      const body = guest ? { answer, guestName } : { answer }
      const res = await fetch(`${API_BASE_URL}/api/cipher/submit`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setResult(data)
      if (data.isCorrect) setAlreadySolved(true)
      if (!guest) {
        const today = new Date().toISOString().slice(0, 10)
        localStorage.setItem(`cipher_${today}`, JSON.stringify(data))
      }
    } catch {} finally {
      setSubmitting(false)
    }
  }

  const diff = cipher ? DIFFICULTY_COLORS[cipher.difficulty] : null

  return (
    <div
      style={{
        background: 'rgba(22,22,32,0.82)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2
            className="font-cinzel"
            style={{ fontSize: 18, color: '#f4f4f5', margin: '0 0 4px', letterSpacing: 1 }}
          >
            DAILY CIPHER
          </h2>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
            {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </p>
        </div>
        {!guest && cipher && diff && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <span style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: 11,
              color: '#a1a1aa',
            }}>
              {cipher.name}
            </span>
            <span style={{
              background: diff.bg,
              border: `1px solid ${diff.border}`,
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: 11,
              color: diff.text,
              fontWeight: 600,
            }}>
              {cipher.difficulty}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Loading today's cipher...</p>
      ) : !cipher ? (
        <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>Failed to load cipher.</p>
      ) : (
        <>
          {/* Ciphertext display */}
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14,
            padding: '20px 24px',
            textAlign: 'center',
          }}>
            <p style={{
              margin: 0,
              fontFamily: 'monospace',
              fontSize: 'clamp(15px, 3vw, 20px)',
              color: '#f4f4f5',
              letterSpacing: '3px',
              lineHeight: 1.6,
              wordBreak: 'break-all',
            }}>
              {cipher.ciphertext}
            </p>
            {cipher.extra && (
              <p style={{ margin: '10px 0 0', fontSize: 11, color: '#4b5563' }}>
                {cipher.extra}
              </p>
            )}
          </div>

          {/* Hint */}
          <div>
            <button
              onClick={() => setShowHint(h => !h)}
              style={{
                background: 'none',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#a1a1aa',
                fontSize: 12,
                padding: '6px 14px',
                cursor: 'pointer',
                transition: 'border-color 0.2s, color 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; e.currentTarget.style.color = '#f4f4f5' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#a1a1aa' }}
            >
              {showHint ? '▲ Hide Hint' : '▼ Show Hint'}
            </button>
            {showHint && (
              <div style={{
                marginTop: 10,
                background: 'rgba(109,40,217,0.08)',
                border: '1px solid rgba(109,40,217,0.2)',
                borderRadius: 10,
                padding: '12px 16px',
                fontSize: 13,
                color: '#c4b5fd',
                lineHeight: 1.5,
              }}>
                💡 {cipher.hint}
              </div>
            )}
          </div>

          {/* Result banner */}
          {result && (
            <div style={{
              background: result.isCorrect ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${result.isCorrect ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              borderRadius: 12,
              padding: '14px 18px',
              fontSize: 13,
            }}>
              <p style={{ margin: 0, fontWeight: 600, color: result.isCorrect ? '#10b981' : '#ef4444' }}>
                {result.isCorrect ? '✓ Correct! Well done.' : '✗ Incorrect — try again.'}
              </p>
              {result.isCorrect && result.plaintext && (
                <p style={{ margin: '6px 0 0', color: '#a1a1aa', fontSize: 12 }}>
                  Answer: <span style={{ color: '#f4f4f5', fontWeight: 600, letterSpacing: 1 }}>{result.plaintext}</span>
                </p>
              )}
            </div>
          )}

          {/* Input + submit */}
          {!alreadySolved && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {guest && (
                <input
                  type="text"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder='Your Torn name [ID] e.g. Shadow [1234567]'
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    color: '#f4f4f5',
                    fontSize: 13,
                    padding: '10px 14px',
                    outline: 'none',
                    fontFamily: 'inherit',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="text"
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="Enter your answer..."
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    color: '#f4f4f5',
                    fontSize: 13,
                    padding: '10px 14px',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={handleSubmit}
                  disabled={!answer.trim() || submitting || (guest && !guestName.trim())}
                  style={{
                    background: answer.trim() && !submitting && (!guest || guestName.trim())
                      ? 'linear-gradient(135deg, #b3123f, #6d28d9)'
                      : 'rgba(255,255,255,0.06)',
                    border: 'none',
                    borderRadius: 10,
                    color: answer.trim() && !submitting && (!guest || guestName.trim()) ? '#fff' : '#4b5563',
                    fontSize: 13,
                    fontWeight: 600,
                    padding: '10px 20px',
                    cursor: answer.trim() && !submitting && (!guest || guestName.trim()) ? 'pointer' : 'not-allowed',
                    whiteSpace: 'nowrap',
                    transition: 'background 0.2s',
                  }}
                >
                  {submitting ? 'Checking...' : 'Submit Answer'}
                </button>
              </div>
              {guest && (
                <p style={{ margin: 0, fontSize: 11, color: '#4b5563' }}>
                  Include your Torn ID so leadership can identify your submission.
                </p>
              )}
            </div>
          )}

          {alreadySolved && (
            <p style={{ margin: 0, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
              Come back tomorrow for a new cipher.
            </p>
          )}
        </>
      )}
    </div>
  )
}
