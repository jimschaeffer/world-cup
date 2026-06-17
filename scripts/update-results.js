#!/usr/bin/env node
/**
 * Fetch 2026 World Cup results from API-Football (api-sports.io) and rewrite
 * data/results.json in the exact shape the scoring engine expects.
 *
 *   - groupResults: one {home, away, hs, as} per FINISHED group-stage match
 *   - knockout.{R32,R16,QF,SF}: arrays of {home, away, hs, as, winner}
 *   - knockout.third / knockout.final: single {home, away, hs, as, winner} or null
 *
 * Only matches that have actually finished (FT / AET / PEN) are written, so the
 * file never shows a live, half-played score as if it were final — same rule you
 * followed by hand. The override fields advancedToR32 / groupWinners are left as
 * whatever they already are: null normally (engine auto-computes), or a manual
 * array if you set one to settle a drawing-of-lots tie. Those are preserved.
 *
 * Env:
 *   APISPORTS_KEY   (required)  your api-sports.io key
 *   WC_LEAGUE_ID    (optional)  default 1   (API-Football "World Cup")
 *   WC_SEASON       (optional)  default 2026
 *
 * Run:  APISPORTS_KEY=xxxx node scripts/update-results.js
 * Exits 0 and writes the file; exits non-zero (without writing) on API failure.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TEAMS_PATH = path.join(ROOT, "data", "teams.json");
const RESULTS_PATH = path.join(ROOT, "data", "results.json");

const KEY = process.env.APISPORTS_KEY;
const LEAGUE = process.env.WC_LEAGUE_ID || "1";
const SEASON = process.env.WC_SEASON || "2026";

if (!KEY) {
  console.error("APISPORTS_KEY is not set. Aborting without touching results.json.");
  process.exit(1);
}

// ---- Team-name → 3-letter code mapping -------------------------------------
// Base names come from teams.json (single source of truth for the codes). The
// alias table covers the spellings API-Football uses that differ from ours.
const teams = JSON.parse(fs.readFileSync(TEAMS_PATH, "utf8")).teams;

function norm(s) {
  return String(s)
    .normalize("NFD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ""); // drop spaces/punctuation
}

const nameToCode = {};
for (const t of teams) nameToCode[norm(t.name)] = t.code;

// API-Football spellings that don't match our teams.json names verbatim.
// (Curaçao and Cape Verde already match once accents/spaces are stripped.)
const ALIASES = {
  korearepublic: "KOR",
  southkorea: "KOR",
  czechrepublic: "CZE",
  bosniaandherzegovina: "BIH",
  usa: "USA",
  unitedstatesofamerica: "USA",
  turkiye: "TUR",
  cotedivoire: "CIV",
  iriran: "IRN",
  caboverde: "CPV",
  congodr: "COD",
  congodemocraticrepublic: "COD",
  drcongo: "COD",
};
for (const [k, v] of Object.entries(ALIASES)) nameToCode[k] = v;

const unmatched = new Set();
function codeFor(apiName) {
  const code = nameToCode[norm(apiName)];
  if (!code) unmatched.add(apiName);
  return code;
}

// ---- Round label → bucket --------------------------------------------------
function bucketFor(round) {
  const r = norm(round); // e.g. "groupstage1", "roundof32", "3rdplacefinal"
  if (r.startsWith("group")) return "group";
  if (r.includes("roundof32")) return "R32";
  if (r.includes("roundof16")) return "R16";
  if (r.includes("quarter")) return "QF";
  if (r.includes("semi")) return "SF";
  if (r.includes("3rdplace") || r.includes("thirdplace")) return "third";
  if (r.includes("final")) return "final"; // checked last: "3rd place final" caught above
  return null;
}

const FINISHED = new Set(["FT", "AET", "PEN"]);

// ---- Fetch -----------------------------------------------------------------
async function fetchFixtures() {
  const url = `https://v3.football.api-sports.io/fixtures?league=${LEAGUE}&season=${SEASON}`;
  const res = await fetch(url, { headers: { "x-apisports-key": KEY } });
  if (!res.ok) throw new Error(`API-Football HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json();
  if (body.errors && Object.keys(body.errors).length) {
    throw new Error(`API-Football errors: ${JSON.stringify(body.errors)}`);
  }
  if (!Array.isArray(body.response)) throw new Error("Unexpected API response shape");
  return body.response;
}

function build(fixtures) {
  const groupResults = [];
  const knockout = { R32: [], R16: [], QF: [], SF: [], third: null, final: null };

  // Sort by kickoff so arrays are stable/chronological (cosmetic).
  const sorted = [...fixtures].sort((a, b) =>
    String(a.fixture?.date).localeCompare(String(b.fixture?.date))
  );

  for (const fx of sorted) {
    if (!FINISHED.has(fx.fixture?.status?.short)) continue;

    const bucket = bucketFor(fx.league?.round || "");
    if (!bucket) continue;

    const home = codeFor(fx.teams?.home?.name);
    const away = codeFor(fx.teams?.away?.name);
    const hs = fx.goals?.home;
    const as = fx.goals?.away;
    if (!home || !away || typeof hs !== "number" || typeof as !== "number") continue;

    if (bucket === "group") {
      groupResults.push({ home, away, hs, as });
      continue;
    }

    // Knockout: derive the team that advanced.
    let winner;
    if (fx.teams?.home?.winner === true) winner = home;
    else if (fx.teams?.away?.winner === true) winner = away;
    else if (hs > as) winner = home;
    else if (as > hs) winner = away;
    else winner = null; // level + no flag (e.g. shootout result not yet posted)
    if (!winner) continue;

    const match = { home, away, hs, as, winner };
    if (bucket === "third" || bucket === "final") knockout[bucket] = match;
    else knockout[bucket].push(match);
  }

  return { groupResults, knockout };
}

(async () => {
  let fixtures;
  try {
    fixtures = await fetchFixtures();
  } catch (err) {
    console.error("Fetch failed, leaving results.json untouched:\n ", err.message);
    process.exit(1);
  }

  const { groupResults, knockout } = build(fixtures);

  if (unmatched.size) {
    // Loud but non-fatal: a name we couldn't map means a match was silently
    // dropped. Surface it so the alias table can be fixed.
    console.warn("UNMATCHED team names (matches skipped!):", [...unmatched].join(", "));
  }

  // Preserve manual overrides if present; otherwise keep the auto-compute nulls.
  let prev = {};
  try {
    prev = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
  } catch {
    /* first run / missing file is fine */
  }

  // Bump lastUpdated only when the actual results changed, so an idle run
  // produces a byte-identical file (and the workflow commits nothing).
  const core = {
    groupResults,
    advancedToR32: prev.advancedToR32 ?? null,
    groupWinners: prev.groupWinners ?? null,
    knockout,
  };
  const prevCore = {
    groupResults: prev.groupResults ?? null,
    advancedToR32: prev.advancedToR32 ?? null,
    groupWinners: prev.groupWinners ?? null,
    knockout: prev.knockout ?? null,
  };
  const changed = JSON.stringify(core) !== JSON.stringify(prevCore);
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

  const out = {
    _README:
      "AUTO-GENERATED by scripts/update-results.js from API-Football. Manual edits to " +
      "groupResults/knockout will be overwritten on the next run. To override a tie " +
      "decided by lots/fair-play, set advancedToR32 (32 codes) and/or groupWinners (12 codes) " +
      "— those two fields are preserved across runs.",
    lastUpdated: changed ? today : prev.lastUpdated || today,
    ...core,
  };

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(out, null, 2) + "\n");
  const koCount =
    knockout.R32.length +
    knockout.R16.length +
    knockout.QF.length +
    knockout.SF.length +
    (knockout.third ? 1 : 0) +
    (knockout.final ? 1 : 0);
  console.log(`Wrote results.json: ${groupResults.length} group + ${koCount} knockout matches.`);
})();
