// js/dashboard.js — vue dashboard (accueil style Brawl Stars)

Views.dashboard = function (container) {
  const user = Auth.getCurrentUser();
  if (!user) return;

  container.innerHTML = `
    <div class="dashboard-hero">
      <button class="btn-play" id="btn-play">PLAY</button>
      <div class="play-options">
        <button class="play-mode-btn active" data-mode="ranked">🏆 Classé</button>
        <button class="play-mode-btn" data-mode="private">🔒 Privé</button>
      </div>
      <p id="play-status" style="margin-top:12px; color: var(--text-dim); font-size:13px;">Clique pour lancer une partie</p>
    </div>
    <div class="dashboard-cards">
      <div class="card" data-route="pass">
        <div class="card-icon">🎫</div>
        <div class="card-title">Pass</div>
        <div class="card-sub">Niveau ${user.pass_level || 0} / 30</div>
        <div class="card-progress"><div class="card-progress-bar" style="width: ${((user.pass_level || 0) / 30) * 100}%"></div></div>
      </div>
      <div class="card" data-route="shop">
        <div class="card-icon">🛒</div>
        <div class="card-title">Shop</div>
        <div class="card-sub">Coffres & capacités</div>
      </div>
      <div class="card" data-route="top">
        <div class="card-icon">🏆</div>
        <div class="card-title">Classement</div>
        <div class="card-sub">${user.trophies || 0} TR</div>
      </div>
      <div class="card" data-route="friends">
        <div class="card-icon">👥</div>
        <div class="card-title">Amis</div>
        <div class="card-sub">ID: #${user.friend_id}</div>
      </div>
      <div class="card" data-route="skins">
        <div class="card-icon">🎨</div>
        <div class="card-title">Skins</div>
        <div class="card-sub">Personnalise tes murs</div>
      </div>
      <div class="card" data-route="inventory">
        <div class="card-icon">🎒</div>
        <div class="card-title">Inventaire</div>
        <div class="card-sub">Tes capacités</div>
      </div>
    </div>
    ${user.is_admin ? `
      <div class="section-title">Admin</div>
      <div class="dashboard-cards">
        <div class="card" data-route="admin">
          <div class="card-icon">🛡️</div>
          <div class="card-title">Panneau admin</div>
          <div class="card-sub">Gestion joueurs</div>
        </div>
      </div>` : ''}
  `;

  // Boutons carte
  container.querySelectorAll('.card[data-route]').forEach(card => {
    card.onclick = () => {
      const route = card.dataset.route;
      Sounds.playSound('click');
      if (route === 'admin') navigateToAdmin();
      else navigate(route);
    };
  });

  // Bouton PLAY
  let playMode = 'ranked';
  container.querySelectorAll('.play-mode-btn').forEach(btn => {
    btn.onclick = () => {
      container.querySelectorAll('.play-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      playMode = btn.dataset.mode;
      Sounds.playSound('click');
    };
  });

  container.querySelector('#btn-play').onclick = () => {
    Sounds.playSound('click');
    if (playMode === 'ranked') Game.joinRankedQueue();
    else Game.openPrivateRoom();
  };
};

// Vue "Jouer" (bottom nav)
Views.game = function (container) {
  const user = Auth.getCurrentUser();
  if (!user) return;
  container.innerHTML = `
    <div class="dashboard-hero">
      <button class="btn-play" id="btn-play-tab">PLAY</button>
      <div class="play-options">
        <button class="play-mode-btn active" data-mode="ranked">🏆 Classé</button>
        <button class="play-mode-btn" data-mode="private">🔒 Privé</button>
      </div>
      <p style="margin-top:12px; color:var(--text-dim); font-size:13px;">
        Classé : match contre un joueur de ton niveau (Elo ±50).<br>
        Privé : crée un salon et partage le code à ton ami.
      </p>
    </div>
    <div class="section-title">Comment jouer</div>
    <div class="admin-card" style="font-size:13px; line-height:1.6; color:var(--text-dim);">
      <p>PIVOT est un jeu de réflexion abstrait pour 2 joueurs, sur une grille 7×7. Un seul pion, le <strong>pivot</strong>, est partagé : <strong style="color:var(--red-team)">Rouge</strong> le déplace horizontalement, <strong style="color:var(--blue-team)">Bleu</strong> verticalement.</p>
      <p style="margin-top:6px;">Tu gagnes en piégeant l'adversaire : quand à son tour il ne peut plus glisser, ni faire un virage, une diagonale, ni se téléporter — même s'il lui reste des bornes.</p>
      <p style="margin-top:6px;">Avant chaque partie, dépense tes <strong>10 Pbucks</strong> pour acheter des capacités (virages, tp, etc.). Après le 1er coup de Rouge, Bleu peut échanger les camps.</p>
    </div>
  `;
  let playMode = 'ranked';
  container.querySelectorAll('.play-mode-btn').forEach(btn => {
    btn.onclick = () => {
      container.querySelectorAll('.play-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      playMode = btn.dataset.mode;
      Sounds.playSound('click');
    };
  });
  container.querySelector('#btn-play-tab').onclick = () => {
    Sounds.playSound('click');
    if (playMode === 'ranked') Game.joinRankedQueue();
    else Game.openPrivateRoom();
  };
};

// Vue Profil
Views.profile = async function (container) {
  await Auth.refreshUser();
  const user = Auth.getCurrentUser();
  const rank = rankFromTrophies(user.trophies || 0);
  const winRate = user.matches_played > 0 ? Math.round((user.matches_won / user.matches_played) * 100) : 0;
  container.innerHTML = `
    <div class="section-title">Mon profil</div>
    <div class="my-friend-id-box">
      <div class="label">Mon ID (à partager pour ajouter en ami)</div>
      <div class="id">#${user.friend_id}</div>
      <button class="btn-secondary" id="copy-my-id" style="margin-top:8px; background:rgba(0,0,0,0.2); color:white; border:none;">Copier</button>
    </div>
    <div class="profile-stats">
      <div class="profile-stat-box">
        <div class="profile-stat-num">${user.trophies || 0}</div>
        <div class="profile-stat-label">Trophies (TR)</div>
      </div>
      <div class="profile-stat-box">
        <div class="profile-stat-num" style="color:${rank.color}">${rank.name}</div>
        <div class="profile-stat-label">Rang</div>
      </div>
      <div class="profile-stat-box">
        <div class="profile-stat-num">${user.elo || 1000}</div>
        <div class="profile-stat-label">Elo</div>
      </div>
      <div class="profile-stat-box">
        <div class="profile-stat-num">${user.pgs || 0}</div>
        <div class="profile-stat-label">Gems (Pgs)</div>
      </div>
      <div class="profile-stat-box">
        <div class="profile-stat-num">${user.matches_played || 0}</div>
        <div class="profile-stat-label">Matchs joués</div>
      </div>
      <div class="profile-stat-box">
        <div class="profile-stat-num">${user.matches_won || 0}</div>
        <div class="profile-stat-label">Victoires</div>
      </div>
      <div class="profile-stat-box">
        <div class="profile-stat-num">${user.matches_lost || 0}</div>
        <div class="profile-stat-label">Défaites</div>
      </div>
      <div class="profile-stat-box">
        <div class="profile-stat-num">${winRate}%</div>
        <div class="profile-stat-label">Winrate</div>
      </div>
      <div class="profile-stat-box">
        <div class="profile-stat-num">${user.best_streak || 0}</div>
        <div class="profile-stat-label">Meilleure série</div>
      </div>
      <div class="profile-stat-box">
        <div class="profile-stat-num">${user.pass_level || 0}</div>
        <div class="profile-stat-label">Niveau Pass</div>
      </div>
    </div>
    ${user.is_admin ? `<div class="section-title">Accès admin</div>
      <button class="btn-primary" id="go-admin">Ouvrir le panneau admin</button>` : ''}
  `;
  container.querySelector('#copy-my-id').onclick = () => {
    navigator.clipboard.writeText('#' + user.friend_id);
    Toast.show('ID copié !', 'success');
    Sounds.playSound('click');
  };
  if (user.is_admin) {
    container.querySelector('#go-admin').onclick = () => navigateToAdmin();
  }
};
