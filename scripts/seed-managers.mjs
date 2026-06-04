// Dev utility: populate a league with demo "managers" + a fully settled gameweek so the
// FPL-style standings table has realistic data to show. REVERSIBLE — see seed-managers.mjs
// --clean to remove the demo accounts.
//
//   node scripts/seed-managers.mjs <leagueId> [gwNumber=3]
//   node scripts/seed-managers.mjs <leagueId> --clean
//
// Creates ~5 demo users (demoN@banter.local), enters them in the league, fetches the real
// 2024 results for the gameweek's fixtures, generates varied predictions, scores them with
// the same rules as src/lib/scoring.ts, and settles the gameweek.

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL, SR = env.SUPABASE_SERVICE_ROLE_KEY, FKEY = env.API_FOOTBALL_KEY;
const h = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const rest = (p, o = {}) => fetch(`${SUPA}/rest/v1/${p}`, { ...o, headers: { ...h, ...(o.headers || {}) } });
const fapi = (p) => fetch(`https://v3.football.api-sports.io${p}`, { headers: { "x-apisports-key": FKEY } }).then((r) => r.json());

const MANAGERS = [
  { email: "demo1@banter.local", name: "Tunde", emoji: "🦁" },
  { email: "demo2@banter.local", name: "Sarah", emoji: "👑" },
  { email: "demo3@banter.local", name: "Bayo", emoji: "🔥" },
  { email: "demo4@banter.local", name: "Chidi", emoji: "⚡" },
  { email: "demo5@banter.local", name: "Amara", emoji: "🐐" },
];

const leagueId = process.argv[2];
if (!leagueId) { console.error("usage: node scripts/seed-managers.mjs <leagueId> [gwNumber]"); process.exit(1); }
const clean = process.argv.includes("--clean");
const gwNumber = Number(process.argv[3]) || 3;

// --- scoring (mirror of src/lib/scoring.ts) ---
const norm = (s) => (s ?? "").trim().toLowerCase();
function score(p, f) {
  if (f.home_score == null || f.away_score == null) return null;
  let outcome = 0, tier = "none";
  if (p.pred_home === f.home_score && p.pred_away === f.away_score) { outcome = 5; tier = "exact"; }
  else if (p.pred_home - p.pred_away === f.home_score - f.away_score) outcome = 3;
  else if (Math.sign(p.pred_home - p.pred_away) === Math.sign(f.home_score - f.away_score)) outcome = 2;
  const first = f.first_scorer && norm(p.pred_first_scorer) === norm(f.first_scorer) ? 3 : 0;
  const sub = outcome + first;
  let total = sub;
  if (p.chip === "banker") total = sub * 2;
  else if (p.chip === "goal_rush") total = f.home_score + f.away_score >= 4 ? sub * 3 : 0;
  return { total, tier };
}

