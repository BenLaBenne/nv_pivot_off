// routes/friends.js — amis (friend_id, demandes, liste, suppression)
const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { requireAuth, wrap } = require('./_middleware');
const gameSocket = require('../sockets/game-socket');

// GET /api/friends — liste des amis + demandes reçues + mon ID
// + statut online/offline en temps réel (depuis la mémoire du socket)
router.get('/', requireAuth, wrap(async (req, res) => {
  // Mon friend_id
  const myFriendId = req.user.friend_id;
  // Amis acceptés
  const accepted = await query(`
    SELECT u.id, u.username, u.friend_id, u.trophies, u.matches_played,
           u.matches_won, u.matches_lost, u.is_admin,
           COALESCE(s.name, 'Classic') AS equipped_skin_name
    FROM friendships f
    JOIN users u ON u.id = f.friend_id
    LEFT JOIN skins s ON s.id = u.equipped_skin
    WHERE f.user_id = $1 AND f.status = 'accepted'
    ORDER BY u.trophies DESC
  `, [req.user.id]);
  // Demandes reçues (pending)
  const received = await query(`
    SELECT u.id, u.username, u.friend_id, f.created_at
    FROM friendships f
    JOIN users u ON u.id = f.user_id
    WHERE f.friend_id = $1 AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `, [req.user.id]);
  // Demandes envoyées (pending)
  const sent = await query(`
    SELECT u.id, u.username, u.friend_id
    FROM friendships f
    JOIN users u ON u.id = f.friend_id
    WHERE f.user_id = $1 AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `, [req.user.id]);
  res.json({
    myFriendId,
    friends: accepted.rows.map(u => ({
      ...u,
      online: gameSocket.isUserOnline(u.id),
    })),
    requests: received.rows,
    sent: sent.rows,
  });
}));

// POST /api/friends/add
// body: { friend_id } (ex: "ABC123" ou "#ABC123")
router.post('/add', requireAuth, wrap(async (req, res) => {
  let fid = (req.body.friend_id || '').trim();
  if (fid.startsWith('#')) fid = fid.slice(1);
  if (!fid || fid.length > 8) return res.status(400).json({ error: 'friend_id invalide' });
  if (fid === req.user.friend_id) return res.status(400).json({ error: 'Tu ne peux pas t\'ajouter toi-même' });
  const target = await query('SELECT id, username FROM users WHERE friend_id = $1', [fid]);
  if (target.rowCount === 0) return res.status(404).json({ error: 'Joueur introuvable' });
  const targetId = target.rows[0].id;
  // Check si déjà amis ou demande existante
  const existing = await query(
    `SELECT * FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
    [req.user.id, targetId]
  );
  if (existing.rowCount > 0) {
    const f = existing.rows[0];
    if (f.status === 'accepted') return res.status(400).json({ error: 'Déjà amis' });
    if (f.user_id === req.user.id) return res.status(400).json({ error: 'Demande déjà envoyée' });
    // L'autre m'a déjà demandé en ami : accepter directement
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE friendships SET status = 'accepted' WHERE user_id = $1 AND friend_id = $2`,
        [targetId, req.user.id]
      );
      // Ajouter l'entrée symétrique
      await client.query(
        `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'accepted')
         ON CONFLICT DO NOTHING`,
        [req.user.id, targetId]
      );
    });
    return res.json({ ok: true, status: 'accepted', username: target.rows[0].username });
  }
  // Créer la demande
  await query(
    `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'pending')
     ON CONFLICT DO NOTHING`,
    [req.user.id, targetId]
  );
  // Notifier le target en temps réel
  try {
    gameSocket.notifyFriendRequest(targetId, {
      from: { id: req.user.id, username: req.user.username, friend_id: req.user.friend_id },
    });
  } catch (e) {}
  res.json({ ok: true, status: 'pending', username: target.rows[0].username });
}));

// POST /api/friends/accept
// body: { user_id } (l'ID du user qui a envoyé la demande)
router.post('/accept', requireAuth, wrap(async (req, res) => {
  const fromId = parseInt(req.body.user_id, 10);
  if (!fromId) return res.status(400).json({ error: 'user_id requis' });
  try {
    await withTransaction(async (client) => {
      const r = await client.query(
        `UPDATE friendships SET status = 'accepted'
         WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'`,
        [fromId, req.user.id]
      );
      if (r.rowCount === 0) throw new Error('Demande introuvable');
      await client.query(
        `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'accepted')
         ON CONFLICT DO NOTHING`,
        [req.user.id, fromId]
      );
    });
    // Notifier l'autre user en temps réel
    try {
      gameSocket.notifyFriendAccepted(fromId, {
        from: { id: req.user.id, username: req.user.username },
      });
    } catch (e) {}
    res.json({ ok: true });
  } catch (e) {
    if (e.message === 'Demande introuvable') return res.status(404).json({ error: e.message });
    throw e;
  }
}));

// POST /api/friends/decline
router.post('/decline', requireAuth, wrap(async (req, res) => {
  const fromId = parseInt(req.body.user_id, 10);
  await query(
    `DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'`,
    [fromId, req.user.id]
  );
  res.json({ ok: true });
}));

// POST /api/friends/remove
router.post('/remove', requireAuth, wrap(async (req, res) => {
  const otherId = parseInt(req.body.user_id, 10);
  await query(
    `DELETE FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
    [req.user.id, otherId]
  );
  res.json({ ok: true });
}));

// GET /api/friends/:id/profile — profil public d'un ami
router.get('/:id/profile', requireAuth, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = await query(`
    SELECT u.id, u.username, u.friend_id, u.trophies, u.elo, u.matches_played,
           u.matches_won, u.matches_lost, u.best_streak, u.pass_level,
           u.is_admin, u.created_at
    FROM users u WHERE u.id = $1
  `, [id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'Joueur introuvable' });
  res.json({ user: r.rows[0] });
}));

module.exports = router;
