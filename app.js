/* ============================================================================
   WORLD CUP 2026 DRAFT POOL — UI / RENDERING
   Loads the JSON data files, runs the scoring engine, paints the three tabs.
   ========================================================================== */

const { computeTeamScores, computeRosterScores, koPlayed } = window.WCEngine;

// Order + labels for the cost menu (high → low).
const COST_ORDER = [20, 18, 17, 16, 15, 14, 11, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const SCORING_ROWS = [
  ["Group-stage win", "3", "Per win in the group stage."],
  ["Group-stage draw", "1", "Per draw."],
  ["Win your group", "3", "Bonus for finishing 1st."],
  ["Advance to knockouts", "6", "Reach the Round of 32."],
  ["Win in Round of 32", "6", "Advance to the Round of 16."],
  ["Win in Round of 16", "9", "Advance to the Quarter-finals."],
  ["Win a Quarter-final", "12", "Advance to the Semi-finals."],
  ["Win a Semi-final", "16", "Advance to the Final."],
  ["4th place", "6", "Lose the third-place playoff."],
  ["3rd place", "10", "Win the third-place playoff."],
  ["Runner-up", "20", "Lose the Final."],
  ["Champion", "40", "Win the World Cup."],
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Flag image (flagcdn) — renders consistently on every OS, unlike emoji flags
// which Windows browsers don't support.
const flag = (t) => `<img class="fl" src="https://flagcdn.com/${t.iso}.svg" alt="" loading="lazy" width="28" height="21">`;

async function loadJSON(path) {
  const res = await fetch(path + "?v=" + Date.now()); // cache-bust on refresh
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return res.json();
}

let DATA = {};

async function init() {
  try {
    const [teamsFile, results, rostersData, fixtures] = await Promise.all([
      loadJSON("data/teams.json"),
      loadJSON("data/results.json"),
      loadJSON("data/rosters.json"),
      loadJSON("data/fixtures.json"),
    ]);
    const teams = teamsFile.teams;
    const { byCode, groups, allGroupsComplete } = computeTeamScores(teams, results);
    const rosters = computeRosterScores(rostersData, byCode, results);

    // Map team -> owners (roster names) for the Teams view.
    const owners = {};
    rosters.forEach((r) => r.teamCodes.forEach((c) =>
      (owners[c] = owners[c] || []).push(r.name)));

    DATA = { teams, byCode, groups, rosters, results, rostersData, fixtures, owners, allGroupsComplete };

    paintHeader();
    renderLeaderboard();
    renderSchedule();
    renderTeams();
    renderRules();
    wireTabs();
  } catch (err) {
    document.getElementById("leaderboard").innerHTML =
      `<div class="empty"><div class="big">⚠️</div><p>${esc(err.message)}</p>
       <p class="lb-sub">If you opened the file directly, run it through a local server instead (see README).</p></div>`;
    console.error(err);
  }
}

/* ---------------- Header status ---------------- */
function paintHeader() {
  const { results, byCode } = DATA;
  document.getElementById("updated").textContent =
    "Updated " + (results.lastUpdated || "—");

  const ko = results.knockout || {};
  let phase = "Group stage";
  if (koPlayed(ko.final)) phase = "Tournament complete";
  else if ((ko.SF || []).some(koPlayed)) phase = "Semi-finals";
  else if ((ko.QF || []).some(koPlayed)) phase = "Quarter-finals";
  else if ((ko.R16 || []).some(koPlayed)) phase = "Round of 16";
  else if ((ko.R32 || []).some(koPlayed)) phase = "Round of 32";
  else {
    const anyGroup = Object.values(byCode).some((t) => t.gPlayed > 0);
    phase = anyGroup ? "Group stage" : "Picks locked — awaiting kickoff";
  }
  document.getElementById("phase").textContent = phase;
}

/* ---------------- Leaderboard ---------------- */
function renderLeaderboard() {
  const { rosters, byCode, results } = DATA;
  const champCode = koPlayed(results.knockout?.final) ? results.knockout.final.winner : null;

  const banner = document.getElementById("champion-banner");
  if (champCode && byCode[champCode]) {
    const c = byCode[champCode];
    banner.innerHTML = `<div class="champion-banner">
      <span class="trophy">🏆</span>
      <div><div class="lb-sub" style="color:var(--gold)">World Champion</div>
      <b style="font-size:1.2rem;display:inline-flex;align-items:center;gap:0.4rem">${flag(c)} ${esc(c.name)}</b></div></div>`;
  } else banner.innerHTML = "";

  if (!rosters.length) {
    document.getElementById("leaderboard").innerHTML =
      `<div class="card empty"><div class="big">📝</div><p>No rosters yet. Add entries to <b>data/rosters.json</b>.</p></div>`;
    return;
  }

  const rows = rosters.map((r) => {
    const teams = r.teams.slice().sort((a, b) => b.points - a.points);
    const chips = r.teams.map(() => "").length; // placeholder
    const issues = r.issues.length
      ? `<span class="flag-issue">⚠ ${esc(r.issues.join(" · "))}</span>` : "";
    const champ = r.ownsChampion ? `<span class="star" title="Owns the champion">★</span>` : "";

    const detail = teams.map((t) => `
      <div class="team-chip">
        ${flag(t)}
        <div class="info">
          <div class="tn">${esc(t.name)} ${ownerStatusBadge(t)}</div>
          <div class="ts">Grp ${t.group} · ${t.cost} pts cost · ${t.goalsFor} GF</div>
        </div>
        <div class="tp">${t.points}<small>PTS</small></div>
      </div>`).join("");

    return `
      <div class="lb-row" data-rank="${r.rank}" data-name="${esc(r.name)}">
        <div class="lb-rank">${r.rank}</div>
        <div>
          <div class="lb-name">${esc(r.name)} ${champ}</div>
          <div class="lb-sub">
            <span>⚽ ${r.goalsFor} goals</span>
            <span>💰 ${r.spend}/${r.cap} spent</span>
            ${issues}
            <span class="chev">›</span>
          </div>
        </div>
        <div class="lb-pts"><span class="n">${r.points}</span><span class="u">points</span></div>
      </div>
      <div class="lb-detail">
        <div class="roster-grid">${detail}</div>
      </div>`;
  }).join("");

  document.getElementById("leaderboard").innerHTML = `<div class="card lb">${rows}</div>`;

  // Expand/collapse
  document.querySelectorAll(".lb-row").forEach((row) => {
    row.addEventListener("click", () => {
      row.classList.toggle("open");
      row.nextElementSibling.classList.toggle("show");
    });
  });
}

function ownerStatusBadge(t) {
  const s = t.status;
  let cls = "out";
  if (s.includes("Champion") || s.includes("3rd") || s === "Runner-up") cls = "win";
  else if (s.startsWith("Into") || s === "Advanced") cls = "alive";
  else if (s === "Group stage" || s === "Not started") cls = "";
  return `<span class="statusbadge ${cls}">${esc(s)}</span>`;
}

/* ---------------- Schedule / Upcoming ---------------- */
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DOW[dt.getDay()]} ${MON[m - 1]} ${d}`;
}
function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function renderSchedule() {
  const { fixtures, byCode, results } = DATA;
  const T = (code) => byCode[code] || { name: code, iso: "xx", code };

  // Join group fixtures to results by unordered team pair.
  const resByPair = {};
  (results.groupResults || []).forEach((m) => {
    if (typeof m.hs !== "number") return;
    resByPair[[m.home, m.away].sort().join("|")] = m;
  });

  // Track per-group matchday count.
  const seen = {};
  const fix = fixtures.groupStage.map((f) => {
    seen[f.group] = (seen[f.group] || 0) + 1;
    // Two matches per matchday within a group, so matchday = ceil(occurrence / 2).
    const md = Math.ceil(seen[f.group] / 2);
    const r = resByPair[[f.home, f.away].sort().join("|")];
    let played = false, hs = null, as = null, winner = null;
    if (r) {
      played = true;
      // Orient score to the fixture's home/away.
      [hs, as] = r.home === f.home ? [r.hs, r.as] : [r.as, r.hs];
      winner = hs > as ? f.home : as > hs ? f.away : "draw";
    }
    return { ...f, md, when: `${f.date}T${f.t}`, played, hs, as, winner };
  });

  const today = todayISO();

  // Knockout fixtures with teams + a date set but not yet played — eligible for "Next up".
  const koLabels = {};
  (fixtures.knockoutWindows || []).forEach((w) => (koLabels[w.round] = w.label));
  const koData = results.knockout || {};
  const koUpcoming = [];
  ["R32", "R16", "QF", "SF", "third", "final"].forEach((round) => {
    const arr = round === "third" || round === "final"
      ? (koData[round] ? [koData[round]] : [])
      : (koData[round] || []);
    arr.forEach((m) => {
      if (!m || !m.home || !m.away || !m.date) return;
      if (typeof m.hs === "number" && typeof m.as === "number") return; // already played
      koUpcoming.push({
        ko: true, roundLabel: koLabels[round] || round,
        home: m.home, away: m.away, city: m.city, date: m.date, et: m.et,
        when: `${m.date}T${m.t || String(m.match || 0).padStart(3, "0")}`,
      });
    });
  });

  // ---- Next up: soonest unplayed fixtures (group stage + knockouts) ----
  const upcoming = [...fix.filter((f) => !f.played), ...koUpcoming]
    .sort((a, b) => a.when.localeCompare(b.when)).slice(0, 6);
  const nextCards = upcoming.map((f) => {
    const badge = f.ko
      ? `<span class="grp-badge ko">${esc(f.roundLabel)}</span>`
      : `<span class="grp-badge">Grp ${f.group} · MD${f.md}</span>`;
    const whenText = f.date === today ? "<b class='today-tag'>TODAY</b>" : fmtDate(f.date);
    const timePart = f.et ? ` · ${esc(f.et)} CT` : "";
    return `
    <div class="match-card${f.date === today ? " is-today" : ""}">
      <div class="mc-top">
        ${badge}
        <span class="mc-when">${whenText}${timePart}</span>
      </div>
      <div class="mc-teams">
        <span class="mc-team">${flag(T(f.home))}<span>${esc(T(f.home).name)}</span></span>
        <span class="mc-v">v</span>
        <span class="mc-team right"><span>${esc(T(f.away).name)}</span>${flag(T(f.away))}</span>
      </div>
      <div class="mc-city">📍 ${esc(f.city)}</div>
    </div>`;
  }).join("");

  const nextSection = upcoming.length
    ? `<div class="next-grid">${nextCards}</div>`
    : `<div class="card empty"><div class="big">🏁</div><p>No upcoming matches scheduled right now.</p></div>`;

  // ---- Full schedule grouped by date ----
  const byDate = {};
  fix.forEach((f) => (byDate[f.date] = byDate[f.date] || []).push(f));
  const dayBlocks = Object.keys(byDate).sort().map((date) => {
    const rows = byDate[date].sort((a, b) => a.t.localeCompare(b.t)).map((f) => {
      const score = f.played
        ? `<span class="mr-score">${f.hs}<span class="dash">–</span>${f.as}</span>`
        : `<span class="mr-time">${esc(f.et)}</span>`;
      const hw = f.played && f.winner === f.home ? " winner" : "";
      const aw = f.played && f.winner === f.away ? " winner" : "";
      return `<div class="match-row${f.played ? " done" : ""}">
        <span class="mr-grp">${f.group}</span>
        <span class="mr-side home${hw}">${esc(T(f.home).name)}${flag(T(f.home))}</span>
        ${score}
        <span class="mr-side away${aw}">${flag(T(f.away))}${esc(T(f.away).name)}</span>
        <span class="mr-city">${esc(f.city)}</span>
      </div>`;
    }).join("");
    return `<div class="sched-day">
      <h4>${fmtDate(date)}${date === today ? ' <span class="today-tag">TODAY</span>' : ""}</h4>
      <div class="card day-card">${rows}</div></div>`;
  }).join("");

  // ---- Knockout windows ----
  const ko = results.knockout || {};
  const koList = (fixtures.knockoutWindows || []).map((w) => {
    let matches = [];
    if (w.round === "third" || w.round === "final") {
      if (ko[w.round]) matches = [ko[w.round]];
    } else {
      matches = ko[w.round] || [];
    }
    // Show any match with both teams set — played (score + winner) or upcoming (date + city).
    const set = matches.filter((m) => m && m.home && m.away);
    const tag = w.round === "third" ? "3rd" : w.round === "final" ? "🏆" : w.round;
    const inner = set.length
      ? set.map((m) => {
          const isPlayed = typeof m.hs === "number" && typeof m.as === "number";
          if (isPlayed) {
            const hw = m.winner === m.home ? " winner" : "";
            const aw = m.winner === m.away ? " winner" : "";
            return `<div class="match-row done">
              <span class="mr-grp ko">${tag}</span>
              <span class="mr-side home${hw}">${esc(T(m.home).name)}${flag(T(m.home))}</span>
              <span class="mr-score">${m.hs}<span class="dash">–</span>${m.as}</span>
              <span class="mr-side away${aw}">${flag(T(m.away))}${esc(T(m.away).name)}</span>
              ${m.city ? `<span class="mr-city">${esc(m.city)}</span>` : ""}
            </div>`;
          }
          const when = m.date
            ? (m.date === today ? `<b class="today-tag">TODAY</b>` : fmtDate(m.date))
            : "TBD";
          return `<div class="match-row${m.date === today ? " is-today" : ""}">
            <span class="mr-grp ko">${tag}</span>
            <span class="mr-side home">${esc(T(m.home).name)}${flag(T(m.home))}</span>
            <span class="mr-time">${when}</span>
            <span class="mr-side away">${flag(T(m.away))}${esc(T(m.away).name)}</span>
            ${m.city ? `<span class="mr-city">${esc(m.city)}</span>` : ""}
          </div>`;
        }).join("")
      : `<div class="ko-empty">Matchups set after the previous round.</div>`;
    return `<div class="sched-day">
      <h4>${esc(w.label)} <span class="chip">${esc(w.dates)}</span></h4>
      <div class="card day-card">${inner}</div></div>`;
  }).join("");

  document.getElementById("schedule").innerHTML = `
    <div class="section-title">Next up <span class="chip">${fixtures.timezone}</span></div>
    ${nextSection}
    <div class="section-title">Group stage <span class="st-sub">— full schedule</span></div>
    ${dayBlocks}
    <div class="section-title">Knockout stage</div>
    ${koList}`;
}

/* ---------------- Teams & Groups ---------------- */
function renderTeams() {
  const { groups, owners } = DATA;
  const order = "ABCDEFGHIJKL".split("");
  const cards = order.map((g) => {
    const table = groups[g] || [];
    const rows = table.map((t) => {
      const own = (owners[t.code] || []);
      const ownStr = own.length ? `<span class="owners" title="${esc(own.join(', '))}">●${own.length}</span>` : "";
      const dot = t.advanced ? '<span class="adv-dot" title="Advanced"></span>' : '<span class="out-dot"></span>';
      const gd = t.gGF - t.gGA;
      return `<tr>
        <td class="l"><div class="tm">${dot}${flag(t)}<span>${esc(t.name)}</span> ${ownStr}</div></td>
        <td>${t.gW}-${t.gD}-${t.gL}</td>
        <td>${gd > 0 ? "+" + gd : gd}</td>
        <td class="pool">${t.points}</td>
      </tr>`;
    }).join("");
    return `<div class="card group-card">
      <h3><span class="g">Group ${g}</span></h3>
      <table class="std">
        <thead><tr><th class="l">Team</th><th>W-D-L</th><th>GD</th><th>Pool</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join("");

  document.getElementById("teams").innerHTML = `
    <div class="callout">
      <b>Pool</b> = total points that team has banked for the pool so far.
      <span class="adv-dot"></span> = advanced to the knockouts · <span class="owners">●n</span> = number of entries that own this team.
    </div>
    <div class="groups-grid">${cards}</div>`;
}

