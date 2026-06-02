import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from '../../hooks/useSession'
import { getSessionToken } from '../../lib/auth'
import { API_BASE_URL } from '../../config/api'

const DiscordSVG = () => (
  <svg width="26" height="20" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M60.105 4.898A58.55 58.55 0 0 0 45.653.415a.22.22 0 0 0-.233.11 40.784 40.784 0 0 0-1.8 3.697c-5.456-.817-10.886-.817-16.23 0a37.35 37.35 0 0 0-1.827-3.697.229.229 0 0 0-.233-.11 58.413 58.413 0 0 0-14.451 4.483.207.207 0 0 0-.095.082C1.578 18.73-.944 32.144.293 45.39a.244.244 0 0 0 .093.167c6.073 4.46 11.955 7.167 17.729 8.962a.23.23 0 0 0 .249-.082 42.08 42.08 0 0 0 3.627-5.9.225.225 0 0 0-.123-.312 38.772 38.772 0 0 1-5.539-2.64.228.228 0 0 1-.022-.378c.372-.279.744-.569 1.1-.862a.22.22 0 0 1 .23-.031c11.619 5.304 24.198 5.304 35.68 0a.219.219 0 0 1 .233.028c.356.293.728.586 1.103.865a.228.228 0 0 1-.02.378 36.384 36.384 0 0 1-5.54 2.637.227.227 0 0 0-.121.315 47.249 47.249 0 0 0 3.624 5.897.225.225 0 0 0 .249.084c5.801-1.794 11.684-4.502 17.757-8.961a.228.228 0 0 0 .092-.164c1.48-15.315-2.48-28.618-10.497-40.412a.18.18 0 0 0-.093-.084Zm-36.38 32.427c-3.497 0-6.38-3.211-6.38-7.156 0-3.944 2.827-7.156 6.38-7.156 3.583 0 6.437 3.24 6.38 7.156 0 3.945-2.827 7.156-6.38 7.156Zm23.593 0c-3.498 0-6.38-3.211-6.38-7.156 0-3.944 2.826-7.156 6.38-7.156 3.582 0 6.437 3.24 6.38 7.156 0 3.945-2.826 7.156-6.38 7.156Z" fill="currentColor"/>
  </svg>
)

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
)

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

function formatTime(iso) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function getAvatarUrl(author) {
  if (author.avatar) {
    return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png?size=32`
  }
  return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(author.id) % 5n)}.png`
}

function MessageItem({ msg, isGrouped }) {
  const displayName = msg.author.username
  const displayContent = msg.content

  return (
    <div style={{
      display: 'flex',
      gap: '10px',
      padding: isGrouped ? '2px 12px 2px 52px' : '8px 12px 2px',
      alignItems: 'flex-start',
    }}>
      {!isGrouped && (
        <img
          src={getAvatarUrl(msg.author)}
          alt=""
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            flexShrink: 0,
            background: '#2b2d31',
          }}
        />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        {!isGrouped && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: '#e0e0e0' }}>
              {displayName}
            </span>
            <span style={{ fontSize: 10, color: '#6b7280' }}>{formatTime(msg.timestamp)}</span>
          </div>
        )}
        <p style={{
          margin: 0,
          fontSize: 13,
          color: '#d1d5db',
          lineHeight: 1.4,
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
        }}>
          {displayContent}
        </p>
      </div>
    </div>
  )
}

