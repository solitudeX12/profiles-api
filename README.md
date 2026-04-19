# Profiles API

A REST API that calls three external APIs (Genderize, Agify, Nationalize), classifies names, and persists results in a SQLite database.

---

## Endpoints

### `POST /api/profiles`
Create a new profile. Returns existing profile if the name already exists.

**Request body:**
```json
{ "name": "ella" }
```

**201 Created (new):**
```json
{
  "status": "success",
  "data": {
    "id": "019d...",
    "name": "ella",
    "gender": "female",
    "gender_probability": 0.99,
    "sample_size": 1234,
    "age": 46,
    "age_group": "adult",
    "country_id": "DRC",
    "country_probability": 0.85,
    "created_at": "2026-04-01T12:00:00.000Z"
  }
}
```

**200 OK (already exists):**
```json
{
  "status": "success",
  "message": "Profile already exists",
  "data": { ...existing profile... }
}
```

---

### `GET /api/profiles`
Get all profiles. Supports optional case-insensitive filters:
- `?gender=male`
- `?country_id=NG`
- `?age_group=adult`
- Combinable: `?gender=male&country_id=NG`

**200 OK:**
```json
{
  "status": "success",
  "count": 2,
  "data": [
    { "id": "...", "name": "...", "gender": "male", "age": 25, "age_group": "adult", "country_id": "NG" }
  ]
}
```

---

### `GET /api/profiles/:id`
Get a single profile by UUID.

**200 OK:** Full profile object (same shape as POST response)

**404 Not Found:** `{ "status": "error", "message": "Profile not found" }`

---

### `DELETE /api/profiles/:id`
Delete a profile. Returns `204 No Content` on success.

---

## Classification Rules

| Field | Rule |
|---|---|
| `age_group` | 0–12 → child, 13–19 → teenager, 20–59 → adult, 60+ → senior |
| `country_id` | Country with highest probability from Nationalize |
| `gender_probability` | Direct from Genderize |
| `sample_size` | `count` from Genderize, renamed |

---

## Error Responses

All errors use this shape:
```json
{ "status": "error", "message": "..." }
```

| Code | Trigger |
|---|---|
| 400 | Missing or empty `name` |
| 422 | `name` is not a string |
| 404 | Profile not found |
| 502 | External API returned invalid data |
| 500 | Internal server error |

---

## Local Development

### Prerequisites
- Node.js 18+

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/<your-username>/profiles-api.git
cd profiles-api

# 2. Install dependencies
npm install

# 3. Start the server
npm start
# → Server running on port 3000

# 4. Create a profile
curl -X POST http://localhost:3000/api/profiles \
  -H "Content-Type: application/json" \
  -d '{"name": "ella"}'

# 5. Get all profiles
curl http://localhost:3000/api/profiles

# 6. Filter profiles
curl "http://localhost:3000/api/profiles?gender=female"

# 7. Get one profile (replace <id> with a real UUID)
curl http://localhost:3000/api/profiles/<id>

# 8. Delete a profile
curl -X DELETE http://localhost:3000/api/profiles/<id>
```

---

## Deployment

### Railway (recommended — free tier)

1. Push code to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Select your repo — Railway auto-detects Node.js and runs `npm start`
4. **Settings → Networking → Generate Domain**
5. Your live URL: `https://profiles-api-production.up.railway.app`

> **Important:** Railway's filesystem is ephemeral on free tier restarts.  
> For persistent storage, add a **Persistent Volume** in Railway:
> - Go to your service → **Volumes** → Add a volume mounted at `/data`
> - Set env var `DB_PATH=/data/profiles.db`

### Heroku

```bash
heroku login
heroku create your-app-name
git push heroku main
```

Add a persistent volume or use Heroku Postgres if you need data across restarts.

### Vercel

```bash
npm i -g vercel
vercel
```

---

## Full Test Script

```bash
BASE="http://localhost:3000"

# POST — create profile
curl -s -X POST $BASE/api/profiles \
  -H "Content-Type: application/json" \
  -d '{"name":"john"}' | jq

# POST — duplicate (should return "Profile already exists")
curl -s -X POST $BASE/api/profiles \
  -H "Content-Type: application/json" \
  -d '{"name":"john"}' | jq

# POST — 400 missing name
curl -s -X POST $BASE/api/profiles \
  -H "Content-Type: application/json" \
  -d '{}' | jq

# POST — 422 wrong type
curl -s -X POST $BASE/api/profiles \
  -H "Content-Type: application/json" \
  -d '{"name":123}' | jq

# GET — all profiles
curl -s $BASE/api/profiles | jq

# GET — filter by gender
curl -s "$BASE/api/profiles?gender=male" | jq

# GET — single (replace ID)
curl -s $BASE/api/profiles/<id> | jq

# GET — 404
curl -s $BASE/api/profiles/nonexistent-id | jq

# DELETE
curl -s -X DELETE $BASE/api/profiles/<id> -v
```

---

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express 4
- **Database**: SQLite via `@libsql/client`
- **HTTP client**: Axios
- **ID generation**: UUID v7
- **CORS**: cors middleware + explicit header
