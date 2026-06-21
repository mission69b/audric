import "server-only";
import type { ReactElement } from "react";
import { Resend } from "resend";
import { env } from "@/lib/env";

/**
 * Resend send helper (Audric v3 email).
 *
 * Send-only — Resend doesn't host inboxes; replies route to admin@audric.ai via
 * the Google Workspace aliases. Feature-gated: if RESEND_API_KEY is unset the
 * send is a silent no-op (email is never load-bearing — a missing key must never
 * break sign-in / billing). Domain `audric.ai` is verified in Resend.
 *
 * From-address convention (see CLAUDE.md):
 *   FOUNDER — founder/personal/lifecycle (welcome, etc.). Reply-To lands in the
 *             Audric inbox so users can actually reply to a human.
 *   SYSTEM  — transactional/system (receipts, low-credit, security).
 */
export const EMAIL_FROM = {
  founder: "funkii from Audric <funkii@audric.ai>",
  system: "Audric <notifications@audric.ai>",
} as const;

export const REPLY_TO = "funkii@audric.ai";

let client: Resend | null = null;
function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) {
    return null;
  }
  if (!client) {
    client = new Resend(env.RESEND_API_KEY);
  }
  return client;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  react: ReactElement;
  from?: string;
  replyTo?: string;
}): Promise<{ sent: boolean; id?: string; error?: string }> {
  const resend = getResend();
  if (!resend) {
    return { sent: false, error: "RESEND_API_KEY unset — email skipped" };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: opts.from ?? EMAIL_FROM.system,
      to: opts.to,
      subject: opts.subject,
      react: opts.react,
      replyTo: opts.replyTo,
    });
    if (error) {
      return { sent: false, error: error.message };
    }
    return { sent: true, id: data?.id };
  } catch (e) {
    return { sent: false, error: (e as Error).message };
  }
}
