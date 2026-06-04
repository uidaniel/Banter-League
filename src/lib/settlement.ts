import type { SupabaseClient } from "@supabase/supabase-js";
import { scorePrediction } from "@/lib/scoring";

// Recompute every prediction's points for a gameweek from the current fixture results.
// Idempotent — safe to run repeatedly (live sync, manual re-settle, cron). Stores a
// per-prediction breakdown in metadata and applies the lone-exact-score "Legend" (+5).
// Works with any Supabase client (user-scoped or service-role).
export async function recomputeGameweek(
  client: SupabaseClient,
  gwId: string,
  markSettled: boolean,
): Promise<{ scored: number; legends: number }> {
  const { data: fixtures } = await client
    .from("fixtures")
    .select("id, home_score, away_score, first_scorer, all_scorers")
    .eq("gameweek_id", gwId);
  if (!fixtures?.length) return { scored: 0, legends: 0 };
  const fxById = new Map(fixtures.map((f) => [f.id, f]));

  const { data: preds } = await client
    .from("predictions")
    .select(
      "id, user_id, fixture_id, pred_home, pred_away, pred_first_scorer, pred_anytime_scorer, chip",
    )
    .in(
      "fixture_id",
      fixtures.map((f) => f.id),
    );

  const exactByFixture = new Map<string, string[]>();
  const updates: { id: string; points: number | null; meta: object }[] = [];

  for (const p of preds ?? []) {
    const fx = fxById.get(p.fixture_id);
    const score = fx ? scorePrediction(p, fx) : null;
    if (score?.outcomeTier === "exact") {
      exactByFixture.set(p.fixture_id, [...(exactByFixture.get(p.fixture_id) ?? []), p.id]);
    }
    updates.push({
      id: p.id,
      points: score ? score.total : null,
      meta: score ? { ...score, legend: 0 } : {},
    });
  }

  // Lone exact hitter on a fixture → +5 Legend, recorded on that prediction.
  const legendPredIds = new Set<string>();
  for (const ids of exactByFixture.values()) {
    if (ids.length === 1) legendPredIds.add(ids[0]);
  }
  for (const u of updates) {
    if (legendPredIds.has(u.id) && u.points !== null) {
      u.points += 5;
      u.meta = { ...(u.meta as object), legend: 5 };
    }
  }

  for (const u of updates) {
    await client
      .from("predictions")
      .update({ points_awarded: u.points, metadata: u.meta })
      .eq("id", u.id);
  }

  if (markSettled) {
    await client
      .from("gameweeks")
      .update({ status: "settled", settled_at: new Date().toISOString() })
      .eq("id", gwId);
  }

  return { scored: updates.length, legends: legendPredIds.size };
}
