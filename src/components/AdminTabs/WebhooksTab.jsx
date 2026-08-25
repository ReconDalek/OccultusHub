import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'
import { timeAgo } from '../../lib/dates'

const EVENT_META = {
  investment_tci: {
    label:    'Investment TCI Alerts',
    icon:     '⚠️',
    schedule: 'Daily at 01:00 UTC — reminder at 10–7 days, late warning at 6–1 days',
    description: 'Sends a Discord message for each active bank investment approaching expiry where TCI has not yet been purchased. Days 7–10 use the standard reminder; days 1–6 use the late warning template. Skips if TCI is already checked.',
    vars: [
      ['{mention}',        'Discord @mention from the configured user ID above'],
      ['{member_mention}', 'Discord @mention of the investor (from their investment record)'],
      ['{member_name}',    'Torn username of the investor'],
      ['{days_left}',      'Days remaining until investment expires'],
      ['{days_plural}',    '"s" or "" (for grammatical correctness)'],
      ['{end_date}',       'Investment expiry date (YYYY-MM-DD)'],
      ['{amount}',         'Investment amount (formatted, e.g. $4.00B)'],
      ['{faction_name}',   'Faction the investment belongs to'],
      ['{last_day_note}',  'Urgent note — only included on the 7-day alert'],
      ['{tci_cost}',       'Current cost to buy 1.5M TCI shares (updated every 5 minutes)'],
      ['{tci_price}',      'Current TCI share price'],
    ],
    defaultTemplate: [
      '{mention}{member_mention}',
      '**TCI Purchase Reminder**',
      '**{member_name}** has a bank investment expiring in **{days_left} day{days_plural}** on **{end_date}**.',
      'Please purchase TCI now to secure the bonus!{last_day_note}',
      '> Current TCI cost: **{tci_cost}** (1.5M shares @ {tci_price}/share)',
      '> 💰 **{amount}** · {faction_name}',
    ].join('\n'),
    defaultLateTemplate: [
      '{mention}{member_mention}',
      '⚠️ **TCI Purchase Late**',
      '**{member_name}** has a bank investment expiring in **{days_left} day{days_plural}** on **{end_date}**.',
      'Please purchase TCI now, TCI bonus will be late!',
      '> Current TCI cost: **{tci_cost}** (1.5M shares @ {tci_price}/share)',
      '> 💰 **{amount}** · {faction_name}',
    ].join('\n'),
  },

  stock_monthly: {
    label:    'Stock Monthly Payouts',
    icon:     '📊',
    schedule: '1st of each month at 02:00 UTC',
    description: 'Sends one combined Discord message on the 1st of each month listing every member\'s stock investment payout obligation to the faction for that month. Sent once per month — duplicate protection is built in.',
    vars: [
      ['{mention}',      'Discord @mention from the configured user ID above'],
      ['{month}',        'Month name (e.g. "June")'],
      ['{year}',         'Year (e.g. "2026")'],
      ['{payout_list}',  'Formatted list of member rows (each row uses the payout row template below)'],
      ['{total}',        'Grand total across all members (formatted)'],
    ],
    defaultTemplate: [
      '{mention}',
      '📊 **Monthly Stock Payouts — {month} {year}**',
      'The following members have stock investment obligations this month:',
      '',
      '{payout_list}',
      '',
      '💰 **Total expected: {total}**',
    ].join('\n'),
    rowVars: [
      ['{member_mention}', 'Discord @mention of the member (blank if no Discord ID set)'],
      ['{member_name}',    'Torn username of the member'],
      ['{amount}',         'Total owed this month (formatted, e.g. $4.00B)'],
      ['{stocks}',         'Stock holdings, e.g. "TCI T2, WLT T1"'],
    ],
    defaultRowTemplate: '• {member_mention}**{member_name}** — {amount} ({stocks})',
  },

  armory_low: {
    label:    'Armory Low Stock Alerts',
    icon:     '🛡️',
    schedule: 'Daily at 01:00 UTC',
    description: 'Sends one Discord message per faction when any armory item falls below its configured minimum quantity. Thresholds are set on the Armory → Config tab. Sends in faction order: Occultus, Occul2us, Occul3us.',
    vars: [
      ['{mention}',           'Discord @mention from the configured user ID above'],
      ['{faction_sections}',  'One block per faction with low items, each formatted as **Faction:** followed by indented item lines'],
    ],
    defaultTemplate: [
      '🛡️ **Armory Low Stock Alert**',
      '',
      '{faction_sections}',
      '{mention}',
    ].join('\n'),
  },
}

