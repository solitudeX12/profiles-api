/**
 * Seed script — loads 2026 profiles from seed.json into the database.
 * Safe to re-run: uses INSERT OR IGNORE to skip duplicates.
 *
 * Usage:
 *   node seed.js ./seed.json
 *   node seed.js                  ← looks for seed.json in same folder
 *
 * Expected JSON format (array of profile objects):
 * [
 *   {
 *     "name": "ella",
 *     "gender": "female",
 *     "gender_probability": 0.99,
 *     "sample_size": 1234,
 *     "age": 46,
 *     "age_group": "adult",
 *     "country_id": "NG",
 *     "country_name": "Nigeria",
 *     "country_probability": 0.85
 *   },
 *   ...
 * ]
 */

const { db, initDb } = require("./db");
const { v7: uuidv7, v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

// Country ISO2 → full name map (for seeding if country_name is missing)
const COUNTRY_NAMES = {
  NG: "Nigeria", GH: "Ghana", KE: "Kenya", ET: "Ethiopia",
  TZ: "Tanzania", UG: "Uganda", SN: "Senegal", ML: "Mali",
  NE: "Niger", TD: "Chad", AO: "Angola", MZ: "Mozambique",
  MG: "Madagascar", CM: "Cameroon", CI: "Ivory Coast",
  ZM: "Zambia", ZW: "Zimbabwe", MW: "Malawi", RW: "Rwanda",
  BJ: "Benin", BI: "Burundi", TG: "Togo", SL: "Sierra Leone",
  LY: "Libya", LR: "Liberia", CD: "DR Congo", CG: "Congo",
  SO: "Somalia", SD: "Sudan", EG: "Egypt", MA: "Morocco",
  DZ: "Algeria", TN: "Tunisia", ZA: "South Africa", NA: "Namibia",
  BW: "Botswana", LS: "Lesotho", SZ: "Eswatini", GA: "Gabon",
  GW: "Guinea-Bissau", GN: "Guinea", GQ: "Equatorial Guinea",
  ER: "Eritrea", DJ: "Djibouti", KM: "Comoros", CV: "Cape Verde",
  ST: "Sao Tome", MU: "Mauritius", SC: "Seychelles", GM: "Gambia",
  BF: "Burkina Faso", CF: "Central African Republic",
  US: "United States", GB: "United Kingdom", FR: "France",
  DE: "Germany", IT: "Italy", ES: "Spain", PT: "Portugal",
  BR: "Brazil", IN: "India", CN: "China", JP: "Japan",
  CA: "Canada", AU: "Australia", MX: "Mexico", AR: "Argentina",
  CO: "Colombia", PE: "Peru", CL: "Chile", ID: "Indonesia",
  PK: "Pakistan", BD: "Bangladesh", PH: "Philippines",
  VN: "Vietnam", TH: "Thailand", MM: "Myanmar", MY: "Malaysia",
  NP: "Nepal", LK: "Sri Lanka",
};

function getAgeGroup(age) {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
}

async function seed() {
  const filePath = process.argv[2] || path.join(__dirname, "seed.json");

  if (!fs.existsSync(filePath)) {
    console.error(`❌  Seed file not found: ${filePath}`);
    console.error(`    Usage: node seed.js ./path/to/seed.json`);
    process.exit(1);
  }

  console.log(`📂  Loading seed file: ${filePath}`);
  const raw = fs.readFileSync(filePath, "utf8");
  let profiles;

  try {
    const parsed = JSON.parse(raw);

    // Handle wrapped object: { "data": [...] } or { "profiles": [...] }
    if (Array.isArray(parsed)) {
      profiles = parsed;
    } else if (parsed.data && Array.isArray(parsed.data)) {
      profiles = parsed.data;
    } else if (parsed.profiles && Array.isArray(parsed.profiles)) {
      profiles = parsed.profiles;
    } else {
      // Try to find any array value in the top-level object
      const arrayVal = Object.values(parsed).find(v => Array.isArray(v));
      if (arrayVal) {
        profiles = arrayVal;
      } else {
        console.error("❌  Could not find an array in the seed file");
        process.exit(1);
      }
    }
  } catch (e) {
    console.error("❌  Invalid JSON in seed file:", e.message);
    process.exit(1);
  }

  console.log(`📊  Found ${profiles.length} profiles to seed`);

  await initDb();

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  // Insert in batches of 100 for performance
  const BATCH_SIZE = 100;

  for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
    const batch = profiles.slice(i, i + BATCH_SIZE);

    for (const p of batch) {
      try {
        const id = (typeof uuidv7 === "function" ? uuidv7 : uuidv4)();
        const created_at = p.created_at || new Date().toISOString();
        const age_group = p.age_group || getAgeGroup(p.age);
        const country_name =
          p.country_name ||
          COUNTRY_NAMES[p.country_id] ||
          p.country_id ||
          "Unknown";

        await db.execute({
          sql: `INSERT OR IGNORE INTO profiles
                  (id, name, gender, gender_probability, sample_size, age,
                   age_group, country_id, country_name, country_probability, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            (p.name || "").toLowerCase().trim(),
            p.gender,
            p.gender_probability ?? p.probability ?? null,
            p.sample_size ?? p.count ?? null,
            p.age,
            age_group,
            p.country_id,
            country_name,
            p.country_probability ?? null,
            created_at,
          ],
        });
        inserted++;
      } catch (e) {
        if (e.message && e.message.includes("UNIQUE")) {
          skipped++;
        } else {
          console.error(`  ⚠️  Error inserting ${p.name}:`, e.message);
          errors++;
        }
      }
    }

    // Progress update every 500 records
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= profiles.length) {
      console.log(`  ✓ Processed ${Math.min(i + BATCH_SIZE, profiles.length)}/${profiles.length}`);
    }
  }

  console.log(`\n✅  Seeding complete`);
  console.log(`   Inserted : ${inserted}`);
  console.log(`   Skipped  : ${skipped} (already existed)`);
  console.log(`   Errors   : ${errors}`);

  process.exit(0);
}

seed().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
