"use client";

import { useState } from "react";
import { submitPredictions } from "@/app/actions";
import Crest from "@/components/Crest";

export type GridFixture = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string | null;
  home_score: number | null;
  away_score: number | null;
  first_scorer: string | null;
};

export type ExistingPred = {
  fixture_id: string;
  pred_home: number;
  pred_away: number;
  pred_first_scorer: string | null;
  pred_anytime_scorer: string | null;
  chip: "none" | "banker" | "goal_rush";
};

type ChipType = "banker" | "goal_rush";

export default function PredictionGrid({
  gwId,
  fixtures,
  existing,
  isOpen,
  showFirstScorer = true,
}: {
  gwId: string;
  fixtures: GridFixture[];
  existing: Map<string, ExistingPred>;
  isOpen: boolean;
  showFirstScorer?: boolean;
}) {
  const [scores, setScores] = useState<Record<string, { h: string; a: string }>>(() => {
    const init: Record<string, { h: string; a: string }> = {};
    for (const f of fixtures) {
      const p = existing.get(f.id);
      init[f.id] = {
        h: p ? String(p.pred_home) : "",
        a: p ? String(p.pred_away) : "",
      };
    }
    return init;
  });

  const [chip, setChip] = useState<{ fixtureId: string; type: ChipType } | null>(() => {
    for (const f of fixtures) {
      const p = existing.get(f.id);
      if (p && p.chip !== "none") return { fixtureId: f.id, type: p.chip };
    }
    return null;
  });

  const [saving, setSaving] = useState(false);

  function bump(id: string, side: "h" | "a", delta: number) {
    setScores((s) => {
      const cur = Number(s[id][side] || 0);
      return { ...s, [id]: { ...s[id], [side]: String(Math.max(0, cur + delta)) } };
    });
  }

  function setChipFor(fixtureId: string, type: ChipType) {
    setChip((c) => (c?.fixtureId === fixtureId && c.type === type ? null : { fixtureId, type }));
  }

  return (
    <form
      action={async (fd) => {
        setSaving(true);
        try {
          await submitPredictions(fd);
        } finally {
          setSaving(false);
        }
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="gw_id" value={gwId} />

      {fixtures.map((f) => {
        const p = existing.get(f.id);
        const isChipped = chip?.fixtureId === f.id;
        const settled = f.home_score !== null && f.away_score !== null;
        return (
          <div
            key={f.id}
            className={`rounded-2xl border bg-[var(--card)] p-4 transition ${
              isChipped ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]" : "border-[var(--line)]"
            }`}
          >
            {f.kickoff_at && (
              <p className="mb-2 text-center text-[11px] uppercase tracking-wide text-neutral-500">
                {new Date(f.kickoff_at).toLocaleString(undefined, {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <span className="flex items-center justify-end gap-2 text-right text-sm font-bold leading-tight">
                {f.home_team}
                <Crest team={f.home_team} />
              </span>
              <div className="flex items-center gap-2">
                <Stepper
                  value={scores[f.id]?.h ?? ""}
                  name={`home_${f.id}`}
                  disabled={!isOpen}
                  onBump={(d) => bump(f.id, "h", d)}
                  onChange={(v) => setScores((s) => ({ ...s, [f.id]: { ...s[f.id], h: v } }))}
                />
                <span className="text-neutral-600">:</span>
                <Stepper
                  value={scores[f.id]?.a ?? ""}
                  name={`away_${f.id}`}
                  disabled={!isOpen}
                  onBump={(d) => bump(f.id, "a", d)}
                  onChange={(v) => setScores((s) => ({ ...s, [f.id]: { ...s[f.id], a: v } }))}
                />
              </div>
              <span className="flex items-center gap-2 text-left text-sm font-bold leading-tight">
                <Crest team={f.away_team} />
                {f.away_team}
              </span>
            </div>

            {settled && (
              <p className="mt-2 text-center text-xs font-semibold text-emerald-400">
                FT {f.home_score}–{f.away_score}
                {f.first_scorer ? ` · 1st: ${f.first_scorer}` : ""}
              </p>
            )}

            {isOpen && (
              <div className="mt-3 flex flex-col gap-2">
                {showFirstScorer && (
                  <input
                    name={`scorer_${f.id}`}
                    defaultValue={p?.pred_first_scorer ?? ""}
                    placeholder="First goalscorer  (+3)"
                    className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
                  />
                )}
                <input
                  name={`anytime_${f.id}`}
                  defaultValue={p?.pred_anytime_scorer ?? ""}
                  placeholder="Anytime scorer  (+1)"
                  className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
                />
                <input
                  type="hidden"
                  name={`chip_${f.id}`}
                  value={isChipped ? chip!.type : "none"}
                />
                <div className="flex gap-2">
                  <ChipButton
                    active={isChipped && chip!.type === "banker"}
                    onClick={() => setChipFor(f.id, "banker")}
                    label="🎯 Banker ×2"
                  />
                  <ChipButton
                    active={isChipped && chip!.type === "goal_rush"}
                    onClick={() => setChipFor(f.id, "goal_rush")}
                    label="🔥 Goal-Rush ×3"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {isOpen ? (
        <button
          disabled={saving}
          className="btn-primary sticky bottom-4 inline-flex items-center justify-center gap-2 px-4 py-3.5 text-base"
        >
          {saving && <span className="spinner" />}
          {saving ? "Saving…" : "Lock in predictions"}
        </button>
      ) : null}

      {chip && isOpen && (
        <p className="text-center text-xs text-neutral-500">
          Chip in play: {chip.type === "banker" ? "🎯 Banker (×2)" : "🔥 Goal-Rush (×3, needs 4+ goals)"}.
          One chip per gameweek.
        </p>
      )}
    </form>
  );
}

function Stepper({
  value,
  name,
  disabled,
  onBump,
  onChange,
}: {
  value: string;
  name: string;
  disabled: boolean;
  onBump: (d: number) => void;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col items-center">
      {!disabled && (
        <button
          type="button"
          onClick={() => onBump(1)}
          className="text-neutral-500 hover:text-[var(--accent)]"
          aria-label="increase"
        >
          ▲
        </button>
      )}
      <input
        name={name}
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder="–"
        className="w-12 rounded-lg border border-[var(--line)] bg-[var(--bg)] py-2 text-center text-lg font-bold outline-none focus:border-[var(--accent)] disabled:opacity-60"
      />
      {!disabled && (
        <button
          type="button"
          onClick={() => onBump(-1)}
          className="text-neutral-500 hover:text-[var(--accent)]"
          aria-label="decrease"
        >
          ▼
        </button>
      )}
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-[var(--accent)] bg-[var(--accent)]/20 text-white"
          : "border-[var(--line)] text-neutral-400 hover:border-[var(--accent)]"
      }`}
    >
      {label}
    </button>
  );
}
