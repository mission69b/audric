"use client";

import { cn } from "@/lib/cn";
import type { Message } from "@/lib/demo-messages";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isAgent = message.role === "agent";

  return (
    <div
      className={cn(
        "animate-message-in flex",
        isAgent ? "justify-start" : "justify-end",
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[70%]",
          isAgent
            ? "rounded-tl-md bg-n-200 text-n-800"
            : "rounded-tr-md bg-n-900 text-n-100",
        )}
      >
        <div
          className={cn(
            "prose-sm [&_strong]:font-medium",
            isAgent
              ? "[&_strong]:text-n-900"
              : "text-n-100 [&_strong]:text-n-100",
          )}
        >
          <MessageContent content={message.content} />
        </div>
      </div>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    if (line === "") {
      elements.push(<br key={key++} />);
      continue;
    }

    if (line.startsWith("• ") || line.startsWith("- ")) {
      elements.push(
        <div key={key++} className="ml-1 flex gap-2 py-0.5">
          <span className="shrink-0 text-n-500">&#8226;</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>,
      );
      continue;
    }

    if (line.startsWith("| ")) {
      elements.push(
        <div
          key={key++}
          className="font-mono text-xs tracking-wide text-n-600"
        >
          {renderInline(line)}
        </div>,
      );
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\./)?.[1];
      const rest = line.replace(/^\d+\.\s*/, "");
      elements.push(
        <div key={key++} className="ml-1 flex gap-2 py-0.5">
          <span className="shrink-0 font-mono text-xs text-n-500">
            {num}.
          </span>
          <span>{renderInline(rest)}</span>
        </div>,
      );
      continue;
    }

    elements.push(<p key={key++}>{renderInline(line)}</p>);
  }

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
