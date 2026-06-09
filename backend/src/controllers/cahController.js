import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const HAND_SIZE = 7;

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function rollOmen() {
  const r = Math.random();
  if (r < 0.40) return null;
  if (r < 0.60) return 'blood_moon';
  if (r < 0.80) return 'the_veil';
  return 'the_awakening';
}

async function systemMsg(env, roomId, text) {
  await env.DB.prepare(
    `INSERT INTO cah_messages (room_id, player_id, display_name, message, is_system)
     VALUES (?, NULL, 'The Harbinger', ?, 1)`
  ).bind(roomId, text).run();
}

async function dealCards(env, roomId, playerIds, count) {
  // Get all card IDs already in any hand in this room
  const inHands = await env.DB.prepare(
    `SELECT card_id FROM cah_hands WHERE room_id = ?`
  ).bind(roomId).all();
  const taken = new Set((inHands.results || []).map(r => r.card_id));

  // Get active fate card pool
  const pool = await env.DB.prepare(
    `SELECT id FROM cah_fate_cards WHERE is_active = 1`
  ).all();
  const available = (pool.results || []).map(r => r.id).filter(id => !taken.has(id));

  // Shuffle
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }

  let cursor = 0;
  const stmts = [];
  for (const pid of playerIds) {
    for (let i = 0; i < count && cursor < available.length; i++, cursor++) {
      stmts.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO cah_hands (room_id, player_id, card_id) VALUES (?, ?, ?)`
        ).bind(roomId, pid, available[cursor])
      );
    }
  }
  if (stmts.length) {
    for (let i = 0; i < stmts.length; i += 100) {
      await env.DB.batch(stmts.slice(i, i + 100));
    }
  }
}

async function refillHands(env, roomId, playerIds) {
  for (const pid of playerIds) {
    const { results } = await env.DB.prepare(
      `SELECT id FROM cah_hands WHERE room_id = ? AND player_id = ?`
    ).bind(roomId, pid).all();
    const have = results?.length || 0;
    const need = HAND_SIZE - have;
    if (need > 0) await dealCards(env, roomId, [pid], need);
  }
}

async function startNextRound(env, room, players) {
  const roundNumber = (room.current_round_id
    ? (await env.DB.prepare(`SELECT round_number FROM cah_rounds WHERE id = ?`).bind(room.current_round_id).first())?.round_number || 0
    : 0) + 1;

  // Pick harbinger (cycle through players by join order)
  const sortedPlayers = [...players].sort((a, b) => a.id - b.id);
  const harbIdx = (roundNumber - 1) % sortedPlayers.length;
  const harbinger = sortedPlayers[harbIdx];

  // Pick unused shadow card
  const usedCards = await env.DB.prepare(
    `SELECT shadow_card_id FROM cah_rounds WHERE room_id = ?`
  ).bind(room.id).all();
  const usedSet = new Set((usedCards.results || []).map(r => r.shadow_card_id));

  const allShadow = await env.DB.prepare(
    `SELECT id FROM cah_shadow_cards WHERE is_active = 1`
  ).all();
  let pool = (allShadow.results || []).map(r => r.id).filter(id => !usedSet.has(id));
  // If all used, reset pool
  if (!pool.length) pool = (allShadow.results || []).map(r => r.id);
  const shadowCardId = pool[Math.floor(Math.random() * pool.length)];

  // Roll omen
  const omen = room.omens_enabled ? rollOmen() : null;

  // Deal Awakening extra card to non-harbinger players
  if (omen === 'the_awakening') {
    const nonHarb = players.filter(p => p.id !== harbinger.id).map(p => p.id);
    await dealCards(env, room.id, nonHarb, 1);
  }

  const round = await env.DB.prepare(
    `INSERT INTO cah_rounds (room_id, round_number, shadow_card_id, harbinger_player_id, omen, status)
     VALUES (?, ?, ?, ?, ?, 'picking')
     RETURNING id`
  ).bind(room.id, roundNumber, shadowCardId, harbinger.id, omen).first();

  await env.DB.prepare(
    `UPDATE cah_rooms SET current_round_id = ?, last_activity = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(round.id, room.id).run();

  // System message
  const shadow = await env.DB.prepare(
    `SELECT text FROM cah_shadow_cards WHERE id = ?`
  ).bind(shadowCardId).first();
  let omenText = '';
  if (omen === 'blood_moon') omenText = ' 🌑 The Blood Moon rises — submit two cards.';
  else if (omen === 'the_veil') omenText = ' 👁 The Veil is drawn — the Harbinger judges blind.';
  else if (omen === 'the_awakening') omenText = ' ✦ The Awakening — each player receives an extra card.';
  await systemMsg(env, room.id, `Round ${roundNumber} begins. ${harbinger.display_name} is the Harbinger.${omenText}`);

  // Bots auto-submit their cards
  await botActForCAH(env, room, round, players);

  return round;
}

// ── Bot auto-actions for Cards Against Occultus ─────────────────────────────

async function botActForCAH(env, room, round, players) {
  const bots    = players.filter(p => p.is_bot);
  if (!bots.length) return;

  const harbinger = players.find(p => p.id === round.harbinger_player_id);

  if (round.status === 'picking') {
    // Non-harbinger bots submit random cards
    const shadow = await env.DB.prepare(`SELECT * FROM cah_shadow_cards WHERE id = ?`).bind(round.shadow_card_id).first();
    const effectivePicks = (round.omen === 'blood_moon') ? Math.max(shadow.picks, 2) : shadow.picks;

    for (const bot of bots) {
      if (bot.id === round.harbinger_player_id) continue;
      // Already submitted?
      const existing = await env.DB.prepare(`SELECT id FROM cah_submissions WHERE round_id = ? AND player_id = ?`).bind(round.id, bot.id).first();
      if (existing) continue;

      const { results: hand } = await env.DB.prepare(
        `SELECT card_id FROM cah_hands WHERE room_id = ? AND player_id = ?`
      ).bind(room.id, bot.id).all();
      const cardIds = (hand || []).map(h => h.card_id);
      if (cardIds.length < effectivePicks) continue;

      // Pick random cards from hand
      const shuffled = [...cardIds].sort(() => Math.random() - 0.5);
      const chosen   = shuffled.slice(0, effectivePicks);

      const stmts = [];
      for (let i = 0; i < chosen.length; i++) {
        stmts.push(env.DB.prepare(
          `INSERT OR REPLACE INTO cah_submissions (round_id, player_id, card_id, pick_order) VALUES (?, ?, ?, ?)`
        ).bind(round.id, bot.id, chosen[i], i + 1));
        stmts.push(env.DB.prepare(
          `DELETE FROM cah_hands WHERE room_id = ? AND player_id = ? AND card_id = ?`
        ).bind(room.id, bot.id, chosen[i]));
      }
      if (stmts.length) await env.DB.batch(stmts);
    }

    // Check if all non-harbinger submitted → move to judging
    const nonHarb = players.filter(p => p.id !== round.harbinger_player_id);
    const { results: subs } = await env.DB.prepare(
      `SELECT DISTINCT player_id FROM cah_submissions WHERE round_id = ?`
    ).bind(round.id).all();
    const submittedSet = new Set((subs || []).map(s => s.player_id));
    const allSubmitted = nonHarb.every(p => submittedSet.has(p.id));

    if (allSubmitted) {
      await env.DB.prepare(`UPDATE cah_rounds SET status = 'judging' WHERE id = ?`).bind(round.id).run();
      await systemMsg(env, room.id, `All fates have been cast. ${harbinger?.display_name || 'The Harbinger'} must now choose.`);
      // If harbinger is also a bot, judge immediately
      if (harbinger?.is_bot) {
        const updatedRound = await env.DB.prepare(`SELECT * FROM cah_rounds WHERE id = ?`).bind(round.id).first();
        await botJudge(env, room, updatedRound, players);
      }
    }
  } else if (round.status === 'judging' && harbinger?.is_bot) {
    await botJudge(env, room, round, players);
  }
}

async function botJudge(env, room, round, players) {
  // Pick a random non-harbinger player who submitted as winner
  const { results: subs } = await env.DB.prepare(
    `SELECT DISTINCT player_id FROM cah_submissions WHERE round_id = ?`
  ).bind(round.id).all();
  const candidates = (subs || []).map(s => s.player_id).filter(id => id !== round.harbinger_player_id);
  if (!candidates.length) return;

  const winnerPlayerId = candidates[Math.floor(Math.random() * candidates.length)];
  const winner = players.find(p => p.id === winnerPlayerId);
  if (!winner) return;

  await env.DB.prepare(`UPDATE cah_players SET souls = souls + 1 WHERE id = ?`).bind(winnerPlayerId).run();
  await env.DB.prepare(`UPDATE cah_rounds SET status = 'complete', winner_player_id = ? WHERE id = ?`).bind(winnerPlayerId, round.id).run();
  await systemMsg(env, room.id, `${winner.display_name} claims a soul. The shadows grow heavier.`);

  const { results: updatedPlayers } = await env.DB.prepare(`SELECT * FROM cah_players WHERE room_id = ?`).bind(room.id).all();
  const updatedRoom = await env.DB.prepare(`SELECT * FROM cah_rooms WHERE id = ?`).bind(room.id).first();
  const won = await checkWin(env, updatedRoom, updatedPlayers || []);
  if (!won) {
    const nonHarb = (updatedPlayers || []).filter(p => p.id !== round.harbinger_player_id).map(p => p.id);
    await refillHands(env, room.id, nonHarb);
    await startNextRound(env, updatedRoom, updatedPlayers || []);
  }
}

// POST /api/cards/rooms/:code/fill-bots — admin only
export async function fillBots(request, env, user) {
  try {
    const code = new URL(request.url).pathname.split('/').slice(-2)[0];
    const body = await request.json().catch(() => ({}));

    const room = await env.DB.prepare(`SELECT id, status FROM cah_rooms WHERE code = ?`).bind(code).first();
    if (!room) return errorResponse('Room not found', 404);
    if (room.status !== 'lobby') return errorResponse('Can only fill bots in lobby', 400);

    const { results: players } = await env.DB.prepare(`SELECT id FROM cah_players WHERE room_id = ?`).bind(room.id).all();
    const current = players.length;
    const target  = Math.max(3, parseInt(body.count) || 3);
    const needed  = target - current;
    if (needed <= 0) return jsonResponse({ added: 0 });

    const stmts = [];
    for (let i = 0; i < needed; i++) {
      stmts.push(env.DB.prepare(
        `INSERT INTO cah_players (room_id, display_name, is_bot) VALUES (?, ?, 1)`
      ).bind(room.id, `Bot_${current + i + 1}`));
    }
    await env.DB.batch(stmts);

    return jsonResponse({ added: needed });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

async function checkWin(env, room, players) {
  const winner = players.find(p => p.souls >= room.souls_to_win);
  if (!winner) return false;
  await env.DB.prepare(
    `UPDATE cah_rooms SET status = 'ended', winner_name = ?, last_activity = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(winner.display_name, room.id).run();
  await systemMsg(env, room.id, `${winner.display_name} has claimed ${room.souls_to_win} souls. The game is over.`);
  return true;
}

function identifyPlayer(user, guestToken, players) {
  if (user) return players.find(p => p.user_id === user.userId);
  if (guestToken) return players.find(p => p.guest_token === guestToken);
  return null;
}

// GET /api/cards/current
export async function getCurrentRoom(request, env) {
  try {
    const room = await env.DB.prepare(
      `SELECT id, code, status, host_name, souls_to_win, omens_enabled
       FROM cah_rooms WHERE status = 'lobby' ORDER BY created_at DESC LIMIT 1`
    ).first();
    if (!room) return jsonResponse({ room: null });
    const { results: players } = await env.DB.prepare(
      `SELECT id, display_name FROM cah_players WHERE room_id = ?`
    ).bind(room.id).all();
    return jsonResponse({ room: { ...room, playerCount: players?.length || 0 } });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

// POST /api/cards/current/join
export async function joinOrCreate(request, env, user) {
  try {
    const body = await request.json().catch(() => ({}));
    const displayName = user?.username || body.guest_name?.trim();
    if (!displayName) return errorResponse('A name is required', 400);

    const soulsToWin = Math.min(10, Math.max(3, parseInt(body.souls_to_win) || 5));
    const omensEnabled = body.omens_enabled !== false ? 1 : 0;

    // Find existing non-expired lobby
    let room = await env.DB.prepare(
      `SELECT * FROM cah_rooms WHERE status = 'lobby'
       AND (lobby_expires_at IS NULL OR lobby_expires_at > datetime('now'))
       ORDER BY created_at DESC LIMIT 1`
    ).first();

    const guestToken = (!user) ? crypto.randomUUID() : null;

    if (!room) {
      // Create new room
      let code, attempts = 0;
      while (attempts < 10) {
        code = generateCode();
        const ex = await env.DB.prepare(`SELECT id FROM cah_rooms WHERE code = ?`).bind(code).first();
        if (!ex) break;
        attempts++;
      }
      await env.DB.prepare(
        `INSERT INTO cah_rooms (code, host_name, souls_to_win, omens_enabled, lobby_expires_at)
         VALUES (?, ?, ?, ?, datetime('now', '+5 minutes'))`
      ).bind(code, displayName, soulsToWin, omensEnabled).run();
      room = await env.DB.prepare(`SELECT * FROM cah_rooms WHERE code = ?`).bind(code).first();
    }

    // Check if already in room
    let existing = null;
    if (user) {
      existing = await env.DB.prepare(
        `SELECT * FROM cah_players WHERE room_id = ? AND user_id = ?`
      ).bind(room.id, user.userId).first();
    }

    if (!existing) {
      const playerCount = await env.DB.prepare(
        `SELECT COUNT(*) as n FROM cah_players WHERE room_id = ?`
      ).bind(room.id).first();
      if ((playerCount?.n || 0) >= 20) return errorResponse('Room is full', 400);

      const isHost = (room.host_name === displayName && !await env.DB.prepare(
        `SELECT id FROM cah_players WHERE room_id = ? AND is_host = 1`
      ).bind(room.id).first()) ? 1 : 0;

      await env.DB.prepare(
        `INSERT INTO cah_players (room_id, user_id, display_name, guest_token, is_host)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(room.id, user?.userId || null, displayName, guestToken, isHost).run();
    }

    // Reset expiry on any join activity
    await env.DB.prepare(
      `UPDATE cah_rooms SET lobby_expires_at = datetime('now', '+5 minutes') WHERE id = ?`
    ).bind(room.id).run();

    const player = user
      ? await env.DB.prepare(`SELECT * FROM cah_players WHERE room_id = ? AND user_id = ?`).bind(room.id, user.userId).first()
      : await env.DB.prepare(`SELECT * FROM cah_players WHERE room_id = ? AND guest_token = ?`).bind(room.id, guestToken).first();

    return jsonResponse({ code: room.code, playerId: player.id, guestToken });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

// GET /api/cards/rooms/:code
export async function getRoom(request, env, user) {
  try {
    const url = new URL(request.url);
    const code = url.pathname.split('/').at(-1);
    const since = parseInt(url.searchParams.get('since') || '0');
    const guestToken = url.searchParams.get('guest_token');

    const room = await env.DB.prepare(`SELECT * FROM cah_rooms WHERE code = ?`).bind(code).first();
    if (!room) return errorResponse('Room not found', 404);

    if (room.status === 'lobby' && room.lobby_expires_at) {
      const expiresAt = new Date(room.lobby_expires_at.replace(' ', 'T') + 'Z');
      if (Date.now() > expiresAt.getTime()) {
        await env.DB.prepare('DELETE FROM cah_rooms WHERE id = ?').bind(room.id).run();
        return errorResponse('Lobby expired — no game was started', 410);
      }
    }

    const { results: players } = await env.DB.prepare(
      `SELECT * FROM cah_players WHERE room_id = ? ORDER BY joined_at ASC`
    ).bind(room.id).all();

    const me = identifyPlayer(user, guestToken, players || []);

    // Current round
    let round = null, shadowCard = null, submissions = [], myHand = [], mySubmission = [];
    if (room.current_round_id) {
      round = await env.DB.prepare(`SELECT * FROM cah_rounds WHERE id = ?`).bind(room.current_round_id).first();
      shadowCard = await env.DB.prepare(`SELECT * FROM cah_shadow_cards WHERE id = ?`).bind(round.shadow_card_id).first();

      if (me) {
        // My hand (only during picking, only if not harbinger)
        if (round.status === 'picking' && me.id !== round.harbinger_player_id) {
          const { results: hand } = await env.DB.prepare(
            `SELECT fc.id, fc.text, fc.is_blank FROM cah_hands h
             JOIN cah_fate_cards fc ON fc.id = h.card_id
             WHERE h.room_id = ? AND h.player_id = ?`
          ).bind(room.id, me.id).all();
          myHand = hand || [];
        }

        // My current submission
        const { results: mySubs } = await env.DB.prepare(
          `SELECT card_id, pick_order, custom_text FROM cah_submissions
           WHERE round_id = ? AND player_id = ? ORDER BY pick_order`
        ).bind(round.id, me.id).all();
        mySubmission = mySubs || [];
      }

      // Build submissions based on phase
      const nonHarb = (players || []).filter(p => p.id !== round.harbinger_player_id);
      if (round.status === 'picking') {
        // Show only who has/hasn't submitted (no card text)
        const { results: subs } = await env.DB.prepare(
          `SELECT DISTINCT player_id FROM cah_submissions WHERE round_id = ?`
        ).bind(round.id).all();
        const submittedSet = new Set((subs || []).map(s => s.player_id));
        submissions = nonHarb.map(p => ({ player_id: p.id, submitted: submittedSet.has(p.id) }));
      } else {
        // Judging or complete: group submissions by player, include card text
        const { results: subs } = await env.DB.prepare(
          `SELECT s.player_id, s.pick_order, s.custom_text, fc.text as card_text, fc.is_blank
           FROM cah_submissions s
           JOIN cah_fate_cards fc ON fc.id = s.card_id
           WHERE s.round_id = ?
           ORDER BY s.player_id, s.pick_order`
        ).bind(round.id).all();

        // Group by player
        const grouped = {};
        for (const s of subs || []) {
          if (!grouped[s.player_id]) grouped[s.player_id] = [];
          grouped[s.player_id].push({
            text: s.is_blank ? s.custom_text || '(blank)' : s.card_text,
            pick_order: s.pick_order,
          });
        }

        // Shuffle for judging anonymity, reveal names when complete
        const entries = Object.entries(grouped).map(([pid, cards]) => {
          const numPid = parseInt(pid);
          const p = (players || []).find(pl => pl.id === numPid);
          return {
            player_id: numPid,
            display_name: round.status === 'complete' ? p?.display_name : null,
            cards,
            is_winner: round.winner_player_id === numPid,
          };
        });

        // Shuffle order for judging
        if (round.status === 'judging') {
          for (let i = entries.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [entries[i], entries[j]] = [entries[j], entries[i]];
          }
        }
        submissions = entries;
      }
    }

    // Messages since last poll
    const { results: messages } = await env.DB.prepare(
      `SELECT id, player_id, display_name, message, is_system, created_at
       FROM cah_messages WHERE room_id = ? AND id > ? ORDER BY id ASC LIMIT 50`
    ).bind(room.id, since).all();

    // Mark harbinger in player list
    const enrichedPlayers = (players || []).map(p => ({
      id: p.id,
      display_name: p.display_name,
      souls: p.souls,
      is_host: p.is_host,
      is_bot: !!p.is_bot,
      is_harbinger: round ? p.id === round.harbinger_player_id : false,
    }));

    return jsonResponse({
      room: {
        id: room.id, code: room.code, status: room.status,
        souls_to_win: room.souls_to_win, omens_enabled: room.omens_enabled,
        pact_used: room.pact_used, winner_name: room.winner_name,
        lobby_expires_at: room.lobby_expires_at || null,
      },
      players: enrichedPlayers,
      round: round ? {
        id: round.id, round_number: round.round_number,
        shadow_card: shadowCard,
        harbinger_player_id: round.harbinger_player_id,
        status: round.status, omen: round.omen,
        winner_player_id: round.winner_player_id,
      } : null,
      submissions,
      myHand,
      mySubmission,
      myPlayerId: me?.id || null,
      messages: messages || [],
    });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

// POST /api/cards/rooms/:code/start
export async function startGame(request, env, user) {
  try {
    const url = new URL(request.url);
    const code = url.pathname.split('/').slice(-2)[0];
    const body = await request.json().catch(() => ({}));
    const guestToken = body.guest_token;

    const room = await env.DB.prepare(`SELECT * FROM cah_rooms WHERE code = ?`).bind(code).first();
    if (!room) return errorResponse('Room not found', 404);
    if (room.status !== 'lobby') return errorResponse('Game already started', 400);

    const { results: players } = await env.DB.prepare(
      `SELECT * FROM cah_players WHERE room_id = ? ORDER BY joined_at ASC`
    ).bind(room.id).all();

    const me = identifyPlayer(user, guestToken, players || []);
    if (!me?.is_host) return errorResponse('Only the host can start the game', 403);
    if ((players?.length || 0) < 3) return errorResponse('Need at least 3 players to start', 400);

    // Update settings if provided
    if (body.souls_to_win || body.omens_enabled !== undefined) {
      const soulsToWin = Math.min(10, Math.max(3, parseInt(body.souls_to_win) || room.souls_to_win));
      const omensEnabled = body.omens_enabled !== false ? 1 : 0;
      await env.DB.prepare(
        `UPDATE cah_rooms SET souls_to_win = ?, omens_enabled = ? WHERE id = ?`
      ).bind(soulsToWin, omensEnabled, room.id).run();
    }

    const updatedRoom = await env.DB.prepare(`SELECT * FROM cah_rooms WHERE id = ?`).bind(room.id).first();

    // Deal initial hands
    const allPlayerIds = (players || []).map(p => p.id);
    await dealCards(env, room.id, allPlayerIds, HAND_SIZE);

    // Update room status
    await env.DB.prepare(
      `UPDATE cah_rooms SET status = 'playing', lobby_expires_at = NULL WHERE id = ?`
    ).bind(room.id).run();

    await systemMsg(env, room.id, 'The ritual begins. Cards are dealt. May your Fate serve you well.');
    await startNextRound(env, updatedRoom, players || []);

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

// POST /api/cards/rooms/:code/submit
export async function submitCard(request, env, user) {
  try {
    const url = new URL(request.url);
    const code = url.pathname.split('/').slice(-2)[0];
    const body = await request.json().catch(() => ({}));
    const guestToken = body.guest_token;

    const room = await env.DB.prepare(`SELECT * FROM cah_rooms WHERE code = ?`).bind(code).first();
    if (!room || room.status !== 'playing') return errorResponse('Game not active', 400);

    const round = await env.DB.prepare(`SELECT * FROM cah_rounds WHERE id = ?`).bind(room.current_round_id).first();
    if (!round || round.status !== 'picking') return errorResponse('Not in picking phase', 400);

    const { results: players } = await env.DB.prepare(
      `SELECT * FROM cah_players WHERE room_id = ?`
    ).bind(room.id).all();
    const me = identifyPlayer(user, guestToken, players || []);
    if (!me) return errorResponse('Player not found', 403);
    if (me.id === round.harbinger_player_id) return errorResponse('Harbinger does not submit cards', 400);

    const shadow = await env.DB.prepare(`SELECT * FROM cah_shadow_cards WHERE id = ?`).bind(round.shadow_card_id).first();
    const effectivePicks = (round.omen === 'blood_moon') ? Math.max(shadow.picks, 2) : shadow.picks;

    // cards: [{ card_id, custom_text? }]
    const cards = Array.isArray(body.cards) ? body.cards : [];
    if (cards.length !== effectivePicks) return errorResponse(`Must submit exactly ${effectivePicks} card(s)`, 400);

    // Verify cards are in hand
    const { results: hand } = await env.DB.prepare(
      `SELECT card_id FROM cah_hands WHERE room_id = ? AND player_id = ?`
    ).bind(room.id, me.id).all();
    const handSet = new Set((hand || []).map(h => h.card_id));
    for (const c of cards) {
      if (!handSet.has(c.card_id)) return errorResponse('Card not in hand', 400);
    }

    // Insert submissions
    const stmts = [];
    for (let i = 0; i < cards.length; i++) {
      stmts.push(env.DB.prepare(
        `INSERT OR REPLACE INTO cah_submissions (round_id, player_id, card_id, pick_order, custom_text)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(round.id, me.id, cards[i].card_id, i + 1, cards[i].custom_text || null));
      // Remove from hand
      stmts.push(env.DB.prepare(
        `DELETE FROM cah_hands WHERE room_id = ? AND player_id = ? AND card_id = ?`
      ).bind(room.id, me.id, cards[i].card_id));
    }
    await env.DB.batch(stmts);

    await env.DB.prepare(
      `UPDATE cah_rooms SET last_activity = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(room.id).run();

    // Check if all non-harbinger players have submitted
    const nonHarb = (players || []).filter(p => p.id !== round.harbinger_player_id);
    const { results: subs } = await env.DB.prepare(
      `SELECT DISTINCT player_id FROM cah_submissions WHERE round_id = ?`
    ).bind(round.id).all();
    const submittedSet = new Set((subs || []).map(s => s.player_id));

    const allSubmitted = nonHarb.every(p => submittedSet.has(p.id));
    if (allSubmitted) {
      await env.DB.prepare(
        `UPDATE cah_rounds SET status = 'judging' WHERE id = ?`
      ).bind(round.id).run();
      const harb = (players || []).find(p => p.id === round.harbinger_player_id);
      await systemMsg(env, room.id, `All fates have been cast. ${harb?.display_name || 'The Harbinger'} must now choose.`);
      // If harbinger is a bot, judge immediately
      if (harb?.is_bot) {
        const updatedRound = await env.DB.prepare(`SELECT * FROM cah_rounds WHERE id = ?`).bind(round.id).first();
        await botJudge(env, room, updatedRound, players || []);
      }
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

// POST /api/cards/rooms/:code/judge
export async function judgeWinner(request, env, user) {
  try {
    const url = new URL(request.url);
    const code = url.pathname.split('/').slice(-2)[0];
    const body = await request.json().catch(() => ({}));
    const guestToken = body.guest_token;
    const winnerPlayerId = parseInt(body.winner_player_id);

    const room = await env.DB.prepare(`SELECT * FROM cah_rooms WHERE code = ?`).bind(code).first();
    if (!room || room.status !== 'playing') return errorResponse('Game not active', 400);

    const round = await env.DB.prepare(`SELECT * FROM cah_rounds WHERE id = ?`).bind(room.current_round_id).first();
    if (!round || round.status !== 'judging') return errorResponse('Not in judging phase', 400);

    const { results: players } = await env.DB.prepare(
      `SELECT * FROM cah_players WHERE room_id = ?`
    ).bind(room.id).all();
    const me = identifyPlayer(user, guestToken, players || []);
    if (!me || me.id !== round.harbinger_player_id) return errorResponse('Only the Harbinger may judge', 403);

    const winner = (players || []).find(p => p.id === winnerPlayerId);
    if (!winner) return errorResponse('Winner not found', 400);

    // Award soul
    await env.DB.prepare(
      `UPDATE cah_players SET souls = souls + 1 WHERE id = ?`
    ).bind(winnerPlayerId).run();
    await env.DB.prepare(
      `UPDATE cah_rounds SET status = 'complete', winner_player_id = ? WHERE id = ?`
    ).bind(winnerPlayerId, round.id).run();

    await systemMsg(env, room.id, `${winner.display_name} claims a soul. The shadows grow heavier.`);

    // Get updated players
    const { results: updatedPlayers } = await env.DB.prepare(
      `SELECT * FROM cah_players WHERE room_id = ?`
    ).bind(room.id).all();

    // Check win
    const updatedRoom = await env.DB.prepare(`SELECT * FROM cah_rooms WHERE id = ?`).bind(room.id).first();
    const won = await checkWin(env, updatedRoom, updatedPlayers || []);
    if (!won) {
      // Refill hands and start next round
      const nonHarb = (updatedPlayers || []).filter(p => p.id !== round.harbinger_player_id).map(p => p.id);
      await refillHands(env, room.id, nonHarb);
      await startNextRound(env, updatedRoom, updatedPlayers || []);
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

// POST /api/cards/rooms/:code/pact
export async function invokePact(request, env, user) {
  try {
    const url = new URL(request.url);
    const code = url.pathname.split('/').slice(-2)[0];
    const body = await request.json().catch(() => ({}));
    const guestToken = body.guest_token;

    const room = await env.DB.prepare(`SELECT * FROM cah_rooms WHERE code = ?`).bind(code).first();
    if (!room || room.status !== 'playing') return errorResponse('Game not active', 400);
    if (room.pact_used) return errorResponse('The Pact has already been invoked', 400);

    const round = await env.DB.prepare(`SELECT * FROM cah_rounds WHERE id = ?`).bind(room.current_round_id).first();
    if (!round || round.status !== 'picking') return errorResponse('The Pact may only be invoked during the picking phase', 400);

    const { results: players } = await env.DB.prepare(
      `SELECT * FROM cah_players WHERE room_id = ?`
    ).bind(room.id).all();
    const me = identifyPlayer(user, guestToken, players || []);
    if (!me) return errorResponse('Player not found', 403);

    // Cost: 1 soul (min 0)
    const newSouls = Math.max(0, me.souls - 1);
    await env.DB.prepare(
      `UPDATE cah_players SET souls = ? WHERE id = ?`
    ).bind(newSouls, me.id).run();

    // Mark pact used
    await env.DB.prepare(
      `UPDATE cah_rooms SET pact_used = 1 WHERE id = ?`
    ).bind(room.id).run();

    // Clear existing submissions for this round
    await env.DB.prepare(`DELETE FROM cah_submissions WHERE round_id = ?`).bind(round.id).run();

    // Pick a new shadow card
    const usedCards = await env.DB.prepare(
      `SELECT shadow_card_id FROM cah_rounds WHERE room_id = ?`
    ).bind(room.id).all();
    const usedSet = new Set((usedCards.results || []).map(r => r.shadow_card_id));
    const allShadow = await env.DB.prepare(
      `SELECT id FROM cah_shadow_cards WHERE is_active = 1 AND id != ?`
    ).bind(round.shadow_card_id).all();
    let pool = (allShadow.results || []).map(r => r.id).filter(id => !usedSet.has(id));
    if (!pool.length) pool = (allShadow.results || []).map(r => r.id);
    const newShadowId = pool[Math.floor(Math.random() * pool.length)];

    await env.DB.prepare(
      `UPDATE cah_rounds SET shadow_card_id = ? WHERE id = ?`
    ).bind(newShadowId, round.id).run();

    await systemMsg(env, room.id, `${me.display_name} invokes The Pact. The shadow card is redrawn — at the cost of a soul.`);

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

// POST /api/cards/rooms/:code/message
export async function sendMessage(request, env, user) {
  try {
    const url = new URL(request.url);
    const code = url.pathname.split('/').slice(-2)[0];
    const body = await request.json().catch(() => ({}));
    const guestToken = body.guest_token;
    const message = body.message?.trim();
    if (!message || message.length > 300) return errorResponse('Invalid message', 400);

    const room = await env.DB.prepare(`SELECT id FROM cah_rooms WHERE code = ?`).bind(code).first();
    if (!room) return errorResponse('Room not found', 404);

    const { results: players } = await env.DB.prepare(
      `SELECT * FROM cah_players WHERE room_id = ?`
    ).bind(room.id).all();
    const me = identifyPlayer(user, guestToken, players || []);
    if (!me) return errorResponse('Player not found', 403);

    await env.DB.prepare(
      `INSERT INTO cah_messages (room_id, player_id, display_name, message) VALUES (?, ?, ?, ?)`
    ).bind(room.id, me.id, me.display_name, message).run();

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

// POST /api/cards/rooms/:code/leave
export async function leaveRoom(request, env, user) {
  try {
    const url = new URL(request.url);
    const code = url.pathname.split('/').slice(-2)[0];
    const body = await request.json().catch(() => ({}));
    const guestToken = body.guest_token;

    const room = await env.DB.prepare(`SELECT * FROM cah_rooms WHERE code = ?`).bind(code).first();
    if (!room) return jsonResponse({ ok: true });

    const { results: players } = await env.DB.prepare(
      `SELECT * FROM cah_players WHERE room_id = ?`
    ).bind(room.id).all();
    const me = identifyPlayer(user, guestToken, players || []);
    if (!me) return jsonResponse({ ok: true });

    await env.DB.prepare(`DELETE FROM cah_players WHERE id = ?`).bind(me.id).run();
    await env.DB.prepare(`DELETE FROM cah_hands WHERE player_id = ? AND room_id = ?`).bind(me.id, room.id).run();

    const remaining = (players || []).filter(p => p.id !== me.id);
    if (remaining.length === 0) {
      await env.DB.prepare(`DELETE FROM cah_rooms WHERE id = ?`).bind(room.id).run();
    } else if (me.is_host) {
      await env.DB.prepare(
        `UPDATE cah_players SET is_host = 1 WHERE id = ?`
      ).bind(remaining[0].id).run();
      await systemMsg(env, room.id, `${remaining[0].display_name} is now the host.`);
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

// POST /api/cards/rooms/:code/settings (host update lobby settings)
export async function updateSettings(request, env, user) {
  try {
    const url = new URL(request.url);
    const code = url.pathname.split('/').slice(-2)[0];
    const body = await request.json().catch(() => ({}));
    const guestToken = body.guest_token;

    const room = await env.DB.prepare(`SELECT * FROM cah_rooms WHERE code = ?`).bind(code).first();
    if (!room || room.status !== 'lobby') return errorResponse('Not in lobby', 400);

    const { results: players } = await env.DB.prepare(
      `SELECT * FROM cah_players WHERE room_id = ?`
    ).bind(room.id).all();
    const me = identifyPlayer(user, guestToken, players || []);
    if (!me?.is_host) return errorResponse('Only host can change settings', 403);

    const soulsToWin = Math.min(10, Math.max(3, parseInt(body.souls_to_win) || room.souls_to_win));
    const omensEnabled = body.omens_enabled !== undefined ? (body.omens_enabled ? 1 : 0) : room.omens_enabled;

    await env.DB.prepare(
      `UPDATE cah_rooms SET souls_to_win = ?, omens_enabled = ? WHERE id = ?`
    ).bind(soulsToWin, omensEnabled, room.id).run();

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

// ─── Admin card management ────────────────────────────────────────────────────

export async function adminGetCards(request, env) {
  try {
    const { results: shadow } = await env.DB.prepare(
      `SELECT * FROM cah_shadow_cards ORDER BY id DESC`
    ).all();
    const { results: fate } = await env.DB.prepare(
      `SELECT * FROM cah_fate_cards ORDER BY id DESC`
    ).all();
    return jsonResponse({ shadow: shadow || [], fate: fate || [] });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

export async function adminCreateCard(request, env, user) {
  try {
    const body = await request.json().catch(() => ({}));
    const { type, text, picks, is_blank } = body;
    if (!type || !['shadow', 'fate'].includes(type)) return errorResponse('type must be shadow or fate', 400);

    if (type === 'shadow') {
      const p = Math.min(2, Math.max(1, parseInt(picks) || 1));
      await env.DB.prepare(
        `INSERT INTO cah_shadow_cards (text, picks, created_by) VALUES (?, ?, ?)`
      ).bind(text || '', p, user.userId).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO cah_fate_cards (text, is_blank, created_by) VALUES (?, ?, ?)`
      ).bind(text || '', is_blank ? 1 : 0, user.userId).run();
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

export async function adminUpdateCard(request, env) {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const id = parts.at(-1);
    const type = parts.at(-2); // shadow or fate
    const body = await request.json().catch(() => ({}));

    if (type === 'shadow') {
      const p = Math.min(2, Math.max(1, parseInt(body.picks) || 1));
      await env.DB.prepare(
        `UPDATE cah_shadow_cards SET text = ?, picks = ? WHERE id = ?`
      ).bind(body.text || '', p, id).run();
    } else {
      await env.DB.prepare(
        `UPDATE cah_fate_cards SET text = ?, is_blank = ? WHERE id = ?`
      ).bind(body.text || '', body.is_blank ? 1 : 0, id).run();
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

export async function adminToggleCard(request, env) {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const id = parts.at(-2);
    const type = parts.at(-3); // shadow or fate

    if (type === 'shadow') {
      await env.DB.prepare(
        `UPDATE cah_shadow_cards SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?`
      ).bind(id).run();
    } else {
      await env.DB.prepare(
        `UPDATE cah_fate_cards SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?`
      ).bind(id).run();
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}

export async function adminDeleteCard(request, env) {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const id = parts.at(-1);
    const type = parts.at(-2); // shadow or fate

    if (type === 'shadow') {
      await env.DB.prepare(`DELETE FROM cah_shadow_cards WHERE id = ?`).bind(id).run();
    } else {
      await env.DB.prepare(`DELETE FROM cah_fate_cards WHERE id = ?`).bind(id).run();
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e.message, 500);
  }
}
