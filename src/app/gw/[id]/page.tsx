import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { footballConfigured, providerName, supportsFirstScorer } from "@/lib/football";
import {
  addFixture,
  importFixtures,
  setGameweekStatus,
  settleGameweek,
  syncResults,
} from "@/app/actions";
import PredictionGrid, { type ExistingPred, type GridFixture } from "./PredictionGrid";
import Leaderboard, { type Standing } from "./Leaderboard";
import SubmitButton from "@/components/SubmitButton";

export default async function GameweekPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: gw } = await supabase
    .from("gameweeks")
    .select("id, gw_number, status, league_id, api_round, leagues(name, admin_id)")
    .eq("id", id)
    .single();
  if (!gw) notFound();

  const league = gw.leagues as unknown as { name: string; admin_id: string };
  const isAdmin = league.admin_id === user!.id;
  const isOpen = gw.status === "predicting";
  const apiOn = footballConfigured();
  const isFpl = providerName() === "fpl";

  const { data: fixturesData } = await supabase
    .from("fixtures")
    .select("id, home_team, away_team, kickoff_at, home_score, away_score, first_scorer, external_ref")
    .eq("gameweek_id", id)
    .order("kickoff_at", { nullsFirst: false })
    .order("created_at");
  const fixtures = (fixturesData ?? []) as (GridFixture & { external_ref: string | null })[];
  const fixtureIds = fixtures.map((f) => f.id);
  const safeIds = fixtureIds.length ? fixtureIds : ["00000000-0000-0000-0000-000000000000"];
  const hasApiFixtures = fixtures.some((f) => f.external_ref);

  const { data: myPredsData } = await supabase
    .from("predictions")
    .select("fixture_id, pred_home, pred_away, pred_first_scorer, pred_anytime_scorer, chip")
    .eq("user_id", user!.id)
    .in("fixture_id", safeIds);
  const existing = new Map<string, ExistingPred>(
    (myPredsData as ExistingPred[] | null)?.map((p) => [p.fixture_id, p]) ?? [],
  );

  // Initial standings (the client Leaderboard then keeps them live).
  const { data: allPreds } = await supabase
    .from("predictions")
    .select("user_id, points_awarded, chip, metadata, users(display_name, avatar_emoji)")
    .in("fixture_id", safeIds);
  const initialStandings = computeStandings(allPreds ?? []);

  // FPL-style points summary for the header.
  const hasPoints = gw.status === "live" || gw.status === "settled";
  const myPoints = initialStandings.find((s) => s.userId === user!.id)?.points ?? 0;
  const highest = initialStandings[0]?.points ?? 0;
  const average = initialStandings.length
    ? Math.round(initialStandings.reduce((a, s) => a + s.points, 0) / initialStandings.length)
    : 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6">
      <Link href={`/league/${gw.league_id}`} className="text-sm text-[var(--muted)] hover:text-white">
        ← {league.name}
      </Link>

      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Gameweek {gw.gw_number}</h1>
          {gw.api_round && <p className="text-xs text-[var(--muted)]">{gw.api_round}</p>}
        </div>
        <StatusPill status={gw.status} />
      </header>

      {hasPoints && (
        <div className="paper flex items-stretch overflow-hidden">
          <div className="flex flex-1 flex-col items-center justify-center bg-[var(--paper-ink)] px-4 py-4 text-white">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
              Your GW points
            </span>
            <span className="font-display text-4xl font-extrabold leading-none">{myPoints}</span>
          </div>
          <div className="flex flex-1 items-center justify-around px-2 py-4 text-center">
            <div>
              <p className="font-display text-2xl font-extrabold text-[var(--paper-ink)]">{average}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--paper-muted)]">Average</p>
            </div>
            <div className="h-8 w-px bg-[var(--paper-2)]" />
            <div>
              <p className="font-display text-2xl font-extrabold text-[var(--paper-ink)]">{highest}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--paper-muted)]">Highest</p>
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <details className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4" open={fixtures.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Admin controls
          </summary>

          <div className="mt-4 flex flex-col gap-4">
            {/* Data provider */}
            <div className="rounded-xl border border-[var(--line)] p-3">
              <p className="mb-2 text-xs font-semibold text-neutral-300">
                ⚡ {isFpl ? "FPL (free, live PL)" : "API-Football"}
              </p>
              {apiOn ? (
                <div className="flex flex-col gap-2">
                  <form action={importFixtures} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="gw_id" value={gw.id} />
                    <input
                      name="api_round"
                      defaultValue={gw.api_round ?? (isFpl ? "1" : "Regular Season - 1")}
                      placeholder={isFpl ? "Gameweek number, e.g. 12" : "Regular Season - 12"}
                      className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    />
                    <SubmitButton pendingText="Importing…" className="text-sm">
                      Import fixtures
                    </SubmitButton>
                  </form>
                  {hasApiFixtures && (
                    <form action={syncResults}>
                      <input type="hidden" name="gw_id" value={gw.id} />
                      <SubmitButton variant="ghost" pendingText="Syncing…" className="w-full text-sm">
                        🔄 Sync live results &amp; rescore
                      </SubmitButton>
                    </form>
                  )}
                </div>
              ) : (
                <p className="text-xs text-neutral-500">
                  Set <code className="text-neutral-300">API_FOOTBALL_KEY</code> in{" "}
                  <code className="text-neutral-300">.env.local</code> to auto-import fixtures and
                  results. Until then, add fixtures and enter results manually below.
                </p>
              )}
            </div>

            {/* Manual fixture */}
            <form action={addFixture} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="gw_id" value={gw.id} />
              <input
                name="home_team"
                required
                placeholder="Home"
                className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
              <input
                name="away_team"
                required
                placeholder="Away"
                className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
              <SubmitButton variant="ghost" pendingText="Adding…" className="text-sm">
                + Fixture
              </SubmitButton>
            </form>

            {/* Status */}
            <div className="flex flex-wrap gap-2">
              <StatusButton gwId={gw.id} to="predicting" label="Open predictions" />
              <StatusButton gwId={gw.id} to="locked" label="Lock" />
              <StatusButton gwId={gw.id} to="live" label="Mark live" />
            </div>

            {/* Manual settle */}
            {fixtures.length > 0 && (
              <form action={settleGameweek} className="flex flex-col gap-2 rounded-xl border border-[var(--line)] p-3">
                <input type="hidden" name="gw_id" value={gw.id} />
                <p className="text-xs font-semibold text-neutral-300">✍️ Enter results manually &amp; settle</p>
                {fixtures.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 truncate text-right">{f.home_team}</span>
                    <input type="number" min={0} name={`result_home_${f.id}`} defaultValue={f.home_score ?? ""} className="w-10 rounded border border-[var(--line)] bg-[var(--bg)] py-1 text-center" />
                    <span>–</span>
                    <input type="number" min={0} name={`result_away_${f.id}`} defaultValue={f.away_score ?? ""} className="w-10 rounded border border-[var(--line)] bg-[var(--bg)] py-1 text-center" />
                    <span className="flex-1 truncate">{f.away_team}</span>
                    <input name={`result_scorer_${f.id}`} defaultValue={f.first_scorer ?? ""} placeholder="1st scorer" className="w-24 rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1" />
                  </div>
                ))}
                <SubmitButton pendingText="Settling…" className="text-sm">
                  Settle &amp; reveal 🏆
                </SubmitButton>
                <p className="text-[11px] text-[var(--muted)]">Re-running is safe — points recompute from scratch.</p>
              </form>
            )}
          </div>
        </details>
      )}

      {fixtures.length === 0 ? (
        <p className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 text-center text-sm text-neutral-400">
          No fixtures yet.{isAdmin ? " Use Admin controls above to import or add them." : " Check back soon."}
        </p>
      ) : (
        <PredictionGrid
          gwId={gw.id}
          fixtures={fixtures}
          existing={existing}
          isOpen={isOpen}
          showFirstScorer={supportsFirstScorer()}
        />
      )}

      <Leaderboard
        fixtureIds={fixtureIds}
        initial={initialStandings}
        settled={gw.status === "settled"}
      />

      {isFpl && (
        <p className="pt-2 text-center text-[11px] text-[var(--muted)]">
          ⚽ Fixtures &amp; results data provided by the official Fantasy Premier League API
        </p>
      )}
    </main>
  );
}

