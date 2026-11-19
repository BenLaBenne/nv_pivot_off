// engine/rules.js — Moteur PIVOT v2
// Règles : grille 7x7 points, pivot partagé, Rouge=horizontal, Bleu=vertical
// Capacités v2 : 2 virages, 1 tp, 1 diagonale, 3 bornes
// + capacités achetées : Hamer, Double Switch, Clock (voir règles)

const GRID_SIZE = 7;
const START_X = 3; // D
const START_Y = 3; // 4

// Capacités de base v2
function BASE_CAPACITIES() {
  return {
    borne: 3,
    pivot: 2,    // virage
    tp: 1,
    diagonale: 1,
    ds: 0,       // Double Switch
    hamer: 0,
    clock: 0,
  };
}

const CAPACITY_PRICES = {
  ds: 5,
  hamer: 3,
  tp: 3,
  clock: 2,
  pivot: 1,
  diagonale: 1,
};

const ABILITY_LABELS = {
  pivot: 'Pivot (virage)',
  diagonale: 'Diagonale',
  tp: 'TP',
  clock: 'Clock',
  ds: 'Double Switch',
  hamer: 'Hamer',
  borne: 'Borne',
};

// Crée un état initial
function initialState(redId, blueId, purchasedRed = {}, purchasedBlue = {}) {
  const grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  grid[START_Y][START_X] = 'blocked'; // D4 visité
  const redCaps = BASE_CAPACITIES();
  const blueCaps = BASE_CAPACITIES();
  // Ajouter les capacités achetées en phase d'achat
  for (const k of Object.keys(purchasedRed)) {
    if (redCaps[k] !== undefined) redCaps[k] += purchasedRed[k];
  }
  for (const k of Object.keys(purchasedBlue)) {
    if (blueCaps[k] !== undefined) blueCaps[k] += purchasedBlue[k];
  }
  return {
    grid,
    pivot: { x: START_X, y: START_Y },
    redId, blueId,
    startingRedId: redId,
    startingBlueId: blueId,
    current: 'red',
    firstMovePlayed: false,
    swapPending: false,
    capacities: { red: redCaps, blue: blueCaps },
    pendingTp: null,        // {player} quand TP fait, attend move de suivi
    pendingClock: null,    // {player} quand glide du clock fait, attend diagonale 1-step
    pendingDs: null,       // {player, stage} quand virage du DS fait, attend glide propre axe
    moves: [],
    winner: null,
    loser: null,
    createdAt: Date.now(),
  };
}

// --- Helpers grille ---

function isIn(x, y) {
  return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;
}

function isBlocked(grid, x, y) {
  if (!isIn(x, y)) return true;
  return grid[y][x] !== null;
}

function isFree(grid, x, y) {
  return isIn(x, y) && grid[y][x] === null;
}

function isBorne(grid, x, y) {
  if (!isIn(x, y)) return false;
  const v = grid[y][x];
  return v === 'borne_red' || v === 'borne_blue';
}

function freePoints(grid) {
  const pts = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[y][x] === null) pts.push({ x, y });
    }
  }
  return pts;
}

// Renvoie toutes les positions atteignables par glisseur le long de (dx,dy) depuis (fromX,fromY)
function glideRay(grid, fromX, fromY, dx, dy) {
  const dests = [];
  let x = fromX + dx, y = fromY + dy;
  while (isFree(grid, x, y)) {
    dests.push({ x, y });
    x += dx;
    y += dy;
  }
  return dests;
}

// Glisseur sur un axe (horizontal ou vertical)
function axisGlideOptions(grid, fromX, fromY, axis) {
  const dests = [];
  if (axis === 'horizontal') {
    dests.push(...glideRay(grid, fromX, fromY, 1, 0));
    dests.push(...glideRay(grid, fromX, fromY, -1, 0));
  } else {
    dests.push(...glideRay(grid, fromX, fromY, 0, 1));
    dests.push(...glideRay(grid, fromX, fromY, 0, -1));
  }
  return dests;
}

function diagonalOptions(grid, fromX, fromY) {
  const dests = [];
  for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    dests.push(...glideRay(grid, fromX, fromY, dx, dy));
  }
  return dests;
}

