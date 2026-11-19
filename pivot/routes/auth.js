// routes/auth.js — signup, login, logout, me
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { signToken, authMiddleware, requireAuth, wrap } = require('./_middleware');
const { generateUniqueFriendId } = require('../init-db');

// POST /api/auth/signup
router.post('/signup', wrap(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username et password requis' });
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    return res.status(400).json({ error: 'username : 3-32 caractères alphanumériques' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe : 6 caractères min' });
  // Check username unique
  const exists = await query('SELECT 1 FROM users WHERE username = $1', [username]);
  if (exists.rowCount > 0) return res.status(409).json({ error: 'Username déjà pris' });

  const hash = await bcrypt.hash(password, 10);
  let userId;
  try {
    await withTransaction(async (client) => {
      const friendId = await generateUniqueFriendId(client);
      const r = await client.query(
        `INSERT INTO users (username, password_hash, friend_id)
         VALUES ($1, $2, $3) RETURNING id`,
        [username, hash, friendId]
      );
      userId = r.rows[0].id;
      // Inventaire initial : capacités de base déjà dans BASE_CAPACITIES, mais l'inventaire
      // du shop est séparé (capacités trouvées dans coffres / achetées en Pgs).
      // On crée des lignes vides pour les 6 capacités achetables.
      for (const ab of ['hamer', 'ds', 'tp', 'clock', 'pivot', 'diagonale']) {
        await client.query(
          `INSERT INTO user_inventory (user_id, ability_type, quantity) VALUES ($1, $2, 0)
           ON CONFLICT DO NOTHING`,
          [userId, ab]
        );
      }
    });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Username ou friend_id déjà pris' });
    throw e;
  }
  const token = signToken(userId);
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true, userId, username });
}));

// POST /api/auth/login
router.post('/login', wrap(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username et password requis' });
  const r = await query('SELECT id, username, password_hash, banned, banned_reason FROM users WHERE username = $1', [username]);
  if (r.rowCount === 0) return res.status(401).json({ error: 'Identifiants invalides' });
  const user = r.rows[0];
  if (user.banned) return res.status(403).json({ error: 'Banni', reason: user.banned_reason });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Identifiants invalides' });
  const token = signToken(user.id);
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true, userId: user.id, username: user.username });
}));

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', authMiddleware, requireAuth, wrap(async (req, res) => {
  const u = req.user;
  res.json({
    id: u.id, username: u.username, friend_id: u.friend_id,
    elo: u.elo, trophies: u.trophies, pgs: u.pgs, pbucks: u.pbucks,
    win_streak: u.win_streak, best_streak: u.best_streak,
    matches_played: u.matches_played, matches_won: u.matches_won, matches_lost: u.matches_lost,
    pass_xp: u.pass_xp, pass_level: u.pass_level,
    is_admin: u.is_admin, admin_level: u.admin_level,
    equipped_skin: u.equipped_skin,
  });
}));

module.exports = router;
