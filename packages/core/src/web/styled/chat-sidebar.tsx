import { PanelLeftIcon, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";

import type { GenericChatSettings } from "../../chat/settings.ts";
import type {
  Conversation,
  ConversationThread,
  Memory,
} from "../chat-runtime/conversation-client.ts";

export const ChatSidebar = ({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <DialogPrimitive.Root modal={false} open={open} onOpenChange={onOpenChange}>
    {open && (
      <div
        aria-hidden="true"
        className="core-sidebar-overlay"
        onClick={() => onOpenChange(false)}
      />
    )}
    <DialogPrimitive.Content
      aria-describedby="core-chat-sidebar-description"
      aria-label={title}
      asChild
    >
      <aside className="settings-panel chat-sidebar-desktop" data-open={open}>
        <DialogPrimitive.Title asChild>
          <span className="core-visually-hidden">{title}</span>
        </DialogPrimitive.Title>
        <DialogPrimitive.Description
          className="core-visually-hidden"
          id="core-chat-sidebar-description"
        >
          {description}
        </DialogPrimitive.Description>
        {children}
        <DialogPrimitive.Close aria-label="Close chat sidebar" className="core-sidebar-close">
          <XIcon aria-hidden="true" size={18} />
        </DialogPrimitive.Close>
      </aside>
    </DialogPrimitive.Content>
  </DialogPrimitive.Root>
);

export const ChatSidebarToggle = ({ open, onToggle }: { open: boolean; onToggle: () => void }) => (
  <button
    aria-expanded={open}
    aria-label={open ? "Collapse chat sidebar" : "Open chat sidebar"}
    className="core-sidebar-toggle"
    onClick={onToggle}
    type="button"
  >
    <PanelLeftIcon aria-hidden="true" size={18} />
    <span className="core-visually-hidden">{open ? "Collapse sidebar" : "Open sidebar"}</span>
  </button>
);

export const ConversationList = ({
  conversations,
  conversationId,
  threads,
  threadId,
  search,
  onSearchChange,
  onOpenConversation,
  onUpdateConversation,
  onRenameConversation,
  onCloneConversation,
  onCompactConversation,
  onDeleteConversation,
  onOpenThread,
}: {
  conversations: Conversation[];
  conversationId: string | undefined;
  threads: ConversationThread[];
  threadId: string | undefined;
  search: string;
  onSearchChange: (search: string) => void;
  onOpenConversation: (conversationId: string) => void;
  onUpdateConversation: (options: {
    conversationId: string;
    patch: { title?: string; status?: "regular" | "archived"; pinned?: boolean };
  }) => void;
  onRenameConversation: (options: { conversationId: string; currentTitle: string | null }) => void;
  onCloneConversation: (conversationId: string) => void;
  onCompactConversation: (conversationId: string) => void;
  onDeleteConversation: (options: { conversationId: string; resetSession: boolean }) => void;
  onOpenThread: (threadId: string) => void;
}) => (
  <section aria-label="Conversation history" className="conversation-section">
    <label>
      Search conversations
      <input
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search chats"
        value={search}
      />
    </label>
    <div className="conversation-list">
      {conversations.map((conversation) => (
        <article
          className={conversation.id === conversationId ? "conversation active" : "conversation"}
          key={conversation.id}
        >
          <button onClick={() => onOpenConversation(conversation.id)} type="button">
            {conversation.title || "New chat"}
          </button>
          <div className="conversation-actions">
            <button
              aria-label={conversation.pinned ? "Unpin conversation" : "Pin conversation"}
              onClick={() =>
                onUpdateConversation({
                  conversationId: conversation.id,
                  patch: { pinned: !conversation.pinned },
                })
              }
              type="button"
            >
              {conversation.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              aria-label="Rename conversation"
              onClick={() =>
                onRenameConversation({
                  conversationId: conversation.id,
                  currentTitle: conversation.title,
                })
              }
              type="button"
            >
              Rename
            </button>
            <button
              aria-label="Clone conversation"
              onClick={() => onCloneConversation(conversation.id)}
              type="button"
            >
              Clone
            </button>
            <button
              aria-label="Compact conversation"
              onClick={() => onCompactConversation(conversation.id)}
              type="button"
            >
              Compact
            </button>
            <button
              aria-label="Archive conversation"
              onClick={() =>
                onUpdateConversation({
                  conversationId: conversation.id,
                  patch: { status: conversation.status === "regular" ? "archived" : "regular" },
                })
              }
              type="button"
            >
              {conversation.status === "regular" ? "Archive" : "Restore"}
            </button>
            <button
              aria-label="Delete conversation"
              onClick={() =>
                onDeleteConversation({
                  conversationId: conversation.id,
                  resetSession: conversation.id === conversationId,
                })
              }
              type="button"
            >
              Delete
            </button>
          </div>
        </article>
      ))}
    </div>
    {conversationId !== undefined && threads.length > 0 && (
      <section className="thread-list">
        <p>Branches</p>
        {threads.map((thread) => (
          <button
            className={thread.id === threadId ? "active" : undefined}
            key={thread.id}
            onClick={() => onOpenThread(thread.id)}
            type="button"
          >
            {thread.title || "Branch"}
          </button>
        ))}
      </section>
    )}
  </section>
);

export const MemoryPanel = ({
  open,
  search,
  draft,
  memories,
  onOpenChange,
  onSearchChange,
  onDraftChange,
  onCreate,
  onDelete,
}: {
  open: boolean;
  search: string;
  draft: string;
  memories: Memory[];
  onOpenChange: (open: boolean) => void;
  onSearchChange: (search: string) => void;
  onDraftChange: (draft: string) => void;
  onCreate: () => void;
  onDelete: (memoryId: string) => void;
}) => (
  <details
    className="memory-panel"
    onToggle={(event) => onOpenChange(event.currentTarget.open)}
    open={open}
  >
    <summary>Memories</summary>
    <label>
      Search memories
      <input
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search saved details"
        value={search}
      />
    </label>
    <textarea
      onChange={(event) => onDraftChange(event.target.value)}
      placeholder="Save a detail for future chats"
      rows={2}
      value={draft}
    />
    <button disabled={draft.trim() === ""} onClick={onCreate} type="button">
      Save memory
    </button>
    <div className="memory-list">
      {memories.map((memory) => (
        <div key={memory.id}>
          <span>{memory.content}</span>
          <button onClick={() => onDelete(memory.id)} type="button">
            Delete
          </button>
        </div>
      ))}
    </div>
  </details>
);

export const SettingsPanel = ({
  settings,
  temporary,
  metadata,
  online,
  version,
  releaseNotes,
  onSettingsChange,
  onTemporaryChange,
}: {
  settings: GenericChatSettings;
  temporary: boolean;
  metadata: string;
  online: boolean;
  version: string;
  releaseNotes: string[];
  onSettingsChange: (patch: Partial<GenericChatSettings>) => void;
  onTemporaryChange: (temporary: boolean) => void;
}) => (
  <>
    <label>
      Theme
      <select
        onChange={(event) =>
          onSettingsChange({ theme: event.target.value === "dark" ? "dark" : "light" })
        }
        value={settings.theme}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
    <label>
      API key
      <input
        autoComplete="off"
        onChange={(event) => onSettingsChange({ apiKey: event.target.value })}
        placeholder="sk-..."
        type="password"
        value={settings.apiKey}
      />
    </label>
    <label>
      Provider base URL
      <input
        onChange={(event) => onSettingsChange({ baseUrl: event.target.value })}
        placeholder="https://api.openai.com/v1"
        value={settings.baseUrl}
      />
    </label>
    <label>
      Default model
      <input
        onChange={(event) => onSettingsChange({ model: event.target.value })}
        placeholder="gpt-4o-mini"
        value={settings.model}
      />
    </label>
    <label>
      Default system prompt
      <textarea
        onChange={(event) => onSettingsChange({ systemPrompt: event.target.value })}
        placeholder="Optional instructions for every answer"
        rows={3}
        value={settings.systemPrompt}
      />
    </label>
    <label>
      Title model
      <input
        onChange={(event) => onSettingsChange({ titleModel: event.target.value })}
        placeholder="gpt-4o-mini"
        value={settings.titleModel}
      />
    </label>
    <label>
      Title prompt
      <textarea
        onChange={(event) => onSettingsChange({ titlePrompt: event.target.value })}
        placeholder="Optional instructions for automatic conversation titles"
        rows={2}
        value={settings.titlePrompt}
      />
    </label>
    <label className="toggle">
      <input
        checked={settings.memoryEnabled}
        onChange={(event) => onSettingsChange({ memoryEnabled: event.target.checked })}
        type="checkbox"
      />
      Remember useful details from replies
    </label>
    <label>
      Memory model
      <input
        onChange={(event) => onSettingsChange({ memoryModel: event.target.value })}
        placeholder="gpt-4o-mini"
        value={settings.memoryModel}
      />
    </label>
    <label className="toggle">
      <input
        checked={temporary}
        onChange={(event) => onTemporaryChange(event.target.checked)}
        type="checkbox"
      />
      Temporary chat
    </label>
    <p className="muted metadata">{metadata}</p>
    <p className="muted connection-status">{online ? "Online" : "Offline · draft saved locally"}</p>
    <details className="release-notes">
      <summary>Release notes · v{version}</summary>
      <ul>
        {releaseNotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </details>
  </>
);
