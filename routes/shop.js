// routes/shop.js — achat de coffres avec Pgs
const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { requireAuth, wrap } = require('./_middleware');
const { CHEST_PRICES, openChest, grantChestRewards } = require('../chests');

// GET /api/shop/chests — liste des coffres disponibles
router.get('/chests', requireAuth, (req, res) => {
  res.json({
    chests: Object.entries(CHEST_PRICES).map(([type, price]) => ({ type, price })),
  });
});

// POST /api/shop/buy-chest
// body: { chest_type }
// Achète un coffre avec les Pgs et l'ajoute à user_chests (status unopened)
router.post('/buy-chest', requireAuth, wrap(async (req, res) => {
  const { chest_type } = req.body;
  if (!CHEST_PRICES[chest_type]) return res.status(400).json({ error: 'Type de coffre invalide' });
  const price = CHEST_PRICES[chest_type];
  try {
    const result = await withTransaction(async (client) => {
      const r = await client.query('SELECT pgs FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
      if (r.rowCount === 0) throw new Error('user not found');
      const pgs = r.rows[0].pgs;
      if (pgs < price) throw new Error('Pas assez de Pgs');
      await client.query('UPDATE users SET pgs = pgs - $1 WHERE id = $2', [price, req.user.id]);
      const ins = await client.query(
        `INSERT INTO user_chests (user_id, chest_type, status)
         VALUES ($1, $2, 'unopened') RETURNING id`,
        [req.user.id, chest_type]
      );
      return { chestId: ins.rows[0].id };
    });
    res.json({ ok: true, chestId: result.chestId, chest_type, price });
  } catch (e) {
    if (e.message === 'Pas assez de Pgs') return res.status(400).json({ error: e.message });
    throw e;
  }
}));

module.exports = router;
