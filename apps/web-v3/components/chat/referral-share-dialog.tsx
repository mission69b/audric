"use client";

import { CheckIcon, CopyIcon, GiftIcon } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { useZkLogin } from "@/components/auth/zklogin-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetcher } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type ReferralData = {
  code?: string;
  rewardUsd?: number;
  total: number;
  rewarded: number;
  earnedUsd: number;
};

/**
 * "Give $X, get $X" share modal (SPEC_AUDRIC_CONVERSION §1e). Manus-style: copy
 * link + one-tap shares. Triggered from the sidebar "Invite & earn" card (authed
 * only). Data from the existing `/api/referral` endpoint.
 */
export function ReferralShareDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const { status } = useZkLogin();
  const { data } = useSWR<ReferralData>(
    open && status === "authenticated" ? `${BASE}/api/referral` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const [copied, setCopied] = useState(false);

  const reward = data?.rewardUsd ?? 10;
  const link = data?.code ? `https://audric.ai/?ref=${data.code}` : "";
  const text = `Try Audric — private, decentralized AI. Get $${reward} in credits.`;

  const copy = async () => {
    if (!link) {
      return;
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const shares = link
    ? [
        {
          label: "X",
          href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`,
        },
        {
          label: "WhatsApp",
          href: `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`,
        },
        {
          label: "Telegram",
          href: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`,
        },
      ]
    : [];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex flex-col gap-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GiftIcon className="size-5 text-teal-500" />
            Give ${reward}, get ${reward}
          </DialogTitle>
          <DialogDescription>
            Your friend gets ${reward} in credits when they join — you get $
            {reward} when they make their first paid action.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 p-1.5">
          <input
            className="min-w-0 flex-1 bg-transparent px-2 text-muted-foreground text-sm outline-none"
            readOnly
            value={link || "Loading…"}
          />
          <Button
            className="shrink-0 gap-1.5"
            disabled={!link}
            onClick={copy}
            size="sm"
            type="button"
          >
            {copied ? (
              <CheckIcon className="size-4" />
            ) : (
              <CopyIcon className="size-4" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        {shares.length > 0 && (
          <div className="flex gap-2">
            {shares.map((s) => (
              <a
                className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-border/60 font-medium text-foreground text-sm transition-colors hover:bg-muted"
                href={s.href}
                key={s.label}
                rel="noreferrer"
                target="_blank"
              >
                {s.label}
              </a>
            ))}
          </div>
        )}

        {data && data.total > 0 && (
          <p className="text-center text-muted-foreground text-xs">
            {data.rewarded} joined · ${data.earnedUsd} earned
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
