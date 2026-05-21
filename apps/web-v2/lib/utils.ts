import type { UIMessage } from 'ai';
import { type ClassValue, clsx } from 'clsx';
import { formatISO } from 'date-fns';
import { twMerge } from 'tailwind-merge';
import type { DBMessage } from '@/lib/audric/chat-persistence';
import { ChatbotError, type ErrorCode } from './errors';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fetcher = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    const { code, cause } = await response.json();
    throw new ChatbotError(code as ErrorCode, cause);
  }

  return response.json();
};

export async function fetchWithErrorHandlers(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  try {
    const response = await fetch(input, init);

    if (!response.ok) {
      const { code, cause } = await response.json();
      throw new ChatbotError(code as ErrorCode, cause);
    }

    return response;
  } catch (error: unknown) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new ChatbotError('offline:chat');
    }

    throw error;
  }
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function sanitizeText(text: string) {
  return text.replace('<has_function_call>', '');
}

/**
 * Convert prisma-persisted DBMessage[] (from `getMessagesByChatId`) into
 * plain `UIMessage[]` consumable by `useChat({ initialMessages })`. Used
 * by `/chat/[id]/page.tsx` (Phase 3 click-to-resume) and the public
 * `/share/[id]/page.tsx` viewer.
 *
 * Pre-S.247 this returned the template's `ChatMessage` specialisation
 * (`UIMessage<MessageMetadata, CustomUIDataTypes, ChatTools>`). Audric
 * doesn't narrow on those slots — `ToolResultRouter` reads `part.type`
 * + `part.state` directly — so we return the plain `UIMessage` instead.
 */
export function convertToUIMessages(messages: DBMessage[]): UIMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role as 'user' | 'assistant' | 'system',
    parts: message.parts as UIMessage['parts'],
    metadata: {
      createdAt: formatISO(message.createdAt),
    },
  }));
}

export function getTextFromMessage(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as { type: 'text'; text: string}).text)
    .join('');
}
