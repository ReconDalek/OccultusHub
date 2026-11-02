import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { API_BASE_URL } from '../config/api'

const PURPLE = '#a855f7'
const RED = '#b3123f'

export const WRAPPED_STORAGE_KEY = (tornUserId) => `occHalloweenWrapped2026Seen_${tornUserId}`

function fmt(n) {
  if (n == null || Number.isNaN(n)) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
  if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (abs >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  return Math.round(n).toLocaleString()
}
const fmtHours = (seconds) => `${Math.round((seconds || 0) / 3600).toLocaleString()}h`
const fmtDate = (d) => d ? new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''

function Stat({ icon, label, value }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 10px', minWidth: 110 }}>
      <div style={{ fontSize: 26 }}>{icon}</div>
      <div className="font-cinzel" style={{ fontSize: 26, fontWeight: 700, color: '#f4f4f5', margin: '4px 0 0' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function StatGrid({ stats }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
      {stats.map((s, i) => <Stat key={i} {...s} />)}
    </div>
  )
}

function Superlative({ icon, label, username, value }) {
  if (!username) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#f4f4f5' }}>{username}</div>
      </div>
      <div style={{ fontSize: 13, color: PURPLE, fontWeight: 600 }}>{fmt(value)}</div>
    </div>
  )
}

function Slide({ title, subtitle, icon, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '10px 4px', textAlign: 'center' }}>
      {icon && <div style={{ fontSize: 44 }}>{icon}</div>}
      <div>
        <h2 className="font-cinzel" style={{ margin: 0, fontSize: 'clamp(20px,4vw,28px)', color: '#f4f4f5', letterSpacing: '1px' }}>{title}</h2>
        {subtitle && <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--text-secondary)', maxWidth: 440 }}>{subtitle}</p>}
      </div>
      <div style={{ width: '100%' }}>{children}</div>
    </div>
  )
}

function EmptyNote({ children }) {
  return <p style={{ color: 'var(--text-faint)', fontSize: 13, fontStyle: 'italic' }}>{children}</p>
}

