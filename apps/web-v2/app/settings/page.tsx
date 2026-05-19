import { redirect } from "next/navigation";

/**
 * `/settings` redirects to `/settings/passport` — the canonical default
 * section (matches the legacy `?section=passport` fallback).
 */
export default function SettingsIndexPage() {
  redirect("/settings/passport");
}
