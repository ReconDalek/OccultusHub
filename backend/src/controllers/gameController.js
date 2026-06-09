import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const DAY1_SECS  = 120; // Day 1: discussion only, no voting window
const DAY_SECS   = 150; // Day 2+: 2 min discussion + 30 sec voting window
const NIGHT_SECS = 90;  // 1 min discussion + 30 sec action window

// Inquisitor can only investigate on odd-numbered nights (1, 3, 5...).
// Night number = phase / 2 (nights are always even phases).
function inquisitorCanActThisPhase(phase) {
  const nightNum = phase / 2;
  return nightNum % 2 === 1;
}

function assignRoles(playerCount) {
  const cabals = Math.max(1, Math.floor(playerCount / 4));
  const hasInquisitor = playerCount >= 5;
  const hasWarden     = playerCount >= 6;
  const hasApostate   = playerCount >= 8;
  const hasDeceiver   = playerCount >= 9;
  const hasAcolyte    = playerCount >= 10;
  const specialCount = cabals
    + (hasInquisitor ? 1 : 0) + (hasWarden   ? 1 : 0)
    + (hasApostate   ? 1 : 0) + (hasDeceiver ? 1 : 0)
    + (hasAcolyte    ? 1 : 0);
  const congregation = playerCount - specialCount;

  const roles = [
    ...Array(cabals).fill('cabal'),
    ...Array(congregation).fill('congregation'),
    ...(hasInquisitor ? ['inquisitor'] : []),
    ...(hasWarden     ? ['warden']     : []),
    ...(hasApostate   ? ['apostate']   : []),
    ...(hasDeceiver   ? ['deceiver']   : []),
    ...(hasAcolyte    ? ['acolyte']    : []),
  ];

  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return roles;
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const CABAL_FACTION = ['cabal', 'deceiver'];

function checkWinCondition(players) {
  const alive = players.filter(p => p.is_alive);
  const aliveCabal = alive.filter(p => CABAL_FACTION.includes(p.role)).length;
  // Apostate is neutral — doesn't count as "good" for congregation's protection
  const aliveGood  = alive.filter(p => !CABAL_FACTION.includes(p.role) && p.role !== 'apostate').length;
  if (aliveCabal === 0) return 'congregation';
  if (aliveCabal >= aliveGood) return 'cabal';
  return null;
}

async function oracleMessage(env, roomId, phase, message) {
  await env.DB.prepare(
    `INSERT INTO game_messages (room_id, player_id, display_name, message, channel, phase)
     VALUES (?, NULL, 'The Oracle', ?, 'public', ?)`
  ).bind(roomId, message, phase).run();
}

async function checkAndAdvanceIfExpired(env, room) {
  if (!room.phase_ends_at || !['day', 'night'].includes(room.status)) return room;
  const endsAt = new Date(room.phase_ends_at.replace(' ', 'T') + 'Z');
  if (Date.now() <= endsAt.getTime()) return room;

  const locked = await env.DB.prepare(
    `UPDATE game_rooms SET phase_ends_at = NULL WHERE id = ? AND phase_ends_at = ?`
  ).bind(room.id, room.phase_ends_at).run();

  if (locked.changes === 0) {
    return await env.DB.prepare('SELECT * FROM game_rooms WHERE id = ?').bind(room.id).first();
  }

  if (room.status === 'day')        await resolveDay(env, room);
  else if (room.status === 'night') await resolveNight(env, room);

  return await env.DB.prepare('SELECT * FROM game_rooms WHERE id = ?').bind(room.id).first();
}

// POST /api/game/rooms — create lobby
export async function createRoom(request, env, user) {
  try {
    const body = await request.json().catch(() => ({}));
    const hostName = user?.username || body.guest_name?.trim();
    if (!hostName) return errorResponse('A name is required to host a room', 400);

    let code, attempts = 0;
    while (attempts < 10) {
      code = generateCode();
      const existing = await env.DB.prepare('SELECT id FROM game_rooms WHERE code = ?').bind(code).first();
      if (!existing) break;
      attempts++;
    }

    const room = await env.DB.prepare(
      `INSERT INTO game_rooms (code, host_name, status, lobby_expires_at)
       VALUES (?, ?, 'lobby', datetime('now', '+5 minutes')) RETURNING id`
    ).bind(code, hostName).first();

    const guestToken = user ? null : crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO game_players (room_id, user_id, display_name, is_host, guest_token) VALUES (?, ?, ?, 1, ?)`
    ).bind(room.id, user?.userId || null, hostName, guestToken).run();

    return jsonResponse({ code, guest_token: guestToken });
  } catch (err) {
    console.error('createRoom error:', err);
    return errorResponse('Failed to create room', 500);
  }
}

// POST /api/game/rooms/:code/join
export async function joinRoom(request, env, user) {
  try {
    const code = new URL(request.url).pathname.split('/')[4].toUpperCase();
    const body = await request.json().catch(() => ({}));
    const displayName = user?.username || body.guest_name?.trim();
    if (!displayName) return errorResponse('A name is required', 400);

    const room = await env.DB.prepare('SELECT id, status FROM game_rooms WHERE code = ?').bind(code).first();
    if (!room) return errorResponse('Room not found', 404);
    if (room.status !== 'lobby') return errorResponse('This rite has already begun', 400);

    if (user) {
      const existing = await env.DB.prepare(
        'SELECT id FROM game_players WHERE room_id = ? AND user_id = ?'
      ).bind(room.id, user.userId).first();
      if (existing) return jsonResponse({ already_joined: true });
    }

    const players = await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM game_players WHERE room_id = ?'
    ).bind(room.id).first();
    if (players.cnt >= 16) return errorResponse('Room is full (max 16)', 400);

    const guestToken = user ? null : crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO game_players (room_id, user_id, display_name, guest_token) VALUES (?, ?, ?, ?)`
    ).bind(room.id, user?.userId || null, displayName, guestToken).run();
    await env.DB.prepare(
      `UPDATE game_rooms SET lobby_expires_at = datetime('now', '+5 minutes') WHERE id = ?`
    ).bind(room.id).run();

    return jsonResponse({ joined: true, guest_token: guestToken });
  } catch (err) {
    console.error('joinRoom error:', err);
    return errorResponse('Failed to join room', 500);
  }
}

