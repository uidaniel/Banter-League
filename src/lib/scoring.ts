// Pure scoring logic — no framework, no DB. The single source of truth for points.
// Layered model (see PRD §4.B):
//   1. Match-outcome tier  — mutually exclusive: exact > goal-difference > result
//   2. Scorer props        — first scorer (+3), anytime scorer (+1)  [needs event data]
//   3. Chip                — banker (×2) OR goal-rush (×3, all-or-nothing on 4+ goals)
// Social/odds bonuses (anti-sheep legend, underdog) are group-relative and live in a
// separate pass — see scoreGroupBonuses() below.
//
// Kept framework-free so it's unit-tested (scoring.test.ts) and reused unchanged when
// manual result entry becomes API-Football auto-sync (Phase 2).

export const POINTS = {
  EXACT_SCORE: 5,
  GOAL_DIFFERENCE: 3,
  CORRECT_RESULT: 2,
  FIRST_SCORER: 3,
  ANYTIME_SCORER: 1,
  LEGEND_BONUS: 5, // lone correct exact score in the group (anti-sheep)
} as const;

export const CHIP_MULTIPLIER = {
  banker: 2,
  goal_rush: 3, // all-or-nothing: 0 unless total goals >= GOAL_RUSH_THRESHOLD
} as const;

export const GOAL_RUSH_THRESHOLD = 4;

export type Chip = "none" | "banker" | "goal_rush";

export type FixtureResult = {
  home_score: number | null;
  away_score: number | null;
  first_scorer: string | null;
  /** All goalscorers, for anytime-scorer props. Populated from match events (Phase 2). */
  all_scorers?: string[] | null;
};

export type Prediction = {
  pred_home: number;
  pred_away: number;
  pred_first_scorer: string | null;
  /** Optional anytime-scorer pick (Phase 2). */
  pred_anytime_scorer?: string | null;
  /** Preferred chip field. Falls back to is_banker for back-compat. */
  chip?: Chip;
  is_banker?: boolean;
};

export type ScoreBreakdown = {
  outcome: number; // the single winning outcome tier (exact | gd | result | 0)
  outcomeTier: "exact" | "goal_difference" | "result" | "none";
  firstScorer: number;
  anytimeScorer: number;
  chip: Chip;
  chipDelta: number; // points added/removed by the chip vs the raw subtotal
  total: number;
};

const sign = (a: number, b: number) => Math.sign(a - b); // 1 home, -1 away, 0 draw
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function resolveChip(pred: Prediction): Chip {
  if (pred.chip) return pred.chip;
  return pred.is_banker ? "banker" : "none";
}

/**
 * Score one prediction against one fixture result.
 * Returns null if the fixture has no result yet (not finished) — safe before settlement.
 * Deterministic and idempotent — safe to re-run during re-settlement.
 */
export function scorePrediction(
  pred: Prediction,
  fixture: FixtureResult,
): ScoreBreakdown | null {
  if (fixture.home_score === null || fixture.away_score === null) return null;

  // 1. Match-outcome tier — mutually exclusive, highest wins (no double counting).
  let outcome = 0;
  let outcomeTier: ScoreBreakdown["outcomeTier"] = "none";
  if (pred.pred_home === fixture.home_score && pred.pred_away === fixture.away_score) {
    outcome = POINTS.EXACT_SCORE;
    outcomeTier = "exact";
  } else if (
    pred.pred_home - pred.pred_away === fixture.home_score - fixture.away_score
  ) {
    // Same signed goal difference (e.g. predicted 3-1, actual 2-0). Implies correct result.
    outcome = POINTS.GOAL_DIFFERENCE;
    outcomeTier = "goal_difference";
  } else if (sign(pred.pred_home, pred.pred_away) === sign(fixture.home_score, fixture.away_score)) {
    outcome = POINTS.CORRECT_RESULT;
    outcomeTier = "result";
  }

  // 2. Scorer props.
  const firstScorer =
    fixture.first_scorer && norm(pred.pred_first_scorer) === norm(fixture.first_scorer)
      ? POINTS.FIRST_SCORER
      : 0;

  const scorers = (fixture.all_scorers ?? []).map(norm);
  const anytimeScorer =
    pred.pred_anytime_scorer && scorers.includes(norm(pred.pred_anytime_scorer))
      ? POINTS.ANYTIME_SCORER
      : 0;

  const subtotal = outcome + firstScorer + anytimeScorer;

  // 3. Chip.
  const chip = resolveChip(pred);
  let total = subtotal;
  if (chip === "banker") {
    total = subtotal * CHIP_MULTIPLIER.banker;
  } else if (chip === "goal_rush") {
    const totalGoals = fixture.home_score + fixture.away_score;
    total = totalGoals >= GOAL_RUSH_THRESHOLD ? subtotal * CHIP_MULTIPLIER.goal_rush : 0;
  }

  return {
    outcome,
    outcomeTier,
    firstScorer,
    anytimeScorer,
    chip,
    chipDelta: total - subtotal,
    total,
  };
}

/**
 * Group-relative bonuses, applied AFTER everyone's base scores are known.
 * Anti-sheep "Legend": +5 to a user who is the ONLY one in the group to nail the exact
 * score of a fixture. Returns a map of userId -> bonus points to add.
 *
 * NOTE: Crowd-Surfer (reward majority agreement) is intentionally omitted — it rewards
 * group-think and flattens the leaderboard, working against the banter the product wants.
 */
export function scoreLegendBonuses(
  fixtureExactHitters: { fixtureId: string; userId: string }[],
): Map<string, number> {
  const byFixture = new Map<string, string[]>();
  for (const { fixtureId, userId } of fixtureExactHitters) {
    byFixture.set(fixtureId, [...(byFixture.get(fixtureId) ?? []), userId]);
  }
  const bonuses = new Map<string, number>();
  for (const hitters of byFixture.values()) {
    if (hitters.length === 1) {
      const u = hitters[0];
      bonuses.set(u, (bonuses.get(u) ?? 0) + POINTS.LEGEND_BONUS);
    }
  }
  return bonuses;
}
