import { z } from "zod";

const textPartSchema = z.object({
  type: z.enum(["text"]),
  text: z.string().min(1).max(2000),
});

const filePartSchema = z.object({
  type: z.enum(["file"]),
  // Match the upload route's accepted set (images + PDF). A PDF is extracted to
  // text server-side (prepareAttachments); images are inlined as base64.
  mediaType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
  ]),
  name: z.string().min(1).max(200),
  // AI-SDK-standard display field (the preview chip reads it); optional mirror
  // of `name` so the chip shows the real filename, not a generic "file".
  filename: z.string().max(200).optional(),
  // Our attachments are the session-gated in-app blob path (/api/files/blob?…),
  // which is RELATIVE — so `.url()` (absolute-only) wrongly rejects them. Allow
  // a relative path or an absolute/data URL; the server re-derives the blob ref.
  url: z.string().min(1).max(2000),
});

const partSchema = z.union([textPartSchema, filePartSchema]);

const userMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user"]),
  parts: z.array(partSchema),
});

const toolApprovalMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  parts: z.array(z.record(z.unknown())),
});

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: userMessageSchema.optional(),
  messages: z.array(toolApprovalMessageSchema).optional(),
  selectedChatModel: z.string(),
  selectedVisibilityType: z.enum(["public", "private"]),
  // Private Memory opt-in (off by default) — recall this user's memories +
  // enable the save_memory tool for this turn.
  useMemWal: z.boolean().optional(),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
