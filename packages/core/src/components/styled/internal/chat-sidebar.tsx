import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronRightIcon,
  CopyIcon,
  Minimize2Icon,
  PanelLeftIcon,
  PencilIcon,
  PinIcon,
  Trash2Icon,
} from "lucide-react";
import type { ReactNode } from "react";

import type { Conversation, Memory, MemorySummary, Thread } from "../../../protocol/resources.ts";
import type { ChatSettingsState } from "../../../runtime/types.ts";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.tsx";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet.tsx";
import { Textarea } from "./ui/textarea.tsx";
import { cn } from "./ui/utils.ts";
import { useIsMobile } from "../../../web/use-mobile.ts";

const SidebarSurface = ({ children }: { children: ReactNode }) => (
  <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-2 md:p-3">{children}</div>
  </div>
);

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
}) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="left"
          closeLabel="Close chat sidebar"
          className="w-[18rem] bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <SidebarSurface>{children}</SidebarSurface>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      aria-label={title}
      data-open={open}
      data-slot="sidebar"
      className={cn(
        "hidden h-full shrink-0 overflow-hidden border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear md:flex",
        open ? "w-64" : "w-0 border-r-0",
      )}
    >
      <div className="w-64 shrink-0">
        <SidebarSurface>{children}</SidebarSurface>
      </div>
    </aside>
  );
};

export const ChatSidebarToggle = ({ open, onToggle }: { open: boolean; onToggle: () => void }) => (
  <Button
    aria-expanded={open}
    aria-label={open ? "Collapse chat sidebar" : "Open chat sidebar"}
    data-sidebar="trigger"
    size="icon"
    variant="ghost"
    className="size-7"
    onClick={onToggle}
  >
    <PanelLeftIcon />
    <span className="sr-only">Toggle Sidebar</span>
  </Button>
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
  conversations: ReadonlyArray<Conversation>;
  conversationId: string | undefined;
  threads: ReadonlyArray<Thread>;
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
  <section aria-label="Conversation history" className="flex flex-col gap-2">
    <label className="px-2 text-sm font-medium" htmlFor="conversation-search">
      Search conversations
    </label>
    <Input
      id="conversation-search"
      onChange={(event) => onSearchChange(event.target.value)}
      placeholder="Search chats"
      value={search}
      className="bg-background"
    />
    <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
      {conversations.map((conversation) => (
        <article
          className={cn(
            "group flex min-w-0 items-center gap-1 rounded-md p-1",
            conversation.id === conversationId && "bg-sidebar-accent",
          )}
          key={conversation.id}
        >
          <Button
            variant="ghost"
            className="min-w-0 flex-1 justify-start truncate px-2"
            onClick={() => onOpenConversation(conversation.id)}
          >
            {conversation.title || "New chat"}
          </Button>
          <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button
              aria-label={conversation.pinned ? "Unpin conversation" : "Pin conversation"}
              size="icon-xs"
              variant="ghost"
              onClick={() =>
                onUpdateConversation({
                  conversationId: conversation.id,
                  patch: { pinned: !conversation.pinned },
                })
              }
            >
              <PinIcon />
            </Button>
            <Button
              aria-label="Rename conversation"
              size="icon-xs"
              variant="ghost"
              onClick={() =>
                onRenameConversation({
                  conversationId: conversation.id,
                  currentTitle: conversation.title,
                })
              }
            >
              <PencilIcon />
            </Button>
            <Button
              aria-label="Clone conversation"
              size="icon-xs"
              variant="ghost"
              onClick={() => onCloneConversation(conversation.id)}
            >
              <CopyIcon />
            </Button>
            <Button
              aria-label="Compact conversation"
              size="icon-xs"
              variant="ghost"
              onClick={() => onCompactConversation(conversation.id)}
            >
              <Minimize2Icon />
            </Button>
            <Button
              aria-label={
                conversation.status === "regular" ? "Archive conversation" : "Restore conversation"
              }
              size="icon-xs"
              variant="ghost"
              onClick={() =>
                onUpdateConversation({
                  conversationId: conversation.id,
                  patch: { status: conversation.status === "regular" ? "archived" : "regular" },
                })
              }
            >
              {conversation.status === "regular" ? <ArchiveIcon /> : <ArchiveRestoreIcon />}
            </Button>
            <Button
              aria-label="Delete conversation"
              size="icon-xs"
              variant="ghost"
              onClick={() =>
                onDeleteConversation({
                  conversationId: conversation.id,
                  resetSession: conversation.id === conversationId,
                })
              }
            >
              <Trash2Icon />
            </Button>
          </div>
        </article>
      ))}
    </div>
    {conversationId !== undefined && threads.length > 0 && (
      <section className="flex flex-col gap-1 border-t pt-2">
        <p className="px-2 text-xs font-medium text-muted-foreground">Branches</p>
        {threads.map((thread) => (
          <Button
            className="justify-start"
            key={thread.id}
            variant={thread.id === threadId ? "secondary" : "ghost"}
            onClick={() => onOpenThread(thread.id)}
          >
            {thread.title || "Branch"}
          </Button>
        ))}
      </section>
    )}
  </section>
);

