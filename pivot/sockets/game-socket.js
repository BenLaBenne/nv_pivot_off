// sockets/game-socket.js — matchmaking + coups en temps réel
// Gère : file d'attente ranked, salons privés, phase d'achat, coups, fin de partie.
const jwt = require('jsonwebtoken');
const { query, withTransaction } = require('../db');
const { rankedQueue, startMatchmakingTicker } = require('../matchmaking');
const rules = require('../engine/rules');
const { computeElo } = require('../elo');
const { applyMatchXp } = require('../pass');
const { getCurrentSeason } = require('../seasons');
const { rankFromTrophies } = require('../ranks');
const { grantChestRewards } = require('../chests');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// État des parties en mémoire (id => state)
const games = new Map();
// Map userId -> gameId (pour trouver la partie d'un joueur)
const userGames = new Map();
// Map socketId -> userId
const socketUsers = new Map();
// Map userId -> socketId
const userSockets = new Map();
// Map socketId -> { gameId } pour private rooms
const socketRooms = new Map();
// Salons privés en mémoire (code => { hostSocketId, hostId, hostElo, status })
const privateRooms = new Map();

function getGameOfUser(userId) {
  return userGames.get(userId);
}

function notifyUser(userId, event, data) {
  const sid = userSockets.get(userId);
  if (sid && io) {
    io.to(sid).emit(event, data);
  }
}

let io = null;

