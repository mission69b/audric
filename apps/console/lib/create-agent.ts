import { isSessionExpired, loadSession } from "@audric/auth/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromBase64 } from "@mysten/sui/utils";
import { confirmOwnership } from "@/lib/confirm-ownership";

// Client half of the CREATE-AGENT composition flow (T1/A2,
// SPEC_COMPOSITION_MOMENT §3): mint a fresh Ed25519 keypair IN THE BROWSER
// (non-custodial — the secret never leaves the tab), then one pass:
// register (agent signs, sponsored) → propose owner = Passport (agent signs,
// sponsored) → confirm (Passport zkLogin signs, sponsored) → profile write
// (session route, ownership-gated). The secret is stashed in sessionStorage
// from the moment it exists until the user confirms they saved it — a mid-flow
// refresh must never orphan a registered agent whose key is gone.

export type CreateStep = "register" | "link" | "confirm" | "profile";

export const CREATE_STEPS: { id: CreateStep; label: string }[] = [
  { id: "register", label: "Register the agent on-chain" },
  { id: "link", label: "Link it to your Passport" },
  { id: "confirm", label: "Confirm ownership" },
  { id: "profile", label: "Save the profile" },
];

const STASH_KEY = "t2000-create-agent";

export type KeyStash = { address: string; secretKey: string; name: string };

export function readKeyStash(): KeyStash | null {
  try {
    const raw = sessionStorage.getItem(STASH_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as KeyStash;
    return parsed.address && parsed.secretKey ? parsed : null;
  } catch {
    return null;
  }
}

export function clearKeyStash(): void {
  try {
    sessionStorage.removeItem(STASH_KEY);
  } catch {
    // sessionStorage unavailable — nothing to clear.
  }
}

function writeKeyStash(stash: KeyStash): void {
  try {
    sessionStorage.setItem(STASH_KEY, JSON.stringify(stash));
  } catch {
    // Private-mode quota failures are non-fatal — the in-memory copy remains.
  }
}

function errMsg(error: unknown, fallback: string): string {
  if (typeof error === "string") {
    return error;
  }
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

async function relay(
  body: Record<string, unknown>,
  fallback: string
): Promise<Record<string, unknown>> {
  const res = await fetch("/api/agent/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(errMsg(json.error, fallback));
  }
  return json;
}

export class CreateAgentError extends Error {
  step: CreateStep;
  constructor(step: CreateStep, message: string) {
    super(message);
    this.step = step;
  }
}

export type CreateAgentInput = {
  name: string;
  description?: string;
  category?: string;
  onProgress?: (step: CreateStep) => void;
  /** Retry support: resume a partially-created agent from a failed step. */
  resume?: { address: string; secretKey: string; from: CreateStep };
};

export type CreateAgentResult = { address: string; secretKey: string };

export async function createAgent(
  input: CreateAgentInput
): Promise<CreateAgentResult> {
  const session = loadSession();
  if (!session || isSessionExpired(session)) {
    throw new Error("Your session expired — sign in again first.");
  }

  const keypair = input.resume
    ? Ed25519Keypair.fromSecretKey(input.resume.secretKey)
    : new Ed25519Keypair();
  const address = keypair.getPublicKey().toSuiAddress();
  const secretKey = keypair.getSecretKey();
  writeKeyStash({ address, secretKey, name: input.name });

  const order: CreateStep[] = ["register", "link", "confirm", "profile"];
  const startAt = input.resume ? order.indexOf(input.resume.from) : 0;
  const run = (step: CreateStep) => order.indexOf(step) >= startAt;

  if (run("register")) {
    input.onProgress?.("register");
    try {
      const prep = await relay(
        { step: "register-prepare", address },
        "Couldn't prepare the registration."
      );
      // Idempotent upstream — a resumed retry may already be registered.
      if (!prep.alreadyRegistered) {
        const txBytes = String(prep.txBytes ?? "");
        const regNonce = String(prep.regNonce ?? "");
        if (!(txBytes && regNonce)) {
          throw new Error("Couldn't prepare the registration — try again.");
        }
        const { signature } = await keypair.signTransaction(
          fromBase64(txBytes)
        );
        await relay(
          {
            step: "register-submit",
            regNonce,
            address,
            agentSignature: signature,
          },
          "Registration failed — try again."
        );
      }
    } catch (e) {
      throw new CreateAgentError("register", errMsg(e, "Registration failed."));
    }
  }

  if (run("link")) {
    input.onProgress?.("link");
    try {
      const prep = await relay(
        { step: "propose-prepare", address },
        "Couldn't prepare the ownership link."
      );
      const txBytes = String(prep.txBytes ?? "");
      const nonce = String(prep.nonce ?? "");
      if (!(txBytes && nonce)) {
        throw new Error("Couldn't prepare the ownership link — try again.");
      }
      const { signature } = await keypair.signTransaction(fromBase64(txBytes));
      await relay(
        { step: "owner-submit", nonce, address, signature },
        "Ownership link failed — try again."
      );
    } catch (e) {
      throw new CreateAgentError("link", errMsg(e, "Ownership link failed."));
    }
  }

  if (run("confirm")) {
    input.onProgress?.("confirm");
    try {
      await confirmOwnership(address);
    } catch (e) {
      throw new CreateAgentError(
        "confirm",
        errMsg(e, "Ownership confirmation failed.")
      );
    }
  }

  if (run("profile")) {
    input.onProgress?.("profile");
    try {
      const res = await fetch("/api/agent/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: address,
          displayName: input.name,
          ...(input.description ? { description: input.description } : {}),
          ...(input.category ? { category: input.category } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) {
        throw new Error(errMsg(json.error, "Couldn't save the profile."));
      }
    } catch (e) {
      throw new CreateAgentError(
        "profile",
        errMsg(e, "Couldn't save the profile.")
      );
    }
  }

  return { address, secretKey };
}
