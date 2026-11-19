// routes/_middleware.js — helpers communs (JWT, erreurs, validation)
const jwt = require('jsonwebtoken');
const { query } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

function signToken(userId) {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// Middleware : extrait le user depuis le cookie httpOnly JWT
async function authMiddleware(req, res, next) {
  req.user = null;
  const token = req.cookies && (req.cookies.token || req.cookies.jwt);
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const t = token || bearerToken;
  if (!t) return next();
  const decoded = verifyToken(t);
  if (!decoded) return next();
  try {
    const r = await query('SELECT id, username, friend_id, elo, trophies, pgs, pbucks, win_streak, best_streak, matches_played, matches_won, matches_lost, pass_xp, pass_level, is_admin, admin_level, banned, banned_reason, equipped_skin FROM users WHERE id = $1', [decoded.uid]);
    if (r.rowCount > 0) {
      req.user = r.rows[0];
    }
  } catch (e) {
    console.error('[auth] erreur DB:', e.message);
  }
  next();
}

// Garde : requiert un user connecté
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  if (req.user.banned) return res.status(403).json({ error: 'Banni', reason: req.user.banned_reason });
  next();
}

// Garde : requiert admin
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  if (!req.user.is_admin) return res.status(403).json({ error: 'Accès admin requis' });
  if (req.user.banned) return res.status(403).json({ error: 'Banni' });
  next();
}

// Garde : requiert admin level >= lvl
function requireAdminLevel(lvl) {
  return (req, res, next) => {
    if (!req.user || !req.user.is_admin || (req.user.admin_level || 0) < lvl) {
      return res.status(403).json({ error: 'Niveau admin insuffisant' });
    }
    next();
  };
}

// Wrapper pour catch async errors
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = {
  signToken, verifyToken,
  authMiddleware, requireAuth, requireAdmin, requireAdminLevel,
  wrap,
};
