import { useState, useCallback, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'
import ShadowCard from './ShadowCard'
import FateCard from './FateCard'
import CardHand from './CardHand'

const OMEN_INFO = {
  blood_moon:    { icon: '🌑', label: 'Blood Moon',    desc: 'Submit two Fate Cards this round', color: '#ff4455' },
  the_veil:      { icon: '👁',  label: 'The Veil',     desc: 'Cards are hidden — Harbinger judges blind', color: '#a78bfa' },
  the_awakening: { icon: '✦',  label: 'The Awakening', desc: 'An extra card was dealt to each player', color: '#34d399' },
}

export default function CardsPlay({
  room, players, round, submissions, myHand, mySubmission, myPlayerId,
  authHeaders, guestToken, code, onLeave,
}) {
  const [selectedIds, setSelectedIds] = useState([])
  const [customTexts, setCustomTexts] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [judging, setJudging] = useState(false)
  const [pacting, setPacting] = useState(false)
  const [chatMsg, setChatMsg] = useState('')
  const [sendingChat, setSendingChat] = useState(false)
  const [error, setError] = useState('')
  const [timeLeft, setTimeLeft] = useState(null)

  // Countdown timer — drives off whichever phase timer is active
  useEffect(() => {
    const endStr = round?.status === 'picking' ? round?.picking_ends_at
                 : round?.status === 'judging' ? round?.judging_ends_at
                 : null
    if (!endStr) { setTimeLeft(null); return }
    const tick = () => {
      const ms = new Date(endStr.replace(' ', 'T') + 'Z').getTime() - Date.now()
      setTimeLeft(Math.max(0, Math.floor(ms / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [round?.status, round?.picking_ends_at, round?.judging_ends_at])

  const me = players.find(p => p.id === myPlayerId)
  const isWaiting = me && !me.is_active

  const isHarbinger = round && me?.id === round.harbinger_player_id
  const harbinger = players.find(p => p.id === round?.harbinger_player_id)

  const shadowCard = round?.shadow_card
  const effectivePicks = (round?.omen === 'blood_moon')
    ? Math.max(shadowCard?.picks || 1, 2)
    : (shadowCard?.picks || 1)

  const alreadySubmitted = mySubmission && mySubmission.length >= effectivePicks

  // Submission status for non-harbinger players during picking
  const submittedCount = Array.isArray(submissions)
    ? submissions.filter(s => s.submitted).length
    : 0
  const totalNonHarb = players.filter(p => p.id !== round?.harbinger_player_id).length

  function toggleCard(card) {
    setSelectedIds(prev => {
      if (prev.includes(card.id)) return prev.filter(id => id !== card.id)
      if (prev.length >= effectivePicks) return prev
      return [...prev, card.id]
    })
  }

  const handleSubmit = useCallback(async () => {
    if (selectedIds.length !== effectivePicks) {
      setError(`Select ${effectivePicks} card${effectivePicks > 1 ? 's' : ''} to submit`)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const cards = selectedIds.map(id => {
        const card = myHand.find(c => c.id === id)
        return { card_id: id, custom_text: customTexts[id] || null }
      })
      const res = await fetch(`${API_BASE_URL}/api/cards/rooms/${code}/submit`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ cards, guest_token: guestToken }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Failed to submit')
      } else {
        setSelectedIds([])
      }
    } finally {
      setSubmitting(false)
    }
  }, [selectedIds, effectivePicks, myHand, customTexts, code, authHeaders, guestToken])

  const handleJudge = useCallback(async (winnerPlayerId) => {
    setJudging(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/cards/rooms/${code}/judge`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ winner_player_id: winnerPlayerId, guest_token: guestToken }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Failed to judge')
      }
    } finally {
      setJudging(false)
    }
  }, [code, authHeaders, guestToken])

  const handlePact = useCallback(async () => {
    if (!window.confirm('Invoke The Pact? This costs you 1 soul and redraws the Shadow Card. It can only be used once per game.')) return
    setPacting(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/cards/rooms/${code}/pact`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ guest_token: guestToken }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Failed')
      }
    } finally {
      setPacting(false)
    }
  }, [code, authHeaders, guestToken])

  const handleChat = useCallback(async (e) => {
    e.preventDefault()
    if (!chatMsg.trim()) return
    setSendingChat(true)
    try {
      await fetch(`${API_BASE_URL}/api/cards/rooms/${code}/message`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ message: chatMsg.trim(), guest_token: guestToken }),
      })
      setChatMsg('')
    } finally {
      setSendingChat(false)
    }
  }, [chatMsg, code, authHeaders, guestToken])

  const omenData = round?.omen ? OMEN_INFO[round.omen] : null

  // ── Waiting to join next round ───────────────────────────────────────────
  if (isWaiting) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '60vh' }}>
        {/* Players souls bar — still visible while waiting */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', padding: '8px 0 24px', width: '100%' }}>
          {players.map(p => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 24,
              border: p.is_harbinger ? '1px solid rgba(179,18,63,0.6)' : '1px solid rgba(255,255,255,0.08)',
              background: p.is_harbinger ? 'rgba(179,18,63,0.12)' : 'rgba(255,255,255,0.04)',
              fontSize: 12, color: p.id === myPlayerId ? '#f4f4f5' : '#a1a1aa',
            }}>
              {p.is_harbinger && <span style={{ color: '#ff6b6b', fontSize: 10 }}>◈</span>}
              <span>{p.display_name}</span>
              <span style={{ fontSize: 9, color: '#b3123f' }}>
                {Array.from({ length: p.souls }).map((_, i) => <span key={i}>●</span>)}
                {p.souls === 0 && <span style={{ color: 'rgba(255,255,255,0.2)' }}>○</span>}
              </span>
              <span style={{ fontSize: 10, color: '#a1a1aa' }}>{p.souls}/{room.souls_to_win}</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', padding: '40px 20px', flex: 1 }}>
          <div style={{ fontSize: 36, marginBottom: 20, opacity: 0.5 }}>⌛</div>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: 20, letterSpacing: '3px', marginBottom: 12 }}>
            Entering the Circle
          </div>
          <p style={{ color: '#a1a1aa', fontSize: 14, maxWidth: 320, margin: '0 auto 32px', lineHeight: 1.7 }}>
            A ritual is in progress. You will join at the start of the next round.
          </p>
          <div style={{
            display: 'inline-block',
            padding: '8px 20px',
            borderRadius: 8,
            border: '1px solid rgba(109,40,217,0.3)',
            background: 'rgba(109,40,217,0.08)',
            fontSize: 12,
            color: '#a78bfa',
            letterSpacing: '1px',
            marginBottom: 32,
          }}>
            {round?.status === 'picking' ? 'Players are choosing their fates…'
              : round?.status === 'judging' ? 'The Harbinger is judging…'
              : round?.status === 'complete' ? 'Round ending — almost your turn…'
              : 'Waiting for the round to begin…'}
          </div>
        </div>
        <div style={{ padding: '20px 0' }}>
          <button
            onClick={onLeave}
            style={{
              padding: '7px 18px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent', color: '#a1a1aa',
              fontSize: 12, cursor: 'pointer',
            }}
          >
            Leave
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minHeight: '100%' }}>
      {/* Players souls bar */}
      <div style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        justifyContent: 'center',
        padding: '8px 0 16px',
      }}>
        {players.map(p => (
          <div key={p.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 24,
            border: p.is_harbinger
              ? '1px solid rgba(179,18,63,0.6)'
              : p.id === myPlayerId
              ? '1px solid rgba(244,244,245,0.2)'
              : '1px solid rgba(255,255,255,0.08)',
            background: p.is_harbinger ? 'rgba(179,18,63,0.12)' : 'rgba(255,255,255,0.04)',
            fontSize: 12,
            color: p.id === myPlayerId ? '#f4f4f5' : '#a1a1aa',
          }}>
            {p.is_harbinger && <span style={{ color: '#ff6b6b', fontSize: 10 }}>◈</span>}
            <span>{p.display_name}</span>
            <span style={{ display: 'flex', gap: 2 }}>
              {Array.from({ length: p.souls }).map((_, i) => (
                <span key={i} style={{ fontSize: 9, color: '#b3123f' }}>●</span>
              ))}
              {p.souls === 0 && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>○</span>}
            </span>
            <span style={{ fontSize: 10, color: '#a1a1aa' }}>{p.souls}/{room.souls_to_win}</span>
          </div>
        ))}
      </div>

      {/* Omen banner */}
      {omenData && (
        <div style={{
          textAlign: 'center',
          padding: '8px 20px',
          marginBottom: 16,
          background: `rgba(${omenData.color === '#ff4455' ? '179,18,63' : omenData.color === '#a78bfa' ? '109,40,217' : '52,211,153'},0.12)`,
          border: `1px solid ${omenData.color}40`,
          borderRadius: 8,
          display: 'inline-block',
          margin: '0 auto 16px',
        }}>
          <span style={{ fontSize: 14, color: omenData.color }}>
            {omenData.icon} <strong>{omenData.label}</strong> — {omenData.desc}
          </span>
        </div>
      )}

      {/* Main play area */}
      <div style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap', padding: '0 8px' }}>
        {/* Shadow card */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <ShadowCard
            card={shadowCard}
            omen={round?.omen}
            picks={effectivePicks}
            roundNumber={round?.round_number}
            large
          />
          {/* Pact button */}
          {round?.status === 'picking' && !room.pact_used && (
            <button
              onClick={handlePact}
              disabled={pacting}
              title="Redraw the Shadow Card (costs 1 soul, once per game)"
              style={{
                padding: '6px 16px',
                borderRadius: 8,
                border: '1px solid rgba(179,18,63,0.3)',
                background: 'transparent',
                color: '#f4a0b0',
                fontSize: 11,
                cursor: 'pointer',
                letterSpacing: '0.5px',
              }}
            >
              {pacting ? '…' : '⚑ Invoke The Pact'}
            </button>
          )}
        </div>

        {/* Status / judging panel */}
        <div style={{ flex: 1, minWidth: 260, maxWidth: 520 }}>
          {/* Picking phase — progress */}
          {round?.status === 'picking' && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#a1a1aa', letterSpacing: '1px' }}>
                  {isHarbinger ? 'You are the Harbinger — await the fates.' : 'AWAITING SUBMISSIONS'}
                </div>
                {timeLeft !== null && (
                  <div style={{
                    fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                    color: timeLeft <= 15 ? '#fb7185' : timeLeft <= 30 ? '#fbbf24' : '#a1a1aa',
                    padding: '2px 8px', borderRadius: 6,
                    background: timeLeft <= 15 ? 'rgba(179,18,63,0.12)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${timeLeft <= 15 ? 'rgba(179,18,63,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  }}>
                    {String(Math.floor(timeLeft / 60)).padStart(2,'0')}:{String(timeLeft % 60).padStart(2,'0')}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Array.isArray(submissions) && submissions.map((s, i) => {
                  const p = players.find(pl => pl.id === s.player_id)
                  return (
                    <div key={i} style={{
                      padding: '4px 12px',
                      borderRadius: 20,
                      fontSize: 12,
                      border: `1px solid ${s.submitted ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      background: s.submitted ? 'rgba(179,18,63,0.1)' : 'transparent',
                      color: s.submitted ? '#f4a0b0' : '#a1a1aa',
                    }}>
                      {p?.display_name || '?'} {s.submitted ? '✓' : '…'}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Judging phase */}
          {round?.status === 'judging' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#a1a1aa', letterSpacing: '1px' }}>
                  {isHarbinger ? 'CHOOSE THE WINNER — TAP A CARD TO CROWN IT' : `Waiting for ${harbinger?.display_name} to judge…`}
                </div>
                {timeLeft !== null && (
                  <div style={{
                    fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                    color: timeLeft <= 10 ? '#fb7185' : timeLeft <= 20 ? '#fbbf24' : '#a78bfa',
                    padding: '2px 8px', borderRadius: 6,
                    background: timeLeft <= 10 ? 'rgba(179,18,63,0.12)' : 'rgba(109,40,217,0.1)',
                    border: `1px solid ${timeLeft <= 10 ? 'rgba(179,18,63,0.3)' : 'rgba(109,40,217,0.3)'}`,
                  }}>
                    {String(Math.floor(timeLeft / 60)).padStart(2,'0')}:{String(timeLeft % 60).padStart(2,'0')}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                {submissions.map((sub, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                    {/* Multi-card submission stacked */}
                    {(sub.cards || []).map((c, ci) => (
                      <FateCard
                        key={ci}
                        card={{ id: `${idx}-${ci}`, text: c.text, is_blank: false }}
                        faceDown={round.omen === 'the_veil'}
                        onSelect={isHarbinger ? () => handleJudge(sub.player_id) : null}
                        disabled={judging || !isHarbinger}
                        small
                      />
                    ))}
                    {isHarbinger && (
                      <button
                        onClick={() => handleJudge(sub.player_id)}
                        disabled={judging}
                        style={{
                          padding: '5px 14px',
                          borderRadius: 8,
                          border: '1px solid rgba(179,18,63,0.5)',
                          background: 'rgba(179,18,63,0.15)',
                          color: '#f4a0b0',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        Crown ✦
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Complete phase — show winner */}
          {round?.status === 'complete' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: 16, color: '#f4a0b0', marginBottom: 8 }}>
                ✦ Soul claimed
              </div>
              {submissions.map((sub, idx) => sub.is_winner && (
                <div key={idx}>
                  <div style={{ fontSize: 14, color: '#f4f4f5', marginBottom: 12 }}>{sub.display_name}</div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {(sub.cards || []).map((c, ci) => (
                      <FateCard key={ci} card={{ text: c.text, is_blank: false }} isWinner small />
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 16, fontSize: 12, color: '#a1a1aa' }}>
                Next round beginning…
              </div>
            </div>
          )}

          {error && (
            <div style={{ marginTop: 12, color: '#f87171', fontSize: 12 }}>{error}</div>
          )}
        </div>
      </div>

      {/* My hand — only during picking, only if not harbinger */}
      {round?.status === 'picking' && !isHarbinger && (
        <div style={{ marginTop: 24 }}>
          {alreadySubmitted ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#a1a1aa', fontSize: 13 }}>
              ✓ Fate submitted — awaiting judgment
            </div>
          ) : (
            <div>
              <div style={{ textAlign: 'center', fontSize: 12, color: '#a1a1aa', marginBottom: 12, letterSpacing: '1px' }}>
                YOUR HAND — PICK {effectivePicks > 1 ? `${effectivePicks} CARDS` : 'A CARD'}
              </div>
              <CardHand
                cards={myHand}
                selectedIds={selectedIds}
                onSelect={toggleCard}
                customTexts={customTexts}
                onCustomTextChange={(id, t) => setCustomTexts(prev => ({ ...prev, [id]: t }))}
                picks={effectivePicks}
              />
              {selectedIds.length === effectivePicks && (
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    style={{
                      padding: '12px 40px',
                      borderRadius: 10,
                      border: 'none',
                      background: 'linear-gradient(135deg, #b3123f, #6d28d9)',
                      color: '#f4f4f5',
                      fontFamily: 'Cinzel, serif',
                      fontSize: 14,
                      letterSpacing: '1px',
                      cursor: 'pointer',
                      boxShadow: '0 0 20px rgba(179,18,63,0.3)',
                    }}
                  >
                    {submitting ? 'Casting…' : 'Cast Your Fate'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Leave button */}
      <div style={{ textAlign: 'center', padding: '20px 0 0' }}>
        <button
          onClick={onLeave}
          style={{
            padding: '7px 18px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent',
            color: '#a1a1aa',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Leave Game
        </button>
      </div>
    </div>
  )
}
