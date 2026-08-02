import {
  createAnonymousSessionFetch,
  prepareAttachmentParts,
  type QueuedFollowUp,
} from "@emi/core/web";
import { createChatRuntime, type Attachment, type ChatMessage } from "@emi/core";
import { ChatProvider, useChatActions, useChatRuntime, useChatSelector } from "@emi/core/react";
import {
  Button,
  ChatComposer,
  ChatHeader,
  ChatSidebar,
  ConversationList,
  FollowUpQueue,
  MemoryPanel,
  MessageViewport,
  SettingsPanel,
} from "@emi/core/web/styled";
import type { FileUIPart, UIMessage } from "ai";
import { useMemo, useRef } from "react";

import "./app.css";
import { genericChatAppConfig } from "./app-config.ts";

export const App = () => {
  const apiOrigin = (import.meta.env.VITE_API_ORIGIN ?? "").replace(/\/$/, "");
  const fetcher = useMemo(
    () =>
      createAnonymousSessionFetch({
        apiOrigin,
        fetch: window.fetch.bind(window),
      }),
    [apiOrigin],
  );
  const runtime = useMemo(
    () =>
      createChatRuntime({
        transport: { baseUrl: `${apiOrigin}/api`, fetch: fetcher },
        storage: {
          settings: {
            get: (key) => window.localStorage.getItem(key),
            set: (key, value) => window.localStorage.setItem(key, value),
            remove: (key) => window.localStorage.removeItem(key),
          },
          drafts: {
            get: (key) => window.localStorage.getItem(key),
            set: (key, value) => window.localStorage.setItem(key, value),
            remove: (key) => window.localStorage.removeItem(key),
          },
          keys: {
            settings: genericChatAppConfig.settingsStorageKey,
            drafts: `${genericChatAppConfig.settingsStorageKey}:draft`,
          },
        },
        browser: {
          online: navigator.onLine,
          subscribeOnline: (listener) => {
            const update = () => listener(navigator.onLine);
            window.addEventListener("online", update);
            window.addEventListener("offline", update);
            return () => {
              window.removeEventListener("online", update);
              window.removeEventListener("offline", update);
            };
          },
        },
        identity: { createId: () => crypto.randomUUID(), now: () => new Date().toISOString() },
        features: { attachments: true, memories: true, branches: true },
      }),
    [apiOrigin, fetcher],
  );

  return (
    <ChatProvider runtime={runtime}>
      <ChatScreen />
    </ChatProvider>
  );
};

const toLegacyParts = (parts: ChatMessage["parts"]): UIMessage["parts"] => {
  const result: UIMessage["parts"] = [];
  for (const part of parts) {
    if (part.type === "text") result.push({ type: "text", text: part.text });
    if (part.type === "reasoning") result.push({ type: "reasoning", text: part.text });
    if (part.type === "file")
      result.push({
        type: "file",
        mediaType: part.file.mediaType,
        filename: part.file.name,
        url: part.file.url,
      });
  }
  return result;
};

const toLegacyMessage = (message: ChatMessage): UIMessage => ({
  id: message.id,
  role: message.role === "tool" ? "assistant" : message.role,
  parts: toLegacyParts(message.parts),
});

const toAttachment = (file: FileUIPart): Attachment => ({
  id: `attachment:${file.url}`,
  name: file.filename ?? "attachment",
  mediaType: file.mediaType,
  url: file.url,
});

const toLegacyFile = (attachment: Attachment): FileUIPart => ({
  type: "file",
  filename: attachment.name,
  mediaType: attachment.mediaType,
  url: attachment.url,
});

