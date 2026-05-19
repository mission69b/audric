"use client";

/**
 * Username claim modal (safety-valve) — Session 4.7.C rebuild.
 *
 * Mounted from the Passport section when the user has no claimed
 * handle (rare in production — the signup gate handles first-time
 * claim — but defensive for users who skipped via the "Skip for now"
 * affordance).
 *
 * Diffs from the Session 2 port:
 *   - Bespoke scrim + manual ESC keydown listener REPLACED by shadcn
 *     `<Dialog>` + `<DialogContent>`. Same UX, free focus trap +
 *     proper ARIA dialog semantics + portal rendering.
 *   - 102 LoC → ~40 LoC. The wrapping component is now structural;
 *     the actual claim UX lives in `<UsernameClaimGate>` (a content
 *     slot) and is unchanged.
 */

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { clearUsernameSkip } from "@/lib/identity/username-skip";
import { UsernameClaimGate } from "./username-claim-gate";

export interface UsernameClaimModalProps {
  address: string;
  googleEmail?: string | null;
  googleName?: string | null;
  jwt: string;
  onClaimed: (label: string, fullHandle: string) => void;
  onClose: () => void;
  open: boolean;
}

export function UsernameClaimModal({
  address,
  googleEmail,
  googleName,
  jwt,
  onClaimed,
  onClose,
  open,
}: UsernameClaimModalProps) {
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      open={open}
    >
      <DialogContent
        className="overflow-hidden bg-transparent p-0 shadow-none ring-0 sm:max-w-[560px]"
        data-testid="username-claim-modal"
      >
        <UsernameClaimGate
          address={address}
          googleEmail={googleEmail}
          googleName={googleName}
          jwt={jwt}
          onClaimed={(label, fullHandle) => {
            clearUsernameSkip(address);
            onClaimed(label, fullHandle);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
