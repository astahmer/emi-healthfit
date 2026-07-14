import { describe, expect, it } from "vitest";
import { useChatDraftStore } from "./draft-store";

describe("useChatDraftStore", () => {
  it("starts with an empty draft", () => {
    const { draft } = useChatDraftStore.getState();
    expect(draft.text).toBe("");
    expect(draft.files).toEqual([]);
  });

  it("stores and clears draft text and files", () => {
    const file = new File([], "test.png");
    useChatDraftStore.getState().setDraft({ text: "hello", files: [file] });

    const { draft } = useChatDraftStore.getState();
    expect(draft.text).toBe("hello");
    expect(draft.files).toEqual([file]);

    useChatDraftStore.getState().clearDraft();
    expect(useChatDraftStore.getState().draft.text).toBe("");
    expect(useChatDraftStore.getState().draft.files).toEqual([]);
  });
});
