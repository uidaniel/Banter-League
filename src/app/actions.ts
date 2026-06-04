"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type Chip } from "@/lib/scoring";
import { fetchFixturesByRound, fetchResults, fetchCurrentSeason } from "@/lib/football";
import { recomputeGameweek } from "@/lib/settlement";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncLeague, advanceGameweek } from "@/lib/engine";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function inviteCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export async function updateProfile(formData: FormData) {
  const { supabase, user } = await requireUser();
  const display_name = String(formData.get("display_name") ?? "").trim().slice(0, 40);
  const avatar_emoji = String(formData.get("avatar_emoji") ?? "⚽").trim().slice(0, 4) || "⚽";
  if (!display_name) return;
  await supabase.from("users").update({ display_name, avatar_emoji }).eq("id", user.id);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Leagues
// ---------------------------------------------------------------------------
export async function createLeague(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const code = inviteCode();
  const { data: league, error } = await supabase
    .from("leagues")
    .insert({
      name,
      admin_id: user.id,
      invite_code: code,
      api_league_id: 39, // Premier League default
      api_season: 2024,
    })
    .select("id")
    .single();
  if (error || !league) throw new Error(error?.message ?? "Could not create league");

  await supabase
    .from("league_members")
    .insert({ league_id: league.id, user_id: user.id, role: "admin" });

  revalidatePath("/");
  redirect(`/league/${league.id}`);
}

export async function joinLeague(formData: FormData) {
  const { supabase, user } = await requireUser();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return;

  const { data: league } = await supabase
    .from("leagues")
    .select("id")
    .eq("invite_code", code)
    .single();
  if (!league) throw new Error("No league with that code");

  await supabase
    .from("league_members")
    .insert({ league_id: league.id, user_id: user.id, role: "member" });

  revalidatePath("/");
  redirect(`/league/${league.id}`);
}

// ---------------------------------------------------------------------------
// Automation — manually trigger the engine for one league (the cron runs this
// automatically every ~15 min; this button is for "do it now").
// ---------------------------------------------------------------------------
export async function runSyncNow(formData: FormData) {
  const { supabase, user } = await requireUser();
  const leagueId = String(formData.get("league_id"));

  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, admin_id, api_league_id, api_season, predict_lead_hours")
    .eq("id", leagueId)
    .single();
  if (!league || league.admin_id !== user.id) throw new Error("Not authorized.");

  const admin = createAdminClient();
  await syncLeague(admin, league);

  const { data: gws } = await admin
    .from("gameweeks")
    .select("id, gw_number, status, lock_at")
    .eq("league_id", leagueId)
    .in("status", ["draft", "predicting", "locked", "live"]);
  for (const gw of gws ?? []) {
    await advanceGameweek(admin, gw, league.predict_lead_hours);
  }

  revalidatePath(`/league/${leagueId}`);
}

// ---------------------------------------------------------------------------
// Gameweeks (admin)
// ---------------------------------------------------------------------------
export async function createGameweek(formData: FormData) {
  const { supabase } = await requireUser();
  const leagueId = String(formData.get("league_id"));
  const gwNumber = Number(formData.get("gw_number"));
  const apiRound = String(formData.get("api_round") ?? "").trim() || null;
  if (!leagueId || !gwNumber) return;

  const { error } = await supabase
    .from("gameweeks")
    .insert({ league_id: leagueId, gw_number: gwNumber, status: "draft", api_round: apiRound });
  if (error) throw new Error(error.message);
  revalidatePath(`/league/${leagueId}`);
}

export async function setGameweekStatus(formData: FormData) {
  const { supabase } = await requireUser();
  const gwId = String(formData.get("gw_id"));
  const status = String(formData.get("status"));
  const { error } = await supabase.from("gameweeks").update({ status }).eq("id", gwId);
  if (error) throw new Error(error.message);
  revalidatePath(`/gw/${gwId}`);
}

export async function addFixture(formData: FormData) {
  const { supabase } = await requireUser();
  const gwId = String(formData.get("gw_id"));
  const home = String(formData.get("home_team") ?? "").trim();
  const away = String(formData.get("away_team") ?? "").trim();
  if (!gwId || !home || !away) return;
  const { error } = await supabase
    .from("fixtures")
    .insert({ gameweek_id: gwId, home_team: home, away_team: away });
  if (error) throw new Error(error.message);
  revalidatePath(`/gw/${gwId}`);
}

// ---------------------------------------------------------------------------
// API-Football: import fixtures + sync results (admin)
// ---------------------------------------------------------------------------
export async function importFixtures(formData: FormData) {
  const { supabase } = await requireUser();
  const gwId = String(formData.get("gw_id"));

  // Allow setting/overriding the round in the same step.
  const roundInput = String(formData.get("api_round") ?? "").trim();
  if (roundInput) {
    await supabase.from("gameweeks").update({ api_round: roundInput }).eq("id", gwId);
  }

  const { data: gw } = await supabase
    .from("gameweeks")
    .select("id, api_round, league_id, leagues(api_league_id, api_season)")
    .eq("id", gwId)
    .single();
  const league = gw?.leagues as unknown as { api_league_id: number; api_season: number };
  if (!league?.api_league_id) {
    throw new Error("This league isn't linked to a competition yet (admin → set it up).");
  }
  const round = (gw?.api_round ?? "").trim();
  if (!round || !/\d/.test(round)) {
    throw new Error('Enter a full round, e.g. "Regular Season - 1" (it needs the number).');
  }

  // Resolve the season if it isn't set (API-Football needs it; FPL ignores it).
  let season = league.api_season;
  if (!season) {
    season = (await fetchCurrentSeason(league.api_league_id)) ?? 0;
    if (season) await supabase.from("leagues").update({ api_season: season }).eq("id", gw!.league_id);
  }

  const fixtures = await fetchFixturesByRound(league.api_league_id, season, round);
  if (!fixtures.length) {
    throw new Error(`No fixtures found for "${round}" — check the round name/number.`);
  }

  // Replace any auto-imported fixtures that have no predictions yet, then insert fresh.
  await supabase
    .from("fixtures")
    .delete()
    .eq("gameweek_id", gwId)
    .not("external_ref", "is", null);

  const { error } = await supabase.from("fixtures").insert(
    fixtures.map((f) => ({
      gameweek_id: gwId,
      home_team: f.homeTeam,
      away_team: f.awayTeam,
      kickoff_at: f.kickoffAt,
      external_ref: f.externalRef,
    })),
  );
  if (error) throw new Error(error.message);
  revalidatePath(`/gw/${gwId}`);
}

export async function syncResults(formData: FormData) {
  const { supabase } = await requireUser();
  const gwId = String(formData.get("gw_id"));

  const { data: fixtures } = await supabase
    .from("fixtures")
    .select("id, external_ref")
    .eq("gameweek_id", gwId)
    .not("external_ref", "is", null);

  const refs = (fixtures ?? []).map((f) => f.external_ref as string);
  if (!refs.length) throw new Error("No API-linked fixtures to sync. Import fixtures first.");

  const results = await fetchResults(refs);
  const byRef = new Map(results.map((r) => [r.externalRef, r]));

  for (const f of fixtures ?? []) {
    const r = byRef.get(f.external_ref as string);
    if (!r || !r.finished) continue;
    await supabase
      .from("fixtures")
      .update({
        home_score: r.homeScore,
        away_score: r.awayScore,
        first_scorer: r.firstScorer,
        all_scorers: r.allScorers,
      })
      .eq("id", f.id);
  }

  await recomputeGameweek(supabase, gwId, /* markSettled */ false);
  revalidatePath(`/gw/${gwId}`);
}

// ---------------------------------------------------------------------------
// Predictions (members)
// ---------------------------------------------------------------------------
export async function submitPredictions(formData: FormData) {
  const { supabase, user } = await requireUser();
  const gwId = String(formData.get("gw_id"));

  const { data: gw } = await supabase
    .from("gameweeks")
    .select("id, status")
    .eq("id", gwId)
    .single();
  if (!gw || gw.status !== "predicting") {
    throw new Error("Predictions are closed for this gameweek.");
  }

  const { data: fixtures } = await supabase
    .from("fixtures")
    .select("id")
    .eq("gameweek_id", gwId);
  if (!fixtures?.length) return;

  const rows: Record<string, unknown>[] = [];
  let chipCount = 0;
  for (const f of fixtures) {
    const home = formData.get(`home_${f.id}`);
    const away = formData.get(`away_${f.id}`);
    if (home === null || away === null || home === "" || away === "") continue;
    const chip = (String(formData.get(`chip_${f.id}`) ?? "none") as Chip) || "none";
    if (chip !== "none") chipCount++;
    rows.push({
      user_id: user.id,
      fixture_id: f.id,
      pred_home: Math.max(0, Number(home)),
      pred_away: Math.max(0, Number(away)),
      pred_first_scorer: String(formData.get(`scorer_${f.id}`) ?? "").trim() || null,
      pred_anytime_scorer: String(formData.get(`anytime_${f.id}`) ?? "").trim() || null,
      chip,
      is_banker: chip === "banker",
      updated_at: new Date().toISOString(),
    });
  }

  if (chipCount > 1) throw new Error("You can only play one chip (Banker or Goal-Rush) per gameweek.");
  if (!rows.length) return;

  const { error } = await supabase
    .from("predictions")
    .upsert(rows, { onConflict: "user_id,fixture_id" });
  if (error) throw new Error(error.message);
  revalidatePath(`/gw/${gwId}`);
}

// ---------------------------------------------------------------------------
// Settlement (admin)
// ---------------------------------------------------------------------------
export async function settleGameweek(formData: FormData) {
  const { supabase } = await requireUser();
  const gwId = String(formData.get("gw_id"));

  const { data: fixtures } = await supabase
    .from("fixtures")
    .select("id")
    .eq("gameweek_id", gwId);
  if (!fixtures?.length) throw new Error("No fixtures to settle.");

  // Persist admin-entered results (manual path).
  for (const f of fixtures) {
    const home = formData.get(`result_home_${f.id}`);
    const away = formData.get(`result_away_${f.id}`);
    const scorer = String(formData.get(`result_scorer_${f.id}`) ?? "").trim() || null;
    await supabase
      .from("fixtures")
      .update({
        home_score: home === "" || home === null ? null : Number(home),
        away_score: away === "" || away === null ? null : Number(away),
        first_scorer: scorer,
      })
      .eq("id", f.id);
  }

  await recomputeGameweek(supabase, gwId, /* markSettled */ true);
  revalidatePath(`/gw/${gwId}`);
}