// POST /api/game/rooms/:code/leave
export async function leaveRoom(request, env, user) {
  try {
    const code = new URL(request.url).pathname.split('/')[4].toUpperCase();
    const body = await request.json().catch(() => ({}));

    const room = await env.DB.prepare('SELECT * FROM game_rooms WHERE code = ?').bind(code).first();
    if (!room) return errorResponse('Room not found', 404);

    if (room.status === 'lobby') {
      // ── Lobby leave: remove player entirely ──────────────────────────
      if (user) {
        await env.DB.prepare('DELETE FROM game_players WHERE room_id = ? AND user_id = ?').bind(room.id, user.userId).run();
      } else if (body.guest_token) {
        await env.DB.prepare('DELETE FROM game_players WHERE room_id = ? AND guest_token = ?').bind(room.id, body.guest_token).run();
      }

      // Close the room if no human players remain (bots alone can't keep a lobby alive)
      const humanRemaining = await env.DB.prepare(
        'SELECT COUNT(*) as cnt FROM game_players WHERE room_id = ? AND is_bot = 0'
      ).bind(room.id).first();
      if (humanRemaining.cnt === 0) {
        await env.DB.prepare('DELETE FROM game_rooms WHERE id = ?').bind(room.id).run();
      } else {
        const stillHost = await env.DB.prepare('SELECT id FROM game_players WHERE room_id = ? AND is_host = 1').bind(room.id).first();
        if (!stillHost) {
          // Promote the next human player to host
          const next = await env.DB.prepare(
            'SELECT id FROM game_players WHERE room_id = ? AND is_bot = 0 ORDER BY joined_at ASC LIMIT 1'
          ).bind(room.id).first();
          if (next) await env.DB.prepare('UPDATE game_players SET is_host = 1 WHERE id = ?').bind(next.id).run();
        }
      }

    } else if (['day', 'night'].includes(room.status)) {
      // ── In-game abandon: mark the player as dead (spectator) ─────────
      let player;
      if (user) {
        player = await env.DB.prepare('SELECT id, display_name, is_alive FROM game_players WHERE room_id = ? AND user_id = ?').bind(room.id, user.userId).first();
      } else if (body.guest_token) {
        player = await env.DB.prepare('SELECT id, display_name, is_alive FROM game_players WHERE room_id = ? AND guest_token = ?').bind(room.id, body.guest_token).first();
      }

      if (player && player.is_alive) {
        await env.DB.prepare('UPDATE game_players SET is_alive = 0 WHERE id = ?').bind(player.id).run();
        await oracleMessage(env, room.id, room.phase, `${player.display_name} has abandoned the circle.`);
      }

      // If no human players remain alive, end the game
      const humanAlive = await env.DB.prepare(
        'SELECT COUNT(*) as cnt FROM game_players WHERE room_id = ? AND is_alive = 1 AND is_bot = 0'
      ).bind(room.id).first();

      if (humanAlive.cnt === 0) {
        await endGame(env, room, 'abandoned');
      } else {
        // Still check normal win condition (player removal may have changed balance)
        const allPlayers = await env.DB.prepare('SELECT role, is_alive FROM game_players WHERE room_id = ?').bind(room.id).all();
        const winner = checkWinCondition(allPlayers.results);
        if (winner) await endGame(env, room, winner);
      }
    }
    // Ended games: just return success (client already redirecting)

    return jsonResponse({ left: true });
  } catch (err) {
    console.error('leaveRoom error:', err);
    return errorResponse('Failed to leave room', 500);
  }
}

// POST /api/game/rooms/:code/start — host only
export async function startGame(request, env, user) {
  try {
    const code = new URL(request.url).pathname.split('/')[4].toUpperCase();
    const body = await request.json().catch(() => ({}));

    const room = await env.DB.prepare('SELECT id, status FROM game_rooms WHERE code = ?').bind(code).first();
    if (!room) return errorResponse('Room not found', 404);
    if (room.status !== 'lobby') return errorResponse('Game already started', 400);

    let hostPlayer;
    if (user) {
      hostPlayer = await env.DB.prepare(
        'SELECT id FROM game_players WHERE room_id = ? AND user_id = ? AND is_host = 1'
      ).bind(room.id, user.userId).first();
    } else if (body.guest_token) {
      hostPlayer = await env.DB.prepare(
        'SELECT id FROM game_players WHERE room_id = ? AND guest_token = ? AND is_host = 1'
      ).bind(room.id, body.guest_token).first();
    }
    if (!hostPlayer) return errorResponse('Only the host can begin the rite', 403);

    const players = await env.DB.prepare('SELECT id FROM game_players WHERE room_id = ?').bind(room.id).all();
    if (players.results.length < 4) return errorResponse('At least 4 players are required to begin', 400);

    const roles = assignRoles(players.results.length);
    const updates = players.results.map((p, i) =>
      env.DB.prepare('UPDATE game_players SET role = ? WHERE id = ?').bind(roles[i], p.id)
    );
    await env.DB.batch(updates);

    await env.DB.prepare(
      `UPDATE game_rooms SET status = 'day', phase = 1, phase_type = 'day',
       phase_ends_at = datetime('now', '+${DAY1_SECS} seconds'),
       lobby_expires_at = NULL WHERE id = ?`
    ).bind(room.id).run();

    await oracleMessage(env, room.id, 1,
      'The Rite begins. Shadows gather. Look around you — not all who stand here are of the Congregation. Today is a day of introduction only — no one will be banished on the first day. Speak freely. The first vote comes tomorrow.'
    );

    // Day 1 is discussion-only — bots do not vote, no banishment occurs
    return jsonResponse({ started: true });
  } catch (err) {
    console.error('startGame error:', err);
    return errorResponse('Failed to start game', 500);
  }
}

