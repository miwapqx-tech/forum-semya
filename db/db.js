const path = require("path");
const Database = require("better-sqlite3");
const fs = require("fs");

const DB_DIR = process.env.DATABASE_DIR || path.join(__dirname, "..", "data");
const DB_PATH = process.env.DATABASE_PATH || path.join(DB_DIR, "forum.sqlite");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

fs.mkdirSync(DB_DIR, { recursive: true });

function nowMs() {
  return Date.now();
}

function openDb() {
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
  return db;
}

function columnExists(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

function migrateDb(db) {
  if (!columnExists(db, "users", "verified")) {
    db.exec("ALTER TABLE users ADD COLUMN verified INTEGER NOT NULL DEFAULT 0");
  }
  if (!columnExists(db, "posts", "image_path")) {
    db.exec("ALTER TABLE posts ADD COLUMN image_path TEXT NOT NULL DEFAULT ''");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS post_reposts (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, post_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reposts_user ON post_reposts(user_id, created_at DESC);
  `);
}

function initDb(db) {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, "utf8");
  db.exec(schemaSql);
  migrateDb(db);

  const bcrypt = require("bcryptjs");
  const hasUsers = db.prepare("SELECT 1 FROM users LIMIT 1").get();
  if (!hasUsers) {
    const password_hash = bcrypt.hashSync("admin12345", 10);
    db.prepare(
      "INSERT INTO users (username, email, password_hash, role, verified, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("admin", "admin@example.com", password_hash, "admin", 0, nowMs());
  }

  const official = db.prepare("SELECT id FROM users WHERE username = ?").get("Семья");
  if (!official) {
    const hash = bcrypt.hashSync("official12345", 10);
    db.prepare(
      `INSERT INTO users (username, email, password_hash, bio, avatar_path, role, verified, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "Семья",
      "official@family.local",
      hash,
      "Официальный аккаунт форума. Здесь публикуются новости и объявления.",
      "/pic/avatar-default.png",
      "user",
      1,
      nowMs()
    );
  } else {
    db.prepare("UPDATE users SET verified = 1 WHERE username = ?").run("Семья");
  }

  db.prepare(
    `UPDATE users SET avatar_path = '/pic/avatar-default.png'
     WHERE avatar_path IS NULL OR avatar_path = '' OR avatar_path = '/pic/avatar-default.jpg'`
  ).run();
}

module.exports = { openDb, initDb, nowMs, DB_PATH };
