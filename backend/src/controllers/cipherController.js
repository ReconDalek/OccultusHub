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
  // FNV-1a 32-bit hash — consecutive date strings (which differ by 1 in the
  // last digit) produce completely unrelated seeds, so phrase/cipher selections
  // are uniformly distributed across days instead of drifting by ~1/115 per day.
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash ^= dateStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
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
  'BREAK THE SEAL',
  'RISE FROM DARKNESS',
  'TRUTH IN THE SHADOWS',
  'BEYOND THE VEIL',
  'SACRED AND HIDDEN',
  'ETERNAL VIGILANCE',
  'WHISPERS OF POWER',
  'THE SILENT CROWN',
  'BLOOD BINDS US',
  'RISE AND CONQUER',
  'IN DARKNESS WE THRIVE',
  'THE SECRET KEEPERS',
  'UNITED BY OATH',
  'SHADOW AND FLAME',
  'DESTINY AWAITS US',
  'CLAIM YOUR POWER',
  'THE CIRCLE STANDS',
  'WALK THE HIDDEN PATH',
  'STRENGTH THROUGH SHADOWS',
  'ETERNAL AND UNSEEN',
  'SEEK THE TRUTH',
  'BOUND BY BLOOD',
  'STRENGTH ETERNAL',
  'HIDDEN WISDOM',
  'SHADOWS GUIDE US',
  'THE PATH AWAITS',
  'DARKNESS PREVAILS',
  'WE ARE UNITED',
  'POWER ETERNAL',
  'SACRED OATH',
  'SILENT STRENGTH',
  'VEIL OF SECRETS',
  'ETERNAL SHADOW',
  'RISE WITH PRIDE',
  'DESTINY CALLS',
  'LOYALTY FOREVER',
  'HIDDEN STRENGTH',
  'ORDER ABOVE ALL',
  'DARKNESS REIGNS',
  'UNITY IN SHADOW',
  'POWER OF OATH',
  'ETERNAL DARKNESS',
  'SACRED SHADOW',
  'HIDDEN LEGACY',
  'THE SHADOW CALLS',
  'FOREVER HIDDEN',
  'SHADOW ETERNAL',
  'BOUND IN DARKNESS',
  'STRENGTH OF ORDER',
  'WISDOM IN SHADOWS',
  'ETERNAL BOND',
  'THE DARKNESS HOLDS',
  'SHADOW STRENGTH',
  'FOREVER LOYAL',
  'HIDDEN KNOWLEDGE',
  'ETERNAL SECRECY',
  'SHADOW BROTHERS',
  'THE ORDER PREVAILS',
  'DARKNESS UNITES',
  'SACRED CIRCLE',
  'ETERNAL MYSTERY',
  'HIDDEN CIRCLE',
  'SHADOW EMPIRE',
  'FOREVER UNSEEN',
  'DARKNESS ETERNAL',
  'HIDDEN POWER',
  'OATH ETERNAL',
  'SHADOW COUNCIL',
  'THE VEIL HOLDS',
  'ETERNAL VIGIL',
  'HIDDEN SHADOWS',
  'STRENGTH IN OATH',
  'UNITED IN DARKNESS',
  'FOREVER BOUND',
  'SILENT EMPIRE',
  'THE DARKNESS PREVAILS',
  'ETERNAL ORDER',
  'HIDDEN DESTINY',
  'SHADOW LEGACY',
  'THE CIRCLE ETERNAL',
  'DARKNESS PROTECTS',
  'FOREVER HIDDEN',
  'OATH OF DARKNESS',
  'ETERNAL SHADOW OATH',
  'HIDDEN STRENGTH ETERNAL',
];

// ── Cipher definitions ────────────────────────────────────────────────────────

