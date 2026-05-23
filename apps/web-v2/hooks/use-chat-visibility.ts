"use client";

import { useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import {
  type ChatHistory,
  getChatHistoryPaginationKey,
} from "@/components/chat/sidebar-history";
import type { VisibilityType } from "@/lib/audric/chat-persistence";
import { authFetch } from "@/lib/auth-fetch";

export function useChatVisibility({
  chatId,
  initialVisibilityType,
}: {
  chatId: string;
  initialVisibilityType: VisibilityType;
}) {
  const { mutate, cache } = useSWRConfig();
  const history: ChatHistory = cache.get(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/history`
  )?.data;

  const { data: localVisibility, mutate: setLocalVisibility } = useSWR(
    `${chatId}-visibility`,
    null,
    {
      fallbackData: initialVisibilityType,
    }
  );

  // [P1-G] In-flight flag — lets consumers disable the toggle while
  // the server action settles. Prevents rapid public→copy→private
  // races from leaving the DB out of sync with the UI.
  const [isPending, setIsPending] = useState(false);

  const visibilityType = useMemo(() => {
    // [P1-H] When the chat row isn't in the SWR-paginated history
    // (e.g., chat opened via direct link before the sidebar's first
    // page loaded), fall back to the SWR `localVisibility` — which is
    // itself seeded by `initialVisibilityType`. Pre-P1-H this
    // hardcoded `"private"`, incorrectly showing the lock icon on
    // first paint for newly-toggled public chats.
    if (!history) {
      return localVisibility;
    }
    const chat = history.chats.find((currentChat) => currentChat.id === chatId);
    if (!chat) {
      return localVisibility;
    }
    return chat.visibility;
  }, [history, chatId, localVisibility]);

  // [P1-G] Optimistic local update + AWAITED server action so
  // consumers can `await setVisibilityType(...)` and disable the UI
  // mid-flight. On server failure we roll back the local cache and
  // re-throw so callers can surface a toast.
  const setVisibilityType = async (updatedVisibilityType: VisibilityType) => {
    const prior = visibilityType;
    setIsPending(true);
    setLocalVisibility(updatedVisibilityType);
    mutate(unstable_serialize(getChatHistoryPaginationKey));

    try {
      // [S.269 item 2 — 2026-05-23 / S.270 fix] Replaced the
      // `updateChatVisibility` Server Action with a `PATCH /api/chat/[id]`
      // call routed through `authFetch` so the `x-zklogin-jwt` header
      // lands. Server Actions strip custom headers; this surface
      // 401-ed on every toggle pre-fix.
      const res = await authFetch(`/api/chat/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: updatedVisibilityType }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(
          (detail as { error?: string }).error ??
            `Visibility update failed (${res.status})`
        );
      }
    } catch (err) {
      setLocalVisibility(prior);
      mutate(unstable_serialize(getChatHistoryPaginationKey));
      throw err;
    } finally {
      setIsPending(false);
    }
  };

  return { visibilityType, setVisibilityType, isPending };
}
