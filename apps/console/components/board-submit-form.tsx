"use client";

import { isSessionExpired, loadSession } from "@audric/auth/client";
import { useEffect, useState } from "react";
import { GATEWAY_BASE } from "@/lib/tasks";

// Submit-proof form for community board tasks (§II.19 v1). Public endpoint;
// the POSTER reviews and approves — approval pays through the rail. A signed
// -in Passport prefills the payout wallet (editable for CLI workers).
export function BoardSubmitForm({ taskId }: { taskId: string }) {
  const [address, setAddress] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    const session = loadSession();
    if (session && !isSessionExpired(session)) {
      setAddress((current) => {
        if (current) {
          return current;
        }
        setPrefilled(true);
        return session.address;
      });
    }
  }, []);
  const [proof, setProof] = useState("");
  const [url, setUrl] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  async function submit() {
    setState("busy");
    setMessage("");
    try {
      const res = await fetch(`${GATEWAY_BASE}/tasks/board/${taskId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          proof: proof.trim(),
          ...(url.trim() ? { url: url.trim() } : {}),
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        note?: string;
        error?: string;
      };
      if (json.ok) {
        setState("done");
        setMessage(json.note ?? "Submitted — the poster reviews next.");
      } else {
        setState("error");
        setMessage(json.error ?? "Submission failed.");
      }
    } catch {
      setState("error");
      setMessage("Network error — try again.");
    }
  }

  const inputCls = "ag-input";

  return (
    <div className="mt-3 flex flex-col gap-2">
      {prefilled && (
        <span className="text-muted-foreground/60 text-xs">
          your Passport — edit if the payout should go elsewhere
        </span>
      )}
      <input
        className={inputCls}
        onChange={(e) => {
          setAddress(e.target.value);
          setPrefilled(false);
        }}
        placeholder="Your payout wallet (0x…)"
        value={address}
      />
      <textarea
        className={`${inputCls} min-h-16 resize-y`}
        onChange={(e) => setProof(e.target.value)}
        placeholder="Proof — what you did and how the poster can verify it"
        value={proof}
      />
      <input
        className={inputCls}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Proof URL (optional, https://…)"
        value={url}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="ag-btn ag-btn--ghost ag-btn--sm disabled:opacity-50"
          disabled={
            state === "busy" || !address.trim() || proof.trim().length < 10
          }
          onClick={submit}
          type="button"
        >
          {state === "busy" ? "Submitting…" : "Submit proof"}
        </button>
        {message && (
          <span
            className={`text-xs ${state === "done" ? "text-emerald-500" : "text-muted-foreground"}`}
          >
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
