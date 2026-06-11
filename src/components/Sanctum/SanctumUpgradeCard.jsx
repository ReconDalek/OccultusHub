import { UPGRADES, upgradeCost, formatEssence } from './sanctumData.js'

export default function SanctumUpgradeCard({ upgradeId, level, essence, totalEssence, onBuy, buying }) {
  const def = UPGRADES.find(u => u.id === upgradeId)
  if (!def) return null

  const cost = upgradeCost(upgradeId, level)
  const canAfford = essence >= cost
  const locked = totalEssence < def.unlockAt && level === 0

  if (locked) return null

  const typeLabel = def.type === 'generator'
    ? `+${def.production}/sec each`
    : def.type === 'click'
    ? `+${def.clickBonus} per click each`
    : `+${(def.globalMult * 100).toFixed(0)}% all production each`

  return (
    <div
      style={{
        background: canAfford
          ? 'linear-gradient(135deg, rgba(109,40,217,0.18), rgba(179,18,63,0.12))'
          : 'rgba(255,255,255,0.03)',
        border: canAfford
          ? '1px solid rgba(109,40,217,0.45)'
          : '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        transition: 'all 0.2s',
        opacity: canAfford ? 1 : 0.65,
      }}
    >
      {/* Icon + level badge */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 10,
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24,
        }}>
          {def.icon}
        </div>
        {level > 0 && (
          <span style={{
            position: 'absolute', top: -6, right: -6,
            background: 'linear-gradient(135deg, #6d28d9, #b3123f)',
            color: '#fff', fontSize: 10, fontWeight: 700,
            borderRadius: 8, padding: '1px 5px', minWidth: 18,
            textAlign: 'center',
          }}>
            {level}
          </span>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
          {def.name}
        </div>
        <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, lineHeight: 1.4 }}>
          {def.description}
        </div>
        <div style={{ color: '#7c3aed', fontSize: 11, fontStyle: 'italic' }}>
          {typeLabel}
        </div>
      </div>

      {/* Buy button */}
      <button
        onClick={() => onBuy(upgradeId)}
        disabled={!canAfford || buying}
        style={{
          flexShrink: 0,
          padding: '8px 14px',
          borderRadius: 8,
          border: 'none',
          cursor: canAfford && !buying ? 'pointer' : 'not-allowed',
          background: canAfford
            ? 'linear-gradient(135deg, #6d28d9, #b3123f)'
            : 'rgba(255,255,255,0.06)',
          color: canAfford ? '#fff' : '#64748b',
          fontSize: 12,
          fontWeight: 700,
          textAlign: 'center',
          minWidth: 72,
          transition: 'all 0.15s',
          boxShadow: canAfford ? '0 0 12px rgba(109,40,217,0.4)' : 'none',
        }}
      >
        <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 1 }}>Cost</div>
        {formatEssence(cost)}
      </button>
    </div>
  )
}
