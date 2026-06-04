import Link from "next/link";
import type { LeagueStanding } from "@/lib/standings";

// FPL "classic league" table: white surface, purple header, rank + manager + GW + TOT.
export default function StandingsTable({
  standings,
  latestGwNumber,
  leagueId,
}: {
  standings: LeagueStanding[];
  latestGwNumber: number | null;
  leagueId: string;
}) {
  if (!standings.length) {
    return (
      <div className="paper p-6 text-center text-sm text-[var(--paper-muted)]">
        No points yet — standings appear once a gameweek is played.
      </div>
    );
  }

  return (
    <div className="paper">
      <div className="flex items-center justify-between bg-[var(--paper-ink)] px-4 py-3 text-white">
        <span className="font-display text-sm font-extrabold tracking-tight">Standings</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
          Classic league
        </span>
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[2.5rem_1fr_3rem_3.5rem] items-center gap-2 border-b border-[var(--paper-2)] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--paper-muted)]">
        <span>Rank</span>
        <span>Manager</span>
        <span className="text-center">GW{latestGwNumber ?? ""}</span>
        <span className="text-right">Total</span>
      </div>

      <ol>
        {standings.map((s) => (
          <li key={s.userId}>
           <Link
            href={`/league/${leagueId}/manager/${s.userId}`}
            className="grid grid-cols-[2.5rem_1fr_3rem_3.5rem] items-center gap-2 border-b border-[var(--paper-2)] px-4 py-2.5 transition last:border-0 hover:bg-[var(--paper-2)]"
           >
            <span className="flex items-center gap-1">
              <RankBadge rank={s.rank} />
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-lg leading-none">{s.emoji}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-[var(--paper-ink)]">
                  {s.name}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-[var(--paper-muted)]">
                  {s.played} GW{s.played === 1 ? "" : "s"}
                  {s.banker && <span title="Banker hit">🎯</span>}
                  {s.goalRush && <span title="Goal-Rush hit">🔥</span>}
                  {s.legend && <span title="Legend bonus">⭐</span>}
                </span>
              </span>
            </span>
            <span className="text-center text-sm font-semibold tabular-nums text-[var(--paper-muted)]">
              {s.gwPoints}
            </span>
            <span className="flex justify-end">
              <span className="pts-pill px-2 py-1 text-sm">{s.total}</span>
            </span>
           </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
  if (medal) return <span className="text-base">{medal}</span>;
  return <span className="text-sm font-bold tabular-nums text-[var(--paper-muted)]">{rank}</span>;
}