function init(socketIo) {
  io = socketIo;
  // Authentification Socket.io via le token JWT (cookie envoyé manuellement par le client)
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('No token'));
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.uid;
      next();
    } catch (e) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socketUsers.set(socket.id, socket.userId);
    userSockets.set(socket.userId, socket.id);

    // Rejoindre une partie active si elle existe
    const gid = userGames.get(socket.userId);
    if (gid) {
      const game = games.get(gid);
      if (game) {
        socket.join('game-' + gid);
        socket.emit('game:resume', serializeGameForPlayer(game, socket.userId));
      }
    }

    // ---- Matchmaking ----
    socket.on('queue:join', async () => {
      // Charger l'user depuis DB
      const r = await query('SELECT id, elo, banned FROM users WHERE id = $1', [socket.userId]);
      if (r.rowCount === 0) return socket.emit('error', { error: 'User introuvable' });
      if (r.rows[0].banned) return socket.emit('error', { error: 'Banni' });
      if (userGames.has(socket.userId)) return socket.emit('error', { error: 'Déjà en partie' });
      rankedQueue.add(socket.userId, socket.id, r.rows[0].elo);
      socket.emit('queue:joined', { position: rankedQueue.size() });
    });

    socket.on('queue:leave', () => {
      rankedQueue.remove(socket.userId);
      socket.emit('queue:left', {});
    });

    // ---- Private rooms ----
    socket.on('private:create', async () => {
      if (userGames.has(socket.userId)) return socket.emit('error', { error: 'Déjà en partie' });
      // Générer un code 6 caractères
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      privateRooms.set(code, { hostSocketId: socket.id, hostId: socket.userId, status: 'waiting' });
      socket.join('room-' + code);
      socket.emit('private:created', { code });
    });

    socket.on('private:join', async ({ code }) => {
      const room = privateRooms.get(code);
      if (!room) return socket.emit('error', { error: 'Salon introuvable' });
      if (room.status !== 'waiting') return socket.emit('error', { error: 'Salon non disponible' });
      if (room.hostId === socket.userId) return socket.emit('error', { error: 'Tu es l\'hôte' });
      const hostElo = (await query('SELECT elo FROM users WHERE id = $1', [room.hostId])).rows[0].elo;
      const guestElo = (await query('SELECT elo FROM users WHERE id = $1', [socket.userId])).rows[0].elo;
      // Déterminer rouge/bleu au hasard
      const redFirst = Math.random() < 0.5;
      const redId = redFirst ? room.hostId : socket.userId;
      const blueId = redFirst ? socket.userId : room.hostId;
      const gid = createGame(redId, blueId, 'private', { hostElo, guestElo });
      privateRooms.delete(code);
      io.to(room.hostSocketId).emit('private:matchFound', { gameId: gid });
      socket.emit('private:matchFound', { gameId: gid });
      // Rejoindre la room socket
      io.to(room.hostSocketId).socketsJoin('game-' + gid);
      socket.join('game-' + gid);
      // Notifier les deux joueurs
      io.to('game-' + gid).emit('game:start', {
        gameId: gid,
        redId, blueId,
        phase: 'purchase',
      });
    });

    // ---- Phase d'achat (Pbucks) ----
    socket.on('purchase:submit', ({ gameId, purchased }) => {
      const game = games.get(gameId);
      if (!game) return socket.emit('error', { error: 'Partie introuvable' });
      if (game.phase !== 'purchase') return socket.emit('error', { error: 'Pas en phase d\'achat' });
      if (socket.userId !== game.redId && socket.userId !== game.blueId) {
        return socket.emit('error', { error: 'Pas dans cette partie' });
      }
      // Valider l'achat (10 Pbucks max)
      const r = rules.validatePurchase(purchased, 10);
      if (r.error) return socket.emit('error', { error: r.error });
      if (socket.userId === game.redId) game.purchasedRed = purchased;
      else game.purchasedBlue = purchased;
      socket.to('game-' + gameId).emit('purchase:opponentReady', { userId: socket.userId });
      // Si les deux sont prêts, démarrer la partie
      if (game.purchasedRed && game.purchasedBlue) {
        game.engineState = rules.initialState(game.redId, game.blueId, game.purchasedRed, game.purchasedBlue);
        game.phase = 'playing';
        io.to('game-' + gameId).emit('game:playingStart', serializeGameForPlayer(game, null, true));
        // Notifier le premier joueur (rouge) que c'est son tour
        const redSid = userSockets.get(game.redId);
        if (redSid) io.to(redSid).emit('game:yourTurn', {});
      }
    });

    // ---- Choix de camp (Bleu après le 1er coup de Rouge) ----
    socket.on('camp:choice', ({ gameId, choice }) => {
      const game = games.get(gameId);
      if (!game) return socket.emit('error', { error: 'Partie introuvable' });
      if (!game.engineState.swapPending) return socket.emit('error', { error: 'Pas de swap en attente' });
      if (socket.userId !== game.engineState.blueId) return socket.emit('error', { error: 'Seul Bleu peut choisir' });
      const r = rules.applySwapChoice(game.engineState, socket.userId, choice);
      if (r.error) return socket.emit('error', { error: r.error });
      io.to('game-' + gameId).emit('game:state', serializeGameForPlayer(game, null, true));
      io.to('game-' + gameId).emit('camp:chosen', { choice, blueId: game.engineState.blueId });
      // Notifier le bleu (nouveau) que c'est son tour
      const blueSid = userSockets.get(game.engineState.blueId);
      if (blueSid) io.to(blueSid).emit('game:yourTurn', {});
      checkGameOver(game);
    });

    // ---- Coup joué ----
    socket.on('game:move', ({ gameId, move }) => {
      const game = games.get(gameId);
      if (!game) return socket.emit('error', { error: 'Partie introuvable' });
      if (game.phase !== 'playing') return socket.emit('error', { error: 'Partie pas en cours' });
      const state = game.engineState;
      const expectedUserId = state.current === 'red' ? state.redId : state.blueId;
      if (socket.userId !== expectedUserId) return socket.emit('error', { error: 'Pas à toi de jouer' });
      const r = rules.applyMove(state, move, socket.userId);
      if (r.error) {
        return socket.emit('game:moveError', { error: r.error });
      }
      // Si awaitingFollowUp (TP / Clock / DS combo), juste mettre à jour sans changer de tour
      io.to('game-' + gameId).emit('game:state', serializeGameForPlayer(game, null, true));
      io.to('game-' + gameId).emit('game:move', { player: state.current === 'red' ? 'blue' : 'red', move });
      // Si pendingTp, notifier que le joueur doit faire un move de suivi
      if (state.pendingTp || state.pendingClock || state.pendingDs) {
        const sid = userSockets.get(socket.userId);
        if (sid) io.to(sid).emit('game:awaitingFollowUp', { type: state.pendingTp ? 'tp' : state.pendingClock ? 'clock' : 'ds' });
        return;
      }
      // Si swapPending, notifier Bleu qu'il doit choisir
      if (state.swapPending) {
        const blueSid = userSockets.get(state.blueId);
        if (blueSid) io.to(blueSid).emit('camp:choose', {});
        return;
      }
      // Sinon notifier le prochain joueur
      const nextId = state.current === 'red' ? state.redId : state.blueId;
      const sid = userSockets.get(nextId);
      if (sid) io.to(sid).emit('game:yourTurn', {});
      checkGameOver(game);
    });

    // ---- Abandon / quit ----
    socket.on('game:forfeit', ({ gameId }) => {
      const game = games.get(gameId);
      if (!game) return;
      if (game.phase !== 'playing' && game.phase !== 'purchase') return;
      // Le joueur qui abandonne perd
      finishGame(game, socket.userId);
    });

    socket.on('game:chat', ({ gameId, text }) => {
      if (!text || text.length > 200) return;
      io.to('game-' + gameId).emit('game:chat', { userId: socket.userId, text: text.slice(0, 200) });
    });

    // ---- Disconnect ----
    socket.on('disconnect', () => {
      const userId = socketUsers.get(socket.id);
      socketUsers.delete(socket.id);
      if (userSockets.get(userId) === socket.id) {
        userSockets.delete(userId);
      }
      // Retirer de la file d'attente
      rankedQueue.removeBySocket(socket.id);
      // Si en partie, marquer comme déconnecté (la partie reste en mémoire un moment)
      // Pour simplicité : si l'utilisateur déco et reco dans 30s, il peut resume.
      // Sinon, l'autre joueur peut claimer la victoire par forfeit après 60s.
      const gid = userGames.get(userId);
      if (gid) {
        const game = games.get(gid);
        if (game && game.phase === 'playing') {
          // Notifier l'adversaire
          const otherId = userId === game.redId ? game.blueId : game.redId;
          notifyUser(otherId, 'game:opponentDisconnected', {});
          // Timer de 60s, après quoi l'autre joueur gagne par forfeit
          game.disconnectTimer = setTimeout(() => {
            if (games.has(gid) && !game.engineState.winner) {
              finishGame(game, userId);
            }
          }, 60000);
        }
      }
    });
  });

  // Démarrer le ticker de matchmaking
  startMatchmakingTicker((match) => {
    // Créer une partie ranked
    const redId = match.player1; // premier arrivé = rouge
    const blueId = match.player2;
    const gid = createGame(redId, blueId, 'ranked', { hostElo: match.elo1, guestElo: match.elo2 });
    io.to(match.socket1).emit('queue:matchFound', { gameId: gid, opponent: blueId });
    io.to(match.socket2).emit('queue:matchFound', { gameId: gid, opponent: redId });
    io.to(match.socket1).socketsJoin('game-' + gid);
    io.to(match.socket2).socketsJoin('game-' + gid);
    io.to('game-' + gid).emit('game:start', {
      gameId: gid, redId, blueId, phase: 'purchase',
    });
  });
}

