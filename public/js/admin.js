// js/admin.js — panneau admin
const Admin = {
  currentTab: 'stats',
  async init() {
    if (!Auth.getCurrentUser().is_admin) {
      Toast.show('Accès admin requis', 'error');
      navigateToDashboard();
      return;
    }
    document.getElementById('admin-level').textContent = 'Niveau ' + (Auth.getCurrentUser().admin_level || 0);
    document.getElementById('admin-back').onclick = () => {
      document.getElementById('admin-screen').classList.remove('active');
      document.getElementById('app-screen').classList.add('active');
      navigate('dashboard');
    };
    document.querySelectorAll('.admin-tab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
        t.classList.add('active');
        this.currentTab = t.dataset.adminTab;
        this.render();
      };
    });
    this.render();
  },
  async render() {
    const content = document.getElementById('admin-content');
    content.innerHTML = '<div class="loader"></div>';
    try {
      if (this.currentTab === 'stats') await this.renderStats(content);
      else if (this.currentTab === 'search') this.renderSearch(content);
      else if (this.currentTab === 'gifts') this.renderGifts(content);
      else if (this.currentTab === 'reports') await this.renderReports(content);
      else if (this.currentTab === 'logs') await this.renderLogs(content);
    } catch (e) { content.innerHTML = `<p>Erreur: ${e.message}</p>`; }
  },
  async renderStats(c) {
    const r = await API.adminStats();
    c.innerHTML = `
      <div class="admin-stat-grid">
        <div class="admin-stat-box"><div class="admin-stat-num">${r.users}</div><div class="admin-stat-label">Users</div></div>
        <div class="admin-stat-box"><div class="admin-stat-num">${r.online}</div><div class="admin-stat-label">Online</div></div>
        <div class="admin-stat-box"><div class="admin-stat-num">${r.matchesTotal}</div><div class="admin-stat-label">Matchs totaux</div></div>
        <div class="admin-stat-box"><div class="admin-stat-num">${r.matchesFinished}</div><div class="admin-stat-label">Matchs finis</div></div>
        <div class="admin-stat-box"><div class="admin-stat-num">${r.banned}</div><div class="admin-stat-label">Bannis</div></div>
        <div class="admin-stat-box"><div class="admin-stat-num">${r.openReports}</div><div class="admin-stat-label">Signalements ouverts</div></div>
      </div>
    `;
  },
  renderSearch(c) {
    c.innerHTML = `
      <div class="friend-add-row">
        <input type="text" id="admin-search-input" placeholder="Nom d'utilisateur ou ID (#ABC123)">
        <button class="btn-primary" id="admin-search-btn">Rechercher</button>
      </div>
      <div id="admin-search-results"></div>
    `;
    const doSearch = async () => {
      const q = document.getElementById('admin-search-input').value.trim();
      if (!q) return;
      const r = await API.adminSearch(q);
      const res = document.getElementById('admin-search-results');
      res.innerHTML = r.users.map(u => `
        <div class="admin-card">
          <div><strong>${u.username}</strong> ${u.is_admin ? '🛡️' : ''} ${u.banned ? '🚫' : ''}</div>
          <div style="font-size:12px; color:var(--text-dim);">ID: #${u.friend_id} · 🏆 ${u.trophies} · ${u.matches_played} matchs · Pgs: ${u.pgs} · Pbucks: ${u.pbucks}</div>
          <div class="friend-actions" style="margin-top:8px;">
            <button data-action="gift" data-id="${u.id}">🎁 Cadeau</button>
            <button data-action="pgs" data-id="${u.id}">+Pgs</button>
            <button data-action="pbucks" data-id="${u.id}">+Pbucks</button>
            <button data-action="ban" data-id="${u.id}" data-username="${u.username}">🚫 Bannir</button>
            ${u.banned ? `<button data-action="unban" data-id="${u.id}">✓ Débannir</button>` : ''}
            <button data-action="promote" data-id="${u.id}" data-level="1">⭐ Modo</button>
            <button data-action="promote" data-id="${u.id}" data-level="2">⭐ Admin</button>
          </div>
        </div>
      `).join('');
      res.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => this.adminAction(btn.dataset.action, btn.dataset.id, btn.dataset.username, btn.dataset.level);
      });
    };
    document.getElementById('admin-search-btn').onclick = doSearch;
    document.getElementById('admin-search-input').onkeydown = (e) => { if (e.key === 'Enter') doSearch(); };
  },
  async adminAction(action, id, username, level) {
    try {
      if (action === 'gift') {
        const type = prompt('Type (pgs, pbucks, capacity, chest, skin):');
        if (!type) return;
        let data = {};
        if (type === 'pgs' || type === 'pbucks') data.amount = parseInt(prompt('Montant:', '100'), 10);
        else if (type === 'capacity') { data.ability = prompt('Capacité (pivot, diagonale, tp, clock, ds, hamer):', 'tp'); data.quantity = parseInt(prompt('Quantité:', '1'), 10); }
        else if (type === 'chest') data.chest_type = prompt('Type coffre (commun, rare, epique, mythique, legendaire):', 'epique');
        else if (type === 'skin') data.skin_id = parseInt(prompt('Skin ID:', '1'), 10);
        const msg = prompt('Message (optionnel):', '') || '';
        await API.adminGift(id, type, data, msg);
        Toast.show('Cadeau envoyé', 'success');
      } else if (action === 'pgs') {
        const amount = parseInt(prompt('Combien de Pgs à donner ?', '100'), 10);
        await API.adminGrantPgs(id, amount);
        Toast.show('Pgs donnés', 'success');
      } else if (action === 'pbucks') {
        const amount = parseInt(prompt('Combien de Pbucks à donner ?', '100'), 10);
        await API.adminGrantPbucks(id, amount);
        Toast.show('Pbucks donnés', 'success');
      } else if (action === 'ban') {
        const reason = prompt(`Bannir ${username} ? Raison:`, 'Comportement inapproprié');
        if (reason !== null) { await API.adminBan(id, reason); Toast.show('Banni', 'success'); }
      } else if (action === 'unban') {
        await API.adminUnban(id); Toast.show('Débanni', 'success');
      } else if (action === 'promote') {
        await API.adminPromote(id, parseInt(level, 10)); Toast.show('Promu', 'success');
      }
      this.render();
    } catch (e) { Toast.show(e.message, 'error'); }
  },
  renderGifts(c) {
    c.innerHTML = `
      <div class="admin-card">
        <h3>Envoyer un cadeau à TOUS les joueurs</h3>
        <div class="friend-add-row">
          <input type="text" id="giftall-type" placeholder="Type (pgs, pbucks, capacity, chest, skin)">
          <input type="text" id="giftall-data" placeholder="Données JSON (ex: {&quot;amount&quot;:100})">
          <input type="text" id="giftall-msg" placeholder="Message">
          <button class="btn-primary" id="giftall-btn">Envoyer à tous</button>
        </div>
      </div>
    `;
    document.getElementById('giftall-btn').onclick = async () => {
      try {
        const type = document.getElementById('giftall-type').value.trim();
        const dataStr = document.getElementById('giftall-data').value.trim();
        const msg = document.getElementById('giftall-msg').value.trim();
        const data = dataStr ? JSON.parse(dataStr) : {};
        await API.adminGiftAll(type, data, msg);
        Toast.show('Cadeaux envoyés', 'success');
      } catch (e) { Toast.show(e.message, 'error'); }
    };
  },
  async renderReports(c) {
    const r = await API.listReports('open');
    c.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Signalé</th><th>Par</th><th>Raison</th><th>Actions</th></tr></thead>
        <tbody>
          ${r.reports.map(r => `
            <tr>
              <td>${r.reported_username || '?'}</td>
              <td>${r.reporter_username || '?'}</td>
              <td>${r.reason}</td>
              <td>
                <button data-action="dismiss" data-id="${r.id}">Ignorer</button>
                <button data-action="warn" data-id="${r.id}">Avertir</button>
                <button data-action="ban" data-id="${r.id}" data-uid="${r.reported_id}">Bannir</button>
              </button>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    c.querySelectorAll('button').forEach(btn => {
      btn.onclick = async () => {
        const action = btn.dataset.action;
        const id = parseInt(btn.dataset.id, 10);
        const note = prompt('Note admin:', '') || '';
        let act = 'dismiss';
        if (action === 'warn') act = 'warn';
        else if (action === 'ban') act = 'ban';
        await API.resolveReport(id, note, act);
        if (action === 'ban') await API.adminBan(parseInt(btn.dataset.uid, 10), note);
        Toast.show('Résolu', 'success');
        this.render();
      };
    });
  },
  async renderLogs(c) {
    const r = await API.adminLogs(100);
    c.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Date</th><th>Admin</th><th>Action</th><th>Cible</th><th>Détails</th></tr></thead>
        <tbody>
          ${r.logs.map(l => `
            <tr>
              <td>${new Date(l.created_at).toLocaleString('fr-FR')}</td>
              <td>${l.admin_username || '?'}</td>
              <td>${l.action}</td>
              <td>${l.target_username || '-'}</td>
              <td style="font-size:11px; color:var(--text-dim);">${l.details || ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  },
};
window.Admin = Admin;
