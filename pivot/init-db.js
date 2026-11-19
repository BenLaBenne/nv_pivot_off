// init-db.js — crée toutes les tables + données seed si manquantes
// Idempotent : CREATE TABLE IF NOT EXISTS.
const { pool, query, withTransaction } = require('./db');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
dotenv.config();

const SQL_STATEMENTS = [
  // Users
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(32) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    friend_id VARCHAR(8) UNIQUE NOT NULL,
    elo INTEGER DEFAULT 1000,
    trophies INTEGER DEFAULT 0,
    pgs INTEGER DEFAULT 0,
    pbucks INTEGER DEFAULT 0,
    win_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    matches_played INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    matches_lost INTEGER DEFAULT 0,
    pass_xp INTEGER DEFAULT 0,
    pass_level INTEGER DEFAULT 0,
    is_admin BOOLEAN DEFAULT FALSE,
    admin_level INTEGER DEFAULT 0,
    banned BOOLEAN DEFAULT FALSE,
    banned_reason TEXT,
    equipped_skin INTEGER,
    last_login TIMESTAMP,
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
  `CREATE INDEX IF NOT EXISTS idx_users_friend_id ON users(friend_id)`,
  `CREATE INDEX IF NOT EXISTS idx_users_trophies ON users(trophies DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo DESC)`,

  // Inventaire capacités
  `CREATE TABLE IF NOT EXISTS user_inventory (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    ability_type VARCHAR(16) NOT NULL,
    quantity INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, ability_type)
  )`,

  // Coffres en attente d'ouverture
  `CREATE TABLE IF NOT EXISTS user_chests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    chest_type VARCHAR(16) NOT NULL,
    status VARCHAR(16) DEFAULT 'unopened',
    opened_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  )`,

  // Skins
  `CREATE TABLE IF NOT EXISTS skins (
    id SERIAL PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    texture_path VARCHAR(255) NOT NULL,
    price_pgs INTEGER NOT NULL,
    rarity VARCHAR(16) DEFAULT 'commun'
  )`,

  // Skins possédés
  `CREATE TABLE IF NOT EXISTS user_skins (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    skin_id INTEGER REFERENCES skins(id),
    equipped BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (user_id, skin_id)
  )`,

  // Matchs
  `CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,
    player1_id INTEGER REFERENCES users(id),
    player2_id INTEGER REFERENCES users(id),
    winner_id INTEGER REFERENCES users(id),
    match_type VARCHAR(16) NOT NULL,
    status VARCHAR(16) DEFAULT 'playing',
    elo_change INTEGER DEFAULT 0,
    tr_earned INTEGER DEFAULT 0,
    pgs_earned INTEGER DEFAULT 0,
    xp_earned INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    finished_at TIMESTAMP
  )`,

  // Salons privés
  `CREATE TABLE IF NOT EXISTS private_rooms (
    code VARCHAR(6) PRIMARY KEY,
    host_id INTEGER REFERENCES users(id),
    guest_id INTEGER REFERENCES users(id),
    status VARCHAR(16) DEFAULT 'waiting',
    created_at TIMESTAMP DEFAULT NOW()
  )`,

  // Amis
  `CREATE TABLE IF NOT EXISTS friendships (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    friend_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(16) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, friend_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id)`,

  // Cadeaux admin
  `CREATE TABLE IF NOT EXISTS admin_gifts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    gift_type VARCHAR(32) NOT NULL,
    gift_data TEXT,
    status VARCHAR(16) DEFAULT 'unclaimed',
    message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`,

  // Saisons
  `CREATE TABLE IF NOT EXISTS seasons (
    id SERIAL PRIMARY KEY,
    name VARCHAR(64) UNIQUE NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`,

  // Claims du Pass
  `CREATE TABLE IF NOT EXISTS pass_claims (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
    level INTEGER NOT NULL,
    claimed_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, season_id, level)
  )`,

  // Historique pass par saison
  `CREATE TABLE IF NOT EXISTS user_season_history (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
    final_xp INTEGER DEFAULT 0,
    final_level INTEGER DEFAULT 0,
    final_trophies INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, season_id)
  )`,

  // Reports
  `CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    reporter_id INTEGER REFERENCES users(id),
    reported_id INTEGER REFERENCES users(id),
    reason VARCHAR(255) NOT NULL,
    details TEXT,
    status VARCHAR(16) DEFAULT 'open',
    admin_id INTEGER REFERENCES users(id),
    admin_note TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP
  )`,

  // Logs admin
  `CREATE TABLE IF NOT EXISTS admin_logs (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES users(id),
    action VARCHAR(64) NOT NULL,
    target_id INTEGER,
    details TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`,

  // Match moves (pour replay + anti-triche)
  `CREATE TABLE IF NOT EXISTS match_moves (
    id SERIAL PRIMARY KEY,
    match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
    player_id INTEGER REFERENCES users(id),
    move_index INTEGER NOT NULL,
    move_type VARCHAR(16) NOT NULL,
    move_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
  )`,
];

