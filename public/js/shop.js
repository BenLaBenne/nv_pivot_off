// js/shop.js — shop (coffres + capacités + skins) + animation d'ouverture
window.ABILITY_ICONS = {
  pivot: '↪', diagonale: '⤢', tp: '⚡', clock: '⏰', ds: '🔄', hamer: '🔨',
};
window.ABILITY_LABELS = {
  pivot: 'Virage (P)', diagonale: 'Diagonale (D)', tp: 'TP', clock: 'Clock', ds: 'Double Switch', hamer: 'Hamer',
};

Views.shop = function (container) {
  container.innerHTML = `
    <div class="shop-tabs">
      <button class="shop-tab active" data-tab="chests">Coffres</button>
      <button class="shop-tab" data-tab="capacities">Capacités</button>
      <button class="shop-tab" data-tab="skins">Skins</button>
    </div>
    <div id="shop-content"></div>
  `;
  const content = container.querySelector('#shop-content');
  const tabs = container.querySelectorAll('.shop-tab');
  tabs.forEach(t => t.onclick = () => {
    tabs.forEach(b => b.classList.remove('active'));
    t.classList.add('active');
    Sounds.playSound('click');
    renderTab(t.dataset.tab);
  });

  function renderTab(tab) {
    if (tab === 'chests') renderChests();
    else if (tab === 'capacities') renderCapacities();
    else if (tab === 'skins') renderSkins();
  }

  async function renderChests() {
    content.innerHTML = `<p style="text-align:center; color:var(--text-dim); margin:12px 0;">Achète des coffres avec tes <span style="color:#FFB02E">Pgs</span>. Ouvre-les dans l'onglet Inventaire.</p>`;
    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    const CHEST_INFO = {
      commun:     { name: 'Coffre Commun',     icon: '📦', rarity: 'commun' },
      rare:       { name: 'Coffre Rare',       icon: '🎁', rarity: 'rare' },
      epique:     { name: 'Coffre Epique',     icon: '🎀', rarity: 'epique' },
      mythique:   { name: 'Coffre Mythique',   icon: '💝', rarity: 'mythique' },
      legendaire: { name: 'Coffre Legendaire', icon: '💎', rarity: 'legendaire' },
    };
    const prices = { commun: 10, rare: 30, epique: 80, mythique: 200, legendaire: 500 };
    for (const [type, info] of Object.entries(CHEST_INFO)) {
      const item = document.createElement('div');
      item.className = 'shop-item';
      item.innerHTML = `
        <div class="rarity-badge rarity-${info.rarity}">${info.rarity}</div>
        <div class="shop-item-icon">${info.icon}</div>
        <div class="shop-item-title">${info.name}</div>
        <div class="shop-item-price gems">◆ ${prices[type]} Pgs</div>
        <button class="shop-buy-btn" data-type="${type}">Acheter</button>
      `;
      item.querySelector('button').onclick = async () => {
        try {
          Sounds.playSound('click');
          await API.buyChest(type);
          Toast.show('Coffre acheté !', 'success');
          await Auth.refreshUser();
        } catch (e) {
          Toast.show(e.message, 'error');
        }
      };
      grid.appendChild(item);
    }
    content.appendChild(grid);

    // Section : mes coffres en attente
    content.insertAdjacentHTML('beforeend', '<div class="section-title">Mes coffres en attente</div>');
    try {
      const r = await API.listMyChests();
      if (r.chests.length === 0) {
        content.insertAdjacentHTML('beforeend', '<div class="empty-state"><div class="empty-state-icon">📭</div><p>Aucun coffre en attente</p></div>');
      } else {
        const list = document.createElement('div');
        list.className = 'shop-grid';
        for (const c of r.chests) {
          const item = document.createElement('div');
          item.className = 'shop-item';
          const info = CHEST_INFO[c.chest_type];
          item.innerHTML = `
            <div class="rarity-badge rarity-${info.rarity}">${info.rarity}</div>
            <div class="shop-item-icon">${info.icon}</div>
            <div class="shop-item-title">${info.name}</div>
            <button class="shop-buy-btn" data-id="${c.id}">Ouvrir</button>
          `;
          item.querySelector('button').onclick = async () => {
            await openChestAnimation(c.id);
            renderTab('chests');
          };
          list.appendChild(item);
        }
        content.appendChild(list);
      }
    } catch (e) { Toast.show(e.message, 'error'); }
  }

  async function renderCapacities() {
    content.innerHTML = `<p style="text-align:center; color:var(--text-dim); margin:12px 0;">Achète des capacités permanentes avec tes <span style="color:#FFB02E">Pgs</span>. Elles sont stockées dans ton inventaire.</p>`;
    try {
      const r = await API.listCapacities();
      const grid = document.createElement('div');
      grid.className = 'shop-grid';
      for (const c of r.capacities) {
        const item = document.createElement('div');
        item.className = 'shop-item';
        item.innerHTML = `
          <div class="shop-item-icon">${ABILITY_ICONS[c.key]}</div>
          <div class="shop-item-title">${c.label}</div>
          <div class="shop-item-price gems">◆ ${c.price_pgs} Pgs</div>
          <div style="font-size:11px; color:var(--text-dim); margin:4px 0;">(Pbucks en partie: ${c.price_pbucks})</div>
          <button class="shop-buy-btn" data-key="${c.key}">Acheter 1</button>
        `;
        item.querySelector('button').onclick = async () => {
          try {
            Sounds.playSound('click');
            await API.buyCapacity({ [c.key]: 1 });
            Toast.show(`${c.label} achetée !`, 'success');
            await Auth.refreshUser();
          } catch (e) { Toast.show(e.message, 'error'); }
        };
        grid.appendChild(item);
      }
      content.appendChild(grid);
    } catch (e) { Toast.show(e.message, 'error'); }
  }

  async function renderSkins() {
    content.innerHTML = `<p style="text-align:center; color:var(--text-dim); margin:12px 0;">Les skins modifient l'apparence de tes murs dans le jeu.</p>`;
    try {
      const r = await API.listSkins();
      const grid = document.createElement('div');
      grid.className = 'shop-grid';
      for (const s of r.skins) {
        const item = document.createElement('div');
        item.className = 'shop-item skin-card' + (s.owned ? ' skin-owned' : '') + (s.equipped ? ' skin-equipped' : '');
        item.innerHTML = `
          <img src="${s.texture_path}" class="skin-preview" alt="${s.name}">
          <div class="shop-item-title">${s.name}</div>
          <div class="rarity-badge rarity-${s.rarity}" style="margin-top:4px;">${s.rarity}</div>
          ${s.owned
            ? (s.equipped
                ? `<button class="shop-buy-btn" data-action="unequip">Retirer</button>`
                : `<button class="shop-buy-btn" data-action="equip" data-id="${s.id}">Équiper</button>`)
            : `<div class="shop-item-price gems" style="margin-top:6px;">◆ ${s.price_pgs} Pgs</div>
               <button class="shop-buy-btn" data-action="buy" data-id="${s.id}">Acheter</button>`}
        `;
        const btn = item.querySelector('.shop-buy-btn');
        if (btn) btn.onclick = async () => {
          try {
            Sounds.playSound('click');
            const action = btn.dataset.action;
            if (action === 'buy') await API.buySkin(btn.dataset.id);
            else if (action === 'equip') await API.equipSkin(btn.dataset.id);
            else if (action === 'unequip') await API.unequipSkin();
            Toast.show('OK !', 'success');
            await Auth.refreshUser();
            renderTab('skins');
          } catch (e) { Toast.show(e.message, 'error'); }
        };
        grid.appendChild(item);
      }
      content.appendChild(grid);
    } catch (e) { Toast.show(e.message, 'error'); }
  }

  renderTab('chests');
};

