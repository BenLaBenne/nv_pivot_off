// routes/reports.js — signalements de joueurs
const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authMiddleware, requireAuth, requireAdmin, wrap } = require('./_middleware');

// POST /api/reports — créer un signalement
// body: { reported_id, reason, details }
router.post('/', requireAuth, wrap(async (req, res) => {
  const { reported_id, reason, details } = req.body;
  if (!reported_id || !reason) return res.status(400).json({ error: 'reported_id et reason requis' });
  if (reported_id === req.user.id) return res.status(400).json({ error: 'Tu ne peux pas te signaler' });
  const r = await query(
    `INSERT INTO reports (reporter_id, reported_id, reason, details)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [req.user.id, reported_id, reason.slice(0, 255), details || null]
  );
  res.json({ ok: true, reportId: r.rows[0].id });
}));

// GET /api/reports — liste des reports (admin only)
router.get('/', requireAuth, requireAdmin, wrap(async (req, res) => {
  const status = req.query.status || 'open';
  const r = await query(`
    SELECT r.id, r.reason, r.details, r.status, r.created_at,
           ru.username AS reporter_username, ru.id AS reporter_id,
           tu.username AS reported_username, tu.id AS reported_id,
           au.username AS admin_username, r.admin_note
    FROM reports r
    LEFT JOIN users ru ON ru.id = r.reporter_id
    LEFT JOIN users tu ON tu.id = r.reported_id
    LEFT JOIN users au ON au.id = r.admin_id
    WHERE r.status = $1
    ORDER BY r.created_at DESC LIMIT 200
  `, [status]);
  res.json({ reports: r.rows });
}));

// POST /api/reports/:id/resolve
// body: { note, action } action = 'dismiss' | 'warn' | 'ban'
router.post('/:id/resolve', requireAuth, requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { note, action } = req.body;
  await query(
    `UPDATE reports SET status = 'resolved', admin_id = $1, admin_note = $2, resolved_at = NOW()
     WHERE id = $3`,
    [req.user.id, note || null, id]
  );
  if (action === 'ban') {
    const r = await query('SELECT reported_id FROM reports WHERE id = $1', [id]);
    if (r.rowCount > 0) {
      await query('UPDATE users SET banned = TRUE, banned_reason = $1 WHERE id = $2',
        [note || 'Banni suite à signalement', r.rows[0].reported_id]);
    }
  }
  res.json({ ok: true });
}));

module.exports = router;