// Vérifie si un joueur a au moins un mouvement depuis (x,y)
function hasExitFrom(state, player, x, y) {
  const { grid } = state;
  const caps = state.capacities[player];
  const ownAxis = player === 'red' ? 'horizontal' : 'vertical';
  if (axisGlideOptions(grid, x, y, ownAxis).length > 0) return true;
  if (caps.pivot > 0) {
    const oppAxis = ownAxis === 'horizontal' ? 'vertical' : 'horizontal';
    if (axisGlideOptions(grid, x, y, oppAxis).length > 0) return true;
  }
  if (caps.diagonale > 0 || caps.clock > 0 || caps.ds > 0) {
    if (diagonalOptions(grid, x, y).length > 0) return true;
  }
  return false;
}

// Tous les mouvements possibles pour un joueur (utile pour le frontend + check win)
function getAllMoves(state, player) {
  if (state.winner) return [];
  if (state.swapPending) return [];
  const { grid, pivot } = state;
  const caps = state.capacities[player];
  const moves = [];
  const ownAxis = player === 'red' ? 'horizontal' : 'vertical';

  // Si pending TP, seulement glide/virage/diagonale depuis la position actuelle
  if (state.pendingTp && state.pendingTp.player === player) {
    for (const d of axisGlideOptions(grid, pivot.x, pivot.y, ownAxis)) {
      moves.push({ type: 'glide', toX: d.x, toY: d.y });
    }
    if (caps.pivot > 0) {
      const oppAxis = ownAxis === 'horizontal' ? 'vertical' : 'horizontal';
      for (const d of axisGlideOptions(grid, pivot.x, pivot.y, oppAxis)) {
        moves.push({ type: 'virage', toX: d.x, toY: d.y });
      }
    }
    if (caps.diagonale > 0) {
      for (const d of diagonalOptions(grid, pivot.x, pivot.y)) {
        moves.push({ type: 'diagonale', toX: d.x, toY: d.y });
      }
    }
    return moves;
  }

  // Si pending Clock, seulement diagonale 1-step
  if (state.pendingClock && state.pendingClock.player === player) {
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = pivot.x + dx, ny = pivot.y + dy;
      if (isFree(grid, nx, ny)) {
        moves.push({ type: 'diagonale', toX: nx, toY: ny, steps: 1, fromClock: true });
      }
    }
    return moves;
  }

  // Si pending DS (virage fait), seulement glide sur propre axe
  if (state.pendingDs && state.pendingDs.player === player) {
    for (const d of axisGlideOptions(grid, pivot.x, pivot.y, ownAxis)) {
      moves.push({ type: 'glide', toX: d.x, toY: d.y, fromDs: true });
    }
    return moves;
  }

  // 1. Glisseur normal sur son axe
  for (const d of axisGlideOptions(grid, pivot.x, pivot.y, ownAxis)) {
    moves.push({ type: 'glide', toX: d.x, toY: d.y });
  }

  // 2. Borne (sur n'importe quel point libre sauf le pivot)
  if (caps.borne > 0) {
    for (const p of freePoints(grid)) {
      if (p.x === pivot.x && p.y === pivot.y) continue;
      moves.push({ type: 'borne', toX: p.x, toY: p.y });
    }
  }

  // 3. Virage (P capacity) — glisseur sur l'axe adverse
  if (caps.pivot > 0) {
    const oppAxis = ownAxis === 'horizontal' ? 'vertical' : 'horizontal';
    for (const d of axisGlideOptions(grid, pivot.x, pivot.y, oppAxis)) {
      moves.push({ type: 'virage', toX: d.x, toY: d.y });
    }
  }

  // 4. Diagonale
  if (caps.diagonale > 0) {
    for (const d of diagonalOptions(grid, pivot.x, pivot.y)) {
      moves.push({ type: 'diagonale', toX: d.x, toY: d.y });
    }
  }

  // 5. TP — n'importe quel point libre AVEC une sortie
  if (caps.tp > 0) {
    for (const p of freePoints(grid)) {
      if (hasExitFrom(state, player, p.x, p.y)) {
        moves.push({ type: 'tp', toX: p.x, toY: p.y });
      }
    }
  }

  // 6. Hamer — supprimer n'importe quelle borne
  if (caps.hamer > 0) {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (isBorne(grid, x, y)) {
          moves.push({ type: 'hamer', targetX: x, targetY: y });
        }
      }
    }
  }

  // 7. Clock — glide propre axe + diagonale 1-step (composite)
  if (caps.clock > 0) {
    for (const d of axisGlideOptions(grid, pivot.x, pivot.y, ownAxis)) {
      // Pour chaque destination de glide, vérifier qu'une diagonale 1-step est possible
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = d.x + dx, ny = d.y + dy;
        if (isFree(grid, nx, ny)) {
          moves.push({ type: 'clock', glideX: d.x, glideY: d.y, diagX: nx, diagY: ny });
        }
      }
    }
  }

  // 8. Double Switch — 3 options :
  //    a) virage + glide propre axe
  //    b) diagonale (utilise DS)
  //    c) hamer (utilise DS)
  if (caps.ds > 0) {
    // a) virage + glide
    const oppAxis = ownAxis === 'horizontal' ? 'vertical' : 'horizontal';
    for (const v of axisGlideOptions(grid, pivot.x, pivot.y, oppAxis)) {
      // Simuler le virage : marquer le trajet + destination
      const tmpGrid = grid.map(r => r.slice());
      markLine(tmpGrid, pivot.x, pivot.y, v.x, v.y);
      for (const g of axisGlideOptions(tmpGrid, v.x, v.y, ownAxis)) {
        moves.push({ type: 'ds', option: 'virage_glide', virageX: v.x, virageY: v.y, glideX: g.x, glideY: g.y });
      }
    }
    // b) diagonale (utilise DS au lieu de D)
    for (const d of diagonalOptions(grid, pivot.x, pivot.y)) {
      moves.push({ type: 'ds', option: 'diagonale', toX: d.x, toY: d.y });
    }
    // c) hamer (utilise DS au lieu de H)
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (isBorne(grid, x, y)) {
          moves.push({ type: 'ds', option: 'hamer', targetX: x, targetY: y });
        }
      }
    }
  }

  return moves;
}

