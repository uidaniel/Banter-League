"use client";

import { useState } from "react";
import { crestUrl } from "@/lib/crests";

// Club crest with a graceful fallback (initials disc) when there's no badge or it 404s.
export default function Crest({ team, size = 22 }: { team: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const url = crestUrl(team);

  if (!url || failed) {
    return (
      <span
        className="inline-grid shrink-0 place-items-center rounded-full bg-[var(--line-hi)] font-bold text-[var(--text)]"
        style={{ width: size, height: size, fontSize: size * 0.42 }}
        aria-hidden
      >
        {team.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={team}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}
