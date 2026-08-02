import { createChatRuntime } from "@emi/core";
import { ChatProvider } from "@emi/core/react";
import { ChatApp } from "@emi/core/components/styled";
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
