// routes/skins.js — liste, achat, équipement
const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { requireAuth, wrap } = require('./_middleware');

// GET /api/skins — toutes les skins du shop + celles que je possède
router.get('/', requireAuth, wrap(async (req, res) => {
  const all = await query(`SELECT id, name, texture_path, price_pgs, rarity FROM skins ORDER BY price_pgs ASC`);
  const owned = await query(`SELECT skin_id, equipped FROM user_skins WHERE user_id = $1`, [req.user.id]);
  const ownedMap = {};
  for (const r of owned.rows) ownedMap[r.skin_id] = r.equipped;
  res.json({
    skins: all.rows.map(s => ({ ...s, owned: !!ownedMap[s.id], equipped: !!ownedMap[s.id] })),
    equipped: req.user.equipped_skin,
  });
}));

// POST /api/skins/:id/buy
router.post('/:id/buy', requireAuth, wrap(async (req, res) => {
  const skinId = parseInt(req.params.id, 10);
  try {
    await withTransaction(async (client) => {
      const skin = await client.query('SELECT * FROM skins WHERE id = $1', [skinId]);
      if (skin.rowCount === 0) throw new Error('Skin introuvable');
      const price = skin.rows[0].price_pgs;
      const already = await client.query('SELECT 1 FROM user_skins WHERE user_id = $1 AND skin_id = $2', [req.user.id, skinId]);
      if (already.rowCount > 0) throw new Error('Skin déjà possédé');
      const u = await client.query('SELECT pgs FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
      if (u.rows[0].pgs < price) throw new Error('Pas assez de Pgs');
      await client.query('UPDATE users SET pgs = pgs - $1 WHERE id = $2', [price, req.user.id]);
      await client.query(
        'INSERT INTO user_skins (user_id, skin_id, equipped) VALUES ($1, $2, FALSE)',
        [req.user.id, skinId]
      );
    });
    res.json({ ok: true, skinId });
  } catch (e) {
    if (e.message === 'Skin introuvable') return res.status(404).json({ error: e.message });
    if (e.message === 'Skin déjà possédé' || e.message === 'Pas assez de Pgs') return res.status(400).json({ error: e.message });
    throw e;
  }
}));

// POST /api/skins/:id/equip
router.post('/:id/equip', requireAuth, wrap(async (req, res) => {
  const skinId = parseInt(req.params.id, 10);
  try {
    await withTransaction(async (client) => {
      const own = await client.query('SELECT 1 FROM user_skins WHERE user_id = $1 AND skin_id = $2', [req.user.id, skinId]);
      if (own.rowCount === 0) throw new Error('Skin non possédé');
      await client.query('UPDATE user_skins SET equipped = FALSE WHERE user_id = $1', [req.user.id]);
      await client.query('UPDATE user_skins SET equipped = TRUE WHERE user_id = $1 AND skin_id = $2', [req.user.id, skinId]);
      await client.query('UPDATE users SET equipped_skin = $1 WHERE id = $2', [skinId, req.user.id]);
    });
    res.json({ ok: true, skinId });
  } catch (e) {
    if (e.message === 'Skin non possédé') return res.status(400).json({ error: e.message });
    throw e;
  }
}));

// POST /api/skins/unequip
router.post('/unequip', requireAuth, wrap(async (req, res) => {
  await withTransaction(async (client) => {
    await client.query('UPDATE user_skins SET equipped = FALSE WHERE user_id = $1', [req.user.id]);
    await client.query('UPDATE users SET equipped_skin = NULL WHERE id = $1', [req.user.id]);
  });
  res.json({ ok: true });
}));

module.exports = router;