function hasAnyMove(state, player) {
  return getAllMoves(state, player).length > 0;
}

// Marque le trajet (fromX,fromY) → (toX,toY) comme visité (bloqué).
// from n'est PAS re-marqué (déjà bloqué puisque pivot l'a quitté précédemment).
// to est marqué. Les points intermédiaires aussi.
function markLine(grid, fromX, fromY, toX, toY) {
  const dx = Math.sign(toX - fromX);
  const dy = Math.sign(toY - fromY);
  let x = fromX + dx, y = fromY + dy;
  while (x !== toX || y !== toY) {
    if (grid[y][x] === null) grid[y][x] = 'blocked';
    x += dx;
    y += dy;
  }
  if (grid[toY][toX] === null) grid[toY][toX] = 'blocked';
}

// Applique un glisseur (typre 'glide' ou 'virage' ou 'diagonale')
function applyGlideLike(state, move, player, kind) {
  const { grid, pivot } = state;
  const fromX = pivot.x, fromY = pivot.y;
  const toX = move.toX, toY = move.toY;

  // Vérifier destination dans la grille
  if (!isIn(toX, toY)) return { error: 'Destination hors grille' };
  // Vérifier destination libre
  if (!isFree(grid, toX, toY)) return { error: 'Destination bloquée' };
  // Vérifier ligne droite
  const dx = toX - fromX, dy = toY - fromY;
  if (kind === 'glide') {
    // Propre axe : un seul axe non nul
    if (dx !== 0 && dy !== 0) return { error: 'Glisseur doit être sur ton axe' };
    if (dx === 0 && dy === 0) return { error: 'Glisseur doit faire au moins 1 pas' };
  } else if (kind === 'virage') {
    if (dx !== 0 && dy !== 0) return { error: 'Virage doit être sur axe adverse' };
    if (dx === 0 && dy === 0) return { error: 'Virage doit faire au moins 1 pas' };
  } else if (kind === 'diagonale') {
    if (Math.abs(dx) !== Math.abs(dy) || dx === 0) return { error: 'Diagonale doit être en ligne diagonale' };
  }
  // Vérifier aucun point bloqué sur le trajet
  const sx = Math.sign(dx), sy = Math.sign(dy);
  let x = fromX + sx, y = fromY + sy;
  while (x !== toX || y !== toY) {
    if (!isFree(grid, x, y)) return { error: 'Trajet bloqué' };
    x += sx;
    y += sy;
  }
  // OK, appliquer
  markLine(grid, fromX, fromY, toX, toY);
  // from reste bloqué (déjà à null marké par markLine? Non, on commence à from+dx)
  // En fait le pivot occupe fromX,fromY qui est déjà bloqué (sinon il ne pourrait pas y être).
  // Mais pour le tour initial, D4 est marqué blocked. Pour les autres, le pivot y était, donc bloqué.
  // On s'assure :
  if (grid[fromY][fromX] === null) grid[fromY][fromX] = 'blocked';
  state.pivot = { x: toX, y: toY };
  return {};
}

