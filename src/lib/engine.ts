import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  footballConfigured,
  fetchCurrentRound,
  fetchCurrentSeason,
  fetchFixturesByRound,
  fetchResults,
} from "@/lib/football";
import { recomputeGameweek } from "@/lib/settlement";

// The autonomous gameweek manager. Designed to run every ~15 minutes from a cron.
// Everything here is idempotent and time-driven, so missed runs self-heal on the next tick.

type League = {
  id: string;
  name: string;
  api_league_id: number | null;
  api_season: number | null;
  predict_lead_hours: number;
};

const HOUR = 3600 * 1000;

function roundNumber(round: string): number | null {
  const m = round.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

async function importRoundFixtures(
  admin: SupabaseClient,
  gwId: string,
  league: League,
  season: number,
  round: string,
): Promise<number> {
  const fixtures = await fetchFixturesByRound(league.api_league_id!, season, round);
  if (!fixtures.length) return 0;
  // Refresh only auto-imported fixtures (leave any manual ones untouched).
  await admin.from("fixtures").delete().eq("gameweek_id", gwId).not("external_ref", "is", null);
  await admin.from("fixtures").insert(
    fixtures.map((f) => ({
      gameweek_id: gwId,
      home_team: f.homeTeam,
      away_team: f.awayTeam,
      kickoff_at: f.kickoffAt,
      external_ref: f.externalRef,
    })),
  );
  return fixtures.length;
}

/**
 * Ensure the league's current round exists as a gameweek with fixtures imported.
 * Creates + announces a new gameweek when API-Football rolls to a new round.
 */
export async function syncLeague(admin: SupabaseClient, league: League): Promise<string[]> {
  const logs: string[] = [];
  if (!league.api_league_id) return ["no api_league_id"];

  let season = league.api_season;
  if (!season) {
    season = await fetchCurrentSeason(league.api_league_id);
    if (season) await admin.from("leagues").update({ api_season: season }).eq("id", league.id);
  }
  if (!season) return ["could not resolve season"];

  const round = await fetchCurrentRound(league.api_league_id, season);
  if (!round) return ["no current round"];

  const { data: existing } = await admin
    .from("gameweeks")
    .select("id")
    .eq("league_id", league.id)
    .eq("api_round", round)
    .maybeSingle();

  if (existing) {
    // Top up fixtures if a previously-created GW somehow has none.
    const { count } = await admin
      .from("fixtures")
      .select("id", { count: "exact", head: true })
      .eq("gameweek_id", existing.id);
    if (!count) {
      const n = await importRoundFixtures(admin, existing.id, league, season, round);
      logs.push(`backfilled ${n} fixtures for "${round}"`);
    }
    return logs;
  }

  // New round → create + announce a gameweek.
  let gwNumber = roundNumber(round);
  if (gwNumber === null) {
    const { data: last } = await admin
      .from("gameweeks")
      .select("gw_number")
      .eq("league_id", league.id)
      .order("gw_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    gwNumber = (last?.gw_number ?? 0) + 1;
  }

  const { data: gw, error } = await admin
    .from("gameweeks")
    .insert({
      league_id: league.id,
      gw_number: gwNumber,
      api_round: round,
      status: "draft",
      announced_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !gw) {
    logs.push(`failed to create GW: ${error?.message}`);
    return logs;
  }

  const n = await importRoundFixtures(admin, gw.id, league, season, round);
  logs.push(`created GW ${gwNumber} ("${round}") with ${n} fixtures`);
  return logs;
}

type GwRow = {
  id: string;
  gw_number: number;
  status: string;
  lock_at: string | null;
  predict_lead_hours?: number;
};

/**
 * Drive a single gameweek through its lifecycle based on the wall clock and live results.
 * draft → predicting → live → settled. Idempotent.
 */
export async function advanceGameweek(
  admin: SupabaseClient,
  gw: GwRow,
  leadHours: number,
): Promise<string[]> {
  const logs: string[] = [];
  const now = Date.now();

  const { data: fixtures } = await admin
    .from("fixtures")
    .select("id, kickoff_at, home_score, away_score, external_ref")
    .eq("gameweek_id", gw.id);
  if (!fixtures?.length) return logs;

  const kickoffs = fixtures
    .map((f) => (f.kickoff_at ? new Date(f.kickoff_at).getTime() : null))
    .filter((t): t is number => t !== null);
  const firstKickoff = kickoffs.length ? Math.min(...kickoffs) : null;

  let status = gw.status;

  // 1. Open predictions once we're within the lead window before first kickoff.
  if (status === "draft" && firstKickoff) {
    const openAt = firstKickoff - leadHours * HOUR;
    if (now >= openAt) {
      await admin
        .from("gameweeks")
        .update({
          status: "predicting",
          opened_at: new Date().toISOString(),
          lock_at: new Date(firstKickoff).toISOString(),
        })
        .eq("id", gw.id);
      status = "predicting";
      logs.push(`GW${gw.gw_number}: predictions opened`);
    }
  }

  // 2. Lock + go live at first kickoff.
  if ((status === "predicting" || status === "locked") && firstKickoff && now >= firstKickoff) {
    await admin.from("gameweeks").update({ status: "live" }).eq("id", gw.id);
    status = "live";
    logs.push(`GW${gw.gw_number}: locked & live`);
  }

  // 3. While live, sync results and rescore; settle when every match has finished.
  if (status === "live") {
    const refs = fixtures.map((f) => f.external_ref).filter((r): r is string => !!r);
    if (refs.length) {
      const results = await fetchResults(refs);
      const byRef = new Map(results.map((r) => [r.externalRef, r]));
      for (const f of fixtures) {
        const r = f.external_ref ? byRef.get(f.external_ref) : undefined;
        if (!r || !r.finished) continue;
        await admin
          .from("fixtures")
          .update({
            home_score: r.homeScore,
            away_score: r.awayScore,
            first_scorer: r.firstScorer,
            all_scorers: r.allScorers,
          })
          .eq("id", f.id);
      }
    }
    await admin
      .from("gameweeks")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", gw.id);

    // Re-read fixtures to decide settlement.
    const { data: after } = await admin
      .from("fixtures")
      .select("home_score")
      .eq("gameweek_id", gw.id);
    const allFinished = (after ?? []).every((f) => f.home_score !== null);

    const res = await recomputeGameweek(admin, gw.id, allFinished);
    if (allFinished) {
      logs.push(`GW${gw.gw_number}: SETTLED (${res.scored} preds, ${res.legends} legends)`);
    } else {
      logs.push(`GW${gw.gw_number}: live rescore (${res.scored} preds)`);
    }
  }

  return logs;
}

export type TickSummary = {
  apiConfigured: boolean;
  leagues: number;
  logs: string[];
  errors: string[];
};

/** One scheduler tick: sync + advance every auto-managed league. Writes a job_runs row. */
export async function tickAll(): Promise<TickSummary> {
  const summary: TickSummary = { apiConfigured: footballConfigured(), leagues: 0, logs: [], errors: [] };
  const admin = createAdminClient();

  if (!summary.apiConfigured) {
    summary.errors.push("Football provider not configured — automation idle");
    await admin.from("job_runs").insert({ kind: "tick", ok: false, summary });
    return summary;
  }

  const { data: leagues } = await admin
    .from("leagues")
    .select("id, name, api_league_id, api_season, predict_lead_hours")
    .eq("auto_manage", true)
    .not("api_league_id", "is", null);

  for (const league of (leagues as League[] | null) ?? []) {
    summary.leagues++;
    try {
      const syncLogs = await syncLeague(admin, league);
      summary.logs.push(...syncLogs.map((l) => `[${league.name}] ${l}`));

      const { data: gws } = await admin
        .from("gameweeks")
        .select("id, gw_number, status, lock_at")
        .eq("league_id", league.id)
        .in("status", ["draft", "predicting", "locked", "live"]);

      for (const gw of (gws as GwRow[] | null) ?? []) {
        const logs = await advanceGameweek(admin, gw, league.predict_lead_hours);
        summary.logs.push(...logs.map((l) => `[${league.name}] ${l}`));
      }
    } catch (e) {
      summary.errors.push(`[${league.name}] ${(e as Error).message}`);
    }
  }

  await admin.from("job_runs").insert({ kind: "tick", ok: summary.errors.length === 0, summary });
  return summary;
}
