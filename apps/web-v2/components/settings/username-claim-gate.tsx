"use client";

/**
 * Username claim gate — port from `apps/web/components/identity/
 * UsernameClaimGate.tsx`.
 *
 * Diffs from legacy:
 *   - `/api/identity/reserve` fetch goes through `audricWebUrl()`
 *
 * 3-state machine: picking → claiming → success.
 * Used by `<UsernameClaimModal>` in the settings safety-valve flow
 * (when the user landed on settings without a claimed handle yet).
 */

import { useCallback, useState } from "react";
import { audricWebUrl } from "@/lib/audric-web-url";
import { UsernameClaimSuccess } from "./username-claim-success";
import { UsernamePicker } from "./username-picker";

const PARENT_SUFFIX = "@audric";

type Phase = "picking" | "claiming" | "success";

type ReserveReason =
  | "invalid"
  | "too-short"
  | "too-long"
  | "reserved"
  | "taken";

interface ReserveSuccessBody {
  fullHandle: string;
  label: string;
  success: true;
  txDigest: string;
  walletAddress: string;
}

interface ReserveErrorBody {
  error: string;
  reason?: ReserveReason;
}

export interface UsernameClaimGateProps {
  address: string;
  googleEmail?: string | null;
  googleName?: string | null;
  jwt: string;
  onClaimed: (label: string, fullHandle: string) => void;
  onSkipped?: () => void;
  reserveFetcher?: (label: string) => Promise<ReserveSuccessBody>;
}

export class ReserveError extends Error {
  readonly status: number;
  readonly reason: ReserveReason | "verifier-down" | "rate-limit" | "unknown";

  constructor(
    status: number,
    reason: ReserveReason | "verifier-down" | "rate-limit" | "unknown",
    message: string
  ) {
    super(message);
    this.name = "ReserveError";
    this.status = status;
    this.reason = reason;
  }
}

export function UsernameClaimGate({
  address,
  jwt,
  googleName,
  googleEmail,
  onClaimed,
  onSkipped,
  reserveFetcher,
}: UsernameClaimGateProps) {
  const [phase, setPhase] = useState<Phase>("picking");
  const [claimedLabel, setClaimedLabel] = useState<string | null>(null);
  const [claimedFullHandle, setClaimedFullHandle] = useState<string | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const defaultFetcher = useCallback(
    async (label: string): Promise<ReserveSuccessBody> => {
      const res = await fetch(audricWebUrl("/api/identity/reserve"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-zklogin-jwt": jwt,
        },
        body: JSON.stringify({ label, address }),
      });
      if (!res.ok) {
        const body: ReserveErrorBody = await res
          .json()
          .catch(() => ({ error: "Unknown error" }));
        const reason: ReserveError["reason"] =
          res.status === 503
            ? "verifier-down"
            : res.status === 429
              ? "rate-limit"
              : (body.reason ?? "unknown");
        throw new ReserveError(res.status, reason, body.error);
      }
      return (await res.json()) as ReserveSuccessBody;
    },
    [address, jwt]
  );

  const fetcher = reserveFetcher ?? defaultFetcher;

  const handleSubmit = useCallback(
    async (label: string) => {
      setPhase("claiming");
      setErrorMessage(null);
      try {
        const body = await fetcher(label);
        setClaimedLabel(body.label);
        setClaimedFullHandle(body.fullHandle);
        setPhase("success");
      } catch (err) {
        const message =
          err instanceof ReserveError
            ? reasonToCopy(err.reason, label)
            : "Network error — please try again.";
        setErrorMessage(message);
        setPhase("picking");
      }
    },
    [fetcher]
  );

  const handleContinue = useCallback(() => {
    if (claimedLabel && claimedFullHandle) {
      onClaimed(claimedLabel, claimedFullHandle);
    }
  }, [claimedLabel, claimedFullHandle, onClaimed]);

  if (phase === "success" && claimedLabel) {
    return (
      <div data-phase="success" data-testid="username-claim-gate">
        <UsernameClaimSuccess
          label={claimedLabel}
          onContinue={handleContinue}
          walletAddress={address}
        />
      </div>
    );
  }

  return (
    <div
      className="space-y-3"
      data-phase={phase}
      data-testid="username-claim-gate"
    >
      {errorMessage && (
        <div
          className="rounded-sm border border-error-border bg-error-bg px-3 py-2 text-[12px] leading-[1.5] text-error-fg"
          data-testid="username-claim-gate-error"
          role="alert"
        >
          {errorMessage}
        </div>
      )}
      <UsernamePicker
        disabled={phase === "claiming"}
        googleEmail={googleEmail}
        googleName={googleName}
        onSkip={onSkipped}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function reasonToCopy(reason: ReserveError["reason"], label: string): string {
  const fullHandle = `${label}${PARENT_SUFFIX}`;
  switch (reason) {
    case "taken":
      return `Someone else just claimed ${fullHandle} — try a different name.`;
    case "reserved":
      return `${fullHandle} is reserved — try a different name.`;
    case "invalid":
      return `${fullHandle} contains invalid characters — letters, numbers, and hyphens only.`;
    case "too-short":
      return "Handles need at least 3 characters.";
    case "too-long":
      return "Handles can be at most 20 characters.";
    case "verifier-down":
      return "Couldn't verify the name on Sui right now — please try again in a moment.";
    case "rate-limit":
      return "Too many attempts — please wait a moment before trying again.";
    default:
      return "Could not claim the handle — please try again.";
  }
}