// Animation d'ouverture de coffre
async function openChestAnimation(chestId) {
  Sounds.playSound('chest_open');
  const overlay = document.getElementById('chest-overlay');
  overlay.hidden = false;
  const closed = document.getElementById('chest-closed');
  const flash = document.getElementById('chest-flash');
  const rewardsEl = document.getElementById('chest-rewards');
  const hint = document.getElementById('chest-hint');

  let rewards = null;
  let clickedOnce = false;
  await new Promise((resolve) => {
    closed.onclick = async () => {
      if (!clickedOnce) {
        clickedOnce = true;
        hint.textContent = 'Ouverture...';
        // Flash
        flash.classList.add('active');
        // Ouvrir en DB
        try {
          const r = await API.openChest(chestId);
          rewards = r.items || [];
          rewardsEl.innerHTML = rewards.map(it => `
            <div class="chest-reward-item">
              <div class="chest-reward-icon">${ABILITY_ICONS[it.item] || '❓'}</div>
              <div class="chest-reward-name">${ABILITY_LABELS[it.item] || it.item}</div>
              <div class="rarity-badge rarity-${it.rarity}">${it.rarity}</div>
              <div class="chest-reward-qty">×1</div>
            </div>
          `).join('');
        } catch (e) {
          Toast.show(e.message, 'error');
          overlay.hidden = true;
          return resolve();
        }
        setTimeout(() => {
          flash.classList.remove('active');
          rewardsEl.hidden = false;
          hint.textContent = 'Clique pour fermer';
          Auth.refreshUser();
        }, 200);
      } else {
        // 2e clic : fermer
        flash.classList.remove('active');
        overlay.hidden = true;
        rewardsEl.hidden = true;
        resolve();
      }
    };
  });
  overlay.hidden = true;
}
