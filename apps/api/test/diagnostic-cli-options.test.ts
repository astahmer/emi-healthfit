import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDiagnosticOptions } from "../src/core/diagnostics/diagnostic-cli-options.ts";

describe("session diagnostic CLI options", () => {
  it("uses an explicitly supplied environment file", () => {
    const options = parseDiagnosticOptions({
      arguments_: [
        "--url",
        "https://emi-healthfit.astahmer.dev/chat/conversation-id",
        "--env",
        "prod",
        "--env-file",
        ".env",
      ],
    });

    assert.strictEqual(options.envFile, ".env");
  });
});
