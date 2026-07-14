import { create } from "zustand";

interface ChatDraft {
  text: string;
  files: File[];
}

interface ChatDraftStore {
  draft: ChatDraft;
  setDraft: (draft: ChatDraft) => void;
  clearDraft: () => void;
}

export const useChatDraftStore = create<ChatDraftStore>((set) => ({
  draft: { text: "", files: [] },
  setDraft: (draft) => set({ draft }),
  clearDraft: () => set({ draft: { text: "", files: [] } }),
}));