// GET /api/game/rooms/:code — poll game state
export async function getRoom(request, env, user) {
  try {
    const url = new URL(request.url);
    const code = url.pathname.split('/')[4].toUpperCase();
    const guestToken = url.searchParams.get('guest_token');
    const since = url.searchParams.get('since') || '0';

    let room = await env.DB.prepare('SELECT * FROM game_rooms WHERE code = ?').bind(code).first();
    if (!room) return errorResponse('Room not found', 404);

    if (room.status === 'lobby' && room.lobby_expires_at) {
      const expiresAt = new Date(room.lobby_expires_at.replace(' ', 'T') + 'Z');
      if (Date.now() > expiresAt.getTime()) {
        await env.DB.prepare('DELETE FROM game_rooms WHERE id = ?').bind(room.id).run();
        return errorResponse('Lobby expired — no game was started', 410);
      }
    }

    room = await checkAndAdvanceIfExpired(env, room);

    const players = await env.DB.prepare(
      `SELECT id, display_name, role, is_alive, is_host, is_bot, user_id, guest_token FROM game_players WHERE room_id = ?`
    ).bind(room.id).all();

    let myPlayer = null;
    if (user)            myPlayer = players.results.find(p => p.user_id === user.userId);
    else if (guestToken) myPlayer = players.results.find(p => p.guest_token === guestToken);

    const sanitizedPlayers = players.results.map(p => {
      const isSelf = myPlayer && p.id === myPlayer.id;
      const showRole = isSelf || !p.is_alive || room.status === 'ended';
      const isCabalAlly = CABAL_FACTION.includes(myPlayer?.role) && CABAL_FACTION.includes(p.role);
      return {
        id: p.id,
        display_name: p.display_name,
        is_alive: p.is_alive,
        is_host: p.is_host,
        is_bot: !!p.is_bot,
        role: (showRole || isCabalAlly) ? p.role : null,
        is_me: isSelf,
      };
    });

    let messages;
    if (CABAL_FACTION.includes(myPlayer?.role) || room.status === 'ended') {
      messages = await env.DB.prepare(
        `SELECT id, player_id, display_name, message, channel, phase, created_at
         FROM game_messages WHERE room_id = ? AND id > ? ORDER BY id ASC LIMIT 100`
      ).bind(room.id, since).all();
    } else {
      messages = await env.DB.prepare(
        `SELECT id, player_id, display_name, message, channel, phase, created_at
         FROM game_messages WHERE room_id = ? AND channel = 'public' AND id > ? ORDER BY id ASC LIMIT 100`
      ).bind(room.id, since).all();
    }

    let myAction = null, myVote = null;
    if (myPlayer) {
      if (room.phase_type === 'night') {
        myAction = await env.DB.prepare(
          `SELECT action_type, target_player_id FROM game_actions
           WHERE room_id = ? AND player_id = ? AND phase = ?`
        ).bind(room.id, myPlayer.id, room.phase).first();
      }
      if (room.phase_type === 'day') {
        myVote = await env.DB.prepare(
          `SELECT target_player_id FROM game_votes
           WHERE room_id = ? AND voter_player_id = ? AND phase = ?`
        ).bind(room.id, myPlayer.id, room.phase).first();
      }
    }

    let voteCounts = [];
    if (room.phase_type === 'day' && room.status === 'day') {
      const votes = await env.DB.prepare(
        `SELECT target_player_id, COUNT(*) as cnt FROM game_votes WHERE room_id = ? AND phase = ?
         GROUP BY target_player_id`
      ).bind(room.id, room.phase).all();
      voteCounts = votes.results;
    }

    let cabalVoteCounts = [];
    if (CABAL_FACTION.includes(myPlayer?.role) && room.status === 'night') {
      const cv = await env.DB.prepare(
        `SELECT target_player_id, COUNT(*) as cnt FROM game_actions
         WHERE room_id = ? AND phase = ? AND action_type = 'kill' GROUP BY target_player_id`
      ).bind(room.id, room.phase).all();
      cabalVoteCounts = cv.results;
    }

    // Per-role state for limited abilities
    let bulletSpent = null;
    let canInvestigateNow = null;
    let anointSpent = null;
    if (myPlayer?.role === 'warden') {
      const bs = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM game_actions WHERE player_id = ? AND action_type IN ('shoot', 'guard_fired')`
      ).bind(myPlayer.id).first();
      bulletSpent = bs.cnt > 0;
    } else if (myPlayer?.role === 'inquisitor') {
      canInvestigateNow = room.status === 'night' ? inquisitorCanActThisPhase(room.phase) : null;
    } else if (myPlayer?.role === 'acolyte') {
      const as = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM game_actions WHERE player_id = ? AND action_type = 'anoint'`
      ).bind(myPlayer.id).first();
      anointSpent = as.cnt > 0;
    }

    // Compute server-side seconds remaining so the client doesn't need to rely on clock sync
    let phaseSecsRemaining = null;
    if (room.phase_ends_at && ['day','night'].includes(room.status)) {
      const endsMs = new Date(room.phase_ends_at.replace(' ', 'T') + 'Z').getTime();
      phaseSecsRemaining = Math.max(0, Math.floor((endsMs - Date.now()) / 1000));
    }

    return jsonResponse({
      room: {
        code: room.code,
        status: room.status,
        phase: room.phase,
        phase_type: room.phase_type,
        winner: room.winner,
        phase_ends_at: room.phase_ends_at || null,
        phase_secs_remaining: phaseSecsRemaining,
        lobby_expires_at: room.lobby_expires_at || null,
      },
      players: sanitizedPlayers,
      messages: messages.results,
      my_player: myPlayer ? {
        id: myPlayer.id,
        role: myPlayer.role,
        is_alive: myPlayer.is_alive,
        is_host: myPlayer.is_host,
        bullet_spent: bulletSpent,
        can_investigate_now: canInvestigateNow,
        anoint_spent: anointSpent,
      } : null,
      my_action: myAction || null,
      my_vote: myVote || null,
      vote_counts: voteCounts,
      cabal_vote_counts: cabalVoteCounts,
    });
  } catch (err) {
    console.error('getRoom error:', err);
    return errorResponse('Failed to fetch room', 500);
  }
}

