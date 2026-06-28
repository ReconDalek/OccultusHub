export default function CardsRulebook({ onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      backdropFilter: 'blur(6px)',
    }} onClick={onClose}>
      <div
        style={{
          background: 'linear-gradient(160deg, #0f0812 0%, #0a0310 100%)',
          border: '1px solid rgba(179,18,63,0.35)',
          borderRadius: 14,
          maxWidth: 620,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: '32px 36px',
          boxShadow: '0 0 60px rgba(109,40,217,0.2)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: 22, color: '#f4f4f5', letterSpacing: '2px' }}>
              Cards Against Occultus
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>The Codex of Fate</div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: "var(--text-secondary)", fontSize: 22, cursor: 'pointer',
          }}>✕</button>
        </div>

        <Section title="Overview">
          A dark card game for 3–20 players. Each round, one player becomes the <em>Harbinger</em> —
          they read a <strong>Shadow Card</strong> (the prompt) and judge which response is most worthy.
          Everyone else picks a <strong>Fate Card</strong> from their hand. The Harbinger crowns a winner,
          who claims a <strong>Soul</strong>. First to the target number of souls wins.
        </Section>

        <Section title="The Cards">
          <Row label="Shadow Cards" color="#f4a0b0">
            Dark prompt cards with a fill-in-the-blank or question. Revealed each round.
            Some require <strong>two</strong> Fate Cards in response.
          </Row>
          <Row label="Fate Cards" color="#e8dccc">
            Answer cards held in your hand (7 cards). Pick one (or two) to submit each round.
            When you play a card, it's replaced at the start of the next round.
          </Row>
          <Row label="Blank Vessels" color="#a1a1aa">
            Some Fate Cards are blank — you type your own response before submitting.
          </Row>
        </Section>

        <Section title="Round Flow">
          <ol style={{ paddingLeft: 20, lineHeight: 2, color: '#d4d4d8', fontSize: 13 }}>
            <li>A Shadow Card is drawn. An Omen may be rolled (if enabled).</li>
            <li>All non-Harbinger players secretly choose Fate Card(s) from their hand.</li>
            <li>Once everyone has submitted, cards are revealed to the Harbinger (anonymously).</li>
            <li>The Harbinger crowns a winner. That player earns one Soul.</li>
            <li>Hands are refilled, the Harbinger role rotates, and the next round begins.</li>
          </ol>
        </Section>

        <Section title="Omens (optional)">
          <Row label="🌑 Blood Moon" color="#ff6b6b">
            Everyone must submit <strong>two</strong> Fate Cards this round instead of one.
          </Row>
          <Row label="👁 The Veil" color="#a78bfa">
            Cards are shown face-down to the Harbinger. They must click to reveal each one before judging.
          </Row>
          <Row label="✦ The Awakening" color="#34d399">
            Each player (except the Harbinger) is dealt an extra card before picking this round.
          </Row>
        </Section>

        <Section title="The Pact">
          Once per game, any player may invoke <strong>The Pact</strong>. This costs that player one Soul
          (minimum 0) and forces the Shadow Card to be redrawn. All submissions are cleared.
          Use it when the current prompt is too dull — or to sabotage an opponent mid-round.
          The Pact button appears below the Shadow Card during the picking phase.
        </Section>

        <Section title="Winning">
          The first player to reach the target Soul count (set by the host, 3–10) wins.
          The game ends immediately when the threshold is crossed.
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontFamily: 'Cinzel, serif',
        fontSize: 13,
        color: '#b3123f',
        letterSpacing: '1.5px',
        marginBottom: 10,
        textTransform: 'uppercase',
      }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.7 }}>{children}</div>
    </div>
  )
}

function Row({ label, color, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <span style={{ color, fontWeight: 600 }}>{label}: </span>
      <span>{children}</span>
    </div>
  )
}
