// js/auth.js — login / signup + gestion session
(function () {
  let currentUser = null;

  function showAuth() {
    document.getElementById('auth-screen').classList.add('active');
    document.getElementById('app-screen').classList.remove('active');
  }

  function showApp() {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('app-screen').classList.add('active');
  }

  async function checkSession() {
    try {
      const me = await API.me();
      currentUser = me;
      updateTopbar(me);
      showApp();
      return true;
    } catch (e) {
      showAuth();
      return false;
    }
  }

  function updateTopbar(user) {
    document.getElementById('topbar-username').textContent = user.username;
    document.getElementById('topbar-pgs-value').textContent = user.pgs || 0;
    document.getElementById('topbar-pbucks-value').textContent = user.pbucks || 0;
    document.getElementById('topbar-tr-value').textContent = user.trophies || 0;
    // Rank label
    const rank = rankFromTrophies(user.trophies || 0);
    const badge = document.getElementById('topbar-rank');
    badge.textContent = rank.name;
    badge.style.background = `linear-gradient(135deg, ${rank.color} 0%, ${rank.color}cc 100%)`;
  }

  function getCurrentUser() { return currentUser; }
  function setCurrentUser(u) {
    currentUser = u;
    if (u) updateTopbar(u);
  }
  async function refreshUser() {
    try { currentUser = await API.me(); updateTopbar(currentUser); return currentUser; }
    catch (e) { return null; }
  }

  // Init tabs
  function initAuth() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        document.getElementById(btn.dataset.tab + '-form').classList.add('active');
      };
    });
    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('login-error');
      errEl.textContent = '';
      const fd = new FormData(e.target);
      try {
        Sounds && Sounds.playSound('click');
        await API.login(fd.get('username'), fd.get('password'));
        await checkSession();
        Toast.show('Connecté !', 'success');
      } catch (err) { errEl.textContent = err.message; }
    };
    document.getElementById('signup-form').onsubmit = async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('signup-error');
      errEl.textContent = '';
      const fd = new FormData(e.target);
      try {
        Sounds && Sounds.playSound('click');
        await API.signup(fd.get('username'), fd.get('password'));
        await checkSession();
        Toast.show('Bienvenue sur PIVOT Online !', 'success');
      } catch (err) { errEl.textContent = err.message; }
    };
    document.getElementById('btn-logout').onclick = async () => {
      await API.logout();
      currentUser = null;
      showAuth();
      Sounds && Sounds.playSound('click');
    };
  }

  window.Auth = { checkSession, showAuth, showApp, getCurrentUser, setCurrentUser, refreshUser, initAuth, updateTopbar };
})();
