import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePrediction, scoreLegendBonuses } from "./scoring.ts";

const base = { pred_first_scorer: null, chip: "none" as const };

test("exact score = 5", () => {
  const r = scorePrediction(
    { ...base, pred_home: 2, pred_away: 1 },
    { home_score: 2, away_score: 1, first_scorer: null },
  );
  assert.equal(r?.total, 5);
  assert.equal(r?.outcomeTier, "exact");
});

test("goal-difference tier = 3 (predicted 3-1, actual 2-0)", () => {
  const r = scorePrediction(
    { ...base, pred_home: 3, pred_away: 1 },
    { home_score: 2, away_score: 0, first_scorer: null },
  );
  assert.equal(r?.total, 3);
  assert.equal(r?.outcomeTier, "goal_difference");
});

test("correct result only = 2 (right winner, wrong GD)", () => {
  const r = scorePrediction(
    { ...base, pred_home: 3, pred_away: 0 },
    { home_score: 2, away_score: 0, first_scorer: null },
  );
  assert.equal(r?.total, 2);
  assert.equal(r?.outcomeTier, "result");
});

test("the flawed example: 2-0 predicted vs 1-0 actual is NOT a GD bonus", () => {
  // +2 vs +1 — different goal difference, so this is only a correct-result hit.
  const r = scorePrediction(
    { ...base, pred_home: 2, pred_away: 0 },
    { home_score: 1, away_score: 0, first_scorer: null },
  );
  assert.equal(r?.total, 2);
  assert.equal(r?.outcomeTier, "result");
});

test("wrong result = 0", () => {
  const r = scorePrediction(
    { ...base, pred_home: 0, pred_away: 2 },
    { home_score: 2, away_score: 0, first_scorer: null },
  );
  assert.equal(r?.total, 0);
  assert.equal(r?.outcomeTier, "none");
});

test("tiers are mutually exclusive — exact never also pays GD/result", () => {
  const r = scorePrediction(
    { ...base, pred_home: 1, pred_away: 1 },
    { home_score: 1, away_score: 1, first_scorer: null },
  );
  assert.equal(r?.total, 5); // not 5+3+2
});

test("first scorer stacks on outcome, case-insensitive", () => {
  const r = scorePrediction(
    { pred_home: 2, pred_away: 1, pred_first_scorer: "  Haaland ", chip: "none" },
    { home_score: 2, away_score: 1, first_scorer: "haaland" },
  );
  assert.equal(r?.total, 8); // 5 exact + 3 scorer
});

test("anytime scorer (+1) when scorer is in the event list", () => {
  const r = scorePrediction(
    {
      pred_home: 1,
      pred_away: 0,
      pred_first_scorer: null,
      pred_anytime_scorer: "Saka",
      chip: "none",
    },
    { home_score: 2, away_score: 0, first_scorer: "Jesus", all_scorers: ["Jesus", "Saka"] },
  );
  assert.equal(r?.anytimeScorer, 1);
  assert.equal(r?.total, 3); // predicted 1-0 vs actual 2-0 = correct result (2) + anytime (1)
});

test("banker doubles the whole match subtotal", () => {
  const r = scorePrediction(
    { pred_home: 2, pred_away: 1, pred_first_scorer: "Salah", chip: "banker" },
    { home_score: 2, away_score: 1, first_scorer: "Salah" },
  );
  assert.equal(r?.total, 16); // (5 + 3) * 2
  assert.equal(r?.chipDelta, 8);
});

test("is_banker back-compat maps to banker chip", () => {
  const r = scorePrediction(
    { pred_home: 2, pred_away: 1, pred_first_scorer: null, is_banker: true },
    { home_score: 2, away_score: 1, first_scorer: null },
  );
  assert.equal(r?.total, 10); // 5 * 2
});

test("goal-rush hits 3x when 4+ goals", () => {
  const r = scorePrediction(
    { pred_home: 3, pred_away: 1, pred_first_scorer: null, chip: "goal_rush" },
    { home_score: 3, away_score: 1, first_scorer: null }, // 4 goals, exact
  );
  assert.equal(r?.total, 15); // 5 * 3
});

test("goal-rush busts to 0 when under 4 goals (all-or-nothing)", () => {
  const r = scorePrediction(
    { pred_home: 1, pred_away: 0, pred_first_scorer: null, chip: "goal_rush" },
    { home_score: 1, away_score: 0, first_scorer: null }, // exact, but only 1 goal
  );
  assert.equal(r?.total, 0);
});

test("no result yet returns null (idempotent before settlement)", () => {
  const r = scorePrediction(
    { ...base, pred_home: 1, pred_away: 0 },
    { home_score: null, away_score: null, first_scorer: null },
  );
  assert.equal(r, null);
});

test("legend bonus: +5 only to lone exact-score hitter", () => {
  const bonuses = scoreLegendBonuses([
    { fixtureId: "f1", userId: "tunde" }, // lone hitter on f1
    { fixtureId: "f2", userId: "sarah" }, // f2 had two hitters -> no bonus
    { fixtureId: "f2", userId: "bayo" },
  ]);
  assert.equal(bonuses.get("tunde"), 5);
  assert.equal(bonuses.get("sarah"), undefined);
  assert.equal(bonuses.get("bayo"), undefined);
});