function buildSlides(data) {
  const { me, myFaction, factions, global } = data
  const slides = []

  slides.push(
    <Slide key="intro" icon="🎃" title={`${me.username}'s Halloween`}
      subtitle={`${fmtDate(data.window.start)} – ${fmtDate(data.window.end)} · ${me.factionLabel || 'Occultus Family'}`}>
      {me.joinedDuringWindow
        ? <EmptyNote>Your trick-or-treat season began {fmtDate(me.effectiveStart)}, the day you joined.</EmptyNote>
        : <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>The veil thinned, the chains rattled, and you were there for all of it. Let's see what you got up to.</p>}
    </Slide>
  )

  const combat = [
    { icon: '💥', label: 'Attacks Won', value: fmt(me.personal.atk_won) },
    { icon: '☠️', label: 'Attacks Lost', value: fmt(me.personal.atk_lost) },
    { icon: '🏥', label: 'Hospital Trips', value: fmt(me.personal.hosp) },
    { icon: '🔪', label: 'Crimes Committed', value: fmt(me.personal.crimes) },
  ]
  slides.push(
    <Slide key="combat" icon="⚔️" title="Blood & Chaos" subtitle="Your personal war record this week.">
      <StatGrid stats={combat} />
    </Slide>
  )

  const hasChainWar = me.chain.hits > 0 || me.war.hits > 0
  slides.push(
    <Slide key="chainwar" icon="🔗" title="Chains & Wars">
      {hasChainWar ? (
        <StatGrid stats={[
          { icon: '🔗', label: 'Chain Hits', value: fmt(me.chain.hits) },
          { icon: '✨', label: 'Chain Respect', value: fmt(me.chain.respect) },
          { icon: '🗡️', label: 'War Hits', value: fmt(me.war.hits) },
          { icon: '🏆', label: 'War Respect', value: fmt(me.war.respect) },
        ]} />
      ) : <EmptyNote>A quiet week on the battlefield — no chain or war hits recorded.</EmptyNote>}
    </Slide>
  )

  const hasEconomy = me.oc.joined > 0 || me.armory.deposits > 0 || me.bountiesPlaced > 0
  slides.push(
    <Slide key="economy" icon="🔮" title="The Occult Economy">
      {hasEconomy ? (
        <StatGrid stats={[
          { icon: '🔮', label: 'OCs Joined', value: fmt(me.oc.joined) },
          { icon: '✅', label: 'OCs Successful', value: fmt(me.oc.successful) },
          { icon: '📦', label: 'Armory Deposits', value: fmt(me.armory.deposits) },
          { icon: '🎯', label: 'Bounties Placed', value: fmt(me.bountiesPlaced) },
        ]} />
      ) : <EmptyNote>No organized crime, armory, or bounty activity this week.</EmptyNote>}
    </Slide>
  )

  const hasWatch = me.chainWatch.hours > 0 || me.raffle.tickets > 0
  slides.push(
    <Slide key="watch" icon="👁️" title="Watch & Luck">
      {hasWatch ? (
        <StatGrid stats={[
          { icon: '👁️', label: 'Hours Watched', value: fmtHours(me.chainWatch.hours * 3600) },
          { icon: '🎟️', label: 'Raffle Tickets', value: fmt(me.raffle.tickets) },
          { icon: '🏅', label: 'Raffle Wins', value: fmt(me.raffle.wins) },
        ]} />
      ) : <EmptyNote>No Chain Watch shifts or raffle tickets this week.</EmptyNote>}
    </Slide>
  )

  slides.push(
    <Slide key="social" icon="🕯️" title="Spirit & Community">
      <StatGrid stats={[
        { icon: '✉️', label: 'Mails Sent', value: fmt(me.personal.mails_total) },
        { icon: '🧭', label: 'Trips Taken', value: fmt(me.personal.travel) },
        { icon: '💊', label: 'Xanax Taken', value: fmt(me.personal.drug_xanax) },
        { icon: '🧪', label: 'Items Used', value: fmt(me.personal.items_used) },
      ]} />
    </Slide>
  )

  const rankEntries = Object.values(me.ranks || {})
  slides.push(
    <Slide key="ranks" icon="📈" title="Where You Rank" subtitle={me.factionLabel ? `Compared to the rest of ${me.factionLabel} and the whole Occultus family.` : undefined}>
      {rankEntries.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420, margin: '0 auto' }}>
          {rankEntries.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: 18 }}>{r.icon}</span>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 13, color: '#f4f4f5', fontWeight: 600 }}>{r.label}: {fmt(r.value)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                  {r.faction && `#${r.faction.rank} of ${r.faction.total} in faction (top ${r.faction.percentile}%)`}
                  {r.faction && r.global && ' · '}
                  {r.global && `#${r.global.rank} of ${r.global.total} family-wide`}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : <EmptyNote>Not enough activity yet to rank — next season, legend.</EmptyNote>}
    </Slide>
  )

  if (myFaction) {
    slides.push(
      <Slide key="faction" icon="🩸" title={`${myFaction.label} Spotlight`} subtitle={`${myFaction.newMembers} new member${myFaction.newMembers === 1 ? '' : 's'} joined this week.`}>
        <StatGrid stats={[
          { icon: '🔗', label: 'Chain Hits', value: fmt(myFaction.totals.chainHits) },
          { icon: '🗡️', label: 'War Hits', value: fmt(myFaction.totals.warHits) },
          { icon: '🔮', label: 'OCs Won', value: fmt(myFaction.totals.ocSuccess) },
          { icon: '💊', label: 'Xanax Taken', value: fmt(myFaction.totals.xanaxTaken) },
        ]} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420, margin: '18px auto 0' }}>
          {Object.values(myFaction.superlatives).filter(Boolean).map((s, i) => <Superlative key={i} {...s} />)}
        </div>
      </Slide>
    )
  }

  slides.push(
    <Slide key="global" icon="🌑" title="Across the Occultus Family" subtitle="Every faction, combined.">
      <StatGrid stats={[
        { icon: '🔗', label: 'Chain Hits', value: fmt(global.totals.chainHits) },
        { icon: '🗡️', label: 'War Hits', value: fmt(global.totals.warHits) },
        { icon: '🔮', label: 'OCs Won', value: fmt(global.totals.ocSuccess) },
        { icon: '📜', label: 'Forum Posts', value: fmt(global.totals.forumPosts) },
      ]} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 420, margin: '16px auto 0' }}>
        {[...factions].sort((a, b) => (b.totals.chainHits + b.totals.warHits) - (a.totals.chainHits + a.totals.warHits)).map(f => (
          <div key={f.factionId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 2px' }}>
            <span style={{ color: '#f4f4f5' }}>{f.label}</span>
            <span style={{ color: 'var(--text-faint)' }}>{fmt(f.totals.chainHits + f.totals.warHits)} combined hits</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420, margin: '16px auto 0' }}>
        {Object.values(global.superlatives).filter(Boolean).map((s, i) => <Superlative key={i} {...s} />)}
      </div>
    </Slide>
  )

  slides.push(
    <Slide key="outro" icon="🕯️" title="That's a Wrap" subtitle="The veil thickens again until next year. See you in the shadows.">
      <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>— Occultus Hub</div>
    </Slide>
  )

  return slides
}

