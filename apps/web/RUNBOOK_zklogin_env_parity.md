# Runbook: zkLogin env-var parity check

**Goal:** Confirm that `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_ENOKI_API_KEY` are byte-identical across `production`, `preview`, and `development` Vercel environments.

**Why this matters.** zkLogin derives a Sui address deterministically from `(Google sub + JWT aud + Enoki app)`. When a user logs in with the same Gmail account from a different deployment URL (e.g. a preview link) and the JWT `aud` differs (because `NEXT_PUBLIC_GOOGLE_CLIENT_ID` differs), they get back a **different** Sui address. Then `/api/user/email` rejects them with a 409 because the email is already linked to the previous address. This is the operational root cause of the "EMAIL IS ALREADY REGISTERED TO ANOTHER ACCOUNT" reports referenced in `audric-send-safety-and-auth_cd48769c.plan.md` (Bug B §3).

The structured 409 response (`EMAIL_LINKED_TO_DIFFERENT_WALLET`) and humane error UI shipped in that same plan **explain** the failure to the user; this runbook **prevents** the failure.

## When to run

- **Before** rolling out the send-safety / auth-error PR (baseline).
- **After** any Vercel env-var change (e.g. rotating Google OAuth credentials).
- **Whenever** a user reports the "email already registered to another account" 409 in production.

## Steps

```bash
pnpm vercel link              # one-time, links to the audric Vercel project

for env in production preview development; do
  echo "== $env =="
  vercel env pull .env.tmp --environment="$env" --yes
  grep -E "^NEXT_PUBLIC_(GOOGLE_CLIENT_ID|ENOKI_API_KEY)=" .env.tmp
  rm .env.tmp
done
```

The two values must be **byte-identical** across all three environments. If any row differs, that IS the root cause: fix the Vercel env config, redeploy, and the next login from any URL will produce the same Sui address as production-from-the-start.

## What to do if logs show same `sub` → different `suiAddress`

If `/api/user/email` and `/api/user/verify-email` log `[email-conflict]` lines (added by this PR) where the same JWT `sub` prefix produces different `requestedSuiAddress` and `existingSuiAddress` values:

1. Run this runbook first; if env vars differ, fixing them resolves all future cases.
2. For users who already lost access to their previous wallet, the recovery path is manual support — there's no on-chain way to re-derive the old address from the new login session. The 409 response includes a `mailto:support@audric.ai` link with a pre-filled subject for exactly this case.
