import type { UIMessage } from "ai";
import type { ComposerControls as CoreComposerControls } from "@emi/core/web";
import type { ChatModel } from "@/app/models";

export type ComposerControls = Omit<CoreComposerControls, "onKeepTemporary" | "models"> & {
  onKeepTemporary: (messages: UIMessage[]) => Promise<void>;
  models: ChatModel[];
};
