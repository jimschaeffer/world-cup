/* ============================================================================
   WORLD CUP 2026 DRAFT POOL — SCORING ENGINE
   Pure functions: given the team list + raw results, compute every team's
   points and goals, then every roster's total. No DOM here.

   Official scoring (from the rules sheet):
     Group win .................. 3   (per win)
     Group draw ................. 1   (per draw)
     Win your group ............. 3   (bonus, 1st in group)
     Reach Round of 32 .......... 6
     Win in Round of 32 ......... 6
     Win in Round of 16 ......... 9
     Win a Quarter-final ....... 12
     Win a Semi-final .......... 16
     4th place .................. 6
     3rd place ................. 10
     Runner-up ................. 20
     Champion .................. 40
   ========================================================================== */

(function () {

const POINTS = {
  GROUP_WIN: 3,
  GROUP_DRAW: 1,
  GROUP_WINNER: 3,
  REACH_R32: 6,
  WIN_R32: 6,
  WIN_R16: 9,
  WIN_QF: 12,
  WIN_SF: 16,
  FOURTH: 6,
  THIRD: 10,
  RUNNER_UP: 20,
  CHAMPION: 40,
};

// Order of knockout rounds for "how far did they get" logic.
const KO_ORDER = ["R32", "R16", "QF", "SF"];
const ROUND_LABEL = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-final",
  SF: "Semi-final",
};

function emptyStat(team) {
  return {
    code: team.code,
    name: team.name,
    iso: team.iso,
    group: team.group,
    cost: team.cost,
    points: 0,
    goalsFor: 0,
    // group record
    gPts: 0, gGF: 0, gGA: 0, gW: 0, gD: 0, gL: 0, gPlayed: 0,
    advanced: false,
    groupWinner: false,
    reachedR32: false,
    status: "—",
    events: [], // { label, pts }
  };
}

function add(stat, label, pts) {
  stat.points += pts;
  stat.events.push({ label, pts });
}

// Is a match object actually filled in?
function groupPlayed(m) {
  return m && typeof m.hs === "number" && typeof m.as === "number";
}
function koPlayed(m) {
  return m && typeof m.hs === "number" && typeof m.as === "number" && !!m.winner;
}

// FIFA-style group/third-place comparator: points, then goal difference,
// then goals for. (Exact ties fall back to listed order; use overrides for
// lots / fair-play tiebreaks.)
function compareStanding(a, b) {
  if (b.gPts !== a.gPts) return b.gPts - a.gPts;
  const adiff = a.gGF - a.gGA, bdiff = b.gGF - b.gGA;
  if (bdiff !== adiff) return bdiff - adiff;
  if (b.gGF !== a.gGF) return b.gGF - a.gGF;
  return 0;
}

/**
 * Compute per-team statistics from raw results.
 * @returns { byCode, groups, allGroupsComplete }
 */
function computeTeamScores(teams, results) {
  const byCode = {};
  teams.forEach((t) => (byCode[t.code] = emptyStat(t)));

  const get = (code) => {
    if (!byCode[code]) {
      // Unknown code in results — surface loudly rather than silently dropping.
      console.warn("Unknown team code in results.json:", code);
      byCode[code] = emptyStat({ code, name: code, iso: "xx", group: "?", cost: 0 });
    }
    return byCode[code];
  };

  // ---- 1. Group stage matches ----
  (results.groupResults || []).forEach((m) => {
    if (!groupPlayed(m)) return;
    const h = get(m.home), a = get(m.away);
    h.goalsFor += m.hs; a.goalsFor += m.as;
    h.gGF += m.hs; h.gGA += m.as; h.gPlayed++;
    a.gGF += m.as; a.gGA += m.hs; a.gPlayed++;
    if (m.hs > m.as) {
      h.gPts += 3; h.gW++; a.gL++;
      add(h, `Group win vs ${a.name} (${m.hs}–${m.as})`, POINTS.GROUP_WIN);
    } else if (m.hs < m.as) {
      a.gPts += 3; a.gW++; h.gL++;
      add(a, `Group win vs ${h.name} (${m.as}–${m.hs})`, POINTS.GROUP_WIN);
    } else {
      h.gPts += 1; a.gPts += 1; h.gD++; a.gD++;
      add(h, `Group draw vs ${a.name} (${m.hs}–${m.as})`, POINTS.GROUP_DRAW);
      add(a, `Group draw vs ${h.name} (${m.as}–${m.hs})`, POINTS.GROUP_DRAW);
    }
  });

  // ---- 2. Group standings ----
  const groups = {};
  teams.forEach((t) => {
    (groups[t.group] = groups[t.group] || []).push(byCode[t.code]);
  });
  const groupComplete = {};
  const thirds = [];
  Object.keys(groups).forEach((g) => {
    const table = groups[g].slice().sort(compareStanding);
    groups[g] = table;
    // A 4-team group is complete after all 6 round-robin matches are in.
    const played = table.reduce((s, t) => s + t.gPlayed, 0);
    groupComplete[g] = played >= 6;
    if (groupComplete[g]) {
      // Winner bonus
      const w = table[0];
      w.groupWinner = true;
      add(w, `Won Group ${g}`, POINTS.GROUP_WINNER);
      // Top two auto-advance (best thirds handled after all groups done)
      table[0].advanced = true;
      table[1].advanced = true;
      if (table[2]) thirds.push(table[2]);
    }
  });
  const allGroupsComplete = Object.values(groupComplete).every(Boolean) &&
    Object.keys(groupComplete).length === 12;

  // ---- 3. Best third-placed teams (top 8) — only once every group is done ----
  if (allGroupsComplete) {
    thirds.sort(compareStanding).slice(0, 8).forEach((t) => (t.advanced = true));
  }

  // ---- 4. Knockout rounds ----
  const ko = results.knockout || {};

  // Helper to process a list of KO matches for a given round + win value.
  const runRound = (roundKey, winPts) => {
    (ko[roundKey] || []).forEach((m) => {
      if (!koPlayed(m)) return;
      const h = get(m.home), a = get(m.away);
      h.goalsFor += m.hs; a.goalsFor += m.as;
      h.reachedR32 = true; a.reachedR32 = true; // anyone in a KO match reached R32
      const w = get(m.winner);
      add(w, `Won ${ROUND_LABEL[roundKey]} vs ${(w === h ? a : h).name}`, winPts);
    });
  };
  runRound("R32", POINTS.WIN_R32);
  runRound("R16", POINTS.WIN_R16);
  runRound("QF", POINTS.WIN_QF);
  runRound("SF", POINTS.WIN_SF);

  // Third-place playoff
  if (koPlayed(ko.third)) {
    const h = get(ko.third.home), a = get(ko.third.away);
    h.goalsFor += ko.third.hs; a.goalsFor += ko.third.as;
    h.reachedR32 = a.reachedR32 = true;
    const w = get(ko.third.winner);
    const l = w === h ? a : h;
    add(w, "3rd place (won the playoff)", POINTS.THIRD);
    add(l, "4th place (lost the playoff)", POINTS.FOURTH);
  }
  // Final
  if (koPlayed(ko.final)) {
    const h = get(ko.final.home), a = get(ko.final.away);
    h.goalsFor += ko.final.hs; a.goalsFor += ko.final.as;
    h.reachedR32 = a.reachedR32 = true;
    const w = get(ko.final.winner);
    const l = w === h ? a : h;
    add(w, "🏆 Champion", POINTS.CHAMPION);
    add(l, "Runner-up", POINTS.RUNNER_UP);
  }

  // ---- 5. Reach R32 (+6) ----
  // Sources, unioned for robustness:
  //   a) explicit override list, b) anyone appearing in a KO match,
  //   c) computed advancers once all groups are complete.
  const reachSet = new Set();
  if (Array.isArray(results.advancedToR32)) {
    results.advancedToR32.forEach((c) => reachSet.add(c));
  }
  Object.values(byCode).forEach((t) => {
    if (t.reachedR32) reachSet.add(t.code);
    if (t.advanced) reachSet.add(t.code);
  });
  reachSet.forEach((code) => {
    const t = get(code);
    t.advanced = true;
    t.reachedR32 = true;
    add(t, "Reached the Round of 32", POINTS.REACH_R32);
  });

  // ---- 6. Apply group-winner override if provided ----
  if (Array.isArray(results.groupWinners)) {
    // Clear auto winners that conflict, then award overrides.
    // (Only matters in rare lots-decided ties.)
    results.groupWinners.forEach((code) => {
      const t = byCode[code];
      if (t && !t.groupWinner) {
        t.groupWinner = true;
        add(t, `Won Group ${t.group} (commissioner ruling)`, POINTS.GROUP_WINNER);
      }
    });
  }

  // ---- 7. Status label per team ----
  Object.values(byCode).forEach((t) => {
    t.status = deriveStatus(t, ko, groupComplete, allGroupsComplete);
  });

  return { byCode, groups, groupComplete, allGroupsComplete };
}

function teamInKoMatch(code, m) {
  return koPlayed(m) && (m.home === code || m.away === code);
}

function deriveStatus(t, ko, groupComplete, allGroupsComplete) {
  const code = t.code;
  if (koPlayed(ko.final)) {
    if (ko.final.winner === code) return "🏆 Champion";
    if (ko.final.home === code || ko.final.away === code) return "Runner-up";
  }
  if (koPlayed(ko.third)) {
    if (ko.third.winner === code) return "3rd place";
    if (ko.third.home === code || ko.third.away === code) return "4th place";
  }
  // Walk knockout rounds deepest-first to see where they exited.
  for (let i = KO_ORDER.length - 1; i >= 0; i--) {
    const round = KO_ORDER[i];
    const matches = ko[round] || [];
    const m = matches.find((mm) => teamInKoMatch(code, mm));
    if (m) {
      if (m.winner === code) {
        // Won this round; if no deeper round entered yet, they're still alive.
        const next = KO_ORDER[i + 1];
        const advancedFurther = next && (ko[next] || []).some((mm) => teamInKoMatch(code, mm));
        const inFinalPair = koPlayed(ko.final) && (ko.final.home === code || ko.final.away === code);
        const inThird = koPlayed(ko.third) && (ko.third.home === code || ko.third.away === code);
        if (advancedFurther || inFinalPair || inThird) continue; // resolved above/below
        return `Into ${nextRoundName(round)}`;
      }
      return `Out — ${ROUND_LABEL[round]}`;
    }
  }
  // No knockout appearance.
  if (t.reachedR32) return "Into Round of 32";
  if (t.advanced) return "Advanced";
  if (groupComplete[t.group]) return "Out — group stage";
  return t.gPlayed > 0 ? "Group stage" : "Not started";
}

function nextRoundName(round) {
  const idx = KO_ORDER.indexOf(round);
  if (idx === KO_ORDER.length - 1) return "Final"; // won SF
  return ROUND_LABEL[KO_ORDER[idx + 1]];
}

/**
 * Compute roster scores + leaderboard ordering.
 * Tiebreakers: 1) total points, 2) combined goals scored, 3) owns the champion.
 */
function computeRosterScores(rostersData, byCode, results) {
  const cap = rostersData.budgetCap || 60;
  const size = rostersData.rosterSize || 7;
  const champion = results.knockout && koPlayed(results.knockout.final)
    ? results.knockout.final.winner : null;

  const rosters = (rostersData.rosters || []).map((r) => {
    const teams = r.teams.map((code) => byCode[code]).filter(Boolean);
    const points = teams.reduce((s, t) => s + t.points, 0);
    const goalsFor = teams.reduce((s, t) => s + t.goalsFor, 0);
    const spend = teams.reduce((s, t) => s + t.cost, 0);
    const ownsChampion = champion ? r.teams.includes(champion) : false;
    const issues = [];
    if (r.teams.length !== size) issues.push(`${r.teams.length}/${size} teams`);
    if (spend > cap) issues.push(`over cap: ${spend}/${cap}`);
    if (teams.length !== r.teams.length) issues.push("unknown team code");
    return { name: r.name, teamCodes: r.teams, teams, points, goalsFor, spend, ownsChampion, issues, cap, size };
  });

  rosters.sort((a, b) =>
    b.points - a.points ||
    b.goalsFor - a.goalsFor ||
    (b.ownsChampion === a.ownsChampion ? 0 : b.ownsChampion ? 1 : -1)
  );
  // Assign ranks with shared-rank handling.
  let lastKey = null, lastRank = 0;
  rosters.forEach((r, i) => {
    const key = `${r.points}|${r.goalsFor}|${r.ownsChampion}`;
    if (key !== lastKey) { lastRank = i + 1; lastKey = key; }
    r.rank = lastRank;
  });
  return rosters;
}

// Expose for the browser (no module system).
window.WCEngine = { POINTS, computeTeamScores, computeRosterScores, koPlayed };

})();