function applyGlide(state, move, player) {
  return applyGlideLike(state, move, player, 'glide');
}
function applyVirage(state, move, player) {
  const caps = state.capacities[player];
  // Si le virage vient d'un DS combo, ne consomme pas P
  if (!move.fromDs) {
    if (caps.pivot <= 0) return { error: 'Plus de virage disponible' };
    caps.pivot -= 1;
  }
  return applyGlideLike(state, move, player, 'virage');
}
function applyDiagonale(state, move, player) {
  const caps = state.capacities[player];
  // Si diagonale depuis clock, consomme pas D (consommé à l'envoi du clock)
  // Si depuis DS option diagonale, consomme pas D (consomme DS déjà fait)
  if (!move.fromClock && !move.fromDs) {
    if (caps.diagonale <= 0) return { error: 'Plus de diagonale disponible' };
    caps.diagonale -= 1;
  }
  if (move.fromClock) {
    // Doit être 1 step
    const dx = Math.abs(move.toX - state.pivot.x);
    const dy = Math.abs(move.toY - state.pivot.y);
    if (dx !== 1 || dy !== 1) return { error: 'Clock diagonale doit faire 1 pas' };
  }
  return applyGlideLike(state, move, player, 'diagonale');
}

function applyTp(state, move, player) {
  const caps = state.capacities[player];
  if (caps.tp <= 0) return { error: 'Plus de TP disponible' };
  const { grid, pivot } = state;
  const toX = move.toX, toY = move.toY;
  if (!isIn(toX, toY)) return { error: 'TP hors grille' };
  if (!isFree(grid, toX, toY)) return { error: 'TP sur case bloquée' };
  if (!hasExitFrom(state, player, toX, toY)) {
    return { error: 'TP sur point sans issue : interdit' };
  }
  // Marquer l'ancien point comme bloqué (déjà bloqué normalement, on s'assure)
  if (grid[pivot.y][pivot.x] === null) grid[pivot.y][pivot.x] = 'blocked';
  // Marquer le nouveau point comme visité (bloqué)
  grid[toY][toX] = 'blocked';
  state.pivot = { x: toX, y: toY };
  caps.tp -= 1;
  // Le joueur DOIT faire un glisseur/virage/diagonale ensuite
  state.pendingTp = { player };
  return {};
}

function applyBorne(state, move, player) {
  const caps = state.capacities[player];
  if (caps.borne <= 0) return { error: 'Plus de bornes' };
  const { grid, pivot } = state;
  const toX = move.toX, toY = move.toY;
  if (!isIn(toX, toY)) return { error: 'Borne hors grille' };
  if (!isFree(grid, toX, toY)) return { error: 'Point non libre' };
  if (toX === pivot.x && toY === pivot.y) return { error: 'Ne peut poser une borne sur le pivot' };
  grid[toY][toX] = player === 'red' ? 'borne_red' : 'borne_blue';
  caps.borne -= 1;
  return {};
}

function applyHamer(state, move, player) {
  const caps = state.capacities[player];
  if (caps.hamer <= 0) return { error: 'Plus de Hamer' };
  const { grid } = state;
  const tx = move.targetX, ty = move.targetY;
  if (!isIn(tx, ty)) return { error: 'Cible hors grille' };
  if (!isBorne(grid, tx, ty)) return { error: 'Cible n\'est pas une borne' };
  grid[ty][tx] = null; // redevient libre
  caps.hamer -= 1;
  return {};
}

