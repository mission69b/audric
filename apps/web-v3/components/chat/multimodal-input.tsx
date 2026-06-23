"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import {
  ArrowUpIcon,
  BrainIcon,
  EyeIcon,
  LockIcon,
  SparklesIcon,
  WrenchIcon,
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
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { useZkLogin } from "@/components/auth/zklogin-provider";
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
  type ModelCapabilities,
  type ModelPricing,
  type ModelPrivacyTier,
} from "@/lib/ai/models";
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
  const { setTheme, resolvedTheme } = useTheme();
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
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);

  const submitForm = useCallback(() => {
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
  ]);

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/files/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType } = data;

        return {
          url,
          name: pathname,
          contentType,
        };
      }
      const { error } = await response.json();
      toast.error(error);
    } catch (_error) {
      toast.error("Failed to upload file, please try again!");
    }
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

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
    [setAttachments, uploadFile]
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
        return;
      }

      event.preventDefault();

      // The model can't see images → don't silently attach one it'll ignore.
      if (!modelHasVision) {
        toast.error(
          "This model can't see images. Switch to a vision model (e.g. GPT-5.5 or Claude) to attach one."
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
    [setAttachments, uploadFile, modelHasVision]
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
    <div className={cn("relative flex w-full flex-col gap-4", className)}>
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

      <PromptInput
        className="[&>div]:rounded-2xl [&>div]:border [&>div]:border-border/30 [&>div]:bg-card/70 [&>div]:shadow-[var(--shadow-composer)] [&>div]:transition-shadow [&>div]:duration-300 [&>div]:focus-within:shadow-[var(--shadow-composer-focus)]"
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
            editingMessage ? "Edit your message..." : "Ask anything..."
          }
          ref={textareaRef}
          value={input}
        />
        <PromptInputFooter className="px-3 pb-3">
          <PromptInputTools>
            <AttachmentsButton
              fileInputRef={fileInputRef}
              selectedModelId={selectedModelId}
              status={status}
            />
            <ModelSelectorCompact
              onModelChange={onModelChange}
              selectedModelId={selectedModelId}
            />
            <ChatContextUsage
              messages={messages as ChatMessage[]}
              selectedModelId={selectedModelId}
            />
            <MemoryToggle />
          </PromptInputTools>

          {status === "submitted" ? (
            <StopButton setMessages={setMessages} stop={stop} />
          ) : (
            <PromptInputSubmit
              className={cn(
                "h-7 w-7 rounded-xl transition-all duration-200",
                input.trim()
                  ? "bg-foreground text-background hover:opacity-85 active:scale-95"
                  : "bg-muted text-muted-foreground/25 cursor-not-allowed"
              )}
              data-testid="send-button"
              disabled={!input.trim() || uploadQueue.length > 0}
              status={status}
              variant="secondary"
            >
              <ArrowUpIcon className="size-4" />
            </PromptInputSubmit>
          )}
        </PromptInputFooter>
      </PromptInput>
      {/* Ambient privacy cue — the ZDR guarantee is present every turn, not just
          inside the model switcher (SPEC_AUDRIC_V3 §5c privacy-by-default). */}
      <div className="mt-1.5 flex items-center justify-center gap-1 text-[10px] text-muted-foreground/40">
        <LockIcon className="size-2.5" />
        <span>
          Private · zero data retention — your chats are never training data.
        </span>
      </div>
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
  selectedModelId,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
  selectedModelId: string;
}) {
  const { data: modelsResponse } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );

  const caps: Record<string, ModelCapabilities> | undefined =
    modelsResponse?.capabilities ?? modelsResponse;
  const hasVision = caps?.[selectedModelId]?.vision ?? false;

  return (
    <Button
      className={cn(
        "h-7 w-7 rounded-lg border border-border/40 p-1 transition-colors",
        hasVision
          ? "text-foreground hover:border-border hover:text-foreground"
          : "text-muted-foreground/30 cursor-not-allowed"
      )}
      data-testid="attachments-button"
      disabled={status !== "ready" || !hasVision}
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      variant="ghost"
    >
      <PaperclipIcon size={14} style={{ width: 14, height: 14 }} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

// Honest privacy labels (SPEC_AUDRIC_V3 §5c). At launch every model rides the
// Vercel AI Gateway → `anon`. NEVER relabel a gateway model `private` (the
// no-overclaim rule). Venice's styling (teal/purple/blue pills + hover tip) is
// matched; its "Kimi = Private" labeling is deliberately NOT copied.
const PRIVACY_BADGE: Record<
  ModelPrivacyTier,
  { label: string; className: string; tip: string }
> = {
  anon: {
    label: "Anon",
    className: "bg-muted text-muted-foreground",
    tip: "Gateway-routed; upstream provider may retain anonymized prompts.",
  },
  private: {
    label: "Private",
    className: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    tip: "Zero data retention — your prompts are never stored or trained on.",
  },
  confidential: {
    label: "Confidential",
    className: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    tip: "End-to-end TEE inference — not even the provider can read your prompt. Every response is TEE-signed, verifiable per request.",
  },
  local: {
    label: "Local",
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    tip: "Self-hosted — prompts stay private.",
  },
};

function PureModelSelectorCompact({
  selectedModelId,
  onModelChange,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { status: authStatus, login } = useZkLogin();
  const isAuthed = authStatus === "authenticated";
  const { data: modelsData } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );

  const pricing: Record<string, ModelPricing> | undefined = modelsData?.pricing;
  const capabilities:
    | Record<string, { tools: boolean; vision: boolean; reasoning: boolean }>
    | undefined = modelsData?.capabilities;
  const dynamicModels: ChatModel[] | undefined = modelsData?.models;
  // Confidential (TEE) models are only routable when the server reports the
  // tier configured — fold them into the curated lineup exactly then.
  const confidentialModels: ChatModel[] = modelsData?.confidentialEnabled
    ? (modelsData.confidentialModels ?? [])
    : [];
  // "Auto" leads the curated lineup — the intelligent default.
  const curatedList = [AUTO_MODEL, ...chatModels, ...confidentialModels];
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
          <ModelSelectorName>{selectedModel.name}</ModelSelectorName>
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models..." />
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

            const providerNames: Record<string, string> = {
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
              xiaomi: "Xiaomi",
              xai: "xAI",
              zai: "Zai",
            };

            return sortedKeys.map((key) => (
              <ModelSelectorGroup
                heading={
                  key === "_available"
                    ? "Available"
                    : (providerNames[key] ?? key)
                }
                key={key}
              >
                {grouped[key].map(({ model, curated }) => {
                  const logoProvider = model.id.split("/")[0];
                  // Premium models are locked for anonymous users (only the
                  // free Fast model is usable signed-out) — clicking a locked
                  // model starts the sign-in flow (Perplexity pattern).
                  const locked =
                    !isAuthed &&
                    model.free !== true &&
                    model.id !== AUTO_MODEL_ID;
                  return (
                    <ModelSelectorItem
                      className={cn(
                        "flex w-full",
                        model.id === selectedModel.id &&
                          "border-b border-dashed border-foreground/50",
                        !curated && "opacity-40 cursor-default",
                        locked && "opacity-60"
                      )}
                      key={model.id}
                      onSelect={() => {
                        if (!curated) {
                          return;
                        }
                        if (locked) {
                          setOpen(false);
                          login();
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
                      <div className="flex min-w-0 flex-col">
                        <ModelSelectorName>{model.name}</ModelSelectorName>
                        {model.bestFor && (
                          <span className="truncate text-[10px] text-muted-foreground/50">
                            {model.bestFor}
                          </span>
                        )}
                      </div>
                      <div className="ml-auto flex items-center gap-2 text-foreground/70">
                        {(() => {
                          const cap = capabilities?.[model.id];
                          if (!cap) {
                            return null;
                          }
                          return (
                            <span className="flex items-center gap-1 text-muted-foreground/45">
                              {cap.tools && (
                                <WrenchIcon
                                  aria-label="Tool use"
                                  className="size-3"
                                />
                              )}
                              {cap.vision && (
                                <EyeIcon
                                  aria-label="Vision"
                                  className="size-3"
                                />
                              )}
                              {cap.reasoning && (
                                <BrainIcon
                                  aria-label="Reasoning"
                                  className="size-3"
                                />
                              )}
                            </span>
                          );
                        })()}
                        {locked && (
                          <LockIcon className="size-3.5 text-muted-foreground/70" />
                        )}
                        {model.id === AUTO_MODEL_ID && (
                          <span className="rounded bg-foreground/10 px-1 py-0.5 font-medium text-[9px] text-foreground/70 uppercase tracking-wide">
                            Default
                          </span>
                        )}
                        {(() => {
                          const p = pricing?.[model.id];
                          if (model.free) {
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[10px] text-emerald-500 tabular-nums">
                                    Free
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Free — included at no credit cost.
                                </TooltipContent>
                              </Tooltip>
                            );
                          }
                          if (!p) {
                            return null;
                          }
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[10px] tabular-nums">
                                  ${p.inputPer1M.toFixed(2)}/1M
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {`Input $${p.inputPer1M.toFixed(2)} · Output $${p.outputPer1M.toFixed(2)} per 1M tokens`}
                              </TooltipContent>
                            </Tooltip>
                          );
                        })()}
                        {model.privacy && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={cn(
                                  "rounded px-1 py-0.5 font-medium text-[9px] uppercase tracking-wide",
                                  PRIVACY_BADGE[model.privacy].className
                                )}
                              >
                                {PRIVACY_BADGE[model.privacy].label}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[220px]">
                              {PRIVACY_BADGE[model.privacy].tip}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {!curated && (
                          <LockIcon className="size-3 text-muted-foreground/50" />
                        )}
                      </div>
                    </ModelSelectorItem>
                  );
                })}
              </ModelSelectorGroup>
            ));
          })()}
        </ModelSelectorList>
        <div className="border-border/40 border-t px-3 py-2">
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-muted-foreground/40">Anon</span>
            <span className="text-muted-foreground/30">→</span>
            <span className="rounded bg-teal-500/10 px-1 py-0.5 font-medium text-teal-600 dark:text-teal-400">
              Private · ZDR
            </span>
            <span className="text-muted-foreground/30">→</span>
            {modelsData?.confidentialEnabled ? (
              <span className="rounded bg-purple-500/10 px-1 py-0.5 font-medium text-purple-600 dark:text-purple-400">
                Confidential · TEE
              </span>
            ) : (
              <span className="text-muted-foreground/40">Confidential</span>
            )}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground/50">
            {modelsData?.confidentialEnabled
              ? "Every chat is zero-retention. Confidential models run in a TEE — verifiable, unreadable even to us."
              : "Every chat is zero-retention. Confidential (TEE, verifiable) is coming."}
          </p>
        </div>
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
              ? "text-foreground"
              : "text-muted-foreground/50 hover:text-foreground"
          )}
          onClick={toggle}
          type="button"
          variant="ghost"
        >
          <BrainIcon className="size-3.5" />
          {on ? "Memory on" : "Memory"}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[220px]">
        {on
          ? "Private Encrypted Memory · on — remembered across chats, deletable anytime."
          : "Private Encrypted Memory · off — remember preferences across chats; encrypted, deletable."}
      </TooltipContent>
    </Tooltip>
  );
}

const MemoryToggle = memo(PureMemoryToggle);

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
