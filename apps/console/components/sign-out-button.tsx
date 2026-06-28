"use client";

import { clearSession } from "@audric/auth/client";

export function SignOutButton() {
  return (
    <button
      className="text-[var(--muted)] text-sm underline underline-offset-4 transition-colors hover:text-[var(--foreground)]"
      onClick={async () => {
        clearSession();
        await fetch("/api/auth/session", { method: "DELETE" }).catch(
          () => undefined
        );
        window.location.href = "/";
      }}
      type="button"
    >
      Sign out
    </button>
  );
}
