"use client";

/**
 * Client half of the `ask_user` clarifying-question form (Venice-style). The
 * server emits a `ask_user` tool part (no server execute); this renders a
 * structured form (radio options and/or free text), collects the answers, and
 * returns them via `addToolResult` so the model proceeds with the task.
 */

import { useState } from "react";
import { useActiveChat } from "@/hooks/use-active-chat";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

type AskPart = Extract<ChatMessage["parts"][number], { type: "tool-ask_user" }>;

const OTHER = "__other__";

export function AskUserTool({ part }: { part: AskPart }) {
  const { addToolResult } = useActiveChat();
  const [pending, setPending] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const toolCallId = part.toolCallId;
  const widthClass = "w-[min(100%,520px)]";

  if (part.state === "output-available") {
    const out = part.output as {
      answers?: { question: string; answer: string }[];
      skipped?: boolean;
    };
    if (out?.skipped) {
      return (
        <div className="text-muted-foreground text-xs" key={toolCallId}>
          Skipped — you can just tell me directly.
        </div>
      );
    }
    const summary = (out?.answers ?? [])
      .map((a) => a.answer)
      .filter(Boolean)
      .join(" · ");
    return (
      <div className="text-muted-foreground text-xs" key={toolCallId}>
        {summary || "Answered."}
      </div>
    );
  }

  // Only render the form once the input is fully streamed (input-available).
  // Narrowing on part.state gives the complete (non-partial) input type.
  if (part.state !== "input-available") {
    return null;
  }
  const { intro, questions } = part.input;
  if (!questions?.length) {
    return null;
  }

  const answerFor = (qId: string): string => {
    const v = values[qId] ?? "";
    return v === OTHER ? (other[qId] ?? "") : v;
  };

  const canSubmit = questions.every((q) => answerFor(q.id).trim().length > 0);

  const settle = async (output: unknown) => {
    setPending(true);
    await addToolResult({
      tool: "ask_user",
      toolCallId,
      output: output as never,
    });
  };

  const onSubmit = () =>
    settle({
      answers: questions.map((q) => ({
        question: q.question,
        answer: answerFor(q.id),
      })),
    });

  return (
    <div className={widthClass} key={toolCallId}>
      <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
        {intro && <p className="mb-3 text-muted-foreground text-sm">{intro}</p>}
        <div className="flex flex-col gap-4">
          {questions.map((q) => (
            <div className="flex flex-col gap-2" key={q.id}>
              <div className="font-medium text-foreground text-sm">
                {q.question}
              </div>
              {q.options && q.options.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {q.options.map((opt) => (
                    <button
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        values[q.id] === opt
                          ? "border-foreground/40 bg-accent text-foreground"
                          : "border-border/50 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      )}
                      key={opt}
                      onClick={() => setValues((v) => ({ ...v, [q.id]: opt }))}
                      type="button"
                    >
                      <span
                        className={cn(
                          "size-3.5 shrink-0 rounded-full border",
                          values[q.id] === opt
                            ? "border-[5px] border-foreground"
                            : "border-border"
                        )}
                      />
                      {opt}
                    </button>
                  ))}
                  {q.allowOther && (
                    <div className="flex flex-col gap-1.5">
                      <button
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                          values[q.id] === OTHER
                            ? "border-foreground/40 bg-accent text-foreground"
                            : "border-border/50 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        )}
                        onClick={() =>
                          setValues((v) => ({ ...v, [q.id]: OTHER }))
                        }
                        type="button"
                      >
                        <span
                          className={cn(
                            "size-3.5 shrink-0 rounded-full border",
                            values[q.id] === OTHER
                              ? "border-[5px] border-foreground"
                              : "border-border"
                          )}
                        />
                        Other
                      </button>
                      {values[q.id] === OTHER && (
                        <input
                          className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
                          onChange={(e) =>
                            setOther((o) => ({ ...o, [q.id]: e.target.value }))
                          }
                          placeholder="Type your answer…"
                          value={other[q.id] ?? ""}
                        />
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <input
                  className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [q.id]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canSubmit && !pending) {
                      onSubmit();
                    }
                  }}
                  placeholder={q.placeholder ?? "Type your answer…"}
                  value={values[q.id] ?? ""}
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            disabled={pending}
            onClick={() => settle({ skipped: true })}
            type="button"
          >
            Skip
          </button>
          <button
            className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            disabled={pending || !canSubmit}
            onClick={onSubmit}
            type="button"
          >
            {pending ? "…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
