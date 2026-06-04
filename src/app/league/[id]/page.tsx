import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createGameweek, runSyncNow } from "@/app/actions";
import SubmitButton from "@/components/SubmitButton";
import { getLeagueStandings } from "@/lib/standings";
import StandingsTable from "./StandingsTable";

const STATUS_LABEL: Record<string, string> = {
  draft: "Upcoming",
  predicting: "Open",
  locked: "Locked",
  live: "Live",
  settled: "Settled",
};

const STATUS_PILL: Record<string, string> = {
  draft: "bg-[var(--line-hi)] text-[var(--text)]",
  predicting: "bg-[var(--accent)] text-[var(--accent-ink)]",
  locked: "bg-amber-500 text-black",
  live: "bg-[var(--magenta)] text-white animate-pulse",
  settled: "bg-[var(--accent-2)] text-[var(--accent-ink)]",
};

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, admin_id, invite_code, auto_manage, api_league_id, api_season")
    .eq("id", id)
    .single();
  if (!league) notFound();

  const isAdmin = league.admin_id === user!.id;

  const { data: gameweeks } = await supabase
    .from("gameweeks")
    .select("id, gw_number, status")
    .eq("league_id", id)
    .order("gw_number", { ascending: false });

  const { count: memberCount } = await supabase
    .from("league_members")
    .select("id", { count: "exact", head: true })
    .eq("league_id", id);

  const { standings, latestGwNumber } = await getLeagueStandings(supabase, id);
  const nextGw = (gameweeks?.[0]?.gw_number ?? 0) + 1;

  // The gameweek to act on: anything open/live, else the most recent.
  const activeGw =
    gameweeks?.find((g) => g.status === "predicting" || g.status === "live") ?? gameweeks?.[0];
  const leader = standings[0];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6">
      <Link href="/app" className="text-sm text-[var(--muted)] hover:text-white">
        ← All leagues
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-extrabold tracking-tight">{league.name}</h1>
          {league.auto_manage && (
            <span className="rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--accent-ink)]">
              ⚡ Auto
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {memberCount ?? 0} player{memberCount === 1 ? "" : "s"}
          {leader && (
            <>
              {" · "}Leader <span className="font-semibold text-[var(--text)]">{leader.emoji} {leader.name}</span>
            </>
          )}{" "}
          · Code <span className="font-mono font-semibold text-[var(--accent)]">{league.invite_code}</span>
        </p>
      </header>

      {/* Active gameweek CTA */}
      {activeGw && (
        <Link
          href={`/gw/${activeGw.id}`}
          className="card flex items-center justify-between p-4 transition hover:border-[var(--accent)]"
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Gameweek {activeGw.gw_number}
            </p>
            <p className="font-display text-lg font-extrabold">
              {activeGw.status === "predicting"
                ? "Predictions are open"
                : activeGw.status === "live"
                  ? "Live now"
                  : STATUS_LABEL[activeGw.status]}
            </p>
          </div>
          <span className={`rounded-lg px-3 py-2 text-sm font-bold ${activeGw.status === "predicting" ? "btn-primary" : "border border-[var(--line-hi)]"}`}>
            {activeGw.status === "predicting" ? "Predict →" : "View →"}
          </span>
        </Link>
      )}

      {/* Standings — the centrepiece */}
      <StandingsTable standings={standings} latestGwNumber={latestGwNumber} leagueId={league.id} />

      {/* Gameweek history */}
      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Gameweeks</h2>
        <div className="grid gap-2">
          {gameweeks?.length ? (
            gameweeks.map((gw) => (
              <Link
                key={gw.id}
                href={`/gw/${gw.id}`}
                className="card flex items-center justify-between px-4 py-3 transition hover:border-[var(--accent)]"
              >
                <span className="font-semibold">Gameweek {gw.gw_number}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_PILL[gw.status]}`}>
                  {STATUS_LABEL[gw.status]}
                </span>
              </Link>
            ))
          ) : (
            <p className="card p-6 text-sm text-[var(--muted)]">No gameweeks yet.</p>
          )}
        </div>
      </section>

      {/* Admin */}
      {isAdmin && (
        <details className="card p-4">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
            Admin
          </summary>
          <p className="mt-3 text-sm text-[var(--muted)]">
            {league.auto_manage
              ? `Auto-managed from API-Football (league ${league.api_league_id ?? "—"}, season ${league.api_season ?? "auto"}).`
              : "Auto-management is off."}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <form action={runSyncNow}>
              <input type="hidden" name="league_id" value={league.id} />
              <SubmitButton pendingText="Syncing…" className="text-sm">⚡ Run sync now</SubmitButton>
            </form>
            <form action={createGameweek} className="flex items-end gap-2">
              <input type="hidden" name="league_id" value={league.id} />
              <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
                Manual GW #
                <input name="gw_number" type="number" min={1} defaultValue={nextGw} className="field w-20 px-2 py-1.5 text-sm" />
              </label>
              <SubmitButton variant="ghost" pendingText="Adding…" className="text-sm">Add</SubmitButton>
            </form>
          </div>
        </details>
      )}
    </main>
  );
}