export default function DiscordWidget() {
  const { user } = useSession()
  const [open, setOpen] = useState(false)
  const [discordStatus, setDiscordStatus] = useState(null)
  const [channels, setChannels] = useState([])
  const [categories, setCategories] = useState({})
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState(false)
  const [linking, setLinking] = useState(false)
  const [notification, setNotification] = useState(null)
  const messagesEndRef = useRef(null)
  const pollRef = useRef(null)
  const latestIdRef = useRef(null)
  const inputRef = useRef(null)

  // Detect ?discord=linked/error on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('discord') === 'linked') {
      setOpen(true)
      setNotification({ type: 'success', text: 'Discord linked successfully!' })
      setTimeout(() => setNotification(null), 4000)
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('discord') === 'error') {
      setNotification({ type: 'error', text: 'Discord link failed. Please try again.' })
      setTimeout(() => setNotification(null), 4000)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Fetch discord status when user changes
  useEffect(() => {
    if (!user?.isFactionMember) { setDiscordStatus(null); return }
    fetchDiscordStatus()
  }, [user])

  // Load channels when widget opens and user is linked
  useEffect(() => {
    if (open && discordStatus?.linked && channels.length === 0) {
      fetchChannels()
    }
  }, [open, discordStatus?.linked])

  // Poll messages while open + channel selected
  useEffect(() => {
    clearInterval(pollRef.current)
    if (open && selectedChannel) {
      pollRef.current = setInterval(() => pollNewMessages(selectedChannel), 5000)
    }
    return () => clearInterval(pollRef.current)
  }, [open, selectedChannel])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const authHeader = () => ({ Authorization: getSessionToken() })

  async function fetchDiscordStatus() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/discord/status`, { headers: authHeader() })
      const data = await res.json()
      setDiscordStatus(data)
    } catch {
      setDiscordStatus({ linked: false })
    }
  }

  async function fetchChannels() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/discord/channels`, { headers: authHeader() })
      const data = await res.json()
      setChannels(data.channels || [])
      setCategories(data.categories || {})
      if (data.channels?.length && !selectedChannel) {
        const first = data.channels[0]
        setSelectedChannel(first.id)
        loadMessages(first.id)
      }
    } catch {}
  }

  async function loadMessages(channelId) {
    setLoadingMsg(true)
    setMessages([])
    latestIdRef.current = null
    try {
      const res = await fetch(`${API_BASE_URL}/api/discord/messages?channelId=${channelId}`, {
        headers: authHeader(),
      })
      const data = await res.json()
      const msgs = Array.isArray(data.messages) ? [...data.messages].reverse() : []
      setMessages(msgs)
      if (msgs.length) latestIdRef.current = msgs[msgs.length - 1].id
    } catch {} finally {
      setLoadingMsg(false)
    }
  }

  async function pollNewMessages(channelId) {
    if (!latestIdRef.current) return
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/discord/messages?channelId=${channelId}&after=${latestIdRef.current}`,
        { headers: authHeader() }
      )
      const data = await res.json()
      // Discord returns ascending when using after=
      const newMsgs = Array.isArray(data.messages) ? data.messages : []
      if (!newMsgs.length) return
      setMessages(prev => [...prev, ...newMsgs])
      latestIdRef.current = newMsgs[newMsgs.length - 1].id
    } catch {}
  }

  async function handleChannelChange(channelId) {
    setSelectedChannel(channelId)
    clearInterval(pollRef.current)
    await loadMessages(channelId)
    pollRef.current = setInterval(() => pollNewMessages(channelId), 5000)
  }

  async function linkDiscord() {
    setLinking(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/discord/auth`, { headers: authHeader() })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {
      setLinking(false)
    }
  }

  async function unlinkDiscord() {
    try {
      await fetch(`${API_BASE_URL}/api/discord/unlink`, {
        method: 'DELETE',
        headers: authHeader(),
      })
      setDiscordStatus({ linked: false })
      setMessages([])
      setChannels([])
      setSelectedChannel(null)
    } catch {}
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || !selectedChannel || sending) return
    setSending(true)
    setInput('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/discord/messages`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: selectedChannel, content: text }),
      })
      const data = await res.json()
      if (data.success && data.message) {
        setMessages(prev => [...prev, data.message])
        latestIdRef.current = data.message.id
      }
    } catch {} finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const selectedChannelName = channels.find(c => c.id === selectedChannel)?.name

  // Group consecutive messages from same author
  function groupMessages(msgs) {
    return msgs.map((msg, i) => {
      const prev = msgs[i - 1]
      const sameAuthor = prev && prev.author.id === msg.author.id
      const closeInTime = prev && new Date(msg.timestamp) - new Date(prev.timestamp) < 300000
      return { msg, isGrouped: sameAuthor && closeInTime }
    })
  }

  if (!user?.isFactionMember) return null

  return (
    <>
      {/* Toast notification */}
      {notification && (
        <div style={{
          position: 'fixed',
          bottom: 100,
          right: 24,
          zIndex: 10001,
          background: notification.type === 'success' ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)',
          color: '#fff',
          padding: '10px 18px',
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 500,
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {notification.text}
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: 90,
          right: 24,
          width: 360,
          height: 520,
          zIndex: 10000,
          borderRadius: 16,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: '#111114',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          animation: 'discordSlideUp 0.2s ease',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            background: 'linear-gradient(135deg, rgba(179,18,63,0.15), rgba(109,40,217,0.15))',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ color: '#7289da' }}><DiscordSVG /></div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5', lineHeight: 1 }}>
                  Discord Chat
                </div>
                {discordStatus?.linked && selectedChannelName && (
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    #{selectedChannelName}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {discordStatus?.linked && (
                <button
                  onClick={unlinkDiscord}
                  title="Unlink Discord"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6b7280',
                    fontSize: 10,
                    cursor: 'pointer',
                    padding: '4px 6px',
                    borderRadius: 6,
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                  onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
                >
                  Unlink
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: 6,
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#f4f4f5'}
                onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          {/* Channel selector */}
          {discordStatus?.linked && channels.length > 0 && (
            <div style={{
              padding: '8px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}>
              <select
                value={selectedChannel || ''}
                onChange={e => handleChannelChange(e.target.value)}
                style={{
                  width: '100%',
                  background: '#1e1e24',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: '#f4f4f5',
                  fontSize: 12,
                  padding: '6px 10px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {channels.map(ch => {
                  const catName = ch.categoryId ? categories[ch.categoryId] : null
                  return (
                    <option key={ch.id} value={ch.id}>
                      {catName ? `${catName} / ` : ''}#{ch.name}
                    </option>
                  )
                })}
              </select>
            </div>
          )}

          {/* Body */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Not logged in */}
            {!user && (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: 24,
                color: '#6b7280',
                textAlign: 'center',
              }}>
                <div style={{ color: '#7289da', opacity: 0.5 }}><DiscordSVG /></div>
                <p style={{ margin: 0, fontSize: 13 }}>Log in to occultusHub to use the Discord chat widget.</p>
              </div>
            )}

            {/* Logged in, loading status */}
            {user && !discordStatus && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>Loading...</span>
              </div>
            )}

            {/* Logged in, not linked */}
            {user && discordStatus && !discordStatus.linked && (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                padding: 28,
                textAlign: 'center',
              }}>
                <div style={{ color: '#7289da' }}><DiscordSVG /></div>
                <div>
                  <p style={{ margin: '0 0 6px', fontSize: 14, color: '#f4f4f5', fontWeight: 600 }}>
                    Link your Discord
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
                    Connect your Discord account to chat directly from the site.
                  </p>
                </div>
                <button
                  onClick={linkDiscord}
                  disabled={linking}
                  style={{
                    background: '#5865F2',
                    border: 'none',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    padding: '10px 24px',
                    cursor: linking ? 'not-allowed' : 'pointer',
                    opacity: linking ? 0.7 : 1,
                    transition: 'opacity 0.2s, transform 0.1s',
                  }}
                  onMouseEnter={e => { if (!linking) e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
                >
                  {linking ? 'Redirecting...' : 'Link Discord Account'}
                </button>
              </div>
            )}

            {/* Linked — messages */}
            {user && discordStatus?.linked && (
              <>
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '8px 0',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(255,255,255,0.1) transparent',
                }}>
                  {loadingMsg && (
                    <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 12, padding: 16 }}>
                      Loading messages...
                    </div>
                  )}
                  {!loadingMsg && messages.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 12, padding: 24 }}>
                      No messages yet. Say something!
                    </div>
                  )}
                  {groupMessages(messages).map(({ msg, isGrouped }) => (
                    <MessageItem key={msg.id} msg={msg} isGrouped={isGrouped} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div style={{
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  padding: '10px 12px',
                  flexShrink: 0,
                  background: '#0e0e12',
                }}>
                  {discordStatus?.discordUsername && (
                    <div style={{ fontSize: 10, color: '#4b5563', marginBottom: 6 }}>
                      Chatting as <span style={{ color: '#7c3aed' }}>{discordStatus.discordUsername}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`Message #${selectedChannelName || '...'}`}
                      rows={1}
                      maxLength={1800}
                      style={{
                        flex: 1,
                        background: '#1e1e24',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 10,
                        color: '#f4f4f5',
                        fontSize: 13,
                        padding: '8px 12px',
                        resize: 'none',
                        outline: 'none',
                        fontFamily: 'inherit',
                        lineHeight: 1.4,
                        maxHeight: 80,
                        overflowY: 'auto',
                        scrollbarWidth: 'thin',
                      }}
                    />
                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || sending}
                      style={{
                        background: input.trim() && !sending
                          ? 'linear-gradient(135deg, #b3123f, #6d28d9)'
                          : 'rgba(255,255,255,0.06)',
                        border: 'none',
                        borderRadius: 10,
                        color: input.trim() && !sending ? '#fff' : '#4b5563',
                        padding: '8px 10px',
                        cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.2s',
                        flexShrink: 0,
                      }}
                    >
                      <SendIcon />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Open Discord chat"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: open
            ? 'linear-gradient(135deg, #b3123f, #6d28d9)'
            : '#5865F2',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          boxShadow: open
            ? '0 0 0 3px rgba(109,40,217,0.4), 0 8px 24px rgba(0,0,0,0.5)'
            : '0 4px 20px rgba(88,101,242,0.5)',
          zIndex: 10000,
          transition: 'background 0.25s, box-shadow 0.25s, transform 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        {open ? <CloseIcon /> : <DiscordSVG />}
      </button>

      <style>{`
        @keyframes discordSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  )
}
