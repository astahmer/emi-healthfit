import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Schema from "effect/Schema";

import {
  ChatAppConfigSchema,
  ChatReleaseHistorySchema,
  ChatSettingsDescriptorSchema,
} from "../../src/chat/app-config.ts";

describe("generic chat app metadata contracts", () => {
  it("accepts safe app, settings, and release metadata", () => {
    const app = Schema.decodeUnknownSync(ChatAppConfigSchema)({
      name: "Core Chat",
      releaseNotes: ["First release"],
      settingsStorageKey: "emi-core-chat-settings",
      version: "0.1.0",
    });
    const settings = Schema.decodeUnknownSync(ChatSettingsDescriptorSchema)({
      apiKey: "browser-only",
      key: app.settingsStorageKey,
      storage: "local",
    });
    const releases = Schema.decodeUnknownSync(ChatReleaseHistorySchema)({
      releases: [{ changes: app.releaseNotes, version: app.version }],
    });

    assert.equal(settings.apiKey, "browser-only");
    assert.equal(releases.releases[0]?.version, "0.1.0");
  });

  it("rejects server-shaped settings that contain an API key", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(ChatSettingsDescriptorSchema)({
        apiKey: "secret",
        key: "emi-core-chat-settings",
        storage: "server",
      }),
    );
  });
});
