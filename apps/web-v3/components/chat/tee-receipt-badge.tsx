"use client";

import { ShieldCheckIcon } from "lucide-react";
import useSWR from "swr";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TeeReceipt } from "@/lib/ai/providers";

const fetchReceipt = async (url: string): Promise<TeeReceipt | null> => {
  const res = await fetch(url);
  if (res.status === 204 || !res.ok) {
    return null;
  }
  return res.json();
};

const short = (addr: string) =>
  addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;

/**
 * Per-response Confidential (TEE) badge. The chat stream emits a
 * `data-tee-receipt` part carrying the response id; we lazily fetch the
 * TEE-signed receipt and show "Confidential · TEE-verified" with the signing
 * address. While the receipt loads (or if it's unavailable) we still show the
 * honest "Confidential · TEE" pill — the response DID run in the enclave; only
 * the cryptographic receipt is pending.
 */
export function TeeReceiptBadge({
  responseId,
  model,
}: {
  responseId: string;
  model: string;
}) {
  const { data: receipt } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/tee/receipt?id=${encodeURIComponent(
      responseId
    )}&model=${encodeURIComponent(model)}`,
    fetchReceipt,
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );

  const verified = Boolean(receipt?.signingAddress);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="mt-1 inline-flex w-fit items-center gap-1 rounded bg-purple-500/10 px-1.5 py-0.5 font-medium text-[10px] text-purple-600 uppercase tracking-wide dark:text-purple-400">
          <ShieldCheckIcon className="size-3" />
          {verified ? "Confidential · TEE-verified" : "Confidential · TEE"}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px]">
        {verified ? (
          <>
            Signed inside a Trusted Execution Environment — not even the
            provider can read this chat. Verifiable per request.
            <br />
            <span className="font-mono text-[10px] opacity-70">
              signer {short(receipt?.signingAddress ?? "")}
            </span>
          </>
        ) : (
          "Ran inside a Trusted Execution Environment — not even the provider can read this chat."
        )}
      </TooltipContent>
    </Tooltip>
  );
}
