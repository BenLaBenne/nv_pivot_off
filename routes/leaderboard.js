// routes/leaderboard.js — top joueurs (classement par TR)
const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authMiddleware, requireAuth, wrap } = require('./_middleware');

// GET /api/leaderboard?limit=100
router.get('/', authMiddleware, wrap(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const r = await query(`
    SELECT id, username, friend_id, trophies, elo, matches_played, matches_won, best_streak, pass_level, is_admin
    FROM users WHERE banned = FALSE
    ORDER BY trophies DESC, elo DESC LIMIT $1
  `, [limit]);
  // Rank labels (18 paliers) — calculés côté backend pour cohérence
  const RANKS = require('../ranks').RANKS;
  const ranked = r.rows.map((u, i) => ({
    ...u,
    rank: i + 1,
    rankLabel: require('../ranks').rankFromTrophies(u.trophies),
  }));
  res.json({ leaderboard: ranked, myPosition: req.user ? ranked.findIndex(u => u.id === req.user.id) + 1 : null });
}));

module.exports = router;
