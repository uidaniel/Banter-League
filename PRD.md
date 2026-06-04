# PRD: Banter League (v2 — Corrected)

> **What changed from v1 (MatchDay OS):** This revision keeps the vision but fixes the
> things that would have killed the project — the gambling/regulatory exposure, the
> FFmpeg-on-Edge-Functions architecture bug, the cost reality of WhatsApp messaging,
> the incomplete schema, and a roadmap that proved the *money* before it proved the
> *loop*. The new sequencing proves the loop first.

---

## 1. Product Vision

Banter League is a high-frequency football **prediction game for group chats**. It turns
a dormant WhatsApp group into a weekly prediction arena built around the Premier League
Gameweek — the trash talk is the product, the leaderboard is the engine.

**Strategic principle:** the business only exists if a real group logs in every Friday
*without being nagged*. Everything else (money, video, bots) is downstream of that. We
build to prove the loop, not the pot.

---

## 2. The Core Loop ("The Sprint")

The cycle is tied to one Premier League Gameweek (GW):

| Day | Event |
| :-- | :-- |
| Tue | Upcoming GW fixtures announced |
| Fri | Prediction window **opens** (web dashboard) |
| Sat/Sun | Matches play; window **locks** at first kickoff; live score updates |
| Mon | Settlement + leaderboard reveal |

A GW moves through statuses: `draft → predicting → locked → live → settled`.

---

## 3. ⚠️ Regulatory Reality (read before building money features)

Pooled entry fees + prizes + a platform rake = **gambling**, regardless of the
"skill-based" framing. Paystack and Stripe both have explicit gaming/betting policies and
will freeze a generic merchant account that does this quietly. In Nigeria this is the
National Lottery Regulatory Commission's jurisdiction.

**Decision: v1 ships Free-to-Play only.** No cash in, no cash out, no rake. This removes
all regulatory friction and lets us validate engagement immediately. Money Sprints are a
**post-validation** track with one of three structures to be chosen later:

1. **Free-to-Play forever** (bragging rights) — default, zero friction.
2. **Money, but we never custody the pot** — licensed-operator partnership or a flow
   where funds never pool in our account.
3. **Get licensed** — months, expensive; only if 1–2 prove demand.

Affiliate betting links are **dropped from v1** (they compound the compliance problem and
sit next to people about to spend money).

---

## 4. Feature Set

### A. League Infrastructure
- **League**: a container owned by an admin, joined via invite code.
- **Membership**: many users per league (`league_members`).
- **v1 type**: Free-to-Play only. (`type` column exists, gated to `free` in v1.)

### B. Prediction & Scoring Engine
A **layered** model: a simple base for casual players, pro depth for the obsessed, and
chips for strategy. Implemented in [src/lib/scoring.ts](src/lib/scoring.ts).

**Tier 1 — Match outcome (mutually exclusive, highest tier wins, no double-counting):**

| Outcome | Points |
| :-- | :-- |
| Exact score | 5 |
| Correct **goal difference** (signed; e.g. predicted 3–1, actual 2–0) | 3 |
| Correct result (W/D/L) only | 2 |

> Precedence matters: exact **>** goal-difference **>** result. The GD tier requires the
> *signed* goal difference to match — predicted 2–0 vs actual 1–0 (+2 vs +1) is **not** a
> GD hit, only a correct result.

**Tier 2 — Scorer props (stack on Tier 1; need match-event data → Phase 2):**

| Prop | Points |
| :-- | :-- |
| First goalscorer | +3 |
| Anytime goalscorer | +1 |

**Tier 3 — Chips (one per gameweek, chosen before kickoff):**

| Chip | Effect |
| :-- | :-- |
| Banker | match subtotal **×2** |
| Goal-Rush | match subtotal **×3** if total goals ≥ 4, else **0** (all-or-nothing) |

**Tier 4 — Group-relative bonus (applied after base scores are known):**

| Bonus | Points |
| :-- | :-- |
| Legend / Anti-Sheep — lone correct exact score in the group | +5 |

> **Cut by design:** *Crowd-Surfer* (rewarding majority agreement) — it incentivises
> group-think and flattens the leaderboard, working against the banter. *Underdog
> multiplier* — requires bookmaker odds, which re-entangles the product with betting markets
> (§3); revisit with a league-position proxy instead if desired.

- One prediction row per (user, fixture); chip is one selection per user per GW.
- **Manual override required**: first-goalscorer and VAR-disallowed/own-goal cases cause
  disputes. Admin can correct any fixture result and trigger idempotent re-scoring.
- **Transparency**: every prediction shows a "how this was scored" breakdown.
- **Schema note (JSONB):** keep stable, scored-every-week fields as typed columns
  (`pred_home`, `pred_away`, `chip`) for `CHECK` constraints and clean aggregation; use a
  `prediction_metadata` JSONB column only for *experimental/optional* props (clean-sheet
  pick, card yes/no) you're still tuning — that way new props don't need a migration.

