// The Pact — scenario content. Backend is the sole authority on effects.
// Nights 1-12: fixed. Nights 13-18: any value may be a [worst, mid, best] triple
// selected by the night's Fate's Dice band. `dominionPerThrall` grants Dominion
// scaled by the cabal's CURRENT Thrall count (resolved before other deltas).
// `delayed: { on, effects }` queues a payload that resolves at the START of night `on`.
//
// See docs/the-pact/design.html §VII. Numbers are v1 tuning targets validated by
// docs/the-pact/playtest/montecarlo.mjs.

export const START = { gold: 1000, offerings: 0, dominion: 0, thralls: 0 };
export const OFFERINGS_CAP = 90;
export const OVERFILL_PENALTY = { dominion: -80, thralls: -3 };
export const TOTAL_NIGHTS = 18;
export const DICE_FROM_NIGHT = 13;

// Score = dominion * loyaltyMod * cashMod  (then * DISPLAY_MULT for the leaderboard)
export const SCORE = {
  DISPLAY_MULT: 10,
  loyalty: { base: 0.3, perThrall: 1 / 25, min: 0.3, max: 2.0 },
  cash:    { base: 0.75, perGold: 1 / 4000, min: 0.75, max: 1.5 },
};

export const SEASONS = {
  1: {
    name: 'The First Season',
    setting:
      "You've inherited the Order — a cold chapel above a sealed crypt, and a pact " +
      'with the thing behind the door. Over eighteen nights you feed it, and it ' +
      'feeds you favour.',
    nights: [
      // ── Nights 1–12 · The Bargain (fixed) ────────────────────────────────
      {
        night: 1, title: 'The First Binding',
        body: 'The Order is yours now — a cold chapel, a sealed crypt door, and the pact waiting behind it. It wants a gesture of intent.',
        options: {
          A: { label: 'Copy the old rites alone by candlelight', effects: { dominion: 15, offerings: 2 } },
          B: { label: 'Open a vein at the crypt door', effects: { dominion: 45 } },
          C: { label: 'Preach to the desperate in the square', effects: { thralls: 3 } },
          D: { label: 'Trade coin for herb and bone at the night market', effects: { gold: -350, offerings: 10 } },
        },
      },
      {
        night: 2, title: 'The Hungry Crypt',
        body: 'Something behind the door has not been fed in a long time. It scratches.',
        options: {
          A: { label: 'Bargain with the thing through the door', effects: { gold: -300, dominion: 55 } },
          B: { label: 'Slide a small tribute through the grate', effects: { offerings: -3, dominion: 22, thralls: 1 } },
          C: { label: 'Send a thrall inside to learn what it wants', effects: { thralls: -1, dominion: 60 } },
          D: { label: 'Wall it up tighter and wait', effects: { gold: -150, dominion: 5 } },
        },
      },
      {
        night: 3, title: 'The Rival Coven',
        body: 'A coven across the river proposes an alliance. Their terms favour them.',
        options: {
          A: { label: 'Sell them a share of your favour', effects: { dominion: -35, gold: 550 } },
          B: { label: 'Accept, and pay your half of the joint rite', effects: { gold: -300, dominion: 25, thralls: 3 } },
          C: { label: 'Trade recipes only, nothing binding', effects: { offerings: 6 } },
          D: { label: 'Seize a slice of their standing', effects: { dominion: 50 }, delayed: { on: 6, effects: { gold: 450 } } },
        },
      },
      {
        night: 4, title: "The Bishop's Eye",
        body: "The town's bishop has heard rumours. An inquisitor is asking questions.",
        options: {
          A: { label: "Buy the inquisitor's silence", effects: { gold: -450, dominion: 15 } },
          B: { label: 'Move the rites to the cellar and lie low', effects: { dominion: -12, offerings: 1 } },
          C: { label: 'Curse him from the shadows', effects: { thralls: -2, dominion: 75 } },
          D: { label: 'Preach against him and rally the fearful', effects: { dominion: -10, thralls: 4 } },
        },
      },
      {
        night: 5, title: 'The Glut',
        body: 'A looted reliquary floods the black market. Relics are cheap — a glut that will not last.',
        options: {
          A: { label: 'Buy heavily while it lasts', effects: { gold: -600, offerings: 22 } },
          B: { label: 'Buy a modest share and hire hands to haul it', effects: { gold: -250, offerings: 8, thralls: 2 } },
          C: { label: 'Empty your own vault into the buying frenzy', effects: { offerings: -9, gold: 650 } },
          D: { label: 'Buy one true relic and keep it', effects: { gold: -350, dominion: 45, offerings: 2 } },
        },
      },
      {
        night: 6, title: 'The Long Vigil',
        body: 'The pact asks the Order to hold a rite from dusk till dawn without breaking.',
        options: {
          A: { label: 'Lead the faithful in the full vigil', effects: { gold: -150, dominion: 40, dominionPerThrall: 6 } },
          B: { label: 'A shortened vigil', effects: { gold: -250, dominion: 45 } },
          C: { label: 'Sell your vigil slot to the rival coven', effects: { gold: 600, dominion: -45 } },
          D: { label: 'Burn offerings to carry the rite alone', effects: { offerings: -11, dominion: 70 } },
        },
      },
      {
        night: 7, title: 'The Faithless Steward',
        body: 'Your most senior thrall is skimming tithes and whispering of leaving.',
        options: {
          A: { label: 'Buy back their loyalty', effects: { gold: -500, dominion: 12 } },
          B: { label: 'Let them walk — and half the flock with them', effects: { thralls: -5, dominion: 30 } },
          C: { label: 'Give them to the crypt as an example', effects: { thralls: -2, dominion: 75 } },
          D: { label: 'Negotiate a quiet buyout', effects: { gold: -300, thralls: -1 } },
        },
      },
      {
        night: 8, title: 'The Blood Moon',
        body: 'The moon comes up red. The pact’s power crests and it demands a pyre.',
        options: {
          A: { label: 'A great pyre of offerings', effects: { offerings: -18, dominion: 125 } },
          B: { label: 'A modest pyre', effects: { offerings: -6, dominion: 45 } },
          C: { label: 'Burn bought reagents in their place', effects: { gold: -450, dominion: 55 } },
          D: { label: 'One offering and a prayer', effects: { offerings: -2, dominion: 15, thralls: 1 } },
        },
      },
      {
        night: 9, title: 'The Pilgrims',
        body: 'A column of pilgrims arrives seeking the miracle they have heard of. Flock, or food, or gone.',
        options: {
          A: { label: 'Take them all in, feed and bind them', effects: { offerings: -6, thralls: 5 } },
          B: { label: 'Take a careful few', effects: { dominion: -15, thralls: 3 } },
          C: { label: 'Send them home to spread your name', effects: { gold: -200 }, delayed: { on: 11, effects: { dominion: 60, thralls: 3 } } },
          D: { label: 'Give the column to the crypt', effects: { dominion: 115, thralls: -3 } },
        },
      },
      {
        night: 10, title: 'The Thing That Got Out',
        body: 'Whatever you have been feeding has slipped its bounds and is loose in the crypt tunnels.',
        options: {
          A: { label: 'Spend coin and iron to chain it again', effects: { gold: -450, dominion: 80 } },
          B: { label: 'Drive it back down with the faithful', effects: { dominion: 20, dominionPerThrall: 6, thralls: -1 } },
          C: { label: 'Wall off the lower crypt and abandon it', effects: { gold: -200, dominion: -20, offerings: -3 } },
          D: { label: 'Loose it on the rival coven', effects: { dominion: 100 }, delayed: { on: 12, effects: { thralls: -4 } } },
        },
      },
      {
        night: 11, title: 'The Schism',
        body: 'Two readings of the pact divide the Order. Knives come out.',
        options: {
          A: { label: 'Purge the dissenters', effects: { thralls: -4, dominion: 95 } },
          B: { label: 'Mediate an expensive peace', effects: { gold: -450, dominion: 22, thralls: 1 } },
          C: { label: 'Stand back and let it burn', effects: { thralls: -3, dominion: -10 } },
          D: { label: 'Impose a day of silence', effects: { gold: -120, dominion: 8, thralls: 2 } },
        },
      },
      {
        night: 12, title: 'The Last Certain Bargain',
        body: 'The veil is about to tear. The pact offers one last deal whose outcome is still fixed.',
        options: {
          A: { label: 'Pour in coin and souls for lasting favour', effects: { gold: -550, thralls: -3, dominion: 140 } },
          B: { label: 'A measured pledge', effects: { gold: -250, dominion: 55 } },
          C: { label: 'Fill the vault for the chaos coming', effects: { gold: -450, offerings: 18 } },
          D: { label: 'Call in debts and rally the faithful', effects: { gold: 750, dominion: 10, thralls: 2 } },
        },
      },

      // ── Nights 13–18 · The Thinning (Fate's Dice) ───────────────────────
      {
        night: 13, title: 'The Veil Tears',
        body: 'The certain world ends. Every rite from here answers to Fate.',
        options: {
          A: { label: 'Reach through the tear and take what you can', effects: { gold: [-400, -200, 100], dominion: [-30, 80, 200], offerings: [0, 4, 10] } },
          B: { label: 'A warded, careful reaching', effects: { gold: [-250, -180, -110], dominion: [30, 65, 120] } },
          C: { label: 'Seal the smallest breach and hold position', effects: { gold: [-120, -70, -30], dominion: [12, 28, 50], thralls: [0, 1, 2] } },
          D: { label: 'Bar the doors and wait out the night', effects: { gold: [-20, 30, 100], dominion: [2, 10, 22] } },
        },
      },
      {
        night: 14, title: "The Coven's Reckoning",
        body: 'The rival coven, wounded or emboldened by your earlier moves, comes for you.',
        options: {
          A: { label: 'Strike first, everything committed', effects: { gold: [-350, -250, -150], thralls: [-4, -2, 0], dominion: [30, 120, 260] } },
          B: { label: 'Buy them off', effects: { gold: [-350, -260, -170], dominion: [5, 22, 45] } },
          C: { label: 'Rally the faithful to the walls', effects: { gold: [-100, -60, -20], dominion: [10, 22, 40], dominionPerThrall: [3, 5, 7] } },
          D: { label: 'Let them overextend, promise a later blow', effects: { gold: [-120, -60, 0] }, delayed: { on: 17, effects: { dominion: [40, 110, 230] } } },
        },
      },
      {
        night: 15, title: 'The Hungering Dark',
        body: 'The pact asks for a tribute it has never asked before.',
        options: {
          A: { label: 'Feed the vault to it', effects: { offerings: [-26, -20, -14], dominion: [50, 120, 240], gold: [0, 250, 800] } },
          B: { label: 'A measured tribute', effects: { offerings: [-11, -8, -5], dominion: [35, 75, 140] } },
          C: { label: 'Tribute in blood, not matter', effects: { gold: [-350, -250, -150], thralls: [-3, -2, -1], dominion: [55, 120, 230] } },
          D: { label: 'The smallest acceptable offering', effects: { offerings: [-4, -3, -2], dominion: [8, 18, 35] } },
        },
      },
      {
        night: 16, title: 'The Great Doubt',
        body: 'Half the Order believes the pact has been lying. A test is demanded.',
        options: {
          A: { label: "Stake the Order's faith on one enormous rite", effects: { gold: [-450, -300, -150], thralls: [-5, -2, 2], dominion: [-20, 130, 320] } },
          B: { label: 'A public rite, modest scope', effects: { gold: [-250, -170, -90], dominion: [30, 75, 140], thralls: [-1, 0, 1] } },
          C: { label: 'Let the doubters leave, keep the true', effects: { thralls: [-5, -3, -1], dominion: [30, 75, 150] } },
          D: { label: 'Postpone the test', effects: { gold: [-120, -60, -10], dominion: [-10, 5, 18] } },
        },
      },
      {
        night: 17, title: 'The Debt Comes Due',
        body: 'Every bargain you deferred is called in at once.',
        options: {
          A: { label: 'Settle everything now', effects: { gold: [-420, -320, -220], dominion: [45, 95, 175] } },
          B: { label: 'Refuse, and face what comes', effects: { gold: [-300, -120, 120], dominion: [-70, 35, 180], thralls: [-3, -1, 0] } },
          C: { label: 'Pay the debt in relics', effects: { offerings: [-20, -15, -10], dominion: [40, 90, 180] } },
          D: { label: 'Negotiate a partial settlement', effects: { gold: [-220, -150, -80], dominion: [18, 55, 110] } },
        },
      },
      {
        night: 18, title: 'The Reckoning',
        body: 'The pact offers its final accounting. What you are now is what you will be remembered as.',
        options: {
          A: { label: 'Demand everything it owes you', effects: { gold: [-350, -80, 500], dominion: [-40, 150, 430], thralls: [-4, 0, 4] } },
          B: { label: 'Take a fair and final measure', effects: { gold: [-200, -60, 150], dominion: [65, 160, 320] } },
          C: { label: 'One last rite with everyone who remains', effects: { gold: [-150, -90, -30], dominion: [25, 55, 100], dominionPerThrall: [5, 8, 12] } },
          D: { label: 'Close the books and claim what stands', effects: { gold: [120, 320, 700], dominion: [15, 40, 90] } },
        },
      },
    ],
  },
};

// The low-stakes "hold" option per night — position rotates so it is never
// predictably one letter. Used when a per-night timer expires on a cabal that
// has not committed.
export const HOLD_OPTION = {
  1: 'A', 2: 'D', 3: 'C', 4: 'B', 5: 'B', 6: 'B', 7: 'D', 8: 'D', 9: 'B',
  10: 'C', 11: 'D', 12: 'D', 13: 'D', 14: 'B', 15: 'D', 16: 'D', 17: 'D', 18: 'D',
};

export const ACTIVE_SEASON = 1;

export function getSeason(id = ACTIVE_SEASON) {
  return SEASONS[id] || null;
}

export function getNight(seasonId, night) {
  const s = SEASONS[seasonId];
  if (!s) return null;
  return s.nights.find((n) => n.night === night) || null;
}
