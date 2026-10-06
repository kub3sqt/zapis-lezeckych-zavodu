const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'climbing.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    password_hash TEXT DEFAULT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'recorder')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS competitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS comp_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    UNIQUE(competition_id, category)
  );

  CREATE TABLE IF NOT EXISTS comp_boulders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    boulder_number INTEGER NOT NULL CHECK(boulder_number >= 1 AND boulder_number <= 30),
    gender TEXT NOT NULL DEFAULT 'both' CHECK(gender IN ('both', 'boys', 'girls')),
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES comp_categories(id) ON DELETE CASCADE,
    UNIQUE(competition_id, category_id, boulder_number, gender)
  );

  CREATE TABLE IF NOT EXISTS children (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    gender TEXT NOT NULL CHECK(gender IN ('male', 'female')),
    access_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES comp_categories(id) ON DELETE CASCADE,
    UNIQUE(competition_id, access_key),
    UNIQUE(competition_id, first_name, last_name, gender)
  );

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL,
    competition_id INTEGER NOT NULL,
    boulder_number INTEGER NOT NULL,
    attempts INTEGER DEFAULT 0,
    zone1_attempts INTEGER DEFAULT 0,
    zone2_attempts INTEGER DEFAULT 0,
    top_attempts INTEGER DEFAULT 0,
    best_achievement INTEGER DEFAULT 0,
    recorder_id INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    UNIQUE(child_id, competition_id, boulder_number)
  );

  CREATE TABLE IF NOT EXISTS published_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES comp_categories(id) ON DELETE CASCADE,
    UNIQUE(competition_id, category_id)
  );

  CREATE TABLE IF NOT EXISTS seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS season_competitions (
    season_id INTEGER NOT NULL,
    competition_id INTEGER NOT NULL,
    FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    PRIMARY KEY (season_id, competition_id)
  );
`);

// Create default admin ONLY on first-ever initialization (not on every restart)
const fs = require('fs');
const INIT_MARKER = path.join(__dirname, '.initialized');
if (!fs.existsSync(INIT_MARKER)) {
  const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 12);
    db.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)').run(
      'admin@admin.com', 'Admin', hash, 'admin'
    );
    console.log('Default admin created: admin@admin.com / admin123');
  }
  fs.writeFileSync(INIT_MARKER, new Date().toISOString());
}

// Ensure required accounts exist with known passwords (applied once per version).
// Only bcrypt hashes are stored here; later password changes in the app are kept.
db.exec(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)`);
const ACCOUNTS_VERSION = 'accounts_v1';
const REQUIRED_ACCOUNTS = [
  { email: 'donat.jakub@icloud.com', name: 'Jakub Donát', role: 'admin', hash: '$2a$12$A./Yf/dxikzrmSlo/0J3/eQi0KxK3erCuQBvbq6VA8R2djER1FG4e' },
  { email: 'admin@admin.com', name: 'Admin', role: 'admin', hash: '$2a$12$9FvhABx9a5LbM2WQwNYC6.KMgSM15HDScpKdX/gM9Th9/URHIIx9O' },
  { email: 'zapisovac@zapisovac.cz', name: 'Zapisovač', role: 'recorder', hash: '$2a$12$pWK9UTRD8f2urCxZ89pcDO/rhVbZk04YV.7JrqvT83ZT3gYuZa6wC' },
];
if (!db.prepare('SELECT 1 FROM app_meta WHERE key = ?').get(ACCOUNTS_VERSION)) {
  db.transaction(() => {
    for (const acc of REQUIRED_ACCOUNTS) {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(acc.email);
      if (existing) {
        db.prepare('UPDATE users SET password_hash = ?, role = ? WHERE id = ?').run(acc.hash, acc.role, existing.id);
      } else {
        db.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)').run(acc.email, acc.name, acc.hash, acc.role);
      }
    }
    db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run(ACCOUNTS_VERSION, new Date().toISOString());
  })();
  console.log('Required accounts ensured:', REQUIRED_ACCOUNTS.map(a => a.email).join(', '));
}

function generateAccessKey() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

module.exports = { db, generateAccessKey };