// Crée une partie en mémoire + DB
function createGame(redId, blueId, type, options = {}) {
  const gid = 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const game = {
    id: gid,
    redId, blueId,
    type,
    phase: 'purchase',
    purchasedRed: null,
    purchasedBlue: null,
    engineState: null,
    dbMatchId: null,
    movesCount: 0,
    createdAt: Date.now(),
  };
  games.set(gid, game);
  userGames.set(redId, gid);
  userGames.set(blueId, gid);
  // Insérer en DB
  query(
    `INSERT INTO matches (player1_id, player2_id, match_type, status)
     VALUES ($1, $2, $3, 'playing') RETURNING id`,
    [redId, blueId, type]
  ).then(r => { game.dbMatchId = r.rows[0].id; }).catch(e => console.error('[socket] insert match err:', e.message));
  return gid;
}

function serializeGameForPlayer(game, viewerId = null, full = false) {
  if (!game.engineState) {
    return {
      id: game.id, phase: game.phase,
      redId: game.redId, blueId: game.blueId,
      purchasedRed: game.purchasedRed, purchasedBlue: game.purchasedBlue,
    };
  }
  return {
    id: game.id,
    phase: game.phase,
    redId: game.engineState.redId,
    blueId: game.engineState.blueId,
    startingRedId: game.engineState.startingRedId,
    startingBlueId: game.engineState.startingBlueId,
    current: game.engineState.current,
    swapPending: game.engineState.swapPending,
    firstMovePlayed: game.engineState.firstMovePlayed,
    grid: game.engineState.grid,
    pivot: game.engineState.pivot,
    capacities: game.engineState.capacities,
    pendingTp: game.engineState.pendingTp,
    pendingClock: game.engineState.pendingClock,
    pendingDs: game.engineState.pendingDs,
    winner: game.engineState.winner,
    loser: game.engineState.loser,
    moves: game.engineState.moves,
  };
}

// Vérifie si la partie est finie et finalise
async function checkGameOver(game) {
  if (!game.engineState || !game.engineState.winner) return;
  const winnerColor = game.engineState.winner;
  const winnerId = winnerColor === 'red' ? game.engineState.redId : game.engineState.blueId;
  const loserId = winnerColor === 'blue' ? game.engineState.redId : game.engineState.blueId;
  await finishGameInternal(game, winnerId, loserId);
}