const CIPHER_TYPES = [
  { type: 'caesar',     name: 'Caesar Cipher',          difficulty: 'Easy'   },
  { type: 'atbash',     name: 'Atbash Cipher',          difficulty: 'Easy'   },
  { type: 'rot13',      name: 'ROT-13',                 difficulty: 'Easy'   },
  { type: 'reverse',    name: 'Reversed Text',          difficulty: 'Easy'   },
  { type: 'nums',       name: 'Number Substitution',    difficulty: 'Medium' },
  { type: 'rail',       name: 'Rail Fence Cipher',      difficulty: 'Medium' },
  { type: 'vigenere',   name: 'Vigenère Cipher',        difficulty: 'Hard'   },
  { type: 'bacon',      name: 'Bacon Cipher',           difficulty: 'Medium' },
  { type: 'simple_sub', name: 'Simple Substitution',    difficulty: 'Hard'   },
  { type: 'keyword',    name: 'Keyword Cipher',         difficulty: 'Hard'   },
  { type: 'polybius',   name: 'Polybius Square',        difficulty: 'Medium' },
  { type: 'columnar',   name: 'Columnar Transposition', difficulty: 'Medium' },
  { type: 'affine',     name: 'Affine Cipher',          difficulty: 'Hard'   },
  { type: 'morse',      name: 'Morse-Like Code',        difficulty: 'Medium' },
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
  // Encode letters only — spaces are stripped so the output matches standard
  // online rail fence decoders (which also expect no spaces in the ciphertext).
  const letters = text.replace(/ /g, '');
  const rows = Array.from({ length: rails }, () => []);
  let row = 0;
  let dir = 1;
  for (const ch of letters) {
    rows[row].push(ch);
    if (row === 0) dir = 1;
    if (row === rails - 1) dir = -1;
    row += dir;
  }
  return rows.flat().join('');
}

function encodeVigenere(text, key) {
  let ki = 0;
  return text.replace(/[A-Z]/g, c => {
    const shift = key.charCodeAt(ki % key.length) - 65;
    ki++;
    return String.fromCharCode(((c.charCodeAt(0) - 65 + shift) % 26) + 65);
  });
}

function encodeBacon(text) {
  // A=00000, B=00001, C=00010, etc (0=A, 1=B)
  const baconAlpha = [
    '00000', '00001', '00010', '00011', '00100', '00101', '00110', '00111',
    '01000', '01001', '01010', '01011', '01100', '01101', '01110', '01111',
    '10000', '10001', '10010', '10011', '10100', '10101', '10110', '10111',
    '11000', '11001'
  ];
  return text.split('').map(c => {
    if (c === ' ') return '  ';
    const idx = c.charCodeAt(0) - 65;
    return baconAlpha[idx] || c;
  }).join(' ');
}


function encodeSimpleSub(text, seed) {
  const rng = seededRandom(seed);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const shuffled = [...alphabet].sort(() => rng() - 0.5);
  const map = {};
  alphabet.forEach((letter, i) => {
    map[letter] = shuffled[i];
  });
  const ciphertext = text.split('').map(c => map[c] || c).join('');
  return { ciphertext, map };
}

function encodeKeyword(text, keyword) {
  // Remove duplicates and append rest of alphabet
  const seen = new Set();
  let key = '';
  for (const c of keyword) {
    if (!seen.has(c)) {
      seen.add(c);
      key += c;
    }
  }
  const remaining = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(c => !seen.has(c));
  const cipher = key + remaining.join('');

  const map = {};
  for (let i = 0; i < 26; i++) {
    map[String.fromCharCode(65 + i)] = cipher[i];
  }
  return text.split('').map(c => map[c] || c).join('');
}

function encodePolybius(text) {
  // 5x5 grid with letters (I/J combined), read as row+col
  const grid = 'ABCDEFGHIKLMNOPQRSTUVWXYZ'.split('');
  const map = {};
  let idx = 0;
  for (let r = 1; r <= 5; r++) {
    for (let c = 1; c <= 5; c++) {
      map[grid[idx]] = `${r}${c}`;
      idx++;
    }
  }
  return text.split('').map(c => {
    if (c === 'J') c = 'I';
    return map[c] || c;
  }).join(' ');
}

