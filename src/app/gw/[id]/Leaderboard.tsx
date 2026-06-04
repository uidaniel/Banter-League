"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Standing = {
  userId: string;
  name: string;
  emoji: string;
  points: number;
  banker: boolean;
  goalRush: boolean;
  legend: boolean;
};

type Row = {
  user_id: string;
  points_awarded: number | null;
  chip: string;
  metadata: { legend?: number } | null;
  users: { display_name: string; avatar_emoji: string } | null;
};

function compute(rows: Row[]): Standing[] {
  const map = new Map<string, Standing>();
  for (const r of rows) {
    const s =
      map.get(r.user_id) ??
      ({
        userId: r.user_id,
        name: r.users?.display_name ?? "Player",
        emoji: r.users?.avatar_emoji ?? "⚽",
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

export default function Leaderboard({
  fixtureIds,
  initial,
  settled,
}: {
  fixtureIds: string[];
  initial: Standing[];
  settled: boolean;
}) {
  const [standings, setStandings] = useState<Standing[]>(initial);
  const [revealed, setRevealed] = useState(!settled);

  const refresh = useCallback(async () => {
    if (!fixtureIds.length) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("predictions")
      .select("user_id, points_awarded, chip, metadata, users(display_name, avatar_emoji)")
      .in("fixture_id", fixtureIds);
    if (data) setStandings(compute(data as unknown as Row[]));
  }, [fixtureIds]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`gw-leaderboard-${fixtureIds[0] ?? "none"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "predictions" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fixtureIds, refresh]);

  useEffect(() => {
    if (settled) {
      const t = setTimeout(() => setRevealed(true), 150);
      return () => clearTimeout(t);
    }
  }, [settled]);

  if (!standings.length) return null;
  const [winner, ...rest] = standings;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
        Gameweek leaderboard
        <span className="flex items-center gap-1 text-[10px] font-normal normal-case text-[var(--muted)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" /> live
        </span>
      </h2>

      {/* Winner spotlight */}
      {settled && (
        <div
          className={`animate-float-up overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] p-[1.5px] transition-all duration-700 ${
            revealed ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          }`}
        >
          <div className="rounded-[14px] bg-[var(--card)] p-5 text-center">
            <p className="text-3xl">{winner.emoji} 👑</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">
              Gameweek winner
            </p>
            <p className="font-display text-2xl font-extrabold">{winner.name}</p>
            <p className="font-mono text-lg font-bold text-[var(--accent)]">{winner.points} pts</p>
            <Badges s={winner} center />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="paper">
        {(settled ? rest : standings).map((s, i) => {
          const rank = settled ? i + 2 : i + 1;
          return (
            <div
              key={s.userId}
              style={revealed ? { animationDelay: `${i * 60}ms` } : undefined}
              className={`grid grid-cols-[2rem_1fr_auto] items-center gap-2 border-b border-[var(--paper-2)] px-4 py-2.5 last:border-0 ${
                settled ? "animate-rise" : ""
              }`}
            >
              <span className="text-center text-sm font-bold tabular-nums text-[var(--paper-muted)]">
                {rank}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-lg leading-none">{s.emoji}</span>
                <span className="truncate text-sm font-bold text-[var(--paper-ink)]">{s.name}</span>
                <Badges s={s} />
              </span>
              <span className="pts-pill px-2 py-1 text-sm">{s.points}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Badges({ s, center }: { s: Standing; center?: boolean }) {
  const items = [s.banker && "🎯", s.goalRush && "🔥", s.legend && "⭐"].filter(Boolean) as string[];
  if (!items.length) return null;
  return <span className={center ? "mt-2 block text-lg" : "text-sm"}>{items.join(" ")}</span>;
}