// POST /api/game/rooms/:code/message
export async function sendMessage(request, env, user) {
  try {
    const code = new URL(request.url).pathname.split('/')[4].toUpperCase();
    const body = await request.json().catch(() => ({}));
    const { message, channel = 'public', guest_token } = body;
    if (!message?.trim()) return errorResponse('Message cannot be empty', 400);
    if (message.trim().length > 500) return errorResponse('Message too long (max 500 chars)', 400);

    const room = await env.DB.prepare('SELECT id, status, phase FROM game_rooms WHERE code = ?').bind(code).first();
    if (!room) return errorResponse('Room not found', 404);
    if (room.status === 'ended') return errorResponse('The rite has concluded', 400);

    let player;
    if (user) {
      player = await env.DB.prepare(
        'SELECT id, display_name, role, is_alive FROM game_players WHERE room_id = ? AND user_id = ?'
      ).bind(room.id, user.userId).first();
    } else if (guest_token) {
      player = await env.DB.prepare(
        'SELECT id, display_name, role, is_alive FROM game_players WHERE room_id = ? AND guest_token = ?'
      ).bind(room.id, guest_token).first();
    }
    if (!player) return errorResponse('You are not in this room', 403);
    if (!player.is_alive && channel !== 'public') return errorResponse('The banished cannot conspire', 403);

    if (room.status === 'night') {
      if (!player.is_alive) return errorResponse('The sacrificed speak no more this night', 403);
      if (channel === 'cabal' && !CABAL_FACTION.includes(player.role)) return errorResponse('You are not of the Cabal', 403);
      if (channel === 'public') return errorResponse('The Congregation sleeps — silence until dawn', 403);
    }
    if (room.status === 'day' && channel !== 'public') {
      return errorResponse('Only cabal channel is restricted to night', 400);
    }

    await env.DB.prepare(
      `INSERT INTO game_messages (room_id, player_id, display_name, message, channel, phase)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(room.id, player.id, player.display_name, message.trim(), channel, room.phase).run();

    return jsonResponse({ sent: true });
  } catch (err) {
    console.error('sendMessage error:', err);
    return errorResponse('Failed to send message', 500);
  }
}

// POST /api/game/rooms/:code/vote
export async function castVote(request, env, user) {
  try {
    const code = new URL(request.url).pathname.split('/')[4].toUpperCase();
    const body = await request.json().catch(() => ({}));
    const { target_player_id, guest_token } = body;
    if (!target_player_id) return errorResponse('No target selected', 400);

    const room = await env.DB.prepare('SELECT id, status, phase FROM game_rooms WHERE code = ?').bind(code).first();
    if (!room) return errorResponse('Room not found', 404);
    if (room.status !== 'day') return errorResponse('Voting only occurs during The Reckoning', 400);
    if (room.phase === 1) return errorResponse('No banishment on the first day', 400);

    let voter;
    if (user) {
      voter = await env.DB.prepare(
        'SELECT id, is_alive FROM game_players WHERE room_id = ? AND user_id = ?'
      ).bind(room.id, user.userId).first();
    } else if (guest_token) {
      voter = await env.DB.prepare(
        'SELECT id, is_alive FROM game_players WHERE room_id = ? AND guest_token = ?'
      ).bind(room.id, guest_token).first();
    }
    if (!voter) return errorResponse('You are not in this room', 403);
    if (!voter.is_alive) return errorResponse('The banished cannot vote', 403);

    const target = await env.DB.prepare(
      'SELECT id, is_alive FROM game_players WHERE id = ? AND room_id = ?'
    ).bind(target_player_id, room.id).first();
    if (!target || !target.is_alive) return errorResponse('Invalid target', 400);
    if (target.id === voter.id) return errorResponse('You cannot vote for yourself', 400);

    await env.DB.prepare(
      `INSERT INTO game_votes (room_id, voter_player_id, target_player_id, phase)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(room_id, voter_player_id, phase)
       DO UPDATE SET target_player_id = excluded.target_player_id, created_at = CURRENT_TIMESTAMP`
    ).bind(room.id, voter.id, target_player_id, room.phase).run();

    const aliveCount = await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM game_players WHERE room_id = ? AND is_alive = 1'
    ).bind(room.id).first();
    const voteCount = await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM game_votes WHERE room_id = ? AND phase = ?'
    ).bind(room.id, room.phase).first();

    if (voteCount.cnt >= aliveCount.cnt) await resolveDay(env, room);

    return jsonResponse({ voted: true });
  } catch (err) {
    console.error('castVote error:', err);
    return errorResponse('Failed to cast vote', 500);
  }
}

// POST /api/game/rooms/:code/action
export async function submitAction(request, env, user) {
  try {
    const code = new URL(request.url).pathname.split('/')[4].toUpperCase();
    const body = await request.json().catch(() => ({}));
    const { action_type, guest_token } = body;
    let { target_player_id } = body;

    const room = await env.DB.prepare('SELECT id, status, phase FROM game_rooms WHERE code = ?').bind(code).first();
    if (!room) return errorResponse('Room not found', 404);
    if (room.status !== 'night') return errorResponse('Actions only occur during The Witching Hour', 400);

    let actor;
    if (user) {
      actor = await env.DB.prepare(
        'SELECT id, role, is_alive FROM game_players WHERE room_id = ? AND user_id = ?'
      ).bind(room.id, user.userId).first();
    } else if (guest_token) {
      actor = await env.DB.prepare(
        'SELECT id, role, is_alive FROM game_players WHERE room_id = ? AND guest_token = ?'
      ).bind(room.id, guest_token).first();
    }
    if (!actor) return errorResponse('You are not in this room', 403);
    if (!actor.is_alive) return errorResponse('The sacrificed cannot act', 403);

    // Role-specific validation
    if (actor.role === 'cabal') {
      if (action_type !== 'kill') return errorResponse('Invalid action for your role', 400);
    } else if (actor.role === 'inquisitor') {
      if (action_type !== 'investigate') return errorResponse('Invalid action for Inquisitor', 400);
      if (!inquisitorCanActThisPhase(room.phase)) {
        return errorResponse('Your sight rests this night — you may only investigate on odd-numbered nights', 400);
      }
    } else if (actor.role === 'warden') {
      if (action_type !== 'shoot' && action_type !== 'guard') {
        return errorResponse('Invalid action for Warden', 400);
      }
      const spent = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM game_actions WHERE player_id = ? AND action_type IN ('shoot', 'guard_fired')`
      ).bind(actor.id).first();
      if (spent.cnt > 0) return errorResponse('Your bullet has already been spent', 400);
    } else if (actor.role === 'deceiver') {
      if (action_type !== 'deceive') return errorResponse('Invalid action for Deceiver', 400);
    } else if (actor.role === 'acolyte') {
      if (action_type !== 'anoint') return errorResponse('Invalid action for Acolyte', 400);
      const spent = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM game_actions WHERE player_id = ? AND action_type = 'anoint'`
      ).bind(actor.id).first();
      if (spent.cnt > 0) return errorResponse('Your blessing has already been bestowed', 400);
    } else {
      return errorResponse('Your role has no night action', 400);
    }

    // Guard targets self — no target_player_id required in body
    if (action_type === 'guard') {
      target_player_id = actor.id;
    } else {
      if (!target_player_id) return errorResponse('No target selected', 400);
      const target = await env.DB.prepare(
        'SELECT id, is_alive FROM game_players WHERE id = ? AND room_id = ?'
      ).bind(target_player_id, room.id).first();
      if (!target || !target.is_alive) return errorResponse('Invalid target', 400);
      if (target.id === actor.id) return errorResponse('Cannot target yourself', 400);
    }

    await env.DB.prepare(
      `INSERT INTO game_actions (room_id, player_id, action_type, target_player_id, phase)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(room_id, player_id, phase)
       DO UPDATE SET target_player_id = excluded.target_player_id, action_type = excluded.action_type`
    ).bind(room.id, actor.id, action_type, target_player_id, room.phase).run();

    // Auto-advance if all required role-players have submitted.
    // Required: all alive Cabal + Deceiver + alive Inquisitor (odd nights) + alive Warden (bullet not spent)
    // Acolyte is NOT required — they may choose to hold their blessing.
    const cabalCount = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM game_players WHERE room_id = ? AND is_alive = 1 AND role = 'cabal'`
    ).bind(room.id).first();

    const deceiverCount = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM game_players WHERE room_id = ? AND is_alive = 1 AND role = 'deceiver'`
    ).bind(room.id).first();

    let inqCount = { cnt: 0 };
    if (inquisitorCanActThisPhase(room.phase)) {
      inqCount = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM game_players WHERE room_id = ? AND is_alive = 1 AND role = 'inquisitor'`
      ).bind(room.id).first();
    }

    const wardenCount = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM game_players gp
       WHERE gp.room_id = ? AND gp.is_alive = 1 AND gp.role = 'warden'
       AND (SELECT COUNT(*) FROM game_actions ga WHERE ga.player_id = gp.id AND ga.action_type IN ('shoot', 'guard_fired')) = 0`
    ).bind(room.id).first();

    const requiredCount = cabalCount.cnt + deceiverCount.cnt + inqCount.cnt + wardenCount.cnt;
    // Exclude 'anoint' so an Acolyte submitting early can't prematurely trigger auto-advance
    const actionsDone = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM game_actions WHERE room_id = ? AND phase = ? AND action_type != 'anoint'`
    ).bind(room.id, room.phase).first();

    if (actionsDone.cnt >= requiredCount) await resolveNight(env, room);

    return jsonResponse({ action_submitted: true });
  } catch (err) {
    console.error('submitAction error:', err);
    return errorResponse('Failed to submit action', 500);
  }
}

