// seasons.js — gestion saison mensuelle + reset TR
const { query, withTransaction } = require('./db');

const SEASON_DAYS = parseInt(process.env.SEASON_DAYS || '30', 10);

function currentSeasonName(date = new Date()) {
  return `Saison ${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function currentSeasonRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start, end };
}

// Renvoie la saison courante (crée si nécessaire)
async function getCurrentSeason() {
  const { start, end } = currentSeasonRange();
  const name = currentSeasonName();
  // Try to fetch
  const r = await query('SELECT * FROM seasons WHERE name = $1', [name]);
  if (r.rowCount > 0) return r.rows[0];
  // Create
  const ins = await query(
    'INSERT INTO seasons (name, start_date, end_date) VALUES ($1, $2, $3) RETURNING *',
    [name, start, end]
  );
  return ins.rows[0];
}

// Vérifie si la saison courante en DB est dépassée. Si oui :
//   - archive les users dans user_season_history (final_xp/level/trophies)
//   - reset TR/trophies à 0 pour tous
//   - reset pass_xp/pass_level à 0
//   - crée la nouvelle saison
// À appeler au démarrage du serveur + périodiquement.
async function rolloverSeasonIfNeeded() {
  const now = new Date();
  // Récupère la saison la plus récente en DB
  const r = await query('SELECT * FROM seasons ORDER BY end_date DESC LIMIT 1');
  if (r.rowCount === 0) {
    await getCurrentSeason();
    return { rolled: false, reason: 'no_season' };
  }
  const last = r.rows[0];
  if (new Date(last.end_date) > now) {
    return { rolled: false };
  }
  // Rollover
  await withTransaction(async (client) => {
    // 1. Archiver
    await client.query(`
      INSERT INTO user_season_history (user_id, season_id, final_xp, final_level, final_trophies)
      SELECT u.id, $1, u.pass_xp, u.pass_level, u.trophies FROM users u
      ON CONFLICT (user_id, season_id) DO UPDATE
        SET final_xp = EXCLUDED.final_xp,
            final_level = EXCLUDED.final_level,
            final_trophies = EXCLUDED.final_trophies
    `, [last.id]);
    // 2. Reset TR et pass pour tous
    await client.query('UPDATE users SET trophies = 0, pass_xp = 0, pass_level = 0');
    // 3. Créer la nouvelle saison
    const { start, end } = currentSeasonRange();
    const name = currentSeasonName();
    await client.query(
      'INSERT INTO seasons (name, start_date, end_date) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING',
      [name, start, end]
    );
  });
  return { rolled: true, previousSeason: last.name };
}

// Planifie un check périodique (toutes les heures)
let intervalHandle = null;
function startSeasonScheduler() {
  if (intervalHandle) return;
  intervalHandle = setInterval(async () => {
    try {
      const r = await rolloverSeasonIfNeeded();
      if (r.rolled) console.log('[seasons] rollover effectué :', r.previousSeason);
    } catch (e) {
      console.error('[seasons] erreur rollover:', e.message);
    }
  }, 60 * 60 * 1000);
}

module.exports = {
  SEASON_DAYS, currentSeasonName, currentSeasonRange,
  getCurrentSeason, rolloverSeasonIfNeeded, startSeasonScheduler,
};
