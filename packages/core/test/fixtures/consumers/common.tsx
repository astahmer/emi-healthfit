import { createChatRuntime } from "@emi/core";
import { ChatProvider } from "@emi/core/react";
// @ts-ignore R0 target entrypoint is implemented in a later packet.
import { ChatApp } from "@emi/core/components/styled";
// @ts-ignore R0 target stylesheet is implemented in a later packet.
import styles from "@emi/core/styles.css";

const storage = {
  get: () => null,
  set: () => {},
  remove: () => {},
};

const runtime = createChatRuntime({
  transport: { baseUrl: "/api", fetch },
  storage: { settings: storage, drafts: storage },
  browser: { online: true, subscribeOnline: () => () => {} },
  identity: { createId: () => "id", now: () => new Date().toISOString() },
  features: { attachments: true, memories: true, branches: true },
});

const app = (
  <ChatProvider runtime={runtime}>
    <ChatApp />
  </ChatProvider>
);

void app;
void styles;
