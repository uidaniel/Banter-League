// Premier League club crests via the official FPL badge CDN, keyed by club name.
// Includes the naming variants used by different data providers (FPL short names,
// API-Football full names) plus recently-relegated clubs so historical/demo fixtures
// still resolve. Codes are club-level and stable across seasons.
//
// Update when newly-promoted clubs appear (their FPL `code` is in bootstrap-static).

const CODE: Record<string, number> = {
  arsenal: 3,
  "aston villa": 7,
  burnley: 90,
  bournemouth: 91,
  brentford: 94,
  brighton: 36,
  "brighton & hove albion": 36,
  "brighton and hove albion": 36,
  chelsea: 8,
  "crystal palace": 31,
  everton: 11,
  fulham: 54,
  leeds: 2,
  "leeds united": 2,
  liverpool: 14,
  "man city": 43,
  "manchester city": 43,
  "man utd": 1,
  "manchester united": 1,
  newcastle: 4,
  "newcastle united": 4,
  "nott'm forest": 17,
  "nottingham forest": 17,
  sunderland: 56,
  spurs: 6,
  tottenham: 6,
  "tottenham hotspur": 6,
  "west ham": 21,
  "west ham united": 21,
  wolves: 39,
  "wolverhampton wanderers": 39,
  // recently relegated / historical (for demo + past seasons)
  leicester: 13,
  "leicester city": 13,
  southampton: 20,
  ipswich: 40,
  "ipswich town": 40,
  luton: 102,
  "luton town": 102,
  "sheffield utd": 49,
  "sheffield united": 49,
};

export function crestUrl(team: string): string | null {
  const code = CODE[team.trim().toLowerCase()];
  return code ? `https://resources.premierleague.com/premierleague/badges/70/t${code}.png` : null;
}