function applyClock(state, move, player) {
  const caps = state.capacities[player];
  if (caps.clock <= 0) return { error: 'Plus de Clock' };
  // move: { glideX, glideY, diagX, diagY }
  const { grid, pivot } = state;
  const ownAxis = player === 'red' ? 'horizontal' : 'vertical';

  // 1. Valider le glide sur propre axe
  const gX = move.glideX, gY = move.glideY;
  if (!isIn(gX, gY)) return { error: 'Glide clock hors grille' };
  if (!isFree(grid, gX, gY)) return { error: 'Glide clock destination bloquée' };
  // Vérifier ligne droite sur propre axe
  const dgx = gX - pivot.x, dgy = gY - pivot.y;
  if (ownAxis === 'horizontal') {
    if (dgy !== 0 || dgx === 0) return { error: 'Clock glide doit être horizontal' };
  } else {
    if (dgx !== 0 || dgy === 0) return { error: 'Clock glide doit être vertical' };
  }
  // Vérifier trajet libre
  const sx = Math.sign(dgx), sy = Math.sign(dgy);
  let x = pivot.x + sx, y = pivot.y + sy;
  while (x !== gX || y !== gY) {
    if (!isFree(grid, x, y)) return { error: 'Clock glide trajet bloqué' };
    x += sx; y += sy;
  }
  // Appliquer le glide
  markLine(grid, pivot.x, pivot.y, gX, gY);
  if (grid[pivot.y][pivot.x] === null) grid[pivot.y][pivot.x] = 'blocked';
  state.pivot = { x: gX, y: gY };

  // 2. Valider la diagonale 1-step depuis la nouvelle position
  const dX = move.diagX, dY = move.diagY;
  if (!isIn(dX, dY)) return { error: 'Clock diagonale hors grille' };
  if (!isFree(grid, dX, dY)) return { error: 'Clock diagonale destination bloquée' };
  const ddx = dX - gX, ddy = dY - gY;
  if (Math.abs(ddx) !== 1 || Math.abs(ddy) !== 1) {
    return { error: 'Clock diagonale doit faire 1 pas' };
  }
  // Appliquer la diagonale
  markLine(grid, gX, gY, dX, dY);
  state.pivot = { x: dX, y: dY };

  caps.clock -= 1;
  return {};
}

