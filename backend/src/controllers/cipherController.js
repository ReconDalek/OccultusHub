import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

// ── Seeded PRNG (LCG) ────────────────────────────────────────────────────────

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function dateToSeed(dateStr) {
  return parseInt(dateStr.replace(/-/g, ''), 10);
}

// ── Plaintext phrase pool ─────────────────────────────────────────────────────

const PHRASES = [
  'SHADOWS NEVER LIE',
  'THE ORDER STANDS FIRM',
  'HIDDEN IN PLAIN SIGHT',
  'SILENCE IS POWER',
  'TRUST THE SHADOWS',
  'THE NIGHT WATCHES ALL',
  'POWER THROUGH UNITY',
  'OCCULTUS NEVER FALLS',
  'DARKNESS IS OUR SHIELD',
  'THE VEIL PROTECTS US',
  'STRENGTH IN SECRECY',
  'BOUND BY SHADOW OATH',
  'THE ORDER NEVER SLEEPS',
  'KNOWLEDGE IS POWER',
  'SECRETS FORGE ALLIANCES',
  'THE UNSEEN HAND MOVES',
  'LOYALTY ABOVE ALL ELSE',
  'FEAR THE SILENT ONES',
  'WE STRIKE AS ONE',
  'HONOR THE CODE',
  'DARKNESS BREEDS POWER',
  'THE COUNCIL DECIDES',
  'SWORN TO THE ORDER',
  'HIDDEN PATHS LEAD FAR',
  'THE SHADOW NETWORK GROWS',
  'OCCULTUS STANDS ETERNAL',
  'WE ARE THE UNSEEN',
  'ALLIES IN THE DARK',
  'THE FACTION ENDURES',
  'SILENCE GUARDS OUR SECRETS',
];

// ── Cipher definitions ────────────────────────────────────────────────────────

const CIPHER_TYPES = [
  {
    type: 'caesar',
    name: 'Caesar Cipher',
    difficulty: 'Easy',
    hint: 'Each letter has been shifted a fixed number of positions through the alphabet. Try working backwards.',
  },
  {
    type: 'atbash',
    name: 'Atbash Cipher',
    difficulty: 'Easy',
    hint: 'The alphabet has been reversed — A becomes Z, B becomes Y, and so on.',
  },
  {
    type: 'rot13',
    name: 'ROT-13',
    difficulty: 'Easy',
    hint: 'Each letter has been rotated exactly 13 positions. Applying the same process twice reveals the answer.',
  },
  {
    type: 'reverse',
    name: 'Reversed Text',
    difficulty: 'Easy',
    hint: 'The message has been written backwards. Try reading each word in reverse.',
  },
  {
    type: 'nums',
    name: 'Number Substitution',
    difficulty: 'Medium',
    hint: 'Each number represents a letter\'s position in the alphabet. A=1, B=2, C=3 ... Z=26.',
  },
  {
    type: 'rail',
    name: 'Rail Fence Cipher',
    difficulty: 'Medium',
    hint: 'Letters were written in a zigzag pattern across rows, then read row by row.',
  },
  {
    type: 'vigenere',
    name: 'Vigenère Cipher',
    difficulty: 'Hard',
    hint: 'A hidden keyword shifts each letter by a different amount. Look for repeating patterns.',
  },
];

const VIGENERE_KEYS = ['SHADOW', 'OCCULT', 'ORDER', 'VEIL', 'CIPHER', 'DARK', 'NIGHT'];

// ── Encoding functions ────────────────────────────────────────────────────────

function encodeCaesar(text, shift) {
  return text.replace(/[A-Z]/g, c =>
    String.fromCharCode(((c.charCodeAt(0) - 65 + shift) % 26) + 65)
  );
}

function encodeAtbash(text) {
  return text.replace(/[A-Z]/g, c =>
    String.fromCharCode(90 - (c.charCodeAt(0) - 65))
  );
}

function encodeRot13(text) {
  return encodeCaesar(text, 13);
}

function encodeReverse(text) {
  return text.split(' ').map(w => w.split('').reverse().join('')).join(' ');
}

function encodeNums(text) {
  return text.split('').map(c => {
    if (c === ' ') return ' ';
    return (c.charCodeAt(0) - 64).toString();
  }).join('-').replace(/- -/g, ' ');
}

function encodeRailFence(text, rails) {
  const stripped = text.replace(/ /g, '\x00'); // preserve spaces as marker
  const rows = Array.from({ length: rails }, () => []);
  let row = 0;
  let dir = 1;
  for (const ch of stripped) {
    rows[row].push(ch);
    if (row === 0) dir = 1;
    if (row === rails - 1) dir = -1;
    row += dir;
  }
  return rows.flat().join('').replace(/\x00/g, ' ');
}

