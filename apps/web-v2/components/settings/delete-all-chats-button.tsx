"use client";

/**
 * Delete-all-chats button — wires the `DELETE /api/history` endpoint that
 * v0.7e Persistent Chats (S.247) shipped without a UI caller.
 *
 * S.250 P2 #6 — adds the first caller. Lives in `/settings/passport` under
 * a "Data" section so it sits next to identity controls (the user's
 * Passport address + claimed handle); chat history is "my data," same
 * mental model.
 *
 * Pattern mirrors `sidebar-history.tsx`'s per-chat delete confirmation
 * (AlertDialog + authFetch + SWR cache invalidation) so the surface feels
 * consistent. Two differences:
 *   1. Confirmation copy is stronger (deletes ALL chats, not just one).
 *   2. After success, invalidates EVERY `/api/history` SWR key so any
 *      mounted sidebar (in another tab / on next chat-route mount)
 *      refreshes from empty.
 */

import { TrashIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth-fetch";

export function DeleteAllChatsButton() {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { mutate } = useSWRConfig();

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      const res = await authFetch("/api/history", { method: "DELETE" });
      if (!res.ok) {
        toast.error(`Couldn't delete chats (${res.status})`);
        return;
      }
      // Invalidate every `/api/history*` SWR key so any mounted sidebar
      // (this tab post-nav back to /chat, other tabs on next focus)
      // refetches and shows the empty state.
      await mutate(
        (key) => typeof key === "string" && key.includes("/api/history"),
        undefined,
        { revalidate: true }
      );
      toast.success("All chats deleted");
      setOpen(false);
    } catch (err) {
      toast.error("Couldn't delete chats — please try again");
      console.warn(
        "[delete-all-chats] network error:",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Button
        className="gap-2"
        onClick={() => setOpen(true)}
        size="sm"
        variant="outline"
      >
        <TrashIcon className="size-3.5" />
        Delete all chats
      </Button>

      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all your chats?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every conversation in your history. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
            >
              {isDeleting ? "Deleting…" : "Delete everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