function applyDs(state, move, player) {
  const caps = state.capacities[player];
  if (caps.ds <= 0) return { error: 'Plus de Double Switch' };
  const { grid, pivot } = state;
  const ownAxis = player === 'red' ? 'horizontal' : 'vertical';
  const oppAxis = ownAxis === 'horizontal' ? 'vertical' : 'horizontal';

  if (move.option === 'virage_glide') {
    // 1. Virage (axe adverse)
    const vX = move.virageX, vY = move.virageY;
    if (!isIn(vX, vY) || !isFree(grid, vX, vY)) return { error: 'DS virage destination invalide' };
    const dvx = vX - pivot.x, dvy = vY - pivot.y;
    if (oppAxis === 'horizontal') {
      if (dvy !== 0 || dvx === 0) return { error: 'DS virage doit être horizontal' };
    } else {
      if (dvx !== 0 || dvy === 0) return { error: 'DS virage doit être vertical' };
    }
    const sx = Math.sign(dvx), sy = Math.sign(dvy);
    let x = pivot.x + sx, y = pivot.y + sy;
    while (x !== vX || y !== vY) {
      if (!isFree(grid, x, y)) return { error: 'DS virage trajet bloqué' };
      x += sx; y += sy;
    }
    markLine(grid, pivot.x, pivot.y, vX, vY);
    if (grid[pivot.y][pivot.x] === null) grid[pivot.y][pivot.x] = 'blocked';
    state.pivot = { x: vX, y: vY };

    // 2. Glide sur propre axe depuis la nouvelle position
    const gX = move.glideX, gY = move.glideY;
    if (!isIn(gX, gY) || !isFree(grid, gX, gY)) return { error: 'DS glide destination invalide' };
    const dgx = gX - vX, dgy = gY - vY;
    if (ownAxis === 'horizontal') {
      if (dgy !== 0 || dgx === 0) return { error: 'DS glide doit être horizontal' };
    } else {
      if (dgx !== 0 || dgy === 0) return { error: 'DS glide doit être vertical' };
    }
    const sx2 = Math.sign(dgx), sy2 = Math.sign(dgy);
    let x2 = vX + sx2, y2 = vY + sy2;
    while (x2 !== gX || y2 !== gY) {
      if (!isFree(grid, x2, y2)) return { error: 'DS glide trajet bloqué' };
      x2 += sx2; y2 += sy2;
    }
    markLine(grid, vX, vY, gX, gY);
    state.pivot = { x: gX, y: gY };
    caps.ds -= 1;
    return {};
  }

  if (move.option === 'diagonale') {
    // Diagonale (utilise DS)
    const dX = move.toX, dY = move.toY;
    if (!isIn(dX, dY) || !isFree(grid, dX, dY)) return { error: 'DS diagonale destination invalide' };
    const ddx = dX - pivot.x, ddy = dY - pivot.y;
    if (Math.abs(ddx) !== Math.abs(ddy) || ddx === 0) return { error: 'DS diagonale doit être diagonale' };
    const sx = Math.sign(ddx), sy = Math.sign(ddy);
    let x = pivot.x + sx, y = pivot.y + sy;
    while (x !== dX || y !== dY) {
      if (!isFree(grid, x, y)) return { error: 'DS diagonale trajet bloqué' };
      x += sx; y += sy;
    }
    markLine(grid, pivot.x, pivot.y, dX, dY);
    if (grid[pivot.y][pivot.x] === null) grid[pivot.y][pivot.x] = 'blocked';
    state.pivot = { x: dX, y: dY };
    caps.ds -= 1;
    return {};
  }

  if (move.option === 'hamer') {
    // Hamer (utilise DS)
    const tX = move.targetX, tY = move.targetY;
    if (!isIn(tX, tY) || !isBorne(grid, tX, tY)) return { error: 'DS hamer cible invalide' };
    grid[tY][tX] = null;
    caps.ds -= 1;
    return {};
  }

  return { error: 'DS option inconnue' };
}

// Applique un move (entry point principal)
function applyMove(state, move, playerId) {
  if (state.winner) return { error: 'Partie terminée' };
  if (state.swapPending) return { error: 'En attente du choix de camp de Bleu' };

  const expected = state.current;
  const expectedUserId = expected === 'red' ? state.redId : state.blueId;
  if (playerId !== expectedUserId) return { error: 'Pas à toi de jouer' };

  // Si pendingClock, seul un move diagonale 1-step est accepté
  if (state.pendingClock && state.pendingClock.player === expected) {
    if (move.type !== 'diagonale') return { error: 'Doit finir le Clock avec une diagonale 1 pas' };
    move.fromClock = true;
    const r = applyDiagonale(state, move, expected);
    if (r.error) return r;
    state.pendingClock = null;
    state.moves.push({ player: expected, ...move });
    return finishTurn(state, expected);
  }

  // Si pendingDs (stage virage_done), seul un move glide sur propre axe est accepté
  if (state.pendingDs && state.pendingDs.player === expected && state.pendingDs.stage === 'virage_done') {
    if (move.type !== 'glide') return { error: 'Doit finir le DS avec un glide propre axe' };
    move.fromDs = true;
    const r = applyGlide(state, move, expected);
    if (r.error) return r;
    state.pendingDs = null;
    state.moves.push({ player: expected, ...move });
    return finishTurn(state, expected);
  }

  // Si pendingTp, seulement glide/virage/diagonale
  if (state.pendingTp && state.pendingTp.player === expected) {
    if (!['glide', 'virage', 'diagonale'].includes(move.type)) {
      return { error: 'Après TP, dois faire un glide / virage / diagonale' };
    }
    let r;
    if (move.type === 'glide') r = applyGlide(state, move, expected);
    else if (move.type === 'virage') r = applyVirage(state, move, expected);
    else r = applyDiagonale(state, move, expected);
    if (r.error) return r;
    state.pendingTp = null;
    state.moves.push({ player: expected, ...move });
    return finishTurn(state, expected);
  }

  // Move normal
  let r;
  switch (move.type) {
    case 'glide': r = applyGlide(state, move, expected); break;
    case 'virage': r = applyVirage(state, move, expected); break;
    case 'diagonale': r = applyDiagonale(state, move, expected); break;
    case 'tp': r = applyTp(state, move, expected); break;
    case 'borne': r = applyBorne(state, move, expected); break;
    case 'hamer': r = applyHamer(state, move, expected); break;
    case 'clock': r = applyClock(state, move, expected); break;
    case 'ds': r = applyDs(state, move, expected); break;
    default: return { error: 'Type de move inconnu : ' + move.type };
  }
  if (r.error) return r;
  state.moves.push({ player: expected, ...move });

  // Si pending (TP ou Clock ou DS combo), ne pas terminer le tour
  if (state.pendingTp) return { state, awaitingFollowUp: 'tp' };
  if (state.pendingClock) return { state, awaitingFollowUp: 'clock' };
  if (state.pendingDs) return { state, awaitingFollowUp: 'ds' };

  return finishTurn(state, expected);
}

