import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../config/api'

function authHeaders() {
  const token = localStorage.getItem('occultusSession')
  return { Authorization: token, 'Content-Type': 'application/json' }
}

function fmtTimestamp(iso) {
  if (!iso) return ''
  return `${iso.replace('T', ' ').replace('Z', '').slice(0, 16)} TCT`
}

const inputStyle = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px', color: '#f4f4f5', padding: '7px 12px', fontSize: '13px',
}

export default function PatchNotesTab() {
  const [content, setContent] = useState('')
  const [draftUpdatedAt, setDraftUpdatedAt] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [feedback, setFeedback] = useState(null) // { type: 'ok'|'err', msg }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/patch-notes`, { headers: authHeaders() })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setContent(json.draft?.content || '')
      setDraftUpdatedAt(json.draft?.updated_at || null)
      setHistory(json.history || [])
      setDirty(false)
    } catch (e) {
      setFeedback({ type: 'err', msg: e.message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/patch-notes`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ content }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setDirty(false)
      setDraftUpdatedAt(new Date().toISOString())
      setFeedback({ type: 'ok', msg: 'Draft saved.' })
    } catch (e) {
      setFeedback({ type: 'err', msg: e.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleSend() {
    if (!content.trim()) return
    if (!window.confirm('Send this to the Discord channel now?')) return
    setSending(true)
    setFeedback(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/patch-notes/send`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ content }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setFeedback({ type: 'ok', msg: 'Sent to Discord.' })
      await load()
    } catch (e) {
      setFeedback({ type: 'err', msg: e.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontFamily: 'Cinzel, serif', color: '#f4f4f5', fontSize: '18px', letterSpacing: '1px', margin: '0 0 4px 0' }}>
          Patch Notes
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
          Claude adds a draft here after major updates. Edit as needed, then send — this always posts to one fixed channel.
        </p>
      </div>

      {loading && (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '14px' }}>Loading…</div>
      )}

      {!loading && (
        <>
          <textarea
            value={content}
            onChange={(e) => { setContent(e.target.value); setDirty(true) }}
            placeholder="No draft yet — this fills in after the next major update, or just start typing."
            rows={12}
            style={{
              ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.6, boxSizing: 'border-box',
            }}
          />

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={handleSend}
              disabled={sending || !content.trim()}
              style={{
                padding: '9px 20px', borderRadius: '8px', border: 'none', fontWeight: 600, fontSize: '13px',
                background: '#b3123f', color: '#fff',
                cursor: sending || !content.trim() ? 'default' : 'pointer',
                opacity: sending || !content.trim() ? 0.6 : 1,
              }}
            >
              {sending ? 'Sending…' : 'Send to channel'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              style={{
                padding: '9px 16px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: dirty ? '#f4f4f5' : 'var(--text-faint)', fontSize: '13px',
                cursor: saving || !dirty ? 'default' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            {draftUpdatedAt && !dirty && (
              <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>
                Saved {fmtTimestamp(draftUpdatedAt)}
              </span>
            )}
            {dirty && <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>Unsaved changes</span>}
          </div>

          {feedback && (
            <p style={{
              marginTop: '10px', fontSize: '13px',
              color: feedback.type === 'ok' ? '#34d399' : '#f87171',
            }}>
              {feedback.msg}
            </p>
          )}

          <div style={{ marginTop: '32px' }}>
            <h3 style={{ color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
              Previously sent
            </h3>
            {history.length === 0 && (
              <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>Nothing sent yet.</p>
            )}
            {history.map((h) => (
              <details key={h.id} style={{ marginBottom: '6px' }}>
                <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12.5px' }}>
                  {fmtTimestamp(h.sent_at)}
                </summary>
                <pre style={{
                  marginTop: '6px', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px',
                  fontSize: '12.5px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', fontFamily: 'inherit',
                }}>
                  {h.content}
                </pre>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
