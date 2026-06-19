"use client";

import useSWR from "swr";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { useActiveChat } from "@/hooks/use-active-chat";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

async function fetchFollowups([url, context]: [string, string]): Promise<{
  suggestions: string[];
}> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context }),
  });
  if (!res.ok) {
    return { suggestions: [] };
  }
  return res.json();
}

// Clickable follow-up chips below the latest assistant message (ChatGPT-style).
// Keyed on the assistant message id so it fetches once per turn and caches.
export function FollowupSuggestions({
  messageId,
  context,
}: {
  messageId: string;
  context: string;
}) {
  const { sendMessage } = useActiveChat();

  const { data } = useSWR(
    context ? [`${BASE_PATH}/api/followups`, context, messageId] : null,
    ([url, ctx]) => fetchFollowups([url, ctx]),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    }
  );

  const suggestions = data?.suggestions ?? [];
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <Suggestions className="pt-1">
      {suggestions.map((text) => (
        <Suggestion
          className="text-muted-foreground text-xs"
          key={text}
          onClick={(value) =>
            sendMessage({
              role: "user",
              parts: [{ type: "text", text: value }],
            })
          }
          suggestion={text}
        />
      ))}
    </Suggestions>
  );
}
