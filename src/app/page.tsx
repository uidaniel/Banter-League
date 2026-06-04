import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Crest from "@/components/Crest";

export default async function Landing() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const cta = user ? "/app" : "/login";
  const ctaLabel = user ? "Open your leagues" : "Start free";

  return (
    <div className="relative overflow-hidden">
      {/* Nav */}
      <nav className="sticky top-0 z-20 border-b border-[var(--line)]/60 bg-[var(--bg)]/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
          <span className="font-display text-lg font-extrabold tracking-tight">⚽ BANTER&nbsp;LEAGUE</span>
          <Link href={cta} className="btn-ghost px-4 py-2 text-sm">
            {user ? "Dashboard" : "Sign in"}
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="mx-auto flex w-full max-w-3xl flex-col items-center px-5 pb-12 pt-14 text-center sm:pt-20">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--line-hi)] bg-[var(--card)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" /> NEW GAMEWEEK EVERY WEEKEND
        </span>
        <h1 className="font-display text-4xl font-extrabold uppercase leading-[1.02] tracking-tight sm:text-6xl">
          Turn the group chat into a{" "}
          <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] bg-clip-text text-transparent">
            prediction arena
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-base text-[var(--muted)] sm:text-lg">
          Predict every scoreline, play your chips, talk your trash. Banter League keeps score
          automatically and crowns a winner every single week.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link href={cta} className="btn-primary px-7 py-3.5 text-base uppercase tracking-wide">
            {ctaLabel}
          </Link>
          <span className="text-sm text-[var(--muted)]">Free to play · No app to install</span>
        </div>

        {/* Floating scoreline preview */}
        <div className="card animate-float-up mt-14 w-full max-w-md p-5 text-left">
          <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-widest text-[var(--muted)]">
            Gameweek 12 · your pick
          </p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <span className="flex items-center justify-end gap-2 font-semibold">
              Arsenal <Crest team="Arsenal" />
            </span>
            <div className="flex items-center gap-2">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--bg-2)] font-display text-2xl font-extrabold">2</span>
              <span className="text-[var(--muted)]">:</span>
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--bg-2)] font-display text-2xl font-extrabold">1</span>
            </div>
            <span className="flex items-center gap-2 font-semibold">
              <Crest team="Spurs" /> Spurs
            </span>
          </div>
          <div className="mt-4 flex justify-center gap-2 text-xs">
            <span className="rounded-lg border border-[var(--accent)] bg-[var(--accent)]/10 px-2.5 py-1 font-bold text-[var(--accent)]">
              🎯 BANKER ×2
            </span>
            <span className="rounded-lg border border-[var(--line-hi)] px-2.5 py-1 text-[var(--muted)]">
              Saka anytime +1
            </span>
          </div>
        </div>
      </header>

      {/* Stat band */}
      <section className="border-y border-[var(--line)] bg-[var(--card)]/40">
        <div className="mx-auto grid w-full max-w-4xl grid-cols-3 divide-x divide-[var(--line)] px-5 py-6 text-center">
          {[
            ["100%", "Free to play"],
            ["38", "Gameweeks a season"],
            ["0", "Spreadsheets needed"],
          ].map(([big, small]) => (
            <div key={small}>
              <p className="font-display text-3xl font-extrabold text-[var(--accent)] sm:text-4xl">{big}</p>
              <p className="mt-1 text-xs uppercase tracking-wider text-[var(--muted)]">{small}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto grid w-full max-w-5xl gap-4 px-5 py-14 sm:grid-cols-3">
        {[
          { icon: "⚡", title: "Auto-scored", body: "Final whistle blows, results sync from official data, points land. No arguments." },
          { icon: "🎯", title: "Chips & bonuses", body: "Banker, Goal-Rush, anytime scorer, and the lone-genius Legend bonus." },
          { icon: "🏆", title: "Live leaderboard", body: "Standings update in real time, with a cinematic winner reveal every Monday." },
        ].map((f) => (
          <div key={f.title} className="card p-5">
            <div className="text-2xl">{f.icon}</div>
            <h3 className="font-display mt-3 text-lg font-bold uppercase tracking-tight">{f.title}</h3>
            <p className="mt-1.5 text-sm text-[var(--muted)]">{f.body}</p>
          </div>
        ))}
      </section>

      {/* How scoring works */}
      <section className="mx-auto w-full max-w-4xl px-5 py-10">
        <h2 className="font-display text-center text-2xl font-extrabold uppercase sm:text-3xl">
          Rack up the points
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-[var(--muted)]">
          Simple enough for casuals, deep enough for the obsessed.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {[
            ["Exact score", "5 pts"],
            ["Correct goal difference", "3 pts"],
            ["Correct result", "2 pts"],
            ["First / anytime scorer", "+3 / +1"],
          ].map(([label, pts]) => (
            <div key={label} className="card flex items-center justify-between px-4 py-3">
              <span className="text-sm font-semibold">{label}</span>
              <span className="pts-pill px-2.5 py-1 text-sm">{pts}</span>
            </div>
          ))}
        </div>

        <h3 className="mt-10 text-center text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
          Strategic chips — one per gameweek
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { icon: "🎯", name: "Banker", desc: "Double all points on one match." },
            { icon: "🔥", name: "Goal-Rush", desc: "Triple points if the match has 4+ goals — or nothing." },
            { icon: "⭐", name: "Legend", desc: "+5 if you're the only one to nail an exact score." },
          ].map((c) => (
            <div key={c.name} className="card p-4 text-center">
              <div className="text-3xl">{c.icon}</div>
              <p className="font-display mt-2 font-bold uppercase">{c.name}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Weekly sprint timeline */}
      <section className="mx-auto w-full max-w-3xl px-5 py-10">
        <h2 className="font-display text-center text-2xl font-extrabold uppercase sm:text-3xl">The weekly sprint</h2>
        <ol className="mt-8 grid gap-4">
          {[
            { day: "TUE", text: "Fixtures drop into the group automatically." },
            { day: "FRI", text: "Prediction window opens. Lock in scores + chips." },
            { day: "SAT–SUN", text: "Matches kick off. The leaderboard shifts live." },
            { day: "MON", text: "Auto-settled. Winner revealed. Banter commences." },
          ].map((s) => (
            <li key={s.day} className="card flex items-center gap-4 p-4">
              <span className="font-display grid h-12 w-16 shrink-0 place-items-center rounded-xl bg-[var(--bg-2)] text-sm font-extrabold text-[var(--accent)]">
                {s.day}
              </span>
              <span className="text-sm">{s.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Leaderboard preview */}
      <section className="mx-auto w-full max-w-2xl px-5 py-10">
        <h2 className="font-display mb-5 text-center text-2xl font-extrabold uppercase sm:text-3xl">
          Climb the table
        </h2>
        <div className="paper">
          <div className="flex items-center justify-between bg-[var(--paper-ink)] px-4 py-3 text-white">
            <span className="font-display text-sm font-extrabold">STANDINGS</span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">Classic league</span>
          </div>
          {[
            ["🥇", "🦁 Tunde", "24", true],
            ["🥈", "👑 Sarah", "21", false],
            ["🥉", "🔥 Bayo", "18", false],
            ["4", "⚡ Chidi", "12", false],
          ].map(([rank, name, pts, legend]) => (
            <div
              key={name as string}
              className="flex items-center gap-3 border-b border-[var(--paper-2)] px-4 py-2.5 last:border-0"
            >
              <span className="w-6 text-center text-sm font-bold text-[var(--paper-muted)]">{rank}</span>
              <span className="flex-1 text-sm font-bold text-[var(--paper-ink)]">
                {name} {legend ? "⭐" : ""}
              </span>
              <span className="pts-pill px-2.5 py-1 text-sm">{pts}</span>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto w-full max-w-2xl px-5 py-10">
        <h2 className="font-display mb-6 text-center text-2xl font-extrabold uppercase sm:text-3xl">FAQ</h2>
        <div className="grid gap-3">
          {[
            ["Is it really free?", "Yes — Banter League is free to play. Create a league, invite your group, predict every week. No card, no catch."],
            ["Where do the results come from?", "Official Fantasy Premier League data. Scores and goalscorers sync automatically and settle the gameweek for you."],
            ["Do I need to download an app?", "No. It runs in the browser and lives in your WhatsApp group. Mobile-first by design."],
            ["How are winners decided?", "Points are scored transparently against the real results — exact scores, results, chips and bonuses. Highest total wins the gameweek."],
          ].map(([q, a]) => (
            <details key={q} className="card p-4">
              <summary className="cursor-pointer font-display text-sm font-bold">{q}</summary>
              <p className="mt-2 text-sm text-[var(--muted)]">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto w-full max-w-3xl px-5 py-16 text-center">
        <h2 className="font-display text-3xl font-extrabold uppercase leading-tight sm:text-4xl">
          Your group is one gameweek away from chaos.
        </h2>
        <Link href={cta} className="btn-primary mt-7 inline-block px-8 py-4 text-base uppercase tracking-wide">
          {ctaLabel}
        </Link>
      </section>

      <footer className="border-t border-[var(--line)] py-8 text-center text-xs text-[var(--muted)]">
        ⚽ Banter League · Built for the group chat
        <br />
        <span className="opacity-70">Football data provided by the official Fantasy Premier League API</span>
      </footer>
    </div>
  );
}
