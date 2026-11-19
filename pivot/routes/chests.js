// routes/chests.js — liste coffres en attente + ouverture
const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { requireAuth, wrap } = require('./_middleware');
const { openChest, grantChestRewards } = require('../chests');

// GET /api/chests — liste des coffres en attente d'ouverture
router.get('/', requireAuth, wrap(async (req, res) => {
  const r = await query(
    `SELECT id, chest_type, status, created_at FROM user_chests
     WHERE user_id = $1 AND status = 'unopened' ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ chests: r.rows });
}));

// POST /api/chests/:id/open — ouvrir un coffre, renvoyer les items
router.post('/:id/open', requireAuth, wrap(async (req, res) => {
  const chestId = parseInt(req.params.id, 10);
  try {
    const result = await withTransaction(async (client) => {
      const r = await client.query(
        `SELECT * FROM user_chests WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [chestId, req.user.id]
      );
      if (r.rowCount === 0) throw new Error('Coffre introuvable');
      const chest = r.rows[0];
      if (chest.status === 'opened') throw new Error('Coffre déjà ouvert');
      const draw = openChest(chest.chest_type);
      await grantChestRewards(client, req.user.id, draw.items);
      await client.query(
        `UPDATE user_chests SET status = 'opened', opened_at = NOW() WHERE id = $1`,
        [chestId]
      );
      return draw;
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    if (e.message === 'Coffre introuvable') return res.status(404).json({ error: e.message });
    if (e.message === 'Coffre déjà ouvert') return res.status(400).json({ error: e.message });
    throw e;
  }
}));

module.exports = router;
