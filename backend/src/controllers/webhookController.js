import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const FACTION_NAMES = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' };

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── Default templates ──────────────────────────────────────────────────────────

const DEFAULT_TEMPLATES = {
  investment_tci: [
    '{mention}{member_mention}',
    '**TCI Purchase Reminder**',
    '**{member_name}** has a bank investment expiring in **{days_left} day{days_plural}** on **{end_date}**.',
    'Please purchase TCI now to secure the bonus!{last_day_note}',
    '> Current TCI cost: **{tci_cost}** (1.5M shares @ {tci_price}/share)',
    '> 💰 **{amount}** · {faction_name}',
  ].join('\n'),

  investment_tci_late: [
    '{mention}{member_mention}',
    '⚠️ **TCI Purchase Late**',
    '**{member_name}** has a bank investment expiring in **{days_left} day{days_plural}** on **{end_date}**.',
    'Please purchase TCI now, TCI bonus will be late!',
    '> Current TCI cost: **{tci_cost}** (1.5M shares @ {tci_price}/share)',
    '> 💰 **{amount}** · {faction_name}',
  ].join('\n'),

  stock_monthly: [
    '{mention}',
    '📊 **Monthly Stock Payouts — {month} {year}**',
    'The following members have stock investment obligations this month:',
    '',
    '{payout_list}',
    '',
    '💰 **Total expected: {total}**',
  ].join('\n'),

  armory_low: [
    '{mention}',
    '🛡️ **Armory Low Stock Alert — {faction_name}**',
    '',
    '{item_list}',
  ].join('\n'),
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function applyTemplate(template, vars) {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, v ?? ''),
    template
  );
}

function fmtMoney(n) {
  if (!n) return '$0';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}

function payoutsPerMonth(frequency) {
  if (!frequency) return 1;
  if (frequency.includes('7'))  return 4;
  return 1; // 28-day, 31-day → once per month
}

async function getTciPrice(env) {
  try {
    const row = await env.DB.prepare(
      `SELECT data FROM stock_list_cache ORDER BY fetched_at DESC LIMIT 1`
    ).first();
    if (!row?.data) return null;
    const stocks = JSON.parse(row.data);
    const tci = stocks.find(s => s.acronym === 'TCI');
    if (!tci) return null;
    return { price: tci.market.price, requirement: tci.bonus.requirement };
  } catch {
    return null;
  }
}

async function sendDiscordMessage(webhookUrl, content) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, username: 'OccultusHub' }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord returned ${res.status}: ${text.slice(0, 200)}`);
  }
}

async function getConfig(env, eventType) {
  return env.DB.prepare(
    `SELECT * FROM webhook_configs WHERE event_type = ?`
  ).bind(eventType).first();
}

async function markSent(env, eventType, eventKey) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO webhook_send_log (event_type, event_key) VALUES (?, ?)`
  ).bind(eventType, eventKey).run();
}

async function alreadySent(env, eventType, eventKey) {
  const row = await env.DB.prepare(
    `SELECT id FROM webhook_send_log WHERE event_type = ? AND event_key = ?`
  ).bind(eventType, eventKey).first();
  return !!row;
}

async function setStatus(env, eventType, status) {
  await env.DB.prepare(
    `UPDATE webhook_configs SET last_triggered = CURRENT_TIMESTAMP, last_status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE event_type = ?`
  ).bind(status, eventType).run();
}

// ── Investment TCI Alerts ──────────────────────────────────────────────────────