### C. Settlement
- v1: **admin enters final scores manually** (and first scorer). System computes points.
- Scoring is **idempotent** — re-running settlement on a fixture never double-counts.
- Phase 2 swaps manual entry for API-Football auto-sync; the scoring function is unchanged.

### D. Leaderboard Reveal
- v1: animated/visual leaderboard rendered as an **image or styled web reveal** — *not*
  video. (Video is expensive, fragile, and inessential; see §6.)
- Real-time updates via Supabase Realtime to a per-league channel.

---

## 5. Technical Architecture (Supabase + Next.js)

### Corrected Database Schema

```
users            id, display_name, email, created_at
                 (mirrors auth.users; profile data lives here)

leagues          id, name, admin_id → users, invite_code,
                 type ('free' in v1), created_at

league_members   id, league_id → leagues, user_id → users,
                 role ('admin'|'member'), joined_at
                 UNIQUE(league_id, user_id)

gameweeks        id, league_id → leagues, gw_number,
                 status ('draft'|'predicting'|'locked'|'live'|'settled'),
                 lock_at (timestamptz), created_at

fixtures         id, gameweek_id → gameweeks, home_team, away_team,
                 kickoff_at, home_score (nullable), away_score (nullable),
                 first_scorer (nullable), external_ref (nullable, for API-Football)

predictions      id, user_id → users, fixture_id → fixtures,
                 pred_home, pred_away, pred_first_scorer (nullable),
                 is_banker (bool), points_awarded (nullable, set at settlement),
                 created_at, UNIQUE(user_id, fixture_id)

# Present but UNUSED in v1 (money track only):
transactions     id, user_id, gameweek_id, type ('entry'|'payout'|'platform_fee'),
                 amount, currency, status ('pending'|'paid'|'failed'),
                 provider_ref, created_at
```

> Fixes vs v1: added `users`, `league_members`, and `fixtures` (predictions had nothing to
> join `match_id` to); `transactions` gained `type` and `provider_ref`; `gameweeks.status`
> distinguishes `predicting` / `locked` / `live`; added `lock_at` for the kickoff lock.

### Real-Time Flow
1. **Predict** — user submits via Next.js dashboard → upsert into `predictions`
   (allowed only while GW is `predicting` and before `lock_at`).
2. **Lock** — at first kickoff, GW flips to `locked`; predictions become read-only.
3. **Settle** — admin enters results → scoring function writes `points_awarded`
   (idempotent) → GW flips to `settled` → Realtime broadcasts the new leaderboard.

### The FFmpeg Fix
Supabase Edge Functions run on Deno and **cannot shell out to FFmpeg**. Video rendering, if
ever built, must live in a **separate worker** (container on Fly.io/Railway/Cloud Run) or a
render API (Remotion/Shotstack/Cloudinary). **v1 does not render video** — it ships an
image/web reveal.

### The WhatsApp Reality (Phase 3)
The official **Cloud API** can only send free-form messages within 24h of a user messaging
you; everything else (Tue announce, live updates, Mon reveal) is a **paid template
message**. Per-goal updates × every member × every league is a real cost line — model it
before promising "live updates." Unofficial libraries (Baileys) get numbers banned and
don't scale; fine for a personal test group only.

---

## 6. Monetization (post-validation)
- **Platform fee** — 7% of Money Sprint pots. *Blocked on §3 regulatory path.*
- **Admin Pro tier** — ₦2,000/mo for cinematic leaderboards + unlimited members.
- ~~Affiliate betting links~~ — dropped from v1.

Video leaderboards are positioned as a **Pro upsell**, which is also why they don't belong
in the v1 critical path.

---

## 7. Reordered Roadmap (prove the loop, then the money)

| Phase | Milestone | Focus |
| :-- | :-- | :-- |
| **1** | **The Loop** | Next.js + Supabase, **Free-to-Play**, one league/one GW. Auth, mobile-first bento prediction grid, **manual** result entry, scoring, leaderboard. *Goal: your group plays a full GW.* |
| 2 | The Sync | Replace manual entry with API-Football auto-fetch. Scoring fn unchanged. |
| 3 | The Bot | WhatsApp Cloud API: announce + reveal via templates (cost-modelled). |
| 4 | The Money | *Only if 1–3 prove demand AND a §3 path is chosen.* Paystack entry flow, idempotent payouts, escrow. |
| 5 | The Polish | Video leaderboard via a dedicated render worker, as a Pro upsell. |

### Pro-Tips
- **Mobile-first**: 95% predict from their phone. Bento grid stacks vertically on mobile.
- **Trust = transparent scoring + (later) instant payouts.** A result someone can't appeal
  hurts more than a slow payout. Ship the "how this was scored" view from day one.
- **Idempotency everywhere**: settlement and (later) payouts must be safe to re-run.
- **Start free**: validate the Friday habit before touching money.
