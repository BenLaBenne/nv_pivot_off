// js/gifts.js — slide gauche des cadeaux + badge
const Gifts = {
  async openDrawer() {
    document.getElementById('gifts-drawer').classList.add('open');
    document.getElementById('drawer-backdrop').hidden = false;
    await this.render();
  },
  closeDrawer() {
    document.getElementById('gifts-drawer').classList.remove('open');
    document.getElementById('drawer-backdrop').hidden = true;
  },
  async render() {
    const list = document.getElementById('gifts-list');
    list.innerHTML = '<div class="empty-state"><div class="loader"></div><p>Chargement...</p></div>';
    try {
      const r = await API.getGifts();
      // Mettre à jour le badge
      this.updateBadge(r.unclaimedCount);
      if (r.unclaimed.length === 0 && r.claimed.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎁</div><p>Aucun cadeau pour le moment</p></div>';
        return;
      }
      let html = '';
      if (r.unclaimed.length > 0) {
        html += '<div class="section-title" style="font-size:13px; margin-top:0;">À réclamer</div>';
        for (const g of r.unclaimed) {
          html += this.renderGift(g, true);
        }
      }
      if (r.claimed.length > 0) {
        html += '<div class="section-title" style="font-size:13px;">Historique</div>';
        for (const g of r.claimed) {
          html += this.renderGift(g, false);
        }
      }
      list.innerHTML = html;
      list.querySelectorAll('.gift-claim-btn').forEach(btn => {
        btn.onclick = async () => {
          const id = parseInt(btn.dataset.id, 10);
          try {
            Sounds.playSound('click');
            await API.claimGift(id);
            Toast.show('Cadeau réclamé !', 'success');
            await Auth.refreshUser();
            await this.render();
          } catch (e) { Toast.show(e.message, 'error'); }
        };
      });
    } catch (e) {
      list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>${e.message}</p></div>`;
    }
  },
  renderGift(g, claimable) {
    const data = g.gift_data ? JSON.parse(g.gift_data) : {};
    let title = '';
    let icon = '🎁';
    switch (g.gift_type) {
      case 'pgs': title = `${data.amount} Pgs`; icon = '◆'; break;
      case 'pbucks': title = `${data.amount} Pbucks`; icon = '●'; break;
      case 'capacity': title = `${data.quantity || 1}× ${data.ability}`; icon = '↪'; break;
      case 'chest': title = `Coffre ${data.chest_type}`; icon = '📦'; break;
      case 'skin': title = `Skin`; icon = '🎨'; break;
    }
    return `
      <div class="gift-item">
        <div class="gift-title">${icon} ${title}</div>
        ${g.message ? `<div class="gift-msg">${g.message}</div>` : ''}
        <div class="gift-msg" style="font-size:11px;">${new Date(g.created_at).toLocaleDateString('fr-FR')}</div>
        ${claimable ? `<button class="gift-claim-btn" data-id="${g.id}">Réclamer</button>` : '<div style="font-size:11px; color:var(--success); margin-top:6px;">✓ Réclamé</div>'}
      </div>
    `;
  },
  async refreshBadge() {
    try {
      const r = await API.getGifts();
      this.updateBadge(r.unclaimedCount);
    } catch (e) {}
  },
  updateBadge(count) {
    const badge = document.getElementById('gifts-badge');
    if (count > 0) { badge.textContent = count; badge.hidden = false; }
    else badge.hidden = true;
  }
};
window.Gifts = Gifts;
