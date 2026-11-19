// pass.js — Pass de Combat (30 niveaux, 100 XP par niveau)
// XP : +10 victoire, +3 défaite, +5 par coup joué (bonus)

const XP_PER_LEVEL = 100;
const MAX_LEVEL = 30;

// Récompenses par niveau
const PASS_REWARDS = {
  1:  { pbucks: 50 },
  2:  { abilities: { pivot: 1 } },
  3:  { pbucks: 30, abilities: { diagonale: 1 } },
  4:  { abilities: { tp: 1 } },
  5:  { chest: 'rare' },
  6:  { pbucks: 50 },
  7:  { abilities: { pivot: 2 } },
  8:  { pbucks: 30, abilities: { diagonale: 1 } },
  9:  { abilities: { tp: 1 } },
  10: { chest: 'epique' },
  11: { pbucks: 30, abilities: { clock: 1 } },
  12: { abilities: { pivot: 2 } },
  13: { pbucks: 50, abilities: { diagonale: 2 } },
  14: { abilities: { tp: 2 } },
  15: { chest: 'epique' },
  16: { pbucks: 80 },
  17: { abilities: { pivot: 2 } },
  18: { pbucks: 50, abilities: { diagonale: 2 } },
  19: { abilities: { tp: 2 } },
  20: { chest: 'mythique' },
  21: { pbucks: 100 },
  22: { abilities: { pivot: 3 } },
  23: { pbucks: 80, abilities: { diagonale: 2 } },
  24: { abilities: { tp: 3 } },
  25: { chest: 'legendaire' },
  26: { pbucks: 150 },
  27: { abilities: { pivot: 3 } },
  28: { pbucks: 100, abilities: { diagonale: 3 } },
  29: { abilities: { tp: 3 } },
  30: { chest: 'legendaire', pbucks: 500 },
};

// Calcule niveau + progression à partir de l'XP cumulée
function levelFromXp(totalXp) {
  const level = Math.min(MAX_LEVEL, Math.floor(totalXp / XP_PER_LEVEL));
  const xpInLevel = totalXp - level * XP_PER_LEVEL;
  const xpToNext = level >= MAX_LEVEL ? 0 : XP_PER_LEVEL - xpInLevel;
  return { level, xpInLevel, xpToNext, maxLevel: MAX_LEVEL };
}

// XP gagnée par partie
function xpForMatch(win, movesPlayed) {
  return (win ? 10 : 3) + (movesPlayed || 0) * 5;
}

// Applique l'XP à un user (en DB), renvoie niveaux franchis
async function applyMatchXp(client, userId, win, movesPlayed) {
  const xpGain = xpForMatch(win, movesPlayed);
  const r = await client.query('SELECT pass_xp, pass_level FROM users WHERE id = $1', [userId]);
  if (r.rowCount === 0) return { error: 'user not found' };
  const oldXp = r.rows[0].pass_xp || 0;
  const oldLevel = r.rows[0].pass_level || 0;
  const newXp = oldXp + xpGain;
  const newLevel = Math.min(MAX_LEVEL, Math.floor(newXp / XP_PER_LEVEL));
  await client.query('UPDATE users SET pass_xp = $1, pass_level = $2 WHERE id = $3', [newXp, newLevel, userId]);
  // Niveaux franchis (pour réclamer)
  const crossed = [];
  for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) crossed.push(lvl);
  return { xpGain, newXp, newLevel, crossed };
}

// Récupère la récompense d'un niveau
function getReward(level) {
  return PASS_REWARDS[level] || null;
}

module.exports = {
  XP_PER_LEVEL, MAX_LEVEL, PASS_REWARDS,
  levelFromXp, xpForMatch, applyMatchXp, getReward,
};
