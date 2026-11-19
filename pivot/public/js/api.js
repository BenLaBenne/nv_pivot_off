// js/api.js — wrapper fetch + JWT (cookie httpOnly)
// Toutes les fonctions API centralisées ici.

async function api(path, options = {}) {
  const opts = {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };
  if (opts.body && typeof opts.body === 'object') {
    opts.body = JSON.stringify(opts.body);
  }
  try {
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Erreur API');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } catch (e) {
    if (e.status) throw e;
    // Network error
    e.message = e.message || 'Erreur réseau';
    throw e;
  }
}

const API = {
  // Auth
  signup: (username, password) => api('/api/auth/signup', { method: 'POST', body: { username, password } }),
  login: (username, password) => api('/api/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => api('/api/auth/logout', { method: 'POST' }),
  me: () => api('/api/auth/me'),

  // Shop & chests
  listChests: () => api('/api/shop/chests'),
  buyChest: (chest_type) => api('/api/shop/buy-chest', { method: 'POST', body: { chest_type } }),
  listMyChests: () => api('/api/chests'),
  openChest: (id) => api(`/api/chests/${id}/open`, { method: 'POST' }),

  // Skins
  listSkins: () => api('/api/skins'),
  buySkin: (id) => api(`/api/skins/${id}/buy`, { method: 'POST' }),
  equipSkin: (id) => api(`/api/skins/${id}/equip`, { method: 'POST' }),
  unequipSkin: () => api('/api/skins/unequip', { method: 'POST' }),

  // Pass
  getPass: () => api('/api/pass'),
  claimPass: (level) => api('/api/pass/claim', { method: 'POST', body: { level } }),

  // Friends
  getFriends: () => api('/api/friends'),
  addFriend: (friend_id) => api('/api/friends/add', { method: 'POST', body: { friend_id } }),
  acceptFriend: (user_id) => api('/api/friends/accept', { method: 'POST', body: { user_id } }),
  declineFriend: (user_id) => api('/api/friends/decline', { method: 'POST', body: { user_id } }),
  removeFriend: (user_id) => api('/api/friends/remove', { method: 'POST', body: { user_id } }),
  friendProfile: (id) => api(`/api/friends/${id}/profile`),

  // Gifts
  getGifts: () => api('/api/gifts'),
  claimGift: (id) => api(`/api/gifts/${id}/claim`, { method: 'POST' }),

  // Leaderboard
  getLeaderboard: (limit = 100) => api(`/api/leaderboard?limit=${limit}`),

  // Inventory
  getInventory: () => api('/api/inventory'),
  buyCapacity: (items) => api('/api/inventory/buy', { method: 'POST', body: { items } }),
  listCapacities: () => api('/api/inventory/capacities'),

  // Admin
  adminStats: () => api('/api/admin/stats'),
  adminSearch: (q) => api(`/api/admin/search?q=${encodeURIComponent(q)}`),
  adminGift: (user_id, gift_type, gift_data, message) =>
    api('/api/admin/gift', { method: 'POST', body: { user_id, gift_type, gift_data, message } }),
  adminGiftAll: (gift_type, gift_data, message) =>
    api('/api/admin/gift-all', { method: 'POST', body: { gift_type, gift_data, message } }),
  adminBan: (user_id, reason) => api('/api/admin/ban', { method: 'POST', body: { user_id, reason } }),
  adminUnban: (user_id) => api('/api/admin/unban', { method: 'POST', body: { user_id } }),
  adminPromote: (user_id, level) => api('/api/admin/promote', { method: 'POST', body: { user_id, level } }),
  adminGrantPgs: (user_id, amount) => api('/api/admin/grant-pgs', { method: 'POST', body: { user_id, amount } }),
  adminGrantPbucks: (user_id, amount) => api('/api/admin/grant-pbucks', { method: 'POST', body: { user_id, amount } }),
  adminLogs: (limit = 100) => api(`/api/admin/logs?limit=${limit}`),

  // Reports
  createReport: (reported_id, reason, details) =>
    api('/api/reports', { method: 'POST', body: { reported_id, reason, details } }),
  listReports: (status = 'open') => api(`/api/reports?status=${status}`),
  resolveReport: (id, note, action) =>
    api(`/api/reports/${id}/resolve`, { method: 'POST', body: { note, action } }),
};

window.API = API;