export const MemoryPanel = ({
  open,
  search,
  draft,
  summary,
  summaryDraft,
  memories,
  onOpenChange,
  onSearchChange,
  onDraftChange,
  onSummaryDraftChange,
  onSaveSummary,
  onCreate,
  onDelete,
}: {
  open: boolean;
  search: string;
  draft: string;
  summary: MemorySummary | undefined;
  summaryDraft: string | undefined;
  memories: ReadonlyArray<Memory>;
  onOpenChange: (open: boolean) => void;
  onSearchChange: (search: string) => void;
  onDraftChange: (draft: string) => void;
  onSummaryDraftChange: (draft: string) => void;
  onSaveSummary: () => void;
  onCreate: () => void;
  onDelete: (memoryId: string) => void;
}) => (
  <details
    className="group border-t pt-2"
    onToggle={(event) => onOpenChange(event.currentTarget.open)}
    open={open}
  >
    <summary className="flex cursor-pointer list-none items-center gap-1 px-2 py-1 text-sm font-medium [&::-webkit-details-marker]:hidden">
      <ChevronRightIcon className="size-4 transition-transform group-open:rotate-90" />
      Memories
    </summary>
    <div className="mt-2 flex flex-col gap-2 px-1">
      <label className="text-sm font-medium" htmlFor="memory-search">
        Search memories
      </label>
      <Input
        id="memory-search"
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search saved details"
        value={search}
        className="bg-background"
      />
      <label className="text-sm font-medium" htmlFor="memory-summary">
        Memory summary
      </label>
      <Textarea
        id="memory-summary"
        onChange={(event) => onSummaryDraftChange(event.target.value)}
        placeholder="No merged summary yet"
        rows={4}
        value={summaryDraft ?? summary?.content ?? ""}
      />
      <p className="text-xs text-muted-foreground">
        {summary === undefined
          ? "The assistant will build this from your saved memories."
          : `${summary.memoryCount} source ${summary.memoryCount === 1 ? "memory" : "memories"} · updated ${new Date(summary.updatedAt).toLocaleString()}`}
      </p>
      <Button
        disabled={(summaryDraft ?? summary?.content ?? "").trim() === ""}
        onClick={onSaveSummary}
        size="sm"
        variant="outline"
      >
        Save summary
      </Button>
      <Textarea
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="Save a detail for future chats"
        rows={2}
        value={draft}
      />
      <Button disabled={draft.trim() === ""} onClick={onCreate} size="sm">
        Save memory
      </Button>
      <div className="flex max-h-32 flex-col gap-1 overflow-y-auto">
        {memories.map((memory) => (
          <div className="flex items-start gap-2 text-sm" key={memory.id}>
            <span className="min-w-0 flex-1 break-words">{memory.content}</span>
            <Button onClick={() => onDelete(memory.id)} size="xs" variant="ghost">
              Delete
            </Button>
          </div>
        ))}
      </div>
    </div>
  </details>
);

const Setting = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor={undefined}>
    {label}
    {children}
  </label>
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
  settings: ChatSettingsState;
  temporary: boolean;
  metadata: string;
  online: boolean;
  version: string;
  releaseNotes: ReadonlyArray<string>;
  onSettingsChange: (patch: Partial<ChatSettingsState>) => void;
  onTemporaryChange: (temporary: boolean) => void;
}) => (
  <section className="flex flex-col gap-4 border-t pt-3">
    <Setting label="Theme">
      <Select
        value={settings.theme}
        onValueChange={(value) => onSettingsChange({ theme: value === "dark" ? "dark" : "light" })}
      >
        <SelectTrigger aria-label="Theme">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="light">Light</SelectItem>
          <SelectItem value="dark">Dark</SelectItem>
        </SelectContent>
      </Select>
    </Setting>
    <Setting label="API key">
      <Input
        autoComplete="off"
        onChange={(event) => onSettingsChange({ apiKey: event.target.value })}
        placeholder="sk-..."
        type="password"
        value={settings.apiKey}
        className="bg-background"
      />
    </Setting>
    <Setting label="Provider base URL">
      <Input
        onChange={(event) => onSettingsChange({ baseUrl: event.target.value })}
        placeholder="https://api.openai.com/v1"
        value={settings.baseUrl}
        className="bg-background"
      />
    </Setting>
    <Setting label="Default model">
      <Input
        onChange={(event) => onSettingsChange({ model: event.target.value })}
        placeholder="gpt-4o-mini"
        value={settings.model}
        className="bg-background"
      />
    </Setting>
    <Setting label="Default system prompt">
      <Textarea
        onChange={(event) => onSettingsChange({ systemPrompt: event.target.value })}
        placeholder="Optional instructions for every answer"
        rows={3}
        value={settings.systemPrompt}
      />
    </Setting>
    <Setting label="Title model">
      <Input
        onChange={(event) => onSettingsChange({ titleModel: event.target.value })}
        placeholder="gpt-4o-mini"
        value={settings.titleModel}
        className="bg-background"
      />
    </Setting>
    <Setting label="Title prompt">
      <Textarea
        onChange={(event) => onSettingsChange({ titlePrompt: event.target.value })}
        placeholder="Optional instructions for automatic conversation titles"
        rows={2}
        value={settings.titlePrompt}
      />
    </Setting>
    <label className="flex items-center gap-2 text-sm font-medium">
      <input
        checked={settings.memoryEnabled}
        onChange={(event) => onSettingsChange({ memoryEnabled: event.target.checked })}
        type="checkbox"
        className="size-4 rounded border-input accent-primary"
      />
      Remember useful details from replies
    </label>
    <Setting label="Memory model">
      <Input
        onChange={(event) => onSettingsChange({ memoryModel: event.target.value })}
        placeholder="gpt-4o-mini"
        value={settings.memoryModel}
        className="bg-background"
      />
    </Setting>
    <label className="flex items-center gap-2 text-sm font-medium">
      <input
        checked={temporary}
        onChange={(event) => onTemporaryChange(event.target.checked)}
        type="checkbox"
        className="size-4 rounded border-input accent-primary"
      />
      Temporary chat
    </label>
    <p className="mt-auto break-words text-xs text-muted-foreground">{metadata}</p>
    <p className="text-xs text-muted-foreground">
      {online ? "Online" : "Offline · draft saved locally"}
    </p>
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">Release notes · v{version}</summary>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        {releaseNotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </details>
  </section>
);
