const { createClient } = require("@libsql/client");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "profiles.db");
const db = createClient({ url: `file:${DB_PATH}` });

async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS profiles (
      id                   TEXT PRIMARY KEY,
      name                 TEXT NOT NULL UNIQUE,
      gender               TEXT,
      gender_probability   REAL,
      sample_size          INTEGER,
      age                  INTEGER,
      age_group            TEXT,
      country_id           TEXT,
      country_name         TEXT,
      country_probability  REAL,
      created_at           TEXT NOT NULL
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_gender       ON profiles(gender)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_age_group    ON profiles(age_group)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_country_id   ON profiles(country_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_age          ON profiles(age)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_created_at   ON profiles(created_at)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_gender_prob  ON profiles(gender_probability)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_country_prob ON profiles(country_probability)`);
}

module.exports = { db, initDb };
