// elo.js — formule Elo K=32
const K = 32;

function expectedScore(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

// Calcule les nouveaux Elo après une partie.
// winnerId, loserId sont les user IDs. winnerElo, loserElo sont les Elo actuels.
function computeElo(winnerElo, loserElo) {
  const eW = expectedScore(winnerElo, loserElo);
  const eL = expectedScore(loserElo, winnerElo);
  const newWinner = Math.round(winnerElo + K * (1 - eW));
  const newLoser = Math.round(loserElo + K * (0 - eL));
  // L'Elo ne descend pas sous 0
  return {
    winnerElo: Math.max(0, newWinner),
    loserElo: Math.max(0, newLoser),
    deltaWinner: Math.max(0, newWinner) - winnerElo,
    deltaLoser: Math.max(0, newLoser) - loserElo,
  };
}

module.exports = { K, expectedScore, computeElo };
