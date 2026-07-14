import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComposerDraftSync } from "./composer-draft-sync";
import { useChatDraftStore } from "./draft-store";

const composerMock = {
  setText: vi.fn(),
  addAttachment: vi.fn(),
  getState: vi.fn().mockReturnValue({ text: "", attachments: [] }),
};

const auiMock = { composer: () => composerMock };

vi.mock("@assistant-ui/react", () => ({
  useAui: () => auiMock,
}));

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
};

describe("ComposerDraftSync", () => {
  beforeEach(() => {
    composerMock.setText.mockClear();
    composerMock.addAttachment.mockClear();
    composerMock.getState.mockReturnValue({ text: "", attachments: [] });
  });

  afterEach(() => {
    useChatDraftStore.getState().clearDraft();
  });

  it("restores the draft composer state on a new chat mount", () => {
    const file = new File([], "draft.png");
    useChatDraftStore.getState().setDraft({ text: "draft message", files: [file] });

    render(<ComposerDraftSync />, { wrapper: createWrapper() });

    expect(composerMock.setText).toHaveBeenCalledWith("draft message");
    expect(composerMock.addAttachment).toHaveBeenCalledWith(file);
  });

  it("saves the composer state to the draft store on unmount", () => {
    composerMock.getState.mockReturnValue({ text: "kept message", attachments: [] });

    const { unmount } = render(<ComposerDraftSync />, { wrapper: createWrapper() });
    unmount();

    expect(useChatDraftStore.getState().draft.text).toBe("kept message");
  });

  it("does not restore the draft when a session is already selected", () => {
    useChatDraftStore.getState().setDraft({ text: "draft", files: [] });

    render(<ComposerDraftSync sessionId="session-1" />, { wrapper: createWrapper() });

    expect(composerMock.setText).not.toHaveBeenCalled();
    expect(composerMock.addAttachment).not.toHaveBeenCalled();
  });
});
