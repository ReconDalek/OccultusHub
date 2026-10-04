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

  investment_ended: [
    '{mention}{member_mention}',
    '💰 **Bank Investment Matured**',
    '**{member_name}**\'s investment ended on **{end_date}**.',
    '> Principal (**{principal}**) is assumed reinvested — not owed back.',
    '> **Owed to faction: {faction_income}** ({member_name} keeps {member_keeps} of {profit} total profit)',
    '{faction_name}',
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

  company_monthly: [
    '🏢 **Monthly Company Payouts — {month} {year}**',
    'The following members owe the faction\'s {cut_pct} company cut for this month:',
    '',
    '{payout_list}',
    '',
    '💰 **Total expected: {total}**',
    '{mention}',
  ].join('\n'),

  armory_low: [
    '🛡️ **Armory Low Stock Alert**',
    '',
    '{faction_sections}',
    '{mention}',
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

// The same Discord webhook gets reused across different destinations over
// time (channels get swapped by hand in Discord), so we can't assume it's
// still pointed wherever it last was — retarget it immediately before every
// send when a channel_id is configured. IMPORTANT: Discord's token-only
// "Modify Webhook with Token" endpoint (PATCH /webhooks/{id}/{token})
// explicitly does NOT accept channel_id — only the bot-authenticated
// "Modify Webhook" endpoint (PATCH /webhooks/{id}, Authorization: Bot ...,
// requires MANAGE_WEBHOOKS on the guild) can move a webhook between
// channels. Using the token-only endpoint here silently failed to move the
// webhook and surfaced as a confusing "Unknown Channel" (10003) on the
// follow-up thread execute call.
async function retargetWebhookChannel(env, webhookUrl, channelId) {
  const webhookId = webhookUrl.match(/\/webhooks\/(\d+)/)?.[1];
  if (!webhookId) throw new Error('Could not parse webhook ID from webhook URL');

  const res = await fetch(`https://discord.com/api/v10/webhooks/${webhookId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel_id: channelId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord webhook retarget failed ${res.status}: ${text.slice(0, 200)}`);
  }
}

// target = { targetMode: 'channel'|'thread', channelId, threadId }
//   'channel': posts into channelId (the webhook's own channel) — if
//              channelId is blank, posts wherever the webhook is CURRENTLY
//              pointed, unchanged from the original single-channel behaviour.
//   'thread':  channelId is the thread's PARENT channel — the webhook must
//              be retargeted there first, since Discord's ?thread_id=
//              execute param only accepts threads under the webhook's own
//              current channel. threadId is the actual forum post/thread.
async function sendDiscordMessage(env, webhookUrl, content, target = {}) {
  await sendDiscordPayload(env, webhookUrl, { content }, target);
}

// Lower-level send: posts any message body (plain content, or a Components V2
// payload). withComponents adds Discord's required ?with_components=true —
// without it, a non-application-owned webhook (one created in Channel Settings
// → Integrations, which is all of ours) silently drops components. Such
// webhooks may only send NON-interactive components, i.e. link buttons
// (style 5) — fine here, they just open a URL. skipRetarget avoids re-PATCHing
// the webhook's channel for the 2nd+ message of a multi-message send.
async function sendDiscordPayload(env, webhookUrl, payload, target = {}, { withComponents = false, skipRetarget = false } = {}) {
  const { targetMode = 'channel', channelId, threadId } = target;

  if (channelId && !skipRetarget) {
    await retargetWebhookChannel(env, webhookUrl, channelId);
  }

  const params = [];
  if (targetMode === 'thread' && threadId) params.push(`thread_id=${threadId}`);
  if (withComponents) params.push('with_components=true');
  const url = params.length ? `${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}${params.join('&')}` : webhookUrl;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'OccultusHub', ...payload }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Discord returned ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
}