// POST /api/game/rooms/:code/advance — host manual advance
export async function advancePhase(request, env, user) {
  try {
    const code = new URL(request.url).pathname.split('/')[4].toUpperCase();
    const body = await request.json().catch(() => ({}));

    const room = await env.DB.prepare('SELECT id, status, phase FROM game_rooms WHERE code = ?').bind(code).first();
    if (!room) return errorResponse('Room not found', 404);
    if (room.status === 'lobby' || room.status === 'ended') return errorResponse('Cannot advance phase now', 400);

    let hostPlayer;
    if (user) {
      hostPlayer = await env.DB.prepare(
        'SELECT id FROM game_players WHERE room_id = ? AND user_id = ? AND is_host = 1'
      ).bind(room.id, user.userId).first();
    } else if (body.guest_token) {
      hostPlayer = await env.DB.prepare(
        'SELECT id FROM game_players WHERE room_id = ? AND guest_token = ? AND is_host = 1'
      ).bind(room.id, body.guest_token).first();
    }
    if (!hostPlayer) return errorResponse('Only the host can advance the phase', 403);

    if (room.status === 'day')        await resolveDay(env, room);
    else if (room.status === 'night') await resolveNight(env, room);

    return jsonResponse({ advanced: true });
  } catch (err) {
    console.error('advancePhase error:', err);
    return errorResponse('Failed to advance phase', 500);
  }
}

async function resolveDay(env, room) {
  // Day 1 is discussion-only — skip all vote logic, just transition to night
  if (room.phase === 1) {
    const nextPhase = 2;
    await env.DB.prepare(
      `UPDATE game_rooms SET status = 'night', phase = ?, phase_type = 'night',
       phase_ends_at = datetime('now', '+${NIGHT_SECS} seconds') WHERE id = ?`
    ).bind(nextPhase, room.id).run();
    await oracleMessage(env, room.id, nextPhase,
      'The sun descends below the horizon. Darkness falls upon the circle. The Witching Hour begins — something moves in the shadows.'
    );
    await botActForPhase(env, room.id, nextPhase, 'night');
    return;
  }

  const votes = await env.DB.prepare(
    `SELECT target_player_id, COUNT(*) as cnt FROM game_votes
     WHERE room_id = ? AND phase = ? GROUP BY target_player_id ORDER BY cnt DESC`
  ).bind(room.id, room.phase).all();

  let banished = null;
  if (votes.results.length > 0) {
    const top = votes.results[0];
    const second = votes.results[1];
    if (!second || top.cnt > second.cnt) {
      banished = await env.DB.prepare(
        'SELECT id, display_name, role FROM game_players WHERE id = ?'
      ).bind(top.target_player_id).first();
    }
  }

  if (banished) {
    await env.DB.prepare('UPDATE game_players SET is_alive = 0 WHERE id = ?').bind(banished.id).run();
    if (banished.role === 'apostate') {
      await oracleMessage(env, room.id, room.phase,
        `${banished.display_name} steps forward with a hollow smile as the circle casts its judgment. They wanted this. The Congregation has been deceived — ${banished.display_name} was The Apostate.`
      );
      return endGame(env, room, 'apostate');
    }
    await oracleMessage(env, room.id, room.phase,
      `By the will of the Congregation, ${banished.display_name} has been banished from the circle. They were ${roleDisplayName(banished.role)}.`
    );
  } else {
    await oracleMessage(env, room.id, room.phase,
      'The votes are deadlocked. The Congregation reaches no consensus. No one is banished this Reckoning.'
    );
  }

  const players = await env.DB.prepare('SELECT role, is_alive FROM game_players WHERE room_id = ?').bind(room.id).all();
  const winner = checkWinCondition(players.results);
  if (winner) return endGame(env, room, winner);

  const nextPhase = room.phase + 1;
  await env.DB.prepare(
    `UPDATE game_rooms SET status = 'night', phase = ?, phase_type = 'night',
     phase_ends_at = datetime('now', '+${NIGHT_SECS} seconds') WHERE id = ?`
  ).bind(nextPhase, room.id).run();
  await oracleMessage(env, room.id, nextPhase,
    'Darkness descends. The Witching Hour begins. The Congregation sleeps... but something stirs in the shadows.'
  );
  await botActForPhase(env, room.id, nextPhase, 'night');
}

