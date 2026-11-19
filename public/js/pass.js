// js/pass.js — UI Pass de Combat + claim
Views.pass = async function (container) {
  container.innerHTML = '<div class="empty-state"><div class="loader"></div><p>Chargement du pass...</p></div>';
  try {
    const r = await API.getPass();
    const { level, xpInLevel, xpToNext, maxLevel } = r;
    const season = r.season;

    const REWARD_DESCS = {
      pbucks: (v) => `${v} Pbucks`,
      abilities: (v) => Object.entries(v).map(([k, q]) => `${q}× ${k}`).join(', '),
      chest: (v) => `Coffre ${v}`,
    };
    const REWARD_ICONS = {
      pbucks: '●', abilities: '↪', chest: '📦',
    };

    container.innerHTML = `
      <div class="pass-header">
        <div style="font-size:14px; opacity:0.8;">${season.name}</div>
        <div class="pass-level">Niveau ${level}/${maxLevel}</div>
        <div style="font-size:12px; margin-top:6px;">${xpInLevel} / 100 XP — prochain niveau dans ${xpToNext} XP</div>
        <div class="pass-xp-bar"><div class="pass-xp-fill" style="width:${xpInLevel}%"></div></div>
      </div>
      <p style="font-size:12px; color:var(--text-dim); margin-bottom:8px;">Clique sur une case disponible pour réclamer la récompense.</p>
      <div class="pass-grid">
        ${r.rewards.map(cell => {
          let rewardDesc = '';
          let rewardIcon = '🎁';
          if (cell.reward) {
            const desc = [];
            if (cell.reward.pbucks) { desc.push(`${cell.reward.pbucks} Pbucks`); rewardIcon = '●'; }
            if (cell.reward.abilities) { for (const [k, q] of Object.entries(cell.reward.abilities)) { desc.push(`${q}× ${ABILITY_ICONS[k] || k}`); rewardIcon = '↪'; } }
            if (cell.reward.chest) { desc.push(`Coffre ${cell.reward.chest}`); rewardIcon = '📦'; }
            rewardDesc = desc.join(', ');
          }
          const cls = cell.claimed ? 'claimed' : (cell.available ? 'available' : 'locked');
          return `
            <div class="pass-level-cell ${cls}" data-level="${cell.level}">
              <div class="lvl-num">Niv ${cell.level}</div>
              <div class="lvl-reward">${rewardIcon}</div>
              <div class="lvl-desc">${rewardDesc}</div>
              <button class="claim-btn" ${cell.claimed || !cell.available ? 'disabled' : ''}>
                ${cell.claimed ? '✓ Réclamé' : cell.available ? 'Réclamer' : 'Verrouillé'}
              </button>
            </div>
          `;
        }).join('')}
      </div>
    `;
    container.querySelectorAll('.pass-level-cell.available').forEach(cell => {
      const btn = cell.querySelector('.claim-btn');
      btn.onclick = async () => {
        try {
          Sounds.playSound('click');
          const level = parseInt(cell.dataset.level, 10);
          await API.claimPass(level);
          Toast.show('Récompense réclamée !', 'success');
          await Auth.refreshUser();
          // Re-render
          Views.pass(container);
        } catch (e) { Toast.show(e.message, 'error'); }
      };
    });
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>${e.message}</p></div>`;
  }
};

// Vue Inventaire (capacités possédées)
Views.inventory = async function (container) {
  container.innerHTML = '<div class="empty-state"><div class="loader"></div><p>Chargement...</p></div>';
  try {
    const r = await API.getInventory();
    if (r.inventory.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎒</div><p>Ton inventaire est vide. Achète des capacités dans le shop ou ouvre des coffres !</p></div>';
      return;
    }
    container.innerHTML = `
      <div class="section-title">Mes capacités (inventaire)</div>
      <div class="shop-grid">
        ${r.inventory.map(it => `
          <div class="shop-item">
            <div class="shop-item-icon">${ABILITY_ICONS[it.ability_type] || '❓'}</div>
            <div class="shop-item-title">${ABILITY_LABELS[it.ability_type] || it.ability_type}</div>
            <div class="shop-item-price">× ${it.quantity}</div>
          </div>
        `).join('')}
      </div>
      <p style="font-size:12px; color:var(--text-dim); margin-top:12px;">Ces capacités sont stockées dans ton inventaire permanent. Au début de chaque partie, tu dépenses tes <strong>Pbucks</strong> pour les activer (cf. phase d'achat).</p>
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>${e.message}</p></div>`;
  }
};

// Vue Skins (alias pour la vue shop skins)
Views.skins = function (container) {
  Views.shop(container);
  // Activer l'onglet skins
  setTimeout(() => {
    const t = container.querySelector('.shop-tab[data-tab="skins"]');
    if (t) t.click();
  }, 50);
};

// Vue Top (leaderboard)
Views.top = async function (container) {
  container.innerHTML = '<div class="empty-state"><div class="loader"></div><p>Chargement du classement...</p></div>';
  try {
    const r = await API.getLeaderboard(100);
    const me = Auth.getCurrentUser();
    container.innerHTML = `
      <div class="section-title">🏆 Top joueurs</div>
      ${r.leaderboard.map((u, i) => {
        const rank = rankFromTrophies(u.trophies || 0);
        const posCls = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
        return `
          <div class="leaderboard-row ${u.id === me.id ? 'me' : ''}">
            <div class="rank-pos ${posCls}">${i + 1}</div>
            <div>
              <div class="lb-username">${u.username}${u.is_admin ? ' 🛡️' : ''}</div>
              <div style="font-size:11px; color:var(--text-dim);">${u.matches_played || 0} matchs · ${u.matches_won || 0} victoires</div>
            </div>
            <div class="lb-trophies">🏆 ${u.trophies || 0}</div>
            <div class="lb-rank-badge" style="background:${rank.color}; color:white;">${rank.name}</div>
          </div>
        `;
      }).join('')}
      ${r.myPosition ? `<p style="text-align:center; margin-top:12px; color:var(--text-dim); font-size:13px;">Ta position : <strong style="color:var(--primary);">${r.myPosition}e</strong></p>` : ''}
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>${e.message}</p></div>`;
  }
};
