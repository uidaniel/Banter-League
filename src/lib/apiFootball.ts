// API-Football (v3, api-sports.io) client. Server-only — never import from a client
// component. Returns null/empty gracefully when API_FOOTBALL_KEY is missing so the app
// always falls back to manual entry.

const BASE = "https://v3.football.api-sports.io";

export type ApiFixture = {
  externalRef: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string | null;
};

export type ApiResult = {
  externalRef: string;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
  firstScorer: string | null;
  allScorers: string[];
};

export function apiFootballConfigured() {
  return Boolean(process.env.API_FOOTBALL_KEY);
}

async function call(path: string): Promise<any> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY is not set");
  const res = await fetch(`${BASE}${path}`, {
    headers: { "x-apisports-key": key },
    // Fixtures change rarely within a round; cache 60s to respect rate limits.
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`API-Football ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length) {
    throw new Error(`API-Football: ${JSON.stringify(json.errors)}`);
  }
  return json.response ?? [];
}

/** Fetch all fixtures for a league/season/round (e.g. league 39, season 2024). */
export async function fetchFixturesByRound(
  apiLeagueId: number,
  season: number,
  round: string,
): Promise<ApiFixture[]> {
  const rows = await call(
    `/fixtures?league=${apiLeagueId}&season=${season}&round=${encodeURIComponent(round)}`,
  );
  return rows.map((r: any) => ({
    externalRef: String(r.fixture.id),
    homeTeam: r.teams.home.name,
    awayTeam: r.teams.away.name,
    kickoffAt: r.fixture.date ?? null,
  }));
}

/** List available round labels for a league/season (most recent last). */
export async function fetchRounds(apiLeagueId: number, season: number): Promise<string[]> {
  const rows = await call(`/fixtures/rounds?league=${apiLeagueId}&season=${season}`);
  return rows as string[];
}

/** The round currently in play / next up for a league+season (e.g. 'Regular Season - 12'). */
export async function fetchCurrentRound(
  apiLeagueId: number,
  season: number,
): Promise<string | null> {
  const rows = await call(
    `/fixtures/rounds?league=${apiLeagueId}&season=${season}&current=true`,
  );
  return (rows as string[])[0] ?? null;
}

/** The current season year for a league (e.g. 2024), per API-Football. */
export async function fetchCurrentSeason(apiLeagueId: number): Promise<number | null> {
  const rows = await call(`/leagues?id=${apiLeagueId}&current=true`);
  const seasons = (rows as any[])[0]?.seasons ?? [];
  const current = seasons.find((s: any) => s.current);
  return current?.year ?? null;
}

/** Fetch final scores + first/all goalscorers for a set of fixture refs. */
export async function fetchResults(externalRefs: string[]): Promise<ApiResult[]> {
  const out: ApiResult[] = [];
  for (const ref of externalRefs) {
    const rows = await call(`/fixtures?id=${ref}`);
    const r = rows[0];
    if (!r) continue;
    const finished = ["FT", "AET", "PEN"].includes(r.fixture.status?.short);

    let firstScorer: string | null = null;
    const allScorers: string[] = [];
    if (finished) {
      const events = await call(`/fixtures/events?fixture=${ref}`);
      const goals = (events as any[])
        .filter((e) => e.type === "Goal" && e.detail !== "Missed Penalty")
        .sort(
          (a, b) =>
            (a.time.elapsed + (a.time.extra ?? 0)) - (b.time.elapsed + (b.time.extra ?? 0)),
        );
      for (const g of goals) {
        const name = g.player?.name;
        if (name) {
          allScorers.push(name);
          if (!firstScorer) firstScorer = name;
        }
      }
    }

    out.push({
      externalRef: ref,
      homeScore: r.goals?.home ?? null,
      awayScore: r.goals?.away ?? null,
      finished,
      firstScorer,
      allScorers,
    });
  }
  return out;
}
