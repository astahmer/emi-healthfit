import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHAT_REQUEST_BODY_MAX_CHARS,
  isRequestBodyTooLarge,
} from "../src/platform/http/request-body-limits.ts";

const dataUrl = ({ bytes, mediaType = "image/jpeg" }: { bytes: number; mediaType?: string }) =>
  `data:${mediaType};base64,${"A".repeat(Math.ceil((bytes * 4) / 3))}`;

const chatBodyWithAttachment = ({ fileBytes }: { fileBytes: number }) =>
  JSON.stringify({
    messages: [
      {
        id: "user-1",
        role: "user",
        parts: [
          { type: "text", text: "i ate this is it fine?" },
          {
            type: "file",
            filename: "label.jpg",
            mediaType: "image/jpeg",
            url: dataUrl({ bytes: fileBytes }),
          },
        ],
      },
    ],
    config: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
    sessionId: "8c27b5bf-0123-4934-93a3-31e3cb4750ec",
  });

describe("chat request body limits", () => {
  it("accepts a realistic photo embedded as a data URL", () => {
    const body = chatBodyWithAttachment({ fileBytes: 1_200_000 });
    assert.equal(isRequestBodyTooLarge({ body }), false);
  });

  it("accepts a maximum-size client attachment", () => {
    const body = chatBodyWithAttachment({ fileBytes: 5 * 1024 * 1024 });
    assert.equal(isRequestBodyTooLarge({ body }), false);
  });

  it("rejects oversized bodies above the safety cap", () => {
    const body = chatBodyWithAttachment({ fileBytes: 15 * 1024 * 1024 });
    assert.ok(body.length > CHAT_REQUEST_BODY_MAX_CHARS);
    assert.equal(isRequestBodyTooLarge({ body }), true);
  });
});