async function resolveNight(env, room) {
  const actions = await env.DB.prepare(
    `SELECT ga.action_type, ga.target_player_id, ga.player_id,
            gp.display_name as actor_name, gp.role as actor_role
     FROM game_actions ga JOIN game_players gp ON ga.player_id = gp.id
     WHERE ga.room_id = ? AND ga.phase = ?`
  ).bind(room.id, room.phase).all();

  const kills        = actions.results.filter(a => a.action_type === 'kill');
  const guards       = actions.results.filter(a => a.action_type === 'guard');
  const shoots       = actions.results.filter(a => a.action_type === 'shoot');
  const investigates = actions.results.filter(a => a.action_type === 'investigate');
  const anoints      = actions.results.filter(a => a.action_type === 'anoint');
  const deceives     = actions.results.filter(a => a.action_type === 'deceive');

  let nightHadEvent = false;

  // ── Cabal kill: plurality vote, random tiebreak ───────────────────────
  let chosenKillTarget = null;
  if (kills.length > 0) {
    const tally = {};
    for (const k of kills) tally[k.target_player_id] = (tally[k.target_player_id] || 0) + 1;
    const sorted = Object.entries(tally).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return Math.random() - 0.5;
    });
    chosenKillTarget = parseInt(sorted[0][0]);
  }

  // ── Warden guard: reactive self-defense ──────────────────────────────
  for (const guard of guards) {
    if (chosenKillTarget === guard.player_id) {
      // Guard fires — Warden was targeted
      const warden = await env.DB.prepare('SELECT display_name FROM game_players WHERE id = ?')
        .bind(guard.player_id).first();
      const attackers = kills.filter(k => k.target_player_id === guard.player_id);
      const pickedAttacker = attackers[Math.floor(Math.random() * attackers.length)];

      if (pickedAttacker) {
        const atk = await env.DB.prepare('SELECT id, display_name FROM game_players WHERE id = ?')
          .bind(pickedAttacker.player_id).first();
        if (atk) {
          await env.DB.prepare('UPDATE game_players SET is_alive = 0 WHERE id = ?').bind(atk.id).run();
          await oracleMessage(env, room.id, room.phase,
            `The Cabal reached for ${warden?.display_name} in the dark — but the Warden was ready. ${atk.display_name} is struck down by their counter-attack.`
          );
          nightHadEvent = true;
        }
      }
      // Bullet fired — mark as guard_fired so it can't be used again
      await env.DB.prepare(
        `UPDATE game_actions SET action_type = 'guard_fired' WHERE player_id = ? AND phase = ?`
      ).bind(guard.player_id, room.phase).run();
      // Warden survives — nullify the Cabal kill
      chosenKillTarget = null;
    }
    // If not targeted: guard stays as 'guard' (bullet not spent), Warden can use it next night
  }

  // ── Acolyte anoint: protects target from cabal kill ──────────────────
  if (chosenKillTarget !== null && anoints.length > 0) {
    const shielded = anoints.find(a => a.target_player_id === chosenKillTarget);
    if (shielded) {
      const protected_player = await env.DB.prepare('SELECT display_name FROM game_players WHERE id = ?')
        .bind(chosenKillTarget).first();
      await oracleMessage(env, room.id, room.phase,
        `A protective blessing shields ${protected_player?.display_name} from harm. The Cabal's sacrifice is turned away.`
      );
      chosenKillTarget = null;
      nightHadEvent = true;
    }
  }

  // ── Warden proactive shoot ────────────────────────────────────────────
  for (const shot of shoots) {
    const target = await env.DB.prepare('SELECT id, display_name, role FROM game_players WHERE id = ?')
      .bind(shot.target_player_id).first();
    const shooter = await env.DB.prepare('SELECT id, display_name FROM game_players WHERE id = ?')
      .bind(shot.player_id).first();
    if (!target) continue;

    await env.DB.prepare('UPDATE game_players SET is_alive = 0 WHERE id = ?').bind(target.id).run();
    if (target.role === 'cabal') {
      await oracleMessage(env, room.id, room.phase,
        `The Warden's aim was true. ${target.display_name} has been shot — they were ${roleDisplayName(target.role)}.`
      );
    } else {
      await oracleMessage(env, room.id, room.phase,
        `The Warden fired upon ${target.display_name}. The shot found its mark — but ${target.display_name} was ${roleDisplayName(target.role)}. The circle mourns an innocent lost to misjudgment.`
      );
    }
    nightHadEvent = true;
  }

  // ── Cabal kill (if not nullified by Warden guard) ─────────────────────
  if (chosenKillTarget !== null) {
    const victim = await env.DB.prepare('SELECT id, display_name FROM game_players WHERE id = ?')
      .bind(chosenKillTarget).first();
    if (victim) {
      await env.DB.prepare('UPDATE game_players SET is_alive = 0 WHERE id = ?').bind(victim.id).run();
      await oracleMessage(env, room.id, room.phase,
        `As dawn breaks, the Congregation discovers ${victim.display_name} was sacrificed in the night. They are gone.`
      );
      nightHadEvent = true;
    }
  }

  if (!nightHadEvent) {
    await oracleMessage(env, room.id, room.phase,
      'The night passes in silence. The Witching Hour claims no sacrifice.'
    );
  }

  // ── Inquisitor investigate (private) ──────────────────────────────────
  for (const inv of investigates) {
    const target = await env.DB.prepare('SELECT id, display_name, role FROM game_players WHERE id = ?')
      .bind(inv.target_player_id).first();
    if (!target) continue;
    const wasDeceived = deceives.some(d => d.target_player_id === inv.target_player_id);
    const actuallyEvil = CABAL_FACTION.includes(target.role);
    const appearsEvil  = wasDeceived ? !actuallyEvil : actuallyEvil;
    const isEvil = appearsEvil
      ? 'TAINTED — a servant of the Cabal'
      : 'PURE — not of the Cabal';
    await env.DB.prepare(
      `INSERT INTO game_messages (room_id, player_id, display_name, message, channel, phase)
       VALUES (?, ?, 'The Oracle', ?, 'inquisitor', ?)`
    ).bind(room.id, inv.player_id, `Your sight reveals: ${target.display_name} is ${isEvil}.`, room.phase).run();
  }

  // ── Win check ─────────────────────────────────────────────────────────
  const players = await env.DB.prepare('SELECT role, is_alive FROM game_players WHERE room_id = ?').bind(room.id).all();
  const winner = checkWinCondition(players.results);
  if (winner) return endGame(env, room, winner);

  const nextPhase = room.phase + 1;
  await env.DB.prepare(
    `UPDATE game_rooms SET status = 'day', phase = ?, phase_type = 'day',
     phase_ends_at = datetime('now', '+${DAY_SECS} seconds') WHERE id = ?`
  ).bind(nextPhase, room.id).run();
  await oracleMessage(env, room.id, nextPhase,
    "Dawn rises on the circle. Another Reckoning begins. Speak your suspicions and cast your judgment upon the Cabal's agents."
  );
  await botActForPhase(env, room.id, nextPhase, 'day');
}

