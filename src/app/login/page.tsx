"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col items-center justify-center gap-7 px-5 text-center">
      <div>
        <div className="text-5xl">⚽</div>
        <h1 className="font-display mt-3 text-3xl font-extrabold tracking-tight">Banter League</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Sign in with your email — we&apos;ll send a magic link, no password needed.
        </p>
      </div>

      {sent ? (
        <div className="card w-full p-6 text-sm">
          <div className="text-3xl">📬</div>
          <p className="mt-2">
            Check <span className="font-semibold text-[var(--accent)]">{email}</span> for your
            magic link.
          </p>
        </div>
      ) : (
        <form onSubmit={sendLink} className="flex w-full flex-col gap-3">
          <input
            type="email"
            required
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field px-4 py-3 text-center"
          />
          <button
            disabled={loading}
            className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-3"
          >
            {loading && <span className="spinner" />}
            {loading ? "Sending…" : "Send magic link"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
      )}

      <Link href="/" className="text-xs text-[var(--muted)] hover:text-white">
        ← Back home
      </Link>
    </main>
  );
}
