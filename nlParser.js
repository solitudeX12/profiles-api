/**
 * Natural Language Query Parser — Rule-based only, no AI/LLMs
 *
 * Supported keywords:
 * GENDER:     male/males/man/men  |  female/females/woman/women
 * AGE GROUP:  child/children/kid/kids | teenager/teen/teens/adolescent
 *             adult/adults | senior/seniors/elderly
 * AGE RANGE:  young (16-24) | above/over N | below/under N | between N and M
 * COUNTRY:    "from <country>" | "in <country>" | plain country name
 */

const COUNTRY_MAP = {
  "nigeria": "NG", "ghana": "GH", "kenya": "KE", "ethiopia": "ET",
  "tanzania": "TZ", "uganda": "UG", "senegal": "SN", "mali": "ML",
  "niger": "NE", "chad": "TD", "angola": "AO", "mozambique": "MZ",
  "madagascar": "MG", "cameroon": "CM", "ivory coast": "CI",
  "zambia": "ZM", "zimbabwe": "ZW", "malawi": "MW", "rwanda": "RW",
  "benin": "BJ", "burundi": "BI", "togo": "TG", "sierra leone": "SL",
  "libya": "LY", "liberia": "LR", "drc": "CD", "congo": "CG",
  "somalia": "SO", "sudan": "SD", "egypt": "EG", "morocco": "MA",
  "algeria": "DZ", "tunisia": "TN", "south africa": "ZA",
  "namibia": "NA", "botswana": "BW", "lesotho": "LS", "eswatini": "SZ",
  "gabon": "GA", "guinea": "GN", "eritrea": "ER", "djibouti": "DJ",
  "comoros": "KM", "cape verde": "CV", "mauritius": "MU",
  "seychelles": "SC", "gambia": "GM", "burkina faso": "BF",
  "usa": "US", "united states": "US", "america": "US",
  "uk": "GB", "united kingdom": "GB", "britain": "GB", "england": "GB",
  "france": "FR", "germany": "DE", "italy": "IT", "spain": "ES",
  "portugal": "PT", "brazil": "BR", "india": "IN", "china": "CN",
  "japan": "JP", "canada": "CA", "australia": "AU", "mexico": "MX",
  "argentina": "AR", "colombia": "CO", "peru": "PE", "chile": "CL",
  "indonesia": "ID", "pakistan": "PK", "bangladesh": "BD",
  "philippines": "PH", "vietnam": "VN", "thailand": "TH",
  "myanmar": "MM", "malaysia": "MY", "nepal": "NP", "sri lanka": "LK",
};

function parseNaturalLanguage(q) {
  if (!q || q.trim() === "") return null;

  const input = q.toLowerCase().trim();
  const filters = {};
  let matched = false;

  // Gender
  const hasMale   = /\b(male|males|man|men)\b/.test(input);
  const hasFemale = /\b(female|females|woman|women)\b/.test(input);
  const hasBoth   = /\b(male and female|both genders?|all genders?)\b/.test(input);

  if (hasBoth) {
    matched = true; // no gender filter, both included
  } else if (hasMale && !hasFemale) {
    filters.gender = "male";
    matched = true;
  } else if (hasFemale && !hasMale) {
    filters.gender = "female";
    matched = true;
  }

  // Age groups
  if (/\b(child|children|kid|kids)\b/.test(input)) {
    filters.age_group = "child"; matched = true;
  } else if (/\b(teenager|teenagers|teen|teens|adolescent)\b/.test(input)) {
    filters.age_group = "teenager"; matched = true;
  } else if (/\badults?\b/.test(input)) {
    filters.age_group = "adult"; matched = true;
  } else if (/\b(senior|seniors|elderly)\b/.test(input)) {
    filters.age_group = "senior"; matched = true;
  }

  // "young" → 16–24 (parsing only, not a stored age_group)
  if (/\byoung\b/.test(input)) {
    filters.min_age = 16;
    filters.max_age = 24;
    matched = true;
  }

  // "between N and M"
  const betweenMatch = input.match(/between\s+(\d+)\s+and\s+(\d+)/);
  if (betweenMatch) {
    filters.min_age = parseInt(betweenMatch[1]);
    filters.max_age = parseInt(betweenMatch[2]);
    matched = true;
  }

  // "above/over/older than N"
  const aboveMatch = input.match(/\b(?:above|over|older than)\s+(\d+)/);
  if (aboveMatch) {
    filters.min_age = parseInt(aboveMatch[1]);
    matched = true;
  }

  // "below/under/younger than N"
  const belowMatch = input.match(/\b(?:below|under|younger than)\s+(\d+)/);
  if (belowMatch) {
    filters.max_age = parseInt(belowMatch[1]);
    matched = true;
  }

  // Country — try longest names first to avoid partial matches
  const sortedCountries = Object.keys(COUNTRY_MAP).sort((a, b) => b.length - a.length);
  for (const country of sortedCountries) {
    const escaped = country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:from|in)\\s+${escaped}|\\b${escaped}\\b`);
    if (pattern.test(input)) {
      filters.country_id = COUNTRY_MAP[country];
      matched = true;
      break;
    }
  }

  if (!matched) return null;
  return filters;
}

module.exports = { parseNaturalLanguage };