export default function HalloweenWrapped() {
  const { user } = useSession()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const token = localStorage.getItem('occultusSession')
    fetch(`${API_BASE_URL}/api/halloween-wrapped`, { headers: { Authorization: token } })
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d) })
      .catch(e => setError(e.message))
  }, [])

  useEffect(() => {
    if (data && user?.tornUserId) {
      try { localStorage.setItem(WRAPPED_STORAGE_KEY(user.tornUserId), '1') } catch { /* ignore */ }
    }
  }, [data, user])

  const slides = useMemo(() => (data ? buildSlides(data) : []), [data])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, slides.length - 1))
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slides.length])

  if (error) {
    return (
      <div style={{ color: '#f4f4f5', padding: '60px 20px', textAlign: 'center' }}>
        <p style={{ color: '#f87171' }}>{error}</p>
      </div>
    )
  }
  if (!data) {
    return (
      <div style={{ color: 'var(--text-secondary)', padding: '80px 20px', textAlign: 'center' }}>
        Conjuring your Halloween recap…
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '24px clamp(12px,4vw,20px)',
    }}>
      <div style={{
        width: '100%', maxWidth: 560, minHeight: 420, borderRadius: 20,
        background: 'linear-gradient(160deg, rgba(60,10,100,0.35), rgba(20,5,35,0.55))',
        border: '1px solid rgba(168,85,247,0.25)', boxShadow: '0 0 40px rgba(109,40,217,0.15)',
        padding: 'clamp(20px,4vw,36px)', display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        {slides[idx]}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
        {slides.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)} aria-label={`Slide ${i + 1}`} style={{
            width: 8, height: 8, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
            background: i === idx ? PURPLE : 'rgba(255,255,255,0.15)',
          }} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={() => setIdx(i => Math.max(i - 1, 0))} disabled={idx === 0} style={{
          padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border-subtle)',
          background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', cursor: idx === 0 ? 'default' : 'pointer',
          opacity: idx === 0 ? 0.4 : 1, fontSize: 13,
        }}>&larr; Back</button>
        {idx < slides.length - 1 ? (
          <button onClick={() => setIdx(i => Math.min(i + 1, slides.length - 1))} style={{
            padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: RED, color: '#fff',
          }}>Next &rarr;</button>
        ) : (
          <button onClick={() => navigate('/')} style={{
            padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: RED, color: '#fff',
          }}>Done</button>
        )}
      </div>
    </div>
  )
}
