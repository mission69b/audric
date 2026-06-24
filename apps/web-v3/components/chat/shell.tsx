"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useActiveChat } from "@/hooks/use-active-chat";
import {
  initialArtifactData,
  useArtifact,
  useArtifactSelector,
} from "@/hooks/use-artifact";
import type { Attachment, ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Artifact } from "./artifact";
import { ChatHeader } from "./chat-header";
import { DataStreamHandler } from "./data-stream-handler";
import { Greeting } from "./greeting";
import { submitEditedMessage } from "./message-editor";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { SuggestedActions } from "./suggested-actions";

export function ChatShell() {
  const {
    chatId,
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    addToolApprovalResponse,
    input,
    setInput,
    visibilityType,
    isReadonly,
    isLoading,
    votes,
    currentModelId,
    setCurrentModelId,
    showCreditCardAlert,
    setShowCreditCardAlert,
  } = useActiveChat();

  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(
    null
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);
  const { setArtifact } = useArtifact();

  const stopRef = useRef(stop);
  stopRef.current = stop;

  const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    if (prevChatIdRef.current !== chatId) {
      prevChatIdRef.current = chatId;
      stopRef.current();
      setArtifact(initialArtifactData);
      setEditingMessage(null);
      setAttachments([]);
    }
  }, [chatId, setArtifact]);

  // Chips auto-send their starter prompt (Venice-style) — same path as the
  // composer submit (push the chat URL, then send a plain user text message).
  const sendStarter = (text: string) => {
    window.history.pushState(
      {},
      "",
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/chat/${chatId}`
    );
    sendMessage({ role: "user", parts: [{ type: "text", text }] });
  };

  // ChatGPT-style empty state: greeting + composer centered until the first
  // message; then the composer drops to the sticky bottom over the transcript.
  const isEmpty = messages.length === 0;
  const composer = isReadonly ? null : (
    <MultimodalInput
      attachments={attachments}
      chatId={chatId}
      editingMessage={editingMessage}
      input={input}
      messages={messages}
      onCancelEdit={() => {
        setEditingMessage(null);
        setInput("");
      }}
      onModelChange={setCurrentModelId}
      selectedModelId={currentModelId}
      selectedVisibilityType={visibilityType}
      sendMessage={
        editingMessage
          ? async () => {
              const msg = editingMessage;
              setEditingMessage(null);
              await submitEditedMessage({
                message: msg,
                text: input,
                setMessages,
                regenerate,
              });
              setInput("");
            }
          : sendMessage
      }
      setAttachments={setAttachments}
      setInput={setInput}
      setMessages={setMessages}
      status={status}
      stop={stop}
    />
  );

  return (
    <>
      <div className="flex h-dvh w-full flex-row overflow-hidden">
        <div
          className={cn(
            "flex min-w-0 flex-col bg-sidebar transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            isArtifactVisible ? "w-[40%]" : "w-full"
          )}
        >
          <ChatHeader
            chatId={chatId}
            isReadonly={isReadonly}
            selectedVisibilityType={visibilityType}
          />

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background md:rounded-tl-[12px] md:border-t md:border-l md:border-border/40">
            {isEmpty ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-2 pb-16 md:px-4">
                <Greeting />
                <div className="w-full max-w-4xl">{composer}</div>
                {/* Keep the chips mounted so typing fades them out WITHOUT
                    reflowing the centered column (no composer jump). */}
                {!isReadonly && (
                  <div
                    className={cn(
                      "transition-opacity duration-200",
                      (input.length > 0 || attachments.length > 0) &&
                        "pointer-events-none opacity-0"
                    )}
                  >
                    <SuggestedActions onSend={sendStarter} />
                  </div>
                )}
              </div>
            ) : (
              <>
                <Messages
                  addToolApprovalResponse={addToolApprovalResponse}
                  chatId={chatId}
                  isArtifactVisible={isArtifactVisible}
                  isLoading={isLoading}
                  isReadonly={isReadonly}
                  messages={messages}
                  onEditMessage={(msg) => {
                    const text = msg.parts
                      ?.filter((p) => p.type === "text")
                      .map((p) => p.text)
                      .join("");
                    setInput(text ?? "");
                    setEditingMessage(msg);
                  }}
                  regenerate={regenerate}
                  selectedModelId={currentModelId}
                  setMessages={setMessages}
                  status={status}
                  votes={votes}
                />

                <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
                  {composer}
                </div>
              </>
            )}
          </div>
        </div>

        <Artifact
          addToolApprovalResponse={addToolApprovalResponse}
          attachments={attachments}
          chatId={chatId}
          input={input}
          isReadonly={isReadonly}
          messages={messages}
          regenerate={regenerate}
          selectedModelId={currentModelId}
          selectedVisibilityType={visibilityType}
          sendMessage={sendMessage}
          setAttachments={setAttachments}
          setInput={setInput}
          setMessages={setMessages}
          status={status}
          stop={stop}
          votes={votes}
        />
      </div>

      <DataStreamHandler />

      <AlertDialog
        onOpenChange={setShowCreditCardAlert}
        open={showCreditCardAlert}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>AI temporarily unavailable</AlertDialogTitle>
            <AlertDialogDescription>
              The AI service is temporarily unavailable
              {process.env.NODE_ENV === "production"
                ? ". Please try again shortly."
                : " — the AI Gateway needs billing activated to continue."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {process.env.NODE_ENV === "production" ? "OK" : "Cancel"}
            </AlertDialogCancel>
            {process.env.NODE_ENV !== "production" && (
              <AlertDialogAction
                onClick={() => {
                  window.open(
                    "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card",
                    "_blank"
                  );
                  window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;
                }}
              >
                Activate
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
