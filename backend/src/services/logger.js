/**
 * Structured logger — writes to system_logs table.
 *
 * Usage:
 *   import { writeLog } from '../services/logger.js'
 *   await writeLog(env, { category: 'api_call', level: 'info', event: 'torn_energy_snapshot',
 *     message: 'Snapshot taken for faction 33097', faction_id: 33097, meta: { count: 45 } })
 *
 * Never store API key values. Use torn_user_id / username to identify whose key was used.
 */

export async function writeLog(env, {
  category,      // 'api_call' | 'api_error' | 'auth' | 'cron' | 'game' | 'admin' | 'error'
  level = 'info', // 'info' | 'warn' | 'error'
  event,         // short snake_case event name
  message,       // human-readable
  torn_user_id = null,
  username = null,
  faction_id = null,
  meta = null,   // any extra data — will be JSON-stringified
}) {
  try {
    await env.DB.prepare(`
      INSERT INTO system_logs (created_at, category, level, event, message, torn_user_id, username, faction_id, meta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      Math.floor(Date.now() / 1000),
      category,
      level,
      event,
      message,
      torn_user_id,
      username,
      faction_id,
      meta ? JSON.stringify(meta) : null,
    ).run();
  } catch (e) {
    // Never let logging failures crash the caller
    console.error('[logger] failed to write log:', e?.message);
  }
}

// Convenience wrappers
export const logInfo  = (env, opts) => writeLog(env, { level: 'info',  ...opts });
export const logWarn  = (env, opts) => writeLog(env, { level: 'warn',  ...opts });
export const logError = (env, opts) => writeLog(env, { level: 'error', ...opts });
