const express = require("express");
const cors = require("cors");
const uuid = require("uuid");
const uuidv7 = uuid.v7 || uuid.v4;
const { db, initDb } = require("./db");
const { fetchGenderize, fetchAgify, fetchNationalize } = require("./externalApis");
const { parseNaturalLanguage } = require("./nlParser");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// ── Country ISO2 → full name ──────────────────────────────────────────────────
const COUNTRY_NAMES = {
  NG:"Nigeria",GH:"Ghana",KE:"Kenya",ET:"Ethiopia",TZ:"Tanzania",
  UG:"Uganda",SN:"Senegal",ML:"Mali",NE:"Niger",TD:"Chad",
  AO:"Angola",MZ:"Mozambique",MG:"Madagascar",CM:"Cameroon",
  CI:"Ivory Coast",ZM:"Zambia",ZW:"Zimbabwe",MW:"Malawi",RW:"Rwanda",
  BJ:"Benin",BI:"Burundi",TG:"Togo",SL:"Sierra Leone",LY:"Libya",
  LR:"Liberia",CD:"DR Congo",CG:"Congo",SO:"Somalia",SD:"Sudan",
  EG:"Egypt",MA:"Morocco",DZ:"Algeria",TN:"Tunisia",ZA:"South Africa",
  NA:"Namibia",BW:"Botswana",LS:"Lesotho",SZ:"Eswatini",GA:"Gabon",
  GW:"Guinea-Bissau",GN:"Guinea",GQ:"Equatorial Guinea",ER:"Eritrea",
  DJ:"Djibouti",KM:"Comoros",CV:"Cape Verde",ST:"Sao Tome",
  MU:"Mauritius",SC:"Seychelles",GM:"Gambia",BF:"Burkina Faso",
  CF:"Central African Republic",US:"United States",GB:"United Kingdom",
  FR:"France",DE:"Germany",IT:"Italy",ES:"Spain",PT:"Portugal",
  BR:"Brazil",IN:"India",CN:"China",JP:"Japan",CA:"Canada",
  AU:"Australia",MX:"Mexico",AR:"Argentina",CO:"Colombia",PE:"Peru",
  CL:"Chile",ID:"Indonesia",PK:"Pakistan",BD:"Bangladesh",
  PH:"Philippines",VN:"Vietnam",TH:"Thailand",MM:"Myanmar",
  MY:"Malaysia",NP:"Nepal",LK:"Sri Lanka",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const errRes = (res, code, message) =>
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
    age: row.age,
    age_group: row.age_group,
    country_id: row.country_id,
    country_name: row.country_name,
    country_probability: row.country_probability,
    created_at: row.created_at,
  };
}

// ── Build filter SQL (shared between GET /profiles and /search) ───────────────
function buildFilterQuery(filters, base = "SELECT * FROM profiles") {
  const {
    gender, age_group, country_id,
    min_age, max_age,
    min_gender_probability, min_country_probability,
    sort_by = "created_at", order = "desc",
    page = 1, limit = 10,
  } = filters;

  // Validate sort_by and order
  const ALLOWED_SORT = ["age", "created_at", "gender_probability"];
  const ALLOWED_ORDER = ["asc", "desc"];
  const safeSort  = ALLOWED_SORT.includes(sort_by)  ? sort_by  : "created_at";
  const safeOrder = ALLOWED_ORDER.includes(order.toLowerCase()) ? order.toLowerCase() : "desc";

  const safePage  = Math.max(1, parseInt(page)  || 1);
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit) || 10));
  const offset    = (safePage - 1) * safeLimit;

  let sql  = "WHERE 1=1";
  const args = [];

  if (gender)     { sql += " AND LOWER(gender) = LOWER(?)";    args.push(gender); }
  if (age_group)  { sql += " AND LOWER(age_group) = LOWER(?)"; args.push(age_group); }
  if (country_id) { sql += " AND LOWER(country_id) = LOWER(?)"; args.push(country_id); }

  if (min_age !== undefined && min_age !== null) {
    sql += " AND age >= ?"; args.push(Number(min_age));
  }
  if (max_age !== undefined && max_age !== null) {
    sql += " AND age <= ?"; args.push(Number(max_age));
  }
  if (min_gender_probability) {
    sql += " AND gender_probability >= ?"; args.push(Number(min_gender_probability));
  }
  if (min_country_probability) {
    sql += " AND country_probability >= ?"; args.push(Number(min_country_probability));
  }

  const countSql = `SELECT COUNT(*) as total FROM profiles ${sql}`;
  const dataSql  = `SELECT * FROM profiles ${sql} ORDER BY ${safeSort} ${safeOrder} LIMIT ? OFFSET ?`;

  return {
    countSql, dataSql,
    countArgs: [...args],
    dataArgs:  [...args, safeLimit, offset],
    page: safePage, limit: safeLimit,
  };
}