const ChatScreen = () => {
  const runtime = useChatRuntime();
  const actions = useChatActions();
  const activeThread = useChatSelector(runtime.selectors.activeThread);
  const composer = useChatSelector(runtime.selectors.composer);
  const conversationList = useChatSelector(runtime.selectors.conversations);
  const memories = useChatSelector((state) => state.memories.items);
  const threads = useChatSelector((state) => state.threads);
  const settings = useChatSelector(runtime.selectors.settings);
  const connection = useChatSelector(runtime.selectors.connection);
  const temporary = useChatSelector((state) => state.temporary);
  const error = useChatSelector((state) => state.error);
  const queuedFollowUps = useChatSelector((state) => state.queuedFollowUps);
  const { memoryDraft, memoryPanelOpen, memorySearch, sidebarOpen } = useChatSelector(
    (state) => state.ui,
  );
  const conversationId = activeThread.conversationId;
  const threadId = activeThread.id;
  const draft = composer.text;
  const online = connection === "online";
  const streaming = activeThread.isStreaming;
  const messages = activeThread.messages.map(toLegacyMessage);
  const files = composer.attachments.map(toLegacyFile);
  const legacyFollowUps: QueuedFollowUp[] = queuedFollowUps.map((followUp) => ({
    id: followUp.id,
    text: followUp.text,
    files: followUp.attachments.map(toLegacyFile),
  }));
  const messageContainer = useRef<HTMLDivElement | null>(null);
  const messageElements = useRef(new Map<string, HTMLElement>());

  const scrollToMessage = (id: string) => {
    messageElements.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const scrollMessages = ({ target }: { target: "top" | "previous" | "bottom" }) => {
    const container = messageContainer.current;
    if (container === null) return;
    if (target === "top") {
      container.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (target === "bottom") {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      return;
    }
    const previous = messages.toReversed().find((message) => {
      const element = messageElements.current.get(message.id);
      return element !== undefined && element.offsetTop < container.scrollTop - 8;
    });
    if (previous !== undefined) scrollToMessage(previous.id);
  };

  const startFresh = () => {
    actions.startNewConversation();
  };

  const openConversation = (id: string) => actions.selectConversation({ conversationId: id });

  const openThread = (id: string) => {
    if (conversationId === undefined) return;
    actions.selectThread({ threadId: id });
  };

  const branchFromMessage = (messageId: string) => {
    if (conversationId === undefined || temporary) return;
    actions.createBranch({ messageId });
  };

  const updateConversation = ({
    conversationId: id,
    patch,
  }: {
    conversationId: string;
    patch: { title?: string; status?: "regular" | "archived"; pinned?: boolean };
  }) => actions.updateConversation({ conversationId: id, ...patch });

  const renameConversation = ({
    conversationId: id,
    currentTitle,
  }: {
    conversationId: string;
    currentTitle: string | null;
  }) => {
    const title = window.prompt("Conversation name", currentTitle ?? "");
    if (title === null || title.trim() === "") return;
    updateConversation({ conversationId: id, patch: { title: title.trim() } });
  };

  const deleteConversation = ({
    conversationId: id,
    resetSession,
  }: {
    conversationId: string;
    resetSession: boolean;
  }) => {
    if (!window.confirm("Delete this conversation permanently?")) return;
    actions.deleteConversation({ conversationId: id, resetSession });
  };

  const compactConversation = (id: string) => actions.compactConversation({ conversationId: id });

  const createMemory = () => {
    const content = memoryDraft.trim();
    if (content === "") return;
    actions.createMemory();
  };

  const submit = () => {
    const text = draft.trim();
    if (text === "" && files.length === 0) return;
    actions.sendMessage({ text });
  };

  const forceSendQueued = (followUp: QueuedFollowUp) =>
    actions.forceSendQueuedFollowUp({ id: followUp.id });

  const addFiles = (fileList: FileList | undefined) => {
    if (fileList === undefined) return;
    void prepareAttachmentParts({ files: fileList, existingCount: files.length })
      .then((nextFiles) => actions.addAttachments({ attachments: nextFiles.map(toAttachment) }))
      .catch((cause) =>
        actions.reportError({
          error: cause instanceof Error ? cause.message : "Unable to prepare attachments.",
        }),
      );
  };

  const updateSettings = (patch: Partial<typeof settings>) => actions.updateSettings({ patch });

  return (
    <main
      className={`flex h-dvh min-h-0 overflow-hidden bg-background text-foreground ${settings.theme === "dark" ? "dark" : ""}`}
      data-sidebar-open={sidebarOpen}
      data-theme={settings.theme}
    >
      <ChatSidebar
        description="Conversation history, memories, and provider settings."
        onOpenChange={(open) => actions.setSidebarOpen({ open })}
        open={sidebarOpen}
        title={genericChatAppConfig.name}
      >
        <div className="space-y-1 px-2 pt-1">
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            EMI CORE
          </p>
          <h1 className="text-xl font-semibold tracking-tight">{genericChatAppConfig.name}</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Generic streaming chat starter. Your provider key stays in this browser.
          </p>
        </div>
        <Button className="w-full" onClick={startFresh} variant="outline">
          New chat
        </Button>
        <ConversationList
          conversationId={conversationId}
          conversations={[...conversationList.items]}
          onCloneConversation={(id) => actions.cloneConversation({ conversationId: id })}
          onCompactConversation={compactConversation}
          onDeleteConversation={deleteConversation}
          onOpenConversation={openConversation}
          onOpenThread={openThread}
          onRenameConversation={renameConversation}
          onSearchChange={(search) => actions.setConversationSearch({ search })}
          onUpdateConversation={updateConversation}
          search={conversationList.search}
          threadId={threadId}
          threads={[...threads]}
        />
        <MemoryPanel
          draft={memoryDraft}
          memories={[...memories]}
          onCreate={createMemory}
          onDelete={(id) => actions.deleteMemory({ memoryId: id })}
          onDraftChange={(draftValue) => actions.setMemoryDraft({ draft: draftValue })}
          onOpenChange={(open) => actions.setMemoryPanelOpen({ open })}
          onSearchChange={(search) => actions.setMemorySearch({ search })}
          open={memoryPanelOpen}
          search={memorySearch}
        />
        <SettingsPanel
          metadata={
            temporary
              ? "Not saved"
              : conversationId === undefined
                ? "New conversation"
                : conversationId
          }
          onSettingsChange={updateSettings}
          onTemporaryChange={(value) => {
            actions.setTemporary({ temporary: value });
            startFresh();
          }}
          online={online}
          releaseNotes={genericChatAppConfig.releaseNotes}
          settings={settings}
          temporary={temporary}
          version={genericChatAppConfig.version}
        />
      </ChatSidebar>
      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <ChatHeader
          appName={genericChatAppConfig.name}
          messageCount={messages.length}
          onScroll={(target) => scrollMessages({ target })}
          onStop={actions.stop}
          onToggleSidebar={() => actions.setSidebarOpen({ open: !sidebarOpen })}
          sidebarOpen={sidebarOpen}
          streaming={streaming}
          temporary={temporary}
          threadId={threadId}
        />
        <MessageViewport
          conversationId={conversationId}
          messageContainer={messageContainer}
          messageElements={messageElements.current}
          messages={messages}
          onBranchMessage={branchFromMessage}
          onSelectMinimapMessage={scrollToMessage}
          streaming={streaming}
          temporary={temporary}
        />
        {error !== undefined && (
          <p className="mx-auto mb-3 w-full max-w-3xl rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <FollowUpQueue
          followUps={legacyFollowUps}
          onForceSend={forceSendQueued}
          onRemove={(id) => actions.removeQueuedFollowUp({ id })}
        />
        <ChatComposer
          draft={draft}
          files={files}
          onDraftChange={(draftValue) => actions.setDraft({ text: draftValue })}
          onFilesSelected={addFiles}
          onRemoveFile={(file) =>
            actions.removeAttachment({ attachmentId: `attachment:${file.url}` })
          }
          onSubmit={submit}
          placeholder={`Message ${genericChatAppConfig.name}`}
          streaming={streaming}
        />
      </section>
    </main>
  );
};
