// Dev utility: makes the engine recognise existing leagues and seeds one real,
// playable gameweek from a free-plan-accessible season (2024).
//
//   node scripts/seed-demo.mjs [leagueId] [round]
//
// - Sets api_league_id=39 / api_season=2024 on every league missing it.
// - Imports the real fixtures for ROUND into a fresh gameweek (status 'predicting').
// Idempotent: re-running replaces the demo gameweek's auto-imported fixtures.

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SR = env.SUPABASE_SERVICE_ROLE_KEY;
const FKEY = env.API_FOOTBALL_KEY;
const SEASON = 2024;
const ROUND = process.argv[3] || "Regular Season - 1";
const API_LEAGUE = 39;

const sh = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const rest = (p, opts = {}) =>
  fetch(`${SUPA}/rest/v1/${p}`, { ...opts, headers: { ...sh, ...(opts.headers || {}) } });
const fapi = (p) =>
  fetch(`https://v3.football.api-sports.io${p}`, { headers: { "x-apisports-key": FKEY } }).then((r) =>
    r.json(),
  );

async function main() {
  // 1. Backfill API config on all leagues.
  await rest("leagues?api_league_id=is.null", {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ api_league_id: API_LEAGUE, api_season: SEASON }),
  });
  console.log("✓ leagues configured (api_league_id=39, season=2024)");

  // 2. Pick target league.
  const leagues = await rest("leagues?select=id,name&order=created_at.asc").then((r) => r.json());
  const leagueId = process.argv[2] || leagues[0]?.id;
  if (!leagueId) throw new Error("no leagues found");
  console.log(`→ target league ${leagueId}`);

  // 3. Fetch real fixtures for the round.
  const fx = await fapi(
    `/fixtures?league=${API_LEAGUE}&season=${SEASON}&round=${encodeURIComponent(ROUND)}`,
  );
  if (!fx.response?.length) throw new Error(`no fixtures: ${JSON.stringify(fx.errors)}`);
  console.log(`✓ API returned ${fx.response.length} fixtures for "${ROUND}"`);

  // 4. Create (or reuse) the gameweek.
  const existing = await rest(
    `gameweeks?league_id=eq.${leagueId}&api_round=eq.${encodeURIComponent(ROUND)}&select=id`,
  ).then((r) => r.json());
  let gwId = existing[0]?.id;
  if (!gwId) {
    const maxRow = await rest(
      `gameweeks?league_id=eq.${leagueId}&select=gw_number&order=gw_number.desc&limit=1`,
    ).then((r) => r.json());
    const gwNumber = (maxRow[0]?.gw_number ?? 0) + 1;
    const created = await rest("gameweeks", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        league_id: leagueId,
        gw_number: gwNumber,
        api_round: ROUND,
        status: "predicting",
        announced_at: new Date().toISOString(),
        opened_at: new Date().toISOString(),
      }),
    }).then((r) => r.json());
    gwId = created[0].id;
    console.log(`✓ created GW${gwNumber} (predicting)`);
  } else {
    await rest(`gameweeks?id=eq.${gwId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "predicting" }),
    });
    console.log(`→ reusing existing GW ${gwId}`);
  }

  // 5. Replace auto-imported fixtures.
  await rest(`fixtures?gameweek_id=eq.${gwId}&external_ref=not.is.null`, { method: "DELETE" });
  const rows = fx.response.map((r) => ({
    gameweek_id: gwId,
    home_team: r.teams.home.name,
    away_team: r.teams.away.name,
    kickoff_at: r.fixture.date,
    external_ref: String(r.fixture.id),
  }));
  const ins = await rest("fixtures", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  console.log(`✓ inserted ${rows.length} fixtures (HTTP ${ins.status})`);
  console.log(`\nDone. Open the league → GW and predict. Lock-in works; admin can Settle.`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
