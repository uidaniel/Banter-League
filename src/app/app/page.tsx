import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createLeague, joinLeague, updateProfile } from "@/app/actions";
import SubmitButton from "@/components/SubmitButton";

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("display_name, avatar_emoji")
    .eq("id", user!.id)
    .single();

  const { data: memberships } = await supabase
    .from("league_members")
    .select("role, leagues(id, name, invite_code)")
    .eq("user_id", user!.id);

  type Row = { role: string; leagues: { id: string; name: string; invite_code: string } | null };
  const leagues = (memberships as Row[] | null)?.filter((m) => m.leagues) ?? [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="font-display text-xl font-extrabold">
          ⚽ Banter League
        </Link>
        <div className="flex items-center gap-3">
          <details className="relative">
            <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-full border border-[var(--line-hi)] bg-[var(--card)] text-xl">
              {profile?.avatar_emoji ?? "⚽"}
            </summary>
            <form
              action={updateProfile}
              className="card absolute right-0 z-10 mt-2 flex w-60 flex-col gap-2 p-3 shadow-xl"
            >
              <label className="text-xs text-[var(--muted)]">Display name</label>
              <input name="display_name" defaultValue={profile?.display_name ?? ""} className="field px-3 py-2 text-sm" />
              <label className="text-xs text-[var(--muted)]">Avatar emoji</label>
              <input name="avatar_emoji" defaultValue={profile?.avatar_emoji ?? "⚽"} maxLength={4} className="field px-3 py-2 text-sm" />
              <SubmitButton pendingText="Saving…" className="text-sm">Save</SubmitButton>
            </form>
          </details>
          <form action="/auth/signout" method="post">
            <button className="text-sm text-[var(--muted)] hover:text-white">Sign out</button>
          </form>
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Your leagues
        </h2>
        {leagues.length === 0 ? (
          <p className="card p-6 text-sm text-[var(--muted)]">
            No leagues yet. Create one for your group, or join with an invite code.
          </p>
        ) : (
          <ul className="grid gap-3">
            {leagues.map((m) => (
              <li key={m.leagues!.id}>
                <Link
                  href={`/league/${m.leagues!.id}`}
                  className="card flex items-center justify-between p-4 transition hover:border-[var(--accent)]"
                >
                  <span className="font-display font-bold">{m.leagues!.name}</span>
                  <span className="font-mono text-xs text-[var(--muted)]">
                    {m.role === "admin" ? "👑 " : ""}
                    {m.leagues!.invite_code}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <form action={createLeague} className="card flex flex-col gap-2 p-4">
          <h3 className="font-display font-bold">Create a league</h3>
          <input name="name" required placeholder="e.g. The Sunday Boys" className="field px-3 py-2 text-sm" />
          <SubmitButton pendingText="Creating…" className="text-sm">Create league</SubmitButton>
        </form>

        <form action={joinLeague} className="card flex flex-col gap-2 p-4">
          <h3 className="font-display font-bold">Join a league</h3>
          <input name="code" required placeholder="Invite code" className="field px-3 py-2 text-sm uppercase" />
          <SubmitButton variant="ghost" pendingText="Joining…" className="text-sm">Join</SubmitButton>
        </form>
      </section>
    </main>
  );
}