export async function sendInvestmentTciAlerts(env, { testMode = false } = {}) {
  const cfg = await getConfig(env, 'investment_tci');
  if (!cfg?.webhook_url) return { sent: 0, skipped: 0, reason: 'no webhook configured' };
  if (!testMode && !cfg.enabled) return { sent: 0, skipped: 0, reason: 'disabled' };

  const today = new Date().toISOString().slice(0, 10);

  // Investments expiring in 1–10 days with TCI not yet purchased
  // Days 7–10 → standard reminder; days 1–6 → late warning (bonus will be delayed)
  const { results: investments } = await env.DB.prepare(`
    SELECT i.id, i.torn_user_id, i.discord_id, i.faction_id,
           i.amount, i.end_date, i.tci_purchased,
           u.username AS member_name,
           CAST(julianday(i.end_date) - julianday('now') AS INTEGER) AS days_left
    FROM accounting_investments i
    LEFT JOIN users u ON u.torn_user_id = i.torn_user_id
    WHERE i.is_active = 1 AND i.tci_purchased = 0
      AND julianday(i.end_date) - julianday('now') BETWEEN 1 AND 10
    ORDER BY i.end_date ASC
  `).all();

  const standardTemplate = cfg.message_template      || DEFAULT_TEMPLATES.investment_tci;
  const lateTemplate     = cfg.late_message_template || DEFAULT_TEMPLATES.investment_tci_late;
  const mention          = cfg.mention_user_id ? `<@${cfg.mention_user_id}> ` : '';

  const tci     = await getTciPrice(env);
  const tciCost = tci ? fmtMoney(tci.price * tci.requirement) : '—';
  const tciPx   = tci ? `$${tci.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

  let sent = 0, skipped = 0;

  for (const inv of investments) {
    const days     = inv.days_left;
    const isLate   = days < 7;
    const eventKey = `tci_${inv.id}_${days}_${today}`;

    if (!testMode && await alreadySent(env, 'investment_tci', eventKey)) { skipped++; continue; }

    const memberMention = inv.discord_id ? `<@${inv.discord_id}> ` : '';
    const template      = isLate ? lateTemplate : standardTemplate;

    const body = applyTemplate(template, {
      mention,
      member_mention: memberMention,
      member_name:    inv.member_name ?? `User ${inv.torn_user_id}`,
      days_left:      days,
      days_plural:    days === 1 ? '' : 's',
      end_date:       inv.end_date,
      amount:         fmtMoney(inv.amount),
      faction_name:   FACTION_NAMES[inv.faction_id] ?? `Faction ${inv.faction_id}`,
      last_day_note:  days === 7 ? '\n🚨 **This is the last day to buy TCI in time!**' : '',
      tci_cost:       tciCost,
      tci_price:      tciPx,
    });

    const content = testMode ? `-# 🧪 TEST MESSAGE — not recorded, dedup skipped\n${body}` : body;

    try {
      await sendDiscordMessage(cfg.webhook_url, content);
      if (!testMode) await markSent(env, 'investment_tci', eventKey);
      sent++;
      if (testMode) break; // only send first match in test mode
    } catch (e) {
      console.error(`[webhook:tci] Failed for investment ${inv.id}:`, e.message);
      if (!testMode) await setStatus(env, 'investment_tci', `Error: ${e.message}`);
      return { sent, skipped, error: e.message };
    }
  }

  if (!testMode) {
    const status = investments.length === 0
      ? 'No alerts needed'
      : `Sent ${sent}, skipped ${skipped} (already sent today)`;
    await setStatus(env, 'investment_tci', status);
    console.log(`[webhook:tci] ${status}`);
  }
  return { sent, skipped };
}

// ── Stock Monthly Payouts ──────────────────────────────────────────────────────

export async function sendStockMonthlyPayouts(env, { testMode = false } = {}) {
  const cfg = await getConfig(env, 'stock_monthly');
  if (!cfg?.webhook_url) return { sent: false, reason: 'no webhook configured' };
  if (!testMode && !cfg.enabled) return { sent: false, reason: 'disabled' };

  const now      = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const eventKey = `stock_monthly_${monthKey}`;

  if (!testMode && await alreadySent(env, 'stock_monthly', eventKey)) {
    return { sent: false, reason: 'already sent for this month' };
  }

  const { results: stocks } = await env.DB.prepare(`
    SELECT s.torn_user_id, s.discord_id, s.stock_acronym, s.tier,
           s.payout_frequency, s.member_keeps_amount,
           u.username AS member_name
    FROM accounting_stocks s
    LEFT JOIN users u ON u.torn_user_id = s.torn_user_id
    WHERE s.is_active = 1
    ORDER BY u.username ASC, s.stock_acronym ASC
  `).all();

  if (!stocks.length) {
    await setStatus(env, 'stock_monthly', 'No active stocks tracked');
    return { sent: false, reason: 'no stocks' };
  }

  // Group by member
  const byMember = {};
  for (const s of stocks) {
    const key = s.torn_user_id;
    if (!byMember[key]) {
      byMember[key] = {
        name:       s.member_name ?? `User ${s.torn_user_id}`,
        discord_id: s.discord_id,
        total:      0,
        entries:    [],
      };
    }
    const monthly = (s.member_keeps_amount ?? 0) * (s.tier ?? 1) * payoutsPerMonth(s.payout_frequency);
    byMember[key].total += monthly;
    byMember[key].entries.push(`${s.stock_acronym} T${s.tier ?? 1}`);
  }

  const members = Object.values(byMember).sort((a, b) => b.total - a.total);
  const grandTotal = members.reduce((s, m) => s + m.total, 0);

  const rowTemplate = cfg.payout_row_template || '• {member_mention}**{member_name}** — {amount} ({stocks})';
  const payoutList  = members.map(m => {
    const memberMention = m.discord_id ? `<@${m.discord_id}> ` : '';
    return applyTemplate(rowTemplate, {
      member_mention: memberMention,
      member_name:    m.name,
      amount:         fmtMoney(m.total),
      stocks:         m.entries.join(', '),
    });
  }).join('\n');

  const globalMention = cfg.mention_user_id ? `<@${cfg.mention_user_id}> ` : '';
  const template = cfg.message_template || DEFAULT_TEMPLATES.stock_monthly;

  const content = applyTemplate(template, {
    mention:      globalMention,
    month:        MONTH_NAMES[now.getUTCMonth()],
    year:         now.getUTCFullYear(),
    payout_list:  payoutList,
    total:        fmtMoney(grandTotal),
  });

  const finalContent = testMode ? `-# 🧪 TEST MESSAGE — not recorded, dedup skipped\n${content}` : content;

  try {
    await sendDiscordMessage(cfg.webhook_url, finalContent);
    if (!testMode) {
      await markSent(env, 'stock_monthly', eventKey);
      const status = `Sent for ${monthKey} — ${members.length} members, ${fmtMoney(grandTotal)} total`;
      await setStatus(env, 'stock_monthly', status);
      console.log(`[webhook:stock_monthly] ${status}`);
    }
    return { sent: true, members: members.length, total: grandTotal };
  } catch (e) {
    console.error('[webhook:stock_monthly] Failed:', e.message);
    if (!testMode) await setStatus(env, 'stock_monthly', `Error: ${e.message}`);
    return { sent: false, error: e.message };
  }
}

