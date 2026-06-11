import { formatEssence } from './sanctumData.js'

export default function SanctumStats({ essence, totalEssence, essencePerSec, clickPower, onInvoke, invoking }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Essence display */}
      <div style={{
        background: 'rgba(0,0,0,0.35)',
        border: '1px solid rgba(179,18,63,0.3)',
        borderRadius: 16,
        padding: '24px 20px',
        textAlign: 'center',
      }}>
        <div style={{ color: '#94a3b8', fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 6 }}>
          Dark Essence
        </div>
        <div style={{
          color: '#e2e8f0',
          fontSize: 40,
          fontWeight: 800,
          fontFamily: 'Cinzel, serif',
          letterSpacing: 2,
          lineHeight: 1.1,
          textShadow: '0 0 24px rgba(179,18,63,0.6)',
        }}>
          {formatEssence(essence)}
        </div>
        <div style={{ color: '#7c3aed', fontSize: 13, marginTop: 8 }}>
          {essencePerSec >= 0.01
            ? `${formatEssence(essencePerSec)}/sec`
            : 'No passive income yet'}
        </div>
      </div>

      {/* Invoke button */}
      <button
        onClick={onInvoke}
        disabled={invoking}
        style={{
          width: '100%',
          padding: '22px 0',
          borderRadius: 16,
          border: '1px solid rgba(179,18,63,0.5)',
          cursor: 'pointer',
          background: invoking
            ? 'rgba(179,18,63,0.12)'
            : 'linear-gradient(135deg, rgba(179,18,63,0.25), rgba(109,40,217,0.25))',
          color: '#e2e8f0',
          fontSize: 18,
          fontWeight: 800,
          fontFamily: 'Cinzel, serif',
          letterSpacing: 3,
          textTransform: 'uppercase',
          transition: 'all 0.15s',
          boxShadow: invoking ? 'none' : '0 0 28px rgba(179,18,63,0.3)',
          transform: invoking ? 'scale(0.98)' : 'scale(1)',
        }}
      >
        ✦ Invoke ✦
        <div style={{ fontSize: 11, fontFamily: 'inherit', opacity: 0.6, marginTop: 4, fontWeight: 400, letterSpacing: 1 }}>
          +{formatEssence(clickPower)} per click
        </div>
      </button>

      {/* Secondary stats */}
      <div style={{
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        <StatRow label="Per Second" value={essencePerSec >= 0.01 ? formatEssence(essencePerSec) : '—'} />
        <StatRow label="Per Click"  value={formatEssence(clickPower)} />
        <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
        <StatRow label="Lifetime Essence" value={formatEssence(totalEssence)} dim />
      </div>
    </div>
  )
}

function StatRow({ label, value, dim }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: '#64748b', fontSize: 12, letterSpacing: 1 }}>{label}</span>
      <span style={{ color: dim ? '#475569' : '#cbd5e1', fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  )
}
