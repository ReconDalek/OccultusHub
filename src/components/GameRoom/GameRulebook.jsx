export default function GameRulebook({ onClose }) {
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 className="font-cinzel" style={{ fontSize: 20, letterSpacing: 4, color: '#f4f4f5' }}>
            CODEX OF THE RITE
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', maxHeight: 'calc(85vh - 100px)', paddingRight: 8 }}>
          <Section title="The Premise">
            <p>A circle of cultists gathers for the Rite. Among them, Cabal agents have infiltrated the Congregation. By day the circle debates and banishes suspects. By night, the Cabal strikes. The Congregation must identify and banish all Cabal agents before they are outnumbered.</p>
          </Section>

          <Section title="The Phases">
            <RuleItem icon="☀️" title="The Reckoning (Day)">
              All players discuss openly. At the end of deliberation, every living player votes to banish one suspect. The player with the most votes is banished and their role is revealed. If votes are tied, no one is banished.
            </RuleItem>
            <RuleItem icon="🌑" title="The Witching Hour (Night)">
              The Congregation sleeps. Special roles act in secret. Only the Cabal can communicate during night. All night actions resolve simultaneously at dawn.
            </RuleItem>
          </Section>

          <Section title="The Roles">
            <RoleRule icon="◌" color="#a1a1aa" name="Congregation">
              The faithful majority. No special ability. Discuss, vote, survive.
            </RoleRule>
            <RoleRule icon="◈" color="#b3123f" name="The Cabal">
              Servants of shadow. Each night, the Cabal collectively chooses one player to sacrifice. They share a private channel during the Witching Hour. They win when they equal or outnumber the Congregation.
            </RoleRule>
            <RoleRule icon="◉" color="#9f67ff" name="The Inquisitor">
              Granted mystic sight — but only on odd-numbered nights (Night 1, 3, 5...). Choose one player to investigate. The Oracle will reveal whether they are tainted (Cabal) or pure. Results appear in your private Vision Log. On even-numbered nights, your sight rests.
            </RoleRule>
            <RoleRule icon="◎" color="#22c55e" name="The Warden">
              Carries one bullet for the entire game. Choose each night how to use it — or wait. <strong style={{color:'#4ade80'}}>Guard Self</strong>: stand ready. If the Cabal targets you, your bullet fires back and one attacker falls. The bullet is only spent if you are actually attacked. <strong style={{color:'#fb923c'}}>Shoot</strong>: fire proactively. Your target always dies — but if they were innocent, the congregation bears the loss.
            </RoleRule>
            <RoleRule icon="✦" color="#f59e0b" name="The Apostate">
              A neutral soul who seeks only the void. No night ability. <strong style={{color:'#fbbf24'}}>Win condition</strong>: be banished by the Congregation during a day vote. Act suspicious enough to be voted out — but not so obviously that players suspect your true motive. If the Apostate is banished, the Rite ends immediately and the Apostate wins alone.
            </RoleRule>
            <RoleRule icon="◬" color="#e879f9" name="The Deceiver">
              A hidden servant of the Cabal. Shares the Cabal's private channel and wins with them. Each night, choose one player to corrupt their aura. If the Inquisitor investigates that player tonight, the result is inverted — Cabal appears Pure, and the innocent appear Tainted. The Deceiver is revealed as Tainted if investigated without corruption.
            </RoleRule>
            <RoleRule icon="✧" color="#38bdf8" name="The Acolyte">
              A devoted protector of the Congregation. Carries one blessing for the entire game. Each night, choose a player to anoint. If the Cabal would sacrifice them that night, the attack is deflected and they survive. The blessing is spent on use. The Acolyte is not required to act — they may hold their blessing.
            </RoleRule>
          </Section>

          <Section title="Win Conditions">
            <RuleItem icon="✦" title="Congregation Victory">
              All Cabal agents have been banished from the circle.
            </RuleItem>
            <RuleItem icon="◈" title="Cabal Victory">
              The Cabal equals or outnumbers the remaining Congregation members.
            </RuleItem>
            <RuleItem icon="✦" title="Apostate Victory">
              The Apostate is banished by the Congregation's day vote. The Rite ends immediately — neither faction wins.
            </RuleItem>
          </Section>

          <Section title="Player Scaling">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  {['Players', 'Cabal', 'Inq.', 'Warden', 'Apostate', 'Deceiver', 'Acolyte', 'Cong.'].map(h => (
                    <th key={h} style={{ padding: '5px 6px', textAlign: 'left', color: '#71717a', borderBottom: '1px solid rgba(255,255,255,0.08)', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  [4,  1, 0, 0, 0, 0, 0, 3],
                  [5,  1, 1, 0, 0, 0, 0, 3],
                  [6,  1, 1, 1, 0, 0, 0, 3],
                  [7,  2, 1, 1, 0, 0, 0, 3],
                  [8,  2, 1, 1, 1, 0, 0, 3],
                  [9,  2, 1, 1, 1, 1, 0, 3],
                  [10, 2, 1, 1, 1, 1, 1, 3],
                  [12, 3, 1, 1, 1, 1, 1, 4],
                ].map(row => (
                  <tr key={row[0]}>
                    {row.map((cell, i) => (
                      <td key={i} style={{ padding: '5px 6px', color: '#d4d4d8', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {i === 1 ? <span style={{ color: '#b3123f' }}>{cell}</span> :
                         i === 2 ? <span style={{ color: cell ? '#9f67ff' : '#52525b' }}>{cell || '—'}</span> :
                         i === 3 ? <span style={{ color: cell ? '#22c55e' : '#52525b' }}>{cell || '—'}</span> :
                         i === 4 ? <span style={{ color: cell ? '#f59e0b' : '#52525b' }}>{cell || '—'}</span> :
                         i === 5 ? <span style={{ color: cell ? '#e879f9' : '#52525b' }}>{cell || '—'}</span> :
                         i === 6 ? <span style={{ color: cell ? '#38bdf8' : '#52525b' }}>{cell || '—'}</span> : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="The Oracle">
            <p>The Oracle is the voice of the game itself. It narrates phase transitions, reveals the identity of banished players, announces kills at dawn, and declares the victor. The Oracle cannot be interacted with — only observed.</p>
          </Section>

          <Section title="General Rules">
            <ul style={{ paddingLeft: 18, display: 'grid', gap: 8 }}>
              <li>Dead players cannot speak, vote, or take actions.</li>
              <li>The Apostate is a neutral role. If banished by the Congregation, the Apostate wins and the Rite ends immediately. Neither the Congregation nor the Cabal achieves victory.</li>
              <li>The Deceiver is a Cabal-aligned role. They share the Cabal's private channel, know the Cabal's identities, and count toward the Cabal's numerical dominance.</li>
              <li>The Acolyte's blessing is spent whether or not the target was attacked that night. An unspent blessing carries to subsequent nights.</li>
              <li>If the Deceiver corrupts the same player the Inquisitor investigates, the result is flipped. The Inquisitor receives no indication that corruption occurred.</li>
              <li>The Cabal know each other's identities from the start.</li>
              <li>The Warden's bullet is only spent if they shoot proactively, or if they are guarding themselves when targeted.</li>
              <li>If no Cabal member submits a sacrifice action, no one is sacrificed that night.</li>
              <li>Roles are revealed when a player is banished, sacrificed, or shot.</li>
              <li>Each phase has a timer — 4 minutes for day, 2 minutes for night. Phases also advance automatically once all required actions are submitted. The host may advance manually at any time.</li>
              <li>If multiple Cabal members vote for different targets, the most-voted target is chosen. Ties are broken randomly.</li>
              <li>A minimum of 4 players is required to begin.</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 className="font-cinzel" style={{ fontSize: 13, letterSpacing: 3, color: '#9f67ff', marginBottom: 12, textTransform: 'uppercase' }}>{title}</h3>
      <div style={{ fontSize: 13, color: '#a1a1aa', lineHeight: 1.7 }}>{children}</div>
    </div>
  )
}

function RuleItem({ icon, title, children }) {
  return (
    <div style={{ marginBottom: 12, display: 'flex', gap: 10 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div>
        <strong style={{ color: '#f4f4f5', fontSize: 13 }}>{title}</strong>
        <p style={{ marginTop: 3 }}>{children}</p>
      </div>
    </div>
  )
}

function RoleRule({ icon, color, name, children }) {
  return (
    <div style={{ marginBottom: 14, padding: '10px 14px', background: `${color}0d`, border: `1px solid ${color}30`, borderRadius: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <span style={{ color, fontSize: 16 }}>{icon}</span>
        <strong style={{ color, fontSize: 13 }}>{name}</strong>
      </div>
      <p style={{ margin: 0, fontSize: 12 }}>{children}</p>
    </div>
  )
}

const overlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.85)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  zIndex: 9999,
  padding: '80px 20px 20px',
  overflowY: 'auto',
}

const modal = {
  background: '#0d0d14',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 14,
  padding: '28px 24px',
  width: '100%',
  maxWidth: 600,
  flexShrink: 0,
}
