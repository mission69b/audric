"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import {
  ArrowUpIcon,
  BrainIcon,
  CheckIcon,
  LockIcon,
  MonitorIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  type ChangeEvent,
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { useSignInNudge } from "@/components/auth/sign-in-nudge";
import { useZkLogin } from "@/components/auth/zklogin-provider";
import { useUpgradeModal } from "@/components/pricing/upgrade-modal";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AUTO_MODEL,
  AUTO_MODEL_ID,
  type ChatModel,
  chatModels,
  type ModelPrivacyTier,
} from "@/lib/ai/models";
import {
  composerPlaceholders,
  confidentialPlaceholders,
} from "@/lib/constants";
import type { Attachment, ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "../ai-elements/prompt-input";
import { Button } from "../ui/button";
import { ChatContextUsage } from "./chat-context-usage";
import { PaperclipIcon, StopIcon } from "./icons";
import { PreviewAttachment } from "./preview-attachment";
import {
  type SlashCommand,
  SlashCommandMenu,
  slashCommands,
} from "./slash-commands";
import type { VisibilityType } from "./visibility-selector";

function setCookie(name: string, value: string) {
  const maxAge = 60 * 60 * 24 * 365;
  // biome-ignore lint/suspicious/noDocumentCookie: needed for client-side cookie setting
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}`;
}

// Files at/under this go through the serverless route (works tokenless in dev);
// larger ones must upload browser→Blob directly (Vercel caps function bodies at
// ~4.5MB → 413). 4MB stays safely under that cap.
const SERVER_UPLOAD_LIMIT = 4 * 1024 * 1024;

// A clipboard paste longer than this becomes a "Pasted text" attachment
// (Claude-style) instead of flooding the composer. Smaller pastes stay inline.
const PASTE_TO_FILE_CHARS = 2000;

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  sendMessage,
  className,
  selectedModelId,
  onModelChange,
  editingMessage,
  onCancelEdit,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: UIMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage:
    | UseChatHelpers<ChatMessage>["sendMessage"]
    | (() => Promise<void>);
  className?: string;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  editingMessage?: ChatMessage | null;
  onCancelEdit?: () => void;
}) {
  const router = useRouter();
  const { openUpgrade } = useUpgradeModal();
  const { promptSignIn } = useSignInNudge();
  const { status: authStatus } = useZkLogin();
  const isAuthed = authStatus === "authenticated";
  const { setTheme, resolvedTheme } = useTheme();
  // Credit state mirrors the server premium gate (chat/route.ts). When a
  // signed-in user is out of credit AND has a premium model selected, show a
  // Venice-style upsell banner above the composer (Buy Credits / Upgrade Plan /
  // switch to a free model) rather than dead-ending on send. Optimistic while
  // the balance loads, so a paying user never sees a flash of the banner.
  const { data: credit } = useSWR<{
    configured: boolean;
    balanceUsd: number | null;
    tier?: string;
  }>(
    isAuthed
      ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/credit/balance`
      : null,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false }
  );
  const canUsePremium =
    isAuthed &&
    (credit === undefined ||
      credit.configured === false ||
      credit.balanceUsd === null ||
      credit.balanceUsd > 0);
  // Auto always routes to a free model for a no-credit user; only an explicit
  // premium pick triggers the banner. (Free flags come from the curated list,
  // matching the server's requestedIsFree check.)
  const selectedIsFree =
    selectedModelId === AUTO_MODEL_ID ||
    chatModels.find((m) => m.id === selectedModelId)?.free === true;
  const showCreditBanner = isAuthed && !canUsePremium && !selectedIsFree;
  // P2 conversion nudges (SPEC_AUDRIC_CONVERSION §1c/§1d).
  // #1 anon: after a few guest turns, proactively prompt sign-in (the hard
  // message-limit gate also triggers it, in use-active-chat's onError).
  const [anonTurns, setAnonTurns] = useLocalStorage<number>("anon-turns", 0);
  // Active-model capabilities — used to hint on image paste to a non-vision
  // model (the attach button is already gated; paste bypasses it).
  const { data: capsResponse } = useSWR<{
    capabilities?: Record<string, { vision?: boolean }>;
  }>(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );
  const modelHasVision =
    capsResponse?.capabilities?.[selectedModelId]?.vision ?? false;
  // On Auto, an image attachment routes to a vision model server-side, so the
  // composer treats Auto as image-capable. PDFs work on every model (extracted
  // to text), so they're never blocked here.
  const isAuto = selectedModelId === AUTO_MODEL_ID;
  const canAttachImages = modelHasVision || isAuto;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const hasAutoFocused = useRef(false);
  useEffect(() => {
    if (!hasAutoFocused.current && width) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
        hasAutoFocused.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [width]);

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    ""
  );

  // Confidential mode (GPU-TEE) — lifted here so the composer can "light up"
  // when on. Persisted in localStorage + read per-request by the chat transport.
  const [confidential, setConfidential] = useState(false);
  useEffect(() => {
    setConfidential(window.localStorage.getItem("audric-confidential") === "1");
  }, []);
  // Explicit setter (the mode tabs pick Private/Confidential directly). Persists
  // + fires the event the header shield / greeting listen for.
  const setConfidentialMode = useCallback((next: boolean) => {
    setConfidential(next);
    window.localStorage.setItem("audric-confidential", next ? "1" : "0");
    window.dispatchEvent(new Event("audric-confidential-change"));
  }, []);
  // Which confidential (phala/*) model runs when Confidential is on — persisted
  // + sent as the model id by the transport (default: the fast gpt-oss-120b).
  const [confidentialModelId, setConfidentialModelId] =
    useState("phala/gpt-oss-120b");
  useEffect(() => {
    const saved = window.localStorage.getItem("audric-confidential-model");
    if (saved) {
      setConfidentialModelId(saved);
    }
  }, []);
  const pickConfidentialModel = useCallback((id: string) => {
    setConfidentialModelId(id);
    window.localStorage.setItem("audric-confidential-model", id);
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      const finalValue = domValue || localStorageInput || "";
      setInput(finalValue);
    }
  }, [localStorageInput, setInput]);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = event.target.value;
    setInput(val);

    if (val.startsWith("/") && !val.includes(" ")) {
      setSlashOpen(true);
      setSlashQuery(val.slice(1));
      setSlashIndex(0);
    } else {
      setSlashOpen(false);
    }
  };

  const handleSlashSelect = (cmd: SlashCommand) => {
    setSlashOpen(false);
    setInput("");
    switch (cmd.action) {
      case "new":
        router.push("/");
        break;
      case "clear":
        setMessages(() => []);
        break;
      case "rename":
        toast("Rename is available from the sidebar chat menu.");
        break;
      case "model": {
        const modelBtn = document.querySelector<HTMLButtonElement>(
          "[data-testid='model-selector']"
        );
        modelBtn?.click();
        break;
      }
      case "theme":
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
        break;
      case "delete":
        toast("Delete this chat?", {
          action: {
            label: "Delete",
            onClick: () => {
              fetch(
                `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chat?id=${chatId}`,
                { method: "DELETE" }
              );
              router.push("/");
              toast.success("Chat deleted");
            },
          },
        });
        break;
      case "purge":
        toast("Delete all chats?", {
          action: {
            label: "Delete all",
            onClick: () => {
              fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/history`, {
                method: "DELETE",
              });
              router.push("/");
              toast.success("All chats deleted");
            },
          },
        });
        break;
      default:
        break;
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  // Cycling example placeholders (Venice-style) — rotates while not editing.
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  useEffect(() => {
    if (editingMessage) {
      return;
    }
    const id = setInterval(() => setPlaceholderIndex((i) => i + 1), 3500);
    return () => clearInterval(id);
  }, [editingMessage]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);

  const submitForm = useCallback(() => {
    // Confidential is the paid tier — gate at send (tease → intent → upsell):
    // the toggle + glow already sold it; upsell now at the moment of intent.
    if (confidential && !canUsePremium) {
      openUpgrade();
      return;
    }
    window.history.pushState(
      {},
      "",
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/chat/${chatId}`
    );

    sendMessage({
      role: "user",
      parts: [
        ...attachments.map((attachment) => ({
          type: "file" as const,
          url: attachment.url,
          name: attachment.name,
          // `filename` is the AI-SDK-standard field the preview chip reads;
          // `name` is our schema field the server reads. Send both → the chip
          // shows the real name (not "file") and the server keeps its handle.
          filename: attachment.name,
          mediaType: attachment.contentType,
        })),
        {
          type: "text",
          text: input,
        },
      ],
    });

    setAttachments([]);
    setLocalStorageInput("");
    setInput("");

    if (!isAuthed) {
      const next = (anonTurns ?? 0) + 1;
      setAnonTurns(next);
      if (next === 3) {
        promptSignIn();
      }
    }

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    input,
    setInput,
    attachments,
    sendMessage,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
    isAuthed,
    anonTurns,
    setAnonTurns,
    promptSignIn,
    confidential,
    canUsePremium,
    openUpgrade,
  ]);

  const uploadFile = useCallback(async (file: File) => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    try {
      // Files over the serverless request-body cap (~4.5MB on Vercel) CAN'T go
      // through the server route — it 413s before our handler runs. Send those
      // browser→Blob directly (private, authorized by the token route). Small
      // files keep the server route so tokenless local/CI dev still works.
      if (file.size > SERVER_UPLOAD_LIMIT) {
        const { upload } = await import("@vercel/blob/client");
        const blob = await upload(file.name, file, {
          access: "private",
          handleUploadUrl: `${base}/api/files/upload-token`,
          contentType: file.type || undefined,
          multipart: file.size > 50 * 1024 * 1024,
        });
        return {
          // In-app authed read URL (never the raw vendor URL); resolved
          // server-side via the pathname, same as the server-route path.
          url: `${base}/api/files/blob?pathname=${encodeURIComponent(blob.pathname)}`,
          name: file.name,
          contentType: file.type || blob.contentType,
        };
      }

      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${base}/api/files/upload`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType, name } = data;
        return {
          // Original filename for display (chip + "Parsed <name>" step). The
          // blob is resolved server-side via `url`, so this is display-only.
          name: name ?? pathname,
          url,
          contentType,
        };
      }
      // Anon (no account) → 401: file upload is a signed-in feature.
      if (response.status === 401) {
        toast.error("Sign in to upload files — it's free.");
        return;
      }
      const { error } = await response.json();
      toast.error(error ?? "Upload failed");
    } catch (error) {
      // Surface the real reason; the client-direct (>4MB) path 401s for anon too.
      const msg = error instanceof Error ? error.message : "";
      toast.error(
        /unauthorized|401/i.test(msg)
          ? "Sign in to upload files — it's free."
          : msg || "Failed to upload file, please try again!"
      );
    }
  }, []);

  // Shared upload path for the file picker AND drag-and-drop. Images need a
  // vision model (or Auto, which routes to one); PDFs work everywhere. Drop
  // images the current model can't see — never silently attach one it'll ignore.
  const processFiles = useCallback(
    async (picked: File[]) => {
      const files = picked.filter(
        (file) => !(file.type.startsWith("image/") && !canAttachImages)
      );
      if (files.length < picked.length) {
        toast.error(
          "This model can't see images. Switch to a vision model or Auto. (PDFs work on any model.)"
        );
      }
      if (files.length === 0) {
        return;
      }

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined
        );

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (_error) {
        toast.error("Failed to upload files");
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile, canAttachImages]
  );

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files || []);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await processFiles(picked);
    },
    [processFiles]
  );

  // Drag-and-drop onto the composer (Venice-style "Drop files here").
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const handleDragEnter = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer?.types?.includes("Files")) {
      return;
    }
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }, []);
  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault();
    }
  }, []);
  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragging(false);
    }
  }, []);
  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      const dropped = Array.from(event.dataTransfer?.files || []);
      if (dropped.length > 0) {
        await processFiles(dropped);
      }
    },
    [processFiles]
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }

      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith("image/")
      );

      if (imageItems.length === 0) {
        // Large text paste → a "Pasted text" attachment (Claude-style), so it
        // doesn't flood the composer (the inline text cap still covers small
        // pastes). Below the threshold, let the normal inline paste happen.
        const pastedText = event.clipboardData?.getData("text/plain") ?? "";
        if (pastedText.length > PASTE_TO_FILE_CHARS) {
          event.preventDefault();
          const file = new File([pastedText], "Pasted text.txt", {
            type: "text/plain",
          });
          setUploadQueue((prev) => [...prev, "Pasted text"]);
          try {
            const uploaded = await uploadFile(file);
            if (uploaded?.url) {
              setAttachments((curr) => [...curr, uploaded as Attachment]);
            }
          } catch (_error) {
            toast.error("Couldn't attach the pasted text — try again.");
          } finally {
            setUploadQueue([]);
          }
        }
        return;
      }

      event.preventDefault();

      // The model can't see images → don't silently attach one it'll ignore.
      // (Auto routes images to a vision model, so it's allowed.)
      if (!canAttachImages) {
        toast.error(
          "This model can't see images. Switch to a vision model or Auto to attach one."
        );
        return;
      }

      setUploadQueue((prev) => [...prev, "Pasted image"]);

      try {
        const uploadPromises = imageItems
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null)
          .map((file) => uploadFile(file));

        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) =>
            attachment !== undefined &&
            attachment.url !== undefined &&
            attachment.contentType !== undefined
        );

        setAttachments((curr) => [
          ...curr,
          ...(successfullyUploadedAttachments as Attachment[]),
        ]);
      } catch (_error) {
        toast.error("Failed to upload pasted image(s)");
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile, canAttachImages]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.addEventListener("paste", handlePaste);
    return () => textarea.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: file drag-and-drop dropzone wrapping the composer — a drop target, not an interactive control
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: file drag-and-drop dropzone wrapping the composer — a drop target, not an interactive control
    <div
      className={cn(
        "relative flex w-full flex-col gap-4 pb-[env(safe-area-inset-bottom)]",
        className
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-primary/40 border-dashed bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 font-medium text-foreground text-sm">
            <PaperclipIcon size={16} />
            Drop files here
          </div>
        </div>
      )}
      {editingMessage && onCancelEdit && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>Editing message</span>
          <button
            className="rounded px-1.5 py-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
            onMouseDown={(e) => {
              e.preventDefault();
              onCancelEdit();
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      )}

      <input
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        className="pointer-events-none fixed -top-4 -left-4 size-0.5 opacity-0"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />

      <div className="relative">
        {slashOpen && (
          <SlashCommandMenu
            onClose={() => setSlashOpen(false)}
            onSelect={handleSlashSelect}
            query={slashQuery}
            selectedIndex={slashIndex}
          />
        )}
      </div>

      {showCreditBanner && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/40 bg-card/70 px-3 py-2 text-[12px]">
          <span className="text-muted-foreground">
            Upgrade your plan, buy more credits, or{" "}
            <button
              className="font-medium text-foreground underline underline-offset-2 transition-opacity hover:opacity-80"
              onClick={() => {
                onModelChange?.(AUTO_MODEL_ID);
                setCookie("chat-model", AUTO_MODEL_ID);
              }}
              type="button"
            >
              switch to a free model
            </button>{" "}
            to continue.
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              className="h-7 rounded-lg px-2.5 text-[12px]"
              onClick={() =>
                router.push(
                  `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/settings/billing`
                )
              }
              size="sm"
              variant="outline"
            >
              Buy Credits
            </Button>
            <Button
              className="h-7 rounded-lg px-2.5 text-[12px]"
              onClick={openUpgrade}
              size="sm"
            >
              Upgrade Plan
            </Button>
          </div>
        </div>
      )}

      <PromptInput
        className={cn(
          "[&>div]:rounded-2xl [&>div]:border [&>div]:border-border/30 [&>div]:bg-card/70 [&>div]:shadow-[var(--shadow-composer)] [&>div]:transition-shadow [&>div]:duration-300 [&>div]:focus-within:shadow-[var(--shadow-composer-focus)]",
          // Confidential mode "lights up" the composer — an emerald lock glow.
          confidential &&
            "[&>div]:border-emerald-500/40 [&>div]:shadow-[0_0_0_1px_rgba(16,185,129,0.25),0_0_24px_-4px_rgba(16,185,129,0.35)]"
        )}
        onSubmit={() => {
          if (input.startsWith("/")) {
            const query = input.slice(1).trim();
            const cmd = slashCommands.find((c) => c.name === query);
            if (cmd) {
              handleSlashSelect(cmd);
            }
            return;
          }
          if (!input.trim() && attachments.length === 0) {
            return;
          }
          if (status === "ready" || status === "error") {
            submitForm();
          } else {
            toast.error("Please wait for the model to finish its response!");
          }
        }}
      >
        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <div
            className="flex w-full self-start flex-row gap-2 overflow-x-auto px-3 pt-3 no-scrollbar"
            data-testid="attachments-preview"
          >
            {attachments.map((attachment) => (
              <PreviewAttachment
                attachment={attachment}
                key={attachment.url}
                onRemove={() => {
                  setAttachments((currentAttachments) =>
                    currentAttachments.filter((a) => a.url !== attachment.url)
                  );
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              />
            ))}

            {uploadQueue.map((filename) => (
              <PreviewAttachment
                attachment={{
                  url: "",
                  name: filename,
                  contentType: "",
                }}
                isUploading={true}
                key={filename}
              />
            ))}
          </div>
        )}
        <PromptInputTextarea
          className="min-h-24 text-[13px] leading-relaxed px-4 pt-3.5 pb-1.5 placeholder:text-muted-foreground/35"
          data-testid="multimodal-input"
          onChange={handleInput}
          onKeyDown={(e) => {
            if (slashOpen) {
              const filtered = slashCommands.filter((cmd) =>
                cmd.name.startsWith(slashQuery.toLowerCase())
              );
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSlashIndex((i) => Math.min(i + 1, filtered.length - 1));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSlashIndex((i) => Math.max(i - 1, 0));
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                if (filtered[slashIndex]) {
                  handleSlashSelect(filtered[slashIndex]);
                }
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setSlashOpen(false);
                return;
              }
            }
            if (e.key === "Escape" && editingMessage && onCancelEdit) {
              e.preventDefault();
              onCancelEdit();
            }
          }}
          placeholder={
            editingMessage
              ? "Edit your message..."
              : (confidential
                  ? confidentialPlaceholders
                  : composerPlaceholders)[
                  placeholderIndex %
                    (confidential
                      ? confidentialPlaceholders
                      : composerPlaceholders
                    ).length
                ]
          }
          ref={textareaRef}
          value={input}
        />
        <PromptInputFooter className="px-3 pb-3">
          {/* Left: modes (Perplexity-style). Right: model + submit. */}
          <PromptInputTools className="min-w-0 flex-wrap gap-y-1">
            <AttachmentsButton fileInputRef={fileInputRef} status={status} />
            <ModeTabs
              canUsePremium={canUsePremium}
              confidential={confidential}
              onSelect={setConfidentialMode}
            />
            {/* Memory last — its "on" label changes width, so isolate it from
                the tabs to avoid shoving them. */}
            <MemoryToggle />
          </PromptInputTools>

          <div className="flex shrink-0 items-center gap-1">
            <ChatContextUsage
              messages={messages as ChatMessage[]}
              selectedModelId={selectedModelId}
            />
            {confidential ? (
              <ConfidentialModelSelector
                onSelect={pickConfidentialModel}
                selectedId={confidentialModelId}
              />
            ) : (
              <ModelSelectorCompact
                canUsePremium={canUsePremium}
                onModelChange={onModelChange}
                selectedModelId={selectedModelId}
              />
            )}
            {status === "submitted" ? (
              <StopButton setMessages={setMessages} stop={stop} />
            ) : (
              <PromptInputSubmit
                className={cn(
                  "h-7 w-7 rounded-xl transition-all duration-200",
                  input.trim() || attachments.length > 0
                    ? "bg-foreground text-background hover:opacity-85 active:scale-95"
                    : "bg-muted text-muted-foreground/25 cursor-not-allowed"
                )}
                data-testid="send-button"
                disabled={
                  (!input.trim() && attachments.length === 0) ||
                  uploadQueue.length > 0
                }
                status={status}
                variant="secondary"
              >
                <ArrowUpIcon className="size-4" />
              </PromptInputSubmit>
            )}
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (!equal(prevProps.attachments, nextProps.attachments)) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }
    if (prevProps.selectedModelId !== nextProps.selectedModelId) {
      return false;
    }
    if (prevProps.editingMessage !== nextProps.editingMessage) {
      return false;
    }
    if (prevProps.messages.length !== nextProps.messages.length) {
      return false;
    }

    return true;
  }
);

function PureAttachmentsButton({
  fileInputRef,
  status,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
}) {
  // Always enabled — PDFs work on every model (extracted to text), and image
  // attachments are guarded at file-pick time (vision models / Auto only).
  return (
    <Button
      className="h-7 w-7 rounded-lg border border-border/40 p-1 text-foreground transition-colors hover:border-border hover:text-foreground"
      data-testid="attachments-button"
      disabled={status !== "ready"}
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      title="Attach an image or PDF"
      variant="ghost"
    >
      <PaperclipIcon size={14} style={{ width: 14, height: 14 }} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

// Honest privacy labels (SPEC_AUDRIC_V3 §5c). At launch every model rides the
// Vercel AI Gateway → `anon`. NEVER relabel a gateway model `private` (the
// Human names for provider slugs — group headings + the "Powered by" line in
// the model hover panel (v0-style).
const PROVIDER_NAMES: Record<string, string> = {
  alibaba: "Alibaba",
  anthropic: "Anthropic",
  "arcee-ai": "Arcee AI",
  bytedance: "ByteDance",
  cohere: "Cohere",
  deepseek: "DeepSeek",
  google: "Google",
  inception: "Inception",
  kwaipilot: "Kwaipilot",
  meituan: "Meituan",
  meta: "Meta",
  minimax: "MiniMax",
  mistral: "Mistral",
  moonshotai: "Moonshot",
  morph: "Morph",
  nvidia: "Nvidia",
  openai: "OpenAI",
  perplexity: "Perplexity",
  "prime-intellect": "Prime Intellect",
  qwen: "Qwen",
  xiaomi: "Xiaomi",
  xai: "xAI",
  zai: "Zai",
  phala: "Phala",
};

// no-overclaim rule). Venice's styling (teal/purple/blue pills + hover tip) is
// matched; its "Kimi = Private" labeling is deliberately NOT copied.
const PRIVACY_BADGE: Record<
  ModelPrivacyTier | "confidential",
  { label: string; className: string; tip: string }
> = {
  anon: {
    label: "Anon",
    className: "bg-muted text-muted-foreground",
    tip: "Anonymized upstream",
  },
  private: {
    label: "Private",
    className: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    tip: "Zero data retention",
  },
  local: {
    label: "Local",
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    tip: "Self-hosted · private",
  },
  confidential: {
    label: "Confidential",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    tip: "GPU-TEE · verifiable",
  },
};

// v0-style hover detail panel — rows stay clean (icon · name · check); all the
// detail (description, "Powered by", pricing, capabilities, privacy) lives
// here, shown on hover beside the list. Touch devices never hover → the list
// simply stays compact (v0 mobile behavior).
function ModelHoverPanel({
  children,
  name,
  description,
  provider,
  free,
  locked,
  isAuthed,
  pricing,
  cap,
  privacy,
}: {
  children: React.ReactNode;
  name: string;
  description?: string;
  provider?: string;
  free?: boolean;
  locked?: boolean;
  isAuthed?: boolean;
  pricing?: { inputPer1M?: number; outputPer1M?: number };
  cap?: { tools?: boolean; vision?: boolean; reasoning?: boolean };
  privacy?: ModelPrivacyTier | "confidential";
}) {
  const price = (n?: number) =>
    typeof n === "number" && Number.isFinite(n) ? `$${n.toFixed(2)}` : null;
  const input = price(pricing?.inputPer1M);
  const output = price(pricing?.outputPer1M);
  const capList = [
    cap?.tools && "Tools",
    cap?.vision && "Vision",
    cap?.reasoning && "Reasoning",
  ].filter(Boolean) as string[];

  return (
    <HoverCard closeDelay={0} openDelay={150}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-64 rounded-xl border-border/60 bg-card/95 p-3 shadow-[var(--shadow-float)] backdrop-blur-xl"
        side="right"
        sideOffset={10}
      >
        <p className="font-medium text-[13px] text-foreground leading-snug">
          {description ?? name}
        </p>
        {provider && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ModelSelectorLogo provider={provider} />
            Powered by {PROVIDER_NAMES[provider] ?? provider}
          </div>
        )}
        {(input || output || free) && (
          <div className="mt-2.5 space-y-0.5 border-border/40 border-t pt-2.5 text-[11px] text-muted-foreground tabular-nums">
            {free ? (
              <div className="text-emerald-600 dark:text-emerald-400">
                Free — no credit cost
              </div>
            ) : (
              <>
                {input && <div>{input}/1M input tokens</div>}
                {output && <div>{output}/1M output tokens</div>}
              </>
            )}
          </div>
        )}
        {(capList.length > 0 || privacy) && (
          <div className="mt-2.5 flex items-center gap-2 border-border/40 border-t pt-2.5">
            {capList.length > 0 && (
              <span className="text-[10.5px] text-muted-foreground">
                {capList.join(" · ")}
              </span>
            )}
            {privacy && (
              <span
                className={cn(
                  "ml-auto rounded px-1 py-0.5 font-medium text-[9px] uppercase tracking-wide",
                  PRIVACY_BADGE[privacy].className
                )}
              >
                {PRIVACY_BADGE[privacy].label}
              </span>
            )}
          </div>
        )}
        {locked && (
          <p className="mt-2.5 border-border/40 border-t pt-2.5 text-[10.5px] text-muted-foreground">
            {isAuthed ? "Upgrade to unlock" : "Sign up to unlock"}
          </p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

function PureModelSelectorCompact({
  selectedModelId,
  onModelChange,
  canUsePremium,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  // False for anon AND signed-in users with no subscription/credit → premium
  // models are locked (Perplexity pattern); tapping one routes to upgrade.
  canUsePremium: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { openUpgrade } = useUpgradeModal();
  const { status: authStatus } = useZkLogin();
  const isAuthed = authStatus === "authenticated";
  const { data: modelsData } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );

  const capabilities:
    | Record<string, { tools: boolean; vision: boolean; reasoning: boolean }>
    | undefined = modelsData?.capabilities;
  const pricing:
    | Record<string, { inputPer1M?: number; outputPer1M?: number }>
    | undefined = modelsData?.pricing;
  const dynamicModels: ChatModel[] | undefined = modelsData?.models;
  // "Auto" leads the curated lineup — the intelligent default.
  const curatedList = [AUTO_MODEL, ...chatModels];
  const activeModels = dynamicModels
    ? [AUTO_MODEL, ...dynamicModels]
    : curatedList;

  const selectedModel =
    activeModels.find((m: ChatModel) => m.id === selectedModelId) ??
    activeModels.find((m: ChatModel) => m.id === AUTO_MODEL_ID) ??
    activeModels[0];
  const [provider] = selectedModel.id.split("/");

  return (
    <ModelSelector onOpenChange={setOpen} open={open}>
      <ModelSelectorTrigger asChild>
        <Button
          className="h-7 max-w-[200px] justify-between gap-1.5 rounded-lg px-2 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          data-testid="model-selector"
          variant="ghost"
        >
          {selectedModel.id === AUTO_MODEL_ID ? (
            <SparklesIcon className="size-4" />
          ) : (
            provider && <ModelSelectorLogo provider={provider} />
          )}
          {/* Mobile: provider icon only (Perplexity-style); name on desktop. */}
          <ModelSelectorName className="hidden sm:inline">
            {selectedModel.name}
          </ModelSelectorName>
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorList>
          {(() => {
            const curatedIds = new Set(curatedList.map((m) => m.id));
            const allModels = dynamicModels
              ? [
                  ...curatedList,
                  ...dynamicModels.filter((m) => !curatedIds.has(m.id)),
                ]
              : curatedList;

            const grouped: Record<
              string,
              { model: ChatModel; curated: boolean }[]
            > = {};
            for (const model of allModels) {
              const key = curatedIds.has(model.id)
                ? "_available"
                : model.provider;
              if (!grouped[key]) {
                grouped[key] = [];
              }
              grouped[key].push({ model, curated: curatedIds.has(model.id) });
            }

            const sortedKeys = Object.keys(grouped).sort((a, b) => {
              if (a === "_available") {
                return -1;
              }
              if (b === "_available") {
                return 1;
              }
              return a.localeCompare(b);
            });

            return sortedKeys.map((key) => (
              <ModelSelectorGroup
                heading={
                  key === "_available"
                    ? "Available"
                    : (PROVIDER_NAMES[key] ?? key)
                }
                key={key}
              >
                {grouped[key].map(({ model, curated }) => {
                  const logoProvider = model.id.split("/")[0];
                  // Premium models are locked for anyone who can't use premium —
                  // anon AND signed-in users with no subscription/credit
                  // (Perplexity pattern). Tapping a locked model routes to the
                  // upgrade path (pricing for anon, billing for signed-in).
                  const locked =
                    !canUsePremium &&
                    model.free !== true &&
                    model.id !== AUTO_MODEL_ID;
                  const isSelected = model.id === selectedModel.id;
                  // v0-style: clean row (icon · name · check/lock); every
                  // detail lives in the hover panel beside the list.
                  return (
                    <ModelHoverPanel
                      cap={capabilities?.[model.id]}
                      description={
                        model.id === AUTO_MODEL_ID
                          ? "Picks the best model for each message"
                          : model.bestFor
                      }
                      free={model.free}
                      isAuthed={isAuthed}
                      key={model.id}
                      locked={locked}
                      name={model.name}
                      pricing={
                        model.id === AUTO_MODEL_ID
                          ? undefined
                          : pricing?.[model.id]
                      }
                      privacy={model.privacy}
                      provider={
                        model.id === AUTO_MODEL_ID ? undefined : logoProvider
                      }
                    >
                      <ModelSelectorItem
                        className={cn(
                          "flex w-full items-center gap-2 py-2",
                          !curated && "cursor-default opacity-40",
                          locked && "opacity-60"
                        )}
                        onSelect={() => {
                          if (!curated) {
                            return;
                          }
                          if (locked) {
                            setOpen(false);
                            openUpgrade();
                            return;
                          }
                          onModelChange?.(model.id);
                          setCookie("chat-model", model.id);
                          setOpen(false);
                          setTimeout(() => {
                            document
                              .querySelector<HTMLTextAreaElement>(
                                "[data-testid='multimodal-input']"
                              )
                              ?.focus();
                          }, 50);
                        }}
                        value={model.id}
                      >
                        {model.id === AUTO_MODEL_ID ? (
                          <SparklesIcon className="size-4" />
                        ) : (
                          <ModelSelectorLogo provider={logoProvider} />
                        )}
                        <ModelSelectorName>{model.name}</ModelSelectorName>
                        <span className="ml-auto flex items-center">
                          {isSelected ? (
                            <CheckIcon className="size-4 text-foreground" />
                          ) : (
                            (locked || !curated) && (
                              <LockIcon className="size-3.5 text-muted-foreground/50" />
                            )
                          )}
                        </span>
                      </ModelSelectorItem>
                    </ModelHoverPanel>
                  );
                })}
              </ModelSelectorGroup>
            ));
          })()}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}

const ModelSelectorCompact = memo(PureModelSelectorCompact);

// Private Memory opt-in toggle (SPEC_AUDRIC_V3 §7c) — authed + memory-configured
// only, OFF by default, persisted in localStorage and read per-request by the
// chat transport. ON → the agent recalls this user's memories + can save_memory.
function PureMemoryToggle() {
  const { status: authStatus } = useZkLogin();
  const { data } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(window.localStorage.getItem("audric-memory") === "1");
  }, []);

  if (authStatus !== "authenticated" || !data?.memoryEnabled) {
    return null;
  }

  const toggle = () => {
    const next = !on;
    setOn(next);
    window.localStorage.setItem("audric-memory", next ? "1" : "0");
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className={cn(
            "h-7 gap-1.5 rounded-lg px-2 text-[12px] transition-colors",
            on
              ? "bg-foreground/10 text-foreground ring-1 ring-border ring-inset"
              : "text-muted-foreground/40 hover:text-foreground"
          )}
          onClick={toggle}
          type="button"
          variant="ghost"
        >
          <BrainIcon className="size-3.5" />
          <span>{on ? "Memory on" : "Memory"}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Encrypted memory</TooltipContent>
    </Tooltip>
  );
}

const MemoryToggle = memo(PureMemoryToggle);

// Composer mode tabs — a segmented control of mutually-exclusive modes:
// Private (default · ZDR) · Confidential (GPU-TEE, auto-anchored on Sui) ·
// Computer (roadmap, disabled). Desktop shows labels; mobile shows icons only.
// Confidential is Pro-gated at send-time. The composer "lights up" (emerald glow)
// + the header shield / greeting react to the Confidential selection via parent.
function PureModeTabs({
  confidential,
  onSelect,
  canUsePremium,
}: {
  confidential: boolean;
  onSelect: (next: boolean) => void;
  canUsePremium: boolean;
}) {
  const seg =
    "flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors";
  const active = "bg-foreground/10 text-foreground";
  const idle = "text-muted-foreground/50 hover:text-foreground";
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-foreground/[0.04] p-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(seg, confidential ? idle : active)}
            onClick={() => onSelect(false)}
            type="button"
          >
            <ShieldCheckIcon className="size-3.5" />
            <span className="hidden sm:inline">Private</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>Private · ZDR</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(seg, confidential ? active : idle)}
            onClick={() => onSelect(true)}
            type="button"
          >
            <LockIcon className="size-3.5" />
            <span className="hidden sm:inline">Confidential</span>
            {!canUsePremium && (
              <span className="rounded bg-muted px-1 py-px text-[9px] text-muted-foreground/70">
                Pro
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>GPU-TEE · verifiable</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-disabled="true"
            className={cn(seg, "cursor-default text-muted-foreground/40")}
            onClick={(e) => e.preventDefault()}
            type="button"
          >
            <MonitorIcon className="size-3.5" />
            <span className="hidden sm:inline">Computer</span>
            <span className="hidden rounded bg-muted px-1 py-px text-[9px] text-muted-foreground/60 sm:inline">
              Soon
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>Agentic money-native workflows</TooltipContent>
      </Tooltip>
    </div>
  );
}

const ModeTabs = memo(PureModeTabs);

type ConfidentialModelOption = {
  id: string;
  name: string;
  provider?: string;
  reasoning?: boolean;
  bestFor?: string;
  inputPer1M?: number;
  outputPer1M?: number;
};

// Model picker shown IN PLACE of the normal selector when Confidential is on —
// lists only the GPU-TEE (phala/*) catalog, marked "TEE". The pick drives which
// confidential model runs (persisted; sent as the model id by the transport).
function PureConfidentialModelSelector({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );
  const models: ConfidentialModelOption[] = data?.confidentialModels ?? [];
  const selected = models.find((m) => m.id === selectedId);
  const label = selected?.name.replace(" (Confidential)", "") ?? "GPT-OSS 120B";

  return (
    <ModelSelector onOpenChange={setOpen} open={open}>
      <ModelSelectorTrigger asChild>
        <Button
          className="h-7 max-w-[200px] justify-between gap-1.5 rounded-lg px-2 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          type="button"
          variant="ghost"
        >
          {selected?.provider ? (
            <ModelSelectorLogo provider={selected.provider} />
          ) : (
            <LockIcon className="size-3.5" />
          )}
          {/* Mobile: provider icon only (Perplexity-style); name on desktop. */}
          <ModelSelectorName className="hidden sm:inline">
            {label}
          </ModelSelectorName>
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorList>
          {models.map((m) => (
            <ModelHoverPanel
              cap={m.reasoning ? { reasoning: true } : undefined}
              description={m.bestFor}
              key={m.id}
              name={m.name.replace(" (Confidential)", "")}
              pricing={{ inputPer1M: m.inputPer1M, outputPer1M: m.outputPer1M }}
              privacy="confidential"
              provider={m.provider}
            >
              <ModelSelectorItem
                className="flex w-full items-center gap-2 py-2"
                onSelect={() => {
                  onSelect(m.id);
                  setOpen(false);
                }}
                value={m.id}
              >
                {m.provider ? (
                  <ModelSelectorLogo provider={m.provider} />
                ) : (
                  <LockIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
                )}
                <ModelSelectorName>
                  {m.name.replace(" (Confidential)", "")}
                </ModelSelectorName>
                {m.id === selectedId && (
                  <CheckIcon className="ml-auto size-4 text-foreground" />
                )}
              </ModelSelectorItem>
            </ModelHoverPanel>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}

const ConfidentialModelSelector = memo(PureConfidentialModelSelector);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  return (
    <Button
      className="h-7 w-7 rounded-xl bg-foreground p-1 text-background transition-all duration-200 hover:opacity-85 active:scale-95 disabled:bg-muted disabled:text-muted-foreground/25 disabled:cursor-not-allowed"
      data-testid="stop-button"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);
