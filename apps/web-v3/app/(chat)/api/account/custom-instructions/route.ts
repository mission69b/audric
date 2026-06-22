import { auth } from "@/app/(auth)/auth";
import { getUserById, setCustomInstructions } from "@/lib/db/queries";

const MAX_LEN = 2000;

/** Standing custom instructions — applied to every response (see the
 * set_preferences tool + systemPrompt injection). GET reads, POST sets/clears. */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const u = await getUserById(session.user.id);
  return Response.json({ instructions: u?.customInstructions ?? "" });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const raw = (body as { instructions?: unknown }).instructions;
  if (typeof raw !== "string") {
    return new Response("instructions must be a string", { status: 400 });
  }
  const trimmed = raw.trim().slice(0, MAX_LEN);
  await setCustomInstructions(
    session.user.id,
    trimmed.length > 0 ? trimmed : null
  );
  return Response.json({ ok: true, instructions: trimmed });
}
