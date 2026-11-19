// js/game.js — Socket.io, matchmaking, plateau de jeu, coups en temps réel
// Point d'entrée : Game.initSocket(), Game.joinRankedQueue(), Game.openPrivateRoom()

const GRID_SIZE = 7;
const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const CELL = 100; // taille d'une case en pixels (viewBox 760x760, padding 20)
const PAD = 60;
const RADIUS = 22;

const Game = {
  socket: null,
  currentGameId: null,
  currentGame: null,
  myColor: null, // 'red' ou 'blue'
  selectedAbility: null, // 'glide', 'borne', 'virage', 'diagonale', 'tp', 'hamer', 'clock', 'ds'
  pendingTp: false, // true si on doit faire un move de suivi après TP
  pendingClock: false,
  pendingDs: false,
  myPurchase: { pivot: 0, diagonale: 0, tp: 0, clock: 0, ds: 0, hamer: 0 },
  pbucksLeft: 10,

  initSocket() {
    if (this.socket) return;
    // Récupérer le token JWT depuis le cookie
    const token = this.getCookie('token');
    if (!token) { console.warn('Pas de token pour le socket'); return; }
    this.socket = io({ auth: { token } });
    this.bindSocketEvents();
  },

  getCookie(name) {
    const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? m.pop() : null;
  },

  bindSocketEvents() {
    const s = this.socket;
    s.on('connect', () => console.log('[socket] connecté', s.id));
    s.on('connect_error', (err) => console.error('[socket] erreur:', err.message));

    // Queue events
    s.on('queue:joined', (d) => {
      document.getElementById('matchmaking-overlay').hidden = false;
      document.getElementById('queue-elo').textContent = Auth.getCurrentUser().elo || 1000;
    });
    s.on('queue:left', () => {
      document.getElementById('matchmaking-overlay').hidden = true;
    });
    s.on('queue:matchFound', (d) => {
      console.log('[socket] match trouvé', d);
      document.getElementById('matchmaking-overlay').hidden = true;
      this.currentGameId = d.gameId;
      this.enterPurchasePhase();
    });

    // Private room events
    s.on('private:created', (d) => {
      document.getElementById('private-code-display').hidden = false;
      document.getElementById('private-code').textContent = d.code;
    });
    s.on('private:matchFound', (d) => {
      document.getElementById('private-room-overlay').hidden = true;
      this.currentGameId = d.gameId;
      this.enterPurchasePhase();
    });

    // Game events
    s.on('game:start', (d) => {
      console.log('[socket] game:start', d);
      this.currentGameId = d.gameId;
      // L'UI de purchase est déjà affichée
    });

    s.on('game:playingStart', (state) => {
      console.log('[socket] playing start', state);
      this.currentGame = state;
      this.showGameScreen();
      this.renderBoard();
      this.updateUI();
      // Activer l'UI pour le rouge (premier coup)
      this.refreshMyTurn();
    });

    s.on('game:state', (state) => {
      this.currentGame = state;
      this.renderBoard();
      this.updateUI();
      this.refreshMyTurn();
    });

    s.on('game:move', (d) => {
      this.log(`Coup joué : ${JSON.stringify(d.move).slice(0, 60)}`);
      Sounds.playSound('move');
    });

    s.on('game:moveError', (d) => {
      Toast.show(d.error, 'error');
    });

    s.on('game:awaitingFollowUp', (d) => {
      if (d.type === 'tp') { this.pendingTp = true; Toast.show('TP : fais un glisser / virage / diagonale maintenant', 'info'); }
      else if (d.type === 'clock') { this.pendingClock = true; Toast.show('Clock : fais une diagonale 1 pas', 'info'); }
      else if (d.type === 'ds') { this.pendingDs = true; Toast.show('DS : fais un glisser sur ton axe', 'info'); }
    });

    s.on('camp:choose', () => {
      document.getElementById('camp-swap-overlay').hidden = false;
    });

    s.on('camp:chosen', (d) => {
      document.getElementById('camp-swap-overlay').hidden = true;
      this.log(`Bleu a ${d.choice === 'swap' ? 'échangé' : 'gardé'} les camps`);
    });

    s.on('game:yourTurn', () => {
      this.log('À toi de jouer !');
      this.refreshMyTurn();
    });

    s.on('game:opponentDisconnected', () => {
      Toast.show('Adversaire déconnecté (60s pour revenir)', 'info');
    });

    s.on('game:win', (d) => {
      Sounds.playSound('win');
      this.showGameOver(true, d);
    });
    s.on('game:lose', (d) => {
      Sounds.playSound('lose');
      this.showGameOver(false, d);
    });
    s.on('game:over', (state) => {
      this.currentGame = state;
      this.renderBoard();
    });

    s.on('purchase:opponentReady', (d) => {
      this.log('Adversaire prêt');
    });

    s.on('game:chat', (d) => {
      const u = d.userId === this.currentGame?.redId ? '🔴' : '🔵';
      this.log(`${u} ${d.text}`);
    });

    s.on('game:resume', (state) => {
      this.currentGame = state;
      this.currentGameId = state.id;
      this.showGameScreen();
      this.renderBoard();
      this.updateUI();
      this.refreshMyTurn();
    });

    s.on('error', (d) => Toast.show(d.error, 'error'));
  },

  // ---- Matchmaking ranked ----
  joinRankedQueue() {
    if (!this.socket) this.initSocket();
    this.socket.emit('queue:join');
    navigateToGame();
    document.getElementById('matchmaking-overlay').hidden = false;
    document.getElementById('queue-elo').textContent = Auth.getCurrentUser().elo || 1000;
    // Bind cancel
    document.getElementById('cancel-queue').onclick = () => {
      this.socket.emit('queue:leave');
      document.getElementById('matchmaking-overlay').hidden = true;
    };
  },

  // ---- Private room ----
  openPrivateRoom() {
    if (!this.socket) this.initSocket();
    navigateToGame();
    document.getElementById('private-room-overlay').hidden = false;
    document.getElementById('private-code-display').hidden = true;
    document.getElementById('create-private').onclick = () => this.socket.emit('private:create');
    document.getElementById('join-private').onclick = () => {
      const code = document.getElementById('join-code-input').value.trim().toUpperCase();
      if (!code) return;
      this.socket.emit('private:join', { code });
    };
    document.getElementById('copy-private-code').onclick = () => {
      const c = document.getElementById('private-code').textContent;
      navigator.clipboard.writeText(c);
      Toast.show('Code copié !', 'success');
    };
  },

  // ---- Phase d'achat ----
  enterPurchasePhase() {
    navigateToGame();
    const overlay = document.getElementById('purchase-overlay');
    overlay.hidden = false;
    this.myPurchase = { pivot: 0, diagonale: 0, tp: 0, clock: 0, ds: 0, hamer: 0 };
    this.pbucksLeft = 10;
    const PRICES = { ds: 5, hamer: 3, tp: 3, clock: 2, pivot: 1, diagonale: 1 };
    const items = document.getElementById('purchase-items');
    items.innerHTML = Object.entries(PRICES).map(([k, p]) => `
      <div class="purchase-item">
        <div class="purchase-item-name">${ABILITY_ICONS[k]} ${ABILITY_LABELS[k]} (${p} Pbucks/u)</div>
        <div class="purchase-item-controls">
          <button data-action="dec" data-key="${k}">−</button>
          <span class="qty" data-key="${k}">0</span>
          <button data-action="inc" data-key="${k}">+</button>
        </div>
      </div>
    `).join('');
    items.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.key;
        const action = btn.dataset.action;
        const delta = action === 'inc' ? 1 : -1;
        const newQ = Math.max(0, this.myPurchase[key] + delta);
        if (action === 'inc' && newQ * PRICES[key] > (this.pbucksLeft + this.myPurchase[key] * PRICES[key])) {
          Toast.show('Pas assez de Pbucks', 'error'); return;
        }
        this.myPurchase[key] = newQ;
        this.pbucksLeft = 10 - Object.entries(this.myPurchase).reduce((s, [k, q]) => s + q * PRICES[k], 0);
        items.querySelector(`.qty[data-key="${key}"]`).textContent = newQ;
        overlay.querySelector('.pbucks-left').textContent = this.pbucksLeft;
      };
    });
    document.getElementById('purchase-validate').onclick = () => {
      Sounds.playSound('click');
      this.socket.emit('purchase:submit', { gameId: this.currentGameId, purchased: this.myPurchase });
      overlay.querySelector('h2').textContent = 'En attente de l\'adversaire...';
    };
  },

  showGameOver(win, d) {
    const overlay = document.getElementById('gameover-overlay');
    document.getElementById('gameover-title').textContent = win ? '🏆 Victoire !' : '💀 Défaite';
    document.getElementById('gameover-title').style.color = win ? 'var(--success)' : 'var(--danger)';
    const stats = document.getElementById('gameover-stats');
    if (win) {
      stats.innerHTML = `
        <div class="stat"><span class="stat-label">Trophies gagnés</span><span class="stat-value positive">+${d.trEarned}</span></div>
        <div class="stat"><span class="stat-label">Gems (Pgs) gagnées</span><span class="stat-value positive">+${d.pgsEarned}</span></div>
        <div class="stat"><span class="stat-label">XP Pass gagnée</span><span class="stat-value positive">+${d.xpEarned}</span></div>
        <div class="stat"><span class="stat-label">Série de victoires</span><span class="stat-value">🔥 ${d.newStreak}</span></div>
        <div class="stat"><span class="stat-label">Nouveaux TR</span><span class="stat-value">🏆 ${d.newTrophies}</span></div>
        <div class="stat"><span class="stat-label">Nouveau rang</span><span class="stat-value">${d.newRank.name}</span></div>
        <div class="stat"><span class="stat-label">Elo</span><span class="stat-value ${d.eloChange >= 0 ? 'positive' : 'negative'}">${d.eloChange >= 0 ? '+' : ''}${d.eloChange}</span></div>
      `;
    } else {
      stats.innerHTML = `
        <div class="stat"><span class="stat-label">Trophies perdus</span><span class="stat-value negative">-${d.trLost}</span></div>
        <div class="stat"><span class="stat-label">Gems (Pgs) perdues</span><span class="stat-value negative">-${d.pgsLost}</span></div>
        <div class="stat"><span class="stat-label">XP Pass gagnée</span><span class="stat-value positive">+${d.xpEarned}</span></div>
        <div class="stat"><span class="stat-label">Nouveaux TR</span><span class="stat-value">🏆 ${d.newTrophies}</span></div>
        <div class="stat"><span class="stat-label">Nouveau rang</span><span class="stat-value">${d.newRank.name}</span></div>
        <div class="stat"><span class="stat-label">Elo</span><span class="stat-value ${d.eloChange >= 0 ? 'positive' : 'negative'}">${d.eloChange >= 0 ? '+' : ''}${d.eloChange}</span></div>
        ${d.forfeit ? '<div class="stat"><span class="stat-label">Mode</span><span class="stat-value">Forfeit</span></div>' : ''}
      `;
    }
    overlay.hidden = false;
  },

  // ---- Affichage jeu ----
  showGameScreen() {
    document.getElementById('purchase-overlay').hidden = true;
    document.getElementById('app-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    // Déterminer ma couleur
    const me = Auth.getCurrentUser();
    if (this.currentGame.redId === me.id) this.myColor = 'red';
    else if (this.currentGame.blueId === me.id) this.myColor = 'blue';
    else this.myColor = null;
  },

  refreshMyTurn() {
    if (!this.currentGame) return;
    const me = Auth.getCurrentUser();
    const expected = this.currentGame.current === 'red' ? this.currentGame.redId : this.currentGame.blueId;
    const myTurn = me.id === expected && !this.currentGame.swapPending && !this.currentGame.winner;
    // Activer/désactiver boutons capacité
    const caps = this.currentGame.capacities[this.currentGame.current] || {};
    document.querySelectorAll('.ability-btn').forEach(b => {
      const ab = b.dataset.ability;
      if (!ab || ab === 'glide') { b.disabled = !myTurn; return; }
      if (ab === 'borne') { b.disabled = !myTurn || (caps.borne || 0) <= 0; return; }
      if (ab === 'virage') { b.disabled = !myTurn || (caps.pivot || 0) <= 0; return; }
      if (ab === 'diagonale') { b.disabled = !myTurn || (caps.diagonale || 0) <= 0; return; }
      if (ab === 'tp') { b.disabled = !myTurn || (caps.tp || 0) <= 0; return; }
      if (ab === 'hamer') { b.disabled = !myTurn || (caps.hamer || 0) <= 0; return; }
      if (ab === 'clock') { b.disabled = !myTurn || (caps.clock || 0) <= 0; return; }
      if (ab === 'ds') { b.disabled = !myTurn || (caps.ds || 0) <= 0; return; }
    });
    // Indiquer le tour
    if (this.currentGame.winner) {
      const myWin = this.currentGame.winner === this.myColor;
      document.getElementById('game-turn').textContent = myWin ? '🏆 Gagné !' : '💀 Perdu';
    } else if (this.currentGame.swapPending) {
      document.getElementById('game-turn').textContent = 'Bleu choisit son camp...';
    } else if (myTurn) {
      document.getElementById('game-turn').textContent = 'À toi de jouer !';
    } else {
      document.getElementById('game-turn').textContent = 'Tour adverse';
    }
  },

  // Dessine le plateau SVG
  renderBoard() {
    if (!this.currentGame) return;
    const state = this.currentGame;
    const svg = document.getElementById('game-board');
    const me = Auth.getCurrentUser();
    const myColor = state.redId === me.id ? 'red' : 'blue';

    // Calculer les destinations valides pour le mode ability sélectionné
    const validTargets = this.computeValidTargets();

    let html = '<defs>';
    // Pattern pour bornes rouges/bleues
    html += `<pattern id="borne-red-pat" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="4" fill="#FF4D6D"/>
      <line x1="0" y1="0" x2="4" y2="4" stroke="#9F1239" stroke-width="1"/>
    </pattern>`;
    html += `<pattern id="borne-blue-pat" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="4" fill="#2EC4FF"/>
      <line x1="0" y1="0" x2="4" y2="4" stroke="#0369A1" stroke-width="1"/>
    </pattern>`;
    html += '</defs>';

    // Lignes de la grille
    for (let i = 0; i < GRID_SIZE; i++) {
      html += `<line x1="${PAD + i * CELL}" y1="${PAD}" x2="${PAD + i * CELL}" y2="${PAD + (GRID_SIZE - 1) * CELL}" stroke="#3a4055" stroke-width="1"/>`;
      html += `<line x1="${PAD}" y1="${PAD + i * CELL}" x2="${PAD + (GRID_SIZE - 1) * CELL}" y2="${PAD + i * CELL}" stroke="#3a4055" stroke-width="1"/>`;
    }

    // Labels colonnes (A-G) et lignes (1-7)
    for (let i = 0; i < GRID_SIZE; i++) {
      html += `<text x="${PAD + i * CELL}" y="${PAD - 20}" fill="#A0A8BC" font-size="14" text-anchor="middle" font-weight="700">${COLS[i]}</text>`;
      html += `<text x="${PAD - 25}" y="${PAD + i * CELL + 5}" fill="#A0A8BC" font-size="14" text-anchor="middle" font-weight="700">${i + 1}</text>`;
    }

    // Points
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cx = PAD + x * CELL;
        const cy = PAD + y * CELL;
        const v = state.grid[y][x];
        const isPivot = state.pivot.x === x && state.pivot.y === y;
        const isValidTarget = validTargets.some(t => t.x === x && t.y === y);
        let cls = 'pivot-dot';
        let fill = 'white';
        let stroke = '#1a1f2e';
        if (v === 'blocked') { cls += ' blocked'; fill = '#4B5563'; }
        else if (v === 'borne_red') { cls += ' borne-red'; fill = 'url(#borne-red-pat)'; stroke = '#9F1239'; }
        else if (v === 'borne_blue') { cls += ' borne-blue'; fill = 'url(#borne-blue-pat)'; stroke = '#0369A1'; }
        if (isPivot) { cls += ' current'; fill = '#FFB02E'; stroke = '#FF6B35'; }
        else if (isValidTarget) { cls += ' valid-target'; fill = '#FFB02E'; }
        html += `<circle cx="${cx}" cy="${cy}" r="${RADIUS}" class="${cls}" data-x="${x}" data-y="${y}"/>`;
      }
    }

    // Tracer les trajets (path lines)
    // On a state.moves : liste des coups. Pour les glissers/virages/diagonales, tracer ligne from->to.
    // Les fromX/fromY sont implicites : la position avant le coup. On les recompute à partir de l'historique.
    // Pour simplicité : on trace les lines à partir des moves et de la position initiale.
    let curX = 3, curY = 3; // D4
    for (const m of state.moves) {
      let toX, toY, color;
      if (m.type === 'glide' || m.type === 'virage' || m.type === 'diagonale') {
        toX = m.toX; toY = m.toY; color = m.player;
        html += `<line x1="${PAD + curX * CELL}" y1="${PAD + curY * CELL}" x2="${PAD + toX * CELL}" y2="${PAD + toY * CELL}" class="path-line ${color}"/>`;
        curX = toX; curY = toY;
      } else if (m.type === 'tp') {
        toX = m.toX; toY = m.toY; color = m.player;
        // TP : ligne pointillée
        html += `<line x1="${PAD + curX * CELL}" y1="${PAD + curY * CELL}" x2="${PAD + toX * CELL}" y2="${PAD + toY * CELL}" class="path-line ${color}" stroke-dasharray="4,4" opacity="0.4"/>`;
        curX = toX; curY = toY;
      } else if (m.type === 'clock') {
        toX = m.glideX; toY = m.glideY; color = m.player;
        html += `<line x1="${PAD + curX * CELL}" y1="${PAD + curY * CELL}" x2="${PAD + toX * CELL}" y2="${PAD + toY * CELL}" class="path-line ${color}"/>`;
        curX = toX; curY = toY;
        const dX = m.diagX, dY = m.diagY;
        html += `<line x1="${PAD + curX * CELL}" y1="${PAD + curY * CELL}" x2="${PAD + dX * CELL}" y2="${PAD + dY * CELL}" class="path-line ${color}"/>`;
        curX = dX; curY = dY;
      } else if (m.type === 'ds') {
        if (m.option === 'virage_glide') {
          let t1x = m.virageX, t1y = m.virageY;
          html += `<line x1="${PAD + curX * CELL}" y1="${PAD + curY * CELL}" x2="${PAD + t1x * CELL}" y2="${PAD + t1y * CELL}" class="path-line ${m.player}"/>`;
          curX = t1x; curY = t1y;
          let t2x = m.glideX, t2y = m.glideY;
          html += `<line x1="${PAD + curX * CELL}" y1="${PAD + curY * CELL}" x2="${PAD + t2x * CELL}" y2="${PAD + t2y * CELL}" class="path-line ${m.player}"/>`;
          curX = t2x; curY = t2y;
        } else if (m.option === 'diagonale') {
          let toX = m.toX, toY = m.toY;
          html += `<line x1="${PAD + curX * CELL}" y1="${PAD + curY * CELL}" x2="${PAD + toX * CELL}" y2="${PAD + toY * CELL}" class="path-line ${m.player}"/>`;
          curX = toX; curY = toY;
        }
      }
      // borne et hamer ne déplacent pas le pivot
    }

    svg.innerHTML = html;

    // Bind clicks
    svg.querySelectorAll('.pivot-dot').forEach(dot => {
      dot.onclick = () => {
        const x = parseInt(dot.dataset.x, 10);
        const y = parseInt(dot.dataset.y, 10);
        this.onCellClick(x, y);
      };
    });
  },

  // Calcule les destinations valides selon la capacité sélectionnée
  computeValidTargets() {
    if (!this.currentGame || !this.selectedAbility) return [];
    const state = this.currentGame;
    const me = Auth.getCurrentUser();
    const expected = state.current === 'red' ? state.redId : state.blueId;
    if (me.id !== expected) return [];
    if (state.winner || state.swapPending) return [];

    const px = state.pivot.x, py = state.pivot.y;
    const grid = state.grid;
    const myAxis = state.current === 'red' ? 'horizontal' : 'vertical';

    function free(x, y) { return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE && grid[y][x] === null; }
    function ray(dx, dy) {
      const dests = [];
      let x = px + dx, y = py + dy;
      while (free(x, y)) { dests.push({ x, y }); x += dx; y += dy; }
      return dests;
    }
    function axisGlide(axis) {
      if (axis === 'horizontal') return [...ray(1, 0), ...ray(-1, 0)];
      return [...ray(0, 1), ...ray(0, -1)];
    }
    function diagonal() {
      return [...ray(1, 1), ...ray(1, -1), ...ray(-1, 1), ...ray(-1, -1)];
    }

    const ab = this.selectedAbility;
    const caps = state.capacities[state.current];

    // Si pendingTp, on doit faire un glide/virage/diagonale
    if (this.pendingTp) {
      if (ab === 'glide') return axisGlide(myAxis);
      if (ab === 'virage' && caps.pivot > 0) return axisGlide(myAxis === 'horizontal' ? 'vertical' : 'horizontal');
      if (ab === 'diagonale' && caps.diagonale > 0) return diagonal();
      return [];
    }
    if (this.pendingClock) {
      if (ab === 'diagonale') {
        return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([dx, dy]) => ({ x: px + dx, y: py + dy }))
          .filter(p => free(p.x, p.y));
      }
      return [];
    }
    if (this.pendingDs) {
      if (ab === 'glide') return axisGlide(myAxis);
      return [];
    }

    if (ab === 'glide') return axisGlide(myAxis);
    if (ab === 'virage' && caps.pivot > 0) return axisGlide(myAxis === 'horizontal' ? 'vertical' : 'horizontal');
    if (ab === 'diagonale' && caps.diagonale > 0) return diagonal();
    if (ab === 'borne' && caps.borne > 0) {
      const dests = [];
      for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
        if (free(x, y) && !(x === px && y === py)) dests.push({ x, y });
      }
      return dests;
    }
    if (ab === 'tp' && caps.tp > 0) {
      // Tous les points libres AVEC une sortie
      const dests = [];
      for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
        if (free(x, y) && this.pointHasExit(x, y)) dests.push({ x, y });
      }
      return dests;
    }
    if (ab === 'hamer' && caps.hamer > 0) {
      const dests = [];
      for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
        if (grid[y][x] === 'borne_red' || grid[y][x] === 'borne_blue') dests.push({ x, y });
      }
      return dests;
    }
    return [];
  },

  pointHasExit(x, y) {
    // Vérifie qu'il y a au moins un move possible depuis (x, y)
    const state = this.currentGame;
    const grid = state.grid;
    const myAxis = state.current === 'red' ? 'horizontal' : 'vertical';
    const oppAxis = myAxis === 'horizontal' ? 'vertical' : 'horizontal';
    const caps = state.capacities[state.current];
    function freeAt(ax, ay) { return ax >= 0 && ax < GRID_SIZE && ay >= 0 && ay < GRID_SIZE && grid[ay][ax] === null; }
    function rayExit(ax, ay, dx, dy) {
      let nx = ax + dx, ny = ay + dy;
      while (freeAt(nx, ny)) return true;
      return false;
    }
    function axisExit(ax, ay, axis) {
      if (axis === 'horizontal') return rayExit(ax, ay, 1, 0) || rayExit(ax, ay, -1, 0);
      return rayExit(ax, ay, 0, 1) || rayExit(ax, ay, 0, -1);
    }
    if (axisExit(x, y, myAxis)) return true;
    if (caps.pivot > 0 && axisExit(x, y, oppAxis)) return true;
    if (caps.diagonale > 0) {
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (freeAt(x + dx, y + dy)) return true;
      }
    }
    return false;
  },

  // Clic sur une cellule
  onCellClick(x, y) {
    if (!this.selectedAbility) { Toast.show('Sélectionne une capacité d\'abord', 'info'); return; }
    const valid = this.computeValidTargets();
    if (!valid.some(t => t.x === x && t.y === y)) {
      Toast.show('Destination invalide', 'error'); return;
    }
    const ab = this.selectedAbility;
    let move;
    if (ab === 'glide') move = { type: 'glide', toX: x, toY: y };
    else if (ab === 'virage') move = { type: 'virage', toX: x, toY: y };
    else if (ab === 'diagonale') move = { type: 'diagonale', toX: x, toY: y, steps: this.pendingClock ? 1 : undefined };
    else if (ab === 'borne') move = { type: 'borne', toX: x, toY: y };
    else if (ab === 'tp') move = { type: 'tp', toX: x, toY: y };
    else if (ab === 'hamer') move = { type: 'hamer', targetX: x, targetY: y };
    if (!move) return;
    Sounds.playSound(ab === 'borne' ? 'borne' : ab === 'tp' ? 'tp' : ab === 'virage' ? 'virage' : ab === 'diagonale' ? 'diagonale' : 'move');
    this.socket.emit('game:move', { gameId: this.currentGameId, move });
    this.selectedAbility = null;
    this.pendingTp = false; this.pendingClock = false; this.pendingDs = false;
    document.querySelectorAll('.ability-btn').forEach(b => b.classList.remove('active'));
    this.renderBoard();
  },

  // Mise à jour UI (cartes joueurs, log)
  updateUI() {
    if (!this.currentGame) return;
    const state = this.currentGame;
    const redActive = state.current === 'red' && !state.winner;
    const blueActive = state.current === 'blue' && !state.winner;
    document.getElementById('player-red').classList.toggle('active', redActive);
    document.getElementById('player-blue').classList.toggle('active', blueActive);
    // Stats
    for (const player of ['red', 'blue']) {
      const caps = state.capacities[player];
      const card = document.getElementById('player-' + player);
      card.querySelector('.cap-borne').textContent = caps.borne;
      card.querySelector('.cap-pivot').textContent = caps.pivot;
      card.querySelector('.cap-diagonale').textContent = caps.diagonale;
      card.querySelector('.cap-tp').textContent = caps.tp;
      card.querySelector('.cap-clock').textContent = caps.clock;
      card.querySelector('.cap-ds').textContent = caps.ds;
      card.querySelector('.cap-hamer').textContent = caps.hamer;
    }
    // Pivot position
    const { x, y } = state.pivot;
    document.getElementById('game-pivot-pos').textContent = `${COLS[x]}${y + 1}`;
  },

  log(msg) {
    const el = document.getElementById('game-log');
    const line = document.createElement('div');
    line.textContent = '• ' + msg;
    line.style.cssText = 'margin-bottom: 4px; color: var(--text-dim); font-size: 12px;';
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  },
};

