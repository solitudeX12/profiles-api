const express = require("express");
const cors = require("cors");
const uuid = require("uuid");
const uuidv7 = uuid.v7 || uuid.v4;
const { db, initDb } = require("./db");
const { fetchGenderize, fetchAgify, fetchNationalize } = require("./externalApis");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// ── Helpers ─────────────────────────────────────────────────────────────────
const err = (res, code, message) =>
  res.status(code).json({ status: "error", message });

function getAgeGroup(age) {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
}

function formatProfile(row) {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    gender_probability: row.gender_probability,
    sample_size: row.sample_size,
    age: row.age,
    age_group: row.age_group,
    country_id: row.country_id,
    country_probability: row.country_probability,
    created_at: row.created_at,
  };
}

function formatProfileList(row) {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    age: row.age,
    age_group: row.age_group,
    country_id: row.country_id,
  };
}

// ── POST /api/profiles ───────────────────────────────────────────────────────
app.post("/api/profiles", async (req, res) => {
  const { name } = req.body;

  // 422 — wrong type
  if (name !== undefined && typeof name !== "string") {
    return err(res, 422, "name must be a string");
  }

  // 400 — missing or empty
  if (!name || name.trim() === "") {
    return err(res, 400, "Missing or empty name");
  }

  const cleanName = name.trim().toLowerCase();

  // Idempotency — check existing
  const existing = await db.execute({
    sql: "SELECT * FROM profiles WHERE name = ?",
    args: [cleanName],
  });

  if (existing.rows.length > 0) {
    return res.status(200).json({
      status: "success",
      message: "Profile already exists",
      data: formatProfile(existing.rows[0]),
    });
  }

  // Fetch all three APIs in parallel
  let genderData, ageData, nationalityData;

  try {
    [genderData, ageData, nationalityData] = await Promise.all([
      fetchGenderize(cleanName),
      fetchAgify(cleanName),
      fetchNationalize(cleanName),
    ]);
  } catch (e) {
    return err(res, 502, e.message);
  }

  const id = uuidv7();
  const age_group = getAgeGroup(ageData.age);
  const created_at = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO profiles
            (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      cleanName,
      genderData.gender,
      genderData.gender_probability,
      genderData.sample_size,
      ageData.age,
      age_group,
      nationalityData.country_id,
      nationalityData.country_probability,
      created_at,
    ],
  });

  const inserted = await db.execute({
    sql: "SELECT * FROM profiles WHERE id = ?",
    args: [id],
  });

  return res.status(201).json({
    status: "success",
    data: formatProfile(inserted.rows[0]),
  });
});

// ── GET /api/profiles ────────────────────────────────────────────────────────
app.get("/api/profiles", async (req, res) => {
  const { gender, country_id, age_group } = req.query;

  let sql = "SELECT * FROM profiles WHERE 1=1";
  const args = [];

  if (gender) {
    sql += " AND LOWER(gender) = LOWER(?)";
    args.push(gender);
  }
  if (country_id) {
    sql += " AND LOWER(country_id) = LOWER(?)";
    args.push(country_id);
  }
  if (age_group) {
    sql += " AND LOWER(age_group) = LOWER(?)";
    args.push(age_group);
  }

  const result = await db.execute({ sql, args });

  return res.status(200).json({
    status: "success",
    count: result.rows.length,
    data: result.rows.map(formatProfileList),
  });
});

// ── GET /api/profiles/:id ────────────────────────────────────────────────────
app.get("/api/profiles/:id", async (req, res) => {
  const { id } = req.params;

  const result = await db.execute({
    sql: "SELECT * FROM profiles WHERE id = ?",
    args: [id],
  });

  if (result.rows.length === 0) {
    return err(res, 404, "Profile not found");
  }

  return res.status(200).json({
    status: "success",
    data: formatProfile(result.rows[0]),
  });
});

// ── DELETE /api/profiles/:id ─────────────────────────────────────────────────
app.delete("/api/profiles/:id", async (req, res) => {
  const { id } = req.params;

  const existing = await db.execute({
    sql: "SELECT id FROM profiles WHERE id = ?",
    args: [id],
  });

  if (existing.rows.length === 0) {
    return err(res, 404, "Profile not found");
  }

  await db.execute({
    sql: "DELETE FROM profiles WHERE id = ?",
    args: [id],
  });

  return res.status(204).send();
});

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((req, res) => err(res, 404, "Route not found"));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((error, req, res, next) => {
  console.error(error);
  err(res, 500, "Internal server error");
});

// ── Boot ──────────────────────────────────────────────────────────────────────
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((e) => {
    console.error("Failed to initialise database:", e);
    process.exit(1);
  });

module.exports = app;
