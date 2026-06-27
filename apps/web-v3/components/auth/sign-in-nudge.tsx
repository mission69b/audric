"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useZkLogin } from "./zklogin-provider";

/**
 * Anon → sign-up conversion nudge (SPEC_AUDRIC_CONVERSION §1c). A small sign-in
 * dialog any surface can trigger via `useSignInNudge().promptSignIn()`. Fired
 * at the two moments that matter: (a) when a guest hits the message limit (the
 * chat onError — the real conversion gate), and (b) proactively after a few
 * guest turns. Reuses zkLogin (Google) — no seed phrase, no card.
 */
type SignInNudgeContextValue = { promptSignIn: () => void };

const SignInNudgeContext = createContext<SignInNudgeContextValue | null>(null);

export function useSignInNudge(): SignInNudgeContextValue {
  const ctx = useContext(SignInNudgeContext);
  if (!ctx) {
    throw new Error("useSignInNudge must be used within <SignInNudgeProvider>");
  }
  return ctx;
}

export function SignInNudgeProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { login } = useZkLogin();
  const value = useMemo(() => ({ promptSignIn: () => setOpen(true) }), []);

  return (
    <SignInNudgeContext.Provider value={value}>
      {children}
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="flex flex-col gap-4 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Keep going — it's free</DialogTitle>
            <DialogDescription>
              You're chatting as a guest. Create your free Passport with Google
              — no seed phrase, no card — to save your chats, keep your private
              memory, and get higher limits.
            </DialogDescription>
          </DialogHeader>
          <Button
            className="w-full"
            onClick={() =>
              login(window.location.pathname + window.location.search)
            }
            type="button"
          >
            Continue with Google
          </Button>
          <button
            className="text-center text-muted-foreground text-xs transition-colors hover:text-foreground"
            onClick={() => setOpen(false)}
            type="button"
          >
            Maybe later
          </button>
        </DialogContent>
      </Dialog>
    </SignInNudgeContext.Provider>
  );
}