// Génération d'un friend_id unique #ABC123
function randomFriendId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

async function generateUniqueFriendId(client) {
  for (let i = 0; i < 20; i++) {
    const id = randomFriendId();
    const r = await client.query('SELECT 1 FROM users WHERE friend_id = $1', [id]);
    if (r.rowCount === 0) return id;
  }
  throw new Error('Impossible de générer un friend_id unique');
}

async function seedSkins(client) {
  const skins = [
    ['Classic', '/assets/skins/skin_classic.svg', 0, 'commun'],
    ['Lave', '/assets/skins/skin_lava.svg', 80, 'rare'],
    ['Glace', '/assets/skins/skin_ice.svg', 80, 'rare'],
    ['Bois', '/assets/skins/skin_wood.svg', 120, 'rare'],
    ['Néon', '/assets/skins/skin_neon.svg', 200, 'epique'],
    ['Galaxy', '/assets/skins/skin_galaxy.svg', 350, 'mythique'],
    ['Or Royal', '/assets/skins/skin_gold.svg', 500, 'legendaire'],
  ];
  for (const [name, path, price, rarity] of skins) {
    await client.query(
      `INSERT INTO skins (name, texture_path, price_pgs, rarity)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [name, path, price, rarity]
    );
  }
}

async function seedSeason(client) {
  // Saison courante (mois en cours)
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const name = `Saison ${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
  await client.query(
    `INSERT INTO seasons (name, start_date, end_date)
     VALUES ($1, $2, $3)
     ON CONFLICT (name) DO NOTHING`,
    [name, start, end]
  );
}

async function seedAdmin(client) {
  const adminUser = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
  const adminPass = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
  // Vérifie si un admin existe déjà
  const existing = await client.query('SELECT 1 FROM users WHERE is_admin = TRUE LIMIT 1');
  if (existing.rowCount > 0) return false;
  const hash = await bcrypt.hash(adminPass, 10);
  const friendId = await generateUniqueFriendId(client);
  const r = await client.query(
    `INSERT INTO users (username, password_hash, friend_id, is_admin, admin_level, pgs, pbucks)
     VALUES ($1, $2, $3, TRUE, 2, 9999, 9999)
     RETURNING id`,
    [adminUser, hash, friendId]
  );
  console.log(`[init-db] Admin créé : ${adminUser} / ${adminPass} (friend_id #${friendId})`);
  return true;
}

// Migrations idempotentes — appliquées sur des tables existantes
// ( ALTER TABLE ... ADD COLUMN IF NOT EXISTS — PostgreSQL 9.6+ )
const MIGRATIONS = [
  `ALTER TABLE user_chests ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP`,
  // Index sur last_seen pour la query admin stats
  `CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen DESC)`,
  // Index sur friendships.friend_id (deja créé plus haut, idempotent)
  // Index sur matches.status pour les queries admin
  `CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status)`,
];

async function initDb() {
  console.log('[init-db] Création des tables...');
  for (const stmt of SQL_STATEMENTS) {
    await pool.query(stmt);
  }
  console.log('[init-db] Tables OK');

  console.log('[init-db] Migrations...');
  for (const stmt of MIGRATIONS) {
    try {
      await pool.query(stmt);
    } catch (e) {
      console.warn('[init-db] migration skip:', e.message);
    }
  }
  console.log('[init-db] Migrations OK');

  await withTransaction(async (client) => {
    await seedSkins(client);
    await seedSeason(client);
    await seedAdmin(client);
  });
  console.log('[init-db] Seed OK');
}

if (require.main === module) {
  initDb()
    .then(() => {
      console.log('[init-db] Terminé.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[init-db] Erreur:', err);
      process.exit(1);
    });
}

module.exports = { initDb, generateUniqueFriendId };
