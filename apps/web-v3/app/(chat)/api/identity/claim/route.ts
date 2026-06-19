import { normalizeSuiAddress } from "@mysten/sui/utils";
import { displayHandle, fullHandle, resolveSuinsViaRpc } from "@t2000/sdk";
import { auth } from "@/app/(auth)/auth";
import { getUserById, getUserByUsername, setUsername } from "@/lib/db/queries";
import {
  isIdentityConfigured,
  revokeLeafHandle,
  setLeafHandle,
} from "@/lib/identity/custody";
import { isReserved } from "@/lib/identity/reserved-usernames";
import { validateAudricLabel } from "@/lib/identity/validate-label";

// Claim (first mint) OR change an @audric handle. Auth = the httpOnly session;
// session.user.id IS the Passport Sui address, so there's no separate ownership
// binding to forge. Guards: format → reserved → unchanged → change-throttle →
// DB mirror → LIVE on-chain (ground truth) → custody-signed leaf mint → DB
// write (with on-chain rollback if the unique race is lost).
const CHANGE_COOLDOWN_MS = 60 * 60 * 1000; // 1 change / hour (gas-abuse guard)

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isIdentityConfigured()) {
    return Response.json(
      { error: "Handles aren't available right now." },
      { status: 503 }
    );
  }

  let raw: unknown;
  try {
    raw = (await request.json())?.label;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const v = validateAudricLabel(raw);
  if (!v.valid) {
    return Response.json(
      { error: "Invalid handle", reason: v.reason },
      {
        status: 400,
      }
    );
  }
  const label = v.label;
  if (isReserved(label)) {
    return Response.json(
      { error: "That handle is reserved", reason: "reserved" },
      {
        status: 400,
      }
    );
  }

  const me = await getUserById(session.user.id);
  if (!me) {
    return new Response("User not found", { status: 404 });
  }
  const oldLabel = me.username ?? null;
  if (oldLabel === label) {
    return Response.json(
      { error: "That's already your handle", reason: "unchanged" },
      {
        status: 400,
      }
    );
  }
  // Change throttle (claim is naturally once — username starts null).
  if (
    oldLabel &&
    me.usernameUpdatedAt &&
    Date.now() - me.usernameUpdatedAt.getTime() < CHANGE_COOLDOWN_MS
  ) {
    return Response.json(
      { error: "You can change your handle once an hour." },
      { status: 429 }
    );
  }

  const myAddress = normalizeSuiAddress(session.user.id);
  const dbHolder = await getUserByUsername(label);
  if (dbHolder && dbHolder.id !== session.user.id) {
    return Response.json(
      { error: "That handle is taken", reason: "taken" },
      { status: 409 }
    );
  }

  // Ground truth + ADOPTION: a leaf already targeting the caller (e.g. a handle
  // minted in v2) is theirs to adopt — record it without a re-mint. A leaf for
  // someone else is genuinely taken.
  let alreadyMine = false;
  try {
    const onChain = await resolveSuinsViaRpc(fullHandle(label));
    if (onChain) {
      if (normalizeSuiAddress(onChain) === myAddress) {
        alreadyMine = true;
      } else {
        return Response.json(
          { error: "That handle is taken", reason: "taken" },
          { status: 409 }
        );
      }
    }
  } catch {
    return Response.json(
      { error: "Couldn't verify the handle on-chain. Try again shortly." },
      { status: 503 }
    );
  }

  let txDigest: string;
  if (alreadyMine) {
    // Adopt the existing on-chain leaf — no mint (and no rollback-revoke below).
    txDigest = "adopted";
  } else {
    try {
      txDigest = await setLeafHandle({
        oldLabel,
        newLabel: label,
        targetAddress: session.user.id,
      });
    } catch (e) {
      return Response.json(
        { error: `Couldn't set your handle: ${(e as Error).message}` },
        { status: 502 }
      );
    }
  }

  try {
    await setUsername(session.user.id, label, txDigest);
  } catch {
    // Lost the DB unique race. Only roll back a leaf WE minted — never revoke a
    // pre-existing/adopted leaf (that would destroy the user's v2 handle).
    if (!alreadyMine) {
      await revokeLeafHandle(label).catch(() => undefined);
      if (oldLabel) {
        await setLeafHandle({
          newLabel: oldLabel,
          targetAddress: session.user.id,
        }).catch(() => undefined);
      }
    }
    return Response.json(
      { error: "That handle was just taken", reason: "taken" },
      { status: 409 }
    );
  }

  return Response.json({
    success: true,
    username: label,
    handle: displayHandle(label),
    txDigest,
  });
}