// ── Discord message renderer ──────────────────────────────────────────────────

function renderDiscordMarkdown(text) {
  // Split into lines and render each
  const lines = text.split('\n')
  return lines.map((line, i) => {
    const key = i

    // -# small subtext
    if (line.startsWith('-# ')) {
      return <div key={key} style={{ fontSize: '11px', color: "var(--text-muted)", marginBottom: '2px' }}>{renderInline(line.slice(3))}</div>
    }
    // > blockquote
    if (line.startsWith('> ')) {
      return (
        <div key={key} style={{ display: 'flex', gap: '0', marginBottom: '2px' }}>
          <div style={{ width: '3px', background: '#4e5058', borderRadius: '2px', flexShrink: 0, marginRight: '10px' }} />
          <span style={{ color: '#dbdee1', fontSize: '13px' }}>{renderInline(line.slice(2))}</span>
        </div>
      )
    }
    // Empty line
    if (line === '') return <div key={key} style={{ height: '6px' }} />
    // Normal line
    return <div key={key} style={{ fontSize: '13px', color: '#dbdee1', marginBottom: '2px' }}>{renderInline(line)}</div>
  })
}

function renderInline(text) {
  // Render **bold** inline. Split on ** pairs.
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: '#f2f3f5' }}>{part.slice(2, -2)}</strong>
    }
    // Render <@id> as a mention pill
    return <span key={i}>{part.replace(/<@!?(\d+)>/g, (_, id) => `@${id}`)}</span>
  })
}