function targetFromConfig(cfg) {
  return { targetMode: cfg.target_mode || 'channel', channelId: cfg.channel_id, threadId: cfg.thread_id };
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
           COALESCE(u.username, fm.username) AS member_name,
           CAST(julianday(i.end_date) - julianday('now') AS INTEGER) AS days_left
    FROM accounting_investments i
    LEFT JOIN users u ON u.torn_user_id = i.torn_user_id
    LEFT JOIN faction_members fm ON fm.torn_user_id = i.torn_user_id
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
      await sendDiscordMessage(env, cfg.webhook_url, content, targetFromConfig(cfg));
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

// ── Investment Ended (matured) Alerts ────────────────────────────────────────
// Fires once per investment, the first time its end_date has passed — not
// tied to any TCI purchase state (that's investment_tci's job, a separate
// concern). Dedup key is per-investment-id only (no date component, unlike
// TCI's per-day-remaining key) since this is a one-time "it's over" event,
// not a recurring reminder — once sent, never sent again for that investment
// even if it stays is_active=1 for weeks after maturing.

export async function sendInvestmentEndedAlerts(env, { testMode = false } = {}) {
  const cfg = await getConfig(env, 'investment_ended');
  if (!cfg?.webhook_url) return { sent: 0, skipped: 0, reason: 'no webhook configured' };
  if (!testMode && !cfg.enabled) return { sent: 0, skipped: 0, reason: 'disabled' };

  const { results: investments } = await env.DB.prepare(`
    SELECT i.id, i.torn_user_id, i.discord_id, i.faction_id,
           i.amount, i.rate, i.member_profit_pct, i.end_date,
           COALESCE(u.username, fm.username) AS member_name
    FROM accounting_investments i
    LEFT JOIN users u ON u.torn_user_id = i.torn_user_id
    LEFT JOIN faction_members fm ON fm.torn_user_id = i.torn_user_id
    WHERE i.is_active = 1 AND date(i.end_date) <= date('now')
    ORDER BY i.end_date ASC
  `).all();

  const template = cfg.message_template || DEFAULT_TEMPLATES.investment_ended;
  const mention   = cfg.mention_user_id ? `<@${cfg.mention_user_id}> ` : '';

  let sent = 0, skipped = 0;

  for (const inv of investments) {
    const eventKey = `investment_ended_${inv.id}`;
    if (!testMode && await alreadySent(env, 'investment_ended', eventKey)) { skipped++; continue; }

    // Only the faction's profit share is actually owed at maturity — the
    // principal is assumed reinvested by the member, not returned to vault.
    const profit        = (inv.amount || 0) * ((inv.rate || 0) / 100);
    const memberKeeps    = profit * ((inv.member_profit_pct || 0) / 100);
    const factionIncome  = profit - memberKeeps;

    const memberMention = inv.discord_id ? `<@${inv.discord_id}> ` : '';

    const body = applyTemplate(template, {
      mention,
      member_mention: memberMention,
      member_name:    inv.member_name ?? `User ${inv.torn_user_id}`,
      end_date:       inv.end_date,
      principal:      fmtMoney(inv.amount),
      profit:         fmtMoney(profit),
      member_keeps:   fmtMoney(memberKeeps),
      faction_income: fmtMoney(factionIncome),
      faction_name:   FACTION_NAMES[inv.faction_id] ?? `Faction ${inv.faction_id}`,
    });

    const content = testMode ? `-# 🧪 TEST MESSAGE — not recorded, dedup skipped\n${body}` : body;

    try {
      await sendDiscordMessage(env, cfg.webhook_url, content, targetFromConfig(cfg));
      if (!testMode) await markSent(env, 'investment_ended', eventKey);
      sent++;
      if (testMode) break; // only send first match in test mode
    } catch (e) {
      console.error(`[webhook:investment_ended] Failed for investment ${inv.id}:`, e.message);
      if (!testMode) await setStatus(env, 'investment_ended', `Error: ${e.message}`);
      return { sent, skipped, error: e.message };
    }
  }

  if (!testMode) {
    const status = investments.length === 0
      ? 'No matured investments'
      : `Sent ${sent}, skipped ${skipped} (already sent)`;
    await setStatus(env, 'investment_ended', status);
    console.log(`[webhook:investment_ended] ${status}`);
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
           COALESCE(u.username, fm.username) AS member_name
    FROM accounting_stocks s
    LEFT JOIN users u ON u.torn_user_id = s.torn_user_id
    LEFT JOIN faction_members fm ON fm.torn_user_id = s.torn_user_id
    WHERE s.is_active = 1
    ORDER BY member_name ASC, s.stock_acronym ASC
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
    await sendDiscordMessage(env, cfg.webhook_url, finalContent, targetFromConfig(cfg));
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

// ── Company Monthly Payouts ───────────────────────────────────────────────────
// Company equivalent of stock_monthly: on the 1st, lists what each company
// director owes the faction — the 30% faction cut (company_profit_snapshots.
// faction_cut, summed) of the month that just ENDED, grouped per director,
// skipping companies already marked collected for that month (company_payouts).
// Each member row carries a Torn "add money" link with a NEGATIVE amount, which
// takes the money from the member's faction balance into the faction.
//
// Sent as a Discord Components V2 message: a Container of Sections, each with
// the member's text and a link-button accessory. Falls back to a plain-text
// message with masked links if Discord rejects the components payload.

const COMPANY_CUT_LABEL = '30%';
const COMPANY_ROWS_PER_MESSAGE = 10; // V2 caps a message at 40 components; 5 fixed + 3 per row
// {member}: the Discord ping when we have their ID (Discord already renders it
// as their name), otherwise their bold Torn name — never both.
const DEFAULT_COMPANY_ROW_TEMPLATE = '{member} — {amount} ({companies})';
const IS_COMPONENTS_V2 = 1 << 15;

function companyPayLink(tornUserId, amount) {
  return `https://www.torn.com/factions.php?step=your#/tab=controls&addMoneyTo=${tornUserId}&money=-${Math.round(amount)}`;
}

// Reports the month BEFORE `now` (run on the 1st → the month that just ended).
async function buildCompanyMonthlyData(env, now = new Date()) {
  const prev  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const year  = prev.getUTCFullYear();
  const month = prev.getUTCMonth() + 1;
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd   = `${year}-${String(month).padStart(2, '0')}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;

  const { results } = await env.DB.prepare(`
    SELECT c.company_id, c.name, c.director_id, c.director_name, c.faction_id,
           SUM(s.faction_cut) AS cut,
           -- Linked Discord account first, then any Discord ID leadership typed
           -- onto that member's stock/investment records.
           COALESCE(
             (SELECT dl.discord_id FROM users u JOIN discord_links dl ON dl.user_id = u.id
               WHERE u.torn_user_id = c.director_id LIMIT 1),
             (SELECT discord_id FROM accounting_stocks
               WHERE torn_user_id = c.director_id AND discord_id IS NOT NULL AND discord_id != '' LIMIT 1),
             (SELECT discord_id FROM accounting_investments
               WHERE torn_user_id = c.director_id AND discord_id IS NOT NULL AND discord_id != '' LIMIT 1)
           ) AS discord_id
    FROM company_profit_cache c
    JOIN company_profit_snapshots s ON s.company_id = c.company_id
     AND s.snapshot_date >= ? AND s.snapshot_date <= ?
    LEFT JOIN company_payouts p ON p.company_id = c.company_id AND p.year = ? AND p.month = ?
    WHERE c.director_id > 0 AND COALESCE(p.paid, 0) = 0
    GROUP BY c.company_id
    HAVING cut > 0
    ORDER BY c.name ASC
  `).bind(monthStart, monthEnd, year, month).all();

  const byDirector = {};
  for (const r of results || []) {
    const m = (byDirector[r.director_id] ??= {
      torn_user_id: r.director_id,
      name:         r.director_name ?? `User ${r.director_id}`,
      discord_id:   r.discord_id,
      faction_id:   r.faction_id,
      total:        0,
      companies:    [],
    });
    m.total += r.cut || 0;
    m.companies.push(r.name);
  }
  const members = Object.values(byDirector)
    .map(m => ({ ...m, total: Math.round(m.total) }))
    .sort((a, b) => b.total - a.total);
  const grandTotal = members.reduce((s, m) => s + m.total, 0);
  return { year, month, monthKey: `${year}-${String(month).padStart(2, '0')}`, members, grandTotal };
}

function companyRowText(rowTemplate, m) {
  return applyTemplate(rowTemplate, {
    member:         m.discord_id ? `<@${m.discord_id}>` : `**${m.name}**`,
    member_mention: m.discord_id ? `<@${m.discord_id}> ` : '',
    member_name:    m.name,
    amount:         fmtMoney(m.total),
    companies:      m.companies.join(', '),
    faction_name:   FACTION_NAMES[m.faction_id] ?? `Faction ${m.faction_id}`,
  });
}

// Splits the message template around {payout_list} so the text before it
// becomes the header and the text after it the footer of the V2 container.
function companyMessageParts(cfg, data) {
  const template = cfg.message_template || DEFAULT_TEMPLATES.company_monthly;
  const vars = {
    mention: cfg.mention_user_id ? `<@${cfg.mention_user_id}>` : '',
    month:   MONTH_NAMES[data.month - 1],
    year:    data.year,
    total:   fmtMoney(data.grandTotal),
    cut_pct: COMPANY_CUT_LABEL,
  };
  const [before, after = ''] = template.split('{payout_list}');
  return {
    header: applyTemplate(before, vars).trim(),
    footer: applyTemplate(after, vars).trim(),
    full:   (rows) => applyTemplate(template, { ...vars, payout_list: rows }),
  };
}

// One or more Components V2 payloads — header on the first, footer on the last.
function buildCompanyV2Payloads(cfg, data, { testMode = false } = {}) {
  const { header, footer } = companyMessageParts(cfg, data);
  const rowTemplate = cfg.payout_row_template || DEFAULT_COMPANY_ROW_TEMPLATE;
  const chunks = [];
  for (let i = 0; i < data.members.length; i += COMPANY_ROWS_PER_MESSAGE) chunks.push(data.members.slice(i, i + COMPANY_ROWS_PER_MESSAGE));

  return chunks.map((chunk, ci) => {
    const inner = [];
    if (ci === 0) {
      if (testMode) inner.push({ type: 10, content: '-# 🧪 TEST MESSAGE — not recorded, dedup skipped' });
      if (header) inner.push({ type: 10, content: header });
      inner.push({ type: 14, divider: true, spacing: 1 });
    }
    for (const m of chunk) {
      inner.push({
        type: 9,
        components: [{ type: 10, content: companyRowText(rowTemplate, m) }],
        accessory: { type: 2, style: 5, label: `Pay ${fmtMoney(m.total)}`.slice(0, 80), url: companyPayLink(m.torn_user_id, m.total) },
      });
    }
    if (ci === chunks.length - 1 && footer) {
      inner.push({ type: 14, divider: true, spacing: 1 });
      inner.push({ type: 10, content: footer });
    }
    return {
      flags: IS_COMPONENTS_V2,
      allowed_mentions: { parse: ['users'] },
      components: [{ type: 17, accent_color: 0xa78bfa, components: inner }],
    };
  });
}

// Plain-text equivalent (fallback + admin preview) — masked pay links per row.
function buildCompanyTextContent(cfg, data, { testMode = false } = {}) {
  const rowTemplate = cfg.payout_row_template || DEFAULT_COMPANY_ROW_TEMPLATE;
  const rows = data.members
    .map(m => `> • ${companyRowText(rowTemplate, m)} · [Pay ↗](<${companyPayLink(m.torn_user_id, m.total)}>)`)
    .join('\n');
  const body = companyMessageParts(cfg, data).full(rows);
  return testMode ? `-# 🧪 TEST MESSAGE — not recorded, dedup skipped\n${body}` : body;
}

export async function sendCompanyMonthlyPayouts(env, { testMode = false } = {}) {
  const cfg = await getConfig(env, 'company_monthly');
  if (!cfg?.webhook_url) return { sent: false, reason: 'no webhook configured' };
  if (!testMode && !cfg.enabled) return { sent: false, reason: 'disabled' };

  const data = await buildCompanyMonthlyData(env);
  const eventKey = `company_monthly_${data.monthKey}`;

  if (!testMode && await alreadySent(env, 'company_monthly', eventKey)) {
    return { sent: false, reason: `already sent for ${data.monthKey}` };
  }
  if (!data.members.length) {
    if (!testMode) await setStatus(env, 'company_monthly', `Nothing owed for ${data.monthKey} (no uncollected company cut)`);
    return { sent: false, reason: 'nothing owed' };
  }

  const target = targetFromConfig(cfg);
  let mode = 'components';
  try {
    const payloads = buildCompanyV2Payloads(cfg, data, { testMode });
    for (let i = 0; i < payloads.length; i++) {
      await sendDiscordPayload(env, cfg.webhook_url, payloads[i], target, { withComponents: true, skipRetarget: i > 0 });
    }
  } catch (e) {
    // Discord rejected the V2 payload (4xx) — post the plain-text version
    // instead so the reminder still goes out. Anything else is a real failure.
    if (!(e.status >= 400 && e.status < 500)) {
      console.error('[webhook:company_monthly] Failed:', e.message);
      if (!testMode) await setStatus(env, 'company_monthly', `Error: ${e.message}`);
      return { sent: false, error: e.message };
    }
    console.warn('[webhook:company_monthly] components rejected, falling back to text:', e.message);
    mode = 'text';
    try {
      await sendDiscordMessage(env, cfg.webhook_url, buildCompanyTextContent(cfg, data, { testMode }), target);
    } catch (e2) {
      console.error('[webhook:company_monthly] Text fallback failed:', e2.message);
      if (!testMode) await setStatus(env, 'company_monthly', `Error: ${e2.message}`);
      return { sent: false, error: e2.message };
    }
  }

  if (!testMode) {
    await markSent(env, 'company_monthly', eventKey);
    const status = `Sent for ${data.monthKey} — ${data.members.length} members, ${fmtMoney(data.grandTotal)} total${mode === 'text' ? ' (text fallback)' : ''}`;
    await setStatus(env, 'company_monthly', status);
    console.log(`[webhook:company_monthly] ${status}`);
  }
  return { sent: true, members: data.members.length, total: data.grandTotal, mode };
}

// ── Armory Low Stock ──────────────────────────────────────────────────────────

const ARMORY_FACTION_ORDER = [
  { id: 33097, name: 'Occultus',  col: 'min_33097' },
  { id: 9728,  name: 'Occul2us', col: 'min_9728'  },
  { id: 9171,  name: 'Occul3us', col: 'min_9171'  },
];

export async function sendArmoryLowStockAlerts(env, { testMode = false } = {}) {
  const cfg = await getConfig(env, 'armory_low');
  if (!cfg?.webhook_url) return { sent: 0, reason: 'no webhook configured' };
  if (!testMode && !cfg.enabled) return { sent: 0, reason: 'disabled' };

  const today    = new Date().toISOString().slice(0, 10);
  const eventKey = `armory_low_${today}`;

  if (!testMode && await alreadySent(env, 'armory_low', eventKey)) {
    return { sent: 0, reason: 'already sent today' };
  }

  // Load minimums
  const { results: minimums } = await env.DB.prepare(
    `SELECT item_id, item_name, category, min_33097, min_9171, min_9728 FROM armory_minimums`
  ).all();
  if (!minimums.length) {
    console.log('[webhook:armory] no minimums configured — skipping');
    return { sent: 0, reason: 'no minimums configured' };
  }

  const minMap = {};
  for (const m of minimums) minMap[m.item_id] = m;

  // Load armory cache
  const { results: cacheRows } = await env.DB.prepare(
    `SELECT faction_id, data FROM armory_cache`
  ).all();
  if (!cacheRows.length) return { sent: 0, reason: 'no armory cache' };

  const armoryByFaction = {};
  for (const row of cacheRows) {
    armoryByFaction[row.faction_id] = JSON.parse(row.data);
  }

  // Build one section per faction that has low items.
  // Iterate minimums (not armory items) so items with 0 or missing qty are caught.
  const factionSections = [];
  for (const faction of ARMORY_FACTION_ORDER) {
    const factionData = armoryByFaction[faction.id] || {};

    // Build qty lookup for this faction: item_id → quantity
    const qtyMap = {};
    for (const [, items] of Object.entries(factionData)) {
      if (!Array.isArray(items)) continue;
      for (const item of items) qtyMap[item.ID] = item.quantity ?? 0;
    }

    const lowItems = [];
    for (const min of minimums) {
      const threshold = min[faction.col];
      if (!threshold) continue;
      const qty = qtyMap[min.item_id] ?? 0; // 0 if not in armory at all
      if (qty < threshold) {
        lowItems.push({ name: min.item_name, qty, min: threshold });
      }
    }

    if (!lowItems.length) continue;
    lowItems.sort((a, b) => a.name.localeCompare(b.name));

    const itemLines = lowItems.map(i => `> • ${i.name} — ${i.qty}/${i.min}`).join('\n');
    factionSections.push(`**${faction.name}:**\n${itemLines}`);
  }

  if (!factionSections.length) {
    if (!testMode) await setStatus(env, 'armory_low', 'No low stock items');
    return { sent: 0, reason: 'no low stock items' };
  }

  const mention  = cfg.mention_user_id ? `<@${cfg.mention_user_id}>` : '';
  const template = cfg.message_template || DEFAULT_TEMPLATES.armory_low;

  const body = applyTemplate(template, {
    mention,
    faction_sections: factionSections.join('\n\n'),
  });

  const content = testMode ? `-# 🧪 TEST MESSAGE — not recorded, dedup skipped\n${body}` : body;

  try {
    await sendDiscordMessage(env, cfg.webhook_url, content, targetFromConfig(cfg));
    if (!testMode) {
      await markSent(env, 'armory_low', eventKey);
      const status = `Sent — ${factionSections.length} faction section${factionSections.length !== 1 ? 's' : ''}`;
      await setStatus(env, 'armory_low', status);
      console.log(`[webhook:armory] ${status}`);
    }
    return { sent: 1, factions: factionSections.length };
  } catch (e) {
    console.error('[webhook:armory] failed:', e.message);
    if (!testMode) await setStatus(env, 'armory_low', `Error: ${e.message}`);
    return { sent: 0, error: e.message };
  }
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
    const { event_type, webhook_url, mention_user_id, message_template, late_message_template, payout_row_template, enabled, target_mode, channel_id, thread_id } = await request.json();
    if (!event_type) return errorResponse('event_type required', 400);
    if (target_mode && !['channel', 'thread'].includes(target_mode)) return errorResponse('target_mode must be "channel" or "thread"', 400);

    await env.DB.prepare(`
      INSERT INTO webhook_configs (event_type, webhook_url, mention_user_id, message_template, late_message_template, payout_row_template, enabled, target_mode, channel_id, thread_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(event_type) DO UPDATE SET
        webhook_url           = excluded.webhook_url,
        mention_user_id       = excluded.mention_user_id,
        message_template      = excluded.message_template,
        late_message_template = excluded.late_message_template,
        payout_row_template   = excluded.payout_row_template,
        enabled               = excluded.enabled,
        target_mode           = excluded.target_mode,
        channel_id            = excluded.channel_id,
        thread_id             = excluded.thread_id,
        updated_at            = CURRENT_TIMESTAMP
    `).bind(
      event_type,
      webhook_url           ?? '',
      mention_user_id       || null,
      message_template      || null,
      late_message_template || null,
      payout_row_template   || null,
      enabled ? 1 : 0,
      target_mode           || 'channel',
      channel_id            || null,
      thread_id             || null,
    ).run();

    const updated = await getConfig(env, event_type);
    return jsonResponse({ success: true, config: updated });
  } catch (e) {
    return errorResponse('Failed to save webhook config: ' + e.message, 500);
  }
}

// ── Preview (build content, return to browser, never send) ───────────────────

export async function previewWebhook(request, env, user) {
  try {
    const url       = new URL(request.url);
    const eventType = url.pathname.split('/').at(-2);

    const cfg = await getConfig(env, eventType);
    if (!cfg?.webhook_url) return errorResponse('No webhook URL configured', 400);

    const messages = []; // collect content strings instead of sending

    // Patch sendDiscordMessage locally by monkey-patching the env object with a capture flag.
    // Simpler: rebuild message content inline for each event type.

    if (eventType === 'investment_tci') {
      const { results: investments } = await env.DB.prepare(`
        SELECT i.id, i.torn_user_id, i.discord_id, i.faction_id,
               i.amount, i.end_date, i.tci_purchased,
               COALESCE(u.username, fm.username) AS member_name,
               CAST(julianday(i.end_date) - julianday('now') AS INTEGER) AS days_left
        FROM accounting_investments i
        LEFT JOIN users u ON u.torn_user_id = i.torn_user_id
        LEFT JOIN faction_members fm ON fm.torn_user_id = i.torn_user_id
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

      if (!investments.length) {
        messages.push({ label: 'No qualifying investments', content: 'No active investments found within the 1–10 day window.' });
      }
      for (const inv of investments) {
        const days     = inv.days_left;
        const isLate   = days < 7;
        const template = isLate ? lateTemplate : standardTemplate;
        const body = applyTemplate(template, {
          mention,
          member_mention: inv.discord_id ? `<@${inv.discord_id}> ` : '',
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
        messages.push({ label: `${inv.member_name ?? `User ${inv.torn_user_id}`} — ${days} day${days === 1 ? '' : 's'} left`, content: body });
      }

    } else if (eventType === 'investment_ended') {
      const { results: investments } = await env.DB.prepare(`
        SELECT i.id, i.torn_user_id, i.discord_id, i.faction_id,
               i.amount, i.rate, i.member_profit_pct, i.end_date,
               COALESCE(u.username, fm.username) AS member_name
        FROM accounting_investments i
        LEFT JOIN users u ON u.torn_user_id = i.torn_user_id
        LEFT JOIN faction_members fm ON fm.torn_user_id = i.torn_user_id
        WHERE i.is_active = 1 AND date(i.end_date) <= date('now')
        ORDER BY i.end_date ASC
      `).all();

      const template = cfg.message_template || DEFAULT_TEMPLATES.investment_ended;
      const mention  = cfg.mention_user_id ? `<@${cfg.mention_user_id}> ` : '';

      if (!investments.length) {
        messages.push({ label: 'No matured investments', content: 'No active investments have passed their end date.' });
      }
      for (const inv of investments) {
        const profit       = (inv.amount || 0) * ((inv.rate || 0) / 100);
        const memberKeeps  = profit * ((inv.member_profit_pct || 0) / 100);
        const factionIncome = profit - memberKeeps;
        const body = applyTemplate(template, {
          mention,
          member_mention: inv.discord_id ? `<@${inv.discord_id}> ` : '',
          member_name:    inv.member_name ?? `User ${inv.torn_user_id}`,
          end_date:       inv.end_date,
          principal:      fmtMoney(inv.amount),
          profit:         fmtMoney(profit),
          member_keeps:   fmtMoney(memberKeeps),
          faction_income: fmtMoney(factionIncome),
          faction_name:   FACTION_NAMES[inv.faction_id] ?? `Faction ${inv.faction_id}`,
        });
        messages.push({ label: `${inv.member_name ?? `User ${inv.torn_user_id}`} — ended ${inv.end_date}`, content: body });
      }

    } else if (eventType === 'stock_monthly') {
      const now = new Date();
      const { results: stocks } = await env.DB.prepare(`
        SELECT s.torn_user_id, s.discord_id, s.stock_acronym, s.tier,
               s.payout_frequency, s.member_keeps_amount,
               COALESCE(u.username, fm.username) AS member_name
        FROM accounting_stocks s
        LEFT JOIN users u ON u.torn_user_id = s.torn_user_id
        LEFT JOIN faction_members fm ON fm.torn_user_id = s.torn_user_id
        WHERE s.is_active = 1
        ORDER BY member_name ASC, s.stock_acronym ASC
      `).all();

      if (!stocks.length) {
        messages.push({ label: 'No data', content: 'No active stock investments tracked.' });
      } else {
        const byMember = {};
        for (const s of stocks) {
          if (!byMember[s.torn_user_id]) byMember[s.torn_user_id] = { name: s.member_name ?? `User ${s.torn_user_id}`, discord_id: s.discord_id, total: 0, entries: [] };
          byMember[s.torn_user_id].total += (s.member_keeps_amount ?? 0) * (s.tier ?? 1) * payoutsPerMonth(s.payout_frequency);
          byMember[s.torn_user_id].entries.push(`${s.stock_acronym} T${s.tier ?? 1}`);
        }
        const members    = Object.values(byMember).sort((a, b) => b.total - a.total);
        const grandTotal = members.reduce((s, m) => s + m.total, 0);
        const rowTemplate = cfg.payout_row_template || '• {member_mention}**{member_name}** — {amount} ({stocks})';
        const payoutList  = members.map(m => applyTemplate(rowTemplate, {
          member_mention: m.discord_id ? `<@${m.discord_id}> ` : '',
          member_name: m.name, amount: fmtMoney(m.total), stocks: m.entries.join(', '),
        })).join('\n');
        const content = applyTemplate(cfg.message_template || DEFAULT_TEMPLATES.stock_monthly, {
          mention: cfg.mention_user_id ? `<@${cfg.mention_user_id}> ` : '',
          month: MONTH_NAMES[now.getUTCMonth()], year: now.getUTCFullYear(),
          payout_list: payoutList, total: fmtMoney(grandTotal),
        });
        messages.push({ label: `${MONTH_NAMES[now.getUTCMonth()]} ${now.getUTCFullYear()} — ${members.length} members`, content });
      }

    } else if (eventType === 'company_monthly') {
      const data = await buildCompanyMonthlyData(env);
      if (!data.members.length) {
        messages.push({ label: 'Nothing owed', content: `No uncollected company cut for ${MONTH_NAMES[data.month - 1]} ${data.year}.` });
      } else {
        // Text rendering of the V2 message — each "[Pay ↗](<url>)" is a link button in Discord.
        messages.push({
          label: `${MONTH_NAMES[data.month - 1]} ${data.year} — ${data.members.length} members (Pay links render as buttons in Discord)`,
          content: buildCompanyTextContent(cfg, data),
        });
      }

    } else if (eventType === 'armory_low') {
      const { results: minimums } = await env.DB.prepare(
        `SELECT item_id, item_name, category, min_33097, min_9171, min_9728 FROM armory_minimums`
      ).all();
      const { results: cacheRows } = await env.DB.prepare(`SELECT faction_id, data FROM armory_cache`).all();

      if (!minimums.length || !cacheRows.length) {
        messages.push({ label: 'No data', content: 'No minimums configured or no armory cache available.' });
      } else {
        const minMap = {};
        for (const m of minimums) minMap[m.item_id] = m;
        const armoryByFaction = {};
        for (const row of cacheRows) armoryByFaction[row.faction_id] = JSON.parse(row.data);

        const factionSections = [];
        for (const faction of ARMORY_FACTION_ORDER) {
          const factionData = armoryByFaction[faction.id] || {};
          const qtyMap = {};
          for (const [, items] of Object.entries(factionData)) {
            if (!Array.isArray(items)) continue;
            for (const item of items) qtyMap[item.ID] = item.quantity ?? 0;
          }
          const lowItems = minimums
            .filter(m => m[faction.col] && (qtyMap[m.item_id] ?? 0) < m[faction.col])
            .map(m => ({ name: m.item_name, qty: qtyMap[m.item_id] ?? 0, min: m[faction.col] }))
            .sort((a, b) => a.name.localeCompare(b.name));
          if (lowItems.length) {
            factionSections.push(`**${faction.name}:**\n${lowItems.map(i => `> • ${i.name} — ${i.qty}/${i.min}`).join('\n')}`);
          }
        }

        if (!factionSections.length) {
          messages.push({ label: 'All stocked', content: 'No items are currently below their configured minimums.' });
        } else {
          const content = applyTemplate(cfg.message_template || DEFAULT_TEMPLATES.armory_low, {
            mention: cfg.mention_user_id ? `<@${cfg.mention_user_id}>` : '',
            faction_sections: factionSections.join('\n\n'),
          });
          messages.push({ label: `${factionSections.length} faction section${factionSections.length !== 1 ? 's' : ''}`, content });
        }
      }

    } else {
      return errorResponse(`Unknown event type: ${eventType}`, 400);
    }

    return jsonResponse({ messages });
  } catch (e) {
    return errorResponse('Preview failed: ' + e.message, 500);
  }
}

export async function triggerWebhook(request, env, user) {
  try {
    const url       = new URL(request.url);
    const eventType = url.pathname.split('/').at(-2); // /api/admin/webhooks/:event_type/trigger

    switch (eventType) {
      case 'investment_tci':   return jsonResponse(await sendInvestmentTciAlerts(env));
      case 'investment_ended': return jsonResponse(await sendInvestmentEndedAlerts(env));
      case 'stock_monthly':    return jsonResponse(await sendStockMonthlyPayouts(env));
      case 'company_monthly':  return jsonResponse(await sendCompanyMonthlyPayouts(env));
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
          await sendDiscordMessage(env, cfg.webhook_url,
            `-# 🧪 TEST MESSAGE — not recorded, dedup skipped\nNo active investments found within the 1–10 day window, but the webhook is connected.`,
            targetFromConfig(cfg)
          );
          result = { sent: 1, note: 'no qualifying investments; sent connection notice' };
        }
        break;
      case 'investment_ended':
        result = await sendInvestmentEndedAlerts(env, { testMode: true });
        if (result.sent === 0 && !result.error) {
          await sendDiscordMessage(env, cfg.webhook_url,
            `-# 🧪 TEST MESSAGE — not recorded, dedup skipped\nNo matured investments found, but the webhook is connected.`,
            targetFromConfig(cfg)
          );
          result = { sent: 1, note: 'no matured investments; sent connection notice' };
        }
        break;
      case 'stock_monthly':
        result = await sendStockMonthlyPayouts(env, { testMode: true });
        if (!result.sent && !result.error) {
          await sendDiscordMessage(env, cfg.webhook_url,
            `-# 🧪 TEST MESSAGE — not recorded, dedup skipped\nNo active stock investments tracked, but the webhook is connected.`,
            targetFromConfig(cfg)
          );
          result = { sent: true, note: 'no stocks; sent connection notice' };
        }
        break;
      case 'company_monthly':
        result = await sendCompanyMonthlyPayouts(env, { testMode: true });
        if (!result.sent && !result.error) {
          await sendDiscordMessage(env, cfg.webhook_url,
            `-# 🧪 TEST MESSAGE — not recorded, dedup skipped\nNo uncollected company cut for last month, but the webhook is connected.`,
            targetFromConfig(cfg)
          );
          result = { sent: true, note: 'nothing owed; sent connection notice' };
        }
        break;
      case 'armory_low':
        result = await sendArmoryLowStockAlerts(env, { testMode: true });
        if (result.sent === 0 && !result.error) {
          await sendDiscordMessage(env, cfg.webhook_url,
            `-# 🧪 TEST MESSAGE — not recorded, dedup skipped\nNo low-stock items found (or no minimums configured), but the webhook is connected.`,
            targetFromConfig(cfg)
          );
          result = { sent: 1, note: 'no low stock; sent connection notice' };
        }
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
