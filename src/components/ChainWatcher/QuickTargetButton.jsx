import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiSend } from './chainWatcherUtils'
import Modal from './Modal'

const btnBase = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
  padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.05)', color: '#d4d4d8', cursor: 'pointer', whiteSpace: 'nowrap',
  textDecoration: 'none', fontFamily: 'inherit',
}

// Mirrors OccultusBot's findChainUser — a shared pool of arranged chain-
// saving accounts any member can check for availability when a chain's
// about to drop, rather than scrambling to find someone out of hospital.
export default function QuickTargetButton({ isLeader = false }) {
  const [state, setState] = useState('idle') // idle | loading | found | none | error
  const [target, setTarget] = useState(null)
  const [showManage, setShowManage] = useState(false)

  const check = useCallback(async () => {
    setState('loading')
    try {
      const json = await apiGet('/api/chain-watcher/quick-target')
      if (json.target) { setTarget(json.target); setState('found') } else { setState('none') }
    } catch {
      setState('error')
    }
  }, [])

  return (
    <span className="flex items-center" style={{ gap: 8, flexWrap: 'wrap' }}>
      {state === 'found' && target ? (
        <>
          <a
            href={`https://www.torn.com/loader.php?sid=attack&user2ID=${target.torn_user_id}`}
            target="_blank" rel="noopener noreferrer"
            style={{ ...btnBase, background: 'rgba(34,197,94,0.12)', color: '#86efac', border: '1px solid rgba(34,197,94,0.35)' }}
          >
            ⚔ Attack {target.username || target.torn_user_id}
          </a>
          <button onClick={check} title="Find another" style={{ ...btnBase, padding: '6px 9px' }}>↻</button>
        </>
      ) : (
        <button onClick={check} disabled={state === 'loading'} style={{ ...btnBase, opacity: state === 'loading' ? 0.6 : 1 }}>
          {state === 'loading' ? 'Checking…' : state === 'none' ? '🎯 Quick Target — nobody free right now' : '🎯 Quick Target'}
        </button>
      )}
      {state === 'error' && (
        <span style={{ fontSize: 11.5, color: '#f87171' }}>Couldn't check — try again.</span>
      )}
      {isLeader && (
        <button onClick={() => setShowManage(true)} title="Manage the Quick Target pool" style={{ ...btnBase, padding: '6px 9px', fontSize: 11 }}>
          ⚙
        </button>
      )}
      {showManage && <ManageQuickTargetsModal onClose={() => setShowManage(false)} />}
    </span>
  )
}

function ManageQuickTargetsModal({ onClose }) {
  const [targets, setTargets] = useState(null)
  const [error, setError] = useState(null)
  const [newId, setNewId] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const json = await apiGet('/api/chain-watcher/quick-target-pool')
      setTargets(json.targets || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function addTarget() {
    const tornUserId = parseInt(newId, 10)
    if (!tornUserId) return
    setBusy(true)
    try {
      await apiSend('/api/chain-watcher/quick-target-pool', 'POST', { torn_user_id: tornUserId })
      setNewId('')
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeTarget(tornUserId) {
    setBusy(true)
    try {
      await apiSend(`/api/chain-watcher/quick-target-pool?torn_user_id=${tornUserId}`, 'DELETE')
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h3 style={{ color: '#f4f4f5', fontFamily: 'Cinzel,serif', fontSize: 16, letterSpacing: 1, margin: '0 0 6px' }}>
        Quick Target Pool
      </h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 12.5, margin: '0 0 14px' }}>
        Arranged chain-saving accounts — not regular faction members. Shared across all three factions.
      </p>

      {error && <p style={{ color: '#f87171', fontSize: 12.5, margin: '0 0 10px' }}>{error}</p>}

      <div className="flex" style={{ gap: 8, marginBottom: 14 }}>
        <input
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
          placeholder="Torn user ID"
          inputMode="numeric"
          style={{
            flex: '1 1 auto', fontSize: 13, padding: '6px 10px', borderRadius: 6,
            background: 'rgba(255,255,255,0.04)', color: '#f4f4f5', border: '1px solid var(--border-subtle)',
          }}
        />
        <button
          onClick={addTarget}
          disabled={busy || !newId.trim()}
          style={{
            fontSize: 13, padding: '6px 14px', borderRadius: 7, background: '#8b5cf6', color: '#fff',
            border: 'none', cursor: 'pointer', fontWeight: 600, opacity: (busy || !newId.trim()) ? 0.6 : 1,
          }}
        >
          Add
        </button>
      </div>

      {targets == null ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Loading…</p>
      ) : targets.length === 0 ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>The pool is empty.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
          {targets.map((t) => (
            <div
              key={t.torn_user_id}
              className="flex items-center"
              style={{ gap: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}
            >
              <div style={{ flex: '1 1 auto', minWidth: 0, fontSize: 13, fontWeight: 600, color: '#f4f4f5' }}>
                {t.username || `User #${t.torn_user_id}`}
              </div>
              <button
                onClick={() => removeTarget(t.torn_user_id)}
                disabled={busy}
                style={{
                  fontSize: 11, padding: '5px 10px', borderRadius: 6, background: 'rgba(248,113,113,0.1)',
                  color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', cursor: 'pointer', flexShrink: 0,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex" style={{ gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
        <button
          onClick={onClose}
          style={{
            fontSize: 13, padding: '8px 16px', borderRadius: 7, background: 'rgba(255,255,255,0.05)',
            color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </Modal>
  )
}
