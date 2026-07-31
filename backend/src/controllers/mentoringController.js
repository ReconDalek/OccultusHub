import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { fetchTornAccountAge } from '../services/tornApiService.js';
import { getWarningsForMember } from './warningsController.js';
import { getEnergyDeltaForUser } from './activityController.js';

// Frozen bracket lookup — account age (days) at the moment a mentee first
// reaches level 15 in Torn, NOT days in faction. Reused by the auto-detect
// cron step and by manual age overrides in updateMentee.
export function getIncentiveAmount(ageDays) {
  if (ageDays == null) return null;
  if (ageDays <= 15) return 10_000_000;
  if (ageDays <= 20) return 7_000_000;
  if (ageDays <= 25) return 5_000_000;
  if (ageDays <= 30) return 2_000_000;
  if (ageDays <= 42) return 1_000_000;
  return null; // 43+ days old at level 15 — not eligible
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartDate() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
function monthEndDate() {
  const now = new Date();
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

// D1 DATETIME strings have no timezone marker — must append 'Z' before
// parsing or JS treats them as local time (see [[backend-architecture]]'s
// "D1 Timestamp Behaviour" note).
function daysElapsedSince(d1Timestamp) {
  const then = new Date(d1Timestamp.replace(' ', 'T') + 'Z').getTime();
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

// Running account age for a mentee who hasn't hit level 15 yet — entered
// once at add-time (account_age_at_added) and counted up daily from there,
// rather than re-fetched from Torn. Frozen into account_age_days_at_level_15
// once level 15 is detected (see checkMentorshipLevel15Crossings).
function currentAccountAgeEstimate(mentee) {
  if (mentee.account_age_at_added == null) return null;
  return mentee.account_age_at_added + daysElapsedSince(mentee.added_at);
}

// Scores an active mentor against an unassigned mentee — higher is better.
// Soft faction preference + timezone closeness + current mentee load.
function scoreMentor(mentor, mentee) {
  const factionScore = mentor.faction_id === mentee.faction_id ? 5 : 0;
  const tzDiff = Math.abs((mentor.timezone_offset ?? 0) - (mentee.timezone_offset ?? 0));
  const loadPenalty = (mentor.active_mentees ?? 0) * 2;
  return factionScore - tzDiff * 0.5 - loadPenalty;
}

// GET /api/leadership/mentoring/overview — leader or mentor, unrestricted read
export async function getMentoringOverview(request, env, user, access) {
  try {
    const [menteesResult, mentorsResult] = await Promise.all([
      env.DB.prepare(`
        SELECT
          me.*,
          fm.level, fm.days_in_faction, fm.joined_at, fm.is_active AS member_is_active,
          fm.faction_id AS current_faction_id,
          mt.username AS mentor_username
        FROM mentees me
        LEFT JOIN faction_members fm ON fm.torn_user_id = me.torn_user_id
        LEFT JOIN mentors mt ON mt.id = me.mentor_id
        ORDER BY me.status ASC, me.added_at DESC
      `).all(),
      env.DB.prepare(`
        SELECT mt.*, COALESCE(counts.active_mentees, 0) AS active_mentees
        FROM mentors mt
        LEFT JOIN (
          SELECT mentor_id, COUNT(*) AS active_mentees
          FROM mentees WHERE status = 'active' AND mentor_id IS NOT NULL
          GROUP BY mentor_id
        ) counts ON counts.mentor_id = mt.id
        ORDER BY mt.is_active DESC, mt.username ASC
      `).all(),
    ]);

    const mentees = menteesResult.results || [];
    const activeMentors = (mentorsResult.results || []).filter(m => m.is_active);

    for (const mentee of mentees) {
      if (mentee.status === 'active' && mentee.level_15_reached_at == null && mentee.level >= 15) {
        const frozen = await freezeLevel15(env, mentee);
        if (frozen) Object.assign(mentee, frozen);
      }
      if (mentee.level_15_reached_at == null) {
        mentee.current_account_age_estimate = currentAccountAgeEstimate(mentee);
        mentee.projected_incentive_amount = getIncentiveAmount(mentee.current_account_age_estimate);
      }
      if (mentee.mentor_id) continue;
      let best = null;
      for (const mentor of activeMentors) {
        const score = scoreMentor(mentor, mentee);
        if (!best || score > best.score) best = { mentor, score };
      }
      if (best) {
        mentee.recommended_mentor_id = best.mentor.id;
        mentee.recommended_mentor_username = best.mentor.username;
      }
    }

    return jsonResponse({ mentees, mentors: mentorsResult.results || [], access });
  } catch (err) {
    console.error('getMentoringOverview error:', err);
    return errorResponse('Failed to fetch mentoring overview', 500);
  }
}

// GET /api/leadership/mentoring/members — leader only
export async function getMentorshipMembers(request, env) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT torn_user_id, username, faction_id, level, is_active, faction_position
      FROM faction_members
      ORDER BY is_active DESC, username ASC
    `).all();
    return jsonResponse({ members: results || [] });
  } catch (err) {
    console.error('getMentorshipMembers error:', err);
    return errorResponse('Failed to fetch members', 500);
  }
}

// POST /api/leadership/mentoring/mentors — leader only
// Body: { torn_user_id, username, faction_id, timezone_offset?, notes? }
export async function addMentor(request, env, user) {
  try {
    const { torn_user_id, username, faction_id, timezone_offset, notes } = await request.json();
    if (!torn_user_id || !username) return errorResponse('Missing required fields: torn_user_id, username', 400);

    const { meta } = await env.DB.prepare(`
      INSERT INTO mentors (torn_user_id, username, faction_id, timezone_offset, notes, added_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(torn_user_id) DO UPDATE SET
        is_active = 1, removed_at = NULL, username = excluded.username,
        faction_id = excluded.faction_id, timezone_offset = excluded.timezone_offset, notes = excluded.notes
    `).bind(torn_user_id, username, faction_id ?? null, timezone_offset ?? null, notes || null, user.tornUserId).run();

    return jsonResponse({ message: 'Mentor added', id: meta.last_row_id });
  } catch (err) {
    console.error('addMentor error:', err);
    return errorResponse('Failed to add mentor', 500);
  }
}

// PUT /api/leadership/mentoring/mentors/:id — leader only
// Body: any of { timezone_offset, notes, is_active }
export async function updateMentor(request, env) {
  try {
    const id = parseInt(new URL(request.url).pathname.split('/').pop(), 10);
    if (!id) return errorResponse('Invalid mentor ID', 400);
    const { timezone_offset, notes, is_active } = await request.json();

    await env.DB.prepare(`
      UPDATE mentors SET
        timezone_offset = COALESCE(?, timezone_offset),
        notes = COALESCE(?, notes),
        is_active = COALESCE(?, is_active),
        removed_at = CASE WHEN ? = 0 THEN CURRENT_TIMESTAMP WHEN ? = 1 THEN NULL ELSE removed_at END
      WHERE id = ?
    `).bind(timezone_offset ?? null, notes ?? null, is_active ?? null, is_active, is_active, id).run();

    return jsonResponse({ message: 'Mentor updated' });
  } catch (err) {
    console.error('updateMentor error:', err);
    return errorResponse('Failed to update mentor', 500);
  }
}

// POST /api/leadership/mentoring/mentees — leader only
// Body: { torn_user_id, username, faction_id, timezone_offset?, mentor_id?, notes? }
// Account age is auto-detected via Torn's public profile endpoint, not entered
// manually — falls back to NULL (editable later in the UI) if the fetch fails.
export async function addMentee(request, env, user) {
  try {
    const { torn_user_id, username, faction_id, timezone_offset, mentor_id, notes } = await request.json();
    if (!torn_user_id || !username) return errorResponse('Missing required fields: torn_user_id, username', 400);

    const [account_age_at_added, memberRow] = await Promise.all([
      fetchTornAccountAge(env, torn_user_id),
      env.DB.prepare(`SELECT level FROM faction_members WHERE torn_user_id=?`).bind(torn_user_id).first(),
    ]);
    const level_at_added = memberRow?.level ?? null;

    const { meta } = await env.DB.prepare(`
      INSERT INTO mentees (torn_user_id, username, faction_id, timezone_offset, mentor_id, notes, added_by, account_age_at_added, level_at_added)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      torn_user_id, username, faction_id ?? null, timezone_offset ?? null,
      mentor_id ?? null, notes || null, user.tornUserId, account_age_at_added, level_at_added
    ).run();

    return jsonResponse({ message: 'Mentee added', id: meta.last_row_id, accountAgeDetected: account_age_at_added != null });
  } catch (err) {
    console.error('addMentee error:', err);
    return errorResponse('Failed to add mentee', 500);
  }
}

// PUT /api/leadership/mentoring/mentees/:id — leader, or mentor if the
// mentee is assigned to them.
// Body: any of { mentor_id, timezone_offset, notes, incentive_paid,
//                step_first_mailer, step_mansion_offer, step_joined_discord, step_joined_tornstats,
//                account_age_at_added, level_15_reached_at, account_age_days_at_level_15 (manual
//                overrides — the latter two recompute incentive_amount) }
export async function updateMentee(request, env, user, access) {
  try {
    const id = parseInt(new URL(request.url).pathname.split('/').pop(), 10);
    if (!id) return errorResponse('Invalid mentee ID', 400);

    const current = await env.DB.prepare(`SELECT * FROM mentees WHERE id = ?`).bind(id).first();
    if (!current) return errorResponse('Mentee not found', 404);
    if (!access.isLeader && current.mentor_id !== access.mentorId) {
      return errorResponse('You can only edit mentees assigned to you', 403);
    }

    const body = await request.json();

    const mentor_id = body.mentor_id !== undefined ? body.mentor_id : current.mentor_id;
    const timezone_offset = body.timezone_offset !== undefined ? body.timezone_offset : current.timezone_offset;
    const notes = body.notes !== undefined ? body.notes : current.notes;
    const account_age_at_added = body.account_age_at_added !== undefined ? body.account_age_at_added : current.account_age_at_added;
    const incentive_paid = body.incentive_paid !== undefined ? (body.incentive_paid ? 1 : 0) : current.incentive_paid;

    let incentive_paid_by = current.incentive_paid_by;
    let incentive_paid_by_username = current.incentive_paid_by_username;
    if (body.incentive_paid !== undefined) {
      if (incentive_paid === 1 && current.incentive_paid !== 1) {
        incentive_paid_by = user.tornUserId;
        incentive_paid_by_username = user.username;
      } else if (incentive_paid === 0) {
        incentive_paid_by = null;
        incentive_paid_by_username = null;
      }
    }

    const step_first_mailer = body.step_first_mailer !== undefined ? (body.step_first_mailer ? 1 : 0) : current.step_first_mailer;
    const step_mansion_offer = body.step_mansion_offer !== undefined ? (body.step_mansion_offer ? 1 : 0) : current.step_mansion_offer;
    const step_joined_discord = body.step_joined_discord !== undefined ? (body.step_joined_discord ? 1 : 0) : current.step_joined_discord;
    const step_joined_tornstats = body.step_joined_tornstats !== undefined ? (body.step_joined_tornstats ? 1 : 0) : current.step_joined_tornstats;

    let level_15_reached_at = current.level_15_reached_at;
    let account_age_days_at_level_15 = current.account_age_days_at_level_15;
    let incentive_amount = current.incentive_amount;

    if (body.level_15_reached_at !== undefined) level_15_reached_at = body.level_15_reached_at;
    if (body.account_age_days_at_level_15 !== undefined) {
      account_age_days_at_level_15 = body.account_age_days_at_level_15;
      incentive_amount = getIncentiveAmount(account_age_days_at_level_15);
    }

    await env.DB.prepare(`
      UPDATE mentees SET
        mentor_id=?, timezone_offset=?, notes=?, account_age_at_added=?, incentive_paid=?,
        incentive_paid_at=CASE WHEN ?=1 AND incentive_paid_at IS NULL THEN CURRENT_TIMESTAMP WHEN ?=0 THEN NULL ELSE incentive_paid_at END,
        incentive_paid_by=?, incentive_paid_by_username=?,
        step_first_mailer=?, step_mansion_offer=?, step_joined_discord=?, step_joined_tornstats=?,
        level_15_reached_at=?, account_age_days_at_level_15=?, incentive_amount=?
      WHERE id=?
    `).bind(
      mentor_id, timezone_offset, notes, account_age_at_added, incentive_paid, incentive_paid, incentive_paid,
      incentive_paid_by, incentive_paid_by_username,
      step_first_mailer, step_mansion_offer, step_joined_discord, step_joined_tornstats,
      level_15_reached_at, account_age_days_at_level_15, incentive_amount, id
    ).run();

    return jsonResponse({ message: 'Mentee updated' });
  } catch (err) {
    console.error('updateMentee error:', err);
    return errorResponse('Failed to update mentee', 500);
  }
}

// POST /api/leadership/mentoring/mentees/:id/complete — leader, or mentor if assigned
export async function completeMentee(request, env, user, access) {
  try {
    const id = parseInt(new URL(request.url).pathname.split('/').slice(-2, -1)[0], 10);
    if (!id) return errorResponse('Invalid mentee ID', 400);
    const current = await env.DB.prepare(`SELECT mentor_id FROM mentees WHERE id = ?`).bind(id).first();
    if (!current) return errorResponse('Mentee not found', 404);
    if (!access.isLeader && current.mentor_id !== access.mentorId) {
      return errorResponse('You can only manage mentees assigned to you', 403);
    }
    await env.DB.prepare(`UPDATE mentees SET status='completed', completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
    return jsonResponse({ message: 'Mentee marked complete' });
  } catch (err) {
    console.error('completeMentee error:', err);
    return errorResponse('Failed to complete mentee', 500);
  }
}

// POST /api/leadership/mentoring/mentees/:id/remove — leader, or mentor if assigned
export async function removeMentee(request, env, user, access) {
  try {
    const id = parseInt(new URL(request.url).pathname.split('/').slice(-2, -1)[0], 10);
    if (!id) return errorResponse('Invalid mentee ID', 400);
    const current = await env.DB.prepare(`SELECT mentor_id FROM mentees WHERE id = ?`).bind(id).first();
    if (!current) return errorResponse('Mentee not found', 404);
    if (!access.isLeader && current.mentor_id !== access.mentorId) {
      return errorResponse('You can only manage mentees assigned to you', 403);
    }
    await env.DB.prepare(`UPDATE mentees SET status='removed', removed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
    return jsonResponse({ message: 'Mentee removed' });
  } catch (err) {
    console.error('removeMentee error:', err);
    return errorResponse('Failed to remove mentee', 500);
  }
}

// GET /api/leadership/mentoring/mentees/:id/report — leader or mentor,
// unrestricted read (no per-mentee ownership check — it's read-only info
// already visible in the overview list to both roles). A "minimized profile
// card" oriented around new-player progress rather than full member detail —
// reuses the same queries/helpers memberProfileController.js already built.
export async function getMenteeReport(request, env) {
  try {
    const id = parseInt(new URL(request.url).pathname.split('/').slice(-2, -1)[0], 10);
    if (!id) return errorResponse('Invalid mentee ID', 400);

    const mentee = await env.DB.prepare(`
      SELECT me.*, fm.level, fm.faction_position, fm.days_in_faction, fm.joined_at, fm.is_active AS member_is_active,
             fm.faction_id AS current_faction_id, mt.username AS mentor_username
      FROM mentees me
      LEFT JOIN faction_members fm ON fm.torn_user_id = me.torn_user_id
      LEFT JOIN mentors mt ON mt.id = me.mentor_id
      WHERE me.id = ?
    `).bind(id).first();
    if (!mentee) return errorResponse('Mentee not found', 404);

    const tornUserId = mentee.torn_user_id;
    const monthStart = monthStartDate();
    const monthEnd = monthEndDate();

    const [chainRow, warRow, recentWars, customRow, ocSummary, energy, warnings] = await Promise.all([
      env.DB.prepare(
        `SELECT COALESCE(SUM(total_attacks),0) AS total_attacks, COALESCE(SUM(total_respect),0) AS total_respect
         FROM chain_hits WHERE torn_user_id=?`
      ).bind(tornUserId).first(),

      env.DB.prepare(
        `SELECT COALESCE(SUM(war_hits),0) AS war_hits, COALESCE(SUM(outside_hits),0) AS outside_hits,
                COALESCE(SUM(assists),0) AS assists, COALESCE(SUM(respect_gained),0) AS respect_gained,
                COALESCE(SUM(payout_amount),0) AS payout_amount
         FROM war_hits WHERE torn_user_id=?`
      ).bind(tornUserId).first(),

      env.DB.prepare(
        `SELECT wh.ranked_war_id, wh.war_hits, wh.respect_gained, wh.payout_amount,
                w.opponent_faction_name, w.ended_at
         FROM war_hits wh LEFT JOIN ranked_wars w ON w.id = wh.ranked_war_id
         WHERE wh.torn_user_id=? ORDER BY w.ended_at DESC LIMIT 5`
      ).bind(tornUserId).all(),

      env.DB.prepare(
        `SELECT COALESCE(SUM(hits),0) AS total_hits FROM custom_hits WHERE torn_user_id=?`
      ).bind(tornUserId).first(),

      env.DB.prepare(
        `SELECT COUNT(*) AS joined,
                SUM(CASE WHEN outcome='Successful' THEN 1 ELSE 0 END) AS successful,
                SUM(CASE WHEN outcome IN ('Failed','Hospitalized','Jailed','Injured') THEN 1 ELSE 0 END) AS failed
         FROM oc_crime_slots WHERE torn_user_id=?`
      ).bind(tornUserId).first(),

      getEnergyDeltaForUser(env, tornUserId, monthStart, monthEnd),

      getWarningsForMember(env, tornUserId),
    ]);

    const daysTracked = daysElapsedSince(mentee.added_at);
    const levelsGained = (mentee.level_at_added != null && mentee.level != null)
      ? mentee.level - mentee.level_at_added
      : null;
    const avgDailyLevelGain = (levelsGained != null && daysTracked > 0)
      ? Math.round((levelsGained / daysTracked) * 100) / 100
      : null;

    const ocJoined = ocSummary?.joined ?? 0;
    const ocSuccessful = ocSummary?.successful ?? 0;
    const ocFailed = ocSummary?.failed ?? 0;

    return jsonResponse({
      identity: {
        torn_user_id: tornUserId, username: mentee.username, level: mentee.level,
        faction_position: mentee.faction_position, current_faction_id: mentee.current_faction_id,
        is_active: mentee.member_is_active, joined_at: mentee.joined_at, days_in_faction: mentee.days_in_faction,
      },
      progress: {
        added_at: mentee.added_at, days_tracked: daysTracked,
        level_at_added: mentee.level_at_added, levels_gained: levelsGained, avg_daily_level_gain: avgDailyLevelGain,
      },
      mentoring: {
        status: mentee.status, mentor_username: mentee.mentor_username,
        steps: {
          first_mailer: !!mentee.step_first_mailer, mansion_offer: !!mentee.step_mansion_offer,
          joined_discord: !!mentee.step_joined_discord, joined_tornstats: !!mentee.step_joined_tornstats,
        },
        incentive_amount: mentee.incentive_amount, incentive_paid: !!mentee.incentive_paid,
      },
      combat: {
        chain_hits: chainRow, war_hits: warRow, recent_wars: recentWars.results || [],
        custom_hits: customRow?.total_hits ?? 0,
      },
      oc: {
        joined: ocJoined, successful: ocSuccessful, failed: ocFailed,
        success_pct: ocJoined > 0 ? Math.round((ocSuccessful / ocJoined) * 1000) / 10 : null,
      },
      activity: { energy_this_month_total: energy.total_energy, energy_this_month_avg: energy.avg_per_day },
      warnings,
    });
  } catch (err) {
    console.error('getMenteeReport error:', err);
    return errorResponse('Failed to generate mentee report', 500);
  }
}

// GET /api/leadership/mentoring/resources — leader or mentor
export async function getMentorResources(request, env) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT r.*, u.username AS created_by_username
      FROM mentor_resources r
      LEFT JOIN users u ON u.id = r.created_by
      ORDER BY r.category ASC, r.created_at DESC
    `).all();
    return jsonResponse({ resources: results || [] });
  } catch (err) {
    console.error('getMentorResources error:', err);
    return errorResponse('Failed to fetch resources', 500);
  }
}

// POST /api/leadership/mentoring/resources — leader only
// Body: { category, title, url?, body? }
export async function addMentorResource(request, env, user) {
  try {
    const { category, title, url, body, source_code } = await request.json();
    if (!category || !title) return errorResponse('Missing required fields: category, title', 400);
    if (!['link', 'mailer', 'other'].includes(category)) return errorResponse('Invalid category', 400);

    const { meta } = await env.DB.prepare(`
      INSERT INTO mentor_resources (category, title, url, body, source_code, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(category, title, url || null, body || null, source_code || null, user.userId ?? null).run();

    return jsonResponse({ message: 'Resource added', id: meta.last_row_id });
  } catch (err) {
    console.error('addMentorResource error:', err);
    return errorResponse('Failed to add resource', 500);
  }
}

// DELETE /api/leadership/mentoring/resources/:id — leader only
export async function deleteMentorResource(request, env) {
  try {
    const id = parseInt(new URL(request.url).pathname.split('/').pop(), 10);
    if (!id) return errorResponse('Invalid resource ID', 400);
    await env.DB.prepare(`DELETE FROM mentor_resources WHERE id = ?`).bind(id).run();
    return jsonResponse({ message: 'Resource deleted' });
  } catch (err) {
    console.error('deleteMentorResource error:', err);
    return errorResponse('Failed to delete resource', 500);
  }
}

// GET /api/mentoring/my-access — any authenticated user
export async function getMyMentoringAccess(request, env, user, access) {
  return jsonResponse(access);
}

// Freezes level_15_reached_at/account_age_days_at_level_15/incentive_amount for
// one mentee who just crossed level 15 — pure date math off account_age_at_added
// + added_at, no Torn API call. Shared by the 12h cron sweep (backstop, catches
// mentees nobody happens to be viewing) and getMentoringOverview (opportunistic,
// so eligibility shows correctly the moment anyone loads the page instead of
// waiting up to 12h for the next cron run — this gap was reported live: a
// member already at level 15 still showed "ineligible — not yet level 15").
// Returns the frozen fields, or null if there's no age baseline to freeze yet.
async function freezeLevel15(env, mentee) {
  const age = currentAccountAgeEstimate(mentee);
  if (age == null) return null;
  const amount = getIncentiveAmount(age);
  const level_15_reached_at = todayDateString();
  await env.DB.prepare(`
    UPDATE mentees SET level_15_reached_at=?, account_age_days_at_level_15=?, incentive_amount=?
    WHERE id=?
  `).bind(level_15_reached_at, age, amount, mentee.id).run();
  return { level_15_reached_at, account_age_days_at_level_15: age, incentive_amount: amount };
}

// Called from the 12h faction sync cron, right after syncMembersFromCache —
// piggybacks on the level data that sync already refreshed rather than
// running its own cron. Backstop for mentees nobody views between cron runs;
// getMentoringOverview freezes eagerly for everyone else. Only fires once per
// mentee (guarded by level_15_reached_at IS NULL).
export async function checkMentorshipLevel15Crossings(env) {
  const { results } = await env.DB.prepare(`
    SELECT me.id, me.account_age_at_added, me.added_at
    FROM mentees me
    JOIN faction_members fm ON fm.torn_user_id = me.torn_user_id
    WHERE me.status = 'active' AND me.level_15_reached_at IS NULL AND fm.level >= 15
  `).all();

  let updated = 0;
  for (const row of (results || [])) {
    if (await freezeLevel15(env, row)) updated++;
  }
  return { checked: (results || []).length, updated };
}
