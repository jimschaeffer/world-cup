# World Cup 2026 Draft Pool — Dashboard

A static, no-build dashboard for a salary-cap World Cup draft pool. You enter
match scores into one JSON file; the site auto-computes every team's points and
every entry's leaderboard standing from the official rules (group results,
group-winner bonus, who advances, knockout runs, goals for the tiebreaker).

## Files

| File | What it is | Do you edit it? |
|------|-----------|-----------------|
| `data/teams.json`   | The 48 teams, their groups and salary-cap costs | No (only if the draw/costs change) |
| `data/rosters.json` | Each friend's name + 7 team codes | **Yes — once, before kickoff** |
| `data/results.json` | Match scores as they happen | **No — auto-updated from API-Football** (see below) |
| `data/fixtures.json`| Full group-stage schedule (dates, ET kickoff times, venues) | No (only to tweak times if FIFA moves a match) |
| `assets/logo-white.png` | World Cup 2026 logo shown in the header (`logo.png` is the primary-color variant; `emblem.svg` is the old Wikipedia emblem, kept as a spare) | No |
| `assets/fonts/fifa-26.ttf` | Custom "FIFA 26" display font used for the header title | No |
| `index.html`, `styles.css`, `app.js`, `scoring.js` | The app | No |

The **Schedule** tab shows a "Next up" panel (soonest unplayed matches) plus the
full date-by-date group schedule. As you enter scores in `results.json`, those
fixtures automatically flip to show the final result with the winner bolded, and
drop out of "Next up". Times are US Central (CT).

Team **codes** (e.g. `ESP`, `BRA`, `USA`) are listed in `data/teams.json`.

## Running it locally

Browsers block `fetch()` of local files, so open it through a tiny server:

```powershell
cd "C:\Users\schae\OneDrive\Documents\Websites\wc2026-pool"
py -m http.server 8080      # or: npx serve .
```

Then visit http://localhost:8080 . Refresh after editing any data file.

## Deploying (Netlify)

Drag this folder onto Netlify, or connect the repo. No build command, publish
directory = the folder itself. To update during the tournament: edit
`data/results.json`, commit/push (or re-drag), done.

## Auto-updating results (API-Football)

Scores are pulled automatically — you don't enter them by hand anymore.

- **`scripts/update-results.js`** fetches the tournament's fixtures from
  [API-Football](https://www.api-football.com/) (api-sports.io), maps each team
  to its 3-letter code, and rewrites `data/results.json`. Only **finished**
  matches (FT / AET / PEN) are written, so a live half-played score never lands
  in the file as final.
- **`.github/workflows/update-results.yml`** runs that script on a cron (every
  20 minutes), and commits `data/results.json` whenever it changed. Netlify
  redeploys on the push.

**One-time setup:**

1. Create a free key at api-sports.io.
2. In GitHub: repo **Settings → Secrets and variables → Actions → New repository
   secret**, name it `APISPORTS_KEY`, paste your key.
3. That's it. The workflow also has a **Run workflow** button on the Actions tab
   for an on-demand pull.

**Rate limits:** the free tier allows ~100 requests/day; at one request per run,
the every-20-minutes cron uses ~72/day. Change the `cron:` line in the workflow
to go faster/slower, but keep daily runs under your plan's cap.

**Run it locally** (writes the same file):

```bash
APISPORTS_KEY=your_key node scripts/update-results.js
```

If a team name from the API can't be matched to a code, the script prints a loud
`UNMATCHED` warning and skips that match — add the spelling to the `ALIASES`
table in `scripts/update-results.js` to fix it.

### Manual overrides

`results.json` is regenerated each run, so don't hand-edit `groupResults` or
`knockout` — your edits get overwritten. The two exceptions are `advancedToR32`
(32 codes) and `groupWinners` (12 codes): the script **preserves** whatever's in
those fields, so use them to settle a tie decided by drawing of lots / fair-play
points. Leave them `null` to let the engine auto-compute.

## Manual results format (reference)

The auto-updater writes exactly this shape; documented here for reference.
Open `data/results.json`. Use 3-letter codes for everything.

**Group stage** — add one line per finished match (order doesn't matter):

```json
"groupResults": [
  { "home": "ESP", "away": "URU", "hs": 2, "as": 1 },
  { "home": "MEX", "away": "KOR", "hs": 0, "as": 0 }
]
```

The engine works out the group tables, the group-winner bonus, and which 32
teams advance — automatically — once all 6 matches in a group are entered.

**Knockouts** — fill each round as it's played. Every match needs the two
teams, the score, and the `winner` (the code that advanced; for a penalty
shootout just name the team that went through):

```json
"knockout": {
  "R32": [ { "home": "ESP", "away": "MAR", "hs": 1, "as": 0, "winner": "ESP" } ],
  "R16": [],
  "QF": [],
  "SF": [],
  "third": { "home": "...", "away": "...", "hs": 0, "as": 0, "winner": "..." },
  "final": { "home": "...", "away": "...", "hs": 0, "as": 0, "winner": "..." }
}
```

**Edge cases (rare):** if a group or best-third spot is decided by drawing of
lots / fair-play points rather than the on-pitch numbers, set `groupWinners`
(12 codes) and/or `advancedToR32` (32 codes) to overrule the auto-calc.

## Notes

- The sample roster on the printed rules sheet (Spain, Belgium, Uruguay, Turkey,
  Ecuador, Czechia, DR Congo) actually totals **65**, over the 60 cap. The app
  flags any roster that breaks the cap or isn't exactly 7 teams — handy for
  validating real entries.
- This is an unofficial fan tool, not affiliated with FIFA. The official emblem
  is trademarked; the header uses an original WC26-styled mark rather than the
  protected logo.
