// matchmaking.js — file d'attente par Elo ±50, élargi si >10s
// Pour parties ranked. Les parties privées passent par private_rooms.

class MatchmakingQueue {
  constructor() {
    // Map userId -> { socketId, elo, joinedAt }
    this.queue = new Map();
    // Map socketId -> userId (pour cleanup à la déconnexion)
    this.socketIndex = new Map();
    // Callback appelé quand un match est trouvé
    this.onMatch = null;
  }

  add(userId, socketId, elo) {
    // Ne pas ajouter si déjà en file
    if (this.queue.has(userId)) {
      this.remove(userId);
    }
    this.queue.set(userId, { socketId, elo, joinedAt: Date.now() });
    this.socketIndex.set(socketId, userId);
    return this.tryMatch();
  }

  remove(userId) {
    const entry = this.queue.get(userId);
    if (!entry) return;
    this.queue.delete(userId);
    this.socketIndex.delete(entry.socketId);
  }

  removeBySocket(socketId) {
    const userId = this.socketIndex.get(socketId);
    if (userId) this.remove(userId);
  }

  // Tente de former un match. Renvoie le match trouvé ou null.
  tryMatch() {
    const now = Date.now();
    const entries = Array.from(this.queue.entries()).map(([uid, e]) => ({ uid, ...e }));
    if (entries.length < 2) return null;

    // Trier par ancienneté (les plus anciens en premier)
    entries.sort((a, b) => a.joinedAt - b.joinedAt);

    for (let i = 0; i < entries.length; i++) {
      const a = entries[i];
      const waitMs = now - a.joinedAt;
      // Élargir la fenêtre : 50 base + 5 par 1s d'attente (max 300)
      const window = Math.min(300, 50 + Math.floor(waitMs / 1000) * 5);
      for (let j = i + 1; j < entries.length; j++) {
        const b = entries[j];
        if (Math.abs(a.elo - b.elo) <= window) {
          // Match !
          this.queue.delete(a.uid);
          this.queue.delete(b.uid);
          this.socketIndex.delete(a.socketId);
          this.socketIndex.delete(b.socketId);
          return {
            player1: a.uid,
            player2: b.uid,
            socket1: a.socketId,
            socket2: b.socketId,
            elo1: a.elo,
            elo2: b.elo,
          };
        }
      }
    }
    return null;
  }

  size() {
    return this.queue.size;
  }

  // À appeler périodiquement pour forcer les matches quand la file grossit
  tick() {
    return this.tryMatch();
  }
}

const rankedQueue = new MatchmakingQueue();

// Tick toutes les 1s pour matcher les joueurs en file
let tickInterval = null;
function startMatchmakingTicker(onMatch) {
  rankedQueue.onMatch = onMatch;
  if (tickInterval) return;
  tickInterval = setInterval(() => {
    const m = rankedQueue.tick();
    if (m && rankedQueue.onMatch) rankedQueue.onMatch(m);
  }, 1000);
}

module.exports = {
  MatchmakingQueue, rankedQueue, startMatchmakingTicker,
};