// Server-side mirror of the client Leaderboard's aggregation (for first paint).
function computeStandings(rows: any[]): Standing[] {
  const map = new Map<string, Standing>();
  for (const r of rows) {
    const u = r.users as { display_name: string; avatar_emoji: string } | null;
    const s =
      map.get(r.user_id) ??
      ({
        userId: r.user_id,
        name: u?.display_name ?? "Player",
        emoji: u?.avatar_emoji ?? "⚽",
        points: 0,
        banker: false,
        goalRush: false,
        legend: false,
      } as Standing);
    s.points += r.points_awarded ?? 0;
    if (r.chip === "banker" && (r.points_awarded ?? 0) > 0) s.banker = true;
    if (r.chip === "goal_rush" && (r.points_awarded ?? 0) > 0) s.goalRush = true;
    if ((r.metadata?.legend ?? 0) > 0) s.legend = true;
    map.set(r.user_id, s);
  }
  return [...map.values()].sort((a, b) => b.points - a.points);
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-neutral-700",
    predicting: "bg-[var(--accent)]",
    locked: "bg-amber-600",
    live: "bg-red-600 animate-pulse",
    settled: "bg-emerald-600",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${map[status]}`}>{status}</span>
  );
}

function StatusButton({ gwId, to, label }: { gwId: string; to: string; label: string }) {
  return (
    <form action={setGameweekStatus}>
      <input type="hidden" name="gw_id" value={gwId} />
      <input type="hidden" name="status" value={to} />
      <SubmitButton variant="ghost" pendingText="…" className="text-sm">
        {label}
      </SubmitButton>
    </form>
  );
}
