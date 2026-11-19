// routes/pass.js — Pass de Combat : info, claim
const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { requireAuth, wrap } = require('./_middleware');
const { levelFromXp, PASS_REWARDS, getReward } = require('../pass');
const { grantChestRewards } = require('../chests');

// GET /api/pass — état du pass pour la saison courante
router.get('/', requireAuth, wrap(async (req, res) => {
  const season = await require('../seasons').getCurrentSeason();
  const u = req.user;
  const { level, xpInLevel, xpToNext, maxLevel } = levelFromXp(u.pass_xp || 0);
  // Récupérer les claims déjà faits
  const claims = await query(
    'SELECT level FROM pass_claims WHERE user_id = $1 AND season_id = $2',
    [u.id, season.id]
  );
  const claimedSet = new Set(claims.rows.map(c => c.level));
  const rewards = [];
  for (let lvl = 1; lvl <= 30; lvl++) {
    rewards.push({
      level: lvl,
      reward: PASS_REWARDS[lvl] || null,
      claimed: claimedSet.has(lvl),
      available: lvl <= level,
    });
  }
  res.json({
    season: { id: season.id, name: season.name, start_date: season.start_date, end_date: season.end_date },
    xp: u.pass_xp || 0,
    level, xpInLevel, xpToNext, maxLevel,
    rewards,
  });
}));

// POST /api/pass/claim — réclamer une récompense
// body: { level }
router.post('/claim', requireAuth, wrap(async (req, res) => {
  const level = parseInt(req.body.level, 10);
  if (!level || level < 1 || level > 30) return res.status(400).json({ error: 'Niveau invalide' });
  const reward = getReward(level);
  if (!reward) return res.status(400).json({ error: 'Pas de récompense pour ce niveau' });

  const season = await require('../seasons').getCurrentSeason();
  try {
    const granted = await withTransaction(async (client) => {
      // Vérifier niveau atteint
      const u = await client.query('SELECT pass_xp, pass_level FROM users WHERE id = $1', [req.user.id]);
      const info = levelFromXp(u.rows[0].pass_xp || 0);
      if (level > info.level) throw new Error('Niveau non atteint');
      // Tenter insert dans pass_claims (PK = user,season,level)
      try {
        await client.query(
          'INSERT INTO pass_claims (user_id, season_id, level) VALUES ($1, $2, $3)',
          [req.user.id, season.id, level]
        );
      } catch (e) {
        if (e.code === '23505') throw new Error('Récompense déjà réclamée');
        throw e;
      }
      // Appliquer la récompense
      if (reward.pbucks) {
        await client.query('UPDATE users SET pbucks = pbucks + $1 WHERE id = $2', [reward.pbucks, req.user.id]);
      }
      if (reward.abilities) {
        for (const [ab, q] of Object.entries(reward.abilities)) {
          await client.query(`
            INSERT INTO user_inventory (user_id, ability_type, quantity)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, ability_type)
            DO UPDATE SET quantity = user_inventory.quantity + $3
          `, [req.user.id, ab, q]);
        }
      }
      if (reward.chest) {
        // Accorder immédiatement un coffre unopened
        await client.query(
          `INSERT INTO user_chests (user_id, chest_type, status) VALUES ($1, $2, 'unopened')`,
          [req.user.id, reward.chest]
        );
      }
      return reward;
    });
    res.json({ ok: true, level, granted });
  } catch (e) {
    if (e.message === 'Niveau non atteint' || e.message === 'Récompense déjà réclamée') {
      return res.status(400).json({ error: e.message });
    }
    throw e;
  }
}));

module.exports = router;