// ── Bot auto-actions ────────────────────────────────────────────────────────

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function botActForPhase(env, roomId, phase, status) {
  const { results: allPlayers } = await env.DB.prepare(
    `SELECT id, role, is_alive, is_bot FROM game_players WHERE room_id = ?`
  ).bind(roomId).all();

  const bots      = allPlayers.filter(p => p.is_bot && p.is_alive);
  const nonBots   = allPlayers.filter(p => !p.is_bot && p.is_alive);
  const alive     = allPlayers.filter(p => p.is_alive);

  if (bots.length === 0) return;

  if (status === 'day') {
    if (phase === 1) return; // Day 1 is discussion-only — no bot votes
    // Bots vote for a random non-bot alive player (fallback: any alive non-self)
    const stmts = [];
    for (const bot of bots) {
      const targets = (nonBots.length > 0 ? nonBots : alive).filter(p => p.id !== bot.id);
      if (!targets.length) continue;
      const target = pickRandom(targets);
      stmts.push(env.DB.prepare(
        `INSERT INTO game_votes (room_id, voter_player_id, target_player_id, phase)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(room_id, voter_player_id, phase) DO UPDATE SET target_player_id = excluded.target_player_id`
      ).bind(roomId, bot.id, target.id, phase));
    }
    if (stmts.length) await env.DB.batch(stmts);

    // Check if all alive players have voted → auto-resolve
    const room = await env.DB.prepare('SELECT * FROM game_rooms WHERE id = ?').bind(roomId).first();
    if (!room || room.status !== 'day') return;
    const voteCount  = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM game_votes WHERE room_id = ? AND phase = ?`).bind(roomId, phase).first();
    const aliveCount = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM game_players WHERE room_id = ? AND is_alive = 1`).bind(roomId).first();
    if (voteCount.cnt >= aliveCount.cnt) await resolveDay(env, room);

  } else if (status === 'night') {
    const nonCabal  = alive.filter(p => !CABAL_FACTION.includes(p.role));
    const anyCabal  = alive.filter(p => CABAL_FACTION.includes(p.role));
    const stmts     = [];

    for (const bot of bots) {
      let action_type = null, target_id = null;

      if (bot.role === 'cabal') {
        const targets = nonCabal.filter(p => p.id !== bot.id);
        if (!targets.length) continue;
        action_type = 'kill'; target_id = pickRandom(targets).id;
      } else if (bot.role === 'deceiver') {
        const targets = nonCabal.filter(p => p.id !== bot.id);
        if (!targets.length) continue;
        action_type = 'deceive'; target_id = pickRandom(targets).id;
      } else if (bot.role === 'inquisitor' && inquisitorCanActThisPhase(phase)) {
        const targets = alive.filter(p => p.id !== bot.id);
        if (!targets.length) continue;
        action_type = 'investigate'; target_id = pickRandom(targets).id;
      } else if (bot.role === 'warden') {
        // Check bullet not spent
        const spent = await env.DB.prepare(
          `SELECT COUNT(*) as cnt FROM game_actions WHERE player_id = ? AND action_type IN ('shoot', 'guard_fired')`
        ).bind(bot.id).first();
        if (spent.cnt > 0) continue;
        action_type = 'guard'; target_id = bot.id;
      } else {
        continue; // congregation, apostate, acolyte — not required
      }

      stmts.push(env.DB.prepare(
        `INSERT INTO game_actions (room_id, player_id, action_type, target_player_id, phase)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(room_id, player_id, phase) DO UPDATE SET action_type = excluded.action_type, target_player_id = excluded.target_player_id`
      ).bind(roomId, bot.id, action_type, target_id, phase));
    }
    if (stmts.length) await env.DB.batch(stmts);

    // Check if all required actors have submitted → auto-resolve
    const room = await env.DB.prepare('SELECT * FROM game_rooms WHERE id = ?').bind(roomId).first();
    if (!room || room.status !== 'night') return;

    const cabalCount   = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM game_players WHERE room_id = ? AND is_alive = 1 AND role = 'cabal'`).bind(roomId).first();
    const deceiverCount= await env.DB.prepare(`SELECT COUNT(*) as cnt FROM game_players WHERE room_id = ? AND is_alive = 1 AND role = 'deceiver'`).bind(roomId).first();
    let inqCount = { cnt: 0 };
    if (inquisitorCanActThisPhase(phase)) {
      inqCount = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM game_players WHERE room_id = ? AND is_alive = 1 AND role = 'inquisitor'`).bind(roomId).first();
    }
    const wardenCount  = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM game_players gp WHERE gp.room_id = ? AND gp.is_alive = 1 AND gp.role = 'warden'
       AND (SELECT COUNT(*) FROM game_actions ga WHERE ga.player_id = gp.id AND ga.action_type IN ('shoot', 'guard_fired')) = 0`
    ).bind(roomId).first();
    const required     = cabalCount.cnt + deceiverCount.cnt + inqCount.cnt + wardenCount.cnt;
    const done         = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM game_actions WHERE room_id = ? AND phase = ? AND action_type != 'anoint'`).bind(roomId, phase).first();
    if (done.cnt >= required) await resolveNight(env, room);
  }
}

