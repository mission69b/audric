/**
 * AI prompts — Audric scope.
 *
 * The Vercel AI SDK chatbot template that bootstrapped web-v2 shipped this
 * file with ~130 lines of artifact / code / sheet / system prompts. After
 * the v0.7e Persistent Chats deletion pass (S.247) the only consumer left
 * is `lib/audric/chat-title.ts` — every other prompt was tied to the
 * artifact panel or template-specific tools that audric never wired.
 */

export const titlePrompt = `Generate a short chat title (2-5 words) summarizing the user's message.

Output ONLY the title text. No prefixes, no formatting.

Examples:
- "what's the weather in nyc" → Weather in NYC
- "help me write an essay about space" → Space Essay Help
- "hi" → New Conversation
- "debug my python code" → Python Debugging

Never output hashtags, prefixes like "Title:", or quotes.`;
