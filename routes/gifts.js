// routes/gifts.js — cadeaux reçus des admins + réclamation
const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { requireAuth, wrap } = require('./_middleware');
const { grantChestRewards } = require('../chests');

// GET /api/gifts — liste des cadeaux (non réclamés + 20 derniers réclamés)
router.get('/', requireAuth, wrap(async (req, res) => {
  const unclaimed = await query(`
    SELECT id, gift_type, gift_data, message, created_at
    FROM admin_gifts WHERE user_id = $1 AND status = 'unclaimed'
    ORDER BY created_at DESC
  `, [req.user.id]);
  const claimed = await query(`
    SELECT id, gift_type, gift_data, message, created_at
    FROM admin_gifts WHERE user_id = $1 AND status = 'claimed'
    ORDER BY created_at DESC LIMIT 20
  `, [req.user.id]);
  res.json({
    unclaimed: unclaimed.rows,
    claimed: claimed.rows,
    unclaimedCount: unclaimed.rowCount,
  });
}));

// POST /api/gifts/:id/claim
router.post('/:id/claim', requireAuth, wrap(async (req, res) => {
  const giftId = parseInt(req.params.id, 10);
  try {
    const result = await withTransaction(async (client) => {
      const r = await client.query(
        `SELECT * FROM admin_gifts WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [giftId, req.user.id]
      );
      if (r.rowCount === 0) throw new Error('Cadeau introuvable');
      const g = r.rows[0];
      if (g.status === 'claimed') throw new Error('Cadeau déjà réclamé');
      const data = g.gift_data ? JSON.parse(g.gift_data) : {};
      switch (g.gift_type) {
        case 'pgs':
          await client.query('UPDATE users SET pgs = pgs + $1 WHERE id = $2', [data.amount || 0, req.user.id]);
          break;
        case 'pbucks':
          await client.query('UPDATE users SET pbucks = pbucks + $1 WHERE id = $2', [data.amount || 0, req.user.id]);
          break;
        case 'capacity':
          await client.query(`
            INSERT INTO user_inventory (user_id, ability_type, quantity)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, ability_type)
            DO UPDATE SET quantity = user_inventory.quantity + $3
          `, [req.user.id, data.ability, data.quantity || 1]);
          break;
        case 'chest':
          await client.query(
            `INSERT INTO user_chests (user_id, chest_type, status) VALUES ($1, $2, 'unopened')`,
            [req.user.id, data.chest_type]
          );
          break;
        case 'skin':
          await client.query(
            `INSERT INTO user_skins (user_id, skin_id, equipped) VALUES ($1, $2, FALSE)
             ON CONFLICT DO NOTHING`,
            [req.user.id, data.skin_id]
          );
          break;
        default:
          throw new Error('Type de cadeau inconnu: ' + g.gift_type);
      }
      await client.query(`UPDATE admin_gifts SET status = 'claimed' WHERE id = $1`, [giftId]);
      return { gift: g };
    });
    res.json({ ok: true, gift: result.gift });
  } catch (e) {
    if (e.message === 'Cadeau introuvable' || e.message === 'Cadeau déjà réclamé') {
      return res.status(400).json({ error: e.message });
    }
    throw e;
  }
}));

module.exports = router;