// POST /api/game/rooms/:code/fill-bots — admin only
export async function fillBots(request, env, user) {
  try {
    const code = new URL(request.url).pathname.split('/')[4].toUpperCase();
    const body = await request.json().catch(() => ({}));

    const room = await env.DB.prepare('SELECT id, status FROM game_rooms WHERE code = ?').bind(code).first();
    if (!room) return errorResponse('Room not found', 404);
    if (room.status !== 'lobby') return errorResponse('Can only fill bots in lobby', 400);

    const { results: players } = await env.DB.prepare(
      'SELECT id FROM game_players WHERE room_id = ?'
    ).bind(room.id).all();

    const current = players.length;
    const target  = Math.max(4, parseInt(body.count) || 4);
    const needed  = target - current;
    if (needed <= 0) return jsonResponse({ added: 0 });

    const stmts = [];
    for (let i = 0; i < needed; i++) {
      stmts.push(env.DB.prepare(
        `INSERT INTO game_players (room_id, display_name, is_bot) VALUES (?, ?, 1)`
      ).bind(room.id, `Bot_${current + i + 1}`));
    }
    await env.DB.batch(stmts);

    return jsonResponse({ added: needed });
  } catch (err) {
    console.error('fillBots error:', err);
    return errorResponse('Failed to fill bots', 500);
  }
}

async function endGame(env, room, winner) {
  await env.DB.prepare(
    `UPDATE game_rooms SET status = 'ended', winner = ?, ended_at = CURRENT_TIMESTAMP, phase_ends_at = NULL WHERE id = ?`
  ).bind(winner, room.id).run();
  const winMsg = winner === 'congregation'
    ? 'The Congregation has prevailed! All Cabal agents have been banished. The circle is purified. The Rite is complete.'
    : winner === 'apostate'
    ? 'The Apostate has claimed their dark victory. Banished willingly into the void, they have won. The circle\'s judgment fell upon the wrong soul.'
    : winner === 'abandoned'
    ? 'The circle has been abandoned. All mortals have fled. The shadows claim the empty ground.'
    : 'The Cabal has claimed dominion. They now outnumber the Congregation. The shadows have won. The Rite is forfeit.';
  await oracleMessage(env, room.id, room.phase, winMsg);
}

function roleDisplayName(role) {
  const map = {
    cabal: 'a Cabal Agent', congregation: 'of the Congregation',
    inquisitor: 'the Inquisitor', warden: 'the Warden',
    apostate: 'the Apostate', deceiver: 'the Deceiver', acolyte: 'the Acolyte',
  };
  return map[role] || role;
}

// GET /api/game/current
export async function getCurrentRoom(request, env) {
  try {
    const room = await env.DB.prepare(
      `SELECT id, code, status, phase, phase_type, host_name, created_at FROM game_rooms
       WHERE status != 'ended' ORDER BY created_at DESC LIMIT 1`
    ).first();
    if (!room) return jsonResponse({ room: null });

    const players = await env.DB.prepare(
      `SELECT display_name, is_alive FROM game_players WHERE room_id = ? ORDER BY joined_at ASC`
    ).bind(room.id).all();

    return jsonResponse({
      room: {
        code: room.code, status: room.status, phase: room.phase,
        phase_type: room.phase_type, host_name: room.host_name,
        player_count: players.results.length, players: players.results,
      }
    });
  } catch (err) {
    console.error('getCurrentRoom error:', err);
    return errorResponse('Failed to get current room', 500);
  }
}

// POST /api/game/current/join
export async function joinOrCreate(request, env, user) {
  try {
    const body = await request.json().catch(() => ({}));
    const displayName = user?.username || body.guest_name?.trim();
    if (!displayName) return errorResponse('A name is required', 400);

    let room = await env.DB.prepare(
      `SELECT id, code, status, lobby_expires_at FROM game_rooms
       WHERE status = 'lobby' AND (lobby_expires_at IS NULL OR lobby_expires_at > datetime('now'))
       ORDER BY created_at DESC LIMIT 1`
    ).first();

    let isHost = false;
    if (!room) {
      let code;
      for (let i = 0; i < 10; i++) {
        code = generateCode();
        const exists = await env.DB.prepare('SELECT id FROM game_rooms WHERE code = ?').bind(code).first();
        if (!exists) break;
      }
      room = await env.DB.prepare(
        `INSERT INTO game_rooms (code, host_name, status, lobby_expires_at)
         VALUES (?, ?, 'lobby', datetime('now', '+5 minutes')) RETURNING id, code, status`
      ).bind(code, displayName).first();
      isHost = true;
    } else {
      if (user) {
        const existing = await env.DB.prepare(
          'SELECT id FROM game_players WHERE room_id = ? AND user_id = ?'
        ).bind(room.id, user.userId).first();
        if (existing) return jsonResponse({ code: room.code, guest_token: null, already_joined: true });
      }
    }

    const count = await env.DB.prepare('SELECT COUNT(*) as cnt FROM game_players WHERE room_id = ?').bind(room.id).first();
    if (count.cnt >= 16) return errorResponse('Lobby is full (max 16)', 400);

    const guestToken = user ? null : crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO game_players (room_id, user_id, display_name, is_host, guest_token) VALUES (?, ?, ?, ?, ?)`
    ).bind(room.id, user?.userId || null, displayName, isHost ? 1 : 0, guestToken).run();
    await env.DB.prepare(
      `UPDATE game_rooms SET lobby_expires_at = datetime('now', '+5 minutes') WHERE id = ?`
    ).bind(room.id).run();

    return jsonResponse({ code: room.code, guest_token: guestToken });
  } catch (err) {
    console.error('joinOrCreate error:', err);
    return errorResponse('Failed to join lobby', 500);
  }
}

// GET /api/game/rooms/:code/inquisitor-messages
export async function getInquisitorMessages(request, env, user) {
  try {
    const url = new URL(request.url);
    const code = url.pathname.split('/')[4].toUpperCase();
    const guestToken = url.searchParams.get('guest_token');

    const room = await env.DB.prepare('SELECT id FROM game_rooms WHERE code = ?').bind(code).first();
    if (!room) return errorResponse('Room not found', 404);

    let player;
    if (user) {
      player = await env.DB.prepare(
        'SELECT id, role FROM game_players WHERE room_id = ? AND user_id = ?'
      ).bind(room.id, user.userId).first();
    } else if (guestToken) {
      player = await env.DB.prepare(
        'SELECT id, role FROM game_players WHERE room_id = ? AND guest_token = ?'
      ).bind(room.id, guestToken).first();
    }
    if (!player || player.role !== 'inquisitor') return errorResponse('Access denied', 403);

    const msgs = await env.DB.prepare(
      `SELECT message, phase, created_at FROM game_messages
       WHERE room_id = ? AND channel = 'inquisitor' AND player_id = ? ORDER BY id ASC`
    ).bind(room.id, player.id).all();

    return jsonResponse({ messages: msgs.results });
  } catch (err) {
    console.error('getInquisitorMessages error:', err);
    return errorResponse('Failed to fetch messages', 500);
  }
}
