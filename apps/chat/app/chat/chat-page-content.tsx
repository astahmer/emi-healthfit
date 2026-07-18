import { KeyRoundIcon } from "lucide-react";
import { useState } from "react";
import { Thread, type ComposerControls } from "@/components/chat/thread";
import { Button } from "@/components/ui/button";

export const ChatPageContent = ({
  activeConversationId,
  isLoading,
  hasOpenAiKey,
  contextSummary,
  composerControls,
  loadError,
  onForkMessage,
  onReferenceMessage,
  onSaveApiKey,
  onRetry,
}: {
  activeConversationId: string | undefined;
  isLoading: boolean;
  hasOpenAiKey: boolean;
  contextSummary: string | undefined;
  composerControls: ComposerControls;
  loadError: Error | null;
  onForkMessage: (messageId: string) => void;
  onReferenceMessage: (messageId: string) => void;
  onSaveApiKey: (apiKey: string) => void;
  onRetry: () => void;
}) => {
  return (
    <div className="min-w-0 flex-1 overflow-hidden">
      {isLoading ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading session…
        </div>
      ) : hasOpenAiKey ? (
        <Thread
          contextSummary={contextSummary}
          onForkMessage={onForkMessage}
          onReferenceMessage={onReferenceMessage}
          composerControls={composerControls}
        />
      ) : (
        <OpenAiKeyRequired onSave={onSaveApiKey} />
      )}
      {loadError !== null && activeConversationId !== undefined && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/95 p-6 text-center backdrop-blur-sm">
          <p className="text-destructive">{loadError.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

const OpenAiKeyRequired = ({ onSave }: { onSave: (apiKey: string) => void }) => {
  const [apiKey, setApiKey] = useState("");
  return (
    <div className="flex h-full items-center justify-center p-6">
      <form
        className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          if (apiKey.trim() !== "") onSave(apiKey.trim());
        }}
      >
        <KeyRoundIcon className="size-6 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Add your OpenAI API key</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your key stays in this browser and is required before you can start a chat.
          </p>
        </div>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="sk-..."
          aria-label="OpenAI API key"
          autoComplete="off"
          className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" className="w-full" disabled={apiKey.trim() === ""}>
          Save key and start chatting
        </Button>
      </form>
    </div>
  );
};
