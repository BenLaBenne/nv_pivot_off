// routes/inventory.js — inventaire capacités + profil public
const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { requireAuth, wrap } = require('./_middleware');
const { CAPACITY_PRICES, ABILITY_LABELS } = require('../engine/rules');

// GET /api/inventory — capacités possédées
router.get('/', requireAuth, wrap(async (req, res) => {
  const r = await query(`
    SELECT ability_type, quantity FROM user_inventory
    WHERE user_id = $1 AND quantity > 0
    ORDER BY ability_type
  `, [req.user.id]);
  res.json({ inventory: r.rows });
}));

// POST /api/inventory/buy — acheter des capacités avec des Pgs (en dehors d'une partie)
// body: { items: { pivot: 2, tp: 1, ... } }
// Note : en partie, l'achat se fait avec les Pbucks (10 au début), géré côté socket.
// Ici c'est l'achat permanent avec les Pgs (gems).
router.post('/buy', requireAuth, wrap(async (req, res) => {
  const items = req.body.items || {};
  // Calcul du coût en Pgs (même prix que les Pbucks)
  let total = 0;
  for (const [k, q] of Object.entries(items)) {
    if (!CAPACITY_PRICES[k]) return res.status(400).json({ error: 'Capacité inconnue: ' + k });
    if (q < 0 || !Number.isInteger(q)) return res.status(400).json({ error: 'Quantité invalide' });
    // Prix en Pgs = prix en Pbucks × 2 (les capacités permanentes coûtent plus cher)
    total += CAPACITY_PRICES[k] * 2 * q;
  }
  if (total === 0) return res.json({ ok: true, total: 0 });
  try {
    await withTransaction(async (client) => {
      const r = await client.query('SELECT pgs FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
      if (r.rows[0].pgs < total) throw new Error('Pas assez de Pgs');
      await client.query('UPDATE users SET pgs = pgs - $1 WHERE id = $2', [total, req.user.id]);
      for (const [k, q] of Object.entries(items)) {
        await client.query(`
          INSERT INTO user_inventory (user_id, ability_type, quantity)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, ability_type)
          DO UPDATE SET quantity = user_inventory.quantity + $3
        `, [req.user.id, k, q]);
      }
    });
    res.json({ ok: true, total });
  } catch (e) {
    if (e.message === 'Pas assez de Pgs') return res.status(400).json({ error: e.message });
    throw e;
  }
}));

// GET /api/inventory/capacities — liste des capacités achetables (avec labels + prix)
router.get('/capacities', requireAuth, (req, res) => {
  const caps = Object.entries(CAPACITY_PRICES).map(([k, p]) => ({
    key: k,
    label: ABILITY_LABELS[k] || k,
    price_pbucks: p,
    price_pgs: p * 2,
  }));
  res.json({ capacities: caps });
});

module.exports = router;
