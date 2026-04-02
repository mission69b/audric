'use client';

import { useCallback, useRef, useState } from 'react';

export interface DemoChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  cta?: boolean;
}

let idCounter = 0;
function nextId(): string {
  return `demo_${Date.now()}_${++idCounter}`;
}

interface SSEEvent {
  type: string;
  text?: string;
  message?: string;
}

export function useDemoChat(initialMessage?: string) {
  const [messages, setMessages] = useState<DemoChatMessage[]>(() =>
    initialMessage
      ? [{ id: nextId(), role: 'assistant', content: initialMessage, timestamp: Date.now() }]
      : [],
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const streamingMsgRef = useRef<string | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return;

      setError(null);

      const userMsg: DemoChatMessage = {
        id: nextId(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };

      const assistantMsg: DemoChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      };

      streamingMsgRef.current = assistantMsg.id;

      setMessages((prev) => {
        const history = [...prev, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        startStream(text, history, assistantMsg.id);

        return [...prev, userMsg, assistantMsg];
      });

      setIsStreaming(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isStreaming],
  );

  async function startStream(
    message: string,
    history: { role: string; content: string }[],
    msgId: string,
  ) {
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/engine/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
          if (!chunk.trim()) continue;
          processChunk(chunk, msgId);
        }
      }

      if (buffer.trim()) {
        processChunk(buffer, msgId);
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, isStreaming: false } : m,
        ),
      );
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, isStreaming: false, content: m.content || 'Cancelled.' }
              : m,
          ),
        );
      } else {
        const errorMsg = err instanceof Error ? err.message : 'Something went wrong';
        setError(errorMsg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, isStreaming: false, content: m.content || 'Something went wrong. Try again.' }
              : m,
          ),
        );
      }
    } finally {
      streamingMsgRef.current = null;
      abortRef.current = null;
      setIsStreaming(false);
    }
  }

  function processChunk(raw: string, msgId: string) {
    const lines = raw.split('\n');
    let dataStr = '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        dataStr = line.slice(6);
      }
    }

    if (!dataStr) return;

    let event: SSEEvent;
    try {
      event = JSON.parse(dataStr) as SSEEvent;
    } catch {
      return;
    }

    if (event.type === 'text_delta' && event.text) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, content: m.content + event.text } : m,
        ),
      );
    } else if (event.type === 'error' && event.message) {
      setError(event.message);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, isStreaming: false, content: m.content || event.message || 'Error' }
            : m,
        ),
      );
    }
  }

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const addCtaMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'assistant', content, timestamp: Date.now(), cta: true },
    ]);
  }, []);

  return { messages, isStreaming, error, sendMessage, cancel, addCtaMessage };
}