// ── POST /api/profiles ────────────────────────────────────────────────────────
app.post("/api/profiles", async (req, res) => {
  const { name } = req.body;

  if (name !== undefined && typeof name !== "string")
    return errRes(res, 422, "name must be a string");
  if (!name || name.trim() === "")
    return errRes(res, 400, "Missing or empty name");

  const cleanName = name.trim().toLowerCase();

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

  let genderData, ageData, nationalityData;
  try {
    [genderData, ageData, nationalityData] = await Promise.all([
      fetchGenderize(cleanName),
      fetchAgify(cleanName),
      fetchNationalize(cleanName),
    ]);
  } catch (e) {
    return errRes(res, 502, e.message);
  }

  const id         = uuidv7();
  const age_group  = getAgeGroup(ageData.age);
  const created_at = new Date().toISOString();
  const country_name = COUNTRY_NAMES[nationalityData.country_id] || nationalityData.country_id;

  await db.execute({
    sql: `INSERT INTO profiles
            (id, name, gender, gender_probability, sample_size, age,
             age_group, country_id, country_name, country_probability, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, cleanName,
      genderData.gender, genderData.gender_probability, genderData.sample_size,
      ageData.age, age_group,
      nationalityData.country_id, country_name, nationalityData.country_probability,
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

// ── GET /api/profiles/search  (must be BEFORE /profiles/:id) ─────────────────
app.get("/api/profiles/search", async (req, res) => {
  const { q, page, limit } = req.query;

  if (!q || q.trim() === "")
    return errRes(res, 400, "Missing or empty query parameter: q");

  const parsed = parseNaturalLanguage(q);
  if (!parsed)
    return errRes(res, 400, "Unable to interpret query");

  // Merge parsed filters with pagination params
  const filters = { ...parsed, page, limit };
  const { countSql, dataSql, countArgs, dataArgs, page: pg, limit: lim } =
    buildFilterQuery(filters);

  const [countResult, dataResult] = await Promise.all([
    db.execute({ sql: countSql, args: countArgs }),
    db.execute({ sql: dataSql,  args: dataArgs  }),
  ]);

  const total = countResult.rows[0].total;

  return res.status(200).json({
    status: "success",
    query: q,
    parsed_filters: parsed,
    page: pg,
    limit: lim,
    total,
    data: dataResult.rows.map(formatProfile),
  });
});

// ── GET /api/profiles ─────────────────────────────────────────────────────────
app.get("/api/profiles", async (req, res) => {
  const VALID_PARAMS = [
    "gender","age_group","country_id","min_age","max_age",
    "min_gender_probability","min_country_probability",
    "sort_by","order","page","limit",
  ];

  // Reject unknown query params
  const unknownParams = Object.keys(req.query).filter(
    (k) => !VALID_PARAMS.includes(k)
  );
  if (unknownParams.length > 0)
    return errRes(res, 400, "Invalid query parameters");

  const { countSql, dataSql, countArgs, dataArgs, page, limit } =
    buildFilterQuery(req.query);

  const [countResult, dataResult] = await Promise.all([
    db.execute({ sql: countSql, args: countArgs }),
    db.execute({ sql: dataSql,  args: dataArgs  }),
  ]);

  const total = countResult.rows[0].total;

  return res.status(200).json({
    status: "success",
    page,
    limit,
    total,
    data: dataResult.rows.map(formatProfile),
  });
});

// ── GET /api/profiles/:id ─────────────────────────────────────────────────────
app.get("/api/profiles/:id", async (req, res) => {
  const result = await db.execute({
    sql: "SELECT * FROM profiles WHERE id = ?",
    args: [req.params.id],
  });
  if (result.rows.length === 0)
    return errRes(res, 404, "Profile not found");
  return res.status(200).json({
    status: "success",
    data: formatProfile(result.rows[0]),
  });
});

// ── DELETE /api/profiles/:id ──────────────────────────────────────────────────
app.delete("/api/profiles/:id", async (req, res) => {
  const existing = await db.execute({
    sql: "SELECT id FROM profiles WHERE id = ?",
    args: [req.params.id],
  });
  if (existing.rows.length === 0)
    return errRes(res, 404, "Profile not found");
  await db.execute({
    sql: "DELETE FROM profiles WHERE id = ?",
    args: [req.params.id],
  });
  return res.status(204).send();
});

// ── 404 / error handlers ──────────────────────────────────────────────────────
app.use((req, res) => errRes(res, 404, "Route not found"));
app.use((error, req, res, next) => {
  console.error(error);
  errRes(res, 500, "Internal server error");
});

// ── Boot ──────────────────────────────────────────────────────────────────────
initDb()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch((e) => { console.error("DB init failed:", e); process.exit(1); });

module.exports = app;
