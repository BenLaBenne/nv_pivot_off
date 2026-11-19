// js/friends.js — UI Friends (ID, demandes, liste) + real-time status
let friendsContainer = null;

Views.friends = async function (container) {
  friendsContainer = container;
  await renderFriends();
  // Bind socket events (une seule fois)
  bindFriendSocketEvents();
};

async function renderFriends() {
  const container = friendsContainer;
  if (!container) return;
  container.innerHTML = '<div class="empty-state"><div class="loader"></div><p>Chargement...</p></div>';
  try {
    const r = await API.getFriends();
    container.innerHTML = `
      <div class="my-friend-id-box">
        <div class="label">Mon ID (à partager)</div>
        <div class="id">#${r.myFriendId}</div>
        <button class="btn-secondary" id="copy-friend-id" style="margin-top:8px; background:rgba(0,0,0,0.2); color:white; border:none;">Copier</button>
      </div>
      <div class="friend-add-row">
        <input type="text" id="add-friend-input" placeholder="Ajouter un ami (#ABC123)" maxlength="8">
        <button class="btn-primary" id="add-friend-btn">Ajouter</button>
      </div>
      <div class="friends-section">
        <h3>Demandes reçues (${r.requests.length})</h3>
        ${r.requests.length === 0 ? '<div class="empty-state"><div class="empty-state-icon">📭</div><p>Aucune demande en attente</p></div>' :
          r.requests.map(req => `
            <div class="friend-item">
              <div><strong>${req.username}</strong> <span style="color:var(--text-dim);">#${req.friend_id}</span></div>
              <div class="friend-actions">
                <button data-action="accept" data-id="${req.id}">✓</button>
                <button data-action="decline" data-id="${req.id}">✕</button>
              </div>
            </div>
          `).join('')}
      </div>
      <div class="friends-section">
        <h3>Mes amis (${r.friends.length})</h3>
        ${r.friends.length === 0 ? '<div class="empty-state"><div class="empty-state-icon">👥</div><p>Tu n\'as pas encore d\'ami</p></div>' :
          r.friends.map(f => `
            <div class="friend-item" data-friend-id="${f.id}">
              <div>
                <span class="friend-status ${f.online ? 'online' : 'offline'}"></span>
                <strong>${f.username}</strong>
                <span style="color:var(--text-dim); font-size:12px;"> · 🏆 ${f.trophies || 0} · ${f.matches_won || 0}V/${f.matches_lost || 0}D</span>
                ${f.is_admin ? ' 🛡️' : ''}
                ${f.online ? '<span style="color:var(--success); font-size:11px; margin-left:4px;">● online</span>' : ''}
              </div>
              <div class="friend-actions">
                <button data-action="profile" data-id="${f.id}">👤</button>
                <button data-action="defy" data-id="${f.id}" data-username="${f.username}" ${f.online ? '' : 'disabled'}>⚔️</button>
                <button data-action="remove" data-id="${f.id}">🗑️</button>
              </div>
            </div>
          `).join('')}
      </div>
    `;
    container.querySelector('#copy-friend-id').onclick = () => {
      navigator.clipboard.writeText('#' + r.myFriendId);
      Toast.show('ID copié !', 'success');
      Sounds.playSound('click');
    };
    container.querySelector('#add-friend-btn').onclick = async () => {
      const fid = container.querySelector('#add-friend-input').value.trim();
      try {
        Sounds.playSound('click');
        const r = await API.addFriend(fid);
        Sounds.playSound('friend_request');
        if (r.status === 'accepted') Toast.show(`${r.username} est maintenant ton ami !`, 'success');
        else Toast.show(`Demande envoyée à ${r.username}`, 'info');
        renderFriends();
      } catch (e) { Toast.show(e.message, 'error'); }
    };
    container.querySelectorAll('.friend-item button').forEach(btn => {
      btn.onclick = async () => {
        const action = btn.dataset.action;
        const id = parseInt(btn.dataset.id, 10);
        try {
          Sounds.playSound('click');
          if (action === 'accept') await API.acceptFriend(id);
          else if (action === 'decline') await API.declineFriend(id);
          else if (action === 'remove') { if (confirm('Supprimer cet ami ?')) await API.removeFriend(id); else return; }
          else if (action === 'profile') { const p = await API.friendProfile(id); showProfileModal(p.user); return; }
          else if (action === 'defy') {
            // Défier en partie privée : on crée un salon et on envoie le code
            Toast.show('Crée un salon privé et partage le code à ton ami.', 'info');
            Game.openPrivateRoom();
            return;
          }
          renderFriends();
        } catch (e) { Toast.show(e.message, 'error'); }
      };
    });
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>${e.message}</p></div>`;
  }
}

let friendSocketBound = false;
function bindFriendSocketEvents() {
  if (friendSocketBound) return;
  friendSocketBound = true;
  // Attendre que le socket soit prêt
  function waitSocket() {
    if (window.Game && Game.socket) {
      const s = Game.socket;
      s.on('friend:online', (data) => {
        Toast.show(`👤 ${data.userId} est maintenant online`, 'info', 2000);
        // Update UI si on est sur la vue friends
        if (friendsContainer) {
          const item = friendsContainer.querySelector(`.friend-item[data-friend-id="${data.userId}"] .friend-status`);
          if (item) {
            item.classList.remove('offline');
            item.classList.add('online');
          }
        }
      });
      s.on('friend:offline', (data) => {
        if (friendsContainer) {
          const item = friendsContainer.querySelector(`.friend-item[data-friend-id="${data.userId}"] .friend-status`);
          if (item) {
            item.classList.remove('online');
            item.classList.add('offline');
          }
        }
      });
      s.on('friend:request', (data) => {
        Sounds.playSound('friend_request');
        Toast.show(`📨 Demande d'ami reçue de ${data.from.username} !`, 'info', 5000);
        // Re-render si sur la vue
        if (friendsContainer) renderFriends();
      });
      s.on('friend:accepted', (data) => {
        Toast.show(`✓ ${data.from.username} a accepté ta demande d'ami`, 'success');
        if (friendsContainer) renderFriends();
      });
    } else {
      setTimeout(waitSocket, 1000);
    }
  }
  waitSocket();
}

