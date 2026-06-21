import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'
import WarTrackingTab from './WarTrackingTab'
import ActiveChainCard from '../ActiveChainCard'

// ─── Constants ────────────────────────────────────────────────────────────────

const FACTIONS = [
  { id: 33097, name: 'Occultus'  },
  { id: 9728,  name: 'Occul2us' },
  { id: 9171,  name: 'Occul3us' },
]

const REPORT_CACHE_TTL = 15 * 60 * 1000 // 15 minutes
const FACTION_NAMES = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' }
// Includes historical faction IDs we previously owned (e.g. 355)
const VALID_FACTION_IDS = [33097, 9728, 9171, 355]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUnixDate(unix) {
  return new Date(unix * 1000).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC',
  }) + ' TCT'
}

function formatDuration(startAt, endAt) {
  const secs = endAt - startAt
  const h    = Math.floor(secs / 3600)
  const m    = Math.floor((secs % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function fmt(n, dp = 0) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-GB', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })
}

function memberLabel(id, usernames) {
  return usernames?.[id] ? `${usernames[id]}` : `[${id}]`
}

function getCachedReport(chainId) {
  try {
    const raw = localStorage.getItem(`occultus_cr_${chainId}`)
    if (!raw) return null
    const cached = JSON.parse(raw)
    if (Date.now() - new Date(cached.cachedAt).getTime() < REPORT_CACHE_TTL) return cached.data
    return null
  } catch {
    return null
  }
}

function setCachedReport(chainId, data) {
  try {
    localStorage.setItem(`occultus_cr_${chainId}`, JSON.stringify({ data, cachedAt: new Date().toISOString() }))
  } catch {}
}

function clearCachedReport(chainId) {
  try { localStorage.removeItem(`occultus_cr_${chainId}`) } catch {}
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function Stat({ label, value, accent }) {
  return (
    <div
      style={{
        background: accent ? 'rgba(179,18,63,0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${accent ? 'rgba(179,18,63,0.25)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: '8px',
        padding: '10px 14px',
      }}
    >
      <p style={{ color: '#a1a1aa', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px 0' }}>
        {label}
      </p>
      <p style={{ color: accent ? '#ff2f6d' : '#f4f4f5', fontSize: '15px', fontWeight: '700', margin: 0 }}>
        {value}
      </p>
    </div>
  )
}

// ─── Section divider ─────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ marginTop: '20px' }}>
      <p
        style={{
          color: '#a1a1aa',
          fontSize: '10px',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)', display: 'inline-block' }} />
        {title}
        <span style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)', display: 'inline-block' }} />
      </p>
      {children}
    </div>
  )
}

// ─── Expanded report content ──────────────────────────────────────────────────

function ChainReport({ chain, report, onSave, saveStatus, savedInDB, saveLabel = 'Save Member Hits' }) {
  const cr        = report.chainreport
  const usernames = report.usernames || {}
  const details   = cr.details  || {}
  const bonuses   = cr.bonuses  || []
  const attackers = (cr.attackers || [])
    .filter((a) => a.attacks?.total > 0)
    .sort((a, b) => b.attacks.total - a.attacks.total)

  const alreadySaved = savedInDB || saveStatus === 'saved'

  return (
    <>
      {/* ── Chain Detail Stats ── */}
      <Section title="Chain Details">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
            gap: '8px',
          }}
        >
          <Stat label="Duration"  value={formatDuration(chain.start_at, chain.end_at)} />
          <Stat label="Ended"     value={formatUnixDate(chain.end_at)} />
          <Stat label="Members"   value={fmt(details.members)} />
          <Stat label="Targets"   value={fmt(details.targets)} />
          <Stat label="War Hits"  value={fmt(details.war)}     accent />
          <Stat label="Best"      value={fmt(details.best)}    />
          <Stat label="Bonuses"   value={fmt(bonuses.length)}  />
          <Stat label="Losses"    value={fmt(details.losses)}  />
        </div>
      </Section>

      {/* ── Bonus Hits ── */}
      {bonuses.length > 0 && (
        <Section title="Bonus Hits">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {bonuses.map((b, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '6px',
                  padding: '8px 12px',
                  background: 'rgba(109,40,217,0.08)',
                  border: '1px solid rgba(109,40,217,0.2)',
                  borderRadius: '8px',
                }}
              >
                <span style={{ color: '#f4f4f5', fontSize: '13px' }}>
                  <span style={{ color: '#9f67ff', fontWeight: '600' }}>
                    {memberLabel(b.attacker_id, usernames)}
                  </span>
                  {' '}hit bonus at chain{' '}
                  <span style={{ color: '#f4f4f5', fontWeight: '600' }}>#{b.chain}</span>
                </span>
                <span
                  style={{
                    background: 'rgba(109,40,217,0.2)',
                    border: '1px solid rgba(109,40,217,0.4)',
                    borderRadius: '6px',
                    padding: '2px 8px',
                    color: '#9f67ff',
                    fontSize: '12px',
                    fontWeight: '700',
                    whiteSpace: 'nowrap',
                  }}
                >
                  +{fmt(b.respect, 0)} RP
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Member Contributions ── */}
      <Section title="Member Contributions">
        {attackers.length === 0 ? (
          <p style={{ color: '#a1a1aa', fontSize: '13px' }}>No attacker data available.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {/* Header row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 70px 80px 60px',
                padding: '4px 10px',
                gap: '8px',
              }}
            >
              {['Member', 'Hits', 'Respect', 'Bonuses'].map((h) => (
                <span key={h} style={{ color: '#a1a1aa', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {h}
                </span>
              ))}
            </div>

            {/* Data rows */}
            {attackers.map((a, idx) => {
              const name    = memberLabel(a.id, usernames)
              const isKnown = !!usernames[a.id]
              return (
                <div
                  key={a.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 70px 80px 60px',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                    border: '1px solid transparent',
                  }}
                >
                  {/* Member name */}
                  <div style={{ minWidth: 0 }}>
                    {isKnown ? (
                      <span style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '500' }}>{name}</span>
                    ) : (
                      <span style={{ color: '#a1a1aa', fontSize: '12px', fontFamily: 'monospace' }}>[{a.id}]</span>
                    )}
                  </div>

                  {/* Total hits */}
                  <span style={{ color: '#f4f4f5', fontSize: '13px', fontWeight: '700' }}>
                    {fmt(a.attacks.total)}
                  </span>

                  {/* Total respect */}
                  <span style={{ color: '#9f67ff', fontSize: '13px' }}>
                    {fmt(a.respect.total, 2)}
                  </span>

                  {/* Bonus hits */}
                  {a.attacks.bonuses > 0 ? (
                    <span
                      style={{
                        display: 'inline-block',
                        background: 'rgba(109,40,217,0.2)',
                        border: '1px solid rgba(109,40,217,0.4)',
                        borderRadius: '5px',
                        padding: '1px 6px',
                        color: '#9f67ff',
                        fontSize: '11px',
                        fontWeight: '700',
                        textAlign: 'center',
                      }}
                    >
                      ×{a.attacks.bonuses}
                    </span>
                  ) : (
                    <span style={{ color: '#a1a1aa', fontSize: '12px' }}>—</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* ── Save Button ── */}
      <div
        style={{
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <button
          onClick={onSave}
          disabled={saveStatus === 'saving' || attackers.length === 0}
          style={{
            padding: '9px 20px',
            borderRadius: '8px',
            border: `1px solid ${alreadySaved ? 'rgba(34,197,94,0.4)' : 'rgba(179,18,63,0.5)'}`,
            background: alreadySaved ? 'rgba(34,197,94,0.1)' : 'rgba(179,18,63,0.15)',
            color: alreadySaved ? '#4ade80' : '#ff2f6d',
            fontSize: '13px',
            fontWeight: '600',
            cursor: saveStatus === 'saving' || attackers.length === 0 ? 'not-allowed' : 'pointer',
            opacity: saveStatus === 'saving' ? 0.6 : 1,
            transition: 'all 0.15s',
          }}
        >
          {saveStatus === 'saving'
            ? 'Saving…'
            : alreadySaved
            ? '✓ Saved'
            : saveLabel}
        </button>

        {saveStatus === 'error' && (
          <span style={{ color: '#ff6b6b', fontSize: '12px' }}>
            Save failed — try again
          </span>
        )}

        {alreadySaved && saveStatus !== 'saving' && (
          <span style={{ color: '#a1a1aa', fontSize: '12px' }}>
            {attackers.length} member{attackers.length !== 1 ? 's' : ''} recorded •{' '}
            <button
              onClick={onSave}
              style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '12px', padding: 0, textDecoration: 'underline' }}
            >
              Re-save
            </button>
          </span>
        )}

        {/* Chain ID badge */}
        <span
          style={{
            marginLeft: 'auto',
            color: '#a1a1aa',
            fontSize: '11px',
            fontFamily: 'monospace',
          }}
        >
          Chain #{chain.torn_chain_id}
        </span>
      </div>
    </>
  )
}

// ─── Chain Card ───────────────────────────────────────────────────────────────

function ChainCard({ chain }) {
  const [open,         setOpen]         = useState(false)
  const [report,       setReport]       = useState(() => getCachedReport(chain.torn_chain_id))
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError,  setReportError]  = useState(null)
  const [saveStatus,   setSaveStatus]   = useState(null) // null | 'saving' | 'saved' | 'error'
  const [savedInDB,    setSavedInDB]    = useState(chain.hits_saved === 1)

  // Fetch report when first opened (or if no cached data)
  useEffect(() => {
    if (open && !report && !reportLoading) {
      doFetch()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const doFetch = async (force = false) => {
    if (!force) {
      const cached = getCachedReport(chain.torn_chain_id)
      if (cached) { setReport(cached); return }
    } else {
      clearCachedReport(chain.torn_chain_id)
    }

    setReportLoading(true)
    setReportError(null)

    try {
      const token = localStorage.getItem('occultusSession')
      const res   = await fetch(
        `${API_BASE_URL}/api/leadership/chain-report?chain_id=${chain.torn_chain_id}`,
        { headers: { Authorization: token } }
      )
      const data = await res.json()

      if (!res.ok || data.error) {
        setReportError(data.error || `HTTP ${res.status}`)
        return
      }

      setCachedReport(chain.torn_chain_id, data)
      setReport(data)
    } catch (err) {
      setReportError(err.message)
    } finally {
      setReportLoading(false)
    }
  }

  const handleSave = async () => {
    if (!report) return
    const cr = report.chainreport

    const attackers = (cr.attackers || [])
      .filter((a) => a.attacks?.total > 0)
      .map((a) => ({
        id:            a.id,
        total_attacks: a.attacks.total,
        total_respect: a.respect?.total ?? 0,
        bonus_hits:    a.attacks?.bonuses ?? 0,
      }))

    if (attackers.length === 0) return

    setSaveStatus('saving')
    try {
      const token = localStorage.getItem('occultusSession')
      const res   = await fetch(`${API_BASE_URL}/api/leadership/chain-hits`, {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          torn_chain_id: chain.torn_chain_id,
          faction_id:    chain.faction_id,
          start_at:      chain.start_at,
          attackers,
        }),
      })
      const data = await res.json()

      if (res.ok) {
        setSaveStatus('saved')
        setSavedInDB(true)
      } else {
        console.error('saveChainHits error:', data)
        setSaveStatus('error')
      }
    } catch (err) {
      console.error('saveChainHits exception:', err)
      setSaveStatus('error')
    }
  }

  const respect   = chain.respect?.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? '—'
  const startDate = formatUnixDate(chain.start_at)

  return (
    <div
      style={{
        background: open ? 'rgba(179,18,63,0.05)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${open ? 'rgba(179,18,63,0.28)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: '12px',
        overflow: 'hidden',
        transition: 'border-color 0.2s, background 0.2s',
      }}
    >
      {/* ── Always-visible header ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '14px 18px',
          display: 'grid',
          gridTemplateColumns: '1fr auto auto auto',
          alignItems: 'center',
          gap: '10px',
          textAlign: 'left',
        }}
      >
        {/* Hit count + date */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
            <span style={{ fontSize: '16px' }}>⛓</span>
            <span style={{ color: '#f4f4f5', fontWeight: '700', fontSize: '15px' }}>
              {fmt(chain.chain_length)} hits
            </span>
            {(savedInDB) && (
              <span
                style={{
                  fontSize: '10px',
                  color: '#4ade80',
                  background: 'rgba(34,197,94,0.1)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  borderRadius: '4px',
                  padding: '1px 5px',
                  letterSpacing: '0.04em',
                }}
              >
                SAVED
              </span>
            )}
          </div>
          <span style={{ color: '#a1a1aa', fontSize: '11px' }}>{startDate}</span>
        </div>

        {/* Respect badge */}
        <div
          style={{
            background: 'rgba(109,40,217,0.15)',
            border: '1px solid rgba(109,40,217,0.35)',
            borderRadius: '8px',
            padding: '4px 10px',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: '#9f67ff', fontWeight: '600', fontSize: '12px' }}>
            {respect} RP
          </span>
        </div>

        {/* Chevron */}
        <span
          style={{
            color: '#a1a1aa',
            fontSize: '11px',
            transition: 'transform 0.2s',
            display: 'inline-block',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          ▼
        </span>
      </button>

      {/* ── Expanded area ── */}
      {open && (
        <div
          style={{
            padding: '4px 18px 20px 18px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {reportLoading && (
            <p style={{ color: '#a1a1aa', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
              Loading chain report…
            </p>
          )}

          {reportError && !reportLoading && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'rgba(255,0,0,0.08)',
                border: '1px solid rgba(255,0,0,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ color: '#ff6b6b', fontSize: '13px' }}>
                Error loading report: {reportError}
              </span>
              <button
                onClick={() => doFetch(true)}
                style={{
                  background: 'rgba(255,0,0,0.15)',
                  border: '1px solid rgba(255,0,0,0.3)',
                  borderRadius: '6px',
                  color: '#ff6b6b',
                  fontSize: '12px',
                  padding: '4px 10px',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {report && !reportLoading && (
            <ChainReport
              chain={chain}
              report={report}
              onSave={handleSave}
              saveStatus={saveStatus}
              savedInDB={savedInDB}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Historical chain importer ────────────────────────────────────────────────

function ChainImporter() {
  const [open,          setOpen]          = useState(false)
  const [input,         setInput]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [fetchError,    setFetchError]    = useState(null)
  const [preview,       setPreview]       = useState(null) // { chain, report }
  const [importStatus,  setImportStatus]  = useState(null) // null | 'importing' | 'done' | 'error'
  const [importResult,  setImportResult]  = useState(null)

  const handleLoad = async () => {
    const chainId = parseInt(input.trim(), 10)
    if (!chainId) return

    setLoading(true)
    setFetchError(null)
    setPreview(null)
    setImportStatus(null)
    setImportResult(null)

    try {
      const token = localStorage.getItem('occultusSession')
      const res   = await fetch(
        `${API_BASE_URL}/api/leadership/chain-report?chain_id=${chainId}`,
        { headers: { Authorization: token } }
      )
      const data = await res.json()

      if (!res.ok || data.error) {
        setFetchError(data.error || `HTTP ${res.status}`)
        return
      }

      const cr = data.chainreport

      if (!VALID_FACTION_IDS.includes(cr.faction_id)) {
        setFetchError(
          `Chain #${chainId} belongs to faction ${cr.faction_id} (${cr.faction_id}) — not one of our three factions`
        )
        return
      }

      setPreview({
        chain: {
          torn_chain_id: cr.id,
          faction_id:    cr.faction_id,
          chain_length:  cr.details?.chain  ?? 0,
          respect:       cr.details?.respect ?? 0,
          start_at:      cr.start,
          end_at:        cr.end,
          hits_saved:    0,
        },
        report: data,
      })
    } catch (err) {
      setFetchError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    if (!preview) return
    const { chain, report } = preview
    const cr = report.chainreport

    const attackers = (cr.attackers || [])
      .filter((a) => a.attacks?.total > 0)
      .map((a) => ({
        id:            a.id,
        username:      preview.report.usernames?.[a.id] || null,
        total_attacks: a.attacks.total,
        total_respect: a.respect?.total  ?? 0,
        bonus_hits:    a.attacks?.bonuses ?? 0,
      }))

    setImportStatus('importing')
    try {
      const token = localStorage.getItem('occultusSession')
      const res   = await fetch(`${API_BASE_URL}/api/leadership/chain-import`, {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          torn_chain_id: chain.torn_chain_id,
          faction_id:    chain.faction_id,
          chain_length:  chain.chain_length,
          respect:       chain.respect,
          start_at:      chain.start_at,
          end_at:        chain.end_at,
          attackers,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setImportStatus('done')
        setImportResult(data)
      } else {
        setImportStatus('error')
        setImportResult(data)
      }
    } catch (err) {
      setImportStatus('error')
      setImportResult({ message: err.message })
    }
  }

  const respect     = preview?.chain.respect?.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? '—'
  const factionName = preview ? (FACTION_NAMES[preview.chain.faction_id] ?? String(preview.chain.faction_id)) : null

  if (!open) return (
    <button onClick={() => setOpen(true)} style={{
      padding: '7px 16px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap',
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#a1a1aa',
    }}>+ Load Historic Chain</button>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      <div style={{
        background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px',
        padding: '24px', width: '100%', maxWidth: '640px', maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ color: '#f4f4f5', fontSize: '16px', fontWeight: '600', margin: 0 }}>Load Historic Chain</h3>
          <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#71717a', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '16px' }}>
          Import any past chain by ID — no minimum hit count required.
        </p>

        <div style={{ padding: '0' }}>
          {/* ── Chain ID input ── */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
            <input
              type="number"
              placeholder="Enter chain ID…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && input.trim() && handleLoad()}
              style={{
                flex: '1 1 180px',
                minWidth: '140px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                color: '#f4f4f5',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <button
              onClick={handleLoad}
              disabled={loading || !input.trim()}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                border: '1px solid rgba(179,18,63,0.5)',
                background: 'rgba(179,18,63,0.15)',
                color: '#ff2f6d',
                fontSize: '13px',
                fontWeight: '600',
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                opacity: loading || !input.trim() ? 0.5 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {loading ? 'Loading…' : 'Load'}
            </button>
          </div>

          {/* Fetch error */}
          {fetchError && !loading && (
            <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,0,0,0.08)', border: '1px solid rgba(255,0,0,0.2)' }}>
              <p style={{ color: '#ff6b6b', fontSize: '13px', margin: 0 }}>{fetchError}</p>
            </div>
          )}

          {/* ── Preview card ── */}
          {preview && !loading && (
            <div
              style={{
                marginTop: '16px',
                borderRadius: '12px',
                border: '1px solid rgba(179,18,63,0.28)',
                background: 'rgba(179,18,63,0.04)',
                overflow: 'hidden',
              }}
            >
              {/* Card header (mirrors ChainCard header) */}
              <div
                style={{
                  padding: '14px 18px',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '16px' }}>⛓</span>
                    <span style={{ color: '#f4f4f5', fontWeight: '700', fontSize: '15px' }}>
                      {fmt(preview.chain.chain_length)} hits
                    </span>
                    {/* Faction tag */}
                    <span
                      style={{
                        fontSize: '11px',
                        color: '#9f67ff',
                        background: 'rgba(109,40,217,0.12)',
                        border: '1px solid rgba(109,40,217,0.3)',
                        borderRadius: '4px',
                        padding: '1px 6px',
                      }}
                    >
                      {factionName}
                    </span>
                  </div>
                  <span style={{ color: '#a1a1aa', fontSize: '11px' }}>
                    {formatUnixDate(preview.chain.start_at)}
                  </span>
                </div>

                {/* Respect badge */}
                <div
                  style={{
                    background: 'rgba(109,40,217,0.15)',
                    border: '1px solid rgba(109,40,217,0.35)',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ color: '#9f67ff', fontWeight: '600', fontSize: '12px' }}>
                    {respect} RP
                  </span>
                </div>
              </div>

              {/* Pre-expanded chain report */}
              <div style={{ padding: '0 18px 20px 18px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <ChainReport
                  chain={preview.chain}
                  report={preview.report}
                  onSave={handleImport}
                  saveStatus={
                    importStatus === 'importing' ? 'saving'
                    : importStatus === 'done'     ? 'saved'
                    : importStatus === 'error'    ? 'error'
                    : null
                  }
                  savedInDB={importStatus === 'done'}
                  saveLabel="Import to Database"
                />
              </div>

              {/* Import result banner */}
              {importStatus === 'done' && importResult && (
                <div
                  style={{
                    margin: '0 18px 18px 18px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(34,197,94,0.08)',
                    border: '1px solid rgba(34,197,94,0.25)',
                  }}
                >
                  <p style={{ color: '#4ade80', fontSize: '13px', margin: 0 }}>
                    {importResult.message}
                  </p>
                </div>
              )}
              {importStatus === 'error' && importResult && (
                <div
                  style={{
                    margin: '0 18px 18px 18px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(255,0,0,0.08)',
                    border: '1px solid rgba(255,0,0,0.2)',
                  }}
                >
                  <p style={{ color: '#ff6b6b', fontSize: '13px', margin: 0 }}>
                    {importResult.message || importResult.error || 'Import failed — try again'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Faction chains panel ─────────────────────────────────────────────────────

function FactionChains({ factionId }) {
  const [chains,  setChains]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setChains(null)

    const token = localStorage.getItem('occultusSession')
    fetch(`${API_BASE_URL}/api/leadership/chains?faction_id=${factionId}`, {
      headers: { Authorization: token },
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error)
        else setChains(data.chains || [])
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [factionId])

  if (loading) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center' }}>
        <p style={{ color: '#a1a1aa', fontSize: '14px' }}>Loading chains…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          padding: '14px 16px',
          borderRadius: '10px',
          background: 'rgba(255,0,0,0.08)',
          border: '1px solid rgba(255,0,0,0.2)',
          marginTop: '16px',
        }}
      >
        <p style={{ color: '#ff6b6b', fontSize: '13px', margin: 0 }}>Error: {error}</p>
      </div>
    )
  }

  if (!chains || chains.length === 0) {
    return (
      <div
        style={{
          padding: '40px',
          textAlign: 'center',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.06)',
          marginTop: '16px',
        }}
      >
        <p style={{ color: '#a1a1aa', fontSize: '14px', margin: 0 }}>
          No chains ≥ 1,000 hits yet — the cache refreshes every Monday,
          or force a refresh from Admin › Cache.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
      {chains.map((chain) => (
        <ChainCard key={chain.torn_chain_id} chain={chain} />
      ))}
      <p style={{ color: '#a1a1aa', fontSize: '11px', marginTop: '4px', textAlign: 'right' }}>
        Showing last {chains.length} chain{chains.length !== 1 ? 's' : ''} ≥ 1,000 hits
      </p>
    </div>
  )
}


// ─── Sub-tab bar ──────────────────────────────────────────────────────────────

function SubTabs({ options, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '7px 18px',
            borderRadius: '8px',
            border: `1px solid ${active === opt.value ? 'rgba(179,18,63,0.5)' : 'rgba(255,255,255,0.08)'}`,
            background: active === opt.value ? 'rgba(179,18,63,0.15)' : 'transparent',
            color: active === opt.value ? '#f4f4f5' : '#a1a1aa',
            fontSize: '13px',
            fontWeight: active === opt.value ? '600' : '400',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { if (active !== opt.value) e.currentTarget.style.color = '#f4f4f5' }}
          onMouseLeave={(e) => { if (active !== opt.value) e.currentTarget.style.color = '#a1a1aa' }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChainTrackingTab() {
  const [topTab,    setTopTab]    = useState('chains')
  const [factionId, setFactionId] = useState(33097)

  const topTabs     = [
    { value: 'chains', label: 'Chains' },
    { value: 'wars',   label: 'Wars'  },
  ]
  const factionTabs = FACTIONS.map((f) => ({ value: f.id, label: f.name }))

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2
          style={{
            fontFamily: 'Cinzel, serif',
            color: '#f4f4f5',
            fontSize: '20px',
            letterSpacing: '1px',
            marginBottom: '4px',
          }}
        >
          Chain & War Tracking
        </h2>
        {/*<p style={{ color: '#a1a1aa', fontSize: '13px', margin: 0 }}>
          Only chains ≥ 1,000 hits are tracked automatically. 
          Expand a chain to load the full member report and save to the database.
        </p>*/}
      </div>

      {/* Top-level tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          marginBottom: '24px',
        }}
      >
        {topTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setTopTab(tab.value)}
            style={{
              padding: '10px 22px',
              background: 'transparent',
              border: 'none',
              borderBottom: topTab === tab.value ? '2px solid #b3123f' : '2px solid transparent',
              color: topTab === tab.value ? '#f4f4f5' : '#a1a1aa',
              fontWeight: topTab === tab.value ? '600' : '400',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { if (topTab !== tab.value) e.currentTarget.style.color = '#f4f4f5' }}
            onMouseLeave={(e) => { if (topTab !== tab.value) e.currentTarget.style.color = '#a1a1aa' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {topTab === 'wars' && <WarTrackingTab />}

      {topTab === 'chains' && (
        <div>
          {/* Live active chain (hidden when no chain running) */}
          <ActiveChainCard />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '4px', marginTop: '16px' }}>
            <SubTabs options={factionTabs} active={factionId} onChange={setFactionId} />
            <ChainImporter />
          </div>
          <FactionChains key={factionId} factionId={factionId} />
        </div>
      )}
    </div>
  )
}
