// Provider-agnostic football data facade. The engine, actions, and pages import from
// HERE, never directly from a specific provider. Switch providers with FOOTBALL_PROVIDER.
//
//   FOOTBALL_PROVIDER=fpl          (default) Fantasy Premier League official API — free,
//                                  no key, live PL season, accurate anytime-scorers.
//   FOOTBALL_PROVIDER=apifootball  API-Football (api-sports.io) — needs API_FOOTBALL_KEY,
//                                  has first-goalscorer timing, multi-league/historical.

import * as af from "@/lib/apiFootball";
import * as fpl from "@/lib/providers/fpl";

export type { ApiFixture, ApiResult } from "@/lib/apiFootball";

const PROVIDER = process.env.FOOTBALL_PROVIDER === "apifootball" ? "apifootball" : "fpl";

export function providerName(): "fpl" | "apifootball" {
  return PROVIDER;
}

export function footballConfigured(): boolean {
  return PROVIDER === "fpl" ? fpl.fplConfigured() : af.apiFootballConfigured();
}

/** True when the provider can resolve the current round on the live season for free. */
export function supportsLiveCurrentSeason(): boolean {
  return PROVIDER === "fpl";
}

/** First-goalscorer needs goal timing — only API-Football provides it. */
export function supportsFirstScorer(): boolean {
  return PROVIDER === "apifootball";
}

export async function fetchCurrentRound(
  apiLeagueId: number,
  season: number,
): Promise<string | null> {
  return PROVIDER === "fpl" ? fpl.fetchCurrentRound() : af.fetchCurrentRound(apiLeagueId, season);
}

export async function fetchCurrentSeason(apiLeagueId: number): Promise<number | null> {
  return PROVIDER === "fpl" ? fpl.fetchCurrentSeason() : af.fetchCurrentSeason(apiLeagueId);
}

export async function fetchFixturesByRound(
  apiLeagueId: number,
  season: number,
  round: string,
): Promise<af.ApiFixture[]> {
  return PROVIDER === "fpl"
    ? fpl.fetchFixturesByRound(round)
    : af.fetchFixturesByRound(apiLeagueId, season, round);
}

export async function fetchResults(externalRefs: string[]): Promise<af.ApiResult[]> {
  return PROVIDER === "fpl" ? fpl.fetchResults(externalRefs) : af.fetchResults(externalRefs);
}