// Terminer un tour : gérer premier move (swap) + changement de joueur + check win
function finishTurn(state, expected) {
  // Si c'était le premier move (Red), déclencher la phase swap
  if (!state.firstMovePlayed && expected === 'red') {
    state.firstMovePlayed = true;
    state.swapPending = true;
    // Le current reste 'red' symboliquement, mais l'UI doit demander à Bleu son choix
    // Une fois le choix fait, current devient 'blue' (avec ou sans swap des IDs)
    return { state, swapPending: true };
  }

  // Sinon, switch de tour
  state.current = expected === 'red' ? 'blue' : 'red';

  // Vérifier que le prochain joueur peut jouer
  if (!hasAnyMove(state, state.current)) {
    state.winner = expected;
    state.loser = state.current;
  }
  return { state };
}

// Applique le choix de camp de Bleu (après le 1er coup de Rouge)
function applySwapChoice(state, playerId, choice) {
  if (!state.swapPending) return { error: 'Pas de swap en attente' };
  // Seul le Bleu courant décide
  if (playerId !== state.blueId) return { error: 'Seul Bleu peut choisir le swap' };
  state.swapPending = false;
  if (choice === 'swap') {
    const tmp = state.redId;
    state.redId = state.blueId;
    state.blueId = tmp;
  }
  // C'est maintenant au Bleu (potentiellement nouveau) de jouer
  state.current = 'blue';
  // Vérifier qu'il peut jouer
  if (!hasAnyMove(state, 'blue')) {
    state.winner = 'red';
    state.loser = 'blue';
  }
  return { state };
}

// Achats en phase d'achat : valider + appliquer
function validatePurchase(purchased, pbucks) {
  let total = 0;
  for (const [k, q] of Object.entries(purchased)) {
    if (!CAPACITY_PRICES[k]) return { error: 'Capacité inconnue: ' + k };
    if (q < 0 || !Number.isInteger(q)) return { error: 'Quantité invalide' };
    total += CAPACITY_PRICES[k] * q;
  }
  if (total > pbucks) return { error: 'Pas assez de Pbucks' };
  return { total };
}

// Sérialise l'état pour envoi au client (sans exposer les ID des joueurs adverses si besoin)
function serializeForPlayer(state, viewerId) {
  return {
    grid: state.grid,
    pivot: state.pivot,
    redId: state.redId,
    blueId: state.blueId,
    current: state.current,
    firstMovePlayed: state.firstMovePlayed,
    swapPending: state.swapPending,
    capacities: state.capacities,
    pendingTp: state.pendingTp,
    pendingClock: state.pendingClock,
    pendingDs: state.pendingDs,
    moves: state.moves,
    winner: state.winner,
    loser: state.loser,
    isRed: viewerId === state.redId,
    isBlue: viewerId === state.blueId,
    myTurn: viewerId === (state.current === 'red' ? state.redId : state.blueId) && !state.swapPending,
  };
}

module.exports = {
  GRID_SIZE, START_X, START_Y,
  BASE_CAPACITIES, CAPACITY_PRICES, ABILITY_LABELS,
  initialState,
  isBlocked, isFree, isBorne,
  freePoints, axisGlideOptions, diagonalOptions, glideRay,
  hasAnyMove, hasExitFrom, getAllMoves,
  applyMove, applySwapChoice,
  validatePurchase,
  serializeForPlayer,
};