// Termine la partie avec winnerId gagnant (par forfeit ou normalement)
async function finishGame(game, loserId) {
  const winnerId = loserId === game.redId ? game.blueId : game.redId;
  if (game.engineState) {
    // Marquer winner/loser pour cohérence
    if (game.engineState.redId === winnerId) {
      game.engineState.winner = 'red';
      game.engineState.loser = 'blue';
    } else {
      game.engineState.winner = 'blue';
      game.engineState.loser = 'red';
    }
  }
  await finishGameInternal(game, winnerId, loserId, { forfeit: true });
}

async function finishGameInternal(game, winnerId, loserId, opts = {}) {
  if (game.finished) return;
  game.finished = true;
  // Clear disconnect timer
  if (game.disconnectTimer) clearTimeout(game.disconnectTimer);
  // Récupérer les infos des joueurs
  const players = await query('SELECT id, elo, trophies, pgs, win_streak, best_streak, matches_played, matches_won FROM users WHERE id IN ($1, $2)', [winnerId, loserId]);
  const winner = players.rows.find(u => u.id === winnerId);
  const loser = players.rows.find(u => u.id === loserId);

  // Calcul Elo
  const eloRes = computeElo(winner.elo, loser.elo);

  // Calcul TR (trophies) + Pgs + XP
  const newStreak = (winner.win_streak || 0) + 1;
  const coeff = 1.0 + 0.2 * Math.max(0, newStreak - 1);
  const trEarned = Math.round(10 * coeff);
  const pgsEarned = Math.round(5 * coeff);
  const xpEarned = 10; // XP base pour victoire (+ 5 × movesCount plus tard)
  const loserTrLost = Math.min(loser.trophies, 6);
  const loserPgsLost = Math.min(loser.pgs, 1);
  const loserXp = 3;
  const movesCount = game.engineState ? game.engineState.moves.length : 0;

  // Appliquer en DB
  await withTransaction(async (client) => {
    // Winner
    await client.query(`
      UPDATE users SET
        elo = $1, trophies = $2, pgs = pgs + $3,
        win_streak = $4, best_streak = GREATEST(best_streak, $4),
        matches_played = matches_played + 1, matches_won = matches_won + 1
      WHERE id = $5
    `, [eloRes.winnerElo, winner.trophies + trEarned, pgsEarned, newStreak, winnerId]);
    // Loser
    await client.query(`
      UPDATE users SET
        elo = $1, trophies = GREATEST(0, trophies - $2), pgs = GREATEST(0, pgs - $3),
        win_streak = 0,
        matches_played = matches_played + 1, matches_lost = matches_lost + 1
      WHERE id = $4
    `, [eloRes.loserElo, loserTrLost, loserPgsLost, loserId]);
    // Match DB
    if (game.dbMatchId) {
      await client.query(`
        UPDATE matches SET
          winner_id = $1, status = 'finished', elo_change = $2,
          tr_earned = $3, pgs_earned = $4, xp_earned = $5, finished_at = NOW()
        WHERE id = $6
      `, [winnerId, eloRes.deltaWinner, trEarned, pgsEarned, xpEarned + movesCount * 5, game.dbMatchId]);
    }
    // XP Pass (victoire : +10, +5×moves ; défaite : +3, +5×moves)
    await applyMatchXp(client, winnerId, true, movesCount);
    await applyMatchXp(client, loserId, false, movesCount);
  });

  // Notifier les joueurs
  const winnerRank = rankFromTrophies(winner.trophies + trEarned);
  const loserRank = rankFromTrophies(Math.max(0, loser.trophies - loserTrLost));
  notifyUser(winnerId, 'game:win', {
    matchId: game.id,
    trEarned, pgsEarned, xpEarned: xpEarned + movesCount * 5,
    newStreak, newTrophies: winner.trophies + trEarned,
    newRank: winnerRank,
    eloChange: eloRes.deltaWinner,
  });
  notifyUser(loserId, 'game:lose', {
    matchId: game.id,
    trLost: loserTrLost, pgsLost: loserPgsLost, xpEarned: loserXp + movesCount * 5,
    newTrophies: Math.max(0, loser.trophies - loserTrLost),
    newRank: loserRank,
    eloChange: eloRes.deltaLoser,
    forfeit: !!opts.forfeit,
  });
  // État final à tous
  io.to('game-' + game.id).emit('game:over', serializeGameForPlayer(game));

  // Cleanup : retirer des maps après 30s (permet au client de récup l'état final)
  setTimeout(() => {
    games.delete(game.id);
    userGames.delete(winnerId);
    userGames.delete(loserId);
  }, 30000);
}

module.exports = { init, getGameOfUser, notifyUser };