function showProfileModal(user) {
  // Réutiliser la modal settings avec contenu profil
  const modal = document.getElementById('settings-modal');
  const content = modal.querySelector('.modal-content');
  const oldBody = content.querySelector('.modal-body');
  const oldHeader = content.querySelector('.modal-header');
  const originalHeader = oldHeader.innerHTML;
  const originalBody = oldBody.innerHTML;
  oldHeader.innerHTML = `<h2>👤 ${user.username}</h2><button class="icon-btn" id="close-profile-modal">✕</button>`;
  oldBody.innerHTML = `
    <div class="profile-stats">
      <div class="profile-stat-box"><div class="profile-stat-num">${user.trophies || 0}</div><div class="profile-stat-label">TR</div></div>
      <div class="profile-stat-box"><div class="profile-stat-num">${user.elo || 1000}</div><div class="profile-stat-label">Elo</div></div>
      <div class="profile-stat-box"><div class="profile-stat-num">${user.matches_played || 0}</div><div class="profile-stat-label">Matchs</div></div>
      <div class="profile-stat-box"><div class="profile-stat-num">${user.matches_won || 0}</div><div class="profile-stat-label">Victoires</div></div>
      <div class="profile-stat-box"><div class="profile-stat-num">${user.matches_lost || 0}</div><div class="profile-stat-label">Défaites</div></div>
      <div class="profile-stat-box"><div class="profile-stat-num">${user.best_streak || 0}</div><div class="profile-stat-label">Meilleure série</div></div>
    </div>
    <div style="margin-top:12px; font-size:13px; color:var(--text-dim); text-align:center;">ID : #${user.friend_id}</div>
    ${user.is_admin ? '<div style="margin-top:8px; text-align:center; color:var(--primary);">🛡️ Admin</div>' : ''}
  `;
  modal.hidden = false;
  document.getElementById('close-profile-modal').onclick = () => {
    oldHeader.innerHTML = originalHeader;
    oldBody.innerHTML = originalBody;
    Settings.bindSettingsUI();
    document.getElementById('close-settings').onclick = () => { modal.hidden = true; };
    modal.hidden = true;
  };
}

