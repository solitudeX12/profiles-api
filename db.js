const { createClient } = require("@libsql/client");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "profiles.db");

const db = createClient({ url: `file:${DB_PATH}` });

async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS profiles (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL UNIQUE,
      gender           TEXT,
      gender_probability REAL,
      sample_size      INTEGER,
      age              INTEGER,
      age_group        TEXT,
      country_id       TEXT,
      country_probability REAL,
      created_at       TEXT NOT NULL
    )
  `);
}

module.exports = { db, initDb };
