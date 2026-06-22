import { type NextRequest, NextResponse } from "next/server";
import { EMAIL_FROM, REPLY_TO, sendEmail } from "@/lib/email/send";
import { WelcomeEmail } from "@/lib/email/templates/welcome";

/**
 * DEV-ONLY: preview the welcome email by sending a real copy.
 *   GET /api/dev/send-welcome?to=you@example.com[&name=Phil]
 * Disabled in production (404). Sends through the real Resend pipeline.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const to = req.nextUrl.searchParams.get("to");
  const name = req.nextUrl.searchParams.get("name") ?? undefined;
  if (!to) {
    return NextResponse.json(
      { error: "pass ?to=you@example.com" },
      { status: 400 }
    );
  }
  const result = await sendEmail({
    to,
    subject: "Welcome to Audric (test)",
    react: WelcomeEmail({ name }),
    from: EMAIL_FROM.founder,
    replyTo: REPLY_TO,
  });
  return NextResponse.json(result);
}
