"use client";

import { useEffect } from "react";
import { useAui } from "@assistant-ui/react";
import { useChatDraftStore } from "./draft-store";

interface ComposerDraftSyncProps {
  sessionId?: string;
}

export const ComposerDraftSync = ({ sessionId }: ComposerDraftSyncProps) => {
  const aui = useAui();
  const { draft, setDraft, clearDraft } = useChatDraftStore();

  useEffect(() => {
    if (sessionId !== undefined) return;
    if (draft.text === "" && draft.files.length === 0) return;

    aui.composer().setText(draft.text);
    for (const file of draft.files) {
      void aui.composer().addAttachment(file);
    }
    clearDraft();
  }, [aui, sessionId, draft, clearDraft]);

  useEffect(() => {
    return () => {
      if (sessionId !== undefined) return;
      const composerState = aui.composer().getState();
      const files = composerState.attachments
        .map((attachment) => (attachment as { file?: File }).file)
        .filter((file): file is File => file instanceof File);
      setDraft({ text: composerState.text, files });
    };
  }, [aui, sessionId, setDraft]);

  return null;
};
