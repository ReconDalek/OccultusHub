import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'
import { getSessionToken } from '../../lib/auth'

export default function CipherReviewTab() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const token = getSessionToken()

  useEffect(() => { fetchSubmissions(date) }, [date])

  async function fetchSubmissions(d) {
    setLoading(true)
    setData(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/leadership/cipher-submissions?date=${d}`, {
        headers: { Authorization: token },
      })
      const json = await res.json()
      setData(json)
    } catch {} finally {
      setLoading(false)
    }
  }

  const correct = data?.submissions?.filter(s => s.is_correct) || []
  const incorrect = data?.submissions?.filter(s => !s.is_correct) || []

  return (
    <div>
      <h2 className="font-cinzel mb-1" style={{ fontSize: 22, color: '#f4f4f5' }}>
        Cipher Review
      </h2>
      <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 24 }}>
        Review member cipher submissions by date.
      </p>

      {/* Date picker + cipher info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <input
          type="date"
          value={date}
          max={new Date().toISOString().slice(0, 10)}
          onChange={e => setDate(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            color: '#f4f4f5',
            fontSize: 13,
            padding: '8px 12px',
            outline: 'none',
          }}
        />
        {data && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{
              background: 'rgba(179,18,63,0.15)',
              border: '1px solid rgba(179,18,63,0.3)',
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: 12,
              color: '#f4f4f5',
            }}>
              {data.name}
            </span>
            <span style={{
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: 12,
              color: "var(--text-secondary)",
            }}>
              {data.difficulty}
            </span>
          </div>
        )}
      </div>

      {data?.plaintext && (
        <div style={{
          background: 'rgba(109,40,217,0.1)',
          border: '1px solid rgba(109,40,217,0.25)',
          borderRadius: 12,
          padding: '14px 18px',
          marginBottom: 24,
          fontSize: 13,
        }}>
          <span style={{ color: "var(--text-secondary)" }}>Answer: </span>
          <span style={{ color: '#f4f4f5', fontWeight: 600, letterSpacing: 1 }}>{data.plaintext}</span>
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading submissions...</p>
      ) : !data?.submissions?.length ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: '#4b5563',
          fontSize: 13,
          border: '1px dashed rgba(255,255,255,0.08)',
          borderRadius: 14,
        }}>
          No submissions for this date.
        </div>
      ) : (
        <div>
          {/* Summary */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Total', value: data.submissions.length, color: "var(--text-secondary)" },
              { label: 'Correct', value: correct.length, color: '#10b981' },
              { label: 'Incorrect', value: incorrect.length, color: '#ef4444' },
            ].map(stat => (
              <div key={stat.label} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 10,
                padding: '10px 20px',
                textAlign: 'center',
                minWidth: 80,
              }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Submissions table */}
          <div style={{
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 12,
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['Member', 'Answer', 'Result', 'Submitted'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: '#6b7280', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.submissions.map((s, i) => (
                  <tr
                    key={s.id}
                    style={{
                      borderBottom: i < data.submissions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    }}
                  >
                    <td style={{ padding: '10px 16px', color: '#f4f4f5', fontWeight: 500 }}>{s.username}</td>
                    <td style={{ padding: '10px 16px', color: '#d1d5db', fontFamily: 'monospace' }}>{s.submitted_answer}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        background: s.is_correct ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color: s.is_correct ? '#10b981' : '#ef4444',
                        borderRadius: 20,
                        padding: '3px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                      }}>
                        {s.is_correct ? '✓ Correct' : '✗ Wrong'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: 12 }}>
                      {new Date(s.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
