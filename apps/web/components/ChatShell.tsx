"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import {
  type Message,
  WELCOME_MESSAGES,
  SUGGESTION_CHIPS,
  getDemoResponse,
} from "@/lib/demo-messages";

export function ChatShell() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    setTyping(true);
    const t1 = setTimeout(() => {
      setMessages([WELCOME_MESSAGES[0]]);
      scrollToBottom();
    }, 400);

    const t2 = setTimeout(() => {
      setMessages([WELCOME_MESSAGES[0], WELCOME_MESSAGES[1]]);
      setTyping(false);
      scrollToBottom();
    }, 1200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [scrollToBottom]);

  function handleSend(text: string) {
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setTyping(true);
    scrollToBottom();

    setTimeout(() => {
      const response = getDemoResponse(text);
      const agentMsg: Message = {
        id: `agent-${Date.now()}`,
        role: "agent",
        content: response,
      };
      setMessages((prev) => [...prev, agentMsg]);
      setTyping(false);
      scrollToBottom();
    }, 600 + Math.random() * 400);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6 sm:px-6"
      >
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {typing && <TypingIndicator />}
        </div>
      </div>

      <div className="border-t border-n-300 bg-n-100 px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <ChatInput
            chips={SUGGESTION_CHIPS}
            onSend={handleSend}
            disabled={typing}
          />
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md bg-n-200 px-4 py-3">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-n-400 [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-n-400 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-n-400 [animation-delay:300ms]" />
      </div>
    </div>
  );
}
