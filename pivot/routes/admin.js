// routes/admin.js — actions admin (cadeaux, ban, promote)
const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { requireAuth, requireAdmin, requireAdminLevel, wrap } = require('./_middleware');

// Log une action admin
async function logAdmin(client, adminId, action, targetId, details) {
  await client.query(
    `INSERT INTO admin_logs (admin_id, action, target_id, details)
     VALUES ($1, $2, $3, $4)`,
    [adminId, action, targetId, details ? JSON.stringify(details) : null]
  );
}

// GET /api/admin/stats — stats globales (admin principal seulement)
router.get('/stats', requireAuth, requireAdmin, wrap(async (req, res) => {
  const users = await query('SELECT COUNT(*)::int AS c FROM users');
  const online = await query('SELECT COUNT(*)::int AS c FROM users WHERE last_login > NOW() - INTERVAL \'10 minutes\'');
  const matches = await query('SELECT COUNT(*)::int AS c, COALESCE(SUM(CASE WHEN winner_id IS NOT NULL THEN 1 ELSE 0 END),0)::int AS finished FROM matches');
  const banned = await query('SELECT COUNT(*)::int AS c FROM users WHERE banned = TRUE');
  const reports = await query('SELECT COUNT(*)::int AS c FROM reports WHERE status = \'open\'');
  res.json({
    users: users.rows[0].c,
    online: online.rows[0].c,
    matchesTotal: matches.rows[0].c,
    matchesFinished: matches.rows[0].finished,
    banned: banned.rows[0].c,
    openReports: reports.rows[0].c,
  });
}));

// GET /api/admin/search?q=username — recherche user
router.get('/search', requireAuth, requireAdmin, wrap(async (req, res) => {
  const q = '%' + (req.query.q || '') + '%';
  const r = await query(`
    SELECT id, username, friend_id, trophies, elo, pgs, pbucks, matches_played,
           matches_won, matches_lost, is_admin, admin_level, banned, banned_reason
    FROM users WHERE username ILIKE $1 OR friend_id ILIKE $1
    ORDER BY username LIMIT 50
  `, [q]);
  res.json({ users: r.rows });
}));