function encodeColumnar(text, seed) {
  const rng = seededRandom(seed);
  const cols = Math.floor(rng() * 3) + 3; // 3-5 columns
  const rows = Math.ceil(text.replace(/ /g, '').length / cols);

  // Fill grid row by row
  const grid = [];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      const char = text[idx] || 'X';
      grid[r][c] = char;
      idx++;
    }
  }

  // Read column by column
  let result = '';
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      result += grid[r][c];
    }
    result += ' ';
  }
  return { ciphertext: result.trim(), cols };
}

function encodeAffine(text, seed) {
  const rng = seededRandom(seed);
  const a = [5, 7, 9, 11, 15, 17, 19, 21, 23, 25][Math.floor(rng() * 10)]; // coprime to 26
  const b = Math.floor(rng() * 26);

  const ciphertext = text.split('').map(c => {
    const x = c.charCodeAt(0) - 65;
    const y = (a * x + b) % 26;
    return String.fromCharCode(65 + y);
  }).join('');
  return { ciphertext, a, b };
}

function encodeMorse(text) {
  const morse = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.',
    G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..',
    M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
    S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
    Y: '-.--', Z: '--..'
  };
  return text.split(' ').map(word =>
    word.split('').map(c => morse[c] || c).join('/')
  ).join(' / ');
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
  // Hint now states the cipher type plus whatever key/keyword/parameter is
  // actually needed to decode it, replacing the old conceptual description —
  // this is a casual community puzzle, not a security mechanism, so handing
  // over the exact key is the intended difficulty level.
  let hint = def.name;

  switch (def.type) {
    case 'caesar':
      ciphertext = encodeCaesar(plaintext, extraParam);
      hint = `${def.name} — shift of ${extraParam}`;
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
      hint = `${def.name} — ${rails} rails`;
      break;
    }
    case 'vigenere': {
      const key = VIGENERE_KEYS[extraParam % VIGENERE_KEYS.length];
      ciphertext = encodeVigenere(plaintext, key);
      extra = `Key length: ${key.length}`;
      hint = `${def.name} — key: ${key}`;
      break;
    }
    case 'bacon':
      ciphertext = encodeBacon(plaintext);
      break;
    case 'simple_sub': {
      const result = encodeSimpleSub(plaintext, dateToSeed(dateStr));
      ciphertext = result.ciphertext;
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const mapStr = alphabet.map(l => result.map[l]).join('');
      hint = `${def.name} — cipher alphabet (A-Z maps to): ${mapStr}`;
      break;
    }
    case 'keyword': {
      const keys = ['SHADOW', 'OCCULT', 'ORDER', 'VEIL', 'CIPHER', 'DARK', 'NIGHT', 'HIDDEN', 'POWER', 'SACRED'];
      const keyword = keys[extraParam % keys.length];
      ciphertext = encodeKeyword(plaintext, keyword);
      extra = `Keyword: ${keyword.length} letters`;
      hint = `${def.name} — keyword: ${keyword}`;
      break;
    }
    case 'polybius':
      ciphertext = encodePolybius(plaintext);
      break;
    case 'columnar': {
      const result = encodeColumnar(plaintext, dateToSeed(dateStr));
      ciphertext = result.ciphertext;
      hint = `${def.name} — ${result.cols} columns`;
      break;
    }
    case 'affine': {
      const result = encodeAffine(plaintext, dateToSeed(dateStr));
      ciphertext = result.ciphertext;
      hint = `${def.name} — a=${result.a}, b=${result.b}`;
      break;
    }
    case 'morse':
      ciphertext = encodeMorse(plaintext);
      break;
    default:
      ciphertext = plaintext;
  }

  return { plaintext, ciphertext, type: def.type, name: def.name, difficulty: def.difficulty, hint, extra };
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