// ── Armory Low Stock (stubbed — pending armory config page) ───────────────────

export async function sendArmoryLowStockAlerts(env) {
  const cfg = await getConfig(env, 'armory_low');
  if (!cfg?.enabled || !cfg.webhook_url) return { sent: false, reason: 'disabled or no webhook' };
  // Logic implemented after armory config page is built
  console.log('[webhook:armory] armory threshold config not yet set up — skipping');
  return { sent: false, reason: 'armory thresholds not configured' };
}

// ── CRUD routes ────────────────────────────────────────────────────────────────

export async function getWebhookConfigs(request, env, user) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT * FROM webhook_configs ORDER BY event_type`
    ).all();
    return jsonResponse({ configs: results });
  } catch (e) {
    return errorResponse('Failed to fetch webhook configs: ' + e.message, 500);
  }
}

export async function upsertWebhookConfig(request, env, user) {
  try {
    const { event_type, webhook_url, mention_user_id, message_template, late_message_template, payout_row_template, enabled } = await request.json();
    if (!event_type) return errorResponse('event_type required', 400);

    await env.DB.prepare(`
      INSERT INTO webhook_configs (event_type, webhook_url, mention_user_id, message_template, late_message_template, payout_row_template, enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(event_type) DO UPDATE SET
        webhook_url           = excluded.webhook_url,
        mention_user_id       = excluded.mention_user_id,
        message_template      = excluded.message_template,
        late_message_template = excluded.late_message_template,
        payout_row_template   = excluded.payout_row_template,
        enabled               = excluded.enabled,
        updated_at            = CURRENT_TIMESTAMP
    `).bind(
      event_type,
      webhook_url           ?? '',
      mention_user_id       || null,
      message_template      || null,
      late_message_template || null,
      payout_row_template   || null,
      enabled ? 1 : 0,
    ).run();

    const updated = await getConfig(env, event_type);
    return jsonResponse({ success: true, config: updated });
  } catch (e) {
    return errorResponse('Failed to save webhook config: ' + e.message, 500);
  }
}

export async function triggerWebhook(request, env, user) {
  try {
    const url       = new URL(request.url);
    const eventType = url.pathname.split('/').at(-2); // /api/admin/webhooks/:event_type/trigger

    switch (eventType) {
      case 'investment_tci':   return jsonResponse(await sendInvestmentTciAlerts(env));
      case 'stock_monthly':    return jsonResponse(await sendStockMonthlyPayouts(env));
      case 'armory_low':       return jsonResponse(await sendArmoryLowStockAlerts(env));
      default: return errorResponse(`Unknown event type: ${eventType}`, 400);
    }
  } catch (e) {
    return errorResponse('Webhook trigger failed: ' + e.message, 500);
  }
}

export async function sendTestMessage(request, env, user) {
  try {
    const url       = new URL(request.url);
    const eventType = url.pathname.split('/').at(-2);

    const cfg = await getConfig(env, eventType);
    if (!cfg?.webhook_url) return errorResponse('No webhook URL configured', 400);

    let result;
    switch (eventType) {
      case 'investment_tci':
        result = await sendInvestmentTciAlerts(env, { testMode: true });
        if (result.sent === 0 && !result.error) {
          // No qualifying investments — send a fallback notice
          await sendDiscordMessage(cfg.webhook_url,
            `-# 🧪 TEST MESSAGE — not recorded, dedup skipped\nNo active investments found within the 1–10 day window, but the webhook is connected.`
          );
          result = { sent: 1, note: 'no qualifying investments; sent connection notice' };
        }
        break;
      case 'stock_monthly':
        result = await sendStockMonthlyPayouts(env, { testMode: true });
        if (!result.sent && !result.error) {
          await sendDiscordMessage(cfg.webhook_url,
            `-# 🧪 TEST MESSAGE — not recorded, dedup skipped\nNo active stock investments tracked, but the webhook is connected.`
          );
          result = { sent: true, note: 'no stocks; sent connection notice' };
        }
        break;
      case 'armory_low':
        await sendDiscordMessage(cfg.webhook_url,
          `-# 🧪 TEST MESSAGE — not recorded, dedup skipped\nArmory webhook is connected. Alert logic will be active once armory thresholds are configured.`
        );
        result = { sent: true };
        break;
      default:
        return errorResponse(`Unknown event type: ${eventType}`, 400);
    }

    if (result.error) return errorResponse(result.error, 500);
    return jsonResponse({ success: true, ...result });
  } catch (e) {
    return errorResponse('Test failed: ' + e.message, 500);
  }
}
