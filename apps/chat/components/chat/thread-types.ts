import type { ChatUiMessage } from "@emi/core/chat";
import type { ComposerControls as CoreComposerControls } from "@emi/core/web";
import type { ChatModel } from "@/app/models";

export type ComposerControls = Omit<CoreComposerControls, "onKeepTemporary" | "models"> & {
  onKeepTemporary: (messages: ChatUiMessage[]) => Promise<void>;
  models: ChatModel[];
};
