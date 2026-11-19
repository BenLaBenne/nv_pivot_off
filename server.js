// server.js — point d'entrée Express + Socket.io + init DB
const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const { Server } = require('socket.io');

dotenv.config();

const { pool } = require('./db');
const { initDb } = require('./init-db');
const { authMiddleware } = require('./routes/_middleware');
const { rolloverSeasonIfNeeded, startSeasonScheduler } = require('./seasons');

// Routes
const authRoutes = require('./routes/auth');
const shopRoutes = require('./routes/shop');
const chestsRoutes = require('./routes/chests');
const skinsRoutes = require('./routes/skins');
const passRoutes = require('./routes/pass');
const friendsRoutes = require('./routes/friends');
const giftsRoutes = require('./routes/gifts');
const leaderboardRoutes = require('./routes/leaderboard');
const adminRoutes = require('./routes/admin');
const reportsRoutes = require('./routes/reports');
const inventoryRoutes = require('./routes/inventory');

// Socket
const gameSocket = require('./sockets/game-socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || true, credentials: true },
});

const PORT = process.env.PORT || 4242;

// Middlewares globaux
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(authMiddleware); // req.user disponible partout

// Fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/chests', chestsRoutes);
app.use('/api/skins', skinsRoutes);
app.use('/api/pass', passRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/gifts', giftsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/inventory', inventoryRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));

// Page admin (route SPA : toutes les routes renvoient index.html)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Gestion erreurs
app.use((err, req, res, next) => {
  console.error('[server] error:', err.message);
  res.status(500).json({ error: 'Erreur serveur', detail: process.env.NODE_ENV !== 'production' ? err.message : undefined });
});

// Démarrage
async function start() {
  // Tester la connexion DB
  try {
    await pool.query('SELECT 1');
    console.log('[server] DB connectée');
  } catch (e) {
    console.error('[server] Impossible de se connecter à la DB:', e.message);
    process.exit(1);
  }
  // Init tables + seed
  try {
    await initDb();
  } catch (e) {
    console.error('[server] init-db erreur:', e.message);
    process.exit(1);
  }
  // Rollover saison si besoin
  try {
    const r = await rolloverSeasonIfNeeded();
    if (r.rolled) console.log('[server] saison rolled over:', r.previousSeason);
    startSeasonScheduler();
  } catch (e) {
    console.error('[server] season rollover error:', e.message);
  }
  // Init socket
  gameSocket.init(io);

  server.listen(PORT, () => {
    console.log(`[server] PIVOT Online démarré sur le port ${PORT}`);
    console.log(`[server] Ouvre http://localhost:${PORT}/`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM reçu, fermeture...');
  server.close(() => pool.end());
});

if (require.main === module) {
  start().catch(e => {
    console.error('[server] FATAL:', e);
    process.exit(1);
  });
}

module.exports = { app, server };
