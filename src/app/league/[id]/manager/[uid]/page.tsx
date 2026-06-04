import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLeagueStandings } from "@/lib/standings";
import Crest from "@/components/Crest";

type Fixture = {
  id: string;
  gameweek_id: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  first_scorer: string | null;
};
type Pred = {
  fixture_id: string;
  pred_home: number;
  pred_away: number;
  pred_first_scorer: string | null;
  chip: string;
  points_awarded: number | null;
  metadata: { legend?: number } | null;
};

export default async function ManagerPage({
  params,
}: {
  params: Promise<{ id: string; uid: string }>;
}) {
  const { id, uid } = await params;
  const supabase = await createClient();

  const { data: league } = await supabase.from("leagues").select("id, name").eq("id", id).single();
  const { data: profile } = await supabase
    .from("users")
    .select("display_name, avatar_emoji")
    .eq("id", uid)
    .single();
  if (!league || !profile) notFound();

  const { standings } = await getLeagueStandings(supabase, id);
  const me = standings.find((s) => s.userId === uid);

  const { data: gameweeks } = await supabase
    .from("gameweeks")
    .select("id, gw_number, status")
    .eq("league_id", id)
    .order("gw_number", { ascending: false });
  const gwById = new Map((gameweeks ?? []).map((g) => [g.id, g]));

  const { data: fixturesData } = await supabase
    .from("fixtures")
    .select("id, gameweek_id, home_team, away_team, home_score, away_score, first_scorer")
    .in("gameweek_id", (gameweeks ?? []).map((g) => g.id).length ? (gameweeks ?? []).map((g) => g.id) : ["x"]);
  const fixtures = (fixturesData ?? []) as Fixture[];
  const fxById = new Map(fixtures.map((f) => [f.id, f]));

  const { data: predsData } = await supabase
    .from("predictions")
    .select("fixture_id, pred_home, pred_away, pred_first_scorer, chip, points_awarded, metadata")
    .eq("user_id", uid)
    .in("fixture_id", fixtures.length ? fixtures.map((f) => f.id) : ["x"]);
  const preds = (predsData ?? []) as Pred[];

  // Group this manager's picks by gameweek.
  type GwGroup = { gwNumber: number; status: string; points: number; picks: { p: Pred; f: Fixture }[] };
  const byGw = new Map<string, GwGroup>();
  for (const p of preds) {
    const f = fxById.get(p.fixture_id);
    if (!f) continue;
    const gw = gwById.get(f.gameweek_id);
    if (!gw) continue;
    const entry: GwGroup =
      byGw.get(gw.id) ?? { gwNumber: gw.gw_number, status: gw.status, points: 0, picks: [] };
    entry.points += p.points_awarded ?? 0;
    entry.picks.push({ p, f });
    byGw.set(gw.id, entry);
  }
  const gwGroups = [...byGw.values()].sort((a, b) => b.gwNumber - a.gwNumber);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6">
      <Link href={`/league/${id}`} className="text-sm text-[var(--muted)] hover:text-white">
        ← {league.name}
      </Link>

      {/* Manager header */}
      <div className="paper flex items-center gap-4 p-5">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[var(--paper-2)] text-4xl">
          {profile.avatar_emoji}
        </span>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-extrabold text-[var(--paper-ink)]">
            {profile.display_name}
          </h1>
          <p className="text-sm text-[var(--paper-muted)]">
            {me ? `Rank #${me.rank} · ${me.played} GW${me.played === 1 ? "" : "s"} played` : "No points yet"}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-extrabold text-[var(--paper-ink)]">
            {me?.total ?? 0}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--paper-muted)]">
            Total pts
          </p>
        </div>
      </div>

      {gwGroups.length === 0 ? (
        <p className="card p-6 text-center text-sm text-[var(--muted)]">
          {profile.display_name} hasn&apos;t made any predictions yet.
        </p>
      ) : (
        gwGroups.map((g) => (
          <section key={g.gwNumber} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-extrabold">Gameweek {g.gwNumber}</h2>
              <span className="pts-pill px-2.5 py-1 text-sm">{g.points} pts</span>
            </div>
            <div className="paper">
              {g.picks.map(({ p, f }) => {
                const settled = f.home_score !== null && f.away_score !== null;
                return (
                  <div
                    key={p.fixture_id}
                    className="flex items-center gap-2 border-b border-[var(--paper-2)] px-4 py-2.5 text-sm last:border-0"
                  >
                    <span className="flex flex-1 items-center justify-end gap-1.5 truncate text-right text-[var(--paper-ink)]">
                      <span className="truncate">{f.home_team}</span>
                      <Crest team={f.home_team} size={18} />
                    </span>
                    <span className="rounded-md bg-[var(--paper-2)] px-2 py-1 font-bold tabular-nums text-[var(--paper-ink)]">
                      {p.pred_home}–{p.pred_away}
                    </span>
                    <span className="flex flex-1 items-center gap-1.5 truncate text-[var(--paper-ink)]">
                      <Crest team={f.away_team} size={18} />
                      <span className="truncate">{f.away_team}</span>
                    </span>
                    {p.chip === "banker" && <span title="Banker">🎯</span>}
                    {p.chip === "goal_rush" && <span title="Goal-Rush">🔥</span>}
                    {(p.metadata?.legend ?? 0) > 0 && <span title="Legend">⭐</span>}
                    {settled && (
                      <span className="ml-1 w-14 text-right text-xs text-[var(--paper-muted)]">
                        FT {f.home_score}–{f.away_score}
                      </span>
                    )}
                    <span
                      className={`w-9 text-right font-bold tabular-nums ${
                        (p.points_awarded ?? 0) > 0 ? "text-[#0a8f4f]" : "text-[var(--paper-muted)]"
                      }`}
                    >
                      {settled ? `+${p.points_awarded ?? 0}` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
