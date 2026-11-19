// ranks.js — définition des 18 paliers (6 tiers × 3 niveaux)
// Plastique 1-3, Bronze 1-3, Argent 1-3, Fer 1-3, Or 1-3, Legendary 1-3

const RANKS = [
  { id: 1,  name: 'Plastique 1',  min: 0,    tier: 'plastique',   level: 1, color: '#9CA3AF' },
  { id: 2,  name: 'Plastique 2',  min: 50,   tier: 'plastique',   level: 2, color: '#9CA3AF' },
  { id: 3,  name: 'Plastique 3',  min: 100,  tier: 'plastique',   level: 3, color: '#9CA3AF' },
  { id: 4,  name: 'Bronze 1',     min: 150,  tier: 'bronze',      level: 1, color: '#CD7F32' },
  { id: 5,  name: 'Bronze 2',     min: 250,  tier: 'bronze',      level: 2, color: '#CD7F32' },
  { id: 6,  name: 'Bronze 3',     min: 350,  tier: 'bronze',      level: 3, color: '#CD7F32' },
  { id: 7,  name: 'Argent 1',     min: 500,  tier: 'argent',      level: 1, color: '#C0C0C0' },
  { id: 8,  name: 'Argent 2',     min: 650,  tier: 'argent',      level: 2, color: '#C0C0C0' },
  { id: 9,  name: 'Argent 3',     min: 800,  tier: 'argent',      level: 3, color: '#C0C0C0' },
  { id: 10, name: 'Fer 1',        min: 1000, tier: 'fer',         level: 1, color: '#71797E' },
  { id: 11, name: 'Fer 2',        min: 1200, tier: 'fer',         level: 2, color: '#71797E' },
  { id: 12, name: 'Fer 3',        min: 1400, tier: 'fer',         level: 3, color: '#71797E' },
  { id: 13, name: 'Or 1',         min: 1700, tier: 'or',          level: 1, color: '#FFD700' },
  { id: 14, name: 'Or 2',         min: 2000, tier: 'or',          level: 2, color: '#FFD700' },
  { id: 15, name: 'Or 3',         min: 2300, tier: 'or',          level: 3, color: '#FFD700' },
  { id: 16, name: 'Legendary 1',  min: 2700, tier: 'legendary',   level: 1, color: '#A855F7' },
  { id: 17, name: 'Legendary 2',  min: 3100, tier: 'legendary',   level: 2, color: '#A855F7' },
  { id: 18, name: 'Legendary 3',  min: 3500, tier: 'legendary',   level: 3, color: '#A855F7' },
];

function rankFromTrophies(trophies) {
  let cur = RANKS[0];
  for (const r of RANKS) {
    if (trophies >= r.min) cur = r;
  }
  return cur;
}

function nextRank(trophies) {
  for (const r of RANKS) {
    if (trophies < r.min) return r;
  }
  return null;
}

module.exports = { RANKS, rankFromTrophies, nextRank };
