"use client";

/**
 * Delete-all-chats button — wires the `DELETE /api/history` endpoint that
 * v0.7e Persistent Chats (S.247) shipped without a UI caller.
 *
 * [L3 — 2026-05-31] Moved from `/settings/passport` to the chat sidebar,
 * directly below "New chat" (mirrors the vercel/chatbot template's
 * "New chat" + "Delete all" stack). Renders as a `SidebarMenuItem` so it
 * matches the New-chat button; collapses to an icon with the rest of the
 * sidebar.
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
import { unstable_serialize } from "swr/infinite";
import { getChatHistoryPaginationKey } from "@/components/chat/sidebar-history";
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
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
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
      // [S.269 item 1 — 2026-05-23 / S.271 fix] Invalidate the
      // sidebar's `useSWRInfinite` cache. Pre-fix this used a
      // string-predicate `(key) => typeof key === "string" &&
      // key.includes("/api/history")` which matched ZERO keys —
      // `useSWRInfinite` namespaces its keys as serialized arrays
      // under `$inf$/api/history?...`, never plain strings. Result:
      // delete-all-chats succeeded server-side but the sidebar still
      // showed the deleted chats until manual refresh. Canonical
      // pattern (mirrors `hooks/use-chat-visibility.ts:63`) is
      // `mutate(unstable_serialize(getChatHistoryPaginationKey))`,
      // which targets the exact infinite-key namespace.
      await mutate(unstable_serialize(getChatHistoryPaginationKey), undefined, {
        revalidate: true,
      });
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
      <SidebarMenuItem>
        <SidebarMenuButton
          className="h-8 rounded-lg text-[13px] text-sidebar-foreground/60 transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setOpen(true)}
          tooltip="Delete all chats"
        >
          <TrashIcon className="size-4" />
          <span className="font-medium">Delete all</span>
        </SidebarMenuButton>
      </SidebarMenuItem>

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
