import type { SupabaseClient } from "@supabase/supabase-js";

// FPL-style classic-league standings: total points across every gameweek, plus the
// latest gameweek's points, ranked. Used by the league page.

export type LeagueStanding = {
  rank: number;
  userId: string;
  name: string;
  emoji: string;
  total: number;
  gwPoints: number;
  played: number;
  banker: boolean;
  goalRush: boolean;
  legend: boolean;
};

export type StandingsResult = {
  standings: LeagueStanding[];
  latestGwNumber: number | null;
  latestGwSettled: boolean;
};

export async function getLeagueStandings(
  client: SupabaseClient,
  leagueId: string,
): Promise<StandingsResult> {
  const { data: gws } = await client
    .from("gameweeks")
    .select("id, gw_number, status")
    .eq("league_id", leagueId)
    .order("gw_number");
  if (!gws?.length) return { standings: [], latestGwNumber: null, latestGwSettled: false };

  // "Latest" = highest-numbered settled GW if any, else the highest-numbered GW.
  const settled = gws.filter((g) => g.status === "settled");
  const pool = settled.length ? settled : gws;
  const latest = pool.reduce((a, b) => (a.gw_number > b.gw_number ? a : b));

  const { data: fixtures } = await client
    .from("fixtures")
    .select("id, gameweek_id")
    .in(
      "gameweek_id",
      gws.map((g) => g.id),
    );
  const fxToGw = new Map((fixtures ?? []).map((f) => [f.id, f.gameweek_id]));
  const fixtureIds = (fixtures ?? []).map((f) => f.id);

  const { data: preds } = await client
    .from("predictions")
    .select("user_id, fixture_id, points_awarded, chip, metadata, users(display_name, avatar_emoji)")
    .in("fixture_id", fixtureIds.length ? fixtureIds : ["00000000-0000-0000-0000-000000000000"]);

  type Acc = LeagueStanding & { gwSet: Set<string> };
  const map = new Map<string, Acc>();

  for (const p of preds ?? []) {
    const u = p.users as unknown as { display_name: string; avatar_emoji: string } | null;
    const acc =
      map.get(p.user_id) ??
      ({
        rank: 0,
        userId: p.user_id,
        name: u?.display_name ?? "Player",
        emoji: u?.avatar_emoji ?? "⚽",
        total: 0,
        gwPoints: 0,
        played: 0,
        banker: false,
        goalRush: false,
        legend: false,
        gwSet: new Set<string>(),
      } as Acc);

    const pts = p.points_awarded ?? 0;
    acc.total += pts;
    const gwId = fxToGw.get(p.fixture_id);
    if (gwId) acc.gwSet.add(gwId);
    if (gwId === latest.id) acc.gwPoints += pts;
    const meta = p.metadata as { legend?: number } | null;
    if (p.chip === "banker" && pts > 0) acc.banker = true;
    if (p.chip === "goal_rush" && pts > 0) acc.goalRush = true;
    if ((meta?.legend ?? 0) > 0) acc.legend = true;
    map.set(p.user_id, acc);
  }

  const standings = [...map.values()]
    .sort((a, b) => b.total - a.total || b.gwPoints - a.gwPoints)
    .map((s, i) => {
      const { gwSet, ...rest } = s;
      return { ...rest, rank: i + 1, played: gwSet.size } as LeagueStanding;
    });

  return {
    standings,
    latestGwNumber: latest.gw_number,
    latestGwSettled: latest.status === "settled",
  };
}
