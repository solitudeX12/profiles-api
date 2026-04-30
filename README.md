# Profiles API

A demographic intelligence REST API with advanced filtering, sorting, pagination, and natural language search.

---

## Endpoints

### `POST /api/profiles`
Creates a new profile by calling Genderize, Agify, and Nationalize APIs.
Returns existing profile if name already exists (idempotent).

### `GET /api/profiles`
Returns all profiles with filtering, sorting, and pagination.

**Supported filters:**
| Parameter | Type | Description |
|---|---|---|
| `gender` | string | `male` or `female` (case-insensitive) |
| `age_group` | string | `child`, `teenager`, `adult`, `senior` |
| `country_id` | string | ISO2 code e.g. `NG` |
| `min_age` | number | Minimum age (inclusive) |
| `max_age` | number | Maximum age (inclusive) |
| `min_gender_probability` | float | e.g. `0.8` |
| `min_country_probability` | float | e.g. `0.5` |

**Sorting:** `sort_by=age|created_at|gender_probability` + `order=asc|desc`

**Pagination:** `page=1` (default), `limit=10` (default, max 50)

**Example:**
```
GET /api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc&page=1&limit=10
```

### `GET /api/profiles/search?q=<query>`
Natural language search endpoint. See full documentation below.

### `GET /api/profiles/:id`
Get a single profile by UUID.

### `DELETE /api/profiles/:id`
Delete a profile. Returns 204 No Content.

---

## Natural Language Parsing

### How it works
The parser uses **rule-based pattern matching** (no AI, no LLMs). It scans the query string for specific keywords and maps them to database filters using regular expressions.

### Supported keywords and mappings

**Gender:**
| Keywords | Maps to |
|---|---|
| male, males, man, men | `gender=male` |
| female, females, woman, women | `gender=female` |
| male and female, both genders | no gender filter (returns all) |

**Age groups:**
| Keywords | Maps to |
|---|---|
| child, children, kid, kids | `age_group=child` |
| teenager, teenagers, teen, teens, adolescent | `age_group=teenager` |
| adult, adults | `age_group=adult` |
| senior, seniors, elderly | `age_group=senior` |

**Age ranges:**
| Keywords | Maps to |
|---|---|
| young | `min_age=16, max_age=24` (parsing only — not a stored field) |
| above N, over N, older than N | `min_age=N` |
| below N, under N, younger than N | `max_age=N` |
| between N and M | `min_age=N, max_age=M` |

**Countries:** Matches plain country names — "from nigeria", "in kenya", or just "nigeria" in the query.
Supports ~55 countries including all major African nations and global countries.
Multi-word names like "south africa", "sierra leone", "burkina faso" are supported.
Longer country names are matched before shorter ones to avoid partial collisions (e.g. "guinea" vs "guinea-bissau").

### Example queries
```
young males                          → gender=male, min_age=16, max_age=24
females above 30                     → gender=female, min_age=30
people from nigeria                  → country_id=NG
adult males from kenya               → gender=male, age_group=adult, country_id=KE
male and female teenagers above 17   → age_group=teenager, min_age=17
seniors from ghana                   → age_group=senior, country_id=GH
women below 25                       → gender=female, max_age=25
between 20 and 40                    → min_age=20, max_age=40
```

### Limitations
- **No fuzzy matching** — typos like "nigria" or "malle" won't match
- **No synonym support** — words like "boys", "girls", "guys", "folks" are not recognized
- **Single nationality only** — "from nigeria or ghana" only picks up one country (the first match)
- **"young" is hardcoded to 16–24** — there's no way to change this via the query
- **No numeric age group names** — "people in their 30s" is not supported
- **No negation** — "not from nigeria" is not supported
- **No sorting/ordering via NL** — "sort by age" in a query string is ignored
- **Ambiguous short names** — "guinea" matches Guinea (GN), not Guinea-Bissau (GW); to get Guinea-Bissau, use "guinea-bissau" explicitly
- **Queries with only stopwords** like "people" alone return `Unable to interpret query`

---

## Running locally

```bash
npm install
npm start
# Server on port 3000
```

### Seeding the database

Download the seed JSON file and run:
```bash
node seed.js ./seed.json
```

Re-running is safe — duplicates are ignored.

---

## Deployment (Koyeb — recommended free tier)

1. Push to GitHub
2. Go to koyeb.com → Create App → GitHub
3. Build: `npm install` | Run: `node index.js` | Port: `3000`
4. Add env var: `NODE_ENV=production`

For persistent SQLite across restarts, set `DB_PATH` to a mounted volume path.

---

## Tech Stack
- Node.js 18+ / Express 4
- SQLite via `@libsql/client`
- UUID v7
- Axios for external API calls