function DiscordPreviewPanel({ messages, onClose }) {
  const [idx, setIdx] = useState(0)
  const msg = messages[idx]

  return (
    <div style={{
      marginTop: '16px',
      background: '#313338',
      borderRadius: '10px',
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {/* Panel header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#2b2d31', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: '600', color: '#b5bac1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Discord Preview</span>
          {messages.length > 1 && (
            <span style={{ fontSize: '11px', color: "var(--text-muted)" }}>({idx + 1} of {messages.length})</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {messages.length > 1 && (
            <>
              <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
                style={{ padding: '3px 10px', borderRadius: '4px', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#b5bac1', cursor: idx === 0 ? 'default' : 'pointer', fontSize: '12px', opacity: idx === 0 ? 0.4 : 1 }}>
                ‹ Prev
              </button>
              <button onClick={() => setIdx(i => Math.min(messages.length - 1, i + 1))} disabled={idx === messages.length - 1}
                style={{ padding: '3px 10px', borderRadius: '4px', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#b5bac1', cursor: idx === messages.length - 1 ? 'default' : 'pointer', fontSize: '12px', opacity: idx === messages.length - 1 ? 0.4 : 1 }}>
                Next ›
              </button>
            </>
          )}
          <button onClick={onClose} style={{ padding: '3px 10px', borderRadius: '4px', border: 'none', background: 'rgba(255,255,255,0.06)', color: '#b5bac1', cursor: 'pointer', fontSize: '12px' }}>✕ Close</button>
        </div>
      </div>

      {/* Message label */}
      {msg.label && (
        <div style={{ padding: '6px 14px', background: '#2b2d31', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '11px', color: "var(--text-muted)" }}>
          {msg.label}
        </div>
      )}

      {/* Discord-style message body */}
      <div style={{ padding: '14px 16px', display: 'flex', gap: '14px' }}>
        {/* Avatar */}
        <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#5865f2', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
          🛡️
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontWeight: '600', color: '#f2f3f5', fontSize: '14px' }}>OccultusHub</span>
            <span style={{ fontSize: '11px', color: "var(--text-muted)" }}>Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <span style={{ fontSize: '10px', padding: '1px 4px', background: '#5865f2', borderRadius: '3px', color: '#fff', fontWeight: '600' }}>BOT</span>
          </div>
          <div style={{ lineHeight: '1.5' }}>
            {renderDiscordMarkdown(msg.content)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function WebhookCard({ config, onSaved }) {
  const meta     = EVENT_META[config.event_type] || {}
  const token    = localStorage.getItem('occultusSession')

  const [webhookUrl,          setWebhookUrl]          = useState(config.webhook_url           || '')
  const [threadId,            setThreadId]            = useState(config.thread_id             || '')
  const [mentionUserId,       setMentionUserId]       = useState(config.mention_user_id       || '')
  const [messageTemplate,     setMessageTemplate]     = useState(config.message_template      || '')
  const [lateMessageTemplate, setLateMessageTemplate] = useState(config.late_message_template || '')
  const [payoutRowTemplate,   setPayoutRowTemplate]   = useState(config.payout_row_template   || '')
  const [enabled,             setEnabled]             = useState(!!config.enabled)
  const [showTemplate,        setShowTemplate]        = useState(false)
  const [showUrl,             setShowUrl]             = useState(false)
  const [saving,              setSaving]              = useState(false)
  const [testing,             setTesting]             = useState(false)
  const [triggering,          setTriggering]          = useState(false)
  const [previewing,          setPreviewing]          = useState(false)
  const [preview,             setPreview]             = useState(null)  // [{ label, content }] | null
  const [feedback,            setFeedback]            = useState(null)  // { type: 'ok'|'err', msg }

  const flash = (type, msg) => {
    setFeedback({ type, msg })
    setTimeout(() => setFeedback(null), 5000)
  }

  const save = async () => {
    setSaving(true)
    try {
      const res  = await fetch(`${API_BASE_URL}/api/admin/webhooks`, {
        method:  'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          event_type:            config.event_type,
          webhook_url:           webhookUrl,
          thread_id:             threadId || null,
          mention_user_id:       mentionUserId || null,
          message_template:      messageTemplate || null,
          late_message_template: lateMessageTemplate || null,
          payout_row_template:   payoutRowTemplate || null,
          enabled,
        }),
      })
      const data = await res.json()
      if (res.ok) { flash('ok', 'Saved'); onSaved?.(data.config) }
      else flash('err', data.error || 'Save failed')
    } catch (e) {
      flash('err', e.message)
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    if (!webhookUrl) return flash('err', 'Enter a webhook URL first')
    setTesting(true)
    try {
      const res  = await fetch(`${API_BASE_URL}/api/admin/webhooks/${config.event_type}/test`, {
        method: 'POST', headers: { Authorization: token },
      })
      const data = await res.json()
      if (res.ok) flash('ok', 'Test message sent — check your Discord channel')
      else flash('err', data.error || 'Test failed')
    } catch (e) {
      flash('err', e.message)
    } finally {
      setTesting(false)
    }
  }

  const trigger = async () => {
    setTriggering(true)
    try {
      const res  = await fetch(`${API_BASE_URL}/api/admin/webhooks/${config.event_type}/trigger`, {
        method: 'POST', headers: { Authorization: token },
      })
      const data = await res.json()
      if (res.ok) {
        const msg = data.error ? `Error: ${data.error}` :
                    data.reason ? `Skipped: ${data.reason}` :
                    data.sent === false ? `Not sent: ${data.reason ?? 'see logs'}` :
                    `Done — ${JSON.stringify(data)}`
        flash('ok', msg)
        onSaved?.()
      } else flash('err', data.error || 'Trigger failed')
    } catch (e) {
      flash('err', e.message)
    } finally {
      setTriggering(false)
    }
  }

  const display = async () => {
    setPreviewing(true)
    setPreview(null)
    try {
      const res  = await fetch(`${API_BASE_URL}/api/admin/webhooks/${config.event_type}/preview`, {
        method: 'POST', headers: { Authorization: token },
      })
      const data = await res.json()
      if (res.ok && data.messages) setPreview(data.messages)
      else flash('err', data.error || 'Preview failed')
    } catch (e) {
      flash('err', e.message)
    } finally {
      setPreviewing(false)
    }
  }

  const dirty = webhookUrl          !== (config.webhook_url           || '') ||
                threadId            !== (config.thread_id             || '') ||
                mentionUserId       !== (config.mention_user_id       || '') ||
                messageTemplate     !== (config.message_template      || '') ||
                lateMessageTemplate !== (config.late_message_template || '') ||
                payoutRowTemplate   !== (config.payout_row_template   || '') ||
                enabled             !== !!config.enabled

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${enabled ? 'rgba(179,18,63,0.3)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: '12px', padding: '24px', marginBottom: '20px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '18px' }}>{meta.icon}</span>
            <span style={{ color: '#f4f4f5', fontWeight: '700', fontSize: '15px' }}>{meta.label}</span>
            {meta.comingSoon && (
              <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)', color: "var(--text-muted)", fontWeight: '600' }}>
                LOGIC COMING SOON
              </span>
            )}
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: '12px', margin: 0 }}>{meta.schedule}</p>
        </div>

        {/* Enable toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
          <div
            onClick={() => setEnabled(v => !v)}
            style={{
              width: '40px', height: '22px', borderRadius: '11px', position: 'relative', cursor: 'pointer',
              background: enabled ? 'rgba(179,18,63,0.6)' : 'rgba(255,255,255,0.1)',
              transition: 'background 0.2s',
            }}
          >
            <div style={{
              position: 'absolute', top: '3px', left: enabled ? '21px' : '3px',
              width: '16px', height: '16px', borderRadius: '50%', background: '#f4f4f5',
              transition: 'left 0.2s',
            }} />
          </div>
          <span style={{ color: enabled ? '#f4f4f5' : "var(--text-muted)", fontSize: '13px' }}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      </div>

      <p style={{ color: "var(--text-secondary)", fontSize: '13px', marginBottom: '20px' }}>{meta.description}</p>

      {/* Fields */}
      <div style={{ display: 'grid', gap: '14px' }}>
        {/* Webhook URL */}
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
            Webhook URL
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type={showUrl ? 'text' : 'password'}
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              style={{
                flex: 1, padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
                border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
                color: '#f4f4f5',
              }}
            />
            <button
              onClick={() => setShowUrl(v => !v)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: "var(--text-secondary)", cursor: 'pointer', fontSize: '12px' }}
            >
              {showUrl ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {/* Forum thread / post ID */}
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
            Discord Thread / Forum Post ID <span style={{ color: "var(--text-faint)", fontWeight: '400', textTransform: 'none' }}>(optional — posts into this specific thread/post instead of the channel's main feed)</span>
          </label>
          <input
            type="text"
            value={threadId}
            onChange={e => setThreadId(e.target.value)}
            placeholder="e.g. 1234567890123456789"
            style={{
              width: '260px', padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
              border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
              color: '#f4f4f5',
            }}
          />
        </div>

        {/* Mention user ID */}
        <div>
          <label style={{ color: "var(--text-secondary)", fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
            Discord User ID to Mention <span style={{ color: "var(--text-faint)", fontWeight: '400', textTransform: 'none' }}>(optional — treasurer / officer to ping)</span>
          </label>
          <input
            type="text"
            value={mentionUserId}
            onChange={e => setMentionUserId(e.target.value)}
            placeholder="e.g. 123456789012345678"
            style={{
              width: '260px', padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
              border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
              color: '#f4f4f5',
            }}
          />
        </div>

        {/* Message template */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label style={{ color: "var(--text-secondary)", fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {meta.defaultLateTemplate ? 'Reminder Template (7–10 days)' : 'Message Template'}{' '}
              <span style={{ color: "var(--text-faint)", fontWeight: '400', textTransform: 'none' }}>(leave blank to use default)</span>
            </label>
            <button
              onClick={() => setShowTemplate(v => !v)}
              style={{ background: 'none', border: 'none', color: '#9f67ff', fontSize: '12px', cursor: 'pointer' }}
            >
              {showTemplate ? 'Hide templates' : 'Customise templates'}
            </button>
          </div>

          {showTemplate && (
            <>
              <textarea
                value={messageTemplate}
                onChange={e => setMessageTemplate(e.target.value)}
                placeholder={meta.defaultTemplate}
                rows={8}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px',
                  border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
                  color: '#f4f4f5', resize: 'vertical', fontFamily: 'monospace', boxSizing: 'border-box',
                }}
              />
              {messageTemplate && (
                <button
                  onClick={() => setMessageTemplate('')}
                  style={{ marginTop: '4px', background: 'none', border: 'none', color: "var(--text-faint)", fontSize: '11px', cursor: 'pointer', padding: 0 }}
                >
                  Reset to default
                </button>
              )}

              {/* Payout row template — stock_monthly only */}
              {meta.defaultRowTemplate && (
                <div style={{ marginTop: '16px' }}>
                  <label style={{ color: "var(--text-secondary)", fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                    Payout Row Template{' '}
                    <span style={{ color: "var(--text-faint)", fontWeight: '400', textTransform: 'none' }}>(controls each member line inside {'{payout_list}'} — leave blank for default)</span>
                  </label>
                  <input
                    type="text"
                    value={payoutRowTemplate}
                    onChange={e => setPayoutRowTemplate(e.target.value)}
                    placeholder={meta.defaultRowTemplate}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
                      border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
                      color: '#f4f4f5', fontFamily: 'monospace', boxSizing: 'border-box',
                    }}
                  />
                  {payoutRowTemplate && (
                    <button
                      onClick={() => setPayoutRowTemplate('')}
                      style={{ marginTop: '4px', background: 'none', border: 'none', color: "var(--text-faint)", fontSize: '11px', cursor: 'pointer', padding: 0 }}
                    >
                      Reset to default
                    </button>
                  )}
                  <div style={{ marginTop: '8px', display: 'grid', gap: '4px' }}>
                    {meta.rowVars?.map(([v, desc]) => (
                      <div key={v} style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
                        <code style={{ color: '#9f67ff', minWidth: '160px', flexShrink: 0 }}>{v}</code>
                        <span style={{ color: "var(--text-muted)" }}>{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Late template — investment_tci only */}
              {meta.defaultLateTemplate && (
                <div style={{ marginTop: '16px' }}>
                  <label style={{ color: "var(--text-secondary)", fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                    Late Warning Template (1–6 days){' '}
                    <span style={{ color: "var(--text-faint)", fontWeight: '400', textTransform: 'none' }}>(leave blank to use default)</span>
                  </label>
                  <textarea
                    value={lateMessageTemplate}
                    onChange={e => setLateMessageTemplate(e.target.value)}
                    placeholder={meta.defaultLateTemplate}
                    rows={7}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '13px',
                      border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
                      color: '#f4f4f5', resize: 'vertical', fontFamily: 'monospace', boxSizing: 'border-box',
                    }}
                  />
                  {lateMessageTemplate && (
                    <button
                      onClick={() => setLateMessageTemplate('')}
                      style={{ marginTop: '4px', background: 'none', border: 'none', color: "var(--text-faint)", fontSize: '11px', cursor: 'pointer', padding: 0 }}
                    >
                      Reset to default
                    </button>
                  )}
                </div>
              )}

              {/* Variable reference */}
              <div style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p style={{ color: "var(--text-muted)", fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Available Variables</p>
                <div style={{ display: 'grid', gap: '4px' }}>
                  {meta.vars?.map(([v, desc]) => (
                    <div key={v} style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
                      <code style={{ color: '#9f67ff', minWidth: '160px', flexShrink: 0 }}>{v}</code>
                      <span style={{ color: "var(--text-muted)" }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '20px', flexWrap: 'wrap' }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            background: dirty ? 'rgba(179,18,63,0.25)' : 'rgba(255,255,255,0.06)',
            color: dirty ? '#ff2f6d' : "var(--text-muted)",
            fontSize: '13px', fontWeight: '600', opacity: saving ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
        </button>

        <button
          onClick={test}
          disabled={testing || !webhookUrl}
          style={{
            padding: '8px 18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent', color: "var(--text-secondary)", fontSize: '13px', cursor: 'pointer',
            opacity: testing || !webhookUrl ? 0.4 : 1,
          }}
        >
          {testing ? 'Sending…' : 'Send Test'}
        </button>

        <button
          onClick={trigger}
          disabled={triggering || !enabled || meta.comingSoon}
          style={{
            padding: '8px 18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent', color: "var(--text-secondary)", fontSize: '13px', cursor: 'pointer',
            opacity: triggering || !enabled || meta.comingSoon ? 0.4 : 1,
          }}
          title={meta.comingSoon ? 'Logic not yet implemented' : !enabled ? 'Enable first' : 'Run now (safe — dedup prevents duplicate sends)'}
        >
          {triggering ? 'Running…' : 'Run Now'}
        </button>

        <button
          onClick={display}
          disabled={previewing}
          style={{
            padding: '8px 18px', borderRadius: '8px', border: '1px solid rgba(88,101,242,0.4)',
            background: preview ? 'rgba(88,101,242,0.15)' : 'transparent',
            color: '#8891f2', fontSize: '13px', cursor: 'pointer',
            opacity: previewing ? 0.5 : 1,
          }}
          title="Preview what this webhook would send — no messages are actually sent"
        >
          {previewing ? 'Loading…' : 'Preview'}
        </button>

        {/* Status */}
        {config.last_triggered && (
          <span style={{ color: "var(--text-faint)", fontSize: '12px', marginLeft: '4px' }}>
            Last run: {timeAgo(config.last_triggered)}
            {config.last_status && <span style={{ color: "var(--text-muted)" }}> — {config.last_status}</span>}
          </span>
        )}
      </div>

      {/* Feedback */}
      {feedback && (
        <div style={{
          marginTop: '12px', padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
          background: feedback.type === 'ok' ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
          border: `1px solid ${feedback.type === 'ok' ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
          color: feedback.type === 'ok' ? '#4ade80' : '#f87171',
        }}>
          {feedback.msg}
        </div>
      )}

      {/* Discord preview panel */}
      {preview && <DiscordPreviewPanel messages={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

export default function WebhooksTab() {
  const [configs,  setConfigs]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const token = localStorage.getItem('occultusSession')

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/webhooks`, { headers: { Authorization: token } })
      .then(r => r.json())
      .then(d => setConfigs(d.configs || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleSaved = (updated) => {
    if (updated) {
      setConfigs(prev => prev.map(c => c.event_type === updated.event_type ? updated : c))
    } else {
      // Re-fetch to pick up last_triggered updates from Run Now
      fetch(`${API_BASE_URL}/api/admin/webhooks`, { headers: { Authorization: token } })
        .then(r => r.json())
        .then(d => setConfigs(d.configs || []))
        .catch(console.error)
    }
  }

  if (loading) return <p style={{ color: "var(--text-secondary)" }}>Loading webhook configs…</p>

  const ordered = ['investment_tci', 'stock_monthly', 'armory_low']
  const sorted  = ordered.map(t => configs.find(c => c.event_type === t)).filter(Boolean)

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <p style={{ color: "var(--text-secondary)", fontSize: '13px', lineHeight: '1.6' }}>
          Configure Discord webhook notifications for faction events. Each webhook URL is tied to a specific Discord channel — create a webhook in your Discord server under <em>Channel Settings → Integrations → Webhooks</em>.
        </p>
        <p style={{ color: "var(--text-faint)", fontSize: '12px', marginTop: '6px' }}>
          The <strong style={{ color: "var(--text-muted)" }}>Discord User ID to Mention</strong> is the 18-digit user ID (enable Developer Mode in Discord → right-click a user → Copy User ID). Leave blank to send without a mention. Individual investment alerts also mention the member directly if their Discord ID is set on their investment record.
        </p>
        <p style={{ color: "var(--text-faint)", fontSize: '12px', marginTop: '6px' }}>
          To post into a specific thread or forum post instead of a channel's main feed, set the <strong style={{ color: "var(--text-muted)" }}>Discord Thread / Forum Post ID</strong> — right-click the thread/post in Discord → Copy Thread/Post ID (Developer Mode required). The webhook must still belong to that thread's parent channel.
        </p>
      </div>

      {sorted.map(cfg => (
        <WebhookCard key={cfg.event_type} config={cfg} onSaved={handleSaved} />
      ))}
    </div>
  )
}
