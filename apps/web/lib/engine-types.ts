import type { SSEEvent as BaseSSEEvent, PendingAction } from '@t2000/engine';

// Extend SSEEvent locally until @t2000/engine@0.28.8 is published.
// The canvas variant is emitted by the render_canvas tool.
export type SSEEvent =
  | BaseSSEEvent
  | { type: 'canvas'; template: string; data: unknown; title: string; toolUseId: string };

export type { PendingAction };

export interface CanvasData {
  template: string;
  title: string;
  data: unknown;
  toolUseId: string;
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
