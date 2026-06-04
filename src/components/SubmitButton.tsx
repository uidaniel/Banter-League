"use client";

import { useFormStatus } from "react-dom";

// Drop-in submit button that shows a spinner while its parent <form> action runs.
export default function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  className = "",
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  const { pending } = useFormStatus();
  const base = variant === "primary" ? "btn-primary" : "btn-ghost";
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 ${base} ${className}`}
    >
      {pending && <span className="spinner" />}
      <span>{pending ? (pendingText ?? "Working…") : children}</span>
    </button>
  );
}
