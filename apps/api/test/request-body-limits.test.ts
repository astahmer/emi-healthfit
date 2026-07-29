import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHAT_REQUEST_BODY_MAX_CHARS,
  isRequestBodyTooLarge,
} from "../src/platform/http/request-body-limits.ts";

describe("request body limits", () => {
  it("accepts bodies at the chat limit", () => {
    assert.equal(isRequestBodyTooLarge({ body: "x".repeat(CHAT_REQUEST_BODY_MAX_CHARS) }), false);
  });

  it("rejects bodies over the chat limit", () => {
    assert.equal(
      isRequestBodyTooLarge({ body: "x".repeat(CHAT_REQUEST_BODY_MAX_CHARS + 1) }),
      true,
    );
  });
});
