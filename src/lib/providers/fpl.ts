// Fantasy Premier League official API provider — free, no key, authentic Premier League
// data. Implements the same shape as the API-Football provider so the engine/actions are
// provider-agnostic (see src/lib/football.ts).
//
// Base: https://fantasy.premierleague.com/api/
//   /bootstrap-static/  → teams, players (elements), gameweeks (events)
//   /fixtures/?event=N  → fixtures for gameweek N (with goal stats once played)
//
// KNOWN LIMITATION: FPL's goal stats give *who* scored (and how many) but NOT the order/
// minute — so the accurate output is the anytime-scorer list. First-goalscorer can't be
// reliably derived from this feed, so we leave firstScorer null (no wrong points awarded).

import type { ApiFixture, ApiResult } from "@/lib/apiFootball";

const BASE = "https://fantasy.premierleague.com/api";

type Bootstrap = {
  teams: { id: number; name: string }[];
  elements: { id: number; web_name: string }[];
  events: { id: number; name: string; is_current: boolean; is_next: boolean; finished: boolean }[];
};

type FplFixture = {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  kickoff_time: string | null;
  finished: boolean;
  stats: { identifier: string; h: { value: number; element: number }[]; a: { value: number; element: number }[] }[];
};

async function bootstrap(): Promise<Bootstrap> {
  const res = await fetch(`${BASE}/bootstrap-static/`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`FPL bootstrap ${res.status}`);
  return res.json();
}

async function allFixtures(): Promise<FplFixture[]> {
  const res = await fetch(`${BASE}/fixtures/`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`FPL fixtures ${res.status}`);
  return res.json();
}

// Accept "12", "Gameweek 12", "Regular Season - 12" → 12.
function eventNumber(round: string): number | null {
  const m = round.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

export function fplConfigured(): boolean {
  return true; // no key required
}

/** The current (or next) gameweek number as a string. */
export async function fetchCurrentRound(): Promise<string | null> {
  const b = await bootstrap();
  const ev = b.events.find((e) => e.is_current) ?? b.events.find((e) => e.is_next);
  return ev ? String(ev.id) : null;
}

/** FPL has no notion of a "season year" we need — the feed is always the live season. */
export async function fetchCurrentSeason(): Promise<number | null> {
  return null;
}

export async function fetchFixturesByRound(round: string): Promise<ApiFixture[]> {
  const ev = eventNumber(round);
  if (ev === null) return [];
  const b = await bootstrap();
  const teamName = new Map(b.teams.map((t) => [t.id, t.name]));
  const res = await fetch(`${BASE}/fixtures/?event=${ev}`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`FPL fixtures?event ${res.status}`);
  const fx: FplFixture[] = await res.json();
  return fx.map((f) => ({
    externalRef: String(f.id),
    homeTeam: teamName.get(f.team_h) ?? `Team ${f.team_h}`,
    awayTeam: teamName.get(f.team_a) ?? `Team ${f.team_a}`,
    kickoffAt: f.kickoff_time,
  }));
}

export async function fetchResults(externalRefs: string[]): Promise<ApiResult[]> {
  const b = await bootstrap();
  const playerName = new Map(b.elements.map((e) => [e.id, e.web_name]));
  const all = await allFixtures();
  const byId = new Map(all.map((f) => [String(f.id), f]));

  return externalRefs.map((ref) => {
    const f = byId.get(ref);
    if (!f) {
      return { externalRef: ref, homeScore: null, awayScore: null, finished: false, firstScorer: null, allScorers: [] };
    }
    const goals = f.stats?.find((s) => s.identifier === "goals_scored");
    const allScorers: string[] = [];
    if (goals) {
      for (const side of [goals.h, goals.a]) {
        for (const g of side) {
          const name = playerName.get(g.element);
          if (name) for (let i = 0; i < g.value; i++) allScorers.push(name);
        }
      }
    }
    return {
      externalRef: ref,
      homeScore: f.team_h_score,
      awayScore: f.team_a_score,
      finished: f.finished,
      firstScorer: null, // FPL feed has no goal timing — see file header
      allScorers,
    };
  });
}
