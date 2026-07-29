import assert from "node:assert";
import { describe, it } from "node:test";
import { getRevisionDeletionIds } from "../src/core/chat/conversation-revision.ts";

describe("getRevisionDeletionIds", () => {
  it("removes later root turns and every branch descending from the revised turn", () => {
    const conversationRows = [
      { id: "earlier", parent_id: null },
      { id: "target", parent_id: null },
      { id: "target-branch", parent_id: "target" },
      { id: "later", parent_id: null },
      { id: "later-branch", parent_id: "later" },
      { id: "preserved-branch", parent_id: "earlier" },
    ];

    const deleted = getRevisionDeletionIds({
      conversationRows,
      scopedRows: conversationRows.filter((row) => row.parent_id === null),
      messageId: "target",
      includeDescendants: true,
    });

    assert.deepStrictEqual(new Set(deleted), new Set(["target-branch", "later", "later-branch"]));
  });

  it("only removes later messages in the selected side thread", () => {
    const conversationRows = [
      { id: "target", parent_id: "anchor" },
      { id: "answer", parent_id: "target" },
      { id: "other-thread", parent_id: "anchor" },
    ];

    const deleted = getRevisionDeletionIds({
      conversationRows,
      scopedRows: conversationRows.slice(0, 2),
      messageId: "target",
      includeDescendants: false,
    });

    assert.deepStrictEqual(deleted, ["answer"]);
  });
});