function encodeVigenere(text, key) {
  let ki = 0;
  return text.replace(/[A-Z]/g, c => {
    const shift = key.charCodeAt(ki % key.length) - 65;
    ki++;
    return String.fromCharCode(((c.charCodeAt(0) - 65 + shift) % 26) + 65);
  });
}

// ── Daily cipher generator ────────────────────────────────────────────────────

export function generateCipherForDate(dateStr) {
  const rng = seededRandom(dateToSeed(dateStr));

  const phraseIdx = Math.floor(rng() * PHRASES.length);
  const cipherIdx = Math.floor(rng() * CIPHER_TYPES.length);
  const extraParam = Math.floor(rng() * 20) + 3; // shift 3-22 for caesar, rails 2-3 for rail, key index for vigenere

  const plaintext = PHRASES[phraseIdx];
  const def = CIPHER_TYPES[cipherIdx];

  let ciphertext;
  let extra = '';

  switch (def.type) {
    case 'caesar':
      ciphertext = encodeCaesar(plaintext, extraParam);
      break;
    case 'atbash':
      ciphertext = encodeAtbash(plaintext);
      break;
    case 'rot13':
      ciphertext = encodeRot13(plaintext);
      break;
    case 'reverse':
      ciphertext = encodeReverse(plaintext);
      break;
    case 'nums':
      ciphertext = encodeNums(plaintext);
      break;
    case 'rail': {
      const rails = (extraParam % 2) + 2; // 2 or 3 rails
      ciphertext = encodeRailFence(plaintext, rails);
      extra = `${rails} rails`;
      break;
    }
    case 'vigenere': {
      const key = VIGENERE_KEYS[extraParam % VIGENERE_KEYS.length];
      ciphertext = encodeVigenere(plaintext, key);
      extra = `Key length: ${key.length}`;
      break;
    }
    default:
      ciphertext = plaintext;
  }

  return { plaintext, ciphertext, type: def.type, name: def.name, difficulty: def.difficulty, hint: def.hint, extra };
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

// GET /api/cipher/today
export async function getTodayCipher(request, env) {
  const today = new Date().toISOString().slice(0, 10);
  const { ciphertext, name, difficulty, hint, extra } = generateCipherForDate(today);
  return jsonResponse({ date: today, ciphertext, name, difficulty, hint, extra });
}

// POST /api/cipher/submit — works for authenticated members and guests
export async function submitAnswer(request, env, user) {
  const { answer, guestName } = await request.json();
  if (!answer?.trim()) return errorResponse('Answer required', 400);

  const today = new Date().toISOString().slice(0, 10);
  const { plaintext } = generateCipherForDate(today);
  const isCorrect = answer.trim().toUpperCase() === plaintext.toUpperCase() ? 1 : 0;

  if (user) {
    // Authenticated — upsert one submission per user per day
    await env.DB.prepare(`
      INSERT INTO cipher_submissions (user_id, cipher_date, submitted_answer, is_correct)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, cipher_date) DO UPDATE SET
        submitted_answer = excluded.submitted_answer,
        is_correct = excluded.is_correct,
        submitted_at = CURRENT_TIMESTAMP
    `).bind(user.userId, today, answer.trim(), isCorrect).run();
  } else {
    // Guest — requires name, always inserts a new row
    if (!guestName?.trim()) return errorResponse('Name required for guest submissions', 400);
    await env.DB.prepare(`
      INSERT INTO cipher_submissions (user_id, guest_name, cipher_date, submitted_answer, is_correct)
      VALUES (NULL, ?, ?, ?, ?)
    `).bind(guestName.trim(), today, answer.trim(), isCorrect).run();
  }

  return jsonResponse({ isCorrect: isCorrect === 1, plaintext: isCorrect ? plaintext : null });
}

// GET /api/leadership/cipher-submissions?date=YYYY-MM-DD
export async function getCipherSubmissions(request, env) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);

  const rows = await env.DB.prepare(`
    SELECT cs.id, cs.submitted_answer, cs.is_correct, cs.submitted_at,
           COALESCE(u.username, cs.guest_name || ' (Guest)') AS username
    FROM cipher_submissions cs
    LEFT JOIN users u ON u.id = cs.user_id
    WHERE cs.cipher_date = ?
    ORDER BY cs.is_correct DESC, cs.submitted_at ASC
  `).bind(date).all();

  const { plaintext, name, difficulty } = generateCipherForDate(date);
  return jsonResponse({ date, plaintext, name, difficulty, submissions: rows.results });
}
