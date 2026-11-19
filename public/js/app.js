// js/app.js — routeur SPA principal + Toast + boot
// Toutes les vues sont rendues dans #main-content.

window.Views = window.Views || {};
let currentRoute = 'dashboard';

// ---- Toast helper ----
window.Toast = {
  show(msg, type = 'info', duration = 3000) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), duration);
  }
};

// ---- Router SPA ----
window.navigate = function (route, pushState = true) {
  if (route === currentRoute && route !== 'dashboard') return;
  // Quitter le mode jeu
  document.getElementById('game-screen').classList.remove('active');
  document.getElementById('admin-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');

  const main = document.getElementById('main-content');
  main.innerHTML = '';
  const view = document.createElement('div');
  view.className = 'view active';
  main.appendChild(view);

  // Update bottom nav
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.route === route));

  currentRoute = route;
  if (pushState) history.pushState({ route }, '', '/' + (route === 'dashboard' ? '' : route));

  if (window.Views && window.Views[route]) {
    window.Views[route](view);
  } else {
    view.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🚧</div><p>Vue "${route}" en construction</p></div>`;
  }
};

// Jouer (bouton central) —> entre en mode jeu
window.navigateToGame = function () {
  document.getElementById('app-screen').classList.remove('active');
  document.getElementById('game-screen').classList.add('active');
};

// Admin page
window.navigateToAdmin = function () {
  document.getElementById('app-screen').classList.remove('active');
  document.getElementById('admin-screen').classList.add('active');
  if (window.Admin) Admin.init();
};

window.addEventListener('popstate', (e) => {
  const route = (e.state && e.state.route) || 'dashboard';
  window.navigate(route, false);
});

// Helper ranks (utilisé partout)
window.rankFromTrophies = function (trophies) {
  const RANKS = [
    { name: 'Plastique 1',  min: 0,    color: '#9CA3AF' },
    { name: 'Plastique 2',  min: 50,   color: '#9CA3AF' },
    { name: 'Plastique 3',  min: 100,  color: '#9CA3AF' },
    { name: 'Bronze 1',     min: 150,  color: '#CD7F32' },
    { name: 'Bronze 2',     min: 250,  color: '#CD7F32' },
    { name: 'Bronze 3',     min: 350,  color: '#CD7F32' },
    { name: 'Argent 1',     min: 500,  color: '#C0C0C0' },
    { name: 'Argent 2',     min: 650,  color: '#C0C0C0' },
    { name: 'Argent 3',     min: 800,  color: '#C0C0C0' },
    { name: 'Fer 1',        min: 1000, color: '#71797E' },
    { name: 'Fer 2',        min: 1200, color: '#71797E' },
    { name: 'Fer 3',        min: 1400, color: '#71797E' },
    { name: 'Or 1',         min: 1700, color: '#FFD700' },
    { name: 'Or 2',         min: 2000, color: '#FFD700' },
    { name: 'Or 3',         min: 2300, color: '#FFD700' },
    { name: 'Legendary 1',  min: 2700, color: '#A855F7' },
    { name: 'Legendary 2',  min: 3100, color: '#A855F7' },
    { name: 'Legendary 3',  min: 3500, color: '#A855F7' },
  ];
  let cur = RANKS[0];
  for (const r of RANKS) if (trophies >= r.min) cur = r;
  return cur;
};

// ---- Boot ----
document.addEventListener('DOMContentLoaded', async () => {
  // Init UI bindings
  Auth.initAuth();
  Settings.bindSettingsUI();

  // Top bar buttons
  document.getElementById('btn-settings').onclick = () => {
    document.getElementById('settings-modal').hidden = false;
  };
  document.getElementById('close-settings').onclick = () => {
    document.getElementById('settings-modal').hidden = true;
  };
  document.getElementById('btn-gifts').onclick = () => Gifts.openDrawer();
  document.getElementById('close-gifts').onclick = () => Gifts.closeDrawer();
  document.getElementById('drawer-backdrop').onclick = () => Gifts.closeDrawer();

  // Bottom nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.onclick = () => {
      Sounds && Sounds.playSound('click');
      navigate(btn.dataset.route);
    };
  });

  // Check session
  const ok = await Auth.checkSession();
  if (ok) {
    navigate('dashboard', false);
    // Démarrer le socket
    if (window.Game) Game.initSocket();
    // Charger les cadeaux (badge)
    Gifts.refreshBadge();
  }
});