async function adminAuth(method, path, body) {
  return fetch(`${SUPA}/auth/v1/admin/${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
}

async function findUser(email) {
  const list = await adminAuth("GET", `users?per_page=200`);
  return (list.users || []).find((u) => u.email === email);
}

async function doClean() {
  for (const m of MANAGERS) {
    const u = await findUser(m.email);
    if (u) { await adminAuth("DELETE", `users/${u.id}`); console.log(`removed ${m.email}`); }
  }
  console.log("✓ demo managers removed");
}

async function main() {
  if (clean) return doClean();

  // 1. Ensure demo users exist + profiles set + league membership.
  const ids = [];
  for (const m of MANAGERS) {
    let u = await findUser(m.email);
    if (!u) {
      const created = await adminAuth("POST", "users", { email: m.email, password: "DemoPass123!", email_confirm: true, user_metadata: { display_name: m.name } });
      u = created;
    }
    if (!u?.id) { console.log(`! could not create ${m.email}: ${JSON.stringify(u)}`); continue; }
    ids.push(u.id);
    await rest(`users?id=eq.${u.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ display_name: m.name, avatar_emoji: m.emoji }) });
    await rest("league_members", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ league_id: leagueId, user_id: u.id, role: "member" }) });
  }
  console.log(`✓ ${ids.length} demo managers ready & in league`);

  // 2. Get the gameweek + fixtures.
  const gws = await rest(`gameweeks?league_id=eq.${leagueId}&gw_number=eq.${gwNumber}&select=id`).then((r) => r.json());
  const gwId = gws[0]?.id;
  if (!gwId) throw new Error(`no GW${gwNumber} in league`);
  const fixtures = await rest(`fixtures?gameweek_id=eq.${gwId}&select=id,home_team,away_team,external_ref`).then((r) => r.json());
  if (!fixtures.length) throw new Error("no fixtures — run seed-demo.mjs first");

  // 3. Fetch + store real results for each fixture.
  for (const f of fixtures) {
    if (!f.external_ref) continue;
    const r = await fapi(`/fixtures?id=${f.external_ref}`);
    const row = r.response?.[0];
    if (!row) continue;
    const ev = await fapi(`/fixtures/events?fixture=${f.external_ref}`);
    const goals = (ev.response || []).filter((e) => e.type === "Goal" && e.detail !== "Missed Penalty")
      .sort((a, b) => (a.time.elapsed + (a.time.extra || 0)) - (b.time.elapsed + (b.time.extra || 0)));
    const scorers = goals.map((g) => g.player?.name).filter(Boolean);
    f.home_score = row.goals?.home ?? null; f.away_score = row.goals?.away ?? null;
    f.first_scorer = scorers[0] || null; f.all_scorers = scorers;
    await rest(`fixtures?id=eq.${f.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ home_score: f.home_score, away_score: f.away_score, first_scorer: f.first_scorer, all_scorers: f.all_scorers }) });
  }
  console.log("✓ real results stored");

  // 4. Generate varied predictions + score them, per manager.
  for (const uid of ids) {
    const bankerIdx = Math.floor(Math.random() * fixtures.length);
    const rows = fixtures.map((f, i) => {
      const exact = Math.random() < 0.3;
      const ph = exact ? (f.home_score ?? 1) : Math.floor(Math.random() * 4);
      const pa = exact ? (f.away_score ?? 0) : Math.floor(Math.random() * 3);
      const guessScorer = Math.random() < 0.35 && f.first_scorer ? f.first_scorer : null;
      const chip = i === bankerIdx ? "banker" : "none";
      const p = { pred_home: ph, pred_away: pa, pred_first_scorer: guessScorer, chip };
      const s = score(p, f);
      return { user_id: uid, fixture_id: f.id, pred_home: ph, pred_away: pa, pred_first_scorer: guessScorer,
        chip, is_banker: chip === "banker", points_awarded: s ? s.total : null, metadata: s ? { ...s, legend: 0 } : {} };
    });
    await rest("predictions", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
  }

  // 5. Legend bonus: lone exact-score hitter per fixture (+5).
  const preds = await rest(`predictions?fixture_id=in.(${fixtures.map((f) => f.id).join(",")})&select=id,user_id,fixture_id,pred_home,pred_away,points_awarded,metadata`).then((r) => r.json());
  const fxById = Object.fromEntries(fixtures.map((f) => [f.id, f]));
  const exactByFx = {};
  for (const p of preds) {
    const f = fxById[p.fixture_id];
    if (f && p.pred_home === f.home_score && p.pred_away === f.away_score) (exactByFx[p.fixture_id] ??= []).push(p);
  }
  for (const arr of Object.values(exactByFx)) {
    if (arr.length === 1) {
      const p = arr[0];
      await rest(`predictions?id=eq.${p.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ points_awarded: (p.points_awarded ?? 0) + 5, metadata: { ...(p.metadata || {}), legend: 5 } }) });
    }
  }

  // 6. Settle the gameweek.
  await rest(`gameweeks?id=eq.${gwId}`, { method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "settled", settled_at: new Date().toISOString() }) });
  console.log(`✓ GW${gwNumber} settled — standings are now populated. Open the league page!`);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
