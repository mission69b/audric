import type { SSEEvent, PendingAction, TodoItem } from '@t2000/engine';

export type { SSEEvent, PendingAction, TodoItem };

export interface CanvasData {
  template: string;
  title: string;
  data: unknown;
  toolUseId: string;
}

// [SPEC 8 v0.5.1 B1] Per-event captures from the new SSE event types.
// These shapes mirror the engine's SSEEvent union — kept local rather
// than re-exported to give the host control over rendering shape later.
export interface TodoUpdateEvent {
  items: TodoItem[];
  toolUseId: string;
}

export interface ToolProgressEvent {
  toolUseId: string;
  toolName: string;
  message: string;
  pct?: number;
}

export interface PendingInputEvent {
  schema: unknown;
  inputId: string;
  prompt?: string;
}

export interface EngineChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tools?: ToolExecution[];
  canvases?: CanvasData[];
  pendingAction?: PendingAction;
  usage?: UsageData;
  isStreaming?: boolean;
  thinking?: string;
  isThinking?: boolean;
  // [SPEC 8 v0.5.1 B1] Captured but NOT rendered yet — B2 wires the UI
  // (ReasoningTimeline, todo card, progress bars, input forms). These
  // slots exist so SPEC 8 events streaming from engine 1.4.0 don't fall
  // on the floor; today they accumulate silently.
  todoUpdates?: TodoUpdateEvent[];
  toolProgress?: ToolProgressEvent[];
  pendingInputs?: PendingInputEvent[];
}

export interface ToolExecution {
  toolName: string;
  toolUseId: string;
  input: unknown;
  status: 'running' | 'done' | 'error';
  result?: unknown;
  isError?: boolean;
}

export interface UsageData {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export type EngineStatus = 'idle' | 'connecting' | 'streaming' | 'executing' | 'error';