// Bind ability buttons (au chargement)
document.addEventListener('DOMContentLoaded', () => {
  // Boutons capacité (dans #ability-buttons)
  document.querySelectorAll('.ability-btn').forEach(btn => {
    btn.onclick = () => {
      if (btn.id === 'btn-cancel-move') {
        Game.selectedAbility = null;
        document.querySelectorAll('.ability-btn').forEach(b => b.classList.remove('active'));
        Game.renderBoard();
        return;
      }
      const ab = btn.dataset.ability;
      if (!ab) return;
      document.querySelectorAll('.ability-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Game.selectedAbility = ab;
      Sounds.playSound('click');
      Game.renderBoard();
    };
  });
  document.getElementById('btn-leave-game').onclick = () => {
    if (confirm('Quitter la partie ? Tu vas perdre par forfeit.')) {
      if (Game.socket && Game.currentGameId) Game.socket.emit('game:forfeit', { gameId: Game.currentGameId });
      document.getElementById('game-screen').classList.remove('active');
      document.getElementById('app-screen').classList.add('active');
      navigate('dashboard');
    }
  };
  document.getElementById('btn-forfeit').onclick = () => {
    if (confirm('Abandonner la partie ?')) {
      if (Game.socket && Game.currentGameId) Game.socket.emit('game:forfeit', { gameId: Game.currentGameId });
    }
  };
  // Boutons choix de camp
  document.getElementById('swap-keep').onclick = () => {
    Game.socket.emit('camp:choice', { gameId: Game.currentGameId, choice: 'keep' });
  };
  document.getElementById('swap-swap').onclick = () => {
    Game.socket.emit('camp:choice', { gameId: Game.currentGameId, choice: 'swap' });
  };
  // Game over continue
  document.getElementById('gameover-continue').onclick = () => {
    document.getElementById('gameover-overlay').hidden = true;
    document.getElementById('game-screen').classList.remove('active');
    document.getElementById('app-screen').classList.add('active');
    navigate('dashboard');
    Auth.refreshUser();
  };
});

window.Game = Game;