/* ---------------- Rules & Cost Menu ---------------- */
function renderRules() {
  const { teams } = DATA;
  const byCost = {};
  teams.forEach((t) => (byCost[t.cost] = byCost[t.cost] || []).push(t));

  const scoreRows = SCORING_ROWS.map((r) => `
    <tr><td>${esc(r[0])}<div class="note">${esc(r[2])}</div></td><td class="pts">+${r[1]}</td></tr>`).join("");

  const costRows = COST_ORDER.filter((c) => byCost[c]).map((c) => {
    const list = byCost[c]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => `${flag(t)}${esc(t.name)}`).join(" · ");
    return `<div class="cost-row"><div class="cost-price">${c}</div><div class="cost-teams">${list}</div></div>`;
  }).join("");

  document.getElementById("rules").innerHTML = `
    <div class="callout">
      Build the best <b>7-team</b> roster you can afford under a <b>60-point salary cap</b>.
      Teams bank points all tournament long. Picks lock at first kickoff — no trades after.
      Highest total when the Final whistle blows wins. <br>
      <b>Tiebreakers:</b> 1) most combined goals scored by your teams · 2) owns the eventual Champion · 3) split the pot.
    </div>
    <div class="rules-grid">
      <div class="card rule-card">
        <h2>Scoring</h2>
        <table class="scoretable"><tbody>${scoreRows}</tbody></table>
        <p class="note" style="margin-top:0.8rem">Winning the Final isn't a separate point — it's captured by Champion (+40) and Runner-up (+20). Penalty-shootout winners are credited with the win.</p>
      </div>
      <div class="card rule-card">
        <h2>Cost Menu</h2>
        <div class="cost-menu">${costRows}</div>
      </div>
    </div>`;
}

/* ---------------- Tabs ---------------- */
function wireTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("is-active"));
      document.getElementById("tab-" + tab.dataset.tab).classList.add("is-active");
    });
  });
}

init();