// POST /api/admin/gift — envoyer un cadeau à un user
// body: { user_id, gift_type, gift_data, message }
router.post('/gift', requireAuth, requireAdmin, wrap(async (req, res) => {
  const { user_id, gift_type, gift_data, message } = req.body;
  if (!user_id || !gift_type) return res.status(400).json({ error: 'user_id et gift_type requis' });
  const r = await query(
    `INSERT INTO admin_gifts (user_id, gift_type, gift_data, message)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [user_id, gift_type, gift_data ? JSON.stringify(gift_data) : null, message || null]
  );
  await query(
    `INSERT INTO admin_logs (admin_id, action, target_id, details) VALUES ($1, 'gift', $2, $3)`,
    [req.user.id, user_id, JSON.stringify({ gift_type, gift_data })]
  );
  res.json({ ok: true, giftId: r.rows[0].id });
}));

// POST /api/admin/gift-all — envoyer à tous les joueurs
// body: { gift_type, gift_data, message }
router.post('/gift-all', requireAuth, requireAdminLevel(2), wrap(async (req, res) => {
  const { gift_type, gift_data, message } = req.body;
  if (!gift_type) return res.status(400).json({ error: 'gift_type requis' });
  const r = await query(
    `INSERT INTO admin_gifts (user_id, gift_type, gift_data, message)
     SELECT id, $1, $2, $3 FROM users WHERE banned = FALSE
     RETURNING id`,
    [gift_type, gift_data ? JSON.stringify(gift_data) : null, message || null]
  );
  await query(
    `INSERT INTO admin_logs (admin_id, action, details) VALUES ($1, 'gift_all', $2)`,
    [req.user.id, JSON.stringify({ gift_type, gift_data, count: r.rowCount })]
  );
  res.json({ ok: true, count: r.rowCount });
}));

// POST /api/admin/ban
router.post('/ban', requireAuth, requireAdmin, wrap(async (req, res) => {
  const { user_id, reason } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id requis' });
  if (user_id === req.user.id) return res.status(400).json({ error: 'Tu ne peux pas te bannir' });
  const target = await query('SELECT is_admin, admin_level FROM users WHERE id = $1', [user_id]);
  if (target.rowCount === 0) return res.status(404).json({ error: 'User introuvable' });
  if (target.rows[0].is_admin && (target.rows[0].admin_level || 0) >= (req.user.admin_level || 0)) {
    return res.status(403).json({ error: 'Tu ne peux pas bannir un admin de niveau supérieur ou égal' });
  }
  await query('UPDATE users SET banned = TRUE, banned_reason = $1 WHERE id = $2', [reason || null, user_id]);
  await query(
    `INSERT INTO admin_logs (admin_id, action, target_id, details) VALUES ($1, 'ban', $2, $3)`,
    [req.user.id, user_id, JSON.stringify({ reason })]
  );
  res.json({ ok: true });
}));

// POST /api/admin/unban
router.post('/unban', requireAuth, requireAdmin, wrap(async (req, res) => {
  const { user_id } = req.body;
  await query('UPDATE users SET banned = FALSE, banned_reason = NULL WHERE id = $1', [user_id]);
  await query(
    `INSERT INTO admin_logs (admin_id, action, target_id, details) VALUES ($1, 'unban', $2, NULL)`,
    [req.user.id, user_id]
  );
  res.json({ ok: true });
}));

// POST /api/admin/promote — promouvoir admin ou modo
// body: { user_id, level } level = 0 (user), 1 (modo), 2 (admin principal)
router.post('/promote', requireAuth, requireAdminLevel(2), wrap(async (req, res) => {
  const { user_id, level } = req.body;
  if (level === undefined || level < 0 || level > 2) return res.status(400).json({ error: 'level 0/1/2' });
  await query('UPDATE users SET is_admin = $1, admin_level = $2 WHERE id = $3',
    [level > 0 ? true : false, level, user_id]);
  await query(
    `INSERT INTO admin_logs (admin_id, action, target_id, details) VALUES ($1, 'promote', $2, $3)`,
    [req.user.id, user_id, JSON.stringify({ level })]
  );
  res.json({ ok: true });
}));

// POST /api/admin/grant-pgs
router.post('/grant-pgs', requireAuth, requireAdmin, wrap(async (req, res) => {
  const { user_id, amount } = req.body;
  if (!user_id || !amount) return res.status(400).json({ error: 'user_id et amount requis' });
  await query('UPDATE users SET pgs = pgs + $1 WHERE id = $2', [amount, user_id]);
  await query(
    `INSERT INTO admin_logs (admin_id, action, target_id, details) VALUES ($1, 'grant_pgs', $2, $3)`,
    [req.user.id, user_id, JSON.stringify({ amount })]
  );
  res.json({ ok: true });
}));

// POST /api/admin/grant-pbucks
router.post('/grant-pbucks', requireAuth, requireAdmin, wrap(async (req, res) => {
  const { user_id, amount } = req.body;
  if (!user_id || !amount) return res.status(400).json({ error: 'user_id et amount requis' });
  await query('UPDATE users SET pbucks = pbucks + $1 WHERE id = $2', [amount, user_id]);
  await query(
    `INSERT INTO admin_logs (admin_id, action, target_id, details) VALUES ($1, 'grant_pbucks', $2, $3)`,
    [req.user.id, user_id, JSON.stringify({ amount })]
  );
  res.json({ ok: true });
}));

// GET /api/admin/logs
router.get('/logs', requireAuth, requireAdminLevel(2), wrap(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const r = await query(`
    SELECT l.id, l.admin_id, u.username AS admin_username, l.action, l.target_id,
           t.username AS target_username, l.details, l.created_at
    FROM admin_logs l
    LEFT JOIN users u ON u.id = l.admin_id
    LEFT JOIN users t ON t.id = l.target_id
    ORDER BY l.created_at DESC LIMIT $1
  `, [limit]);
  res.json({ logs: r.rows });
}));

module.exports = router;
