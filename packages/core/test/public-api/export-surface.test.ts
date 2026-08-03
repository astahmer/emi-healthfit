import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as api from "@emi/core/api";
import * as cloudflare from "@emi/core/adapters/cloudflare";
import * as discord from "@emi/core/discord";
import * as aiSdk from "@emi/core/adapters/ai-sdk";
import * as advancedXState from "@emi/core/advanced/xstate";
import * as components from "@emi/core/components";
import * as styled from "@emi/core/components/styled";
import * as extensions from "@emi/core/extensions";
import * as protocol from "@emi/core/protocol";
import * as react from "@emi/core/react";
import * as root from "@emi/core";
import * as runtime from "@emi/core/runtime";
import * as server from "@emi/core/server";
import * as serverDatabase from "@emi/core/server/database";
import * as serverEffect from "@emi/core/server/effect";
import * as serverFetch from "@emi/core/server/fetch";
import * as testing from "@emi/core/testing";
import * as chat from "@emi/core/chat";
import * as web from "@emi/core/web";

const sortedKeys = (module: object): string[] => Object.keys(module).toSorted();

describe("@emi/core target export surface", () => {
  it("keeps stable entrypoints curated and discoverable", () => {
    assert.deepEqual(sortedKeys(root), ["createChatRuntime"]);
    assert.deepEqual(sortedKeys(protocol), ["ChatProtocol", "ProtocolDecodeError"]);
    assert.deepEqual(sortedKeys(api), ["CoreApiClient", "CoreApiClientError"]);
    assert.deepEqual(sortedKeys(chat), ["Chat"]);
    assert.deepEqual(sortedKeys(discord), ["Discord"]);
    assert.deepEqual(sortedKeys(runtime), ["createChatRuntime", "createWebMcpRegistration"]);
    assert.deepEqual(sortedKeys(react), [
      "ChatProvider",
      "useChatActions",
      "useChatRuntime",
      "useChatSelector",
    ]);
    assert.deepEqual(sortedKeys(components), [
      "Composer",
      "ConnectedComposer",
      "ConnectedSidebar",
      "ConnectedThread",
      "ConversationList",
      "Dialog",
      "Message",
      "MessagePart",
      "Sidebar",
      "ThreadViewport",
    ]);
    assert.deepEqual(sortedKeys(styled), ["ChatApp", "ChatShell"]);
    assert.ok("WebMcp" in web);
    assert.deepEqual(sortedKeys(server), [
      "ChatServer",
      "ChatServerError",
      "ConversationSearchTool",
      "ConversationSearchToolError",
      "MemoryTools",
      "MemoryToolsError",
    ]);
    assert.deepEqual(sortedKeys(serverDatabase), ["ServerDatabase"]);
    assert.deepEqual(sortedKeys(serverEffect), ["ChatServerEffect"]);
    assert.deepEqual(sortedKeys(serverFetch), ["ChatFetchHandlers"]);
    assert.deepEqual(sortedKeys(aiSdk), [
      "AiSdkAdapterError",
      "AiSdkChatStreamError",
      "AiSdkModelProvider",
      "aiSdkChatStreamDecoder",
      "createAiSdkChatStream",
      "createAiSdkChatStreamEffect",
    ]);
    assert.deepEqual(sortedKeys(cloudflare), ["CloudflareRepositories"]);
    assert.deepEqual(sortedKeys(extensions), ["ChatExtensionError", "ChatExtensions"]);
    assert.deepEqual(sortedKeys(testing), ["ChatTesting"]);
    for (const name of [
      "browserStateActor",
      "chatRuntimeMachine",
      "chatSessionMachine",
      "chatTransportActor",
      "chatUiActor",
      "conversationStoreActor",
      "genericChatAppMachine",
      "settingsActor",
    ])
      assert.equal(name in web, false, name);
    assert.ok(sortedKeys(advancedXState).includes("chatRuntimeMachine"));
    assert.ok(sortedKeys(advancedXState).includes("createActor"));
    assert.ok(sortedKeys(advancedXState).includes("createChatRuntimeActor"));
  });
});
